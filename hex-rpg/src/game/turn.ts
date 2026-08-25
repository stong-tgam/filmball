/**
 * Turn order and movement.
 *
 * Pure functions over GameState: each one takes a state and returns the next state,
 * never mutating what it was given. v0.2 runs the short version of the spec's loop -
 * each player moves once, then the turn passes - because hazards, events, combat and
 * actions do not exist yet. The phases they slot into are already named in `Phase`.
 */

import { draw as drawCard, isFace } from "./cards";
import { startCombat } from "./combat";
import { enemyAt } from "./enemies";
import { applyEvent, createEventDeck } from "./events";
import { isDestroyed, meet, moveHazards } from "./hazards";
import { fromLabel, key, reachable } from "./hex";
import { hasMoved, stepsLeft } from "./players";
import { bearingBetween, compassName } from "./sense";
import { cardName } from "./cards";
import type { EventCard, GameState, LogEntry, Player } from "./types";

export const activePlayer = (state: GameState): Player => state.players[state.activePlayerIndex];

// Both live in players.ts so combat.ts can read a player's speed for the escape roll
// without importing this file, which already imports combat.ts.
export { BASE_MOVE, hasMoved, moveRange, stepsLeft } from "./players";

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
  // Ground the tornado has just been through is nobody's idea of a route.
  const standable = (h: { q: number; r: number }) =>
    !isDestroyed(state.tiles[key(h)], state.turn);

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

  const players = state.players.map((p) =>
    p.id === player.id ? { ...p, hex, stepsTaken: p.stepsTaken + 1 } : p,
  );
  const moved = note(
    { ...state, players },
    `${player.name} walked ${steps === 1 ? "one tile" : `${steps} tiles`} ${compassName(bearingBetween(player.hex, hex))}.`,
  );

  // Walking into a hazard sets it off, the same as it walking into you.
  let arrived = moved;
  for (const hazard of moved.hazards) {
    if (key(hazard.hex) === destination) arrived = meet(arrived, hazard.kind, player.id);
  }

  // Walking onto something starts the fight there and then, and the fight is this
  // turn's action - you do not get to brawl and then go shopping.
  const enemy = enemyAt(arrived.enemies, destination);
  if (!enemy) return arrived;
  // An unfound monster was not on the board when the move was chosen, so this is an
  // ambush and `flee` lets the player straight back out of it. Marking the action
  // spent still happens - the turn is gone either way - but `flee` un-spends it for
  // a first-round walk-out.
  const ambush = !enemy.found;
  const fighting = {
    ...arrived,
    players: arrived.players.map((p) => (p.id === player.id ? { ...p, actedThisTurn: true } : p)),
  };
  return startCombat(fighting, enemy, key(player.hex), ambush);
}

/**
 * The top of a turn: the hazards each take a step, then a poker card comes off the
 * event deck, and if it is a face card, an event with it. The card sits in
 * `state.draw` until the table has read it.
 */
export function beginTurn(state: GameState): GameState {
  // Hazards move first. The spec is explicit about the order, and it matters: an
  // event that changes the ground has to land after the ground has been changed.
  const stirred = moveHazards(state);

  const pull = drawCard(stirred.pokerDeck, stirred.rngState);
  let next: GameState = { ...stirred, pokerDeck: pull.deck, rngState: pull.rngState };

  if (!isFace(pull.card)) {
    return note({ ...next, draw: { card: pull.card, event: null } }, `Drew ${cardName(pull.card)}. A quiet turn.`);
  }

  // A face card brings an event. The deck reshuffles rather than running dry.
  const deck: EventCard[] = next.eventDeck.length > 0 ? next.eventDeck : createDeck(next);
  const [event, ...rest] = deck;
  next = note(next, `Drew ${cardName(pull.card)} — an event!`);
  next = applyEvent({ ...next, eventDeck: rest }, event);
  return { ...next, draw: { card: pull.card, event } };
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
    if (!player.dead || player.fellOn === null) continue;
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
  if (!hasMoved(player) && !player.dead) {
    next = note(next, `${player.name} held position.`);
  }

  // Rulebook §7: the fallen can pick themselves up after a full turn, and a doctor
  // reaching them is instant. Nobody is out of the game for good.
  next = tendTheFallen(next);

  const living = next.players.filter((p) => !p.dead);
  if (living.length === 0) {
    return note(
      { ...next, phase: "gameOver", ending: "partyLost" },
      "Everybody is down. The dragon wins this one.",
    );
  }

  let index = next.activePlayerIndex;
  let turn = next.turn;
  let players = next.players;

  // Walk forward to the next player who can actually take a turn. The dead are
  // skipped for good; anyone the tornado flattened is skipped once, and getting
  // skipped is what clears it.
  for (;;) {
    index = (index + 1) % players.length;
    if (index === 0) turn += 1;

    if (players[index].dead) continue;
    if (players[index].stunned) {
      next = note(next, `${players[index].name} is still picking themselves up.`);
      players = players.map((p, i) => (i === index ? { ...p, stunned: false } : p));
      continue;
    }
    break;
  }
  next = { ...next, players };

  if (turn > next.turnLimit) {
    return note(
      { ...next, phase: "gameOver", ending: "outOfTime", turn: next.turnLimit },
      `Turn ${next.turnLimit} was the last one. The dragon is still out there.`,
    );
  }

  // A fresh turn for whoever is up next. Rulebook §8's second guard - a player joins
  // at most one fight per round - is cleared when the round rolls over rather than
  // per player, or the same friend gets dragged into every fight of the round.
  const rolled = turn !== next.turn;
  const ready = next.players.map((p, i) => ({
    ...(i === index ? { ...p, stepsTaken: 0, actedThisTurn: false } : p),
    joinedFightThisRound: rolled ? false : p.joinedFightThisRound,
  }));
  const started = { ...next, players: ready, activePlayerIndex: index, turn, phase: "playerMove" as const };
  // A new turn for the whole party, not just the next player, is what draws a card.
  return turn === next.turn ? started : beginTurn(note(started, `— Turn ${turn} —`));
}
