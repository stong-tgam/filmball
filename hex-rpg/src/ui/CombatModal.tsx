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
import { escapeChance } from "../game/combat";
import { PALETTE } from "../palette";
import { CHIP, INK } from "./art/crayon";
import MonsterArt from "./art/monsters";
import FeatureArt from "./art/features";
import ItemArt from "./art/items";
import { canTake, gearLabel, equipped } from "../game/items";
import type { Combat, Enemy, Item, Player, Tile } from "../game/types";

/** What this item would push out of its slot, if anything. */
const replacing = (player: Player, item: Item): Item | null =>
  item.slot === "supply" ? null : equipped(player, item.slot);

type Props = {
  combat: Combat;
  player: Player;
  enemy: Enemy;
  onAttack: (twice?: boolean) => void;
  /** The red stone in a weapon: this round may be thrown twice, once a fight. */
  canSwingTwice?: boolean;
  onFlee: () => void;
  /** §10: the starter keeps a pick, or hands it to anybody who fought beside them. */
  onTakeLoot: (itemId: string, toId?: string) => void;
  /** Everybody swinging, starter first. */
  party: Player[];
  /** Who could still be shouted for, per §8. Empty for mobs, which stay solo. */
  inviteTargets: Player[];
  onInvite: (playerId: string) => void;
  /**
   * Fighters who can do something other than swing this round, and who they can do it
   * to. Only the doctor has one so far; this is where weapon skills will hang.
   */
  supportChoices: { who: Player; targets: Player[] }[];
  onSupport: (byId: string, toId: string) => void;
  onUnsupport: (byId: string) => void;
  /**
   * Eating is not the turn's action and never was - the spec is explicit that supply
   * may be used at any time, "including in the middle of a fight". It could not be:
   * the party list lives in the sidebar and this modal covers it, so the one moment a
   * child actually wants a sandwich was the one moment they could not reach one.
   */
  onEat: (playerId: string, itemId: string) => void;
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
  standoff: { title: "Dead even", tone: "away" },
  playerEscaped: { title: "Got away", tone: "away" },
  playerDown: { title: "Down", tone: "lose" },
};

