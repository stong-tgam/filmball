/**
 * One hex tile.
 *
 * A tile is a composition, not a single terrain: each of its six sides carries an
 * element, and the tile holds up to three of them. The renderer follows that data
 * directly - the base terrain fills the hex, every borrowed element is a patch
 * hugging the sides it owns, water cuts through to the centre so a river joins up
 * across tiles, and each non-water side carries one piece of art. Count the trees
 * on a tile and you have counted the sides its wood occupies.
 *
 * Artwork is SVG rather than image assets: it scales to any screen, recolours from
 * CSS custom properties, and costs nothing to ship. Per-tile jitter comes from a
 * hash of the tile label, so tiles look hand-placed but never change between renders.
 */

import { memo } from "react";
import {
  DIRS,
  hexPoints,
  hexToPixel,
  sideAngle,
  sideCorners,
  sidePoint,
  type Hex,
  type Point,
} from "../game/hex";
import { makeRng, type Rng } from "../game/rng";
import type { Element, Tile as TileData } from "../game/types";

type Props = {
  tile: TileData;
  label: string;
  size: number;
  /** Indices into DIRS of the neighbours the railway continues into. */
  railDirs: number[];
  selected: boolean;
  /** A tile the active player may move to this turn. */
  legal: boolean;
  /** Ground the tornado has just been through. */
  wrecked: boolean;
  /**
   * Print the tile's name on it. False in the close-up view, where there is no map and
   * a grid reference on a neighbouring hex would hand the party their own position.
   * The label is still used to seed the scenery, so tiles stay put between renders.
   */
  showLabel?: boolean;
  onSelect: (label: string) => void;
};

const hash = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

