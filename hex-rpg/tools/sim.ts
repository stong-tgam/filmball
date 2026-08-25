/**
 * Play the game a few hundred times with a bot and report how it ends.
 *
 * The point is not that the bot plays well - it plays like a distracted child, which
 * is roughly the floor we care about. The point is the *shape* of the outcomes. A
 * build where nobody ever wins is not a hard game, it is a broken one; a build where
 * nobody ever loses is not a kind game, it is a boring one. Somewhere around a third
 * wins, a third out of time and a third wiped out is the band to stay inside.
 *
 * Run it after any change to the turn limit, sight, monster placement or the economy:
 *
 *     npx vite-node tools/sim.ts [games]
 */

import { startGame } from "../src/game/setup";
import { activePlayer, endTurn, legalMoves, movePlayer } from "../src/game/turn";
import { attack, endCombat, flee } from "../src/game/combat";
import { canSearch, search } from "../src/game/actions";
import { clearDraw } from "../src/game/turn";
import { distance, fromLabel } from "../src/game/hex";
import { makeRng } from "../src/game/rng";
import type { GameState } from "../src/game/types";

/** One turn of a bot that walks about, pokes at things, and runs when hurt. */
function botTurn(state: GameState, roll: () => number): GameState {
  let next = state.draw ? clearDraw(state) : state;

  // Fight, or get out if it is going badly.
  let guard = 0;
  while (next.combat && next.combat.outcome === "ongoing" && guard++ < 12) {
    const me = next.players.find((p) => p.id === next.combat!.playerId)!;
    next = me.health <= 1 ? flee(next) : attack(next);
  }
  // A finished fight still sits in state until it is closed; leaving it there stalls
  // the whole simulation, which is exactly the bug that made this read 100% timeouts.
  if (next.combat && next.combat.outcome !== "ongoing") next = endCombat(next);
  if (next.combat) return endTurn(next);
  if (next.ending) return next;

  // Movement is spent a tile at a time, so walk until the legs run out or something
  // interrupts. A bot that took one step and stopped would understate how far a party
  // actually gets in a turn.
  for (let step = 0; step < 4 && !next.combat && !next.ending; step++) {
    const me = activePlayer(next);
    const moves = [...legalMoves(next, me).keys()];
    if (moves.length === 0) break;
    {
      // Play like somebody who has read the box: the dragon is in the middle, so
      // walk inward, with enough wandering to bump into things on the way. A purely
      // random walker never crosses a 61-tile board inside the turn limit and tells
      // us nothing about whether the game is winnable.
      const centre = { q: 0, r: 0 };
      const wander = roll() < 0.25;
      const pick = wander
        ? moves[Math.floor(roll() * moves.length)]
        : moves.reduce((best, m) =>
            distance(fromLabel(m)!, centre) < distance(fromLabel(best)!, centre) ? m : best,
          );
      next = movePlayer(next, pick);
    }
  }

  guard = 0;
  while (next.combat && next.combat.outcome === "ongoing" && guard++ < 12) {
    const who = next.players.find((p) => p.id === next.combat!.playerId)!;
    next = who.health <= 1 ? flee(next) : attack(next);
  }
  if (next.ending) return next;

  const after = activePlayer(next);
  if (!next.combat && canSearch(next, after)) next = search(next);

  if (next.combat && next.combat.outcome !== "ongoing") next = endCombat(next);
  return next.combat ? next : endTurn(next);
}

function play(seed: number): { ending: GameState["ending"]; purse: number } {
  const rng = makeRng(seed * 7919 + 13);
  let state = startGame(seed);
  for (let i = 0; i < 4000 && !state.ending; i++) state = botTurn(state, () => rng.next());
  return {
    ending: state.ending ?? "outOfTime",
    // What the party is holding when the lights go up. The bot never shops, so this
    // is gross earnings rather than savings - which is the number a change to the
    // economy actually moves.
    purse: state.players.reduce((sum, p) => sum + p.money, 0) / state.players.length,
  };
}

if (process.env.DIAG) {
  const rng = makeRng(99);
  let state = startGame(3);
  let fights = 0;
  for (let i = 0; i < 4000 && !state.ending; i++) {
    const before = state.combat;
    state = botTurn(state, () => rng.next());
    if (!before && state.combat) fights++;
  }
  const dragon = state.enemies.find((e) => e.kind === "finalboss")!;
  console.log({
    turn: state.turn,
    ending: state.ending,
    fights,
    dragonHex: dragon.hex,
    dragonDamage: dragon.damageTaken,
    dragonHealth: dragon.maxHealth,
    closest: Math.min(...state.players.map((p) => distance(p.hex, dragon.hex))),
    alive: state.players.filter((p) => !p.dead).length,
    log: state.log.slice(-6).map((l) => l.text),
  });
  process.exit(0);
}

const games = Number(process.argv[2] ?? 200);
const tally: Record<string, number> = {};
let purse = 0;
for (let seed = 1; seed <= games; seed++) {
  const result = play(seed);
  const ending = result.ending ?? "outOfTime";
  tally[ending] = (tally[ending] ?? 0) + 1;
  purse += result.purse;
}

console.log(`${games} games:`);
for (const [ending, n] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${ending.padEnd(12)} ${String(n).padStart(4)}  ${((n / games) * 100).toFixed(0)}%`);
}
console.log(`  ${"purse".padEnd(12)} ${`$${(purse / games).toFixed(1)}`.padStart(4)}  per player at the end`);
