/**
 * The filter sprite. Mount once, near the root; every drawing points into it.
 *
 * `feTurbulence` is not cheap, so the filters are shared rather than per-shape, and
 * the wobble goes on a whole group rather than on each path.
 */

import { WOBBLE_VARIANTS } from "./crayon";

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
