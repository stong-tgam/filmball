/**
 * Enemy tokens: the drawn monster on a paper chit.
 *
 * Was a coloured diamond with a letter in it, which is fine on a spreadsheet and no
 * fun on a table. Every monster now shows the drawing made for it in
 * `art/monsters.tsx`, on the cream chit the whole set is built around. Fifteen bandits
 * share five faces, picked from the monster's id, so the same one always looks the
 * same - two children drawing fifteen goblins would not draw fifteen different
 * goblins either.
 *
 * Size still grows with how nasty it is, and the bar under the chit is still the
 * record of what the party has already done to it: damage sticks between fights.
 */

import { hexToPixel } from "../game/hex";
import { ENEMIES } from "../game/enemies";
import { CHIP, INK } from "./art/crayon";
import MonsterArt from "./art/monsters";
import type { Enemy } from "../game/types";
import Art from "./art/Art";
import { monsterSlot } from "./art/monsters";

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
        // A dormant dragon is not on the board yet (`DRAGON_WAKES_ON`) - not even for
        // the grown-up peeking at the map, or the one person who is allowed to see
        // everything would be looking at something that is not there.
        .filter((e) => !e.defeated && !e.dormant)
        .map((enemy) => {
          const { x, y } = hexToPixel(enemy.hex, size);
          const beast = ENEMIES[enemy.kind];
          const r = size * 0.3 * beast.scale;
          // How many mini-games it takes. Drawn as pips under the chit, because that
          // is a number a child reads at a glance and a health bar never was.
          const cards = beast.cards;
          const purse = purses[enemy.kind] ?? 0;

          return (
            <g
              key={enemy.id}
              className="enemy"
              transform={`translate(${x.toFixed(2)} ${(y - size * 0.12).toFixed(2)})`}
            >
              <circle r={r * 1.12} fill={CHIP} stroke={INK} strokeWidth={size * 0.045} />
              <circle r={r * 1.12} fill="none" stroke={beast.colour} strokeWidth={size * 0.03} />
              {/* The drawing is on a 100x100 canvas; bring it down to the chit. */}
              <g transform={`scale(${(r * 2) / 100}) translate(-50 -50)`}>
                <Art slot={monsterSlot(enemy.kind)} fit="slice">
                  <MonsterArt kind={enemy.kind} seedName={enemy.id} />
                </Art>
              </g>

              {purse > 0 && (
                <text className="enemy-purse" y={-r * 1.3} textAnchor="middle" fontSize={r * 0.8}>
                  ${purse}
                </text>
              )}

              {cards > 1 && (
                <g transform={`translate(0 ${r + size * 0.14})`}>
                  {Array.from({ length: cards }, (_, i) => (
                    <circle
                      key={i}
                      cx={(i - (cards - 1) / 2) * size * 0.13}
                      cy={0}
                      r={size * 0.045}
                      fill={beast.colour}
                      stroke="#141a1f"
                      strokeWidth={size * 0.012}
                    />
                  ))}
                </g>
              )}
            </g>
          );
        })}
    </g>
  );
}
