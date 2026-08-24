import { describe, expect, it } from "vitest";
import {
  CITY_COUNT,
  CITY_MIN_DISTANCE,
  MAX_SHARED_RIVER_RAIL,
  TILE_COUNT,
  countTerrain,
  createInitialState,
  generateBoard,
} from "../src/game/setup";
import { allHexes, distance, hexLine, key, label, neighbours, type Hex } from "../src/game/hex";
import { makeRng } from "../src/game/rng";

const SEEDS = [1, 7, 42, 4471, 90210, 0xdecafbad];
const boards = SEEDS.map((s) => ({ seed: s, tiles: generateBoard(s) }));

describe("generateBoard", () => {
  it("produces one tile per board hex, keyed by label", () => {
    for (const { tiles } of boards) {
      expect(Object.keys(tiles)).toHaveLength(TILE_COUNT);
      for (const h of allHexes()) {
        const tile = tiles[label(h)];
        expect(tile).toBeDefined();
        expect(tile.hex).toEqual(h);
      }
    }
  });

  it("is deterministic in the seed", () => {
    for (const seed of SEEDS) {
      expect(generateBoard(seed)).toEqual(generateBoard(seed));
    }
  });

  it("gives different seeds different boards", () => {
    const shapes = boards.map(({ tiles }) =>
      Object.values(tiles).map((t) => `${t.base}${+t.river}${+t.rail}`).join(""),
    );
    expect(new Set(shapes).size).toBe(shapes.length);
  });

  it("starts every tile undamaged", () => {
    for (const { tiles } of boards) {
      for (const tile of Object.values(tiles)) expect(tile.destroyedUntil).toBeNull();
    }
  });

  it("places exactly the intended number of cities", () => {
    for (const { tiles } of boards) {
      expect(countTerrain(tiles).city).toBe(CITY_COUNT);
    }
  });

  it("keeps cities apart, so no two are adjacent", () => {
    for (const { tiles } of boards) {
      const cities = Object.values(tiles).filter((t) => t.base === "city");
      for (const a of cities) {
        for (const b of cities) {
          if (a === b) continue;
          expect(distance(a.hex, b.hex)).toBeGreaterThanOrEqual(CITY_MIN_DISTANCE);
        }
      }
    }
  });

  it("has all three terrains on every board, with fields still the majority use", () => {
    for (const { tiles } of boards) {
      const counts = countTerrain(tiles);
      expect(counts.field).toBeGreaterThan(0);
      expect(counts.forest).toBeGreaterThan(0);
      expect(counts.city).toBeGreaterThan(0);
      expect(counts.field + counts.forest + counts.city).toBe(TILE_COUNT);
      expect(counts.forest).toBeLessThan(counts.field);
    }
  });

  it("grows forest in clumps rather than scattering it", () => {
    for (const { tiles } of boards) {
      const forest = Object.values(tiles).filter((t) => t.base === "forest");
      const isForest = (h: Hex) => tiles[key(h)]?.base === "forest";
      const lonely = forest.filter((t) => !neighbours(t.hex).some(isForest));
      expect(lonely.length).toBeLessThanOrEqual(1);
    }
  });

  it("carves a connected river that crosses the board", () => {
    for (const { seed, tiles } of boards) {
      const river = Object.values(tiles).filter((t) => t.river);
      expect(river.length, `seed ${seed}`).toBeGreaterThanOrEqual(5);
      expect(connected(tiles, (t) => t.river), `seed ${seed}`).toBe(true);
      // It runs from one rim to another, not in a puddle in the middle.
      const onRim = river.filter((t) => distance(t.hex, { q: 0, r: 0 }) === 4);
      expect(onRim.length, `seed ${seed}`).toBeGreaterThanOrEqual(2);
    }
  });

  it("bends the river instead of ruling it straight across", () => {
    for (const { seed, tiles } of boards) {
      const river = Object.values(tiles).filter((t) => t.river);
      // The two ends of the river are its most distant pair of tiles.
      let ends: [Hex, Hex] = [river[0].hex, river[0].hex];
      let longest = -1;
      for (const a of river) {
        for (const b of river) {
          if (distance(a.hex, b.hex) > longest) {
            longest = distance(a.hex, b.hex);
            ends = [a.hex, b.hex];
          }
        }
      }
      const straight = new Set(hexLine(ends[0], ends[1]).map(label));
      const offLine = river.filter((t) => !straight.has(label(t.hex)));
      expect(offLine.length, `seed ${seed} - river runs dead straight`).toBeGreaterThan(0);
    }
  });

  it("lays a straight railway from rim to rim", () => {
    for (const { seed, tiles } of boards) {
      const rail = Object.values(tiles).filter((t) => t.rail);
      // A straight edge-to-edge line on a radius-4 board is 5 to 9 tiles.
      expect(rail.length, `seed ${seed}`).toBeGreaterThanOrEqual(5);
      expect(rail.length, `seed ${seed}`).toBeLessThanOrEqual(9);
      expect(connected(tiles, (t) => t.rail), `seed ${seed}`).toBe(true);
      // Straight means every interior tile has exactly two rail neighbours.
      for (const t of rail) {
        const n = neighbours(t.hex).filter((h) => tiles[key(h)].rail).length;
        expect(n, `seed ${seed} at ${label(t.hex)}`).toBeLessThanOrEqual(2);
      }
    }
  });

  it("crosses the railway over the river rather than running alongside it", () => {
    for (const { seed, tiles } of boards) {
      const shared = Object.values(tiles).filter((t) => t.rail && t.river);
      expect(shared.length, `seed ${seed}`).toBeLessThanOrEqual(MAX_SHARED_RIVER_RAIL);
    }
  });

  it("never builds a city on the river", () => {
    for (const { tiles } of boards) {
      for (const tile of Object.values(tiles)) {
        expect(tile.base === "city" && tile.river).toBe(false);
      }
    }
  });
});

