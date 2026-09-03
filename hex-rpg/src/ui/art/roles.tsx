/**
 * The five characters, drawn in the same hand as everything else.
 *
 * Until now a player's token was a coloured disc with their initial on it — the only
 * thing on the board with no drawing behind it, which on a role picker is exactly the
 * wrong place for a letter. "I want to be the knight" is the first decision anybody
 * makes, and it should be made by looking at a knight.
 *
 * Drawn from the owner's own reference sketches: a knight in plate with a round shield,
 * a hooded rogue with a dagger, a scout with a spyglass, a doctor with a bag, and the
 * fisher with the rod. They are stand-ins for those scans, not replacements — every one
 * of these has an upload slot (`art/overrides.ts`, `role:<name>`), so a photograph of
 * the real drawing takes over the moment there is one.
 *
 * Conventions from `docs/art-direction.md`: everything on the shared 100x100 canvas,
 * `Pencil` for coloured shapes so the paper shows through, `Pen` for lines, and a
 * `wobbleFor` filter on the group so no two are ruled quite straight.
 */

import { INK, MARKER, darken, wobbleFor } from "./crayon";
import { Pen, Pencil } from "./pencil";
import type { Role } from "../../game/types";

const SKIN = "#F2C9A0";
const STEEL = "#B9C2CC";
const GOLD = "#E8B93C";
/** The rogue's cloak. Kept out of `MARKER` because nothing else uses this navy. */
const NAVY_CLOAK = "#3B5488";

type Art = (p: { seedName: string }) => JSX.Element;

/** A head, since all five need one and only the hat changes. */
const Face = ({ cx = 50, cy = 34, r = 13 }: { cx?: number; cy?: number; r?: number }) => (
  <>
    <Pencil d={`M${cx} ${cy - r} a${r} ${r} 0 1 0 0.1 0 Z`} fill={SKIN} />
    <circle cx={cx - r * 0.34} cy={cy} r="1.9" fill={INK} />
    <circle cx={cx + r * 0.34} cy={cy} r="1.9" fill={INK} />
    <path
      d={`M${cx - r * 0.36} ${cy + r * 0.42} q${r * 0.36} ${r * 0.32} ${r * 0.72} 0`}
      fill="none"
      stroke={INK}
      strokeWidth="1.7"
      strokeLinecap="round"
    />
  </>
);

/** Knight: plate, a sword up, and the round blue shield off the reference. */
const Knight: Art = ({ seedName }) => (
  <g filter={wobbleFor(seedName)}>
    <Pencil d="M30 92 v-30 q0 -18 20 -18 q20 0 20 18 v30 Z" fill={STEEL} stroke={darken(STEEL, 0.4)} />
    <Face />
    {/* Helmet: a dome with the visor slit, which is what makes it read at token size. */}
    <Pencil d="M35 34 a15 15 0 0 1 30 0 v-2 q0 -12 -15 -12 q-15 0 -15 12 Z" fill={STEEL} stroke={darken(STEEL, 0.4)} />
    <Pen d="M38 32 h24" colour={darken(STEEL, 0.5)} width={2.6} />
    <Pen d="M50 20 v-8" colour={MARKER.strawberry} width={2.6} />
    {/* Sword, raised. */}
    <Pencil d="M20 46 l5 -30 l5 30 Z" fill="#DCE3EA" stroke={darken(STEEL, 0.45)} />
    <Pencil d="M17 46 h16 v5 h-16 Z" fill={GOLD} />
    <Pencil d="M77 62 a15 15 0 1 0 0.1 0 Z" fill={MARKER.river} stroke={darken(MARKER.river, 0.35)} />
    <Pen d="M77 49 v26" colour={darken(MARKER.river, 0.45)} width={1.8} />
  </g>
);

