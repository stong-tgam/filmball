/**
 * The four roles, from rulebook §3.
 *
 * Everyone starts on **3 health and $2**. The role bonuses are small and single:
 * the knight can take one more hit, the rogue hits one harder, the scout walks one
 * further, and the doctor is the only one who can put anybody back together.
 *
 * Health is tiny on purpose - the whole game runs on 3 or 4 hit points, so a single
 * failed roll matters and a single piece of food is worth carrying.
 */

import { boardCorners, type Hex } from "./hex";
import type { Rng } from "./rng";
import type { Player, Role } from "./types";

/** Rulebook §3: everyone starts here, before role bonuses. */
export const BASE_HEALTH = 3;
export const BASE_MONEY = 2;

export type RoleProfile = {
  /** What the role is called at the table. */
  name: string;
  /** One line a child can act on, not a stat block. */
  blurb: string;
  /** Added to the 3 health everybody starts with. */
  healthBonus: number;
  /** Added to every damage roll. */
  attackBonus: number;
  /** Added to the one tile a turn everybody gets. */
  moveBonus: number;
  /**
   * Added to the one ring of tiles everybody can see. Only the Scout has this, and
   * it is the bonus that matters most now the board is hidden: seeing two rings
   * rather than one roughly triples what a turn tells you.
   */
  sightBonus: number;
  /** Doctors, and only doctors, can heal and revive. */
  canHeal: boolean;
  /**
   * Token colour. Picked to read against fields, forest and city alike, and to stay
   * clear of the board's orange selection ring.
   */
  colour: string;
};

export const ROLES: Record<Role, RoleProfile> = {
  knight: {
    name: "Knight",
    blurb: "Tough. Takes one more hit than anybody else.",
    healthBonus: 1,
    attackBonus: 0,
    moveBonus: 0,
    sightBonus: 0,
    canHeal: false,
    colour: "#d64545",
  },
  rogue: {
    name: "Rogue",
    blurb: "Hits harder. Every roll counts for one more.",
    healthBonus: 0,
    attackBonus: 1,
    moveBonus: 0,
    sightBonus: 0,
    canHeal: false,
    colour: "#9b5de5",
  },
  scout: {
    name: "Scout",
    blurb: "Covers ground and sees further. Two tiles a turn, and sees two rings out.",
    healthBonus: 0,
    attackBonus: 0,
    moveBonus: 1,
    sightBonus: 1,
    canHeal: false,
    colour: "#17b3c9",
  },
  doctor: {
    name: "Doctor",
    blurb: "Patches people up, and is the only one who can bring a friend back.",
    healthBonus: 0,
    attackBonus: 0,
    moveBonus: 0,
    sightBonus: 0,
    canHeal: true,
    colour: "#f0ece0",
  },
};

/** Turn order, and the order roles are handed out. */
export const TURN_ORDER: Role[] = ["knight", "rogue", "scout", "doctor"];

/**
 * Full health for this player: the base, the role's bonus, and their armour, which
 * rulebook §12 makes a health bonus rather than a damage shield.
 */
export const maxHealthOf = (player: Player): number =>
  BASE_HEALTH + ROLES[player.role].healthBonus + (player.armor?.value ?? 0);

/** Keeps the stored maximum honest after armour comes on or off. */
export function withMaxHealth(player: Player): Player {
  const maxHealth = maxHealthOf(player);
  return { ...player, maxHealth, health: Math.min(player.health, maxHealth) };
}

const spawn = (role: Role, hex: Hex): Player => {
  const maxHealth = BASE_HEALTH + ROLES[role].healthBonus;
  return {
    id: role,
    name: ROLES[role].name,
    role,
    hex,
    health: maxHealth,
    maxHealth,
    money: BASE_MONEY,
    weapon: null,
    armor: null,
    boots: null,
    supply: [],
    dead: false,
    fellAt: null,
    fellOn: null,
    movedThisTurn: false,
    actedThisTurn: false,
    stunned: false,
    joinedFightThisRound: false,
    bonusDiceNextFight: 0,
    notes: "",
  };
};

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
