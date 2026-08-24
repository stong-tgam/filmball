/**
 * Axial hex coordinates.
 *
 * The A1-I5 row/column scheme is for humans only - row widths change direction at
 * the middle row, which makes neighbour lookup miserable. Internally everything is
 * axial (q, r); labels are produced on the way out to the UI.
 *
 * Rendering is pointy-top: +q runs east, +r runs south-east.
 */

export type Hex = { q: number; r: number };

/** The board is a hexagon of radius 4 - 5 tiles per side, 61 tiles. */
export const RADIUS = 4;

export const inBoard = (h: Hex): boolean =>
  Math.abs(h.q) <= RADIUS &&
  Math.abs(h.r) <= RADIUS &&
  Math.abs(h.q + h.r) <= RADIUS;

/** The six neighbour offsets, clockwise from east. */
export const DIRS: readonly Hex[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export const add = (a: Hex, b: Hex): Hex => ({ q: a.q + b.q, r: a.r + b.r });

export const equals = (a: Hex, b: Hex): boolean => a.q === b.q && a.r === b.r;

/** Neighbours that are actually on the board. */
export const neighbours = (h: Hex): Hex[] => DIRS.map((d) => add(h, d)).filter(inBoard);

/** Neighbours ignoring board edges - useful when testing the geometry itself. */
export const allNeighbours = (h: Hex): Hex[] => DIRS.map((d) => add(h, d));

export const distance = (a: Hex, b: Hex): number =>
  (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;

/** Every tile on the board, in reading order (top row first, west to east). */
export function allHexes(): Hex[] {
  const out: Hex[] = [];
  for (let r = -RADIUS; r <= RADIUS; r++) {
    for (let q = qMin(r); q <= qMax(r); q++) out.push({ q, r });
  }
  return out;
}

/** Westmost / eastmost q on a given row. */
export const qMin = (r: number): number => Math.max(-RADIUS, -RADIUS - r);
export const qMax = (r: number): number => Math.min(RADIUS, RADIUS - r);

const ROWS = "ABCDEFGHI";

/** Display label, e.g. "A1" for the top-left tile, "E5" for the centre. */
export function label(h: Hex): string {
  const row = ROWS[h.r + RADIUS];
  return `${row}${h.q - qMin(h.r) + 1}`;
}

/** Inverse of `label`. Returns null for anything off the board. */
export function fromLabel(s: string): Hex | null {
  const m = /^([A-Ia-i])(\d+)$/.exec(s.trim());
  if (!m) return null;
  const r = ROWS.indexOf(m[1].toUpperCase()) - RADIUS;
  const q = qMin(r) + Number(m[2]) - 1;
  const h = { q, r };
  return inBoard(h) ? h : null;
}

/** Tiles are stored in `GameState.tiles` keyed by label. */
export const key = label;

/** Every tile within `range` steps, including the origin. Board-bounded. */
export function hexesInRange(origin: Hex, range: number): Hex[] {
  const out: Hex[] = [];
  for (let dq = -range; dq <= range; dq++) {
    for (let dr = Math.max(-range, -dq - range); dr <= Math.min(range, -dq + range); dr++) {
      const h = { q: origin.q + dq, r: origin.r + dr };
      if (inBoard(h)) out.push(h);
    }
  }
  return out;
}

/**
 * Breadth-first search over passable tiles.
 *
 * `passable` decides which tiles may be entered (the origin is always entered).
 * Returns a map from tile label to the number of steps taken to reach it, for
 * every tile reachable within `maxSteps`. v0.2 uses this to highlight legal moves.
 */
export function reachable(
  origin: Hex,
  maxSteps: number,
  passable: (h: Hex) => boolean = () => true,
): Map<string, number> {
  const seen = new Map<string, number>([[key(origin), 0]]);
  let frontier: Hex[] = [origin];
  for (let step = 1; step <= maxSteps; step++) {
    const next: Hex[] = [];
    for (const h of frontier) {
      for (const n of neighbours(h)) {
        if (seen.has(key(n)) || !passable(n)) continue;
        seen.set(key(n), step);
        next.push(n);
      }
    }
    if (next.length === 0) break;
    frontier = next;
  }
  return seen;
}

/**
 * Shortest path from `from` to `to` over passable tiles, inclusive of both ends.
 * Returns null when `to` is unreachable.
 */
export function findPath(
  from: Hex,
  to: Hex,
  passable: (h: Hex) => boolean = () => true,
): Hex[] | null {
  if (equals(from, to)) return [from];
  const cameFrom = new Map<string, Hex>();
  const seen = new Set<string>([key(from)]);
  let frontier: Hex[] = [from];
  while (frontier.length) {
    const next: Hex[] = [];
    for (const h of frontier) {
      for (const n of neighbours(h)) {
        const k = key(n);
        if (seen.has(k) || !passable(n)) continue;
        seen.add(k);
        cameFrom.set(k, h);
        if (equals(n, to)) {
          const path = [n];
          let cur = h;
          while (!equals(cur, from)) {
            path.unshift(cur);
            cur = cameFrom.get(key(cur))!;
          }
          path.unshift(from);
          return path;
        }
        next.push(n);
      }
    }
    frontier = next;
  }
  return null;
}

/** Cube-rounding helper: nearest hex to a fractional axial coordinate. */
export function hexRound(q: number, r: number): Hex {
  const s = -q - r;
  let rq = Math.round(q);
  let rr = Math.round(r);
  const rs = Math.round(s);
  const dq = Math.abs(rq - q);
  const dr = Math.abs(rr - r);
  const ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs;
  else if (dr > ds) rr = -rq - rs;
  return { q: rq, r: rr };
}

/** The straight line of tiles from `a` to `b`, inclusive of both ends. */
export function hexLine(a: Hex, b: Hex): Hex[] {
  const n = distance(a, b);
  if (n === 0) return [a];
  const out: Hex[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push(hexRound(a.q + (b.q - a.q) * t, a.r + (b.r - a.r) * t));
  }
  return out;
}

/** The six corner tiles of the board hexagon, clockwise from the east corner. */
export function boardCorners(): Hex[] {
  return [
    { q: RADIUS, r: 0 },
    { q: RADIUS, r: -RADIUS },
    { q: 0, r: -RADIUS },
    { q: -RADIUS, r: 0 },
    { q: -RADIUS, r: RADIUS },
    { q: 0, r: RADIUS },
  ];
}

/** The 24 tiles on the outer ring of the board. */
export function edgeHexes(): Hex[] {
  return allHexes().filter((h) => distance(h, { q: 0, r: 0 }) === RADIUS);
}

/** A point in SVG pixel space, relative to the centre of a tile. */
export type Point = { x: number; y: number };

/**
 * Geometry of one side of a tile.
 *
 * Side `d` is the edge shared with the neighbour in direction `DIRS[d]`, and sits at
 * angle -60d degrees from the centre. Tiles are composed side by side (see
 * `Tile.sides`), so the renderer needs the two corners bounding each one.
 */
export const sideAngle = (d: number): number => (-60 * d * Math.PI) / 180;

const atAngle = (angle: number, radius: number): Point => ({
  x: radius * Math.cos(angle),
  y: radius * Math.sin(angle),
});

/** The two corners bounding side `d`, ordered anticlockwise on screen. */
export function sideCorners(d: number, size: number): [Point, Point] {
  const a = sideAngle(d);
  const thirty = Math.PI / 6;
  return [atAngle(a + thirty, size), atAngle(a - thirty, size)];
}

/** Midpoint of side `d`, at `radius` out from the centre (defaults to the edge). */
export function sidePoint(d: number, size: number, fraction = 1): Point {
  // The edge midpoint sits closer in than a corner: cos(30) of the circumradius.
  return atAngle(sideAngle(d), size * Math.cos(Math.PI / 6) * fraction);
}

/** Pixel centre of a hex, pointy-top, for an SVG of the given tile size. */
export function hexToPixel(h: Hex, size: number): { x: number; y: number } {
  return {
    x: size * Math.sqrt(3) * (h.q + h.r / 2),
    y: size * 1.5 * h.r,
  };
}

/** The six corners of a pointy-top hex of the given size, centred on the origin. */
export function corners(size: number): { x: number; y: number }[] {
  return Array.from({ length: 6 }, (_, i) => {
    const angle = (Math.PI / 180) * (60 * i - 30);
    return { x: size * Math.cos(angle), y: size * Math.sin(angle) };
  });
}

/** SVG polygon `points` string for a pointy-top hex centred on the origin. */
export function hexPoints(size: number): string {
  return corners(size)
    .map((c) => `${c.x.toFixed(3)},${c.y.toFixed(3)}`)
    .join(" ");
}
