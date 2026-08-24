/**
 * What lives on the board, and where it starts. Rulebook §2, §7 and §10.
 *
 * Health is rolled per enemy inside a band, so no two games have quite the same
 * bandits. Loot counts come straight from §10: a mob drops two items and the winner
 * keeps one, a mid boss drops four and keeps two, the final boss drops six and keeps
 * three. Nothing drops money - money comes from selling what you do not need, which
 * is what makes §11's "money is scarce" true.
 *
 * Robbers and pirates are placed as hazards rather than here, but they fight exactly
 * as mid bosses do (§5.5), so their numbers live in this table with the rest.
 */

import { allHexes, distance, key, type Hex } from "./hex";
import type { Rng } from "./rng";
import type { Enemy, EnemyKind, Player } from "./types";

export type EnemyProfile = {
  name: string;
  /** What a child should understand about it in one line. */
  blurb: string;
  /** Health is rolled in this band when the board is laid out. */
  health: [number, number];
  /** How many go on the board at setup. */
  count: number;
  /** Rulebook §10: items dropped, and how many of them the winner keeps. */
  drops: number;
  picks: number;
  /**
   * Coins on the body.
   *
   * Rulebook §10 says loot is items only and money comes from selling, and that rule
   * exists to make "keep it or sell it?" a real decision. These amounts are small
   * enough to leave that decision intact - a piece of gear is still worth more sold
   * than a mob is worth killing - and large enough that a child who fights a lot is
   * not permanently poorer than one who shops.
   */
  purse: number;
  /** Rulebook §9: how many feature cards it draws. */
  features: number;
  colour: string;
  /** Drawn bigger the nastier it is. */
  scale: number;
  /** What the token says. A letter, unless something else reads faster. */
  glyph: string;
  /** "the Pirates keep their wounds", not "a Pirates keeps its". The log is read aloud. */
  plural?: boolean;
};

export const ENEMIES: Record<EnemyKind, EnemyProfile> = {
  mob: {
    name: "Bandit",
    blurb: "Trouble, but not much of it.",
    health: [4, 8],
    count: 15,
    drops: 2,
    picks: 1,
    purse: 1,
    features: 1,
    colour: "#e8734a",
    scale: 0.78,
    glyph: "B",
  },
  midboss: {
    name: "Ogre",
    blurb: "Hits hard. Bring a friend.",
    health: [10, 16],
    count: 4,
    drops: 4,
    picks: 2,
    purse: 2,
    features: 1,
    colour: "#c9436b",
    scale: 1,
    glyph: "O",
  },
  finalboss: {
    name: "Dragon",
    blurb: "Beat this one and the game is won.",
    health: [20, 30],
    count: 1,
    drops: 6,
    picks: 3,
    purse: 5,
    features: 2,
    colour: "#a03bd6",
    scale: 1.3,
    // A star, not a D: the doctor's token is already a D, and two of those on one
    // board is exactly the kind of thing that starts an argument.
    glyph: "★",
  },
  robber: {
    name: "Robber",
    blurb: "Fights like an ogre. Beat him and he drops everything he has taken.",
    health: [10, 16],
    count: 0,
    drops: 2,
    picks: 2,
    purse: 2,
    // Rulebook §5.5: the thieves draw no feature card.
    features: 0,
    colour: "#b0894a",
    scale: 0.9,
    glyph: "R",
  },
  pirates: {
    name: "Pirates",
    blurb: "River thieves. They take your gear as well as your money.",
    health: [10, 16],
    count: 0,
    drops: 2,
    picks: 2,
    purse: 3,
    features: 0,
    colour: "#4a90b0",
    scale: 0.95,
    glyph: "P",
    plural: true,
  },
};

/** Enemies never start this close to a player - nobody opens the game in a fight. */
export const SAFE_RADIUS = 2;

/**
 * The two thieves that are both hazards and enemies. They are placed by
 * `placeHazards`, and `moveHazards` keeps the two records on the same tile.
 */
export const THIEVES: EnemyKind[] = ["robber", "pirates"];

const spawn = (kind: EnemyKind, hex: Hex, n: number, health: number): Enemy => ({
  id: `${kind}-${n}`,
  kind,
  hex,
  maxHealth: health,
  damageTaken: 0,
  features: [],
  featuresRevealed: false,
  escapedOnce: false,
  loot: [],
  // Thieves are hazards too, and hazards are never hidden.
  found: kind === "robber" || kind === "pirates",
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

/** Health an enemy has left. Damage accumulates across fights (§7), so this is what a
 *  party is chipping away at over several turns. */
export const healthLeft = (enemy: Enemy): number =>
  Math.max(0, enemy.maxHealth - enemy.damageTaken);

/** The enemy standing on a tile, if any is still up. */
export const enemyAt = (enemies: Enemy[], label: string): Enemy | undefined =>
  enemies.find((e) => !e.defeated && key(e.hex) === label);

/**
 * Populate the board.
 *
 * The dragon takes the middle, which gives the map a destination. Everything else is
 * scattered, kept clear of where the party starts and spread out where the board
 * allows - with fifteen bandits on sixty-one tiles it often will not, so the spacing
 * relaxes rather than dropping a monster.
 */
/**
 * Scatter the monsters at random.
 *
 * They used to be spread out on purpose, which made sense when you could see them
 * coming: an even sprinkle is a fair board. Now that they are hidden, an even sprinkle
 * is the wrong shape - it makes every tile equally likely to hold something, so
 * exploring tells you nothing and there is no such thing as a lucky corner or a bad
 * one. Pure random placement gives the board clumps and empty runs, and finding the
 * empty runs is what the party's notes are for.
 *
 * The only rule kept is `SAFE_RADIUS` around the starting corners, so nobody walks
 * into a mid boss on turn one before they own anything.
 */
export function placeEnemies(rng: Rng, players: Player[]): Enemy[] {
  const centre = { q: 0, r: 0 };
  const placed: Enemy[] = [
    spawn("finalboss", centre, 1, rng.int(...ENEMIES.finalboss.health)),
  ];

  const taken = (h: Hex) => placed.some((e) => e.hex.q === h.q && e.hex.r === h.r);
  const free = (h: Hex) =>
    !taken(h) && players.every((p) => distance(p.hex, h) > SAFE_RADIUS);

  const open = rng.shuffle(allHexes()).filter(free);
  let next = 0;

  for (const kind of ["midboss", "mob"] as const) {
    for (let n = 0; n < ENEMIES[kind].count && next < open.length; n++) {
      placed.push(spawn(kind, open[next++], n + 1, rng.int(...ENEMIES[kind].health)));
    }
  }
  return placed;
}


/** Fightable records for the robber and the pirates, standing where their hazards do. */
export function spawnThieves(rng: Rng, hazards: { kind: string; hex: Hex }[]): Enemy[] {
  return THIEVES.flatMap((kind) => {
    const home = hazards.find((h) => h.kind === kind);
    return home ? [spawn(kind, home.hex, 1, rng.int(...ENEMIES[kind].health))] : [];
  });
}
