/**
 * Every item in the game, drawn in marker. Rulebook §12.
 *
 * Ten of the foods are copies of chits the children actually made — cake, bone,
 * carrot, lettuce, strawberry, egg, orange, milk, popsicle, candy — and those are
 * drawn as close to the originals as vectors get, down to the bone being an outline
 * nobody coloured in. The rest follow the same hand.
 *
 * Gear is all named after things in a house rather than a dungeon, which is the joke
 * the rulebook is making: you fight a dragon with a frying pan and bunny slippers.
 */

import { MARKER, darken, lighten, wobbleFor } from "./crayon";

type Art = (p: { seedName: string }) => JSX.Element;

const INK = "#23201C";
const WOOD = MARKER.cocoa;
const STEEL = "#9AA5B1";

/** Outline plus fill, with the fill nudged so it misses the line on one side. */
function Marked({
  d,
  fill,
  stroke,
  width = 2.4,
  nudge = [1, -1],
}: {
  d: string;
  fill: string;
  stroke?: string;
  width?: number;
  nudge?: [number, number];
}) {
  return (
    <>
      <path d={d} fill={fill} opacity="0.93" transform={`translate(${nudge[0]} ${nudge[1]})`} />
      <path d={d} fill="none" stroke={stroke ?? darken(fill)} strokeWidth={width} strokeLinejoin="round" strokeLinecap="round" />
    </>
  );
}

/* ------------------------------------------------------------------ weapons */

const WoodenSword: Art = ({ seedName }) => (
  <g filter={wobbleFor(seedName)}>
    <Marked d="M46 12 h9 v46 h-9 Z" fill="#E0C08A" />
    <Marked d="M34 58 h33 v7 h-33 Z" fill={WOOD} />
    <Marked d="M46 65 h9 v22 h-9 Z" fill={darken(WOOD, 0.2)} />
    <path d="M50 18 v36" stroke={darken("#E0C08A", 0.25)} strokeWidth="1.6" strokeLinecap="round" />
  </g>
);

const FryingPan: Art = ({ seedName }) => (
  <g filter={wobbleFor(seedName)}>
    <Marked d="M62 56 h26 q6 0 6 6 q0 6 -6 6 h-26 Z" fill={INK} stroke="#4A4A4A" />
    <Marked d="M18 40 h48 q4 0 4 10 q0 22 -28 22 q-28 0 -28 -22 q0 -10 4 -10 Z" fill="#3A3A3A" stroke="#111111" />
    <path d="M24 46 h36" stroke="#6B6B6B" strokeWidth="3" strokeLinecap="round" />
  </g>
);

const Slingshot: Art = ({ seedName }) => (
  <g filter={wobbleFor(seedName)}>
    <Marked d="M42 84 h14 v-28 l-14 -20 Z" fill={WOOD} />
    <Marked d="M56 56 l16 -20 h9 l-19 26 Z" fill={WOOD} />
    <path d="M32 34 q18 14 46 2" fill="none" stroke={MARKER.strawberry} strokeWidth="3.2" strokeLinecap="round" />
    <circle cx="55" cy="41" r="5" fill="#8A8A8A" stroke={darken("#8A8A8A")} strokeWidth="2" />
  </g>
);

const BigStick: Art = ({ seedName }) => (
  <g filter={wobbleFor(seedName)}>
    <Marked d="M32 86 q10 -30 18 -44 q8 -14 20 -26" fill="none" stroke={WOOD} width={9} />
    <Marked d="M62 26 q10 -6 12 2 q2 8 -8 8 q-6 0 -4 -10 Z" fill={darken(WOOD, 0.15)} />
    <path d="M44 56 l9 -5 M52 42 l9 -4" stroke={darken(WOOD, 0.3)} strokeWidth="2" strokeLinecap="round" />
  </g>
);

const Broom: Art = ({ seedName }) => (
  <g filter={wobbleFor(seedName)}>
    <Marked d="M52 8 l6 0 l-8 52 l-6 0 Z" fill={WOOD} />
    <Marked d="M30 58 h34 l8 30 h-50 Z" fill="#D9A441" />
    <g stroke={darken("#D9A441", 0.3)} strokeWidth="2" strokeLinecap="round">
      <path d="M36 64 l-4 22 M46 64 l-2 22 M56 64 l2 22 M64 64 l4 22" />
    </g>
  </g>
);

