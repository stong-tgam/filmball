/**
 * Every monster in the game, drawn in marker.
 *
 * There are more monsters on the board than there are drawings - fifteen bandits share
 * five faces, four ogres share two - so which drawing a monster gets is picked from its
 * id and never changes. Two children drawing fifteen goblins would not draw fifteen
 * different goblins either.
 *
 * All artwork is on a 100x100 canvas with the creature standing roughly in the middle
 * 70 units, so a token can crop to a circle without losing a limb.
 */

import { MARKER, darken, pickFor, wobbleFor } from "./crayon";
import type { EnemyKind } from "../../game/types";

type ArtProps = { seedName: string };

/** Eyes, mouths and dots are the one place charcoal is allowed. */
const EYE = "#23201C";

function Eyes({ x = 50, y = 42, gap = 9, r = 3 }: { x?: number; y?: number; gap?: number; r?: number }) {
  return (
    <g fill={EYE}>
      <circle cx={x - gap} cy={y} r={r} />
      <circle cx={x + gap} cy={y} r={r} />
    </g>
  );
}

/* ------------------------------------------------------------------- mobs */

/** Purple blob: one round body, a grin, and four stubby feet. */
function Blob({ seedName }: ArtProps) {
  const c = "#8E4FA8";
  return (
    <g filter={wobbleFor(seedName)}>
      <path d="M50 24 q24 0 25 26 q1 24 -25 26 q-26 -2 -25 -26 q1 -26 25 -26 Z" fill={c} opacity="0.93" />
      <path d="M51 25 q24 0 25 26 q1 24 -25 26 q-26 -2 -25 -26 q1 -26 25 -26 Z" fill="none" stroke={darken(c)} strokeWidth="2.6" />
      <Eyes y={44} gap={10} />
      <path d="M40 58 q10 9 20 0" fill="none" stroke={EYE} strokeWidth="2.4" strokeLinecap="round" />
      <g stroke={darken(c)} strokeWidth="4" strokeLinecap="round">
        <path d="M34 76 l-3 8" /><path d="M44 78 l-1 8" />
        <path d="M56 78 l1 8" /><path d="M66 76 l3 8" />
      </g>
    </g>
  );
}

/** Goblin: pointy ears, a tuft of hair and a cocoa tunic. */
function Goblin({ seedName }: ArtProps) {
  const skin = "#6FA24A";
  const cloth = MARKER.cocoa;
  return (
    <g filter={wobbleFor(seedName)}>
      <path d="M36 62 h28 l5 22 h-38 Z" fill={cloth} opacity="0.93" />
      <path d="M37 63 h28 l5 22 h-38 Z" fill="none" stroke={darken(cloth)} strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M50 22 q19 0 19 22 q0 18 -19 18 q-19 0 -19 -18 q0 -22 19 -22 Z" fill={skin} opacity="0.94" />
      <path d="M31 34 l-11 -8 l8 14 Z M69 34 l11 -8 l-8 14 Z" fill={skin} stroke={darken(skin)} strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M51 23 q19 0 19 22 q0 18 -19 18 q-19 0 -19 -18 q0 -22 19 -22 Z" fill="none" stroke={darken(skin)} strokeWidth="2.6" />
      <path d="M44 20 l3 -8 l4 7 l4 -7 l3 8" fill="none" stroke={darken(skin)} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      <Eyes y={40} gap={8} r={2.8} />
      <path d="M42 50 l4 4 l4 -4 l4 4 l4 -4" fill="none" stroke={EYE} strokeWidth="2.2" strokeLinejoin="round" />
    </g>
  );
}

