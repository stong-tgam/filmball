/**
 * The board, in coloured pencil. Rulebook §1, and the tile sheet the children drew.
 *
 * Tiles obey different rules from the chits, and the difference is deliberate: chits
 * are fibre-tip marker, flat and opaque; tiles are pencil, and pencil shows its
 * direction. Fields are ploughed rather than filled, grass is flicks rather than a
 * wash, and the hex border is a heavy charcoal line with weight in it.
 *
 * A tile carries one element per side (see `Tile.sides`), so what gets drawn here is
 * a composition: the base terrain across the whole hex, then a patch for every side
 * that borrowed something from next door.
 */

import { DIRS, hexPoints, sideAngle, sidePoint, type Hex } from "../../game/hex";
import { Wobble } from "./CrayonDefs";
import { MARKER, darken, jitter, wobbleFor } from "./crayon";
import type { Element, Tile } from "../../game/types";

const CHARCOAL = "#22201E";

/** Ground colours, under the hatching. */
const GROUND: Record<Element, string> = {
  field: "#F2E6D2",
  forest: "#9ACD5B",
  city: "#A8CF6B",
  water: "#F2E6D2",
};

const scatter = (seed: string, count: number, spread: number) =>
  Array.from({ length: count }, (_, i) => ({
    x: jitter(`${seed}-x${i}`, spread),
    y: jitter(`${seed}-y${i}`, spread * 0.7),
    s: 1 + jitter(`${seed}-s${i}`, 0.22),
  }));

/** A pencil tree: trunk, dark canopy, one lighter face. */
function Tree({ x, y, s, size }: { x: number; y: number; s: number; size: number }) {
  const h = size * 0.3 * s;
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x={-h * 0.09} y={h * 0.12} width={h * 0.18} height={h * 0.5} rx={h * 0.06} fill="#7A4A22" />
      <path d={`M0 ${-h} L${h * 0.6} ${h * 0.22} L${-h * 0.6} ${h * 0.22} Z`} fill="#2E7D32" />
      <path d={`M0 ${-h} L${h * 0.33} ${-h * 0.1} L${-h * 0.33} ${-h * 0.1} Z`} fill="#4FA046" />
    </g>
  );
}

/** A cottage: tan walls, a coloured roof, one lit window. */
function Cottage({ x, y, s, size, roof }: { x: number; y: number; s: number; size: number; roof: string }) {
  const w = size * 0.26 * s;
  const h = w * 0.8;
  return (
    <g transform={`translate(${x} ${y})`}>
      <rect x={-w / 2} y={-h / 2} width={w} height={h} fill="#D8B98A" stroke={darken("#D8B98A", 0.4)} strokeWidth={size * 0.018} />
      <path d={`M${-w / 2 - w * 0.14} ${-h / 2} L0 ${-h / 2 - h * 0.7} L${w / 2 + w * 0.14} ${-h / 2} Z`}
            fill={roof} stroke={darken(roof)} strokeWidth={size * 0.018} strokeLinejoin="round" />
      <rect x={-w * 0.16} y={-h * 0.1} width={w * 0.32} height={h * 0.4} fill={MARKER.sunshine} opacity="0.9" />
    </g>
  );
}

/**
 * The whole tile, centred on the origin, ready to be dropped at a hex's pixel
 * position. `size` is the circumradius, matching `hexPoints`.
 */
