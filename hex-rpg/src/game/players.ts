/**
 * The five roles. Four are rulebook §3; the fisherman is this build's own.
 *
 * Everyone starts on **3 health and $2**. The role bonuses are small and single:
 * the knight can take one more hit, the rogue hits one harder, the scout walks one
 * further, the doctor is the only one who can put anybody back together, and the
 * fisherman is the only one who starts holding anything at all.
 *
 * The fisherman is the odd one out on purpose. Every other bonus is a number added to
 * a roll; theirs is a **rod**, which is a thing you hold and can therefore be drawn,
 * upgraded and pointed at. It makes them the worst fighter at the table - the rod adds
 * nothing - in exchange for the only reliable food supply in the game and the only way
 * to move somebody who is not you.
 *
 * Health is tiny on purpose - the whole game runs on 3 or 4 hit points, so a single
 * failed roll matters and a single piece of food is worth carrying.
 */

import { teamSizes } from "./teams";
import { boardCorners, type Hex } from "./hex";
import { PALETTE } from "../palette";
import { ROD_TEMPLATE, makeItem } from "./items";
import type { Rng } from "./rng";
import type { Player, Role, Terrain } from "./types";

/** Rulebook §3: everyone starts here, before role bonuses. */
export const BASE_HEALTH = 3;
export const BASE_MONEY = 2;

/**
 * Rulebook §5 says one tile. This is **two**, as of v0.30.
 *
 * One tile was right while the board was blank paper and a step was a guess: you could
 * see exactly as far as you could walk, so a move was "try that hex". With the map
 * remembered (`Player.seen`) and sight at two rings, a turn is a *route* - you can see
 * the whole of where you might go, and choosing between nineteen tiles rather than six
 * is a decision instead of a poke. Movement is still spent **one tile at a time**, so
 * an ambush still interrupts you halfway and you still choose whether to push on.
 */
export const BASE_MOVE = 2;

/**
 * How far a player moves in a turn - and, since `combat.ts` reads it, how likely they
 * are to get out of a fight. Boots are the one piece of gear that does two jobs.
 */
export const moveRange = (player: Player): number =>
  BASE_MOVE + ROLES[player.role].moveBonus + (player.boots?.value ?? 0);

/** Steps still in the legs this turn. Movement is spent one tile at a time. */
export const stepsLeft = (player: Player): number =>
  Math.max(0, moveRange(player) - player.stepsTaken);

/** Has this player moved at all yet this turn? */
export const hasMoved = (player: Player): boolean => player.stepsTaken > 0;

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
  /** Fishermen, and only fishermen, can fish a river and cast the hook. */
  canFish: boolean;
  /**
   * Crosses open water without a bridge.
   *
   * The fisherman's, and the other half of their bargain (see `tradesWithTheParty`).
   * A river is a wall to everybody else, which makes the one person who can ignore it
   * the party's scout for the far bank - and it is what stopped bridges deleting the
   * role outright, since fishing needs somebody standing in the water.
   */
  swims: boolean;
  /**
   * Turned-over ground gives this role a second look, on the terrain they know.
   *
   * The scout's in the woods, and it is the only one - a role bonus that applies
   * everywhere is just a bigger number, while one that applies *somewhere* is a reason
   * to send a particular child to a particular tile, which is the party talking to
   * each other. `null` for everybody else.
   */
  homeGround: Terrain | null;
  /**
   * Robs a beaten monster of one extra thing, over what §10 says it drops.
   */
  robsTheBody: boolean;
  /**
   * Room for a second coat, for the knight alone.
   *
   * The knight's own bonus is that they can take one more hit, so the party's spare
   * armour riding on their back is the same idea said twice: they are the one who can
   * afford to be carrying something they are not wearing.
   */
  carriesSpare: boolean;
  /**
   * Hands things to the rest of the party.
   *
   * True for everybody but the fisherman. Their side of the bargain: they cross open
   * water at will and can never lose the rod, and in exchange the food they pull out of
   * the river is theirs. A role that could fish forever *and* feed four other people
   * would make the whole supply economy one player's job.
   *
   * One-way, not exile: they can still be given to.
   */
  tradesWithTheParty: boolean;
  /** Token colour. One source for every colour on the board: see `src/palette.ts`. */
  colour: string;
};

