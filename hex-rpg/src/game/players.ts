/**
 * The four roles, and how a party is set up.
 *
 * PLACEHOLDER STATS. The rulebook is the authority on health, movement and starting
 * money, and it is missing (see `reference/README.md`). The numbers here are chosen
 * to be legible to a child rather than balanced: everyone survives a few hits,
 * nobody moves so far that the board stops mattering, and the differences between
 * roles are small enough that no pick feels like a mistake. Replace them wholesale
 * when the rulebook turns up.
 */

import { boardCorners, type Hex } from "./hex";
import type { Rng } from "./rng";
import type { Player, Role } from "./types";

export type RoleProfile = {
  /** What the role is called at the table. */
  name: string;
  /** One line a child can act on, not a stat block. */
  blurb: string;
  maxHealth: number;
  /** Tiles per turn, before boots. */
  move: number;
  money: number;
  /**
   * Token colour. Picked to read against fields, forest and city alike, and to stay
   * clear of the board's orange selection ring.
   */
  colour: string;
};

export const ROLES: Record<Role, RoleProfile> = {
  knight: {
    name: "Knight",
    blurb: "Tough. Stands in front and takes the hits.",
    maxHealth: 12,
    move: 2,
    money: 5,
    colour: "#d64545",
  },
  rogue: {
    name: "Rogue",
    blurb: "Quick and light-fingered. Starts with more money.",
    maxHealth: 9,
    move: 3,
    money: 8,
    colour: "#9b5de5",
  },
  scout: {
    name: "Scout",
    blurb: "Covers ground. Finds things first.",
    maxHealth: 10,
    move: 3,
    money: 5,
    colour: "#17b3c9",
  },
  doctor: {
    name: "Doctor",
    blurb: "Patches up the party.",
    maxHealth: 10,
    move: 2,
    money: 6,
    colour: "#f0ece0",
  },
};

/** Turn order, and the order roles are handed out. */
export const TURN_ORDER: Role[] = ["knight", "rogue", "scout", "doctor"];

const spawn = (role: Role, hex: Hex): Player => ({
  id: role,
  name: ROLES[role].name,
  role,
  hex,
  health: ROLES[role].maxHealth,
  maxHealth: ROLES[role].maxHealth,
  money: ROLES[role].money,
  weapon: null,
  armor: null,
  boots: null,
  supply: [],
  dead: false,
  movedThisTurn: false,
  joinedFightThisRound: false,
  bonusDiceNextFight: 0,
});

/**
 * The party, one to a corner of the board.
 *
 * Corners are always four tiles apart, so nobody starts next to anybody and everyone
 * is the same distance from the middle - which matters at a kitchen table, where
 * "you started closer" is an argument waiting to happen. Which four of the six
 * corners get used comes from the seed.
 */
export function createPlayers(rng: Rng): Player[] {
  const corners = rng.shuffle(boardCorners()).slice(0, TURN_ORDER.length);
  return TURN_ORDER.map((role, i) => spawn(role, corners[i]));
}