export default function TerrainArt({
  tile,
  size,
  label,
  clipId,
}: {
  tile: Tile;
  size: number;
  label: string;
  /** Unique per tile: the hex clip has to be its own, or tiles crop each other. */
  clipId: string;
}) {
  const seed = label;
  const points = hexPoints(size);
  const waterSides = tile.sides.flatMap((e, i) => (e === "water" ? [i] : []));
  const borrowed = tile.sides
    .map((element, side) => ({ element, side }))
    .filter(({ element }) => element !== "water" && element !== tile.base);

  // Which way this field is ploughed. Neighbouring fields land on different angles,
  // which is what stops a run of them reading as one big field.
  const furrow = jitter(seed, 1) > 0 ? "hatch-furrow-a" : "hatch-furrow-b";

  return (
    <g className={`terrain terrain-${tile.base}`}>
      <defs>
        <clipPath id={clipId}>
          <polygon points={points} />
        </clipPath>
      </defs>

      <polygon points={points} fill={GROUND[tile.base]} />

      <g clipPath={`url(#${clipId})`}>
        {/* Ground texture: furrows on open land, flicks on anything green. */}
        <polygon
          points={points}
          fill={`url(#${tile.base === "field" ? furrow : "flick-grass"})`}
        />

        <g filter={wobbleFor(seed)}>
          {/* What the neighbours have lent this tile, hugging the side it came over. */}
          {borrowed.map(({ element, side }) => {
            const angle = sideAngle(side);
            const reach = size * 0.62;
            const cx = reach * Math.cos(angle);
            const cy = reach * Math.sin(angle);
            return (
              <g key={side}>
                <ellipse cx={cx} cy={cy} rx={size * 0.46} ry={size * 0.38} fill={GROUND[element]} opacity="0.95" />
                {element === "forest" && (
                  <Tree x={cx} y={cy + size * 0.1} s={0.85} size={size} />
                )}
                {element === "city" && (
                  <Cottage x={cx} y={cy} s={0.8} size={size} roof={MARKER.strawberry} />
                )}
              </g>
            );
          })}

          {/* The tile's own terrain. */}
          {tile.base === "forest" &&
            scatter(seed, 5, size * 0.42).map((t, i) => (
              <Tree key={i} x={t.x} y={t.y + size * 0.06} s={t.s} size={size} />
            ))}

          {tile.base === "city" && (
            <>
              <path
                d={`M${-size * 0.7} ${size * 0.34} q${size * 0.5} ${-size * 0.2} ${size * 1.4} 0`}
                fill="none"
                stroke="#E4D6B8"
                strokeWidth={size * 0.12}
                strokeLinecap="round"
              />
              {scatter(seed, 4, size * 0.4).map((c, i) => (
                <Cottage
                  key={i}
                  x={c.x}
                  y={c.y - size * 0.06}
                  s={c.s}
                  size={size}
                  roof={i % 2 === 0 ? MARKER.strawberry : MARKER.river}
                />
              ))}
            </>
          )}

          {tile.base === "field" &&
            scatter(seed, 2, size * 0.4).map((g, i) => (
              <path
                key={i}
                d={`M${g.x - size * 0.08} ${g.y} q${size * 0.08} ${-size * 0.12} ${size * 0.16} 0`}
                fill="none"
                stroke="#96A94F"
                strokeWidth={size * 0.045}
                strokeLinecap="round"
              />
            ))}
        </g>

        {/* Water runs to the middle of each side it owns, so tiles join up. */}
        {waterSides.length > 0 && (
          <Wobble name={`${seed}-water`} extent={size}>
            {waterSides.map((d) => {
              const m = sidePoint(d, size);
              return (
                <g key={d}>
                  <line x1={0} y1={0} x2={m.x} y2={m.y} stroke={MARKER.river} strokeWidth={size * 0.32} strokeLinecap="round" />
                  <line x1={0} y1={0} x2={m.x} y2={m.y} stroke={darken(MARKER.river, 0.25)} strokeWidth={size * 0.34} strokeLinecap="round" opacity="0.25" />
                  <line x1={0} y1={0} x2={m.x} y2={m.y} stroke="#7FC4F2" strokeWidth={size * 0.1} strokeLinecap="round" opacity="0.8" />
                </g>
              );
            })}
            <circle r={size * 0.16} fill={MARKER.river} />
          </Wobble>
        )}

        {/* The railway: two rails and the sleepers between them. */}
        {tile.rail && (
          <Wobble name={`${seed}-rail`} extent={size}>
            {railSides(tile.hex).map((d) => {
              const m = sidePoint(d, size);
              return (
                <g key={d}>
                  <line x1={0} y1={0} x2={m.x} y2={m.y} stroke="#6B6257" strokeWidth={size * 0.15} strokeLinecap="round" />
                  <line
                    x1={0}
                    y1={0}
                    x2={m.x}
                    y2={m.y}
                    stroke={CHARCOAL}
                    strokeWidth={size * 0.13}
                    strokeDasharray={`${size * 0.045} ${size * 0.085}`}
                  />
                </g>
              );
            })}
          </Wobble>
        )}
      </g>

      {/* The border last, heavy, over everything. */}
      <polygon
        points={points}
        fill="none"
        stroke={CHARCOAL}
        strokeWidth={size * 0.055}
        strokeLinejoin="round"
        filter={wobbleFor(`${seed}-edge`)}
      />
    </g>
  );
}

/**
 * Which way the track runs. The tile only knows it has rail, so the direction comes
 * from the board — this is the fallback for a tile drawn on its own, in the gallery.
 */
function railSides(_hex: Hex): number[] {
  return [0, 3];
}

export const ALL_DIRS = DIRS.map((_, i) => i);
