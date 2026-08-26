/**
 * What the player on turn can see, and what they remember seeing.
 *
 * The party still has no bird's-eye view: a player sees the tile they stand on and two
 * rings around it, and everything else is blank paper.
 *
 * **What changed in v0.30 is that they now remember where they have been** (see
 * `Player.seen`). For twenty-nine versions the app kept no map at all, on the grounds
 * that the only record of where the river ran should be what the players wrote down and
 * told each other - and on a 37-tile board with five kinds of terrain that was true and
 * good. It stopped being true when the board grew and started carrying features worth
 * remembering. No seven-year-old keeps a paper map of ninety tiles; what they actually
 * do is forget, and then the exploring is wasted rather than banked.
 *
 * The conversation the old rule protected is still there, because **memory is per
 * player, not per party**. You have to tell your sister where the shop is; she has not
 * been there. And memory holds **ground only, never contents** - monsters walk, hazards
 * walk, and ground gets searched by somebody else - so a remembered tile can never say
 * anything that has since stopped being true.
 *
 * Two things are deliberately exempt from the fog:
 *
 * - **You always know your own tile's label.** Otherwise "where are you?" is
 *   unanswerable and the table cannot pool anything. Knowing you are on E4 while not
 *   knowing what is at E5 is what makes the conversation work.
 * - **Hazards are visible to everyone, everywhere.** A tornado you cannot see coming
 *   is not a funny setback, it is an unexplained death, and the players who are not
 *   moving need something to watch.
 */

import { distance, fromLabel, inBoard, key, neighbours, type Hex } from "./hex";
import { ROLES } from "./players";
import type { Enemy, GameState, Player } from "./types";

/** Tiles out from the player. Two rings for everybody, three for the Scout - which
 *  is exactly as far as anybody can walk in a turn, so you can always see the whole of
 *  where you might go. */
export const BASE_SIGHT = 2;

/**
 * The dragon smokes, and you can smell it **one ring further than you can see** - a
 * hidden final boss on one tile in sixty-one is otherwise never found inside the turn
 * limit and the evening ends in a shrug rather than a fight.
 *
 * Derived from `BASE_SIGHT` rather than written down, because it was a flat 2 and sight
 * was a flat 1 until v0.30 raised sight to 2 - at which point the smoke reached exactly
 * as far as ordinary eyesight and quietly stopped being a hint at all. A clue that is
 * not better than looking is not a clue.
 */
export const SMOKE_RADIUS = BASE_SIGHT + 1;

export const sightOf = (player: Player): number => BASE_SIGHT + ROLES[player.role].sightBonus;

/** The tiles this player can see from where they stand, their own included. */
export function visibleFrom(player: Player): Hex[] {
  const seen: Hex[] = [player.hex];
  let edge: Hex[] = [player.hex];
  for (let step = 0; step < sightOf(player); step++) {
    const next: Hex[] = [];
    for (const hex of edge) {
      for (const n of neighbours(hex)) {
        if (seen.some((s) => s.q === n.q && s.r === n.r)) continue;
        seen.push(n);
        next.push(n);
      }
    }
    edge = next;
  }
  return seen;
}

/** Can the player on turn see this tile at all, right now? */
export const canSee = (viewer: Player, hex: Hex): boolean =>
  distance(viewer.hex, hex) <= sightOf(viewer);

/** Has this player ever laid eyes on this tile? Sight now, or memory from before. */
export const hasSeen = (viewer: Player, hex: Hex): boolean =>
  canSee(viewer, hex) || viewer.seen.includes(key(hex));

/**
 * Write down what this player can see from where they are standing.
 *
 * Called wherever somebody arrives somewhere - the start of a game, a move, a hook, a
 * tornado throwing them across the board - rather than once in `movePlayer`, because
 * half the ways a player changes tiles are not moves.
 */
export function remember(player: Player): Player {
  const fresh = visibleFrom(player)
    .map(key)
    .filter((label) => inBoard(fromLabel(label) ?? { q: 99, r: 99 }) && !player.seen.includes(label));
  return fresh.length === 0 ? player : { ...player, seen: [...player.seen, ...fresh] };
}

/** Everybody's memory brought up to date, for the top of a turn. */
export const rememberAll = (state: GameState): GameState => ({
  ...state,
  players: state.players.map((p) => (p.dead && p.gone ? p : remember(p))),
});

/**
 * Whether a monster shows on the board.
 *
 * Monsters hide. One is drawn only once somebody has walked into it and it is still
 * standing, so the board never warns you what is over the next hill - the exception
 * being the dragon, which you can smell from `SMOKE_RADIUS` away, and the two thieves,
 * which are hazards as well as monsters and are always on the board.
 */
export function enemyVisible(enemy: Enemy, viewer: Player): boolean {
  if (enemy.defeated) return false;
  if (enemy.kind === "robber" || enemy.kind === "pirates") return true;
  if (enemy.found) return canSee(viewer, enemy.hex);
  if (enemy.kind === "finalboss") return distance(viewer.hex, enemy.hex) <= SMOKE_RADIUS;
  return false;
}

/** Is the dragon close enough to smell, without being visible yet? */
export const smellsSmoke = (state: GameState, viewer: Player): boolean =>
  state.enemies.some(
    (e) =>
      e.kind === "finalboss" &&
      !e.defeated &&
      distance(viewer.hex, e.hex) <= SMOKE_RADIUS,
  );

/** Other players show only when they are in sight - you find each other by talking. */
export const playerVisible = (other: Player, viewer: Player): boolean =>
  other.id === viewer.id || canSee(viewer, other.hex);
