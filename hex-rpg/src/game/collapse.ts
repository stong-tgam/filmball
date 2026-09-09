/**
 * The rim falls in.
 *
 * Every quarter of the game the outermost ring of the board drops away, and anybody
 * still standing on it goes with it. This is not in the rulebook - it is this build's
 * own, added because two things needed fixing at once:
 *
 * - **the ending was optional.** "We never found the dragon" is a shrug, not a defeat,
 *   and a hidden board on a timer produces it often. A board that closes in hands the
 *   party to the middle whether or not anybody navigated well.
 * - **the back half was flat.** By turn ten the ground is searched, the gear is bought
 *   and the turns are walking. Losing a ring gives every late turn a reason to move.
 *
 * The rule a child needs is one sentence: **the edge of the world is crumbling, so
 * keep moving inwards.** They get a full turn's warning, on the banner and on the
 * ground itself, and one move is always enough to get clear - so falling in is a
 * mistake rather than bad luck, which is the line this has to stay on the right side
 * of. The exception is a player who is *down* when the warning comes: they cannot walk
 * themselves clear, and somebody has to get them up or hook them in. That is the
 * sharpest thing in the game and it is meant to be.
 *
 * **It tells you where the middle is**, which is information the hidden board
 * otherwise withholds - the ring you are standing on is your distance from the dragon.
 * That is deliberate. A game that ends in a fight has to let the party find the fight,
 * and the crumbling edge is the one honest way to say "the middle is that way" without
 * printing a map.
 */

import { RADIUS, distance, neighbours, type Hex } from "./hex";
import type { GameState, LogEntry, Player } from "./types";

/** The middle of the board, and the dragon's mountain. */
export const MIDDLE: Hex = { q: 0, r: 0 };

/**
 * When the rim goes, as a share of the game.
 *
 * **Two marks, not three.** At a sixteen-turn limit the quarters were turns 4, 8 and
 * 12 and every one of them had a turn's warning to spare. At eight they would be turns
 * 2, 4 and 6 - a ring falling before anybody has walked anywhere, which is not a
 * decision, it is a tax on being unlucky about where you started.
 *
 * So: **the rim falls halfway, the next ring three quarters of the way through, and
 * the seven tiles in the middle are the arena for turn 8.** That is the collapse doing
 * exactly one job now - getting everybody near the middle in time for the ending - and
 * on a radius-3 board those two rings are the whole of the outside.
 */
export const COLLAPSE_MARKS = [0.5, 0.75];

/**
 * The smallest the board is ever allowed to get: the dragon's tile and the ring
 * around it, seven hexes.
 *
 * **Not zero, and the reason is mechanical rather than aesthetic.** The last tile
 * standing would be the dragon's own, and a tile with the dragon on it is not
 * somewhere a player can stand - walking onto it starts the fight, and only one fight
 * runs at a time. A board of one tile would mean five players who each have to fight
 * the dragon alone to be allowed to exist. Seven tiles is the arena: everybody is
 * within one move of the mountain and of each other, which is the finale the collapse
 * is driving at, and stepping on is still a decision somebody makes.
 */
export const LAST_RING = 1;

/** The turns on which a ring goes. Never turn 1: nobody loses before they have moved. */
export function collapseTurns(turnLimit: number): number[] {
  return COLLAPSE_MARKS.map((mark) => Math.max(2, Math.round(turnLimit * mark)));
}

/** How many rings are still standing this turn. */
export function liveRadius(turn: number, turnLimit: number): number {
  const gone = collapseTurns(turnLimit).filter((t) => turn >= t).length;
  return Math.max(LAST_RING, RADIUS - gone);
}

/** Is this tile in the abyss - fallen away and gone? */
export const hasFallen = (hex: Hex, turn: number, turnLimit: number): boolean =>
  distance(hex, MIDDLE) > liveRadius(turn, turnLimit);

/** Does the rim go when this turn ends? The turn the warning is shouted on. */
export const edgeFallsAfter = (turn: number, turnLimit: number): boolean =>
  liveRadius(turn + 1, turnLimit) < liveRadius(turn, turnLimit);

/**
 * Is this tile the one about to go? Drawn cracked on the compass, which is how a
 * player who cannot see a map knows which way "inwards" is.
 */
