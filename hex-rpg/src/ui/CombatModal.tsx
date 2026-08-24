/**
 * The fight.
 *
 * Two health bars, the dice in the middle, and two buttons: swing again, or back off.
 * Running away is always on screen and never disabled - a child should be able to see
 * the way out of a fight they are losing without having to ask an adult.
 */

import DiceRoller from "./DiceRoller";
import { ENEMIES, healthLeft } from "../game/enemies";
import { activeFeatures, attackValue } from "../game/combat";
import { ROLES } from "../game/players";
import { equipped } from "../game/items";
import type { Combat, Enemy, Item, Player, Tile } from "../game/types";

/** What this item would push out of its slot, if anything. */
const replacing = (player: Player, item: Item): Item | null =>
  item.slot === "supply" ? null : equipped(player, item.slot);

type Props = {
  combat: Combat;
  player: Player;
  enemy: Enemy;
  onAttack: () => void;
  onFlee: () => void;
  onTakeLoot: (itemId: string) => void;
  onClose: () => void;
  /** The tile the fight is on: it decides which of the enemy's features bite. */
  ground: Tile | undefined;
};

function Bar({ value, max, colour }: { value: number; max: number; colour: string }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="bar" role="img" aria-label={`${value} of ${max}`}>
      <span className="bar-fill" style={{ width: `${pct}%`, background: colour }} />
    </div>
  );
}

const RESULT: Record<string, { title: string; tone: string }> = {
  enemyDefeated: { title: "Beaten!", tone: "win" },
  enemyEscaped: { title: "It got away!", tone: "away" },
  playerEscaped: { title: "Got away", tone: "away" },
  playerDown: { title: "Down", tone: "lose" },
};

export default function CombatModal({
  combat,
  player,
  enemy,
  onAttack,
  onFlee,
  onTakeLoot,
  onClose,
  ground,
}: Props) {
  const beast = ENEMIES[enemy.kind];
  const role = ROLES[player.role];
  const over = combat.outcome !== "ongoing";
  const result = RESULT[combat.outcome];

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Fight">
      <div className="modal">
        <header className="fight-head">
          <div className="fighter">
            <span className="fighter-dot" style={{ background: role.colour }} />
            <div>
              <h2>{player.name}</h2>
              <Bar value={player.health} max={player.maxHealth} colour={role.colour} />
              <p className="fighter-stat">
                {player.health}/{player.maxHealth} health
              </p>
            </div>
          </div>

          <span className="versus" aria-hidden="true">
            vs
          </span>

          <div className="fighter fighter-enemy">
            <span className="fighter-dot" style={{ background: beast.colour }} />
            <div>
              <h2>{beast.name}</h2>
              <Bar value={healthLeft(enemy)} max={enemy.maxHealth} colour={beast.colour} />
              <p className="fighter-stat">
                {healthLeft(enemy)}/{enemy.maxHealth} health
              </p>
              {enemy.featuresRevealed && (
                <ul className="features">
                  {enemy.features.map((feature) => {
                    const biting = activeFeatures(enemy, ground).includes(feature);
                    return (
                      <li key={feature} className={`feature${biting ? " is-active" : ""}`}>
                        {feature}
                        {biting && " +1"}
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </header>

        <div className="fight-body">
          {combat.playerRoll ? (
            <>
              <DiceRoller
                dice={combat.playerRoll.dice}
                bonus={attackValue(player)}
                total={combat.playerRoll.damage}
                label={`${player.name} swings`}
                tone="player"
              />
              {combat.enemyRoll && (
                <DiceRoller
                  dice={combat.enemyRoll.dice}
                  bonus={beast.attack}
                  total={combat.enemyRoll.damage}
                  label={`${beast.name} hits back`}
                  tone="enemy"
                />
              )}
            </>
          ) : (
            <p className="fight-intro">{beast.blurb}</p>
          )}
        </div>

        {over ? (
          <footer className={`fight-foot fight-${result.tone}`}>
            <p className="fight-result">{result.title}</p>
            <p className="muted">
              {combat.outcome === "enemyDefeated" && `The ${beast.name} is out of the game.`}
              {combat.outcome === "enemyEscaped" &&
                `It went into the water with every wound you gave it. It cannot do that twice.`}
              {combat.outcome === "playerEscaped" &&
                `The ${beast.name} keeps the ${enemy.damageTaken} damage it has taken. Come back for it.`}
              {combat.outcome === "playerDown" && `${player.name} is out. The party plays on.`}
            </p>
            {enemy.loot.length > 0 && (
              <div className="loot">
                <p className="loot-title">Take what you want:</p>
                <ul className="stock">
                  {enemy.loot.map((item) => {
                    const swapping = replacing(player, item);
                    return (
                      <li key={item.id}>
                        <button type="button" className="buy" onClick={() => onTakeLoot(item.id)}>
                          <span className="buy-name">{item.name}</span>
                          <span className="buy-value">+{item.value}</span>
                          <span className="buy-cost">{swapping ? `swap ${swapping.name}` : "take"}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            <button type="button" onClick={onClose}>
              Done
            </button>
          </footer>
        ) : (
          <footer className="fight-foot">
            <p className="muted">
              Round {combat.round + 1}. Hurting it counts even if you leave.
            </p>
            <div className="fight-buttons">
              <button type="button" className="ghost" onClick={onFlee}>
                Back off
              </button>
              <button type="button" onClick={onAttack}>
                {combat.round === 0 ? "Roll the dice" : "Roll again"}
              </button>
            </div>
          </footer>
        )}
      </div>
    </div>
  );
}
