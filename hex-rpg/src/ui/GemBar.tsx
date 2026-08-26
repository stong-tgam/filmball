/**
 * The stone, and the three places it can go.
 *
 * This is the whole of the gem system as a player meets it: a picture of the stone,
 * one line saying what it is doing *right now*, and three buttons that change what it
 * is doing. Nothing to remember and nothing to compute - the ability is the button, and
 * the button says what it does.
 *
 * It sits under the action bar rather than in it, because moving a stone is **free**:
 * it is not the turn's one action, and putting it among the buttons that spend a turn
 * would teach a child the opposite. It disappears entirely for a player who has not
 * found one, the same way the action bar only ever shows what you can actually do.
 */

import { GEMS, LIMIT_LABEL, SETTINGS, WORN, isSpent, powerOf } from "../game/gems";
import GemArt from "./art/gems";
import type { Gem, GemSetting } from "../game/types";
import Art from "./art/Art";
import { gemSlot } from "./art/gems";

/**
 * A sword, a shield and a boot, drawn rather than typed.
 *
 * Emoji were the first go and they came out wrong: a system font renders them at three
 * different weights, in three different colours, and one of them as a missing-glyph
 * box. These are four paths each and they inherit the button's own colour, so the
 * selected one flips to dark with everything else on the chip.
 */
const SLOT_ICON: Record<GemSetting, string> = {
  weapon: "M17 3 L9 11 M6 14 L5 19 L10 18 M4 16 L8 20 M9 11 L13 15 L6 22",
  armor: "M12 2 L20 5 V11 C20 16 16 20 12 22 C8 20 4 16 4 11 V5 Z",
  boots: "M7 2 H11 V13 H17 A3 3 0 0 1 20 16 V21 H7 Z M7 17 H20",
};

const SlotIcon = ({ setting }: { setting: GemSetting }) => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" className="gembar-icon">
    <path
      d={SLOT_ICON[setting]}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

export default function GemBar({
  gem,
  canSet,
  onSet,
}: {
  gem: Gem;
  /** False mid-fight: switching after a bad roll would make a once-a-game save a
   *  save every fight, which is the one way this could become a number again. */
  canSet: boolean;
  onSet: (setting: GemSetting) => void;
}) {
  const stone = GEMS[gem.kind];
  const power = powerOf(gem);
  const used = power.limit === "game" && isSpent(gem);

  return (
    <div className="gembar" style={{ ["--stone" as string]: stone.colour }}>
      <svg className="gembar-art" viewBox="0 0 100 100" aria-hidden="true">
        <Art slot={gemSlot(gem.kind)}>
          <GemArt kind={gem.kind} />
        </Art>
      </svg>

      <div className="gembar-says">
        <p className="gembar-power">
          <strong>{power.title}</strong>
          {power.limit !== "always" && (
            <span className={`gembar-once${used ? " is-spent" : ""}`}>
              {used ? "used up" : LIMIT_LABEL[power.limit]}
            </span>
          )}
        </p>
        <p className="gembar-text">{used ? "This one is spent. Try it somewhere else." : power.text}</p>
      </div>

      <div className="gembar-slots" role="group" aria-label="Where the stone sits">
        {SETTINGS.map((setting) => {
          const here = gem.set === setting;
          return (
            <button
              key={setting}
              type="button"
              className={`gembar-slot${here ? " is-here" : ""}${isSpent(gem, setting) ? " is-spent" : ""}`}
              aria-pressed={here}
              disabled={!canSet || here}
              // The whole point of the system is on this tooltip and on the line
              // above: one stone, three meanings, and the choice is re-made whenever
              // the game changes shape.
              title={`${WORN[setting]}: ${stone.powers[setting].title} — ${stone.powers[setting].text}`}
              onClick={() => onSet(setting)}
            >
              <SlotIcon setting={setting} />
              <span className="gembar-slot-name">{WORN[setting]}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