/** Little dragon: four legs, one wing, a long tail. */
function Lizard({ seedName }: ArtProps) {
  const body = "#5FA36A";
  const wing = "#7FB3D9";
  return (
    <g filter={wobbleFor(seedName)}>
      <path d="M28 66 q-12 4 -14 -6 q8 4 12 0" fill={body} stroke={darken(body)} strokeWidth="2" strokeLinejoin="round" />
      <path d="M30 50 q22 -8 40 2 q10 3 8 14 q-2 10 -16 10 h-26 q-12 0 -12 -12 q0 -10 6 -14 Z" fill={body} opacity="0.93" />
      <path d="M31 51 q22 -8 40 2 q10 3 8 14 q-2 10 -16 10 h-26 q-12 0 -12 -12 q0 -10 6 -14 Z" fill="none" stroke={darken(body)} strokeWidth="2.6" />
      <path d="M44 50 q10 -22 26 -14 q-8 8 -8 16 Z" fill={wing} opacity="0.9" stroke={darken(wing)} strokeWidth="2.2" strokeLinejoin="round" />
      <path d="M70 52 q14 -4 16 -14 q2 -10 -8 -10 q-10 0 -10 10 q0 8 2 14 Z" fill={body} opacity="0.95" stroke={darken(body)} strokeWidth="2.4" />
      <circle cx="76" cy="34" r="2.6" fill={EYE} />
      <path d="M84 36 l6 -1" stroke={EYE} strokeWidth="2" strokeLinecap="round" />
      <g stroke={darken(body)} strokeWidth="4.5" strokeLinecap="round">
        <path d="M38 76 l-2 8" /><path d="M52 78 l0 8" /><path d="M64 76 l3 8" />
      </g>
    </g>
  );
}

/** Green ogre: heavy shoulders, red eyes, two tusks. */
function Ogre({ seedName }: ArtProps) {
  const skin = "#4E9E52";
  return (
    <g filter={wobbleFor(seedName)}>
      <path d="M30 52 q0 -16 20 -16 q20 0 20 16 v22 q0 12 -20 12 q-20 0 -20 -12 Z" fill={skin} opacity="0.93" />
      <path d="M31 53 q0 -16 20 -16 q20 0 20 16 v22 q0 12 -20 12 q-20 0 -20 -12 Z" fill="none" stroke={darken(skin)} strokeWidth="2.8" />
      <path d="M30 56 l-10 8 l4 10 M70 56 l10 8 l-4 10" fill="none" stroke={darken(skin)} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M50 36 q-14 0 -14 -10 q0 -10 14 -10 q14 0 14 10 q0 10 -14 10 Z" fill={skin} stroke={darken(skin)} strokeWidth="2.4" />
      <g fill={MARKER.strawberry}>
        <circle cx="44" cy="24" r="3" /><circle cx="56" cy="24" r="3" />
      </g>
      <path d="M42 31 h16" stroke={EYE} strokeWidth="2.4" strokeLinecap="round" />
      <path d="M44 31 l-1 5 M56 31 l1 5" stroke="#FBF7EE" strokeWidth="3" strokeLinecap="round" />
    </g>
  );
}

/** Imp: small, spiky, far too pleased with itself. */
function Imp({ seedName }: ArtProps) {
  const skin = "#B5C33F";
  return (
    <g filter={wobbleFor(seedName)}>
      <path d="M50 34 q18 0 18 20 q0 18 -18 20 q-18 -2 -18 -20 q0 -20 18 -20 Z" fill={skin} opacity="0.93" />
      <path d="M51 35 q18 0 18 20 q0 18 -18 20 q-18 -2 -18 -20 q0 -20 18 -20 Z" fill="none" stroke={darken(skin)} strokeWidth="2.6" />
      <path d="M36 36 l-4 -12 l12 7 M64 36 l4 -12 l-12 7" fill={skin} stroke={darken(skin)} strokeWidth="2.2" strokeLinejoin="round" />
      <Eyes y={50} gap={8} r={3} />
      <path d="M42 62 q8 7 16 0 q-8 3 -16 0 Z" fill={MARKER.strawberry} stroke={EYE} strokeWidth="1.8" strokeLinejoin="round" />
      <path d="M68 62 q12 4 10 16" fill="none" stroke={darken(skin)} strokeWidth="3.4" strokeLinecap="round" />
    </g>
  );
}