/* ------------------------------------------------------------------- armour */

const PotHelmet: Art = ({ seedName }) => (
  <g filter={wobbleFor(seedName)}>
    <Marked d="M26 66 q0 -34 24 -34 q24 0 24 34 Z" fill={STEEL} />
    <Marked d="M20 66 h60 v9 h-60 Z" fill={darken(STEEL, 0.2)} />
    <path d="M74 44 q12 2 12 12 q0 8 -10 8" fill="none" stroke={darken(STEEL, 0.3)} strokeWidth="3.4" strokeLinecap="round" />
    <path d="M38 44 q6 -6 14 -4" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.8" />
  </g>
);

const TurtleShell: Art = ({ seedName }) => (
  <g filter={wobbleFor(seedName)}>
    <Marked d="M50 24 q28 0 28 28 q0 24 -28 26 q-28 -2 -28 -26 q0 -28 28 -28 Z" fill={MARKER.leaf} />
    <g fill="none" stroke={darken(MARKER.leaf, 0.4)} strokeWidth="2.2" strokeLinejoin="round">
      <path d="M50 34 l12 8 l-5 14 h-14 l-5 -14 Z" />
      <path d="M50 34 v-8 M62 42 l10 -4 M57 56 l7 12 M43 56 l-7 12 M38 42 l-10 -4" />
    </g>
  </g>
);

const WinterCoat: Art = ({ seedName }) => (
  <g filter={wobbleFor(seedName)}>
    <Marked d="M34 26 h32 l14 12 l-8 10 l-4 -4 v38 h-36 v-38 l-4 4 l-8 -10 Z" fill={MARKER.river} />
    <path d="M50 26 v56" stroke={darken(MARKER.river, 0.4)} strokeWidth="2.2" />
    <g fill={MARKER.sunshine}>
      <circle cx="55" cy="42" r="2.6" /><circle cx="55" cy="54" r="2.6" /><circle cx="55" cy="66" r="2.6" />
    </g>
    <path d="M34 26 q16 10 32 0" fill={lighten(MARKER.river, 0.55)} stroke={darken(MARKER.river, 0.4)} strokeWidth="2" />
  </g>
);

const CardboardBox: Art = ({ seedName }) => (
  <g filter={wobbleFor(seedName)}>
    <Marked d="M24 40 h52 v42 h-52 Z" fill="#C89A62" />
    <Marked d="M24 40 l14 -12 h24 l14 12 Z" fill="#D8AE78" />
    <path d="M50 28 v54" stroke={darken("#C89A62", 0.35)} strokeWidth="2.2" />
    <path d="M30 54 h14 M56 62 h14" stroke={darken("#C89A62", 0.35)} strokeWidth="2" strokeLinecap="round" />
  </g>
);

const OvenMitts: Art = ({ seedName }) => (
  <g filter={wobbleFor(seedName)}>
    <Marked d="M24 40 q0 -12 12 -12 q12 0 12 12 v26 q0 8 -12 8 q-12 0 -12 -8 Z" fill={MARKER.strawberry} />
    <Marked d="M22 44 q-8 2 -8 9 q0 7 8 7" fill={MARKER.strawberry} />
    <Marked d="M54 46 q0 -12 12 -12 q12 0 12 12 v26 q0 8 -12 8 q-12 0 -12 -8 Z" fill={MARKER.strawberry} />
    <Marked d="M78 50 q8 2 8 9 q0 7 -8 7" fill={MARKER.strawberry} />
    <g stroke="#FBF7EE" strokeWidth="3" strokeLinecap="round">
      <path d="M28 68 h16 M58 74 h16" />
    </g>
  </g>
);

/* -------------------------------------------------------------------- boots */

const RunningShoes: Art = ({ seedName }) => (
  <g filter={wobbleFor(seedName)}>
    <Marked d="M18 66 q0 -18 14 -20 q6 -1 10 6 l10 10 h22 q8 0 8 8 v8 h-64 Z" fill="#FBF7EE" stroke="#8A8378" />
    <Marked d="M16 78 h68 v8 h-68 Z" fill={MARKER.river} />
    <path d="M40 56 l14 8 M44 50 l14 8" stroke={MARKER.strawberry} strokeWidth="3" strokeLinecap="round" />
  </g>
);

