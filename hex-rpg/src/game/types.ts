/**
 * All game types.
 *
 * v0.1 only populates the board half of this file, but the whole shape is here so
 * later phases slot in without renaming anything. Everything is plain data and
 * JSON-serialisable: the store snapshots it for autosave and undo, and if online
 * multiplayer ever happens, only the transport changes, not these types.
 */

import type { Hex } from "./hex";

export type Terrain = "field" | "forest" | "city";

/**
 * What can occupy part of a tile. Terrain plus water: a river is an element of the
 * tiles it runs through, not a stripe painted over them.
 */
export type Element = Terrain | "water";

/** How many distinct elements one tile may hold. */
export const MAX_ELEMENTS = 3;

export type Tile = {
  hex: Hex;
  /**
   * The tile's dominant land terrain - what the rules key off ("search on forest or
   * field", "trade in a city"). The tile may hold other elements alongside it.
   */
  base: Terrain;
  /**
   * One element per side, indexed by `DIRS`. A tile is a composition of up to
   * MAX_ELEMENTS of them, and every element it holds owns at least one side, so a
   * tile can be field with a wood along its north edge and a river cutting the west.
   */
  sides: Element[];
  river: boolean;
  rail: boolean;
  /** Turn number the tile recovers on; null when undamaged. Tornado damage. */
  destroyedUntil: number | null;
  /** A tile gives up its findings once. Stops the party camping on one square. */
  searched: boolean;
};

export type Role = "knight" | "rogue" | "scout" | "doctor" | "fisherman";

export type ItemSlot = "weapon" | "armor" | "boots" | "supply";

export type Item = {
  id: string;
  name: string;
  slot: ItemSlot;
  cost: number;
  /** Added to damage for weapons, subtracted from damage taken for armor. */
  value: number;
};

export type Player = {
  id: string;
  name: string;
  role: Role;
  hex: Hex;
  health: number;
  maxHealth: number;
  money: number;
  weapon: Item | null;
  armor: Item | null;
  boots: Item | null;
  supply: Item[];
  dead: boolean;
/**
   * Tiles walked so far this turn. Cleared when the player's next turn begins.
   *
   * A turn's movement is spent **one tile at a time**, not as a range: a Scout with two
   * tiles takes a step, looks at what that step revealed, and only then decides whether
   * to take the second or do something else with the turn. On a board nobody can see,
   * a two-tile move chosen up front would be a leap into the dark; step by step, extra
   * movement is extra *scouting*, which is what the role is for.
   */
  stepsTaken: number;
  /** One action per turn - search, trade or a fight. Eating is free and not this. */
  actedThisTurn: boolean;
  /** Owes a turn - looking after the traveller, per rulebook §5.5. */
  stunned: boolean;
  /**
   * Where they fell. A doctor reaching this tile revives them on the spot; left
   * alone they pick themselves up after a full turn (rulebook §7's compromise).
   */
  fellAt: Hex | null;
  /** Turn they died on, for the self-revive clock. */
  fellOn: number | null;
  /**
   * A second coat, on the knight's back and nobody else's.
   *
   * It does nothing for the person carrying it - no health, no armour, no weight. It
   * exists to be handed to somebody else, which is the knight's job: the one who can
   * take a hit is the one who should be carrying the spare.
   */
  spareArmor: Item | null;
  /** Homeless-person donation: extra dice on the next fight only. */
  bonusDiceNextFight: number;
  /**
   * Fish landed so far, all game. The fisherman's rod is upgraded at `FISH_TO_UPGRADE`
   * and the count keeps going up after that; nothing else reads it.
   */
  fishCaught: number;
  joinedFightThisRound: boolean;
};

export type EnemyKind = "mob" | "midboss" | "finalboss" | "robber" | "pirates";

export type Feature = "water" | "railway" | "city" | "forest" | "field";

export type Enemy = {
  id: string;
  kind: EnemyKind;
  hex: Hex;
  maxHealth: number;
  /** Damage accumulates across fights; the enemy dies when it reaches maxHealth. */
  damageTaken: number;
  /** Drawn on first encounter; empty until then. */
  features: Feature[];
  featuresRevealed: boolean;
  /** Water feature: an enemy may slip away once. */
  escapedOnce: boolean;
  /** Robbers and pirates carry what they have stolen. */
  loot: Item[];
  /**
   * Whether anybody has walked into it yet. Monsters are hidden until somebody steps
   * on their tile, so an unfound monster is drawn to nobody. Hazards are the
   * opposite and are always on the board.
   */
  found: boolean;
  defeated: boolean;
};

export type HazardKind = "tornado" | "homeless" | "robber" | "pirates";

export type Hazard = {
  kind: HazardKind;
  hex: Hex;
  /** Player ids already triggered on this tile; cleared when either one moves. */
  resolvedWith: string[];
  /**
   * Money a thief is holding. Beat it and you get the lot back, which is what makes
   * chasing one worth a turn.
   */
  carrying: number;
};