const MOBS = [Blob, Goblin, Lizard, Ogre, Imp] as const;

/* ------------------------------------------------------------- mid bosses */

/** Scarecrow: a cross, a sack head, and a hat that has seen weather. */
function Scarecrow({ seedName }: ArtProps) {
  const straw = "#D9A441";
  const shirt = "#C06BA8";
  return (
    <g filter={wobbleFor(seedName)}>
      <path d="M50 44 v44" stroke={MARKER.cocoa} strokeWidth="5" strokeLinecap="round" />
      <path d="M22 54 h56" stroke={MARKER.cocoa} strokeWidth="4.5" strokeLinecap="round" />
      <path d="M34 50 h32 l4 26 h-40 Z" fill={shirt} opacity="0.93" />
      <path d="M35 51 h32 l4 26 h-40 Z" fill="none" stroke={darken(shirt)} strokeWidth="2.4" strokeLinejoin="round" />
      <g stroke={straw} strokeWidth="2.6" strokeLinecap="round">
        <path d="M22 54 l-6 -4 M22 56 l-7 2 M78 54 l6 -4 M78 56 l7 2" />
        <path d="M38 76 l-3 8 M50 78 l0 8 M62 76 l3 8" />
      </g>
      <path d="M50 16 q16 0 16 16 q0 14 -16 14 q-16 0 -16 -14 q0 -16 16 -16 Z" fill="#E8D9B0" opacity="0.95" />
      <path d="M51 17 q16 0 16 16 q0 14 -16 14 q-16 0 -16 -14 q0 -16 16 -16 Z" fill="none" stroke={darken("#E8D9B0", 0.45)} strokeWidth="2.4" />
      <g fill={EYE}>
        <path d="M41 28 l7 4 l-7 4 Z" /><path d="M59 28 l-7 4 l7 4 Z" />
      </g>
      <path d="M42 40 l4 -3 l4 3 l4 -3 l4 3" fill="none" stroke={EYE} strokeWidth="2" strokeLinejoin="round" />
      <path d="M28 20 q22 -10 44 0 q-8 4 -22 4 q-14 0 -22 -4 Z" fill={MARKER.sunshine} stroke={darken(MARKER.sunshine)} strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M36 20 q4 -12 14 -12 q10 0 14 12" fill={MARKER.sunshine} stroke={darken(MARKER.sunshine)} strokeWidth="2.4" />
    </g>
  );
}

/** Sea serpent: three humps of river, one small head. */
function SeaSerpent({ seedName }: ArtProps) {
  const body = "#4FA9A0";
  return (
    <g filter={wobbleFor(seedName)}>
      <path d="M12 74 q10 -20 22 0 q10 -20 22 0 q10 -18 20 -2" fill="none" stroke={body} strokeWidth="12" strokeLinecap="round" />
      <path d="M12 74 q10 -20 22 0 q10 -20 22 0 q10 -18 20 -2" fill="none" stroke={darken(body)} strokeWidth="2.4" strokeDasharray="1 13" strokeLinecap="round" />
      <path d="M76 34 q14 -2 14 10 q0 12 -14 10 q-10 -2 -10 -10 q0 -8 10 -10 Z" fill={body} opacity="0.95" />
      <path d="M77 35 q14 -2 14 10 q0 12 -14 10 q-10 -2 -10 -10 q0 -8 10 -10 Z" fill="none" stroke={darken(body)} strokeWidth="2.4" />
      <circle cx="83" cy="41" r="2.6" fill={EYE} />
      <path d="M70 46 q-8 2 -12 -2" stroke={MARKER.strawberry} strokeWidth="2.2" strokeLinecap="round" fill="none" />
      <path d="M78 30 l2 -8 l5 7" fill={body} stroke={darken(body)} strokeWidth="2" strokeLinejoin="round" />
      <path d="M8 84 q16 6 32 0 q16 -6 32 0" fill="none" stroke={MARKER.river} strokeWidth="3" strokeLinecap="round" opacity="0.75" />
    </g>
  );
}

