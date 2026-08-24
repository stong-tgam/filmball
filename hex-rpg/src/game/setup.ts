/**
 * Board generation.
 *
 * Everything here is a pure function of the seed: the same seed always produces the
 * same 61 tiles. Terrain is not sprinkled at random per tile - a river snakes across
 * the board, a railway runs straight through it, cities sit apart from one another,
 * and forests grow in clumps. A board that reads like a place is easier to talk
 * about at the table ("meet me at the bridge on D3") than a field of confetti.
 */

import {
  DIRS,
  RADIUS,
  add,
  allHexes,
  distance,
  edgeHexes,
  hexLine,
  inBoard,
  key,
  neighbours,
  type Hex,
} from "./hex";
import { makeRng, type Rng } from "./rng";
import { createPlayers } from "./players";
import { placeEnemies } from "./enemies";
import { createItemPile } from "./items";
import { MAX_ELEMENTS, type Element, type GameState, type Tile } from "./types";

export const CITY_COUNT = 5;
/** Cities must be this far apart, so no two are a single step from each other. */
export const CITY_MIN_DISTANCE = 3;
export const FOREST_CLUSTERS = 7;
/** Woods are seeded this far apart, so they spread over the board instead of massing
 *  in one corner and leaving whole rows as empty grass. */
export const FOREST_MIN_DISTANCE = 3;
export const DEFAULT_TURN_LIMIT = 25;

type Draft = Map<string, Tile>;

const blankBoard = (): Draft =>
  new Map(
    allHexes().map((hex) => [
      key(hex),
      {
        hex,
        base: "field",
        sides: Array<Element>(6).fill("field"),
        river: false,
        rail: false,
        destroyedUntil: null,
        searched: false,
      },
    ]),
  );

const at = (board: Draft, h: Hex): Tile => board.get(key(h))!;

/** Roughly the far side of the board from `h`. */
const opposite = (h: Hex): Hex => ({ q: -h.q, r: -h.r });

/** Extra tiles spent by going from `from` to `to` by way of `via`. */
const detour = (from: Hex, via: Hex, to: Hex): number =>
  distance(from, via) + distance(via, to) - distance(from, to);

/**
 * A river from one edge of the board to the far edge.
 *
 * Drawn as two or three straight reaches between bend points, not as a step-by-step
 * wander: a walk free to turn on every tile comes out as sawtooth teeth rather than
 * meanders. Each bend is pulled off the direct line so the river never rules straight
 * across the board, and the bends share a detour budget so it never folds back on
 * itself either.
 */
function carveRiver(board: Draft, rng: Rng): void {
  const edges = edgeHexes();
  const start = rng.pick(edges);
  const goal = opposite(start);
  const target = rng.pick(edges.filter((h) => distance(h, goal) <= 2));
  const direct = hexLine(start, target);

  /** Total extra tiles the river may spend on bends, over the direct distance. */
  const MAX_DETOUR = 3;

  const onDirectLine = new Set(direct.map(key));
  const bendCount = rng.int(1, 2);
  const route: Hex[] = [start];
  let budget = MAX_DETOUR;

  for (let i = 1; i <= bendCount; i++) {
    const anchor = direct[Math.round((direct.length - 1) * (i / (bendCount + 1)))];
    const from = route[route.length - 1];
    // One tile off the line, never two: a wider offset near an end of the river
    // turns the reach into a spike rather than a bend.
    const options = DIRS.map((d) => ({ q: anchor.q + d.q, r: anchor.r + d.r })).filter(
      (h) =>
        inBoard(h) &&
        // A bend that lands back on the direct line is not a bend - without this the
        // river comes out as a canal ruled straight across the board.
        !onDirectLine.has(key(h)) &&
        // Spending the detour budget against the previous bend, not against the
        // source, is what stops two bends folding the river into a V.
        detour(from, h, target) <= budget,
    );
    if (options.length === 0) continue;
    const bend = rng.pick(options);
    budget -= detour(from, bend, target);
    route.push(bend);
  }
  route.push(target);

  for (let i = 1; i < route.length; i++) {
    for (const h of hexLine(route[i - 1], route[i])) at(board, h).river = true;
  }
}