const RainBoots: Art = ({ seedName }) => (
  <g filter={wobbleFor(seedName)}>
    <Marked d="M22 22 h18 v34 h14 q6 0 6 8 v8 h-38 Z" fill={MARKER.sunshine} />
    <Marked d="M52 34 h18 v26 h10 q6 0 6 8 v6 h-34 Z" fill={MARKER.sunshine} />
    <path d="M22 22 h18 M52 34 h18" stroke={darken(MARKER.sunshine, 0.4)} strokeWidth="3" strokeLinecap="round" />
  </g>
);

const RollerSkates: Art = ({ seedName }) => (
  <g filter={wobbleFor(seedName)}>
    <Marked d="M28 24 h20 v34 h22 q6 0 6 8 v6 h-48 Z" fill="#FBF7EE" stroke="#8A8378" />
    <Marked d="M24 72 h56 v6 h-56 Z" fill={MARKER.grape} />
    <g fill={MARKER.carrot} stroke={darken(MARKER.carrot)} strokeWidth="2">
      <circle cx="36" cy="84" r="6" /><circle cx="68" cy="84" r="6" />
    </g>
    <path d="M32 32 h14 M32 42 h14" stroke={MARKER.strawberry} strokeWidth="2.6" strokeLinecap="round" />
  </g>
);

const BunnySlippers: Art = ({ seedName }) => (
  <g filter={wobbleFor(seedName)}>
    <Marked d="M24 58 q0 -14 14 -14 q14 0 16 12 q2 12 -4 18 h-20 q-6 -4 -6 -16 Z" fill={MARKER.cake} />
    <Marked d="M30 46 q-4 -18 3 -18 q6 0 5 17" fill={lighten(MARKER.cake, 0.4)} />
    <Marked d="M44 46 q4 -18 -3 -18 q-6 0 -5 17" fill={lighten(MARKER.cake, 0.4)} />
    <g fill={INK}><circle cx="33" cy="56" r="2" /><circle cx="43" cy="56" r="2" /></g>
    <path d="M38 62 q-4 3 -6 0 M38 62 q4 3 6 0" fill="none" stroke={INK} strokeWidth="1.8" strokeLinecap="round" />
    <Marked d="M58 78 q0 -12 12 -12 q12 0 14 10 q2 10 -3 14 h-18 q-5 -3 -5 -12 Z" fill={MARKER.cake} />
  </g>
);

const Flippers: Art = ({ seedName }) => (
  <g filter={wobbleFor(seedName)}>
    <Marked d="M26 22 h16 q4 0 4 8 q0 34 -6 50 q-4 8 -8 0 q-6 -16 -6 -50 q0 -8 0 -8 Z" fill={MARKER.leaf} />
    <Marked d="M56 30 h16 q4 0 4 8 q0 30 -6 44 q-4 8 -8 0 q-6 -14 -6 -44 q0 -8 0 -8 Z" fill={MARKER.leaf} />
    <path d="M34 34 v40 M64 42 v34" stroke={darken(MARKER.leaf, 0.35)} strokeWidth="2" strokeLinecap="round" />
  </g>
);

/* ------------------------------------------- food: the children's own chits */

const BirthdayCake: Art = ({ seedName }) => (
  <g filter={wobbleFor(seedName)}>
    <g stroke={MARKER.cake} strokeWidth="2.6" strokeLinecap="round" fill="none">
      <path d="M36 30 q-3 -8 2 -12 M46 28 q-3 -8 2 -12 M56 30 q-3 -8 2 -12" />
    </g>
    <Marked d="M30 34 h42 l6 8 h-54 Z" fill={MARKER.cake} />
    <Marked d="M24 42 h54 v30 h-54 Z" fill={lighten(MARKER.cake, 0.55)} stroke={darken(MARKER.cake, 0.2)} />
    <path d="M24 56 h54" stroke={MARKER.cake} strokeWidth="3" />
    <Marked d="M20 72 h62 v8 h-62 Z" fill={MARKER.cake} />
  </g>
);

