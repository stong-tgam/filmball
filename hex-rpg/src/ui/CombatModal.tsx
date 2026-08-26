/**
 * The fight, which is a mini-game the family plays.
 *
 * A card turns over, a clock runs, and then **the table** taps whether they did it.
 * There is no scoring here and there never will be: no machine can tell whether a
 * drawing looked enough like a dragon, and one that tried would be wrong in front of a
 * child. The app's whole job is to pose the thing, hold the clock and keep the score
 * of who won what.
 *
 * The one piece of stagecraft that is load-bearing: **for Quick Draw and Act It Out,
 * only one person may see the prompt.** The device is on the table with four people
 * round it, so the card goes face down, the person doing it taps to look, and taps
 * again to hide it before the clock starts. Without that step those two games do not
 * work at all, and it is the sort of thing that is obvious at a table and invisible in
 * a spec.
 */

import { useEffect, useRef, useState } from "react";
import { ENEMIES } from "../game/enemies";
import { GAME_HOW, GAME_NAME, challengeFor, difficultyOf, type Challenge } from "../game/challenges";
import { FEATURE_BITE, activeFeatures } from "../game/combat";
import { SKILLS, hasSkill } from "../game/skills";
import { SUIT_PIP } from "../game/cards";
import { CHIP, INK } from "./art/crayon";
import MonsterArt from "./art/monsters";
import ItemArt from "./art/items";
import { canTake, gearLabel, equipped } from "../game/items";
import type { Combat, Enemy, Item, Player, Tile, Trial } from "../game/types";
import Art from "./art/Art";
import { monsterSlot } from "./art/monsters";

/** What this item would push out of its slot, if anything. */
const replacing = (player: Player, item: Item): Item | null =>
  item.slot === "supply" ? null : equipped(player, item.slot);

/** The two games nobody else may see the card for. */
const isSecret = (challenge: Challenge): boolean =>
  challenge.kind === "draw" || challenge.kind === "act";

type Props = {
  combat: Combat;
  enemy: Enemy;
  /** The whole team. All of them play, so all of them are on screen. */
  party: Player[];
  playing: { trial: Trial; challenge: Challenge; index: number; of: number } | null;
  onWon: () => void;
  onLost: () => void;
  onHint: () => void;
  /** Each fighter, and whether their own skill is pressable this second. */
  skills: { who: Player; ready: boolean }[];
  onSkill: (playerId: string, toId?: string) => void;
  onTakeLoot: (itemId: string, toId?: string) => void;
  onEat: (playerId: string, itemId: string) => void;
  onClose: () => void;
  ground: Tile | undefined;
};

/**
 * The clock.
 *
 * Kept in the view and never in `GameState`, exactly like the turn hourglass and for
 * the same reason: a game has to be reproducible from its seed, and a wall clock in the
 * state would make a saved game resume differently from the one that was put down.
 */
function useCountdown(seconds: number, running: boolean, onOut: () => void) {
  const [left, setLeft] = useState(seconds);
  // Held in a ref so the interval never closes over a stale callback: `lostTrial` comes
  // off the store and is a new function on every render. Same trick as the hourglass.
  const ring = useRef(onOut);
  ring.current = onOut;

  useEffect(() => {
    if (!running) return;
    const id = window.setInterval(() => setLeft((was) => Math.max(0, was - 1)), 1000);
    return () => window.clearInterval(id);
  }, [running]);

  // Running out is its own effect, not something the tick does inline. Calling the
  // store from inside a `setState` updater is a side effect in the render phase, and
  // React is entitled to run that twice - which would cost the team two health for one
  // clock.
  useEffect(() => {
    if (!running || left > 0) return;
    ring.current();
  }, [running, left]);

  return { left, setLeft };
}