describe("createInitialState", () => {
  it("opens a game on the board with nothing placed yet", () => {
    const state = createInitialState(4471);
    expect(state.seed).toBe(4471);
    expect(state.turn).toBe(1);
    expect(state.phase).toBe("setup");
    expect(Object.keys(state.tiles)).toHaveLength(TILE_COUNT);
    expect(state.players).toEqual([]);
    expect(state.enemies).toEqual([]);
    expect(state.hazards).toEqual([]);
    expect(state.log).toHaveLength(1);
  });

  it("survives a round trip through JSON, so autosave and undo stay possible", () => {
    const state = createInitialState(99);
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });
});

describe("rng", () => {
  it("repeats exactly for the same seed and differs across seeds", () => {
    const draw = (seed: number) => Array.from({ length: 8 }, () => makeRng(seed).next());
    expect(draw(5)).toEqual(draw(5));
    expect(makeRng(5).next()).not.toBe(makeRng(6).next());
  });

  it("keeps int() inside its bounds and hits both ends", () => {
    const rng = makeRng(123);
    const rolls = Array.from({ length: 500 }, () => rng.int(1, 3));
    expect(Math.min(...rolls)).toBe(1);
    expect(Math.max(...rolls)).toBe(3);
  });

  it("shuffles without losing or duplicating anything", () => {
    const source = Array.from({ length: 52 }, (_, i) => i);
    const shuffled = makeRng(7).shuffle(source);
    expect(shuffled).not.toEqual(source);
    expect([...shuffled].sort((a, b) => a - b)).toEqual(source);
  });
});

/** True when every tile matching `pick` is reachable from the first via matching tiles. */
function connected(
  tiles: Record<string, ReturnType<typeof generateBoard>[string]>,
  pick: (t: (typeof tiles)[string]) => boolean,
): boolean {
  const matching = Object.values(tiles).filter(pick);
  if (matching.length === 0) return false;
  const seen = new Set([label(matching[0].hex)]);
  const queue = [matching[0].hex];
  while (queue.length) {
    for (const n of neighbours(queue.pop()!)) {
      const t = tiles[key(n)];
      if (pick(t) && !seen.has(key(n))) {
        seen.add(key(n));
        queue.push(n);
      }
    }
  }
  return seen.size === matching.length;
}