const Bone: Art = ({ seedName }) => (
  <g filter={wobbleFor(seedName)}>
    {/* Outline only. Nobody coloured this one in, and that is the point. */}
    <g fill="#FBF7EE" stroke="#6FC5E8" strokeWidth="2.8">
      <circle cx="32" cy="42" r="9" /><circle cx="32" cy="58" r="9" />
      <circle cx="68" cy="42" r="9" /><circle cx="68" cy="58" r="9" />
      <rect x="28" y="43" width="44" height="14" rx="5" />
    </g>
  </g>
);

const Carrot: Art = ({ seedName }) => (
  <g filter={wobbleFor(seedName)}>
    <Marked d="M46 84 L36 40 L64 42 Z" fill={MARKER.carrot} />
    <path d="M42 56 l14 1 M43 66 l11 1" stroke={darken(MARKER.carrot)} strokeWidth="1.8" strokeLinecap="round" />
    <path d="M48 40 q-16 -16 -22 -6 q11 2 18 9" fill={MARKER.leaf} />
    <path d="M51 40 q-2 -20 9 -20 q-2 11 -5 18" fill={MARKER.leaf} />
    <path d="M54 41 q13 -14 20 -5 q-11 0 -16 7" fill={darken(MARKER.leaf, 0.15)} />
  </g>
);

const Lettuce: Art = ({ seedName }) => (
  <g filter={wobbleFor(seedName)}>
    <Marked d="M50 26 q26 0 26 26 q0 24 -26 26 q-26 -2 -26 -26 q0 -26 26 -26 Z" fill={MARKER.leaf} />
    <g fill="none" stroke={darken(MARKER.leaf, 0.35)} strokeWidth="2.2" strokeLinecap="round">
      <path d="M50 32 q-10 14 -4 42 M50 32 q12 14 6 42 M32 46 q12 6 16 20 M68 46 q-12 6 -16 20" />
    </g>
    <path d="M28 30 q10 -8 20 -2 M72 30 q-10 -8 -20 -2" fill={lighten(MARKER.leaf, 0.3)} stroke={darken(MARKER.leaf, 0.3)} strokeWidth="2" />
  </g>
);

const Strawberry: Art = ({ seedName }) => (
  <g filter={wobbleFor(seedName)}>
    <Marked d="M50 32 q24 2 22 24 q-2 22 -22 26 q-20 -4 -22 -26 q-2 -22 22 -24 Z" fill={MARKER.strawberry} />
    <g fill={INK}>
      <ellipse cx="42" cy="48" rx="2" ry="2.6" /><ellipse cx="57" cy="47" rx="2" ry="2.6" />
      <ellipse cx="49" cy="58" rx="2" ry="2.6" /><ellipse cx="38" cy="61" rx="2" ry="2.6" />
      <ellipse cx="61" cy="60" rx="2" ry="2.6" /><ellipse cx="45" cy="70" rx="2" ry="2.6" />
      <ellipse cx="56" cy="70" rx="2" ry="2.6" />
    </g>
    <path d="M34 32 q16 -7 32 0 q-11 7 -16 7 q-5 0 -16 -7 Z" fill={MARKER.leaf} stroke={darken(MARKER.leaf)} strokeWidth="2" strokeLinejoin="round" />
    <path d="M50 30 v-10" stroke={darken(MARKER.leaf)} strokeWidth="3" strokeLinecap="round" />
  </g>
);

const Egg: Art = ({ seedName }) => (
  <g filter={wobbleFor(seedName)}>
    <path
      d="M30 40 q8 -14 22 -10 q16 -6 22 8 q12 4 6 18 q6 14 -10 16 q-10 12 -22 4 q-16 6 -20 -8 q-12 -8 2 -20 Z"
      fill="#FFFFFF" stroke={MARKER.cocoa} strokeWidth="2.4" strokeLinejoin="round"
    />
    <circle cx="52" cy="52" r="13" fill={MARKER.carrot} opacity="0.95" />
    <circle cx="52" cy="52" r="13" fill="none" stroke={darken(MARKER.carrot, 0.25)} strokeWidth="2" />
  </g>
);