const xy = (p: Point) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`;

/** Midpoint of the edge shared with the neighbour in direction `dir`. */
const edgeMidpoint = (dir: Hex, size: number) => {
  const p = hexToPixel(dir, size);
  return { x: p.x / 2, y: p.y / 2 };
};

type Run = { element: Element; start: number; length: number };

/**
 * The sides grouped into consecutive runs of the same element. Scanning starts at a
 * boundary so a run spanning side 5 to side 0 stays one run rather than two.
 */
export function runs(sides: Element[]): Run[] {
  let offset = 0;
  while (offset < 6 && sides[offset] === sides[(offset + 5) % 6]) offset++;
  if (offset === 6) return [{ element: sides[0], start: 0, length: 6 }];

  const out: Run[] = [];
  for (let i = 0; i < 6; ) {
    const start = (offset + i) % 6;
    let length = 1;
    while (i + length < 6 && sides[(start + length) % 6] === sides[start]) length++;
    out.push({ element: sides[start], start, length });
    i += length;
  }
  return out;
}

/** Outer boundary of a run: the corners along the sides it owns. */
const outerCorners = (run: Run, size: number): Point[] => {
  const points = [sideCorners(run.start, size)[0]];
  for (let i = 0; i < run.length; i++) {
    points.push(sideCorners((run.start + i) % 6, size)[1]);
  }
  return points;
};

/**
 * A patch of land hugging the sides it owns: the hex edge on the outside, a curve
 * back on the inside. The longer the run, the deeper into the tile it reaches.
 */
function patchPath(run: Run, size: number): string {
  const outer = outerCorners(run, size);
  const midAngle = sideAngle(run.start + (run.length - 1) / 2);
  const depth = size * (0.26 + 0.09 * run.length);
  const control = { x: depth * Math.cos(midAngle), y: depth * Math.sin(midAngle) };
  const edge = outer.map((p, i) => `${i === 0 ? "M" : "L"}${xy(p)}`).join(" ");
  return `${edge} Q${xy(control)} ${xy(outer[0])} Z`;
}

/**
 * Water reaches the middle of each side it owns and runs in to the centre, so the
 * banks of neighbouring tiles meet and the river is continuous across the board.
 * A full wedge would be truer to the data and much worse to look at: six of them
 * around a tile turn a river into a row of chevrons.
 */
function Channel({ sides, size }: { sides: number[]; size: number }) {
  return (
    <g className="channel">
      {sides.map((d) => {
        const m = sidePoint(d, size);
        return (
          <line
            key={d}
            x1={0}
            y1={0}
            x2={m.x}
            y2={m.y}
            stroke="var(--water)"
            strokeWidth={size * 0.34}
            strokeLinecap="round"
          />
        );
      })}
      <circle r={size * 0.17} fill="var(--water)" />
    </g>
  );
}

function Tree({ size, rng }: { size: number; rng: Rng }) {
  const s = size * (0.9 + rng.next() * 0.25);
  return (
    <g className="art art-forest">
      <rect
        x={-s * 0.09}
        y={s * 0.15}
        width={s * 0.18}
        height={s * 0.5}
        rx={s * 0.06}
        fill="var(--tree-trunk)"
      />
      <path d={`M0 ${-s} L${s * 0.6} ${s * 0.25} L${-s * 0.6} ${s * 0.25} Z`} fill="var(--tree-canopy)" />
      <path d={`M0 ${-s} L${s * 0.33} ${-s * 0.1} L${-s * 0.33} ${-s * 0.1} Z`} fill="var(--tree-canopy-light)" />
    </g>
  );
}

function Buildings({ size, rng }: { size: number; rng: Rng }) {
  const blocks = [0, 1].map((i) => ({
    x: (i - 0.5) * size * 0.62,
    h: size * (0.85 + rng.next() * 0.75),
    w: size * 0.52,
  }));
  return (
    <g className="art art-city">
      {blocks.map((b, i) => (
        <g key={i}>
          <rect
            x={b.x - b.w / 2}
            y={size * 0.55 - b.h}
            width={b.w}
            height={b.h}
            fill="var(--building)"
            stroke="var(--building-edge)"
            strokeWidth={size * 0.05}
          />
          {Array.from({ length: Math.max(1, Math.round(b.h / (size * 0.45))) }, (_, row) => (
            <rect
              key={row}
              x={b.x - b.w * 0.22}
              y={size * 0.55 - b.h + size * 0.18 + row * size * 0.45}
              width={b.w * 0.44}
              height={size * 0.2}
              fill="var(--window)"
            />
          ))}
        </g>
      ))}
    </g>
  );
}

function Tuft({ size, rng }: { size: number; rng: Rng }) {
  // Two blades rather than one: a single mark per side leaves open ground looking
  // like unpainted background rather than a field.
  const blades = [0, 1].map(() => ({
    w: size * (0.3 + rng.next() * 0.2),
    dx: (rng.next() - 0.5) * size * 1.1,
    dy: (rng.next() - 0.5) * size * 0.7,
  }));
  return (
    <g className="art art-field">
      {blades.map((b, i) => (
        <path
          key={i}
          d={`M${b.dx - b.w} ${b.dy} q ${b.w} ${-b.w * 1.5} ${b.w * 2} 0`}
          fill="none"
          stroke="var(--field-detail)"
          strokeWidth={size * 0.14}
          strokeLinecap="round"
        />
      ))}
    </g>
  );
}

/** One piece of art per side, standing in the element that owns that side. */
function SideArt({ element, side, size, rng }: { element: Element; side: number; size: number; rng: Rng }) {
  if (element === "water") return null;

  const angle = sideAngle(side) + (rng.next() - 0.5) * 0.35;
  const radius = size * (0.52 + rng.next() * 0.12);
  const art = size * 0.26;
  const transform = `translate(${(radius * Math.cos(angle)).toFixed(2)} ${(radius * Math.sin(angle)).toFixed(2)})`;

  return (
    <g transform={transform}>
      {element === "forest" && <Tree size={art} rng={rng} />}
      {element === "city" && <Buildings size={art} rng={rng} />}
      {element === "field" && <Tuft size={art} rng={rng} />}
    </g>
  );
}

function Railway({ size, dirs }: { size: number; dirs: number[] }) {
  const spokes = dirs.length ? dirs : [0, 3];
  return (
    <g className="art art-rail">
      {spokes.map((d) => {
        const m = edgeMidpoint(DIRS[d], size);
        return (
          <g key={d}>
            <line x1={0} y1={0} x2={m.x} y2={m.y} stroke="var(--rail-bed)" strokeWidth={size * 0.16} strokeLinecap="round" />
            <line
              x1={0}
              y1={0}
              x2={m.x}
              y2={m.y}
              stroke="var(--rail-tie)"
              strokeWidth={size * 0.13}
              strokeDasharray={`${size * 0.05} ${size * 0.09}`}
            />
          </g>
        );
      })}
    </g>
  );
}

function TileView({
  tile,
  label,
  size,
  railDirs,
  selected,
  legal,
  wrecked,
  showLabel = true,
  onSelect,
}: Props) {
  const { x, y } = hexToPixel(tile.hex, size);
  const rng = makeRng(hash(label));
  const grouped = runs(tile.sides);
  const shade = rng.next() * 0.07;
  const patches = grouped.filter((r) => r.element !== "water" && r.element !== tile.base);
  const waterSides = tile.sides.flatMap((e, i) => (e === "water" ? [i] : []));
  const description = [...new Set(tile.sides)].join(", ");

  return (
    <g
      transform={`translate(${x.toFixed(2)} ${y.toFixed(2)})`}
      className={`tile tile-${tile.base}${selected ? " is-selected" : ""}${legal ? " is-legal" : ""}${wrecked ? " is-wrecked" : ""}`}
      onClick={() => onSelect(label)}
      role="button"
      tabIndex={0}
      aria-label={`${label}: ${description}${tile.rail ? ", railway" : ""}${wrecked ? ", wrecked by the tornado" : ""}${legal ? ", you can move here" : ""}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(label);
        }
      }}
    >
      <polygon points={hexPoints(size)} className="tile-face" />
      {/* A touch of shade per tile, so a run of the same terrain reads as ground
          rather than as one flat colour repeated across the board. */}
      <polygon points={hexPoints(size)} className="tile-shade" opacity={shade.toFixed(3)} />

      {patches.map((run) => (
        <path key={`p${run.start}`} d={patchPath(run, size)} className={`patch patch-${run.element}`} />
      ))}

      {waterSides.length > 0 && <Channel sides={waterSides} size={size} />}

      {tile.sides.map((element, side) => (
        <SideArt key={side} element={element} side={side} size={size} rng={rng} />
      ))}

      {tile.rail && <Railway size={size} dirs={railDirs} />}

      {wrecked && <polygon points={hexPoints(size)} className="tile-wrecked" />}
      {legal && (
        <g className="legal" pointerEvents="none">
          <polygon points={hexPoints(size)} className="tile-legal" />
          {/* A pip in the active player's colour: "your piece can stand here". A
              wash on its own reads as greyed-out rather than as an invitation. */}
          <circle className="legal-pip" r={size * 0.11} />
        </g>
      )}
      <polygon points={hexPoints(size)} className="tile-outline" />
      {showLabel && (
        <text className="tile-label" y={size * 0.82} textAnchor="middle" fontSize={size * 0.28}>
          {label}
        </text>
      )}
    </g>
  );
}

export default memo(TileView);