export const ROLES: Record<Role, RoleProfile> = {
  knight: {
    name: "Knight",
    blurb: "Tough. Takes one more hit, and carries the party's spare coat.",
    healthBonus: 1,
    attackBonus: 0,
    moveBonus: 0,
    sightBonus: 0,
    canHeal: false,
    canFish: false,
    swims: false,
    carriesSpare: true,
    homeGround: null,
    robsTheBody: false,
    tradesWithTheParty: true,
    colour: PALETTE.knight,
  },
  rogue: {
    name: "Rogue",
    blurb: "Hits harder, and goes through pockets. Every roll counts for one more.",
    healthBonus: 0,
    attackBonus: 1,
    moveBonus: 0,
    sightBonus: 0,
    canHeal: false,
    canFish: false,
    swims: false,
    carriesSpare: false,
    homeGround: null,
    robsTheBody: true,
    tradesWithTheParty: true,
    colour: PALETTE.rogue,
  },
  scout: {
    name: "Scout",
    blurb: "Two tiles a turn, sees two rings out, and knows what to look for in a wood.",
    healthBonus: 0,
    attackBonus: 0,
    moveBonus: 1,
    sightBonus: 1,
    canHeal: false,
    canFish: false,
    swims: false,
    carriesSpare: false,
    homeGround: "forest",
    robsTheBody: false,
    tradesWithTheParty: true,
    colour: PALETTE.scout,
  },
  doctor: {
    name: "Doctor",
    blurb: "Patches people up, and is the only one who can bring a friend back.",
    healthBonus: 0,
    attackBonus: 0,
    moveBonus: 0,
    sightBonus: 0,
    canHeal: true,
    canFish: false,
    swims: false,
    carriesSpare: false,
    homeGround: null,
    robsTheBody: false,
    tradesWithTheParty: true,
    colour: PALETTE.doctor,
  },
  fisherman: {
    name: "Fisher",
    blurb: "Fishes the river for food and treasure, hooks a friend across, and swims.",
    healthBonus: 0,
    attackBonus: 0,
    moveBonus: 0,
    sightBonus: 0,
    canHeal: false,
    canFish: true,
    swims: true,
    carriesSpare: false,
    homeGround: null,
    robsTheBody: false,
    tradesWithTheParty: false,
    colour: PALETTE.fisherman,
  },
};

/**
 * Every role, in the order they are offered and the order they take their turns.
 *
 * A party is now **whichever of these the table picked**, in the order they picked
 * them — so this is the menu and the default, not the roster. `createPlayers` takes
 * the roster; `TURN_ORDER` is what it falls back to when nobody has chosen, which is
 * every test written before the picker existed and the sim.
 */
export const TURN_ORDER: Role[] = ["knight", "rogue", "scout", "doctor", "fisherman"];

/** Fewest and most people who can sit down to this. */
export const MIN_PARTY = 2;
export const MAX_PARTY = TURN_ORDER.length;

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
    // The only starting kit anybody has. It adds nothing to a roll; see ROD_TEMPLATE.
    weapon: ROLES[role].canFish ? makeItem(ROD_TEMPLATE, "fishing-rod") : null,
    armor: null,
    boots: null,
    spareArmor: null,
    supply: [],
    seen: [],
    gone: false,
    stepsTaken: 0,
    actedThisTurn: false,
    stunned: false,
    bonusDiceNextFight: 0,
    fishCaught: 0,
  };
};

/**
 * Where the party starts: **in pairs, on corners**.
 *
 * One to a corner was the old rule, and it read well - everyone equidistant from the
 * middle, nobody with a head start, no "you started closer" argument at the table.
 * What it also meant was that **nobody was ever next to anybody**, and half the rules
 * written since need exactly that:
 *
 * - the doctor can only patch somebody adjacent (which is how a bug that made
 *   self-healing do nothing survived twenty versions unnoticed);
 * - the fisherman's hook reaches one tile;
 * - handing something over needs a shared tile;
 * - and §8's invitations reach only as far as the starter's own legs.
 *
 * Pairs are the compromise. Each pair takes a corner, one on it and one beside it, so
 * every player has somebody in reach from turn one - while the party still opens on
 * two or three separate corners, which is what keeps the hidden map worth talking
 * about. Starting everybody on one tile would have made the co-operation trivial and
 * deleted the exploring, which is the actual game.
 *
 * An odd party makes a **trio** at the last corner rather than opening a third one for
 * a single player: the leftover is exactly the child who would otherwise spend the
 * first four turns walking towards somebody.
 */
export function startingSpots(rng: Rng, count: number): Hex[] {
  // One corner per team, and **everybody in a team stands on it**. A team moves as one
  // thing, so it has to start as one thing - and a hex with three tokens on it is the
  // first thing the table sees about how this game is played.
  //
  // The corners themselves are shuffled and never adjacent, so two teams open on
  // opposite sides of a board neither of them can see, which is what keeps the
  // exploring worth talking about.
  const corners = rng.shuffle(boardCorners());
  const sizes = teamSizes(count);
  return sizes.flatMap((size, i) =>
    Array.from({ length: size }, () => corners[i % corners.length]),
  ).slice(0, count);
}

export function createPlayers(rng: Rng, roster: Role[] = TURN_ORDER): Player[] {
  // Duplicates would collide on `Player.id`, which is the role name; an empty roster
  // would be a game with nobody in it. Both are the caller's mistake, and both are
  // better caught here than three turns later.
  const party = roster.filter((role, i) => roster.indexOf(role) === i);
  const chosen = party.length > 0 ? party.slice(0, MAX_PARTY) : TURN_ORDER;
  const spots = startingSpots(rng, chosen.length);
  return chosen.map((role, i) => spawn(role, spots[i]));
}
