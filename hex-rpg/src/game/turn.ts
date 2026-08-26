/**
 * Turn order and movement.
 *
 * Pure functions over GameState: each one takes a state and returns the next state,
 * never mutating what it was given. v0.2 runs the short version of the spec's loop -
 * each player moves once, then the turn passes - because hazards, events, combat and
 * actions do not exist yet. The phases they slot into are already named in `Phase`.
 */

import { draw as drawCard, isFace, rankValue } from "./cards";
import { startCombat } from "./combat";
import { activeMembers, membersOf, teamOf } from "./teams";
import { DRAGON_WAKES_ON, ENEMIES, enemyAt, wanderIn } from "./enemies";
import { applyEvent, createEventDeck } from "./events";
import { hazardMoves, isDestroyed, meet, moveHazards } from "./hazards";
import { fromLabel, key, reachable } from "./hex";
import { collapseRim, hasFallen } from "./collapse";
import { rememberAll } from "./vision";
import { makeRng } from "./rng";
import { hasMoved, stepsLeft } from "./players";
import { bearingBetween, compassName } from "./sense";
import { cardName } from "./cards";
import type { Card, Enemy, EventCard, GameState, LogEntry, Player } from "./types";

export const activePlayer = (state: GameState): Player => state.players[state.activePlayerIndex];

// Both live in players.ts so combat.ts can read a player's speed for the escape roll
// without importing this file, which already imports combat.ts.
export { BASE_MOVE, hasMoved, moveRange, stepsLeft } from "./players";
import { BASE_MOVE } from "./players";

const note = (state: GameState, text: string): GameState => ({
  ...state,
  log: [...state.log, { turn: state.turn, text } satisfies LogEntry],
});

/**
 * Where the player may end their move, mapped to how many steps it takes to get
 * there. The player's own tile is not included: staying put is ending the turn, not
 * a move.
 *
 * PASS-THROUGH RULE, as implemented: a player may move *through* a tile another
 * player is standing on, but may not stop on it. The rulebook is missing and the
 * spec names the rule without defining it, so this is a choice - the friendlier of
 * the two readings, since being boxed in by your own family is a miserable way for a
 * seven-year-old to lose a turn. Reverse it by passing a `passable` predicate to
 * `reachable` below.
 *
 * Enemies are the opposite: you may walk onto one, which starts a fight, but you may
 * not walk past it. Something in your way is in your way.
 */
/**
 * Where this player may step **next**, which is always one tile.
 *
 * Movement is spent a tile at a time even when there is more than one tile of it. On a
 * hidden board, offering a two-tile destination up front would mean picking a square
 * you cannot see; taking one step and looking again is what extra movement is *for*.
 */
export function legalMoves(state: GameState, player: Player): Map<string, number> {
  if (player.dead || stepsLeft(player) === 0 || state.phase === "gameOver") return new Map();

  // **You may stand on a friend.** Players stack, and getting the party onto one tile
  // is now something the game wants: it is how you trade face to face, it is where the
  // fisherman's hook puts you, and it is where a group fight has to happen. Blocking
  // it was the older rule and it made the party four people who could never quite meet.
  //
  // Monsters are the opposite and always have been: onto one, never past it (§5).

  const guarded = (h: { q: number; r: number }) => enemyAt(state.enemies, key(h)) !== undefined;
  // Ground the tornado has just been through is nobody's idea of a route, and ground
  // that has fallen into the abyss is not ground at all.
  const standable = (h: { q: number; r: number }) =>
    !isDestroyed(state.tiles[key(h)], state.turn) &&
    !hasFallen(h, state.turn, state.turnLimit);

  const moves = new Map<string, number>();
  for (const [label, steps] of reachable(player.hex, 1, standable, guarded)) {
    if (steps === 0) continue;
    moves.set(label, steps);
  }
  return moves;
}

