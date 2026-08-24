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

export type Tile = {
  hex: Hex;
  base: Terrain;
  river: boolean;
  rail: boolean;
  /** Turn number the tile recovers on; null when undamaged. Tornado damage. */
  destroyedUntil: number | null;
};

export type Role = "knight" | "rogue" | "scout" | "doctor";

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
  /** Homeless-person donation: extra dice on the next fight only. */
  bonusDiceNextFight: number;
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
  defeated: boolean;
};

export type HazardKind = "tornado" | "homeless" | "robber" | "pirates";

export type Hazard = {
  kind: HazardKind;
  hex: Hex;
  /** Player ids already triggered on this tile; cleared when either one moves. */
  resolvedWith: string[];
};

export type Suit = "clubs" | "diamonds" | "hearts" | "spades";
export type Rank =
  | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10"
  | "J" | "Q" | "K" | "A";

export type Card = { suit: Suit; rank: Rank };

export type EventCard = {
  id: string;
  title: string;
  text: string;
};

export type LogEntry = {
  turn: number;
  text: string;
};

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
  turn: number;
  turnLimit: number;
  phase: Phase;
  activePlayerIndex: number;
  /** Keyed by tile label, e.g. "E5". */
  tiles: Record<string, Tile>;
  players: Player[];
  enemies: Enemy[];
  hazards: Hazard[];
  itemPile: Item[];
  eventDeck: EventCard[];
  pokerDeck: Card[];
  log: LogEntry[];
};
