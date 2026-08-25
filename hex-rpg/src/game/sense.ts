/**
 * What you can tell from where you stand, without seeing a map.
 *
 * The player has no board and no position marker. What they get is a bearing: the
 * dragon is *that way*, two tiles; there is a tornado *that way*, one tile. Nothing
 * says where any of it is on a grid, because there is no grid on screen - working out
 * that "the dragon is north-east of me and south of you" means we are both about here
 * is the puzzle, and it is solved out loud with the notebooks.
 *
 * `SENSE_RANGE` is two movements. Further than that and you feel nothing at all.
 */

import { distance, hexToPixel, type Hex } from "./hex";
import { ENEMIES, THIEVES } from "./enemies";
import { ROLES } from "./players";
import { PALETTE } from "../palette";
import type { GameState, Hazard, Player } from "./types";

/** Two tiles. The rulebook's unit of distance is a move, so this is "two moves out". */
export const SENSE_RANGE = 2;

export type SenseKind = "dragon" | "monster" | "hazard" | "player";

export type Sensed = {
  /** Stable across renders so React can key on it and arrows do not swap places. */
  id: string;
  kind: SenseKind;
  /** What to call it at the table. */
  name: string;
  /** Tiles away, 1 or 2. */
  steps: number;
  /**
   * The thing's own colour, straight off `src/palette.ts`.
   *
   * Carried on the blip rather than looked up by kind in the view, so the dot on the
   * compass is the same colour as the token on the board without the two having to
   * agree by hand. A child navigates by "the purple one is two moves east".
   */
  colour: string;
  /**
   * Compass bearing in degrees, 0 = north, clockwise. Continuous rather than snapped
   * to the six hex directions: at two tiles out a monster can sit between two of them,
   * and rounding it to a flat side would send the party the wrong way.
   */
  bearing: number;
};

/** North is -y in the layout, so flip it and measure clockwise from there. */
export function bearingBetween(from: Hex, to: Hex): number {
  const a = hexToPixel(from, 1);
  const b = hexToPixel(to, 1);
  const degrees = (Math.atan2(b.x - a.x, a.y - b.y) * 180) / Math.PI;
  return (degrees + 360) % 360;
}

/** The eight-point name for a bearing, for the log and for reading aloud. */
export function compassName(bearing: number): string {
  const points = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"];
  return points[Math.round(bearing / 45) % 8];
}

/**
 * Everything within two moves, as bearings.
 *
 * What is sensed follows the same rules as the hidden board did: hazards are always
 * felt, the dragon is always felt because it smokes, and an ordinary monster is felt
 * only once somebody has walked into it. Sensing unfound monsters would undo the
 * ambush, which is the whole reason they are hidden.
 */
export function sense(state: GameState, viewer: Player): Sensed[] {
  const found: Sensed[] = [];
  const near = (hex: Hex) => distance(viewer.hex, hex) <= SENSE_RANGE && distance(viewer.hex, hex) > 0;

  for (const enemy of state.enemies) {
    // A dormant dragon is not there yet: no smoke, no blip, nothing to walk into.
    // See `DRAGON_WAKES_ON`.
    if (enemy.defeated || enemy.dormant || !near(enemy.hex)) continue;
    const dragon = enemy.kind === "finalboss";
    if (!dragon && !enemy.found) continue;
    // The robber and the pirates are one thing wearing two hats: a hazard record and
    // a monster record on the same tile. The hazard loop below already reports them,
    // and reporting them here as well is what put "Pirates — two moves south-west"
    // on the read-out twice and had the table hunting for a second crew.
    if (THIEVES.includes(enemy.kind)) continue;
    found.push({
      id: enemy.id,
      kind: dragon ? "dragon" : "monster",
      name: dragon ? "Smoke on the wind" : ENEMIES[enemy.kind].name,
      colour: dragon ? PALETTE.finalboss : PALETTE[enemy.kind as "mob" | "midboss"],
      steps: distance(viewer.hex, enemy.hex),
      bearing: bearingBetween(viewer.hex, enemy.hex),
    });
  }

  for (const hazard of state.hazards) {
    if (!near(hazard.hex)) continue;
    found.push({
      id: `hazard-${hazard.kind}`,
      kind: "hazard",
      name: HAZARD_NAME[hazard.kind] ?? hazard.kind,
      colour: PALETTE[hazard.kind],
      steps: distance(viewer.hex, hazard.hex),
      bearing: bearingBetween(viewer.hex, hazard.hex),
    });
  }

  for (const other of state.players) {
    if (other.id === viewer.id || other.dead || !near(other.hex)) continue;
    found.push({
      id: other.id,
      kind: "player",
      name: other.name,
      colour: ROLES[other.role].colour,
      steps: distance(viewer.hex, other.hex),
      bearing: bearingBetween(viewer.hex, other.hex),
    });
  }

  // Nearest first: a thing one tile away matters more than the same thing two away.
  return found.sort((a, b) => a.steps - b.steps || a.bearing - b.bearing);
}

const HAZARD_NAME: Record<Hazard["kind"], string> = {
  tornado: "Tornado",
  robber: "Robber",
  pirates: "Pirates",
  homeless: "A family in need",
};
