/**
 * What the player on turn can see.
 *
 * The party has no bird's-eye view. A player sees the tile they are standing on and
 * the ring around it, and that is all - the rest of the board is blank paper. Nothing
 * is remembered between turns, by design: the app keeps no map, so the only record of
 * where the river runs is what the players write down and what they tell each other.
 * That is the game. Adding an automatic explored-tiles overlay would delete it.
 *
 * Two things are deliberately exempt:
 *
 * - **You always know your own tile's label.** Otherwise "where are you?" is
 *   unanswerable and the table cannot pool anything. Knowing you are on E4 while not
 *   knowing what is at E5 is what makes the conversation work.
 * - **Hazards are visible to everyone, everywhere.** A tornado you cannot see coming
 *   is not a funny setback, it is an unexplained death, and the players who are not
 *   moving need something to watch.
 */

import { distance, neighbours, type Hex } from "./hex";
import { ROLES } from "./players";
import type { Enemy, GameState, Player } from "./types";

/** Tiles out from the player. One ring for everybody, two for the Scout. */
export const BASE_SIGHT = 1;

/**
 * The dragon smokes. You can smell it from two tiles out even through the blank, or
 * a hidden final boss on one tile in sixty-one is simply never found inside the turn
 * limit and the evening ends in a shrug rather than a fight.
 */
export const SMOKE_RADIUS = 2;

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

/** Can the player on turn see this tile at all? */
export const canSee = (viewer: Player, hex: Hex): boolean =>
  distance(viewer.hex, hex) <= sightOf(viewer);

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
