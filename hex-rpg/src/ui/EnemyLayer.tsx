/**
 * Enemy tokens.
 *
 * Angular, where players are round, so the two never read as the same kind of thing
 * at a glance. Size grows with how nasty it is, and a bar under the token shows how
 * much of it is left - damage sticks between fights, so that bar is the record of
 * what the party has already done to it.
 */

import { hexToPixel } from "../game/hex";
import { ENEMIES, healthLeft } from "../game/enemies";
import type { Enemy } from "../game/types";

export default function EnemyLayer({
  enemies,
  size,
  purses = {},
}: {
  enemies: Enemy[];
  size: number;
  /** Coins a thief is holding, by kind. Shown so the party can see the reward. */
  purses?: Partial<Record<string, number>>;
}) {
  return (
    <g className="enemies">
      {enemies
        .filter((e) => !e.defeated)
        .map((enemy) => {
          const { x, y } = hexToPixel(enemy.hex, size);
          const beast = ENEMIES[enemy.kind];
          const r = size * 0.3 * beast.scale;
          const left = healthLeft(enemy);
          const hurt = enemy.damageTaken > 0;
          const purse = purses[enemy.kind] ?? 0;

          return (
            <g
              key={enemy.id}
              className="enemy"
              transform={`translate(${x.toFixed(2)} ${(y - size * 0.12).toFixed(2)})`}
            >
              <path
                d={`M0 ${-r} L${r} 0 L0 ${r} L${-r} 0 Z`}
                fill={beast.colour}
                stroke="#141a1f"
                strokeWidth={size * 0.06}
              />
              <text
                className="enemy-initial"
                y={r * 0.34}
                textAnchor="middle"
                fontSize={r * 0.95}
                fill="#191013"
              >
                {beast.glyph}
              </text>

              {purse > 0 && (
                <text className="enemy-purse" y={-r * 1.3} textAnchor="middle" fontSize={r * 0.8}>
                  ${purse}
                </text>
              )}

              {hurt && (
                <g transform={`translate(${-r} ${r + size * 0.1})`}>
                  <rect width={r * 2} height={size * 0.09} rx={size * 0.045} fill="#141a1f" />
                  <rect
                    width={(r * 2 * left) / enemy.maxHealth}
                    height={size * 0.09}
                    rx={size * 0.045}
                    fill={beast.colour}
                  />
                </g>
              )}
            </g>
          );
        })}
    </g>
  );
}
