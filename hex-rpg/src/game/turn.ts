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
import { fromLabel, key, reachable } from "./hex";
import { ROLES } from "./players";
import { cardName } from "./cards";
import type { EventCard, GameState, LogEntry, Player } from "./types";

export const activePlayer = (state: GameState): Player => state.players[state.activePlayerIndex];

/** Tiles per turn: the role's own legs, plus whatever boots add. */
export const moveRange = (player: Player): number =>
  ROLES[player.role].move + (player.boots?.value ?? 0);

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
export function legalMoves(state: GameState, player: Player): Map<string, number> {
  if (player.dead || player.movedThisTurn || state.phase === "gameOver") return new Map();

  const occupied = new Set(
    state.players.filter((p) => p.id !== player.id && !p.dead).map((p) => key(p.hex)),
  );

  const guarded = (h: { q: number; r: number }) => enemyAt(state.enemies, key(h)) !== undefined;

  const moves = new Map<string, number>();
  for (const [label, steps] of reachable(player.hex, moveRange(player), () => true, guarded)) {
    if (steps === 0 || occupied.has(label)) continue;
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
    p.id === player.id ? { ...p, hex, movedThisTurn: true } : p,
  );
  const moved = note(
    { ...state, players },
    `${player.name} moved to ${destination} (${steps} ${steps === 1 ? "tile" : "tiles"}).`,
  );

  // Walking onto something starts the fight there and then, and the fight is this
  // turn's action - you do not get to brawl and then go shopping.
  const enemy = enemyAt(moved.enemies, destination);
  if (!enemy) return moved;
  const fighting = {
    ...moved,
    players: moved.players.map((p) => (p.id === player.id ? { ...p, actedThisTurn: true } : p)),
  };
  return startCombat(fighting, enemy, key(player.hex));
}

/**
 * The top of a turn: a poker card off the event deck, and if it is a face card, an
 * event with it. The card sits in `state.draw` until the table has read it.
 *
 * Hazards move before this, once they exist - the spec is explicit that the order
 * matters, and the phase goes in ahead of this call.
 */
export function beginTurn(state: GameState): GameState {
  const pull = drawCard(state.pokerDeck, state.rngState);
  let next: GameState = { ...state, pokerDeck: pull.deck, rngState: pull.rngState };

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
 * Hand the turn to the next living player, rolling the turn counter over when the
 * party comes back round to the start.
 */
export function endTurn(state: GameState): GameState {
  // A fight has to finish, or be fled, before the turn can pass.
  if (state.phase === "gameOver" || state.combat) return state;

  const player = activePlayer(state);
  let next = state;
  if (!player.movedThisTurn && !player.dead) {
    next = note(next, `${player.name} held position at ${key(player.hex)}.`);
  }

  const living = next.players.filter((p) => !p.dead);
  if (living.length === 0) return note({ ...next, phase: "gameOver" }, "The party is gone.");

  let index = next.activePlayerIndex;
  let turn = next.turn;
  do {
    index = (index + 1) % next.players.length;
    if (index === 0) turn += 1;
  } while (next.players[index].dead);

  if (turn > next.turnLimit) {
    return note(
      { ...next, phase: "gameOver", turn: next.turnLimit },
      `Turn ${next.turnLimit} was the last one. Time is up.`,
    );
  }

  // A fresh turn for whoever is up next.
  const players = next.players.map((p, i) =>
    i === index ? { ...p, movedThisTurn: false, actedThisTurn: false } : p,
  );
  const started = { ...next, players, activePlayerIndex: index, turn, phase: "playerMove" as const };
  // A new turn for the whole party, not just the next player, is what draws a card.
  return turn === next.turn ? started : beginTurn(note(started, `— Turn ${turn} —`));
}
