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
import {
  attack,
  canSwingTwice,
  endCombat,
  flee,
  invitable,
  invite,
  inviteTargets,
  takeSpoil,
} from "../src/game/combat";
import { canFish, canSearch, eat, fish, search, tileMates } from "../src/game/actions";
import { canFightThief, fightThief } from "../src/game/hazards";
import { canSetGem, powerOf, setGem } from "../src/game/gems";
import { clearDraw } from "../src/game/turn";
import { distance, fromLabel } from "../src/game/hex";
import { doomed, edgeFallsAfter } from "../src/game/collapse";
import { makeRng } from "../src/game/rng";
import { MAX_PARTY, MIN_PARTY, TURN_ORDER } from "../src/game/players";
import type { GameState } from "../src/game/types";

/**
 * Rulebook §8: pull in anybody within a shout who is not hurt enough to regret it.
 *
 * The bot is deliberately dim, and this is about as clever as it gets - but a bot
 * that never invites cannot measure the rule at all, and the rule is the whole point
 * of the change. Only healthy friends: dragging somebody on one health into a dragon
 * fight is how you turn a timeout into a wipe.
 */
function shoutForHelp(state: GameState): GameState {
  let next = state;
  const before = next.combat?.allies.length ?? 0;
  for (const who of inviteTargets(next)) {
    if (who.health <= 2) continue;
    next = invite(next, who.id);
  }
  stats.alliesJoined += (next.combat?.allies.length ?? 0) - before;
  return next;
}

/**
 * Eat when hurt, for everybody, not just whoever is up.
 *
 * The bot went twenty-two versions without ever using a supply item, which quietly
 * made the **wipe** figure the least trustworthy of the three numbers it reports: not
 * eating is precisely what kills a party. Eating is free and works on anybody's turn
 * (`eat` deliberately ignores whose turn it is), so a family does this constantly and
 * the bot never did.
 *
 * Deliberately dim: eat only when a whole food's worth of health is missing, so
 * nothing is wasted topping up from 3 to 4, and take whatever is at the front of the
 * pack rather than choosing.
 */
function eatIfHurt(state: GameState): GameState {
  let next = state;
  for (const player of next.players) {
    if (player.dead) continue;
    let guard = 0;
    while (guard++ < 4) {
      const who = next.players.find((p) => p.id === player.id)!;
      const bite = who.supply.find((i) => i.value > 0 && who.health + i.value <= who.maxHealth);
      if (!bite) break;
      const after = eat(next, who.id, bite.id);
      if (after === next) break;
      next = after;
      stats.mealsEaten++;
    }
  }
  return next;
}

/**
 * What the party actually did together, as opposed to what it scored.
 *
 * The win rate cannot tell you whether the co-operative machinery is reachable - a
 * party that never once fights together and one that fights together every time can
 * post the same number. These count the thing itself.
 */
const stats = {
  groupFights: 0,
  soloFights: 0,
  alliesJoined: 0,
  mealsEaten: 0,
  handOvers: 0,
  dragonFights: 0,
  thiefFights: 0,
  stonesFound: 0,
  secondWinds: 0,
  lostToAbyss: 0,
  rounds: 0,
  goes: 0,
};

export const resetStats = (): void => {
  stats.groupFights = 0;
  stats.soloFights = 0;
  stats.alliesJoined = 0;
  stats.mealsEaten = 0;
  stats.handOvers = 0;
  stats.dragonFights = 0;
  stats.thiefFights = 0;
  stats.stonesFound = 0;
  stats.secondWinds = 0;
  stats.lostToAbyss = 0;
  stats.rounds = 0;
  stats.goes = 0;
};

/**
 * What the bot does with a stone.
 *
 * Leave it in the coat, which is where it lands, until the once-a-game save has been
 * used - then move it to the weapon, whose power never runs out. That is the dullest
 * defensible policy, which is what a bot should have: a family will read the three
 * lines and pick, and every figure this file prints is meant to be a floor.
 */
function mindTheStone(state: GameState): GameState {
  const me = activePlayer(state);
  if (!me.gem || !canSetGem(state, me)) return state;
  const spentHere = powerOf(me.gem).limit === "game" && me.gem.spent.includes(me.gem.set);
  return spentHere && me.gem.set !== "weapon" ? setGem(state, me.id, "weapon") : state;
}