const Orange: Art = ({ seedName }) => (
  <g filter={wobbleFor(seedName)}>
    <Marked d="M50 28 q26 0 26 26 q0 26 -26 26 q-26 0 -26 -26 q0 -26 26 -26 Z" fill={MARKER.carrot} />
    <g stroke={darken(MARKER.carrot, 0.25)} strokeWidth="1.8" strokeLinecap="round">
      <path d="M34 44 q16 8 32 0 M32 58 q18 8 36 0" />
    </g>
    <path d="M44 26 l12 8 M56 26 l-12 8" stroke={INK} strokeWidth="2.6" strokeLinecap="round" />
  </g>
);

const Milk: Art = ({ seedName }) => (
  <g filter={wobbleFor(seedName)}>
    <path d="M40 18 h20 v10 l7 12 v42 q0 5 -5 5 h-24 q-5 0 -5 -5 v-42 l7 -12 Z" fill="#FFFFFF" />
    <path d="M40 18 h20 v10 l7 12 v42 q0 5 -5 5 h-24 q-5 0 -5 -5 v-42 l7 -12 Z" fill="none" stroke="#8A8378" strokeWidth="2.4" strokeLinejoin="round" />
    <rect x="34" y="50" width="32" height="17" fill={lighten(MARKER.river, 0.75)} />
    <path d="M34 50 h32 M34 67 h32" stroke={MARKER.river} strokeWidth="2.4" />
    <text x="50" y="63" textAnchor="middle" fontFamily="'Patrick Hand','Comic Sans MS',cursive" fontSize="11" fill={MARKER.river}>MILK</text>
    <path d="M40 18 h20" stroke="#8A8378" strokeWidth="3.6" strokeLinecap="round" />
  </g>
);

const Popsicle: Art = ({ seedName }) => (
  <g filter={wobbleFor(seedName)}>
    <Marked d="M46 66 h9 v22 h-9 Z" fill={WOOD} />
    <Marked d="M34 22 h33 q4 0 4 6 v34 q0 6 -6 6 h-29 q-6 0 -6 -6 v-34 q0 -6 4 -6 Z" fill={MARKER.grape} />
    <path d="M50 28 v32" stroke={darken(MARKER.grape, 0.35)} strokeWidth="2.4" />
    <path d="M40 30 q-3 10 0 20" stroke={lighten(MARKER.grape, 0.5)} strokeWidth="3" strokeLinecap="round" fill="none" />
  </g>
);

const Candy: Art = ({ seedName }) => (
  <g filter={wobbleFor(seedName)}>
    <Marked d="M22 34 l16 16 l-16 16 Z" fill={MARKER.leaf} />
    <Marked d="M78 34 l-16 16 l16 16 Z" fill={MARKER.leaf} />
    <Marked d="M38 40 h24 v20 h-24 Z" fill={MARKER.leaf} />
    <circle cx="50" cy="50" r="9" fill={MARKER.grape} stroke={darken(MARKER.grape)} strokeWidth="2" />
  </g>
);

/* ------------------------------------------------------- food: the rest, +1 */

const Watermelon: Art = ({ seedName }) => (
  <g filter={wobbleFor(seedName)}>
    <Marked d="M14 62 q36 -34 72 0 Z" fill={MARKER.strawberry} />
    <path d="M14 62 q36 -34 72 0" fill="none" stroke={MARKER.leaf} strokeWidth="7" strokeLinecap="round" />
    <g fill={INK}><circle cx="38" cy="52" r="2.2" /><circle cx="50" cy="46" r="2.2" /><circle cx="62" cy="52" r="2.2" /></g>
  </g>
);

const Banana: Art = ({ seedName }) => (
  <g filter={wobbleFor(seedName)}>
    <Marked d="M22 34 q6 40 40 44 q22 2 18 -10 q-30 2 -44 -36 Z" fill={MARKER.sunshine} />
    <path d="M22 34 q-2 -8 4 -8" stroke={WOOD} strokeWidth="4" strokeLinecap="round" fill="none" />
  </g>
);

const ApplePie: Art = ({ seedName }) => (
  <g filter={wobbleFor(seedName)}>
    <Marked d="M18 62 q32 -30 64 0 Z" fill="#E0B872" />
    <Marked d="M14 62 h72 v12 h-72 Z" fill="#C89A52" />
    <g stroke={darken("#E0B872", 0.3)} strokeWidth="2.4" strokeLinecap="round">
      <path d="M34 46 l18 14 M50 40 l16 18 M30 56 l14 6" />
    </g>
  </g>
);

