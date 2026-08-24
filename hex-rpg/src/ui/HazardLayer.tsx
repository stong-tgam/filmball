/**
 * Hazard tokens.
 *
 * Round for players, angular for monsters, and these are neither: a soft-cornered
 * plaque with a symbol on it, so a third kind of thing on the board reads as a third
 * kind of thing. The tornado gets a spiral, the traveller an umbrella.
 *
 * The robber and the pirates are not drawn here. They are fightable, so they are
 * drawn as monsters by `EnemyLayer` - drawing them twice, once as each, is how a
 * board ends up with two markers for one thing standing on one tile.
 */

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
            <rect
              x={-r}
              y={-r}
              width={r * 2}
              height={r * 2}
              rx={r * 0.4}
              fill={look.colour}
              stroke="#141a1f"
              strokeWidth={size * 0.05}
            />
            <text
              className="hazard-glyph"
              y={r * 0.42}
              textAnchor="middle"
              fontSize={r * 1.15}
              fill="#171216"
            >
              {look.glyph}
            </text>

          </g>
        );
      })}
    </g>
  );
}
