/**
 * What lives on the board, and where it starts. Rulebook §2, §7 and §10.
 *
 * Health is rolled per enemy inside a band, so no two games have quite the same
 * bandits. Loot counts come straight from §10: a mob drops two items and the winner
 * keeps one, a mid boss drops four and keeps two, the final boss drops six and keeps
 * three. On top of §10's items, every body carries a small `purse` - see the field
 * for why that does not undo §11's "money is scarce".
 *
 * Robbers and pirates are placed as hazards rather than here, but they fight exactly
 * as mid bosses do (§5.5), so their numbers live in this table with the rest.
 */

import { allHexes, distance, key, type Hex } from "./hex";
import { standing } from "./collapse";
import { PALETTE } from "../palette";
import type { Rng } from "./rng";
import type { Enemy, EnemyKind, GameState, Player } from "./types";

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
  /**
   * Chance that a piece this drops is fine (+2) rather than ordinary (+1).
   *
   * This is the progression, so the ordering matters more than the numbers: an
   * ordinary monster never gives one, a mid boss sometimes does, and the dragon
   * usually does. A river chest (`FINE_CHEST_CHANCE`) beats a mid boss, which is what
   * makes going out of your way to the water worth a turn.
   */
  fineChance: number;
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
    count: 6,
    drops: 2,
    picks: 1,
    purse: 1,
    fineChance: 0,
    features: 1,
    colour: PALETTE.mob,
    scale: 0.78,
    glyph: "B",
  },
  midboss: {
    name: "Ogre",
    blurb: "Hits hard. Bring a friend.",
    health: [10, 16],
    count: 2,
    drops: 4,
    picks: 2,
    purse: 2,
    fineChance: 0.3,
    features: 1,
    colour: PALETTE.midboss,
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
    fineChance: 0.5,
    features: 2,
    colour: PALETTE.finalboss,
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
    fineChance: 0,
    // Rulebook §5.5: the thieves draw no feature card.
    features: 0,
    colour: PALETTE.robber,
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
    fineChance: 0.3,
    features: 0,
    colour: PALETTE.pirates,
    scale: 0.95,
    glyph: "P",
    plural: true,
  },
};

/** Enemies never start this close to a player - nobody opens the game in a fight. */
export const SAFE_RADIUS = 2;

/**
 * Tiles that must stay open for every monster placed, or the "safe" ring is not worth
 * what it costs.
 *
 * Two. Below that, placement stops being a scatter and becomes a filling-in: with the
 * fifth player on the board and `SAFE_RADIUS` held at 2 there were 20 legal tiles for
 * 19 monsters, so *every* legal tile got one and all six tiles round the dragon were
 * a wall. That is the opposite of what the scatter is for - if the board is saturated
 * then exploring tells you nothing again, only this time because everywhere is
 * dangerous rather than because everywhere is the same.
 */
const MIN_OPEN_PER_MONSTER = 2;

/**
 * The biggest safe ring this board can afford around the party.
 *
 * Prefers `SAFE_RADIUS` and gives ground only when the party is big enough that
 * keeping it would jam every monster into the middle. At four players it returns 2, as
 * it always has; at five it returns 1, which still means nothing is adjacent at the
 * start and nobody on one move a turn can reach a monster before turn two.
 */
export function safeRadiusFor(players: Player[], monsters: number): number {
  for (let radius = SAFE_RADIUS; radius > 0; radius--) {
    const open = allHexes().filter((h) => players.every((p) => distance(p.hex, h) > radius));
    if (open.length >= monsters * MIN_OPEN_PER_MONSTER) return radius;
  }
  return 0;
}

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
  // The dragon is away for the opening (see `DRAGON_WAKES_ON`); everything else is
  // on the board from the first turn.
  dormant: kind === "finalboss",
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
  enemies.find((e) => !e.defeated && !e.dormant && key(e.hex) === label);

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
/**
 * How many of each monster a party of this size faces.
 *
 * The counts in `ENEMIES` are written for a full table of five. Handing the same
 * nineteen monsters to two children is not a harder game, it is a different one: the
 * sim wiped two-player parties **62%** of the time against 28% at five, because a pair
 * cannot out-damage what they walk into and every failed roll in a group fight costs
 * both of them a health.
 *
 * So the board scales with the party, rounded up and floored at two of each so a small
 * game still has something to find. The dragon is never scaled - it is the whole point
 * of the evening, and a smaller dragon would be a smaller ending.
 */
export function monsterCount(kind: "mob" | "midboss", party: number): number {
  const full = ENEMIES[kind].count;
  const scaled = Math.ceil((full * party) / 5);
  return Math.max(2, Math.min(full, scaled));
}

/**
 * A boss's health, scaled to the party that has to bring it down.
 *
 * §7.4 is explicit that the health bands were worked out against a party rolling
 * together — "the boss maths assumes the four-player group fight in §8". Handing a
 * 20-30 health dragon to two children is not that game: their damage scales with the
 * party and so does their total health, so a fixed band means a pair grind twice as
 * long while bleeding at the same rate. The sim wiped them **62%** of the time.
 *
 * **Half the slope, not the full one.** Scaling health straight down with party size
 * was measured and overshot badly - two players went from 62% wipes to 69% *wins*,
 * because a party's damage is not purely linear in its size (each of them brings a
 * weapon bonus of their own, and the group only has to beat the remaining health once
 * however many are swinging). Meeting the difference halfway is what lands every party
 * size in the same band. The numbers are in the README; re-measure if you touch this.
 *
 * Mobs are left alone: they are meant to be a bump, they already scale in *number*
 * (`monsterCount`), and a 2-health bandit is not a fight.
 *
 * **The dragon is the exception, and takes the full slope and then some.** Half a
 * slope was measured for the ogres and it is right for them; for the dragon it meant
 * that four players who shouted for each other killed the game's ending **in a single
 * round** - a 25-health dragon against four people rolling three dice each is not a
 * fight, it is a formality, and it was reported from the table before the sim ever
 * caught it. `DRAGON_HEALTH_PER_PLAYER` is the number that fixes it: the dragon has
 * that much health for every player at the table, so a full party needs three or four
 * rounds and pays a health each for every round they fall short. Bringing everybody is
 * still right; it is no longer free.
 */