const MIDBOSSES = [Scarecrow, SeaSerpent] as const;

/* ------------------------------------------------------------- final boss */

/** Two heads, gold belly, and wings that fill the tile. Nobody mistakes this one. */
function Dragon({ seedName }: ArtProps) {
  const body = MARKER.strawberry;
  const belly = MARKER.sunshine;
  return (
    <g filter={wobbleFor(seedName)}>
      <path d="M26 44 q-18 -18 -20 4 q-2 20 16 24 Z" fill={darken(body, 0.15)} opacity="0.9" stroke={darken(body)} strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M74 44 q18 -18 20 4 q2 20 -16 24 Z" fill={darken(body, 0.15)} opacity="0.9" stroke={darken(body)} strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M32 52 q18 -10 36 0 q10 6 8 20 q-2 14 -26 14 q-24 0 -26 -14 q-2 -14 8 -20 Z" fill={body} opacity="0.94" />
      <path d="M33 53 q18 -10 36 0 q10 6 8 20 q-2 14 -26 14 q-24 0 -26 -14 q-2 -14 8 -20 Z" fill="none" stroke={darken(body)} strokeWidth="2.8" />
      <path d="M38 72 q12 8 24 0 q-2 12 -12 13 q-10 -1 -12 -13 Z" fill={belly} opacity="0.9" />
      <g>
        <path d="M38 52 q-6 -16 6 -20 q12 -4 14 8 q2 10 -4 14 Z" fill={body} opacity="0.95" stroke={darken(body)} strokeWidth="2.4" strokeLinejoin="round" />
        <circle cx="44" cy="38" r="2.4" fill={EYE} />
        <path d="M40 30 l-2 -7 l6 4" fill={body} stroke={darken(body)} strokeWidth="1.8" strokeLinejoin="round" />
      </g>
      <g>
        <path d="M62 52 q6 -16 -6 -20 q-12 -4 -14 8" fill="none" stroke="none" />
        <path d="M62 52 q8 -16 -2 -21 q-12 -6 -16 5 q-4 11 4 16 Z" fill={body} opacity="0.95" stroke={darken(body)} strokeWidth="2.4" strokeLinejoin="round" />
        <circle cx="56" cy="36" r="2.4" fill={EYE} />
        <path d="M60 28 l3 -7 l2 7" fill={body} stroke={darken(body)} strokeWidth="1.8" strokeLinejoin="round" />
      </g>
      <path d="M50 44 q-4 6 -10 6 M50 44 q4 6 10 6" fill="none" stroke={MARKER.sunshine} strokeWidth="2.6" strokeLinecap="round" />
      <path d="M74 80 q14 4 16 -8" fill="none" stroke={darken(body)} strokeWidth="4.5" strokeLinecap="round" />
    </g>
  );
}

/* --------------------------------------------------------------- thieves */

/** Robber: mask, cap, and a sack that is doing well for itself. */
function Robber({ seedName }: ArtProps) {
  const cloth = "#3A4453";
  return (
    <g filter={wobbleFor(seedName)}>
      <path d="M36 48 h22 l6 36 h-34 Z" fill={cloth} opacity="0.93" />
      <path d="M37 49 h22 l6 36 h-34 Z" fill="none" stroke={darken(cloth)} strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M47 22 q15 0 15 14 q0 12 -15 12 q-15 0 -15 -12 q0 -14 15 -14 Z" fill="#E8C9A8" stroke={darken("#E8C9A8", 0.45)} strokeWidth="2.4" />
      <path d="M31 30 h32 v7 h-32 Z" fill={cloth} />
      <g fill="#FBF7EE"><circle cx="41" cy="33" r="2.2" /><circle cx="53" cy="33" r="2.2" /></g>
      <path d="M30 24 q17 -10 34 0 q-17 4 -34 0 Z" fill={cloth} stroke={darken(cloth)} strokeWidth="2" strokeLinejoin="round" />
      <path d="M66 58 q16 -4 18 12 q2 16 -14 16 q-14 0 -12 -14 q1 -12 8 -14 Z" fill="#B08A52" opacity="0.95" stroke={darken("#B08A52")} strokeWidth="2.4" />
      <g fill={MARKER.sunshine}>
        <circle cx="72" cy="72" r="3" /><circle cx="79" cy="76" r="3" /><circle cx="73" cy="80" r="3" />
      </g>
    </g>
  );
}