/** Rogue: the blue hood, and a dagger held up. */
const Rogue: Art = ({ seedName }) => (
  <g filter={wobbleFor(seedName)}>
    <Pencil d="M28 92 q0 -34 12 -46 q10 -10 20 0 q12 12 12 46 Z" fill={NAVY_CLOAK} stroke={darken(NAVY_CLOAK, 0.4)} />
    <Face cy={36} r={12} />
    {/* The hood: over the crown and down both cheeks, so the face sits inside it. */}
    <Pencil
      d="M34 40 q-2 -22 16 -22 q18 0 16 22 q-4 -12 -16 -12 q-12 0 -16 12 Z"
      fill={NAVY_CLOAK}
      stroke={darken(NAVY_CLOAK, 0.45)}
    />
    <Pencil d="M74 30 l4 -16 l4 16 Z" fill={GOLD} stroke={darken(GOLD, 0.4)} />
    <Pencil d="M72 30 h12 v4 h-12 Z" fill="#8A5A2B" />
    <Pen d="M40 66 q10 4 20 0" colour={darken(NAVY_CLOAK, 0.5)} width={2} />
  </g>
);

/** Scout: a wide hat and a spyglass, because the role is two rings of sight. */
const Scout: Art = ({ seedName }) => (
  <g filter={wobbleFor(seedName)}>
    <Pencil d="M32 92 v-28 q0 -16 18 -16 q18 0 18 16 v28 Z" fill={MARKER.leaf} stroke={darken(MARKER.leaf, 0.4)} />
    <Face cy={36} r={12} />
    <Pencil d="M28 26 q22 -12 44 0 q-22 6 -44 0 Z" fill="#7A4A22" stroke={darken("#7A4A22", 0.4)} />
    <Pencil d="M40 26 q10 -12 20 0 Z" fill="#7A4A22" stroke={darken("#7A4A22", 0.4)} />
    <Pencil d="M62 52 h22 v9 h-22 Z" fill="#8A5A2B" stroke={darken("#8A5A2B", 0.4)} />
    <Pencil d="M84 50 h7 v13 h-7 Z" fill={GOLD} />
  </g>
);

/** Doctor: the white coat and the bag with the cross on it. */
const Doctor: Art = ({ seedName }) => (
  <g filter={wobbleFor(seedName)}>
    <Pencil d="M31 92 v-30 q0 -17 19 -17 q19 0 19 17 v30 Z" fill="#F3F0E8" stroke="#B9B3A4" />
    <Face cy={34} r={12.5} />
    <Pen d="M50 46 v40" colour="#B9B3A4" width={2} />
    <Pencil d="M64 66 h22 v18 h-22 Z" fill="#8A5A2B" stroke={darken("#8A5A2B", 0.4)} />
    <Pen d="M75 70 v10" colour="#F3F0E8" width={3.4} />
    <Pen d="M70 75 h10" colour="#F3F0E8" width={3.4} />
    {/* Stethoscope, because a white coat alone is not obviously a doctor at 46px. */}
    <path d="M42 48 q-6 14 4 18 q10 4 12 -8" fill="none" stroke={MARKER.strawberry} strokeWidth="2.4" strokeLinecap="round" />
  </g>
);

/** Fisher: the hat and the rod, matching the one already drawn in `items.tsx`. */
const Fisher: Art = ({ seedName }) => (
  <g filter={wobbleFor(seedName)}>
    <Pencil d="M32 92 v-28 q0 -16 18 -16 q18 0 18 16 v28 Z" fill={MARKER.river} stroke={darken(MARKER.river, 0.4)} />
    <Face cy={36} r={12} />
    <Pencil d="M30 27 q20 -14 40 0 q-20 5 -40 0 Z" fill={GOLD} stroke={darken(GOLD, 0.4)} />
    <Pencil d="M40 27 q10 -13 20 0 Z" fill={GOLD} stroke={darken(GOLD, 0.4)} />
    <Pencil d="M18 88 l4 -4 l50 -52 l-4 4 Z" fill="#8A5A2B" stroke={darken("#8A5A2B", 0.4)} />
    <path d="M70 34 q9 18 2 32" fill="none" stroke={INK} strokeWidth="1.6" strokeLinecap="round" />
    <path d="M72 66 q-1 7 -7 7" fill="none" stroke="#9AA5B1" strokeWidth="2.4" strokeLinecap="round" />
  </g>
);

const ROLE_ART: Record<Role, Art> = {
  knight: Knight,
  rogue: Rogue,
  scout: Scout,
  doctor: Doctor,
  fisherman: Fisher,
};

export { roleSlot } from "../../artslots";

export default function RoleArt({ role, seedName }: { role: Role; seedName?: string }) {
  const Art = ROLE_ART[role];
  return <Art seedName={seedName ?? role} />;
}