export type Suit = "clubs" | "diamonds" | "hearts" | "spades" | "joker";
export type Rank =
  | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10"
  | "J" | "Q" | "K" | "A"
  /** Two of these in the search deck: rulebook §6, a thief in the undergrowth. */
  | "Joker";

export type Card = { suit: Suit; rank: Rank };

export type EventCard = {
  id: string;
  title: string;
  /** One line, read aloud at the table. */
  text: string;
};

/**
 * The turn's draw: a poker card, and the event it brought with it if it was a face
 * card. Held in state until somebody dismisses it, so the table gets to read it.
 */
export type Draw = {
  card: Card;
  event: EventCard | null;
};

/**
 * What a search turned up, kept in state so the table gets a moment for it.
 *
 * The log already said all of this, and the log is not enough: turning over the
 * ground is one of the four or five things in the game worth stopping for, and a line
 * of text scrolling past the sidebar is not a moment. This is what the card on screen
 * is drawn from - the drawing of the thing you found, or a card that says you found
 * nothing, which is information too.
 *
 * Every field is derived from what the search actually did to the state rather than
 * declared by the branch that did it, so the card cannot drift out of step with the
 * rules the way a hand-written summary would.
 */
export type Find = {
  card: Card;
  /**
   * Which table was rolled on: the river gives up a chest, everywhere else ground,
   * and `"line"` is the fisherman casting rather than either.
   */
  from: "chest" | "ground" | "line";
  /** The headline, for the card's title and its animation. */
  kind: "gear" | "fish" | "coins" | "full" | "nothing" | "mishap" | "thief" | "trap";
  /** What the player is holding now that they were not holding before. Drawn as tokens. */
  gained: Item[];
  /** What it displaced or cost them - a swapped piece, or one a mishap took. */
  lost: Item[];
  coins: number;
  /** Health it cost. Never more than one. */
  hurt: number;
  /** The lines the search wrote to the log, in order. Read aloud. */
  lines: string[];
};

export type LogEntry = {
  turn: number;
  text: string;
};

/**
 * One roll: the dice that came up, and what they came to once the attacker's own
 * strength was added. Kept in state so the UI can show the dice that were actually
 * rolled rather than re-rolling its own for display.
 */
export type Roll = {
  dice: number[];
  /** Dice total plus the attacker's weapon or claws. */
  damage: number;
};

export type CombatOutcome =
  | "ongoing"
  | "enemyDefeated"
  /** The water feature: a monster slipping away rather than going down. */
  | "enemyEscaped"
  /** Rulebook §7: an exact tie does nothing at all. */
  | "standoff"
  | "playerEscaped"
  | "playerDown";

/** A fight in progress. Only one runs at a time: it is the active player's turn. */
export type Combat = {
  enemyId: string;
  /**
   * Whoever started it. Rulebook §8 calls them the starter and §10 gives them the
   * picks, so the distinction outlives the fight.
   */
  playerId: string;
  /**
   * Everybody else who piled in, in the order they joined. Rulebook §8: the starter
   * may invite anyone inside their movement range, the invited move onto the tile and
   * roll, and it does not cost them their turn.
   */
  allies: string[];
  /** Tile the player came from, so running away puts them back where they were. */
  from: string;
  round: number;
  /** The last roll, for the dice display. Null before the first one. */
  playerRoll: Roll | null;
  /** Health the party lost on the last failed roll. */
  toll: number;
  /** Items on the ground, and how many of them the winner may keep. */
  spoils: Item[];
  picksLeft: number;
  /**
   * True when the player walked into a hidden monster rather than choosing the
   * fight. An ambush is always free to back out of on the first round - you may
   * not know what you have found until you have found it.
   */
  ambush: boolean;
  outcome: CombatOutcome;
};

/** Won, lost, or still going. Rulebook §14: beat the final boss inside the limit. */
export type Ending = "victory" | "outOfTime" | "partyLost";

export type Phase =
  | "setup"
  | "hazardMove"
  | "eventDraw"
  | "playerMove"
  | "playerAction"
  | "combat"
  | "gameOver";

export type GameState = {
  seed: number;
  /**
   * The dice generator's current position. Every roll advances it, so a saved game
   * resumes the same sequence it would have rolled had it never been put down.
   */
  rngState: number;
  turn: number;
  turnLimit: number;
  phase: Phase;
  activePlayerIndex: number;
  /** Keyed by tile label, e.g. "E5". */
  tiles: Record<string, Tile>;
  players: Player[];
  enemies: Enemy[];
  hazards: Hazard[];
  /** The fight on screen right now, or null when nobody is fighting. */
  combat: Combat | null;
  /** How it finished, once it has. */
  ending: Ending | null;
  itemPile: Item[];
  eventDeck: EventCard[];
  /** Drives the turn's event draw. */
  pokerDeck: Card[];
  /** The second deck the spec calls for: this one drives searches. */
  searchDeck: Card[];
  /** This turn's card, waiting to be read. */
  draw: Draw | null;
  /** What the last search turned up, until the table has looked at it. */
  find: Find | null;
  log: LogEntry[];
};