/** One turn of a bot that walks about, pokes at things, and runs when hurt. */
function botTurn(state: GameState, roll: () => number): GameState {
  let next = state.draw ? clearDraw(state) : state;
  next = eatIfHurt(next);
  next = mindTheStone(next);
  // Which fight, if any, was already running when this turn began. A fight usually
  // *starts* partway through a turn - you walk into it - so counting at the top of
  // the turn misses every one of them, which is how the first version of this counter
  // reported zero group fights in the same run as five friends joining them.
  const fightAtStart = state.combat?.enemyId ?? null;
  const countFight = (s: GameState) => {
    if (!s.combat || s.combat.enemyId === fightAtStart) return;
    const enemy = s.enemies.find((e) => e.id === s.combat!.enemyId);
    if (enemy?.kind === "finalboss") stats.dragonFights++;
    if (enemy && invitable(enemy)) stats.groupFights++;
    else stats.soloFights++;
  };

  // Fight, or get out if it is going badly.
  let guard = 0;
  while (next.combat && next.combat.outcome === "ongoing" && guard++ < 12) {
    next = shoutForHelp(next);
    const me = next.players.find((p) => p.id === next.combat!.playerId)!;
    next = me.health <= 1 ? flee(next) : attack(next, canSwingTwice(next));
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
    let moves = [...legalMoves(next, me).keys()];
    if (moves.length === 0) break;
    {
      // The rim falls in every quarter of the game and takes whoever is on it
      // (`collapse.ts`). A family gets a turn's warning on the banner and on the
      // ground itself, so a bot that walked into the abyss would be measuring a
      // warning nobody read rather than the rule.
      const doom = edgeFallsAfter(next.turn, next.turnLimit);
      if (doom) {
        const safe = moves.filter((m) => !doomed(fromLabel(m)!, next.turn, next.turnLimit));
        if (safe.length > 0) moves = safe;
      }
      const cornered = doom && doomed(me.hex, next.turn, next.turnLimit);
      // Play like somebody who has read the box: the dragon is in the middle, so
      // walk inward, with enough wandering to bump into things on the way. A purely
      // random walker never crosses a 61-tile board inside the turn limit and tells
      // us nothing about whether the game is winnable.
      const centre = { q: 0, r: 0 };
      // Standing on ground that is about to go is not the moment to wander.
      const wander = !cornered && roll() < 0.25;
      const pick = wander
        ? moves[Math.floor(roll() * moves.length)]
        : moves.reduce((best, m) =>
            distance(fromLabel(m)!, centre) < distance(fromLabel(best)!, centre) ? m : best,
          );
      next = movePlayer(next, pick);
    }
  }

  // Walking onto a thief no longer starts the fight for you - §5.5 makes it a choice,
  // fight them or buy your way past. The bot always fights: that is how the money it
  // has been robbed of comes back, and a bot that always paid would measure a game
  // nobody plays.
  if (!next.combat && !next.ending && canFightThief(next, activePlayer(next))) {
    next = fightThief(next);
    if (next.combat) stats.thiefFights++;
  }

  countFight(next);

  guard = 0;
  while (next.combat && next.combat.outcome === "ongoing" && guard++ < 12) {
    next = shoutForHelp(next);
    const who = next.players.find((p) => p.id === next.combat!.playerId)!;
    next = who.health <= 1 ? flee(next) : attack(next, canSwingTwice(next));
  }
  if (next.ending) return next;

  const after = activePlayer(next);
  // Fish if you can, search otherwise. The bot eats what it catches now (see
  // `eatIfHurt`), so the fisherman's food counts towards survival as well as towards
  // the board and the economy.
  if (!next.combat && canFish(next, after)) next = fish(next);
  else if (!next.combat && canSearch(next, after)) next = search(next);

  // Take the loot. The bot went without this for far too long, which meant every
  // change to what monsters drop - and the rogue's extra pick outright - was invisible
  // to the sim: it could measure the fight and not the reward.
  let picks = 0;
  while (next.combat && next.combat.picksLeft > 0 && next.combat.spoils.length > 0 && picks++ < 8) {
    const before = next.combat.picksLeft;
    next = takeSpoil(next, next.combat.spoils[0].id);
    if ((next.combat?.picksLeft ?? 0) >= before) break;
  }

  if (next.combat && next.combat.outcome !== "ongoing") next = endCombat(next);
  next = eatIfHurt(next);
  return next.combat ? next : endTurn(next);
}