/** Move the active player. Returns the state unchanged if the tile is not legal. */
export function movePlayer(state: GameState, destination: string): GameState {
  const player = activePlayer(state);
  const steps = legalMoves(state, player).get(destination);
  const hex = fromLabel(destination);
  if (steps === undefined || hex === null) return state;

  // **The whole team walks.** A team is the thing that stands on a tile, because a
  // team is the thing that plays a mini-game - and a rule that let one of them wander
  // off would be a rule that produced a fight with one player in it, which is not a
  // game anybody can play.
  const team = teamOf(state, player.id);
  const walking = new Set(team ? team.memberIds : [player.id]);
  const players = state.players.map((p) =>
    walking.has(p.id) && !p.gone ? { ...p, hex, stepsTaken: p.stepsTaken + 1 } : p,
  );
  const moved = note(
    { ...state, players },
    `${team ? team.name : player.name} walked ${steps === 1 ? "one tile" : `${steps} tiles`} ${compassName(bearingBetween(player.hex, hex))}.`,
  );

  // Walking into a hazard sets it off, the same as it walking into you.
  let arrived = moved;
  for (const hazard of moved.hazards) {
    if (key(hazard.hex) === destination) arrived = meet(arrived, hazard.kind, player.id);
  }

  // Walking onto something starts the fight there and then, and the fight is this
  // turn's action - you do not get to brawl and then go shopping.
  //
  // **Except a thief.** The robber and the pirates are the two things on the board you
  // are allowed to buy your way past (§5.5), and a fight that starts the instant you
  // step on the tile takes that choice away before anybody has been asked. `meet` has
  // already said "fight, or pay up" above; the buttons for both are on the action bar
  // (`canFightThief`, `canPayOff`).
  // Write down what the step revealed, before anything else happens on this tile.
  // Doing it here rather than only at the end of the turn is what stops ground seen
  // from the first step flickering away when they take the second.
  const noted = rememberAll(arrived);

  // Walking onto something **finds** it. It does not start the fight: `canTakeOn` and
  // `takeOn` put that on a button, because a team is about to be handed a clock and
  // three minutes of everybody's evening, and being asked first is the difference
  // between a moment and an ambush. It is also what makes "they do not have to kill
  // all the mobs" a real option rather than a thing the rules say and the board
  // prevents.
  const enemy = enemyAt(noted.enemies, destination);
  if (!enemy) return noted;
  return {
    ...noted,
    enemies: noted.enemies.map((e) => (e.id === enemy.id ? { ...e, found: true } : e)),
  };
}

/**
 * The top of a turn: the hazards each take a step, then a poker card comes off the
 * event deck, and if it is a face card, an event with it. The card sits in
 * `state.draw` until the table has read it.
 */
/**
 * How high a card has to be to bring an event, and it drops as the game goes on.
 *
 * §4 says face cards, which is 23% of the deck and stays 23% from turn one to turn
 * thirty-two. The back half of a game is where the party has gear, money and a plan,
 * and where a quiet turn is just a turn spent walking - so the world should be getting
 * louder, not staying flat.
 *
 * Three bands over the turn limit, and only the threshold moves:
 *
 * - first third  → jack and up (J Q K A), 31%
 * - second third → ten and up, 38%
 * - last third   → nine and up, 46%
 *
 * The ace counts throughout, which §4's "face cards" quietly excluded - the highest
 * card in the deck doing nothing was always the odd one out.
 */
export function eventThreshold(turn: number, turnLimit: number): number {
  const through = turn / Math.max(1, turnLimit);
  if (through >= 2 / 3) return 9;
  if (through >= 1 / 3) return 10;
  return 11;
}

/** Does this card bring an event, this far into the game? */
export const bringsEvent = (card: Card, turn: number, turnLimit: number): boolean =>
  isFace(card) || rankValue(card) >= eventThreshold(turn, turnLimit);

/* ------------------------------------------------------- picking a fight */

/**
 * The monster standing where the team is, if there is one and it can be taken on.
 *
 * Walking onto something used to start the fight on the spot. It does not any more,
 * and the reason is what a fight became: three minutes of everybody's evening with a
 * clock running. A team should be *asked*. It also makes "you do not have to kill all
 * the mobs" true rather than merely stated - the board no longer forces the fight you
 * happened to walk into.
 */
export function enemyHere(state: GameState): Enemy | undefined {
  const player = activePlayer(state);
  if (!player) return undefined;
  return enemyAt(state.enemies, key(player.hex));
}

/** One fight a turn per team, and a fight is that team's action. */
export function canTakeOn(state: GameState): boolean {
  const player = activePlayer(state);
  return (
    !state.combat &&
    state.ending === null &&
    player !== undefined &&
    !player.actedThisTurn &&
    enemyHere(state) !== undefined
  );
}

/** Take it on. Everybody standing there plays - that is what a team is for. */
export function takeOn(state: GameState): GameState {
  const enemy = enemyHere(state);
  const team = activeMembers(state);
  if (!canTakeOn(state) || !enemy || team.length === 0) return state;

  const spent = {
    ...state,
    players: state.players.map((p) =>
      team.some((m) => m.id === p.id) ? { ...p, actedThisTurn: true } : p,
    ),
  };
  return startCombat(spent, enemy, key(team[0].hex), team.map((p) => p.id));
}