function Clock({ left, of }: { left: number; of: number }) {
  const pct = Math.max(0, Math.min(100, (left / Math.max(1, of)) * 100));
  const low = left <= 10;
  return (
    <div className={`clock${low ? " clock-low" : ""}`}>
      <span className="clock-num">{left}</span>
      <div className="clock-track">
        <span className="clock-fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function CombatModal({
  combat,
  enemy,
  party,
  playing,
  onWon,
  onLost,
  onHint,
  skills,
  onSkill,
  onTakeLoot,
  onEat,
  onClose,
  ground,
}: Props) {
  const beast = ENEMIES[enemy.kind];
  const over = combat.outcome !== "ongoing";
  const bites = activeFeatures(enemy, ground);

  // Where in the card's own little ceremony we are. Reset on every new card, which is
  // what `combat.at` keys.
  const [stage, setStage] = useState<"deal" | "look" | "run">("deal");
  useEffect(() => setStage("deal"), [combat.at]);

  const seconds = playing?.trial.seconds ?? 0;
  const { left, setLeft } = useCountdown(seconds, stage === "run" && !over, onLost);
  // A card that has just been dealt shows its full clock; the scout's extra seconds
  // land on a clock that is already running.
  useEffect(() => {
    if (stage !== "run") setLeft(seconds);
  }, [seconds, stage, setLeft]);

  return (
    <div
      className={`modal-backdrop${combat.outcome === "enemyDefeated" ? " backdrop-flash" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={`Fighting the ${beast.name}`}
    >
      <div className="modal fight">
        <header className="fight-head">
          <span className="fight-face">
            <svg viewBox="0 0 100 100" aria-hidden="true">
              <Art slot={monsterSlot(enemy.kind)} fit="slice">
                <MonsterArt kind={enemy.kind} seedName={enemy.id} />
              </Art>
            </svg>
          </span>
          <div className="fight-who">
            <h2>{beast.name}</h2>
            {/* The run of cards, as pips. A child can see how much is left without
                reading a number, which is the whole reason a boss is three and not
                thirty health. */}
            <p className="fight-run" aria-label={`${combat.trials.length} cards`}>
              {combat.trials.map((t, i) => (
                <span
                  key={i}
                  className={`run-pip${
                    t.result === "won" ? " is-won" : t.result === "lost" ? " is-lost" : ""
                  }${i === combat.at && !over ? " is-now" : ""}`}
                />
              ))}
              <span className="muted">
                {combat.trials.length === 1 ? "One card" : `${combat.trials.length} cards — win them all`}
              </span>
            </p>
          </div>
        </header>

        {bites.length > 0 && (
          <ul className="fight-bites">
            {bites.map((f) => (
              <li key={f}>
                <strong>{f}</strong> {FEATURE_BITE[f]}
              </li>
            ))}
          </ul>
        )}

        {!over && playing && (
          <div className="game">
            <div className="game-card">
              <span className={`game-suit suit-${playing.trial.card.suit}`}>
                {SUIT_PIP[playing.trial.card.suit]}
              </span>
              <span className="game-rank">{playing.trial.card.rank}</span>
              <span className="game-name">{GAME_NAME[playing.challenge.kind]}</span>
              <span className="game-hard">{difficultyOf(playing.trial.card.rank)}</span>
            </div>
            <p className="game-how">{GAME_HOW[playing.challenge.kind]}</p>

            {stage === "deal" && (
              <div className="game-stage">
                {isSecret(playing.challenge) ? (
                  <>
                    <p className="game-warn">
                      One of you does this one. <strong>Only they look.</strong> Everybody else,
                      eyes up.
                    </p>
                    <button type="button" className="big" onClick={() => setStage("look")}>
                      I am doing it — show me
                    </button>
                  </>
                ) : (
                  <>
                    <p className="game-warn">All of you together. Ready?</p>
                    <button type="button" className="big" onClick={() => setStage("run")}>
                      Turn it over — {seconds} seconds
                    </button>
                  </>
                )}
              </div>
            )}

            {stage === "look" && (
              <div className="game-stage">
                <p className="game-prompt">{playing.challenge.prompt}</p>
                {playing.trial.hinted && <p className="game-hint">{playing.challenge.hint}</p>}
                <button type="button" className="big" onClick={() => setStage("run")}>
                  Got it — start the clock
                </button>
              </div>
            )}

            {stage === "run" && (
              <div className="game-stage">
                {isSecret(playing.challenge) ? (
                  <p className="game-hidden">Go! Everybody else, guess.</p>
                ) : (
                  <>
                    <p className="game-prompt">{playing.challenge.prompt}</p>
                    {playing.trial.hinted && <p className="game-hint">{playing.challenge.hint}</p>}
                  </>
                )}
                <Clock left={left} of={seconds} />
                <div className="game-calls">
                  <button type="button" className="big win" onClick={onWon}>
                    We did it!
                  </button>
                  <button type="button" className="ghost" onClick={onLost}>
                    We could not
                  </button>
                </div>
              </div>
            )}

            <div className="game-helps">
              <button
                type="button"
                className="ghost"
                disabled={combat.hintsLeft <= 0 || playing.trial.hinted}
                onClick={onHint}
                title={
                  playing.trial.hinted
                    ? "Already read"
                    : combat.hintsLeft <= 0
                      ? "No hints left. Boots buy them."
                      : "Read the hint"
                }
              >
                Hint ({combat.hintsLeft})
              </button>
              {skills.map(({ who, ready }) => {
                const skill = SKILLS[who.role];
                if (!skill.pressed) return null;
                return (
                  <button
                    key={who.id}
                    type="button"
                    className="ghost"
                    disabled={!ready}
                    onClick={() => onSkill(who.id)}
                    title={
                      !hasSkill(who)
                        ? `${who.name} is out of health, so ${skill.title} is gone until somebody patches them up.`
                        : combat.skillsUsed.includes(who.id)
                          ? `${who.name} has already used it this fight.`
                          : skill.text
                    }
                  >
                    {who.name}: {skill.title}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {over ? (
          <footer
            className={`fight-foot fight-${
              combat.outcome === "enemyDefeated" ? "win" : combat.outcome === "enemyEscaped" ? "away" : "lose"
            }`}
          >
            <p className="fight-result">
              {combat.outcome === "enemyDefeated"
                ? "Beaten!"
                : combat.outcome === "enemyEscaped"
                  ? "It got away!"
                  : // Not "out of time": the table may have tapped "we could not"
                    // with thirty seconds left, and telling a child the clock beat
                    // them when it did not is the app getting the story wrong.
                    "Not this time"}
            </p>
            {/* The answers, always, on the games that have one. A puzzle nobody was
                ever told the answer to is the one thing at a table that genuinely
                annoys a child - and it is the difference between a hard question and
                an unfair one. */}
            {(() => {
              const told = combat.trials
                .map((t) => ({ t, c: challengeFor(t.card) }))
                .filter(({ t, c }) => t.result !== null && c.answer !== undefined);
              if (told.length === 0) return null;
              return (
                <ul className="fight-answers">
                  {told.map(({ c }, i) => (
                    <li key={i}>
                      <span className="muted">{c.prompt}</span> <strong>{c.answer}</strong>
                    </li>
                  ))}
                </ul>
              );
            })()}
            <p className="muted">
              {combat.outcome === "enemyDefeated" && `The ${beast.name} is out of the game.`}
              {combat.outcome === "enemyEscaped" &&
                "It went into the water. It cannot do that twice."}
              {combat.outcome === "partyBeaten" &&
                `The ${beast.name} is still standing right there. Come back for it — nothing is remembered.`}
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
                      <div className="loot-item">
                        <span className="loot-face">
                          <svg viewBox="0 0 100 100" aria-hidden="true" className="buy-art">
                            <Art slot={`item:${item.name}`}><ItemArt name={item.name} seedName={item.id} /></Art>
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
            {/* Eating is not the turn's action and never was: the spec is explicit that
                supply may be used at any time, "including in the middle of a fight" -
                and a health back is a skill back. */}
            {party.some((p) => p.supply.length > 0) && (
              <div className="fight-supply">
                <p className="fight-supply-title">Eat something. It does not cost anything.</p>
                <ul className="stock">
                  {party.flatMap((who) =>
                    who.supply.map((item) => (
                      <li key={`${who.id}-${item.id}`}>
                        <button
                          type="button"
                          className="buy"
                          onClick={() => onEat(who.id, item.id)}
                          disabled={item.value <= 0 || who.health >= who.maxHealth}
                          title={
                            item.value <= 0
                              ? `The ${item.name} is not food.`
                              : `${who.name} eats the ${item.name} for ${item.value} health`
                          }
                        >
                          <svg viewBox="0 0 100 100" aria-hidden="true" className="buy-art">
                            <Art slot={`item:${item.name}`}><ItemArt name={item.name} seedName={item.id} /></Art>
                          </svg>
                          <span className="buy-name">{who.name}: {item.name}</span>
                          <span className="buy-value">+{item.value}</span>
                        </button>
                      </li>
                    )),
                  )}
                </ul>
              </div>
            )}
            <p className="muted fight-stakes">
              Lose a card and the fight is lost: a health off {party.length === 1 ? "you" : "everybody"}
              {party.some((p) => p.role === "knight" && hasSkill(p)) && ", unless the knight wears it"}.
              Nobody leaves the game for it.
            </p>
          </footer>
        )}
      </div>
      <span style={{ display: "none" }}>{CHIP}{INK}</span>
    </div>
  );
}
