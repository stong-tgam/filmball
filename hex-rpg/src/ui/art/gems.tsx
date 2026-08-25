/**
 * The stones.
 *
 * A cut jewel, drawn the way a child draws one: a hexagon with a flat top and three
 * facets, and a white glint in the corner. Nothing clever - it has to read at 24px in
 * the party list and at 120px on a find card, and the shape is what carries it at both
 * sizes, not the shading.
 *
 * The colour is the whole identity, and it comes from `src/palette.ts` like every other
 * colour that names a thing. See `docs/art-direction.md` before changing the line work.
 */

import { GEMS, type GemKind } from "../../game/gems";
import { darken, wobbleFor } from "./crayon";

/** Drawn on a 100×100 box, like every other piece of art in here. */
export default function GemArt({ kind = "green" as GemKind }: { kind?: GemKind }) {
  const colour = GEMS[kind].colour;
  const edge = darken(colour);
  return (
    <g filter={wobbleFor(`gem-${kind}`)}>
      {/* The body: a squat hexagon, wider than it is tall, like a cut stone. */}
      <polygon points="50,14 82,36 72,80 28,80 18,36" fill={colour} stroke={edge} strokeWidth="3" />
      {/* The table, and the two facets running off it. Same ink, thinner. */}
      <polygon points="50,14 82,36 50,46 18,36" fill="#ffffff" opacity="0.28" stroke={edge} strokeWidth="2" />
      <path d="M18 36 L50 46 L28 80" fill="#000000" opacity="0.14" stroke={edge} strokeWidth="2" />
      <path d="M82 36 L50 46 L72 80" fill="#ffffff" opacity="0.12" stroke={edge} strokeWidth="2" />
      {/* The glint. Every drawn jewel has one and a child will miss it if it is gone. */}
      <path d="M34 28 L44 24" stroke="#ffffff" strokeWidth="4" strokeLinecap="round" opacity="0.9" />
    </g>
  );
}
