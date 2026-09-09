import { describe, expect, it } from "vitest";
import {
  DIRS,
  RADIUS,
  allHexes,
  allNeighbours,
  distance,
  edgeHexes,
  findPath,
  fromLabel,
  hexLine,
  hexToPixel,
  hexesInRange,
  inBoard,
  label,
  neighbours,
  reachable,
  type Hex,
} from "../src/game/hex";

const CENTRE: Hex = { q: 0, r: 0 };

/** The row letters this board actually uses. A literal here is a radius-4 fact. */
const ROW_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".slice(0, RADIUS * 2 + 1);

describe("board shape", () => {
  it("holds a whole hexagon of tiles for whatever radius it is set to", () => {
    // 1 + 3r(r+1): 37 at radius 3, 61 at radius 4. Written as the formula rather than
    // the number, because the board shrank in v0.22 and will likely be tuned again.
    expect(allHexes()).toHaveLength(1 + 3 * RADIUS * (RADIUS + 1));
  });

  it("is a hexagon - every tile is within RADIUS of the centre", () => {
    for (const h of allHexes()) expect(distance(h, CENTRE)).toBeLessThanOrEqual(RADIUS);
  });

  it("excludes everything past the rim", () => {
    expect(inBoard({ q: RADIUS + 1, r: 0 })).toBe(false);
    expect(inBoard({ q: RADIUS, r: 1 })).toBe(false); // q+r past the rim
    expect(inBoard({ q: RADIUS, r: -RADIUS })).toBe(true); // a corner
  });

  it("has a full rim, six tiles per ring-step", () => {
    expect(edgeHexes()).toHaveLength(6 * RADIUS);
    // A side runs corner to corner: rim / 6 sides, plus the corner each one shares.
    expect(edgeHexes().length / 6 + 1).toBe(RADIUS + 1);
  });

  it("contains no duplicate tiles", () => {
    const keys = allHexes().map(label);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("neighbours", () => {
  it("gives the centre six", () => {
    expect(neighbours(CENTRE)).toHaveLength(6);
  });

  it("clips at the rim - a corner has three, an edge tile four", () => {
    expect(neighbours({ q: RADIUS, r: -RADIUS })).toHaveLength(3);
    expect(neighbours({ q: RADIUS, r: -RADIUS + 2 })).toHaveLength(4);
  });

  it("is symmetric: if b neighbours a, a neighbours b", () => {
    for (const a of allHexes()) {
      for (const b of neighbours(a)) {
        expect(neighbours(b).some((n) => n.q === a.q && n.r === a.r)).toBe(true);
      }
    }
  });

  it("puts every neighbour exactly one step away", () => {
    for (const a of allHexes()) {
      for (const b of allNeighbours(a)) expect(distance(a, b)).toBe(1);
    }
  });

  it("has six distinct directions that cancel in opposite pairs", () => {
    expect(new Set(DIRS.map((d) => `${d.q},${d.r}`)).size).toBe(6);
    for (let i = 0; i < 3; i++) {
      expect(DIRS[i].q + DIRS[i + 3].q).toBe(0);
      expect(DIRS[i].r + DIRS[i + 3].r).toBe(0);
    }
  });
});

describe("distance", () => {
  it("is zero to itself and symmetric", () => {
    const a = { q: 2, r: -3 };
    const b = { q: -1, r: 1 };
    expect(distance(a, a)).toBe(0);
    expect(distance(a, b)).toBe(distance(b, a));
  });

  it("reaches 8 across the full width of the board", () => {
    expect(distance({ q: -4, r: 0 }, { q: 4, r: 0 })).toBe(8);
  });

  it("obeys the triangle inequality", () => {
    const tiles = allHexes();
    for (const a of tiles) {
      for (const b of tiles) {
        expect(distance(a, b)).toBeLessThanOrEqual(distance(a, CENTRE) + distance(CENTRE, b));
      }
    }
  });

  it("agrees with a step count found by search", () => {
    const steps = reachable(CENTRE, 8);
    for (const h of allHexes()) expect(steps.get(label(h))).toBe(distance(CENTRE, h));
  });
});

describe("labels", () => {
  it("names the corners and centre the way the table does", () => {
    // Rows run A..? from the top, numbered from 1 across each row. All derived from
    // `RADIUS`, so shrinking the board does not quietly turn this into a test of
    // whatever the labels happen to be today.
    const rows = ROW_LETTERS;
    const top = rows[0];
    const middle = rows[RADIUS];
    const bottom = rows[RADIUS * 2];

    expect(label({ q: 0, r: -RADIUS })).toBe(`${top}1`);
    expect(label({ q: RADIUS, r: -RADIUS })).toBe(`${top}${RADIUS + 1}`);
    expect(label({ q: 0, r: 0 })).toBe(`${middle}${RADIUS + 1}`);
    expect(label({ q: -RADIUS, r: RADIUS })).toBe(`${bottom}1`);
  });

  it("numbers each row from 1 with the right row widths", () => {
    // Widest in the middle, narrowing by one to each rim: RADIUS+1 .. 2*RADIUS+1 .. RADIUS+1.
    const rows = ROW_LETTERS.split("");
    const widths = rows.map((row) => allHexes().filter((h) => label(h)[0] === row).length);
    const expected = rows.map((_, i) => RADIUS + 1 + (i <= RADIUS ? i : RADIUS * 2 - i));
    expect(widths).toEqual(expected);
  });

  it("round-trips through fromLabel for every tile", () => {
    for (const h of allHexes()) expect(fromLabel(label(h))).toEqual(h);
  });

  it("rejects labels that are off the board or malformed", () => {
    const rows = "ABCDEFGHI";
    // One past the end of the top row, and one row past the bottom of the board.
    expect(fromLabel(`A${RADIUS + 2}`)).toBeNull();
    expect(fromLabel(`${rows[RADIUS * 2 + 1]}1`)).toBeNull();
    expect(fromLabel("banana")).toBeNull();
    // Lower case still reads: the centre is the middle row, middle column.
    expect(fromLabel(`${rows[RADIUS].toLowerCase()}${RADIUS + 1}`)).toEqual({ q: 0, r: 0 });
  });
});

describe("range and pathing", () => {
  it("counts 1 + 3n(n+1) tiles in range n from the centre", () => {
    expect(hexesInRange(CENTRE, 0)).toHaveLength(1);
    expect(hexesInRange(CENTRE, 1)).toHaveLength(7);
    expect(hexesInRange(CENTRE, 2)).toHaveLength(19);
    // Out to the rim is the whole board, whatever the rim is set to.
    expect(hexesInRange(CENTRE, RADIUS)).toHaveLength(1 + 3 * RADIUS * (RADIUS + 1));
  });

  it("clips range at the rim", () => {
    expect(hexesInRange({ q: RADIUS, r: -RADIUS }, 1)).toHaveLength(4);
  });

  it("walks the shortest path, inclusive of both ends", () => {
    // Rim to rim straight through the middle: 2*RADIUS steps, so 2*RADIUS+1 tiles.
    const path = findPath({ q: -RADIUS, r: 0 }, { q: RADIUS, r: 0 })!;
    expect(path).not.toBeNull();
    expect(path).toHaveLength(RADIUS * 2 + 1);
    expect(path[0]).toEqual({ q: -RADIUS, r: 0 });
    expect(path.at(-1)).toEqual({ q: RADIUS, r: 0 });
    for (let i = 1; i < path.length; i++) expect(distance(path[i - 1], path[i])).toBe(1);
  });

  it("routes around blocked tiles", () => {
    // Wall the centre off with everything within one ring of it, built from
    // coordinates rather than from labels: the labels move when the board grows.
    const blocked = new Set([CENTRE, ...neighbours(CENTRE)].map(label));
    const passable = (h: Hex) => !blocked.has(label(h));
    const path = findPath({ q: -2, r: 0 }, { q: 2, r: 0 }, passable)!;
    expect(path).not.toBeNull();
    expect(path.some((h) => blocked.has(label(h)))).toBe(false);
    expect(path.length).toBeGreaterThan(5);
  });

  it("returns null when the target is walled off", () => {
    const ring = neighbours(CENTRE).map(label);
    const path = findPath({ q: -3, r: 0 }, CENTRE, (h) => !ring.includes(label(h)));
    expect(path).toBeNull();
  });

  it("reaches only what the step budget allows", () => {
    const steps = reachable(CENTRE, 2);
    expect(steps.size).toBe(19);
    expect(steps.get(label(CENTRE))).toBe(0);
    // A corner is RADIUS away, so out of reach of a two-step budget on any board
    // bigger than radius 2.
    expect(steps.get(label({ q: 0, r: -RADIUS }))).toBeUndefined();
  });
});

describe("hexLine", () => {
  it("draws a straight run of adjacent tiles", () => {
    const line = hexLine({ q: -RADIUS, r: 0 }, { q: RADIUS, r: 0 });
    expect(line).toHaveLength(RADIUS * 2 + 1);
    for (let i = 1; i < line.length; i++) expect(distance(line[i - 1], line[i])).toBe(1);
  });

  it("stays on the board when both ends are on it", () => {
    for (const a of edgeHexes()) {
      for (const h of hexLine(a, { q: -a.q, r: -a.r })) expect(inBoard(h)).toBe(true);
    }
  });

  it("is a single tile when both ends are the same", () => {
    expect(hexLine(CENTRE, CENTRE)).toEqual([CENTRE]);
  });
});

describe("pixel layout", () => {
  it("puts the centre tile at the origin", () => {
    expect(hexToPixel(CENTRE, 40)).toEqual({ x: 0, y: 0 });
  });

  it("spaces pointy-top neighbours one tile apart", () => {
    const size = 40;
    const expected = { width: Math.sqrt(3) * size, height: 1.5 * size };
    const east = hexToPixel({ q: 1, r: 0 }, size);
    expect(east.x).toBeCloseTo(expected.width);
    expect(east.y).toBeCloseTo(0);

    const southEast = hexToPixel({ q: 0, r: 1 }, size);
    expect(southEast.y).toBeCloseTo(expected.height);
    expect(southEast.x).toBeCloseTo(expected.width / 2);
  });

  it("gives every tile a distinct centre", () => {
    const seen = allHexes().map((h) => {
      const p = hexToPixel(h, 40);
      return `${p.x.toFixed(3)},${p.y.toFixed(3)}`;
    });
    expect(new Set(seen).size).toBe(allHexes().length);
  });
});
