/**
 * One hex tile.
 *
 * The artwork is drawn here in SVG rather than loaded as assets: it scales to any
 * screen, recolours with a CSS variable, and costs nothing to ship. Per-tile detail
 * (where the trees stand, how tall the buildings are) is jittered from a hash of the
 * tile label, so every tile looks hand-placed but never changes between renders.
 */

import { memo } from "react";
import { DIRS, hexPoints, hexToPixel, type Hex } from "../game/hex";
import { makeRng } from "../game/rng";
import type { Tile as TileData } from "../game/types";

type Props = {
  tile: TileData;
  label: string;
  size: number;
  /** Indices into DIRS of the neighbours the river / railway continues into. */
  riverDirs: number[];
  railDirs: number[];
  selected: boolean;
  onSelect: (label: string) => void;
};

const hash = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

/** Midpoint of the edge shared with the neighbour in direction `dir`. */
const edgeMidpoint = (dir: Hex, size: number) => {
  const p = hexToPixel(dir, size);
  return { x: p.x / 2, y: p.y / 2 };
};

function Field({ size, rng }: { size: number; rng: ReturnType<typeof makeRng> }) {
  const tufts = Array.from({ length: 7 }, () => ({
    x: (rng.next() - 0.5) * size * 1.2,
    y: (rng.next() - 0.5) * size * 1.2,
    w: size * 0.1,
  }));
  return (
    <g className="art art-field">
      {tufts.map((t, i) => (
        <path
          key={i}
          d={`M${t.x - t.w} ${t.y} q ${t.w} ${-t.w * 1.4} ${t.w * 2} 0`}
          fill="none"
          stroke="var(--field-detail)"
          strokeWidth={size * 0.05}
          strokeLinecap="round"
        />
      ))}
    </g>
  );
}

function Forest({ size, rng }: { size: number; rng: ReturnType<typeof makeRng> }) {
  const trees = Array.from({ length: 4 }, () => ({
    x: (rng.next() - 0.5) * size * 1.05,
    y: (rng.next() - 0.5) * size * 0.95,
    s: size * (0.3 + rng.next() * 0.16),
  })).sort((a, b) => a.y - b.y);

  return (
    <g className="art art-forest">
      {trees.map((t, i) => (
        <g key={i} transform={`translate(${t.x} ${t.y})`}>
          <rect
            x={-t.s * 0.09}
            y={t.s * 0.15}
            width={t.s * 0.18}
            height={t.s * 0.45}
            fill="var(--tree-trunk)"
            rx={t.s * 0.06}
          />
          <path
            d={`M0 ${-t.s} L ${t.s * 0.62} ${t.s * 0.25} L ${-t.s * 0.62} ${t.s * 0.25} Z`}
            fill="var(--tree-canopy)"
          />
          <path
            d={`M0 ${-t.s} L ${t.s * 0.34} ${-t.s * 0.1} L ${-t.s * 0.34} ${-t.s * 0.1} Z`}
            fill="var(--tree-canopy-light)"
          />
        </g>
      ))}
    </g>
  );
}

function City({ size, rng }: { size: number; rng: ReturnType<typeof makeRng> }) {
  const count = 4;
  const width = size * 0.26;
  const gap = size * 0.07;
  const totalWidth = count * width + (count - 1) * gap;
  const baseY = size * 0.5;

  const buildings = Array.from({ length: count }, (_, i) => ({
    x: -totalWidth / 2 + i * (width + gap),
    h: size * (0.42 + rng.next() * 0.62),
  }));

  return (
    <g className="art art-city">
      {buildings.map((b, i) => (
        <g key={i}>
          <rect
            x={b.x}
            y={baseY - b.h}
            width={width}
            height={b.h}
            fill="var(--building)"
            stroke="var(--building-edge)"
            strokeWidth={size * 0.02}
          />
          {Array.from({ length: Math.max(1, Math.floor(b.h / (size * 0.2))) }, (_, row) => (
            <rect
              key={row}
              x={b.x + width * 0.22}
              y={baseY - b.h + size * 0.09 + row * size * 0.2}
              width={width * 0.56}
              height={size * 0.09}
              fill="var(--window)"
            />
          ))}
        </g>
      ))}
    </g>
  );
}

/**
 * Rivers and railways are drawn as spokes from the tile centre out to each shared
 * edge, so neighbouring tiles join into one continuous line across the board.
 * A river with nowhere to go becomes a pond.
 */
function River({ size, dirs }: { size: number; dirs: number[] }) {
  if (dirs.length === 0) {
    return <circle r={size * 0.3} fill="var(--water)" className="art art-river" />;
  }
  return (
    <g className="art art-river">
      {dirs.map((d) => {
        const m = edgeMidpoint(DIRS[d], size);
        return (
          <line
            key={d}
            x1={0}
            y1={0}
            x2={m.x}
            y2={m.y}
            stroke="var(--water)"
            strokeWidth={size * 0.3}
            strokeLinecap="round"
          />
        );
      })}
      <circle r={size * 0.15} fill="var(--water)" />
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
            <line
              x1={0}
              y1={0}
              x2={m.x}
              y2={m.y}
              stroke="var(--rail-bed)"
              strokeWidth={size * 0.16}
              strokeLinecap="round"
            />
            <line
              x1={0}
              y1={0}
              x2={m.x}
              y2={m.y}
              stroke="var(--rail-tie)"
              strokeWidth={size * 0.13}
              strokeLinecap="butt"
              strokeDasharray={`${size * 0.05} ${size * 0.09}`}
            />
          </g>
        );
      })}
    </g>
  );
}

function TileView({ tile, label, size, riverDirs, railDirs, selected, onSelect }: Props) {
  const { x, y } = hexToPixel(tile.hex, size);
  const rng = makeRng(hash(label));

  return (
    <g
      transform={`translate(${x.toFixed(2)} ${y.toFixed(2)})`}
      className={`tile tile-${tile.base}${selected ? " is-selected" : ""}`}
      onClick={() => onSelect(label)}
      role="button"
      tabIndex={0}
      aria-label={`${label}, ${tile.base}${tile.river ? ", river" : ""}${tile.rail ? ", railway" : ""}`}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(label);
        }
      }}
    >
      <polygon points={hexPoints(size)} className="tile-face" />
      {tile.base === "field" && <Field size={size} rng={rng} />}
      {tile.base === "forest" && <Forest size={size} rng={rng} />}
      {tile.river && <River size={size} dirs={riverDirs} />}
      {tile.rail && <Railway size={size} dirs={railDirs} />}
      {tile.base === "city" && <City size={size} rng={rng} />}
      <polygon points={hexPoints(size)} className="tile-outline" />
      <text className="tile-label" y={size * 0.82} textAnchor="middle" fontSize={size * 0.28}>
        {label}
      </text>
    </g>
  );
}

export default memo(TileView);
