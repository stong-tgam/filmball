/**
 * Hazard tokens.
 *
 * Round for players, angular for monsters, and these are neither: a soft-cornered
 * plaque, so a third kind of thing on the board reads as a third kind of thing. What
 * is *on* the plaque used to be an emoji - the one place in the game where a system
 * font decided what something looked like, and it rendered at three different weights
 * on three different devices. It is a drawing now (`art/hazards.tsx`), which also means
 * a family can replace it with their own.
 *
 * The robber and the pirates are not drawn here. They are fightable, so they are
 * drawn as monsters by `EnemyLayer` - drawing them twice, once as each, is how a
 * board ends up with two markers for one thing standing on one tile.
 */

import { useId } from "react";
import Art from "./art/Art";
import HazardArt, { hazardSlot } from "./art/hazards";
import { hexToPixel } from "../game/hex";
import { HAZARDS } from "../game/hazards";
import type { Hazard, HazardKind } from "../game/types";

/** Drawn by `EnemyLayer` instead: these two are monsters as well as hazards. */
const FIGHTABLE: HazardKind[] = ["robber", "pirates"];

export default function HazardLayer({ hazards, size }: { hazards: Hazard[]; size: number }) {
  return (
    <g className="hazards">
      {hazards
        .filter((hazard) => !FIGHTABLE.includes(hazard.kind))
        .map((hazard) => {
        const { x, y } = hexToPixel(hazard.hex, size);
        const look = HAZARDS[hazard.kind];
        const r = size * 0.24;

        return (
          <g
            key={hazard.kind}
            className={`hazard hazard-${hazard.kind}`}
            transform={`translate(${(x + size * 0.42).toFixed(2)} ${(y - size * 0.42).toFixed(2)})`}
          >
            <Plaque hazard={hazard} colour={look.colour} r={r} rim={size * 0.05} />

          </g>
        );
      })}
    </g>
  );
}

/** The plaque, with the wanderer's drawing on it. */
function Plaque({
  hazard,
  colour,
  r,
  rim,
}: {
  hazard: Hazard;
  colour: string;
  r: number;
  rim: number;
}) {
  const clip = useId();
  return (
    <g>
      <defs>
        <clipPath id={clip}>
          <rect x={-r} y={-r} width={r * 2} height={r * 2} rx={r * 0.4} />
        </clipPath>
      </defs>
      <rect x={-r} y={-r} width={r * 2} height={r * 2} rx={r * 0.4} fill={colour} />
      <g clipPath={`url(#${clip})`}>
        <g transform={`translate(${-r} ${-r}) scale(${(r * 2) / 100})`}>
          <Art slot={hazardSlot(hazard.kind)} fit="slice">
            <HazardArt kind={hazard.kind} />
          </Art>
        </g>
      </g>
      <rect
        x={-r}
        y={-r}
        width={r * 2}
        height={r * 2}
        rx={r * 0.4}
        fill="none"
        stroke="#141a1f"
        strokeWidth={rim}
      />
    </g>
  );
}