export function bossHealth(kind: EnemyKind, party: number, rng: Rng): number {
  if (kind === "finalboss") {
    return rng.int(...DRAGON_HEALTH_PER_PLAYER) * Math.max(1, party);
  }
  const rolled = rng.int(...ENEMIES[kind].health);
  if (kind !== "midboss") return rolled;
  const full = 5;
  const share = Math.min(party, full) / full;
  return Math.max(4, Math.round(rolled * (0.5 + 0.5 * share)));
}

/**
 * Dragon health per player at the table, rolled once for the whole beast.
 *
 * Three dice average five, and a mid-game player adds a weapon on top, so a fighter is
 * worth roughly six or seven a round: fifteen a head is three rounds against any size
 * of party, which is two failed rolls and two health off everybody who turned up. That
 * is a fight a party can lose and can win, which is what the ending of the evening
 * has to be. `ENEMIES.finalboss.health` is left at its rulebook band and is what a
 * lone hero would have faced.
 */
export const DRAGON_HEALTH_PER_PLAYER: [number, number] = [10, 14];

export function placeEnemies(rng: Rng, players: Player[]): Enemy[] {
  const centre = { q: 0, r: 0 };
  const placed: Enemy[] = [
    spawn("finalboss", centre, 1, bossHealth("finalboss", players.length, rng)),
  ];

  const wanted = {
    midboss: monsterCount("midboss", players.length),
    mob: monsterCount("mob", players.length),
  };
  const radius = safeRadiusFor(players, wanted.midboss + wanted.mob);

  const taken = (h: Hex) => placed.some((e) => e.hex.q === h.q && e.hex.r === h.r);
  const free = (h: Hex) => !taken(h) && players.every((p) => distance(p.hex, h) > radius);

  const open = rng.shuffle(allHexes()).filter(free);
  let next = 0;

  for (const kind of ["midboss", "mob"] as const) {
    for (let n = 0; n < wanted[kind] && next < open.length; n++) {
      placed.push(spawn(kind, open[next++], n + 1, bossHealth(kind, players.length, rng)));
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

/**
 * The turn the dragon comes home.
 *
 * For the opening it is somewhere else: not on the board, not sensed, no smoke, and
 * the middle of the map is an ordinary mountain you can walk over. Five quiet turns
 * exist so the party meets the bandits **first** - the whole progression of this game
 * is that you arrive at the ending carrying what the middle of the game gave you, and
 * a dragon that is findable on turn two lets a lucky party skip that and a hasty one
 * throw the evening away in one roll.
 *
 * It is also the loudest beat in the game when it lands, which is worth having.
 */
export const DRAGON_WAKES_ON = 6;


/**
 * How likely a fresh bandit is to wander in at the top of a turn, and it climbs.
 *
 * The board is laid out once and then only ever empties: by the back half the party
 * has beaten what it found, searched what it walked over, and is spending turns
 * walking. Monsters arriving - more of them the longer it goes on - is what keeps the
 * late game worth a turn, and it is the other half of the dragon sleeping in: there
 * has to be something to fight in the meantime, and it has to keep coming.
 *
 * Only bandits. An ogre wandering in would be a boss appearing out of nowhere, which
 * is a different and much less fair thing.
 */
export const mobArrivalChance = (turn: number, turnLimit: number): number =>
  0.15 + 0.5 * Math.min(1, turn / Math.max(1, turnLimit));

/**
 * Maybe put one more bandit on the board, somewhere nobody is looking.
 *
 * Never next to anybody - a monster appearing on the tile you are standing on is not
 * an ambush, it is the game hitting you - and never on ground that has already fallen.
 */
export function wanderIn(state: GameState, rng: Rng): GameState {
  if (rng.next() >= mobArrivalChance(state.turn, state.turnLimit)) return state;

  const busy = new Set(state.enemies.filter((e) => !e.defeated).map((e) => key(e.hex)));
  const room = allHexes().filter(
    (h) =>
      standing(state, h) &&
      !busy.has(key(h)) &&
      state.players.every((p) => p.dead || distance(p.hex, h) > 1),
  );
  if (room.length === 0) return state;

  // Named by the turn they turned up on, not by how many are standing. Counting the
  // living would hand a fresh bandit the id of one the rim swallowed, and two enemies
  // with one id is a fight that picks the wrong monster.
  const mob = {
    ...spawn("mob", rng.pick(room), 0, rng.int(...ENEMIES.mob.health)),
    id: `mob-turn${state.turn}`,
  };
  return {
    ...state,
    enemies: [...state.enemies, mob],
    log: [
      ...state.log,
      { turn: state.turn, text: "Somebody else is out there. You can hear them moving." },
    ],
  };
}
