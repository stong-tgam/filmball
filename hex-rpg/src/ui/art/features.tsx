/**
 * The five boss feature cards. Rulebook §9.
 *
 * A feature is ground a monster is at home on, so each card is a scrap of that ground
 * rather than an icon of it — the water card is a piece of river, the field card is a
 * piece of ploughed field. They are drawn on the tile-sheet's coloured-pencil rules
 * rather than the chits' marker rules, because that is what they depict.
 */

import { MARKER, darken, wobbleFor } from "./crayon";
import type { Feature } from "../../game/types";

const HATCH = MARKER.cocoa;

function Water({ seedName }: { seedName: string }) {
  return (
    <g filter={wobbleFor(seedName)}>
      <g stroke={MARKER.river} strokeWidth="7" strokeLinecap="round" fill="none" opacity="0.92">
        <path d="M12 40 q14 -12 26 0 q12 12 26 0 q12 -12 24 0" />
        <path d="M12 62 q14 -12 26 0 q12 12 26 0 q12 -12 24 0" />
      </g>
      <g stroke={darken(MARKER.river)} strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.7">
        <path d="M16 34 q12 -10 24 0" />
        <path d="M52 68 q12 -10 24 0" />
      </g>
    </g>
  );
}

function Railway({ seedName }: { seedName: string }) {
  return (
    <g filter={wobbleFor(seedName)}>
      <path d="M14 30 q36 20 72 40 M8 44 q36 20 72 40" stroke="#2A2A2A" strokeWidth="4" strokeLinecap="round" fill="none" />
      <g stroke="#2A2A2A" strokeWidth="4.5" strokeLinecap="round">
        <path d="M16 26 l-4 12" /><path d="M31 34 l-4 12" /><path d="M46 42 l-4 12" />
        <path d="M61 50 l-4 12" /><path d="M76 58 l-4 12" />
      </g>
    </g>
  );
}

function City({ seedName }: { seedName: string }) {
  const roofs = [MARKER.strawberry, MARKER.river, MARKER.strawberry];
  return (
    <g filter={wobbleFor(seedName)}>
      {[
        { x: 14, y: 44, w: 24, h: 30 },
        { x: 40, y: 34, w: 22, h: 40 },
        { x: 64, y: 48, w: 22, h: 26 },
      ].map((h, i) => (
        <g key={i}>
          <rect x={h.x} y={h.y} width={h.w} height={h.h} fill="#D8B98A" opacity="0.94" />
          <rect x={h.x} y={h.y} width={h.w} height={h.h} fill="none" stroke={darken("#D8B98A", 0.45)} strokeWidth="2.2" />
          <path d={`M${h.x - 4} ${h.y} L${h.x + h.w / 2} ${h.y - 13} L${h.x + h.w + 4} ${h.y} Z`}
                fill={roofs[i]} opacity="0.93" stroke={darken(roofs[i])} strokeWidth="2.2" strokeLinejoin="round" />
          <rect x={h.x + h.w / 2 - 4} y={h.y + 10} width="8" height="9" fill={MARKER.sunshine} opacity="0.85" />
        </g>
      ))}
      <path d="M8 76 h84" stroke={MARKER.leaf} strokeWidth="4" strokeLinecap="round" opacity="0.8" />
    </g>
  );
}

function Forest({ seedName }: { seedName: string }) {
  return (
    <g filter={wobbleFor(seedName)}>
      {[
        { x: 24, y: 68, s: 22 },
        { x: 50, y: 74, s: 28 },
        { x: 74, y: 68, s: 20 },
      ].map((t, i) => (
        <g key={i}>
          <rect x={t.x - 3} y={t.y - 4} width="6" height="14" rx="2" fill={MARKER.cocoa} />
          <path d={`M${t.x} ${t.y - t.s * 2} L${t.x + t.s * 0.72} ${t.y - 2} L${t.x - t.s * 0.72} ${t.y - 2} Z`}
                fill={MARKER.leaf} opacity="0.93" stroke={darken(MARKER.leaf)} strokeWidth="2.2" strokeLinejoin="round" />
          <path d={`M${t.x} ${t.y - t.s * 2} L${t.x + t.s * 0.4} ${t.y - t.s} L${t.x - t.s * 0.4} ${t.y - t.s} Z`}
                fill="#6FBF52" opacity="0.9" />
        </g>
      ))}
      <path d="M8 82 h84" stroke={MARKER.leaf} strokeWidth="3.5" strokeLinecap="round" opacity="0.75" />
    </g>
  );
}

/**
 * Ploughed field. Hatching at two angles, never a flat fill - the change of angle is
 * what makes one field read as a different field on the tile sheet.
 */
function Field({ seedName }: { seedName: string }) {
  return (
    <g filter={wobbleFor(seedName)}>
      <g stroke={HATCH} strokeWidth="3" strokeLinecap="round" opacity="0.85">
        {[0, 1, 2, 3, 4].map((i) => (
          <path key={i} d={`M10 ${26 + i * 7} q22 -5 42 -1`} />
        ))}
      </g>
      <g stroke={darken(HATCH, 0.2)} strokeWidth="3" strokeLinecap="round" opacity="0.8">
        {[0, 1, 2, 3, 4].map((i) => (
          <path key={i} d={`M${44 + i * 9} 62 l10 -22`} />
        ))}
      </g>
      <g stroke={MARKER.sunshine} strokeWidth="2.6" strokeLinecap="round">
        <path d="M20 82 v-10 M28 82 v-13 M36 82 v-9" />
      </g>
      <path d="M8 84 h84" stroke={darken(HATCH, 0.2)} strokeWidth="3" strokeLinecap="round" opacity="0.7" />
    </g>
  );
}

const ART: Record<Feature, (p: { seedName: string }) => JSX.Element> = {
  water: Water,
  railway: Railway,
  city: City,
  forest: Forest,
  field: Field,
};

/** What each one does in a fight, in the words a child would use. */
export const FEATURE_BLURB: Record<Feature, string> = {
  water: "Beaten by a river? It dives in and gets away. Once only.",
  railway: "On the tracks, somebody gets hurt before the fight even starts.",
  city: "In town it picks your pocket. Anywhere else it picks a fight.",
  forest: "Under the trees nobody can swing properly. Everyone hits softer.",
  field: "Out in the open it hits harder the more of you there are.",
};

export default function FeatureArt({ feature, seedName }: { feature: Feature; seedName?: string }) {
  const Art = ART[feature];
  return <Art seedName={seedName ?? feature} />;
}
