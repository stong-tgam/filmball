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
  /**
   * A chest is sunk in the water here.
   *
   * Only a few stretches of the river have one. Every river tile used to, which made
   * the best odds in the game something you tripped over rather than went looking for
   * - and put a chest mark on a dozen tiles, which is a map that says nothing.
   */
  chest: boolean;
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
   * Every tile this player has laid eyes on, by label.
   *
   * **Theirs, not the party's.** Pooling it would delete the one conversation the
   * hidden board exists to create - you still have to tell your sister where the shop
   * is, because she has not been there. What it removes is the *bookkeeping*: a
   * seven-year-old was never going to keep a paper map of ninety tiles, and asking them
   * to was the part of the rule that did not survive the board getting bigger.
   *
   * It remembers **ground, never contents**. A monster walks, a hazard walks, another
   * player walks, and ground somebody has searched since you passed is no longer
   * unsearched - so a memory that showed any of those would be the app lying rather
   * than the app forgetting.
   */
  seen: string[];
  /**
   * Went into the abyss when the rim fell (`collapse.ts`), and is out of the game.
   *
   * Separate from `dead`, which is temporary by design - §7's compromise gets a downed
   * player back up after a turn and a doctor gets them up at once, because a child
   * with nothing to do for the rest of the evening is the failure that rule avoids.
   * This one is permanent, so it needs its own flag: `fellOn: null` stops the clock
   * and this stops the doctor.
   */
  gone: boolean;
  /**
   * A second coat, on the knight's back and nobody else's.
   *
   * It does nothing for the person carrying it - no health, no armour, no weight. It
   * exists to be handed to somebody else, which is the knight's job: the one who can
   * take a hit is the one who should be carrying the spare.
   */
  spareArmor: Item | null;
  /**
   * The one stone they are carrying, or none (`src/game/gems.ts`).
   *
   * One per player, and it is the only thing in the game that gives an *ability*
   * rather than a number. Which of their three pieces of kit it is set in is on the
   * stone itself, because that is the decision - not owning it, but choosing what it
   * is for today.
   */
  gem: Gem | null;
  /** Homeless-person donation: extra dice on the next fight only. */
  bonusDiceNextFight: number;
  /**
   * Fish landed so far, all game. The fisherman's rod is upgraded at `FISH_TO_UPGRADE`
   * and the count keeps going up after that; nothing else reads it.
   */
  fishCaught: number;
  joinedFightThisRound: boolean;
};

/**
 * The three stones. Green is *keep going*, red is *you, now*, blue is *everybody else*.
 *
 * Three colours and three settings is nine abilities from three objects, and none of
 * them has to be memorised: what a stone does is written on the button that does it.
 */
export type GemKind = "green" | "red" | "blue";

/** The three places a stone can sit. Not `"supply"` - a stone is not lunch. */
export type GemSetting = "weapon" | "armor" | "boots";

export type Gem = {
  id: string;
  kind: GemKind;
  /** Where it is set right now. Free to change on your own turn, never mid-fight. */
  set: GemSetting;
  /**
   * Which of its **once-a-game** powers have been used up.
   *
   * Per setting, not per stone: spending the coat's save must not also spend the
   * boots' second dig. Powers that recharge every fight are not tracked here - they
   * live on `Combat.stonesSpent`, which disappears with the fight.
   */
  spent: GemSetting[];
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
  /**
   * Asleep somewhere else, and not on the board yet.
   *
   * Only ever the dragon, and only for the first few turns (`DRAGON_WAKES_ON`). A
   * dormant enemy cannot be walked into, cannot be sensed and does not smoke: the
   * middle of the map is an ordinary mountain until it lands on it. The alternative -
   * simply not putting it on the board - would let something else be placed on the
   * middle tile and leave the game with nowhere to end.
   */
  dormant: boolean;
  /**
   * A stone of its own, and whether it has been spent.
   *
   * Only the dragon carries one, and it is the balance lever for the party's stones:
   * three colours of them added about five points of win rate, and the honest answer
   * to that is the same system pointed the other way rather than another number on the
   * dragon's health. Green, and it means what green always means - once in the fight,
   * a blow that should have finished it leaves it on one.
   */
  stone: GemKind | null;
  stoneSpent: boolean;
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
 * One wanderer's step, for the turn's report. Where it went is a **direction**, never
 * a tile: the log rule holds here too, and a grid reference on the card would hand the
 * table the map the whole design hides.
 */
export type Stirring = {
  kind: HazardKind;
  name: string;
  colour: string;
  /** Eight-point compass name, or null if it could not move at all. */
  heading: string | null;
};

/**
 * The turn's draw: a poker card, the event it brought with it if it was a face card,
 * and **what happened before anybody's go**.
 *
 * The last part is the "meanwhile". A turn opens with the rim maybe falling in, the
 * dragon maybe landing, four hazards each taking a step and a bandit maybe arriving -
 * all of it decided before the player who is up has touched anything, and all of it
 * previously reported only as log lines scrolling past a sidebar nobody was reading.
 * A child who is handed the device needs to know what moved and who it landed on.
 */
export type Draw = {
  card: Card;
  event: EventCard | null;
  /** Which way each wanderer went. */
  stirred: Stirring[];
  /**
   * Everything the opening wrote to the log, in order - the collapse, the dragon
   * landing, whoever a hazard caught and what it cost them.
   *
   * Read back off the log rather than described branch by branch, the same way
   * `Find` is derived: a hand-written summary per hazard would go stale the first time
   * somebody changed an effect and not its summary, and the card would then quietly
   * lie about the rules.
   */
  happenings: string[];
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
  kind: "gear" | "stone" | "fish" | "coins" | "full" | "nothing" | "mishap" | "thief" | "trap";
  /** What the player is holding now that they were not holding before. Drawn as tokens. */
  gained: Item[];
  /** What it displaced or cost them - a swapped piece, or one a mishap took. */
  lost: Item[];
  coins: number;
  /** Health it cost. Never more than one. */
  hurt: number;
  /**
   * A stone that turned up with it, or null - which is almost always.
   *
   * Its own field rather than one of `gained`, because a stone is not an item: it
   * has no slot, no price and no plus, and the card gives it the whole width.
   */
  gem: Gem | null;
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
  /**
   * What each fighter is doing *instead of* swinging this round.
   *
   * Empty means everybody rolls, which is the common case and the whole of a solo
   * fight. A doctor may patch somebody up rather than roll: they contribute no dice
   * that round and the target gets a health back. Cleared when the round resolves.
   *
   * A list of `{ by, kind, to }` rather than a doctor-shaped field, because this is
   * where weapon skills and gems will hang when they arrive — the shape is the point,
   * `"heal"` is just the only one built.
   */
  support: { by: string; kind: "heal"; to: string }[];
  /**
   * Players whose stone has fired in **this fight**.
   *
   * Red's three powers and blue's coat recharge every fight rather than once a game,
   * and a fight is the natural place to keep that: the list goes away when the fight
   * does, so there is nothing to reset and nothing to forget to reset. A player can
   * only have one stone in one setting, so one id is enough - there is no way to spend
   * two of them in a round.
   */
  stonesSpent: string[];
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