/** Pirates: a flag, a hat and a cutlass. Plural, so the drawing is a crew. */
function Pirates({ seedName }: ArtProps) {
  const coat = "#8E3A3A";
  return (
    <g filter={wobbleFor(seedName)}>
      <path d="M24 84 v-52" stroke={MARKER.cocoa} strokeWidth="3.4" strokeLinecap="round" />
      <path d="M24 32 h30 l-6 9 l6 9 h-30 Z" fill="#2A2A2A" opacity="0.95" stroke={darken("#2A2A2A", 0.2)} strokeWidth="2" strokeLinejoin="round" />
      <g fill="#FBF7EE">
        <circle cx="36" cy="39" r="4.5" />
        <rect x="33" y="43" width="6" height="3" rx="1.2" />
      </g>
      <path d="M56 54 h22 l4 30 h-30 Z" fill={coat} opacity="0.93" />
      <path d="M57 55 h22 l4 30 h-30 Z" fill="none" stroke={darken(coat)} strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M67 30 q14 0 14 12 q0 10 -14 10 q-14 0 -14 -10 q0 -12 14 -12 Z" fill="#E8C9A8" stroke={darken("#E8C9A8", 0.45)} strokeWidth="2.4" />
      <path d="M51 32 q16 -12 32 0 q-16 5 -32 0 Z" fill="#2A2A2A" stroke={darken("#2A2A2A", 0.2)} strokeWidth="2" strokeLinejoin="round" />
      <g fill={EYE}><circle cx="62" cy="41" r="2.2" /></g>
      <path d="M70 39 l8 -2" stroke={EYE} strokeWidth="1.8" strokeLinecap="round" />
      <path d="M84 58 q10 -12 6 -22" fill="none" stroke="#9AA5B1" strokeWidth="3.4" strokeLinecap="round" />
      <path d="M40 84 q20 6 44 0" fill="none" stroke={MARKER.river} strokeWidth="3.4" strokeLinecap="round" opacity="0.8" />
    </g>
  );
}

/* ------------------------------------------------------------- dispatcher */

/**
 * The drawing for one monster. `seedName` is its id, so the same bandit keeps the same
 * face and the same wobble for the whole game.
 */
export default function MonsterArt({ kind, seedName }: { kind: EnemyKind; seedName: string }) {
  switch (kind) {
    case "mob": {
      const Mob = pickFor(seedName, MOBS);
      return <Mob seedName={seedName} />;
    }
    case "midboss": {
      const Boss = pickFor(seedName, MIDBOSSES);
      return <Boss seedName={seedName} />;
    }
    case "finalboss":
      return <Dragon seedName={seedName} />;
    case "robber":
      return <Robber seedName={seedName} />;
    case "pirates":
      return <Pirates seedName={seedName} />;
  }
}

/** Named exports, for the gallery and for anything that wants one specific drawing. */
export const MOB_ART = { Blob, Goblin, Lizard, Ogre, Imp };
export const BOSS_ART = { Scarecrow, SeaSerpent, Dragon, Robber, Pirates };
export const MOB_NAMES = ["Blob", "Goblin", "Lizard", "Ogre", "Imp"] as const;

export { monsterSlot } from "../../artslots";