function play(
  seed: number,
  party: number,
): { ending: GameState["ending"]; purse: number; dragonLeft: number } {
  const rng = makeRng(seed * 7919 + 13);
  let state = startGame(seed, TURN_ORDER.slice(0, party));
  for (let i = 0; i < 4000 && !state.ending; i++) state = botTurn(state, () => rng.next());
  stats.stonesFound += state.log.filter((l) => /turned up a (green|red|blue) stone/.test(l.text)).length;
  stats.secondWinds += state.log.filter((l) => /(held them up|gritted it out|stepped in front|second throw|no roll needed)/.test(l.text)).length;
  const dragon = state.enemies.find((e) => e.kind === "finalboss")!;
  stats.lostToAbyss += state.players.filter((p) => p.gone).length;
  stats.rounds += state.turn;
  stats.goes += state.log.filter((l) => l.text.includes("— Turn")).length;
  return {
    dragonLeft: 1 - Math.min(1, dragon.damageTaken / dragon.maxHealth),
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
  stats.stonesFound += state.log.filter((l) => /turned up a (green|red|blue) stone/.test(l.text)).length;
  stats.secondWinds += state.log.filter((l) => /(held them up|gritted it out|stepped in front|second throw|no roll needed)/.test(l.text)).length;
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

// `npx vite-node tools/sim.ts 800 [party size]`. The size matters: the board scales
// to the party (`monsterCount`, `bossHealth`), and the README carries a per-size table
// that has to be re-measured whenever any of that moves.
const games = Number(process.argv[2] ?? 200);
const party = Math.min(Math.max(Number(process.argv[3] ?? TURN_ORDER.length), MIN_PARTY), MAX_PARTY);
const tally: Record<string, number> = {};
let purse = 0;
let dragonLeft = 0;
for (let seed = 1; seed <= games; seed++) {
  const result = play(seed, party);
  const ending = result.ending ?? "outOfTime";
  tally[ending] = (tally[ending] ?? 0) + 1;
  purse += result.purse;
  dragonLeft += result.dragonLeft;
}

console.log(`${games} games, ${party} players:`);
for (const [ending, n] of Object.entries(tally).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${ending.padEnd(12)} ${String(n).padStart(4)}  ${((n / games) * 100).toFixed(0)}%`);
}
console.log(`  ${"purse".padEnd(12)} ${`$${(purse / games).toFixed(1)}`.padStart(4)}  per player at the end`);

// What the party did together. The endings above cannot tell you whether the
// co-operative rules were reachable at all - a party that never fights together and
// one that always does can post identical win rates.
const per = (n: number) => (n / games).toFixed(1);
console.log(`  ${"together".padEnd(12)} ${per(stats.groupFights)} boss fights + ${per(stats.soloFights)} mobs a game, ${per(stats.alliesJoined)} friends joining`);
console.log(`  ${"meals".padEnd(12)} ${per(stats.mealsEaten)} eaten a game`);
console.log(`  ${"dragon".padEnd(12)} ${per(stats.dragonFights)} fights a game, ${((dragonLeft / games) * 100).toFixed(0)}% of it still standing at the end`);
console.log(`  ${"thieves".padEnd(12)} ${per(stats.thiefFights)} taken on a game`);
console.log(`  ${"stones".padEnd(12)} ${per(stats.stonesFound)} found a game, ${per(stats.secondWinds)} powers fired`);
console.log(`  ${"length".padEnd(12)} ${per(stats.rounds)} rounds, ${(stats.rounds / games * party).toFixed(0)} individual goes`);
console.log(`  ${"abyss".padEnd(12)} ${per(stats.lostToAbyss)} lost over the edge a game`);