const HotDog: Art = ({ seedName }) => (
  <g filter={wobbleFor(seedName)}>
    <Marked d="M14 44 h72 q8 0 8 10 q0 10 -8 10 h-72 q-8 0 -8 -10 q0 -10 8 -10 Z" fill="#E0B872" />
    <Marked d="M18 42 h64 q6 0 6 7 q0 7 -6 7 h-64 q-6 0 -6 -7 q0 -7 6 -7 Z" fill="#C4593C" />
    <path d="M20 48 q12 8 22 -2 q10 -8 20 2 q10 8 18 -2" fill="none" stroke={MARKER.sunshine} strokeWidth="3.4" strokeLinecap="round" />
  </g>
);

const Corn: Art = ({ seedName }) => (
  <g filter={wobbleFor(seedName)}>
    <Marked d="M50 16 q16 0 16 30 q0 28 -16 40 q-16 -12 -16 -40 q0 -30 16 -30 Z" fill={MARKER.sunshine} />
    <g stroke={darken(MARKER.sunshine, 0.3)} strokeWidth="1.6">
      <path d="M42 30 v46 M50 26 v54 M58 30 v46 M36 44 h28 M36 58 h28" />
    </g>
    <path d="M34 52 q-16 8 -12 26 q14 -4 16 -18" fill={MARKER.leaf} stroke={darken(MARKER.leaf)} strokeWidth="2" />
  </g>
);

const Pancakes: Art = ({ seedName }) => (
  <g filter={wobbleFor(seedName)}>
    {[68, 56, 44].map((y, i) => (
      <g key={i}>
        <ellipse cx="50" cy={y} rx="28" ry="9" fill="#E0B872" opacity="0.95" />
        <ellipse cx="50" cy={y} rx="28" ry="9" fill="none" stroke={darken("#E0B872", 0.3)} strokeWidth="2.2" />
      </g>
    ))}
    <path d="M30 40 q10 -8 20 -2 q10 6 20 -2 q4 12 -8 14 q-14 2 -32 0 Z" fill={MARKER.sunshine} stroke={darken(MARKER.sunshine, 0.3)} strokeWidth="2" />
  </g>
);

const GrilledCheese: Art = ({ seedName }) => (
  <g filter={wobbleFor(seedName)}>
    <Marked d="M20 70 l30 -46 l30 46 Z" fill="#E0B872" />
    <path d="M30 62 q20 -10 40 0" fill={MARKER.sunshine} stroke={darken(MARKER.sunshine, 0.3)} strokeWidth="2.2" />
    <path d="M50 66 q4 12 -4 16" fill="none" stroke={MARKER.sunshine} strokeWidth="4" strokeLinecap="round" />
  </g>
);

const Cherries: Art = ({ seedName }) => (
  <g filter={wobbleFor(seedName)}>
    <path d="M50 22 q-14 18 -18 36 M50 22 q12 20 14 34" fill="none" stroke={MARKER.leaf} strokeWidth="3" strokeLinecap="round" />
    <path d="M50 22 q10 -10 20 -4 q-10 8 -20 4 Z" fill={MARKER.leaf} stroke={darken(MARKER.leaf)} strokeWidth="2" />
    <g>
      <circle cx="32" cy="68" r="14" fill={MARKER.strawberry} stroke={darken(MARKER.strawberry)} strokeWidth="2.4" />
      <circle cx="66" cy="70" r="14" fill={MARKER.strawberry} stroke={darken(MARKER.strawberry)} strokeWidth="2.4" />
    </g>
  </g>
);

const Mushroom: Art = ({ seedName }) => (
  <g filter={wobbleFor(seedName)}>
    <Marked d="M38 54 h24 v24 q0 8 -12 8 q-12 0 -12 -8 Z" fill="#EFE3CC" stroke="#B9A98C" />
    <Marked d="M16 54 q6 -32 34 -32 q28 0 34 32 Z" fill={MARKER.strawberry} />
    <g fill="#FBF7EE">
      <circle cx="34" cy="40" r="5" /><circle cx="56" cy="34" r="4" /><circle cx="68" cy="46" r="4.5" />
    </g>
  </g>
);

