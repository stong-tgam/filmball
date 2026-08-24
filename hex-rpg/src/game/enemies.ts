/**
 * What lives on the board, and where it starts.
 *
 * PLACEHOLDER STATS, like the roles: the rulebook sets these and it is missing. They
 * are tuned so a fight reads clearly to a child rather than for balance - a mob is
 * two good rolls, a mid boss is a real scrap you might walk away from, and the final
 * boss cannot be beaten bare-handed, which is what the spec says it should be.
 *
 * Robbers and pirates are hazards, not placed enemies; they arrive in v0.6.
 */

import { allHexes, distance, key, type Hex } from "./hex";
import type { Rng } from "./rng";
import type { Enemy, EnemyKind, Player } from "./types";

export type EnemyProfile = {
  name: string;
  /** What a child should understand about it in one line. */
  blurb: string;
  maxHealth: number;
  /** Added to the enemy's die when it hits back. */
  attack: number;
  /** How many go on the board at setup. */
  count: number;
  colour: string;
  /** Drawn bigger the nastier it is. */
  scale: number;
  /** What the token says. A letter, unless something else reads faster. */
  glyph: string;
};

export const ENEMIES: Record<EnemyKind, EnemyProfile> = {
  mob: {
    name: "Bandit",
    blurb: "Trouble, but not much of it.",
    maxHealth: 6,
    attack: 0,
    count: 6,
    colour: "#e8734a",
    scale: 0.8,
    glyph: "B",
  },
  midboss: {
    name: "Ogre",
    blurb: "Hits hard. Bring a friend.",
    maxHealth: 12,
    attack: 1,
    count: 2,
    colour: "#c9436b",
    scale: 1,
    glyph: "O",
  },
  finalboss: {
    name: "Dragon",
    blurb: "Nobody beats this with bare hands.",
    maxHealth: 20,
    attack: 2,
    count: 1,
    colour: "#a03bd6",
    scale: 1.25,
    // A star, not a D: the doctor's token is already a D, and two of those on one
    // board is exactly the kind of thing that starts an argument.
    glyph: "★",
  },
  robber: {
    name: "Robber",
    blurb: "Takes your money and runs.",
    maxHealth: 4,
    attack: 0,
    count: 0,
    colour: "#b0894a",
    scale: 0.75,
    glyph: "R",
  },
  pirates: {
    name: "Pirates",
    blurb: "River thieves.",
    maxHealth: 8,
    attack: 1,
    count: 0,
    colour: "#4a90b0",
    scale: 0.9,
    glyph: "P",
  },
};

/** Enemies never start this close to a player - nobody opens the game in a fight. */
export const SAFE_RADIUS = 2;

const spawn = (kind: EnemyKind, hex: Hex, n: number): Enemy => ({
  id: `${kind}-${n}`,
  kind,
  hex,
  maxHealth: ENEMIES[kind].maxHealth,
  damageTaken: 0,
  features: [],
  featuresRevealed: false,
  escapedOnce: false,
  loot: [],
  defeated: false,
});

/** Health an enemy has left. Damage accumulates across fights, so this is what a
 *  player is chipping away at over several turns. */
export const healthLeft = (enemy: Enemy): number =>
  Math.max(0, enemy.maxHealth - enemy.damageTaken);

/** The enemy standing on a tile, if any is still up. */
export const enemyAt = (enemies: Enemy[], label: string): Enemy | undefined =>
  enemies.find((e) => !e.defeated && key(e.hex) === label);

/**
 * Populate the board.
 *
 * The dragon takes the middle, which gives the map a destination. Everything else is
 * scattered, kept clear of where the party starts and spread out enough that no
 * single tile is a gauntlet.
 */
export function placeEnemies(rng: Rng, players: Player[]): Enemy[] {
  const centre = { q: 0, r: 0 };
  const placed: Enemy[] = [spawn("finalboss", centre, 1)];

  const free = (h: Hex, gap: number) =>
    players.every((p) => distance(p.hex, h) > SAFE_RADIUS) &&
    placed.every((e) => distance(e.hex, h) >= gap);

  for (const kind of ["midboss", "mob"] as const) {
    const gap = kind === "midboss" ? 3 : 2;
    let n = 0;
    for (const hex of rng.shuffle(allHexes())) {
      if (n === ENEMIES[kind].count) break;
      if (!free(hex, gap)) continue;
      placed.push(spawn(kind, hex, ++n));
    }
  }
  return placed;
}
