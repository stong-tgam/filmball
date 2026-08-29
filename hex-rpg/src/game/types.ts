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
  /**
   * Planks across the water: the one place anybody but the fisherman may cross.
   *
   * A river tile is otherwise impassable (`bridges.ts`). Bridges are where the railway
   * meets the water, plus whatever fords the generator has to add to keep the board in
   * one piece - a map with a stranded corner is a map that eats an evening.
   */
  bridge: boolean;
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
   * **The only way anybody ever leaves.** There used to be a second flag, `dead`, for
   * a player knocked out in a fight - and in v0.31 it stopped being reachable: losing
   * a fight costs health, health at zero costs you your skill, and a player with no
   * skill is still at the table playing every mini-game. A field that could only ever
   * be true alongside this one is a field the next reader has to work out, so it went.
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
  /** Homeless-person donation: extra dice on the next fight only. */
  bonusDiceNextFight: number;
  /**
   * Fish landed so far, all game. The fisherman's rod is upgraded at `FISH_TO_UPGRADE`
   * and the count keeps going up after that; nothing else reads it.
   */
  fishCaught: number;
};

/**
 * A team: a list of player ids, and nothing else.
 *
 * Deliberately not a position, a health, or an inventory. Everything a team appears to
 * own is really owned by its members - they simply all stand on the same tile, which is
 * `movePlayer`'s job to keep true. Keeping the team this thin is what let every rule
 * written before teams existed carry on working untouched.
 */
export type Team = {
  id: string;
  /** The members' names, joined. A child looks for their own name, not for "Team 2". */
  name: string;
  memberIds: string[];
};

export type EnemyKind = "mob" | "midboss" | "finalboss" | "robber" | "pirates";

export type Feature = "water" | "railway" | "city" | "forest" | "field";

export type Enemy = {
  id: string;
  kind: EnemyKind;
  hex: Hex;
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
 * One card, and the mini-game it asked for.
 *
 * The card is stored and the challenge is looked up from it (`challengeFor`), so a
 * saved game resumes on the same prompt with the same clock - and so a family who swap
 * the fifty-two contents for generated ones later do not invalidate anybody's save.
 */
export type Trial = {
  card: Card;
  /**
   * Seconds on the clock, worked out when the card is dealt.
   *
   * Baked in rather than derived, because gear and the scout both change it and the
   * team has to be able to see what they are actually playing for.
   */
  seconds: number;
  /** The hint has been read. One per card, however it was paid for. */
  hinted: boolean;
  /** null while it is being played. */
  result: "won" | "lost" | null;
};

export type CombatOutcome =
  | "ongoing"
  | "enemyDefeated"
  /** The water feature: a monster slipping away rather than going down. */
  | "enemyEscaped"
  /**
   * The clock beat them. Costs health and nothing else - the monster is still there,
   * still on that tile, and can be taken on again. **There is no losing outcome that
   * takes anybody out of the game**: a team never wipes, and a player on no health is
   * still at the table playing every game, just without their skill.
   */
  | "partyBeaten";

/**
 * A fight in progress: a run of mini-games against one monster.
 *
 * A monster deals **one card**, a mid boss two and the dragon three, and the team has
 * to win **all of them**. There is no health bar and nothing carries over: lose one
 * card and the whole fight is lost, and the monster is standing there tomorrow exactly
 * as it was. That is deliberate. A wounded-enemy number was the thing that made a boss
 * a siege spread over a dozen goes, and a siege is the opposite of a moment.
 */
export type Combat = {
  enemyId: string;
  /**
   * Whoever walked into it. Rulebook §10 gives them the picks, so the distinction
   * outlives the fight even though the whole team plays.
   */
  playerId: string;
  /** Everybody else on the tile - the rest of the team. They all play, so they all pay. */
  allies: string[];
  /** The cards it dealt, in order. One, two or three of them. */
  trials: Trial[];
  /** Which one is being played. */
  at: number;
  /** Hints the team has left to spend this fight, bought with boots. */
  hintsLeft: number;
  /** Players whose skill has fired in this fight. One each. */
  skillsUsed: string[];
  /**
   * Item ids whose rule has been bent in this fight, once per use.
   *
   * A list rather than a set because a **fine** piece bends its rule twice (`usesOf`),
   * so the same id legitimately appears more than once. It goes away with the fight,
   * which is why there is nothing to reset.
   */
  gearUsed: string[];
  /** Tile the team came from. */
  from: string;
  /** Items on the ground, and how many of them the winner may keep. */
  spoils: Item[];
  picksLeft: number;
  outcome: CombatOutcome;
};

/**
 * Won or lost. Rulebook §14: beat the final boss inside the limit.
 *
 * `partyLost` is gone. A team never wipes - there is nothing left in the game that can
 * end an evening early, which is the point of health only ever costing you your skill.
 */
export type Ending = "victory" | "outOfTime";

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
  /**
   * Who walks with whom. Two to five people make one or two of these, and a team is
   * what actually takes a turn (`src/game/teams.ts`).
   */
  teams: Team[];
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
  /**
   * The third: the one monsters deal from.
   *
   * Its own shuffle, like the other two, and for the same reason - a fight and a
   * search drawing off one deck would make the ground the party has turned over change
   * which games they get, which is a rule nobody could hold in their head.
   */
  challengeDeck: Card[];
  /** This turn's card, waiting to be read. */
  draw: Draw | null;
  /** What the last search turned up, until the table has looked at it. */
  find: Find | null;
  log: LogEntry[];
};