/** At most this many tiles may carry both the railway and the river - a bridge. */
export const MAX_SHARED_RIVER_RAIL = 2;

/**
 * A railway, dead straight from rim to rim.
 *
 * Lines that run along the river instead of across it are rejected: two features
 * sharing a corridor for half the board is hard to read and wastes the tiles that
 * a crossing would make interesting.
 */
function layRailway(board: Draft, rng: Rng): void {
  const edges = edgeHexes();
  let best: Hex[] = [];
  for (let attempt = 0; attempt < 12; attempt++) {
    const start = rng.pick(edges);
    const line = hexLine(start, opposite(start));
    const shared = line.filter((h) => at(board, h).river).length;
    if (shared <= MAX_SHARED_RIVER_RAIL) {
      best = line;
      break;
    }
    if (best.length === 0) best = line;
  }
  for (const h of best) at(board, h).rail = true;
}

/**
 * Cities, spaced out. Tiles on the railway are preferred - a town grows where the
 * trains stop - but the spacing rule wins if the two disagree.
 */
function placeCities(board: Draft, rng: Rng): Hex[] {
  const candidates = rng
    .shuffle(allHexes())
    .filter((h) => !at(board, h).river)
    .sort((a, b) => Number(at(board, b).rail) - Number(at(board, a).rail));

  const placed: Hex[] = [];
  for (const h of candidates) {
    if (placed.length === CITY_COUNT) break;
    if (placed.some((c) => distance(c, h) < CITY_MIN_DISTANCE)) continue;
    at(board, h).base = "city";
    placed.push(h);
  }
  return placed;
}

/** Forests grow in clumps from a handful of seed tiles, spread across the board. */
function growForests(board: Draft, rng: Rng): void {
  const open = (h: Hex) => at(board, h).base === "field";

  const seeds: Hex[] = [];
  for (const h of rng.shuffle(allHexes().filter(open))) {
    if (seeds.length === FOREST_CLUSTERS) break;
    if (seeds.some((s) => distance(s, h) < FOREST_MIN_DISTANCE)) continue;
    seeds.push(h);
  }

  for (const seed of seeds) {
    const size = rng.int(2, 4);
    let frontier = [seed];
    const clump = new Set<string>();
    while (frontier.length && clump.size < size) {
      const h = frontier.splice(rng.int(0, frontier.length - 1), 1)[0];
      if (!open(h) || clump.has(key(h))) continue;
      at(board, h).base = "forest";
      clump.add(key(h));
      frontier.push(...neighbours(h).filter(open));
    }
  }
}

/**
 * How often a neighbour's terrain creeps across the side the two tiles share.
 *
 * This is what turns a board of flat single-terrain tiles into a landscape: a field
 * beside a wood carries trees along that edge, a field beside a city carries the
 * edge of town. Terrain stops being a property of a tile and becomes something that
 * fades from one into the next.
 */
export const BLEED_CHANCE = 0.45;

/** A tile keeps at least this many sides of its own terrain, water permitting. */
export const MIN_BASE_SIDES = 2;

/** Every element the tile holds, in side order, without repeats. */
export const elementsOf = (tile: Tile): Element[] => [...new Set(tile.sides)];

const countSides = (sides: Element[], element: Element): number =>
  sides.filter((s) => s === element).length;

/**
 * Compose each tile out of its elements.
 *
 * Runs last, over a board whose terrain, river and railway are already decided: it
 * reads the macro layout and works out what each individual tile is made of. Water
 * takes the sides the river actually flows through, so a river tile points at its
 * upstream and downstream neighbours; the rest of the tile is its own terrain, with
 * neighbouring terrain bleeding across shared sides.
 */
