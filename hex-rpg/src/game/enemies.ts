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
  /** Coins it is carrying, as a range, and how many items of gear it drops. */
  purse: [number, number];
  drops: number;
  /** "the Pirates keep their wounds", not "a Pirates keeps its". The log is read aloud. */
  plural?: boolean;
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
    purse: [1, 3],
    drops: 0,
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
    purse: [4, 6],
    drops: 1,
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
    purse: [10, 15],
    drops: 2,
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
    // What a robber pays out is whatever it has stolen, tracked on its hazard record.
    purse: [0, 0],
    drops: 0,
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
    purse: [0, 0],
    drops: 0,
    plural: true,
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

/** "a Bandit", "an Ogre", "the Pirates". */
export const nameWithArticle = (kind: EnemyKind): string => {
  const { name, plural } = ENEMIES[kind];
  if (plural) return `the ${name}`;
  return `${/^[aeiou]/i.test(name) ? "an" : "a"} ${name}`;
};

/** "is beaten" or "are beaten", "keeps its wounds" or "keep their wounds". */
export const verb = (kind: EnemyKind, singular: string, plural: string): string =>
  ENEMIES[kind].plural ? plural : singular;

/** Health an enemy has left. Damage accumulates across fights, so this is what a
 *  player is chipping away at over several turns. */
export const healthLeft = (enemy: Enemy): number =>
  Math.max(0, enemy.maxHealth - enemy.damageTaken);

/** The enemy standing on a tile, if any is still up. */
export const enemyAt = (enemies: Enemy[], label: string): Enemy | undefined =>
  enemies.find((e) => !e.defeated && key(e.hex) === label);

/**
 * The two thieves that are both hazards and enemies. They are placed by
 * `placeHazards`, and `moveHazards` keeps the two records on the same tile.
 */
export const THIEVES: EnemyKind[] = ["robber", "pirates"];

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
    const wanted = ENEMIES[kind].count;
    const preferred = kind === "midboss" ? 3 : 2;
    let placedOfKind = 0;

    // Spread them out if the board allows it, but never place fewer than asked:
    // relax the spacing rather than quietly dropping a monster.
    for (let gap = preferred; gap >= 1 && placedOfKind < wanted; gap--) {
      for (const hex of rng.shuffle(allHexes())) {
        if (placedOfKind === wanted) break;
        if (!free(hex, gap)) continue;
        placed.push(spawn(kind, hex, ++placedOfKind));
      }
    }
  }
  return placed;
}

/** Fightable records for the robber and the pirates, standing where their hazards do. */
export function spawnThieves(hazards: { kind: string; hex: Hex }[]): Enemy[] {
  return THIEVES.flatMap((kind) => {
    const home = hazards.find((h) => h.kind === kind);
    return home ? [spawn(kind, home.hex, 1)] : [];
  });
}
