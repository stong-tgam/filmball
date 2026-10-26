/**
 * The river is a wall, and a bridge is the way over it.
 *
 * Until v0.31 water was scenery: you walked across a river the way you walked across a
 * field, and the only thing the water did was let the fisherman cast. Making it a
 * **barrier** is what turns a map into a place - it means there is a wrong side to be
 * on, a reason to remember where a crossing is, and a route worth planning rather than
 * a straight line to walk.
 *
 * **A bridge is where the railway crosses the water.** The generator already limited
 * how often those two features share a tile (`MAX_SHARED_RIVER_RAIL`) precisely because
 * a crossing is interesting, so the bridge was already there and simply had no rules
 * attached. It reads at a table in one sentence: *cross at the railway.*
 *
 * Three things this had to not break, all of them found by asking rather than by
 * shipping:
 *
 * - **The board must stay in one piece.** A river cuts the map in two; if the railway
 *   happens to miss the water, or the bridge sits in a corner, a player - or the
 *   dragon - is stranded behind the water for the whole game. `bridgeUp` guarantees
 *   connectivity and adds fords until it holds, and there is a test.
 * - **The rim falls in** (`collapse.ts`) and can take the only crossing with it, which
 *   would split the board halfway through an evening. Connectivity is re-checked and
 *   repaired after every collapse.
 * - **The fisherman swims.** They cross open water at will, which is the whole reason
 *   the role was given that in v0.30 before this landed.
 */

import { RADIUS, allHexes, distance, key, neighbours } from "./hex";
import { ROLES } from "./players";
import type { GameState, Player, Tile } from "./types";

/**
 * Can this player set foot here?
 *
 * Everybody may walk a bridge; only the fisherman may walk the water. Note this is
 * about the *tile*, not about what is standing on it - monsters and the tornado are
 * `legalMoves`' business.
 */
export const canWade = (player: Player, tile: Tile | undefined): boolean =>
  tile !== undefined && (!tile.river || tile.bridge || ROLES[player.role].swims);

/** Anybody at all - used by the generator and by things that are not players. */
export const walkable = (tile: Tile | undefined): boolean =>
  tile !== undefined && (!tile.river || tile.bridge);

/**
 * Is every walkable tile reachable from every other?
 *
 * The question that matters is not "is the board connected" but "can a party get
 * anywhere from anywhere", so the water is simply excluded and what is left has to be
 * one piece.
 */
export function allOnePiece(tiles: Record<string, Tile>, within = RADIUS): boolean {
  const land = allHexes().filter(
    (h) => distance(h, { q: 0, r: 0 }) <= within && walkable(tiles[key(h)]),
  );
  if (land.length === 0) return true;

  const seen = new Set([key(land[0])]);
  const queue = [land[0]];
  while (queue.length > 0) {
    for (const n of neighbours(queue.pop()!)) {
      if (seen.has(key(n)) || distance(n, { q: 0, r: 0 }) > within) continue;
      if (!walkable(tiles[key(n)])) continue;
      seen.add(key(n));
      queue.push(n);
    }
  }
  return seen.size === land.length;
}

/**
 * How many crossings a river of this length gets, before connectivity is considered.
 *
 * Roughly one every three tiles of water. Connectivity alone produced **one** bridge on
 * a 91-tile board, and one crossing is not a map - it is a doorway, and it makes every
 * trip to the far bank the same trip. Several crossings mean choosing *which* way over,
 * which is the decision the barrier exists to create.
 */
export const BRIDGE_SHARE_OF_RIVER = 0.3;

export const bridgesFor = (water: number): number =>
  Math.max(2, Math.round(water * BRIDGE_SHARE_OF_RIVER));

/**
 * Put bridges in, and keep adding them until the board is one piece.
 *
 * Three passes. The railway's crossing first, because that is the one that means
 * something and the one a child will remember - *cross at the railway*. Then spread
 * fords along the rest of the water up to `bridgesFor`, kept apart so they are real
 * alternatives rather than a gate two tiles wide. Then a plain repair loop, which is
 * what actually guarantees the board is walkable: bridge the narrowest remaining
 * crossing, try again. The loop is bounded by the length of the river so a future
 * change cannot hang the game.
 */
export function bridgeUp(tiles: Record<string, Tile>, within = RADIUS): Record<string, Tile> {
  const built: Record<string, Tile> = { ...tiles };

  // Where the line crosses the water. This is the bridge a child will remember.
  for (const [label, tile] of Object.entries(built)) {
    if (tile.river && tile.rail) built[label] = { ...tile, bridge: true };
  }

  const inside = allHexes().filter((h) => distance(h, { q: 0, r: 0 }) <= within);
  const allWater = inside.filter((h) => built[key(h)]?.river);
  const water = allWater.filter((h) => !built[key(h)].bridge);

  // Spread the rest along the river. Two apart where the water allows it, so the
  // crossings are choices rather than one wide gate.
  const wanted = bridgesFor(allWater.length);
  const spread = [...water].sort(
    (a, b) =>
      neighbours(b).filter((n) => walkable(built[key(n)])).length -
      neighbours(a).filter((n) => walkable(built[key(n)])).length,
  );
  for (const hex of spread) {
    const now = allWater.filter((h) => built[key(h)].bridge);
    if (now.length >= wanted) break;
    if (now.some((h) => distance(h, hex) < 2)) continue;
    built[key(hex)] = { ...built[key(hex)], bridge: true };
  }

  for (let guard = 0; guard < water.length + 1; guard++) {
    if (allOnePiece(built, within)) break;
    // A ford, at whichever crossing joins the most ground: the water tile with the
    // most walkable neighbours is the narrowest point of the river.
    const best = water
      .filter((h) => !built[key(h)].bridge)
      .sort(
        (a, b) =>
          neighbours(b).filter((n) => walkable(built[key(n)])).length -
          neighbours(a).filter((n) => walkable(built[key(n)])).length,
      )[0];
    if (!best) break;
    built[key(best)] = { ...built[key(best)], bridge: true };
  }
  return built;
}

/**
 * After the rim falls: if losing a ring took the only crossing, open another.
 *
 * Cheap on every turn but the three the board shrinks on, because `allOnePiece` short
 * circuits on a board that is already whole.
 */
export function keepTheBoardWhole(state: GameState, within: number): GameState {
  if (allOnePiece(state.tiles, within)) return state;
  const tiles = bridgeUp(state.tiles, within);
  return {
    ...state,
    tiles,
    log: [
      ...state.log,
      {
        turn: state.turn,
        text: "The water has found a new way round, and somebody's planks have gone across it.",
      },
    ],
  };
}
