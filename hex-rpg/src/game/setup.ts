/**
 * Board generation.
 *
 * Everything here is a pure function of the seed: the same seed always produces the
 * same 61 tiles. Terrain is not sprinkled at random per tile - a river snakes across
 * the board, a railway runs straight through it, cities sit apart from one another,
 * and forests grow in clumps. A board that reads like a place is easier to talk
 * about at the table ("meet me at the bridge on D3") than a field of confetti.
 */

import {
  DIRS,
  RADIUS,
  allHexes,
  distance,
  edgeHexes,
  hexLine,
  inBoard,
  key,
  neighbours,
  type Hex,
} from "./hex";
import { makeRng, type Rng } from "./rng";
import type { GameState, Tile } from "./types";

export const CITY_COUNT = 5;
/** Cities must be this far apart, so no two are a single step from each other. */
export const CITY_MIN_DISTANCE = 3;
export const FOREST_CLUSTERS = 5;
export const DEFAULT_TURN_LIMIT = 25;

type Draft = Map<string, Tile>;

const blankBoard = (): Draft =>
  new Map(
    allHexes().map((hex) => [
      key(hex),
      { hex, base: "field", river: false, rail: false, destroyedUntil: null } as Tile,
    ]),
  );

const at = (board: Draft, h: Hex): Tile => board.get(key(h))!;

/** Roughly the far side of the board from `h`. */
const opposite = (h: Hex): Hex => ({ q: -h.q, r: -h.r });

/** Extra tiles spent by going from `from` to `to` by way of `via`. */
const detour = (from: Hex, via: Hex, to: Hex): number =>
  distance(from, via) + distance(via, to) - distance(from, to);

/**
 * A river from one edge of the board to the far edge.
 *
 * Drawn as two or three straight reaches between bend points, not as a step-by-step
 * wander: a walk free to turn on every tile comes out as sawtooth teeth rather than
 * meanders. Each bend is pulled off the direct line so the river never rules straight
 * across the board, and the bends share a detour budget so it never folds back on
 * itself either.
 */
function carveRiver(board: Draft, rng: Rng): void {
  const edges = edgeHexes();
  const start = rng.pick(edges);
  const goal = opposite(start);
  const target = rng.pick(edges.filter((h) => distance(h, goal) <= 2));
  const direct = hexLine(start, target);

  /** Total extra tiles the river may spend on bends, over the direct distance. */
  const MAX_DETOUR = 3;

  const onDirectLine = new Set(direct.map(key));
  const bendCount = rng.int(1, 2);
  const route: Hex[] = [start];
  let budget = MAX_DETOUR;

  for (let i = 1; i <= bendCount; i++) {
    const anchor = direct[Math.round((direct.length - 1) * (i / (bendCount + 1)))];
    const from = route[route.length - 1];
    // One tile off the line, never two: a wider offset near an end of the river
    // turns the reach into a spike rather than a bend.
    const options = DIRS.map((d) => ({ q: anchor.q + d.q, r: anchor.r + d.r })).filter(
      (h) =>
        inBoard(h) &&
        // A bend that lands back on the direct line is not a bend - without this the
        // river comes out as a canal ruled straight across the board.
        !onDirectLine.has(key(h)) &&
        // Spending the detour budget against the previous bend, not against the
        // source, is what stops two bends folding the river into a V.
        detour(from, h, target) <= budget,
    );
    if (options.length === 0) continue;
    const bend = rng.pick(options);
    budget -= detour(from, bend, target);
    route.push(bend);
  }
  route.push(target);

  for (let i = 1; i < route.length; i++) {
    for (const h of hexLine(route[i - 1], route[i])) at(board, h).river = true;
  }
}

/** At most this many tiles may carry both the railway and the river - a bridge. */
export const MAX_SHARED_RIVER_RAIL = 2;

/**
 * A railway, dead straight from rim to rim.
 *
 * Lines that run along the river instead of across it are rejected: two features
 * sharing a corridor for half the board is hard to read and wastes the tiles that
 * a crossing would make interesting.
 */
function layRailway(board: Draft, rng: Rng): void {
  const edges = edgeHexes();
  let best: Hex[] = [];
  for (let attempt = 0; attempt < 12; attempt++) {
    const start = rng.pick(edges);
    const line = hexLine(start, opposite(start));
    const shared = line.filter((h) => at(board, h).river).length;
    if (shared <= MAX_SHARED_RIVER_RAIL) {
      best = line;
      break;
    }
    if (best.length === 0) best = line;
  }
  for (const h of best) at(board, h).rail = true;
}

/**
 * Cities, spaced out. Tiles on the railway are preferred - a town grows where the
 * trains stop - but the spacing rule wins if the two disagree.
 */
function placeCities(board: Draft, rng: Rng): Hex[] {
  const candidates = rng
    .shuffle(allHexes())
    .filter((h) => !at(board, h).river)
    .sort((a, b) => Number(at(board, b).rail) - Number(at(board, a).rail));

  const placed: Hex[] = [];
  for (const h of candidates) {
    if (placed.length === CITY_COUNT) break;
    if (placed.some((c) => distance(c, h) < CITY_MIN_DISTANCE)) continue;
    at(board, h).base = "city";
    placed.push(h);
  }
  return placed;
}

/** Forests grow in clumps from a handful of seed tiles. */
function growForests(board: Draft, rng: Rng): void {
  const open = (h: Hex) => at(board, h).base === "field";
  const seeds = rng.shuffle(allHexes().filter(open)).slice(0, FOREST_CLUSTERS);

  for (const seed of seeds) {
    const size = rng.int(2, 5);
    let frontier = [seed];
    const clump = new Set<string>();
    while (frontier.length && clump.size < size) {
      const h = frontier.splice(rng.int(0, frontier.length - 1), 1)[0];
      if (!open(h) || clump.has(key(h))) continue;
      at(board, h).base = "forest";
      clump.add(key(h));
      frontier.push(...neighbours(h).filter(open));
    }
  }
}

/** The 61 tiles of the board, keyed by label. Deterministic in `seed`. */
export function generateBoard(seed: number): Record<string, Tile> {
  const rng = makeRng(seed);
  const board = blankBoard();

  carveRiver(board, rng);
  layRailway(board, rng);
  placeCities(board, rng);
  growForests(board, rng);

  return Object.fromEntries(board);
}

/**
 * A new game. v0.1 stops at the board: players, enemies and hazards arrive in
 * later phases, and the phase machine stays parked at "setup" until they do.
 */
export function createInitialState(seed: number): GameState {
  return {
    seed,
    turn: 1,
    turnLimit: DEFAULT_TURN_LIMIT,
    phase: "setup",
    activePlayerIndex: 0,
    tiles: generateBoard(seed),
    players: [],
    enemies: [],
    hazards: [],
    itemPile: [],
    eventDeck: [],
    pokerDeck: [],
    log: [{ turn: 1, text: `New board generated (seed ${seed}).` }],
  };
}

/** Handy for tests and for the UI's board summary. */
export function countTerrain(tiles: Record<string, Tile>) {
  const counts = { field: 0, forest: 0, city: 0, river: 0, rail: 0 };
  for (const tile of Object.values(tiles)) {
    counts[tile.base]++;
    if (tile.river) counts.river++;
    if (tile.rail) counts.rail++;
  }
  return counts;
}

export const TILE_COUNT = 3 * RADIUS * (RADIUS + 1) + 1;
