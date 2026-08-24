/**
 * How a coloured shape is actually drawn.
 *
 * The first pass of this artwork filled every shape with one flat colour and ringed it
 * with one line, which reads as clip art no matter how good the silhouette is. A pencil
 * or a marker on paper does four things at once, and all four have to be in the render
 * or the drawing looks printed:
 *
 *  1. **The paper shows through.** Colour laid down by hand is never opaque. A pale
 *     wash goes down first and the strokes sit on top of it, so the chip's cream comes
 *     back up through the gaps.
 *  2. **Strokes have a direction.** A child colouring in goes back and forth one way
 *     and does not change angle halfway. Each shape gets its own angle, fixed by name.
 *  3. **Colour piles up at the edge.** You slow down at the outline, so the boundary is
 *     darker than the middle. That is the single biggest tell.
 *  4. **The outline was drawn twice.** Nobody gets it right first go, and the second
 *     line never lands exactly on the first.
 *
 * The strokes are a `<pattern>` rather than a few dozen real paths. Twenty-six stroke
 * paths per shape, six shapes per drawing, sixty drawings on the gallery sheet is forty
 * thousand nodes; a three-stroke tile costs three. The wobble filter on the group above
 * distorts the tiling enough that the repeat does not read.
 */

import { useId } from "react";
import type { ReactNode } from "react";
import { darken, lighten, pickFor } from "./crayon";

/** Colouring-in angles. Five is enough that neighbouring shapes never match. */
const ANGLES = [-64, -37, -14, 21, 48] as const;

/** The same shape always gets the same stroke direction. */
export const angleFor = (name: string): number => pickFor(name, ANGLES);

/** `useId` hands back `:r7:`; colons are legal in an id but a pain in a url(). */
const clean = (id: string): string => id.replace(/[^a-zA-Z0-9-]/g, "");

export type PencilProps = {
  /** The shape, on the shared 100x100 canvas. */
  d: string;
  /** The crayon. Everything else - wash, strokes, edge, outline - derives from it. */
  fill: string;
  /** Outline colour, if the darkened fill is wrong (steel, charcoal, white). */
  stroke?: string;
  /** Outline weight. */
  width?: number;
  /** Stroke direction in degrees. Defaults to one picked from `seedName`. */
  angle?: number;
  /** Which shape this is, so its angle and stroke jitter never change between renders. */
  seedName?: string;
  /** How hard it was coloured in. 1 is normal; drop it for a belly, raise it for a boot. */
  press?: number;
  /** Skip the outline - for a patch of colour that sits inside another shape. */
  bare?: boolean;
};

/**
 * One coloured shape: wash, strokes, edge pressure, and a line gone over twice.
 *
 * Replaces a flat `<path fill>` one for one. Everything drawn for this game should be
 * built out of these rather than out of raw filled paths.
 */
export function Pencil({
  d,
  fill,
  stroke,
  width = 2.5,
  angle,
  seedName = d.slice(0, 24),
  press = 1,
  bare = false,
}: PencilProps) {
  const uid = clean(useId());
  const pid = `px-${uid}`;
  const cid = `pc-${uid}`;
  const dark = stroke ?? darken(fill, 0.42);
  const tilt = angle ?? angleFor(seedName);

  return (
    <>
      <defs>
        {/*
          One tile of colouring-in. The strokes overhang the tile on both sides so they
          join up across the repeat instead of ending in a visible seam, and the three
          weights stop the eye locking onto the 9-unit rhythm.
        */}
        <pattern
          id={pid}
          width="24"
          height="9"
          patternUnits="userSpaceOnUse"
          patternTransform={`rotate(${tilt})`}
        >
          <path d="M-4 2.2 Q 8 0.9 28 2.6" fill="none" stroke={fill} strokeWidth="3.1" strokeLinecap="round" opacity={0.86 * press} />
          <path d="M-4 5.4 Q 11 6.7 28 5.1" fill="none" stroke={fill} strokeWidth="2.3" strokeLinecap="round" opacity={0.62 * press} />
          <path d="M-4 7.9 Q 9 8.6 28 7.7" fill="none" stroke={darken(fill, 0.16)} strokeWidth="1.5" strokeLinecap="round" opacity={0.45 * press} />
        </pattern>
        <clipPath id={cid}>
          <path d={d} />
        </clipPath>
      </defs>

      {/* Wash. Offset, because the colour never lines up with the line. */}
      <path d={d} fill={lighten(fill, 0.34)} opacity={0.85} transform="translate(0.9 -0.8)" />
      {/* Strokes. */}
      <path d={d} fill={`url(#${pid})`} />
      {/* Pressure where the hand slowed down, clipped so it stays inside the shape. */}
      <g clipPath={`url(#${cid})`}>
        <path d={d} fill="none" stroke={dark} strokeWidth="9" opacity={0.2 * press} />
        <path d={d} fill="none" stroke={dark} strokeWidth="3.5" opacity={0.24 * press} />
      </g>
      {/* The line, twice. */}
      {!bare && (
        <>
          <path d={d} fill="none" stroke={dark} strokeWidth={width} strokeLinejoin="round" strokeLinecap="round" opacity="0.95" />
          <path
            d={d}
            fill="none"
            stroke={dark}
            strokeWidth={width * 0.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            opacity="0.5"
            transform="translate(0.8 0.7)"
          />
        </>
      )}
    </>
  );
}

/**
 * A line drawn by hand: gone over twice, the second pass lighter and beside the first.
 * For stems, whiskers, rails, straps - anything that is a line rather than a shape.
 */
export function Pen({
  d,
  colour,
  width = 2.4,
  cap = "round",
  opacity = 1,
}: {
  d: string;
  colour: string;
  width?: number;
  cap?: "round" | "butt" | "square";
  opacity?: number;
}) {
  return (
    <>
      <path d={d} fill="none" stroke={colour} strokeWidth={width} strokeLinecap={cap} strokeLinejoin="round" opacity={opacity} />
      <path
        d={d}
        fill="none"
        stroke={colour}
        strokeWidth={width * 0.55}
        strokeLinecap={cap}
        strokeLinejoin="round"
        opacity={0.45 * opacity}
        transform="translate(0.7 0.6)"
      />
    </>
  );
}

/**
 * The white bloom left where the wax did not take - a highlight. Sits on top of colour,
 * never on paper, so it is always the last thing in a shape.
 */
export function Shine({ d, opacity = 0.55 }: { d: string; opacity?: number }) {
  return <path d={d} fill="none" stroke="#FFFFFF" strokeWidth="3.2" strokeLinecap="round" opacity={opacity} />;
}

/** Groups a drawing so `Pencil`'s defs stay next to what uses them. */
export function Drawing({ children }: { children: ReactNode }) {
  return <g>{children}</g>;
}