/**
 * Turn 8: everybody, the dragon, no excuses.
 *
 * The table asked for this in as many words - *at turn 8 everyone fights the final
 * boss together regardless of gear, item or health* - and it is the best rule in the
 * game. It removes the two worst endings a hex crawl has: "we never found it", and
 * "we found it and stood next to it while the clock ran out". Everybody is carried to
 * the middle and the last three cards are dealt to the whole table at once.
 *
 * It is why nobody has to be efficient. A team that spent the evening searching woods
 * and losing to bandits still gets the ending, and gets it with everybody in it.
 */
export function finalStand(state: GameState): GameState {
  const dragon = state.enemies.find((e) => e.kind === "finalboss" && !e.defeated);
  const playing = state.players.filter((p) => !p.gone);
  if (!dragon || playing.length === 0 || state.combat) return state;

  const gathered: GameState = {
    ...state,
    enemies: state.enemies.map((e) =>
      e.id === dragon.id ? { ...e, dormant: false, found: true } : e,
    ),
    players: state.players.map((p) =>
      p.gone ? p : { ...p, hex: dragon.hex, actedThisTurn: true, stepsTaken: BASE_MOVE },
    ),
  };
  const called = note(
    rememberAll(gathered),
    `The ground gives out under everybody at once, and they land together in front of the ${ENEMIES.finalboss.name}. Whatever anybody is carrying, this is it. Three cards.`,
  );
  return startCombat(called, dragon, key(dragon.hex), playing.map((p) => p.id));
}

export function beginTurn(state: GameState): GameState {
  // The rim goes first, on the turns it goes at all: everything after this happens on
  // the board that is left, and a hazard that steps onto a tile which is about to fall
  // would be a hazard the party can neither reach nor escape.
  const solid = collapseRim(state);
  if (solid.ending) return solid;

  const risen = wakeTheDragon(solid);

  // Hazards move next. The spec is explicit about the order, and it matters: an
  // event that changes the ground has to land after the ground has been changed.
  const stirred = arrivals(moveHazards(risen));

  // The turn's "meanwhile", for the card the next player is about to be handed. Every
  // line the opening wrote, and which way each wanderer went - read back off the state
  // rather than assembled by the code that did it, so a new effect reports itself.
  const opening = {
    stirred: hazardMoves(state, stirred),
    happenings: stirred.log.slice(state.log.length).map((l) => l.text),
  };

  // The last turn is the dragon and nothing else. No card, no event, no wandering off
  // to the shop: the evening has an ending and this is it.
  if (stirred.turn >= stirred.turnLimit) return finalStand(stirred);

  const pull = drawCard(stirred.pokerDeck, stirred.rngState);
  let next: GameState = { ...stirred, pokerDeck: pull.deck, rngState: pull.rngState };

  if (!bringsEvent(pull.card, next.turn, next.turnLimit)) {
    return note(
      { ...next, draw: { card: pull.card, event: null, ...opening } },
      `Drew ${cardName(pull.card)}. A quiet turn.`,
    );
  }

  // A high card brings an event, and "high" gets lower as the game goes on. The deck
  // reshuffles rather than running dry.
  const deck: EventCard[] = next.eventDeck.length > 0 ? next.eventDeck : createDeck(next);
  const [event, ...rest] = deck;
  next = note(next, `Drew ${cardName(pull.card)} — an event!`);
  next = applyEvent({ ...next, eventDeck: rest }, event);
  return { ...next, draw: { card: pull.card, event, ...opening } };
}

/**
 * The dragon lands on the mountain in the middle, on `DRAGON_WAKES_ON` and not before.
 *
 * Until then its record sits on the centre tile `dormant`: nothing can be placed
 * there, nobody can walk into it, and it neither smokes nor senses. This is the beat
 * the opening is building to, so it is said loudly and by name.
 */
function wakeTheDragon(state: GameState): GameState {
  const dragon = state.enemies.find((e) => e.kind === "finalboss");
  if (!dragon?.dormant || state.turn < DRAGON_WAKES_ON) return state;
  return note(
    {
      ...state,
      enemies: state.enemies.map((e) => (e.id === dragon.id ? { ...e, dormant: false } : e)),
    },
    `Everything goes quiet, and then the sky darkens. The ${ENEMIES.finalboss.name} has come home to the middle of the map — follow the smoke.`,
  );
}

/** One more bandit on the board, more often the later it gets. See `mobArrivalChance`. */
function arrivals(state: GameState): GameState {
  const rng = makeRng(state.rngState);
  const next = wanderIn(state, rng);
  return { ...next, rngState: rng.state() };
}

/** Reshuffles the event deck in place when the last card has been played. */
function createDeck(state: GameState): EventCard[] {
  const { deck } = createEventDeck(state.rngState);
  return deck;
}

