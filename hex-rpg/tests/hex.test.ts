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

describe("board shape", () => {
  it("holds 61 tiles", () => {
    expect(allHexes()).toHaveLength(61);
  });

  it("is a hexagon of radius 4 - every tile is within 4 of the centre", () => {
    for (const h of allHexes()) expect(distance(h, CENTRE)).toBeLessThanOrEqual(RADIUS);
  });

  it("excludes everything past the rim", () => {
    expect(inBoard({ q: 5, r: 0 })).toBe(false);
    expect(inBoard({ q: 4, r: 1 })).toBe(false); // q+r = 5
    expect(inBoard({ q: 4, r: -4 })).toBe(true); // a corner
  });

  it("has 24 tiles on the rim and 5 tiles per side", () => {
    expect(edgeHexes()).toHaveLength(24);
    // A side runs corner to corner: 24 rim tiles / 6 sides + 1 shared corner each.
    expect(edgeHexes().length / 6 + 1).toBe(5);
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
    expect(neighbours({ q: 4, r: -4 })).toHaveLength(3);
    expect(neighbours({ q: 4, r: -2 })).toHaveLength(4);
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
    expect(label({ q: 0, r: -4 })).toBe("A1"); // top-left corner
    expect(label({ q: 4, r: -4 })).toBe("A5"); // top-right corner
    expect(label({ q: 0, r: 0 })).toBe("E5"); // centre of the widest row
    expect(label({ q: -4, r: 4 })).toBe("I1"); // bottom-left corner
  });

  it("numbers each row from 1 with the right row widths", () => {
    const widths = "ABCDEFGHI".split("").map(
      (row) => allHexes().filter((h) => label(h)[0] === row).length,
    );
    expect(widths).toEqual([5, 6, 7, 8, 9, 8, 7, 6, 5]);
  });

  it("round-trips through fromLabel for every tile", () => {
    for (const h of allHexes()) expect(fromLabel(label(h))).toEqual(h);
  });

  it("rejects labels that are off the board or malformed", () => {
    expect(fromLabel("A6")).toBeNull();
    expect(fromLabel("J1")).toBeNull();
    expect(fromLabel("banana")).toBeNull();
    expect(fromLabel("e5")).toEqual({ q: 0, r: 0 });
  });
});

describe("range and pathing", () => {
  it("counts 1 + 3n(n+1) tiles in range n from the centre", () => {
    expect(hexesInRange(CENTRE, 0)).toHaveLength(1);
    expect(hexesInRange(CENTRE, 1)).toHaveLength(7);
    expect(hexesInRange(CENTRE, 2)).toHaveLength(19);
    expect(hexesInRange(CENTRE, 4)).toHaveLength(61);
  });

  it("clips range at the rim", () => {
    expect(hexesInRange({ q: 4, r: -4 }, 1)).toHaveLength(4);
  });

  it("walks the shortest path, inclusive of both ends", () => {
    const path = findPath({ q: -4, r: 0 }, { q: 4, r: 0 })!;
    expect(path).not.toBeNull();
    expect(path).toHaveLength(9);
    expect(path[0]).toEqual({ q: -4, r: 0 });
    expect(path.at(-1)).toEqual({ q: 4, r: 0 });
    for (let i = 1; i < path.length; i++) expect(distance(path[i - 1], path[i])).toBe(1);
  });

  it("routes around blocked tiles", () => {
    // Wall off the centre column; the path has to bend, so it gets longer.
    const blocked = new Set(["E4", "E5", "E6", "D4", "D5", "F4", "F5"]);
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
    expect(steps.get("E5")).toBe(0);
    expect(steps.get("A1")).toBeUndefined();
  });
});

describe("hexLine", () => {
  it("draws a straight run of adjacent tiles", () => {
    const line = hexLine({ q: -4, r: 0 }, { q: 4, r: 0 });
    expect(line).toHaveLength(9);
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
    expect(new Set(seen).size).toBe(61);
  });
});
