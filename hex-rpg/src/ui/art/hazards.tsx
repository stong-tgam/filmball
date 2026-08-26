/**
 * The two wanderers that are only wanderers.
 *
 * The robber and the pirates are drawn by `MonsterArt` and always have been - they are
 * fightable, so they are monsters that happen to walk about, and giving them a second
 * picture here would mean two drawings of one character and two squares in the art room
 * for the family to fill in. `hazardSlot` sends them to the monster's picture instead.
 *
 * These two have nothing to fight, so they had no drawing at all: they were an emoji on
 * a coloured plaque, which is the one place in the game where a system font decided
 * what something looked like. A tornado and somebody down on their luck, in the same
 * marker-on-card hand as everything else.
 */

import { INK, MARKER, darken, wobbleFor } from "./crayon";
import { PALETTE } from "../../palette";
import type { HazardKind } from "../../game/types";

/** Which picture a wanderer uses. Thieves point at their monster drawing. */
export { hazardSlot } from "../../artslots";

function Tornado() {
  const grey = PALETTE.tornado;
  return (
    <g filter={wobbleFor("hazard-tornado")}>
      {/* A funnel, widest at the top, drawn as four stacked sweeps so it reads as
          turning rather than as a cone. */}
      <path
        d="M14 16 h72 l-14 20 h-44 Z"
        fill={grey}
        stroke={darken(grey)}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path d="M28 36 h44 l-9 18 h-26 Z" fill={grey} stroke={darken(grey)} strokeWidth="3" />
      <path d="M37 54 h26 l-6 16 h-14 Z" fill={grey} stroke={darken(grey)} strokeWidth="3" />
      <path d="M43 70 h14 l-5 14 h-4 Z" fill={grey} stroke={darken(grey)} strokeWidth="3" />
      {/* The spin. Lighter strokes across the funnel, which is what makes it a tornado
          and not a grey triangle. */}
      <g stroke="#ffffff" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.75">
        <path d="M22 24 q26 8 54 0" />
        <path d="M33 42 q18 6 36 0" />
        <path d="M40 60 q11 4 21 0" />
      </g>
      {/* Bits of the world going round with it. */}
      <circle cx="20" cy="52" r="4" fill={MARKER.cocoa} stroke={INK} strokeWidth="2" />
      <circle cx="82" cy="44" r="3.5" fill={MARKER.leaf} stroke={INK} strokeWidth="2" />
      <circle cx="74" cy="76" r="3" fill={MARKER.cocoa} stroke={INK} strokeWidth="2" />
    </g>
  );
}

function Traveller() {
  const green = PALETTE.homeless;
  return (
    <g filter={wobbleFor("hazard-homeless")}>
      {/* The umbrella first, because it is the thing you recognise from across a table
          - §5.5 calls them the traveller and the umbrella is the whole silhouette. */}
      <path
        d="M18 40 a32 32 0 0 1 64 0 Z"
        fill={green}
        stroke={darken(green)}
        strokeWidth="3"
        strokeLinejoin="round"
      />
      <path d="M18 40 q8 8 16 0 q8 8 16 0 q8 8 16 0 q8 8 16 0" fill="none" stroke={darken(green)} strokeWidth="2.5" />
      <path d="M50 40 v34" stroke={MARKER.cocoa} strokeWidth="4" strokeLinecap="round" />
      <path d="M50 74 q-9 0 -9 -8" fill="none" stroke={MARKER.cocoa} strokeWidth="4" strokeLinecap="round" />
      {/* And somebody under it. */}
      <circle cx="62" cy="58" r="9" fill="#E8C39A" stroke={INK} strokeWidth="2.5" />
      <path d="M53 88 q0 -20 9 -20 q9 0 9 20 Z" fill={MARKER.river} stroke={darken(MARKER.river)} strokeWidth="2.5" />
      <path d="M58 56 h2 M65 56 h2" stroke={INK} strokeWidth="2.5" strokeLinecap="round" />
      <path d="M58 62 q4 3 8 0" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" />
    </g>
  );
}

/** Drawn on the usual 100x100 box. Thieves are not here; see `hazardSlot`. */
export default function HazardArt({ kind }: { kind: HazardKind }) {
  return kind === "tornado" ? <Tornado /> : <Traveller />;
}