/** Put the turn's card away. */
export const clearDraw = (state: GameState): GameState => ({ ...state, draw: null });

/**
 * Rulebook §7, the suggested compromise: a fallen player gets back up on their own
 * after one full turn, at 1 health, on the tile where they fell. A doctor reaching
 * them first is instant - that lives in `actions.ts`.
 */
function tendTheFallen(state: GameState): GameState {
  let next = state;
  for (const player of state.players) {
    // `gone` is the abyss (`collapse.ts`) and there is no getting up from it. Their
    // `fellOn` is already null, so this is the same test said in plain words.
    if (!player.dead || player.gone || player.fellOn === null) continue;
    if (state.turn <= player.fellOn) continue;

    next = note(
      {
        ...next,
        players: next.players.map((p) =>
          p.id === player.id
            ? { ...p, dead: false, health: 1, hex: p.fellAt ?? p.hex, fellAt: null, fellOn: null }
            : p,
        ),
      },
      `${player.name} picked themselves up, on one health.`,
    );
  }
  return next;
}

/**
 * Hand the turn to the next living player, rolling the turn counter over when the
 * party comes back round to the start.
 */
export function endTurn(state: GameState): GameState {
  // A fight has to finish, or be fled, before the turn can pass.
  if (state.phase === "gameOver" || state.ending !== null || state.combat) return state;

  const player = activePlayer(state);
  // Whatever the last search turned up belongs to the turn it happened on. Leaving it
  // set would pop the card up again behind the next player's event card.
  let next: GameState = state.find ? { ...state, find: null } : state;
  if (!hasMoved(player)) {
    next = note(next, `${teamOf(state, player.id)?.name ?? player.name} held position.`);
  }

  // Rulebook §7: the fallen can pick themselves up after a full turn, and a doctor
  // reaching them is instant. Nobody is out of the game for good.
  next = tendTheFallen(next);

  // **The turn passes to the next team, not the next player.** Turn order is still an
  // index into `players` - every rule written before teams reads it - but it only ever
  // lands on a team's first member, which is why the walk below steps over teams and
  // then asks who is leading that one.
  let turn = next.turn;
  let players = next.players;
  const here = next.teams.findIndex((t) => t.memberIds.includes(activePlayer(next)?.id));
  let at = here < 0 ? 0 : here;

  let leader: Player | undefined;
  for (let tried = 0; tried <= next.teams.length; tried++) {
    at = (at + 1) % next.teams.length;
    // Round the horn and back to the first team means a new turn. With one team that
    // is every single go, which is right: one team is one movement a turn.
    if (at === 0) turn += 1;

    const team = next.teams[at];
    const up = membersOf({ ...next, players }, team)[0];
    if (!up) continue;
    // The tornado owes a team a turn, and getting skipped is what pays it off.
    if (up.stunned) {
      next = note(next, `${team.name} are still picking themselves up.`);
      const owed = new Set(team.memberIds);
      players = players.map((p) => (owed.has(p.id) ? { ...p, stunned: false } : p));
      continue;
    }
    leader = up;
    break;
  }
  // Nobody left at all. Only the abyss can do this, and only to a party that stood on
  // the rim through a full turn's warning - so it is a mistake rather than bad luck,
  // and it is the one thing that can finish an evening early. It still needs an
  // ending: a game that quietly stops accepting turns looks like a crash.
  if (!leader) {
    return note(
      { ...next, players, phase: "gameOver", ending: "outOfTime" },
      "There is nobody left on the board. The world closed up around the dragon.",
    );
  }
  const index = players.findIndex((p) => p.id === leader!.id);
  next = { ...next, players };

  if (turn > next.turnLimit) {
    return note(
      { ...next, phase: "gameOver", ending: "outOfTime", turn: next.turnLimit },
      `Turn ${next.turnLimit} was the last one. The dragon is still out there.`,
    );
  }

  // A fresh go for the whole of the team that is up: everybody's steps back to zero
  // and their action back, because they all walk and they all fight.
  const upNext = new Set(next.teams[at].memberIds);
  const ready = next.players.map((p) =>
    upNext.has(p.id) ? { ...p, stepsTaken: 0, actedThisTurn: false } : p,
  );
  // Everybody's memory brought up to date once a turn, which catches the ways a player
  // changes tiles that are not a move: the hook, the tornado, backing out of a fight.
  const started = rememberAll({
    ...next,
    players: ready,
    activePlayerIndex: index,
    turn,
    phase: "playerMove" as const,
  });
  // A new turn for the whole party, not just the next player, is what draws a card.
  return turn === next.turn ? started : beginTurn(note(started, `— Turn ${turn} —`));
}