export const doomed = (hex: Hex, turn: number, turnLimit: number): boolean =>
  !hasFallen(hex, turn, turnLimit) && hasFallen(hex, turn + 1, turnLimit);

/** Tiles a player may still stand on. Used by movement, hazards and arrivals. */
export const standing = (state: GameState, hex: Hex): boolean =>
  !hasFallen(hex, state.turn, state.turnLimit);

const note = (state: GameState, text: string): GameState => ({
  ...state,
  log: [...state.log, { turn: state.turn, text } satisfies LogEntry],
});

/** One tile further in, for a monster the rim is about to take. */
function inwards(state: GameState, hex: Hex): Hex | null {
  const closer = neighbours(hex)
    .filter((h) => standing(state, h))
    .sort((a, b) => distance(a, MIDDLE) - distance(b, MIDDLE));
  return closer[0] ?? null;
}

/**
 * Take the rim, if this is the turn for it.
 *
 * Runs at the top of a round, before the hazards move, so everything that happens
 * afterwards happens on the board that is left. A no-op on every other turn, which is
 * most of them.
 */
export function collapseRim(state: GameState): GameState {
  const radius = liveRadius(state.turn, state.turnLimit);
  if (radius >= liveRadius(state.turn - 1, state.turnLimit)) return state;

  let next = note(
    state,
    "The ground at the edge of the world breaks away and falls into the dark.",
  );

  // Players first, and being on the rim when it goes is the end of that player's
  // game. `fellOn: null` is what stops §7's self-revive clock from ever starting, and
  // `gone` is what stops a doctor reaching over the hole.
  const lost: Player[] = next.players.filter((p) => !p.gone && !standing(next, p.hex));
  if (lost.length > 0) {
    next = {
      ...next,
      players: next.players.map((p) =>
        lost.some((l) => l.id === p.id)
          ? { ...p, gone: true, health: 0 }
          : p,
      ),
    };
    for (const player of lost) {
      next = note(next, `${player.name} was still out on the rim, and is gone.`);
    }
  }

  // The dragon is the one thing the abyss cannot have: it is the game's ending, and
  // an ending that falls down a hole is not one. It backs up a tile instead. Nothing
  // else gets that - a bandit on the rim goes over with the ground.
  next = {
    ...next,
    enemies: next.enemies.flatMap((enemy) => {
      if (standing(next, enemy.hex)) return [enemy];
      if (enemy.kind !== "finalboss") return [];
      const spot = inwards(next, enemy.hex);
      return spot ? [{ ...enemy, hex: spot }] : [enemy];
    }),
  };
  const swept = state.enemies.length - next.enemies.length;
  if (swept > 0) {
    next = note(
      next,
      swept === 1
        ? "Something went over the edge with it."
        : `${swept} of them went over the edge with it.`,
    );
  }

  // Hazards blow away with everything else. A tornado that walks off the world is
  // simply gone, and that is a mercy rather than a loss.
  const hazards = next.hazards.filter((h) => standing(next, h.hex));
  if (hazards.length !== next.hazards.length) {
    next = { ...next, hazards };
  }

  return handOn(next);
}

/**
 * If the player whose turn it was just went into the abyss, the turn has to move on
 * without them - `endTurn` picked them before the rim fell.
 */
function handOn(state: GameState): GameState {
  const up = state.players[state.activePlayerIndex];
  if (up && !up.gone) return state;

  // Whoever is left, in turn order. A whole team going over at once is possible and
  // the game carries on with the other one; a party with nobody left is not something
  // the collapse can produce, because `LAST_RING` never falls.
  let index = state.activePlayerIndex;
  for (let i = 0; i < state.players.length; i++) {
    index = (index + 1) % state.players.length;
    if (!state.players[index].gone) break;
  }
  const ready = state.players.map((p, i) =>
    i === index ? { ...p, stepsTaken: 0, actedThisTurn: false } : p,
  );
  return { ...state, players: ready, activePlayerIndex: index };
}

/** What the banner says to a player standing on ground that is about to go. */
export function rimWarning(state: GameState, player: Player): string | null {
  if (state.ending || player.gone) return null;
  if (!edgeFallsAfter(state.turn, state.turnLimit)) return null;
  return doomed(player.hex, state.turn, state.turnLimit)
    ? "The ground here goes when this turn ends. Move inwards!"
    : "The edge of the world crumbles when this turn ends.";
}
