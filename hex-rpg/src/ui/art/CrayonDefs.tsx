/**
 * The filter sprite. Mount once, near the root; every drawing points into it.
 *
 * `feTurbulence` is not cheap, so the filters are shared rather than per-shape, and
 * the wobble goes on a whole group rather than on each path.
 */

import type { ReactNode } from "react";
import { WOBBLE_VARIANTS, wobbleFor } from "./crayon";

/**
 * Wraps children in the hand-drawn wobble.
 *
 * Use this rather than putting `filter={wobbleFor(...)}` on a group yourself. An SVG
 * filter measured in objectBoundingBox units collapses when the box has no width or
 * no height — a group of nothing but horizontal lines, say — and the browser then
 * draws nothing at all, silently. The invisible rect underneath guarantees the group
 * has a box to measure.
 */
export function Wobble({
  name,
  extent,
  children,
}: {
  name: string;
  /** Half-width of the guaranteed box, in the same units as the children. */
  extent: number;
  children: ReactNode;
}) {
  return (
    <g filter={wobbleFor(name)}>
      <rect
        x={-extent}
        y={-extent}
        width={extent * 2}
        height={extent * 2}
        fill="none"
        stroke="none"
        pointerEvents="none"
      />
      {children}
    </g>
  );
}

export default function CrayonDefs() {
  return (
    <svg width="0" height="0" aria-hidden="true" style={{ position: "absolute" }}>
      <defs>
        {Array.from({ length: WOBBLE_VARIANTS }, (_, i) => (
          <filter
            key={i}
            id={`crayon-wobble-${i}`}
            x="-14%"
            y="-14%"
            width="128%"
            height="128%"
          >
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.021"
              numOctaves="3"
              seed={7 + i * 13}
              result="n"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="n"
              scale="3.4"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        ))}

        {/*
          Hatching, as patterns rather than paths. The tile sheet's fields are not
          filled in, they are ploughed - and the change of angle between two fields is
          what makes them read as different fields. Sixty-one tiles' worth of hatch
          lines as real paths would cost frames; a tiled pattern costs nothing.
        */}
        <pattern id="hatch-furrow-a" width="11" height="11" patternUnits="userSpaceOnUse" patternTransform="rotate(-18)">
          <path d="M-2 3 h15" stroke="#A9713F" strokeWidth="2.2" strokeLinecap="round" opacity="0.85" />
          <path d="M-2 8 h15" stroke="#A9713F" strokeWidth="1.3" strokeLinecap="round" opacity="0.5" />
        </pattern>
        <pattern id="hatch-furrow-b" width="11" height="11" patternUnits="userSpaceOnUse" patternTransform="rotate(28)">
          <path d="M-2 3 h15" stroke="#A9713F" strokeWidth="2.2" strokeLinecap="round" opacity="0.85" />
          <path d="M-2 8 h15" stroke="#A9713F" strokeWidth="1.3" strokeLinecap="round" opacity="0.5" />
        </pattern>

        {/* Grass is short flicks, never a wash. */}
        <pattern id="flick-grass" width="13" height="13" patternUnits="userSpaceOnUse">
          <path d="M3 11 l1 -6 M9 12 l-1 -5 M6 6 l1 -4" stroke="#4F8F33" strokeWidth="1.5" strokeLinecap="round" opacity="0.55" />
        </pattern>

        {/* Waxy tooth. Large flat areas only - it is the expensive one. */}
        <filter id="crayon-grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.8" numOctaves="3" result="g" />
          <feColorMatrix in="g" type="saturate" values="0" result="gm" />
          <feComponentTransfer in="gm" result="ga">
            <feFuncA type="linear" slope="0.5" />
          </feComponentTransfer>
          <feComposite in="ga" in2="SourceGraphic" operator="in" result="speck" />
          <feBlend in="SourceGraphic" in2="speck" mode="multiply" />
        </filter>
      </defs>
    </svg>
  );
}