function composeSides(board: Draft, rng: Rng): void {
  for (const tile of board.values()) {
    const sides = Array<Element>(6).fill(tile.base);

    if (tile.river) {
      const flows = DIRS.map((d, i) => [i, add(tile.hex, d)] as const)
        .filter(([, n]) => inBoard(n) && at(board, n).river)
        .map(([i]) => i);
      // A river reaching the rim carries on off the map rather than stopping dead.
      if (flows.length === 1 && !inBoard(add(tile.hex, DIRS[(flows[0] + 3) % 6]))) {
        flows.push((flows[0] + 3) % 6);
      }
      for (const i of flows) sides[i] = "water";
    }

    DIRS.forEach((d, i) => {
      if (sides[i] === "water") return;
      const n = add(tile.hex, d);
      if (!inBoard(n)) return;
      const neighbourTerrain = at(board, n).base;
      if (neighbourTerrain !== tile.base && rng.chance(BLEED_CHANCE)) {
        sides[i] = neighbourTerrain;
      }
    });

    // Bleeding from several directions at once can push a tile past the element cap,
    // or crowd its own terrain out entirely. Give the rarest borrowed element back
    // to the tile until neither is true.
    const borrowed = () =>
      elementsOf({ ...tile, sides }).filter((e) => e !== "water" && e !== tile.base);

    const reclaim = () => {
      const rarest = borrowed().sort(
        (a, b) => countSides(sides, a) - countSides(sides, b),
      )[0];
      if (rarest === undefined) return false;
      sides.forEach((s, i) => {
        if (s === rarest) sides[i] = tile.base;
      });
      return true;
    };

    while (elementsOf({ ...tile, sides }).length > MAX_ELEMENTS && reclaim()) {
      // reclaim() does the work; the guard stops it looping when nothing is borrowed.
    }
    while (countSides(sides, tile.base) < MIN_BASE_SIDES && reclaim()) {
      // Same, for a tile that has bled away almost all of its own terrain.
    }

    tile.sides = sides;
  }
}

/** The 61 tiles of the board, keyed by label. Deterministic in `seed`. */
export function generateBoard(seed: number): Record<string, Tile> {
  const rng = makeRng(seed);
  const board = blankBoard();

  carveRiver(board, rng);
  layRailway(board, rng);
  placeCities(board, rng);
  growForests(board, rng);
  composeSides(board, rng);

  return Object.fromEntries(board);
}

/**
 * A new game: the board, the party on its corners, and the enemies scattered over
 * it. Hazards, items and events arrive in later phases, and the phases they belong
 * to are already named in `Phase`.
 */
export function createInitialState(seed: number): GameState {
  // A second generator, so adding a draw here can never shift the board a seed
  // produces. Board and party stay independently reproducible.
  const rng = makeRng(seed ^ 0x9e3779b9);

  const players = createPlayers(rng);

  return {
    seed,
    rngState: rng.state(),
    turn: 1,
    turnLimit: DEFAULT_TURN_LIMIT,
    phase: "playerMove",
    activePlayerIndex: 0,
    tiles: generateBoard(seed),
    players,
    enemies: placeEnemies(rng, players),
    hazards: [],
    combat: null,
    itemPile: createItemPile(rng),
    eventDeck: [],
    pokerDeck: [],
    log: [
      { turn: 1, text: `New game, seed ${seed}.` },
      { turn: 1, text: "— Turn 1 —" },
    ],
  };
}

/** Handy for tests and for the UI's board summary. */
export function countTerrain(tiles: Record<string, Tile>) {
  const counts = { field: 0, forest: 0, city: 0, river: 0, rail: 0 };
  for (const tile of Object.values(tiles)) {
    counts[tile.base]++;
    if (tile.river) counts.river++;
    if (tile.rail) counts.rail++;
  }
  return counts;
}

export const TILE_COUNT = 3 * RADIUS * (RADIUS + 1) + 1;