export default function CombatModal({
  combat,
  player,
  enemy,
  onAttack,
  canSwingTwice = false,
  onFlee,
  onTakeLoot,
  party,
  inviteTargets,
  onInvite,
  supportChoices,
  onSupport,
  onUnsupport,
  onEat,
  onClose,
  ground,
}: Props) {
  const beast = ENEMIES[enemy.kind];
  const role = ROLES[player.role];
  const over = combat.outcome !== "ongoing";
  // One class for "that hurt" and one for "we got it", both keyed on the round so the
  // animation replays on every roll rather than only the first.
  const beat =
    combat.outcome === "enemyDefeated"
      ? "fight-won"
      : combat.toll > 0
        ? "fight-hit"
        : "";
  const result = RESULT[combat.outcome];

  return (
    <div
      className={`modal-backdrop${combat.outcome === "enemyDefeated" ? " backdrop-flash" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="Fight"
    >
      {/* Keyed on the round so the shake or the glow replays on every roll, not just
          the first one - a fight is three or four beats and each needs its own. */}
      <div className={`modal ${beat}`} key={`${combat.round}-${beat}`}>
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
            {/* The boss reveal is one of the moments worth protecting, so the monster
                gets its drawing at size rather than a coloured dot. */}
            <svg className="fighter-portrait" viewBox="0 0 100 100" aria-hidden="true">
              <circle cx="50" cy="50" r="49" fill={CHIP} stroke={INK} strokeWidth="2" />
              <MonsterArt kind={enemy.kind} seedName={enemy.id} />
            </svg>
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
                        <svg viewBox="0 0 100 100" aria-hidden="true" className="feature-art">
                          <FeatureArt feature={feature} seedName={`${enemy.id}-${feature}`} />
                        </svg>
                        <span>
                          {feature}
                          {biting && " +1"}
                        </span>
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
                bonus={attackValue(player, enemy, ground)}
                total={combat.playerRoll.damage}
                label={`${player.name} swings`}
                tone="player"
              />
              {combat.toll > 0 && (
                <p className="fight-toll">
                  Not enough. {player.name} loses {combat.toll} health.
                </p>
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
              {combat.outcome === "standoff" &&
                "Exactly even, so nothing happened at all. Back where you started."}
              {combat.outcome === "enemyEscaped" &&
                `It went into the water with every wound you gave it. It cannot do that twice.`}
              {combat.outcome === "playerEscaped" &&
                `The ${beast.name} keeps the ${enemy.damageTaken} damage it has taken. Come back for it.`}
              {combat.outcome === "playerDown" &&
                `${player.name} is down. They get back up next turn, or a doctor can reach them now.`}
            </p>
            {combat.spoils.length > 0 && combat.picksLeft > 0 && (
              <div className="loot">
                <p className="loot-title">
                  Keep {combat.picksLeft} of {combat.spoils.length}. The rest goes back.
                  {party.length > 1 && " Yours to hand out."}
                </p>
                <ul className="stock">
                  {combat.spoils.map((item) => (
                    <li key={item.id}>
                      {/*
                        §10 gives the picks to the starter and lets them hand any of
                        them to somebody who fought. Solo, that is one button and reads
                        exactly as it always did; in a group each piece names the people
                        who could take it, so nobody has to remember who was there.
                      */}
                      <div className="loot-item">
                        <span className="loot-face">
                          <svg viewBox="0 0 100 100" aria-hidden="true" className="buy-art">
                            <ItemArt name={item.name} seedName={item.id} />
                          </svg>
                          <span className="buy-name">{gearLabel(item)}</span>
                        </span>
                        <span className="loot-who">
                          {party.map((who) => {
                            const swapping = replacing(who, item);
                            const room = canTake(who, item);
                            return (
                              <button
                                key={who.id}
                                type="button"
                                className="ghost"
                                disabled={!room}
                                onClick={() => onTakeLoot(item.id, who.id)}
                                title={
                                  !room
                                    ? `${who.name} has no room for it`
                                    : swapping
                                      ? `${who.name} swaps ${swapping.name}`
                                      : `${who.name} takes it`
                                }
                              >
                                {party.length === 1
                                  ? swapping
                                    ? `Swap ${swapping.name}`
                                    : "Take it"
                                  : who.name}
                              </button>
                            );
                          })}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <button type="button" onClick={onClose}>
              Done
            </button>
          </footer>
        ) : (
          <footer className="fight-foot">
            {player.supply.length > 0 && (
              <div className="fight-supply">
                <p className="fight-supply-title">
                  {player.health >= player.maxHealth
                    ? `${player.name} is on full health.`
                    : "Eat something. It does not cost the turn."}
                </p>
                <ul className="stock">
                  {player.supply.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        className="buy"
                        onClick={() => onEat(player.id, item.id)}
                        disabled={item.value <= 0 || player.health >= player.maxHealth}
                        title={
                          item.value <= 0
                            ? `The ${item.name} is not food. Sell it, or let a thief take it.`
                            : `Eat the ${item.name} for ${item.value} health`
                        }
                      >
                        <svg viewBox="0 0 100 100" aria-hidden="true" className="buy-art">
                          <ItemArt name={item.name} seedName={item.id} />
                        </svg>
                        <span className="buy-name">{item.name}</span>
                        <span className="buy-value">+{item.value}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {inviteTargets.length > 0 && (
              <div className="fight-supply">
                <p className="fight-supply-title">
                  Shout for help — they run in and roll with you, and it does not cost
                  them their turn.
                </p>
                <div className="hook-ways">
                  {inviteTargets.map((who) => (
                    <button key={who.id} type="button" className="ghost" onClick={() => onInvite(who.id)}>
                      {who.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {combat.support.length > 0 && (
              <div className="fight-supply">
                <p className="fight-supply-title">Holding back to help:</p>
                <div className="hook-ways">
                  {combat.support.map((pledge) => {
                    const by = party.find((p) => p.id === pledge.by);
                    const to = party.find((p) => p.id === pledge.to);
                    return (
                      <button key={pledge.by} type="button" className="ghost" onClick={() => onUnsupport(pledge.by)}>
                        {by?.name} patches {to?.name} — tap to swing instead
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {supportChoices.map((choice) => (
              <div className="fight-supply" key={choice.who.id}>
                <p className="fight-supply-title">
                  {choice.who.name} can patch somebody up instead of rolling — their
                  dice are the price.
                </p>
                <div className="hook-ways">
                  {choice.targets.map((target) => (
                    <button
                      key={target.id}
                      type="button"
                      className="ghost"
                      onClick={() => onSupport(choice.who.id, target.id)}
                    >
                      {target.id === choice.who.id ? "Themselves" : target.name} (
                      {target.health}/{target.maxHealth})
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {party.length > 1 && (
              <p className="fight-party">
                Fighting together: {party.map((p) => p.name).join(", ")}. All the dice
                count, and a bad roll costs every one of them a health.
              </p>
            )}
            <p className="muted">
              Round {combat.round + 1}. Hurting it counts even if you leave — and an
              exact tie does nothing at all. Backing off is a gamble: fast feet get away
              more often, and a failed attempt leaves you here.
            </p>
            <div className="fight-buttons">
              <button
                type="button"
                className="ghost"
                onClick={onFlee}
                title="Fast feet get away more often. Fail and you are still in the fight."
              >
                Back off ({Math.round(escapeChance(player, combat.ambush && combat.round === 0) * 100)}%)
              </button>
              {/* The red stone. Deliberately its own button rather than an automatic
                  re-roll on a bad round: choosing *which* round to spend it on is the
                  whole decision, and a re-roll that happens to you is not a moment. */}
              {canSwingTwice && (
                <button
                  type="button"
                  className="swing-twice"
                  style={{ background: PALETTE.gemRed }}
                  onClick={() => onAttack(true)}
                >
                  Throw twice
                </button>
              )}
              <button type="button" onClick={() => onAttack()}>
                {combat.round === 0 ? "Roll the dice" : "Roll again"}
              </button>
            </div>
          </footer>
        )}
      </div>
    </div>
  );
}