const HoneyJar: Art = ({ seedName }) => (
  <g filter={wobbleFor(seedName)}>
    <Marked d="M30 34 h40 v42 q0 8 -8 8 h-24 q-8 0 -8 -8 Z" fill={MARKER.sunshine} />
    <Marked d="M26 24 h48 v10 h-48 Z" fill={WOOD} />
    <rect x="36" y="48" width="28" height="16" fill="#FBF7EE" opacity="0.92" />
    <path d="M42 60 q8 -10 16 0" fill="none" stroke={darken(MARKER.sunshine, 0.4)} strokeWidth="2.4" strokeLinecap="round" />
  </g>
);

const JamSandwich: Art = ({ seedName }) => (
  <g filter={wobbleFor(seedName)}>
    <Marked d="M22 30 h48 q8 0 8 8 v10 h-64 v-10 q0 -8 8 -8 Z" fill="#E0B872" />
    <Marked d="M14 48 h64 v10 h-64 Z" fill={MARKER.cake} />
    <Marked d="M14 58 h64 v12 q0 8 -8 8 h-48 q-8 0 -8 -8 Z" fill="#E0B872" />
  </g>
);

const Pretzel: Art = ({ seedName }) => (
  <g filter={wobbleFor(seedName)}>
    <path
      d="M32 30 q-14 12 -2 26 q12 14 20 -4 q8 -18 20 -4 q12 14 -2 26 q-16 12 -36 -4"
      fill="none" stroke="#B9792E" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round"
    />
    <g fill="#FBF7EE">
      <circle cx="38" cy="46" r="1.8" /><circle cx="58" cy="40" r="1.8" /><circle cx="50" cy="62" r="1.8" />
    </g>
  </g>
);

const Cookie: Art = ({ seedName }) => (
  <g filter={wobbleFor(seedName)}>
    <Marked d="M50 24 q28 0 28 26 q0 28 -28 28 q-28 0 -28 -28 q0 -26 28 -26 Z" fill="#D9A441" />
    <g fill={darken(WOOD, 0.25)}>
      <circle cx="40" cy="42" r="4" /><circle cx="60" cy="40" r="3.4" />
      <circle cx="52" cy="56" r="4" /><circle cx="36" cy="60" r="3.4" /><circle cx="64" cy="60" r="3.6" />
    </g>
  </g>
);

/* ------------------------------------------------------------------ lookup */

const ITEM_ART: Record<string, Art> = {
  "Wooden Sword": WoodenSword,
  "Frying Pan": FryingPan,
  Slingshot,
  "Big Stick": BigStick,
  Broom,
  "Pot Helmet": PotHelmet,
  "Turtle Shell": TurtleShell,
  "Winter Coat": WinterCoat,
  "Cardboard Box": CardboardBox,
  "Oven Mitts": OvenMitts,
  "Running Shoes": RunningShoes,
  "Rain Boots": RainBoots,
  "Roller Skates": RollerSkates,
  "Bunny Slippers": BunnySlippers,
  Flippers,
  "Birthday Cake": BirthdayCake,
  Bone,
  Carrot,
  Lettuce,
  Strawberry,
  "Sunny Side Up Egg": Egg,
  Orange,
  Milk,
  Popsicle,
  Candy,
  "Watermelon Slice": Watermelon,
  Banana,
  "Apple Pie": ApplePie,
  "Hot Dog": HotDog,
  "Corn on the Cob": Corn,
  Pancakes,
  "Grilled Cheese": GrilledCheese,
  Cherries,
  Mushroom,
  "Honey Jar": HoneyJar,
  "Jam Sandwich": JamSandwich,
  Pretzel,
  Cookie,
};

/** Anything without a drawing of its own gets a parcel, which is honest about it. */
const Parcel: Art = ({ seedName }) => (
  <g filter={wobbleFor(seedName)}>
    <Marked d="M24 36 h52 v46 h-52 Z" fill="#C89A62" />
    <path d="M50 36 v46 M24 58 h52" stroke={MARKER.strawberry} strokeWidth="4" />
  </g>
);

export const hasArtFor = (name: string): boolean => name in ITEM_ART;
export const ITEM_NAMES = Object.keys(ITEM_ART);

export default function ItemArt({ name, seedName }: { name: string; seedName?: string }) {
  const Art = ITEM_ART[name] ?? Parcel;
  return <Art seedName={seedName ?? name} />;
}
