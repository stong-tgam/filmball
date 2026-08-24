/**
 * Turn order and movement.
 *
 * Pure functions over GameState: each one takes a state and returns the next state,
 * never mutating what it was given. v0.2 runs the short version of the spec's loop -
 * each player moves once, then the turn passes - because hazards, events, combat and
 * actions do not exist yet. The phases they slot into are already named in `Phase`.
 */

import { fromLabel, key, reachable } from "./hex";
import { ROLES } from "./players";
import type { GameState, LogEntry, Player } from "./types";

export const activePlayer = (state: GameState): Player => state.players[state.activePlayerIndex];

/** Tiles per turn. Boots arrive in v0.4 and will add to this. */
export const moveRange = (player: Player): number => ROLES[player.role].move;

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
 */
export function legalMoves(state: GameState, player: Player): Map<string, number> {
  if (player.dead || player.movedThisTurn || state.phase === "gameOver") return new Map();

  const occupied = new Set(
    state.players.filter((p) => p.id !== player.id && !p.dead).map((p) => key(p.hex)),
  );

  const moves = new Map<string, number>();
  for (const [label, steps] of reachable(player.hex, moveRange(player))) {
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
  return note(
    { ...state, players },
    `${player.name} moved to ${destination} (${steps} ${steps === 1 ? "tile" : "tiles"}).`,
  );
}

/**
 * Hand the turn to the next living player, rolling the turn counter over when the
 * party comes back round to the start.
 */
export function endTurn(state: GameState): GameState {
  if (state.phase === "gameOver") return state;

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
  const players = next.players.map((p, i) => (i === index ? { ...p, movedThisTurn: false } : p));
  const started = { ...next, players, activePlayerIndex: index, turn, phase: "playerMove" as const };
  return turn === next.turn ? started : note(started, `— Turn ${turn} —`);
}
