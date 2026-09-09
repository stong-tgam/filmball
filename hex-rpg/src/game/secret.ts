/**
 * The map's secret: a second way to win, alongside the dragon.
 *
 * The table works out one tile the map is hiding and digs it. Getting there is a puzzle
 * of elimination - a chain of true statements about the target tile, delivered one at a
 * time as the party earns them - and this is the whole of it: the chain is picked once,
 * at setup, from the finished board and the finished monster placement, and nothing
 * about it changes after that.
 *
 * This module is the real-game rewrite of `reference/prototypes/escape-spot.html`,
 * which is where the two things worth keeping from that mock came from:
 *
 * - **Score by the harshest single cut, not by clue count.** A chain that goes
 *   `37 -> 6 -> 5 -> 3 -> 1` is solvable and asks nobody to think - one clue did
 *   eighty per cent of the work. `buildSecret` scores every candidate chain by
 *   `min(trail[i] / trail[i-1])` and keeps the gentlest, so a chain where every clue
 *   earns its place is one where each roughly halves what is left.
 * - **Five clues is the ceiling, and it is a people constraint.** Left alone the
 *   scorer happily produces seven, which narrows beautifully and is more cards than a
 *   ten-year-old can hold in their head. `MAX_CLUES` fences the generator; it does not
 *   aim for it.
 *
 * What the mock could not test, because it had no game around it, is **when** a clue
 * arrives. Here it is a side effect of something the party already did - beating a
 * monster (see `revealSecretClue` calls in `combat.ts`) or a search that actually found
 * something (`actions.ts`) - never something drawn for its own sake. "The mini-game
 * itself can also be a clue" is exactly this: winning the fight already was the point
 * of that go, and the clue rides along on it for free.
 */

import { RADIUS, distance, key, type Hex } from "./hex";
import { enemyAt } from "./enemies";
import type { Clue, ClueShapeId, Enemy, GameState, LogEntry, Secret, Tile } from "./types";
import type { Rng } from "./rng";

const MID: Hex = { q: 0, r: 0 };

/** The ceiling on a chain's length - a people constraint, not a maths one. See above. */
export const MAX_CLUES = 5;

/** Neighbour offsets, duplicated rather than imported to avoid a cycle with hex.ts's
 *  own DIRS re-export chain - six numbers is cheap to keep in step by hand. */
const NEIGHBOUR_DIRS: Hex[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

const note = (state: GameState, text: string): GameState => ({
  ...state,
  log: [...state.log, { turn: state.turn, text } satisfies LogEntry],
});

/** Everything a shape's test needs to look at: the finished board and the finished
 *  monster placement. Neither changes after `buildSecret` runs. */
type Board = { tiles: Record<string, Tile>; enemies: Enemy[] };

/**
 * One of the seven shapes a clue can take.
 *
 * Every `test` reads the tile's **dominant** look - `base`, `river`, a live monster
 * standing on it - rather than the fine-grained `sides` a tile is composed of.
 * "Legibility beats realism": a clue has to be answerable by glancing at the tile the
 * way it is actually drawn on the board, and the board's dominant colour is what a
 * child's eye reads first.
 */
type Shape = {
  id: ClueShapeId;
  yes: string;
  no: string;
  test: (tile: Tile, board: Board) => boolean;
};

const SHAPES: Shape[] = [
  {
    id: "trees",
    yes: "There are trees on it.",
    no: "There are no trees on it.",
    test: (tile) => tile.base === "forest",
  },
  {
    id: "water",
    yes: "There is water on it.",
    no: "There is no water on it.",
    test: (tile) => tile.river,
  },
  {
    id: "town",
    yes: "It is next to a town.",
    no: "It is not next to a town.",
    test: (tile, board) =>
      NEIGHBOUR_DIRS.some((d) => board.tiles[key({ q: tile.hex.q + d.q, r: tile.hex.r + d.r })]?.base === "city"),
  },
  {
    id: "rim",
    yes: "It is on the outside edge.",
    no: "It is not on the outside edge.",
    test: (tile) => distance(tile.hex, MID) === RADIUS,
  },
  {
    id: "monster",
    yes: "A monster is standing on it.",
    no: "No monster is standing on it.",
    test: (tile, board) => enemyAt(board.enemies, key(tile.hex)) !== undefined,
  },
  {
    id: "north",
    yes: "It is in the northern half.",
    no: "It is in the southern half.",
    test: (tile) => tile.hex.r < 0,
  },
  {
    id: "plain",
    yes: "There is nothing on it but grass.",
    no: "There is something on it.",
    test: (tile, board) =>
      tile.base === "field" && !tile.river && enemyAt(board.enemies, key(tile.hex)) === undefined,
  },
];

const shapeOf = (id: ClueShapeId): Shape => SHAPES.find((s) => s.id === id)!;

/** How a clue reads at the table. */
export const clueSentence = (clue: Clue): string =>
  clue.truth ? shapeOf(clue.shape).yes : shapeOf(clue.shape).no;

/**
 * Every tile a clue is actually true of, right now.
 *
 * A clue on its own is just a sentence - "there are no trees on it" says nothing about
 * *where* until somebody checks it against every tile on a board they can now see in
 * full. This is that check, done once for the whole board, so the UI can show a held
 * clue as a highlight rather than making the table do the elimination by eye alone.
 */
export function tilesMatchingClue(state: GameState, clue: Clue): Set<string> {
  const board: Board = { tiles: state.tiles, enemies: state.enemies };
  const shape = shapeOf(clue.shape);
  const out = new Set<string>();
  for (const tile of Object.values(state.tiles)) {
    if (shape.test(tile, board) === clue.truth) out.add(key(tile.hex));
  }
  return out;
}

/**
 * Pick the target, then add clues until exactly one tile is left standing.
 *
 * The candidate pool excludes anywhere that would not read as a plausible spot to dig:
 * the dragon's own tile at the centre, any tile currently underwater, and any tile a
 * live monster is standing on (which would leave "do we fight first?" unanswered - the
 * escape-spot mock got this wrong on its first pass and it is fixed here from the
 * start). It is also the population every clue narrows *within* - the puzzle only ever
 * has to isolate a plausible spot from other plausible spots.
 */
export function buildSecret(rng: Rng, tiles: Record<string, Tile>, enemies: Enemy[]): Secret {
  const board: Board = { tiles, enemies };
  const candidates = Object.values(tiles).filter(
    (tile) =>
      distance(tile.hex, MID) > 0 && !tile.river && enemyAt(enemies, key(tile.hex)) === undefined,
  );

  let best: { target: string; chain: Clue[]; score: number } | null = null;

  for (let attempt = 0; attempt < 400; attempt++) {
    const target = rng.pick(candidates);
    let left = candidates;
    const chain: Clue[] = [];
    const trail = [left.length];
    const pool = rng.shuffle(SHAPES);

    for (const shape of pool) {
      if (left.length <= 1 || chain.length >= MAX_CLUES) break;
      const truth = shape.test(target, board);
      const kept = left.filter((t) => shape.test(t, board) === truth);
      if (kept.length === left.length) continue; // tells you nothing about this target
      chain.push({ shape: shape.id, truth, from: "" });
      left = kept;
      trail.push(left.length);
    }

    if (left.length !== 1 || left[0] !== target) continue;

    // The harshest single cut, and the gentlest chain wins - see the module doc.
    let harshest = 1;
    for (let i = 1; i < trail.length; i++) harshest = Math.min(harshest, trail[i] / trail[i - 1]);
    const penultimate = trail[trail.length - 2];
    let score = harshest * 100 + chain.length * 4;
    if (chain.length < 3 || penultimate < 3) score -= 500;

    if (!best || score > best.score) best = { target: key(target.hex), chain, score };
  }

  // 400 attempts over a ~30-tile pool essentially never comes up empty, but a chain of
  // zero clues is still a valid fallback rather than a crash if it ever does - better a
  // weak puzzle than no game.
  const fallback = candidates[0];
  return {
    target: best?.target ?? key(fallback.hex),
    chain: best?.chain ?? [],
    revealed: 0,
    marks: {},
    digsMissed: 0,
  };
}

/**
 * Tell the table the next clue in the chain, because they just earned it.
 *
 * A no-op once every clue in the chain has already been revealed - a beaten monster
 * past that point is still worth beating, it just is not worth a clue on top.
 */
export function revealSecretClue(state: GameState, from: string): GameState {
  const secret = state.secret;
  if (secret.revealed >= secret.chain.length) return state;
  const clue = { ...secret.chain[secret.revealed], from };
  const chain = secret.chain.map((c, i) => (i === secret.revealed ? clue : c));
  return note(
    { ...state, secret: { ...secret, chain, revealed: secret.revealed + 1 } },
    `A clue about the secret spot: ${clueSentence(clue)}`,
  );
}

/**
 * Cycle a tile's mark: nothing -> ruled out -> a maybe -> nothing.
 *
 * Free, and never the turn's action - crossing off a hypothesis is bookkeeping the
 * whole table does together, not a move any one player makes.
 */
export function markSecretTile(state: GameState, label: string): GameState {
  const current = state.secret.marks[label];
  const marks = { ...state.secret.marks };
  if (current === undefined) marks[label] = "x";
  else if (current === "x") marks[label] = "?";
  else delete marks[label];
  return { ...state, secret: { ...state.secret, marks } };
}

/** Standing anywhere, with the turn's action still free, and nobody has already won. */
export function canDig(
  state: GameState,
  player: { actedThisTurn: boolean; gone: boolean },
): boolean {
  return (
    state.phase !== "gameOver" &&
    state.ending === null &&
    state.combat === null &&
    !player.actedThisTurn &&
    !player.gone
  );
}

/**
 * Try the tile the team is standing on.
 *
 * Right, and the team that dug it wins there and then - the whole game ends, not just
 * their evening, which is the point: escaping is a real choice against holding out for
 * the dragon fight at turn 8, not a free extra ending, because only the team standing
 * on the spot when it opens gets to take it. Wrong, and it costs the turn's action the
 * same way a search does, and the tile is marked off for the table.
 */
export function dig(
  state: GameState,
  player: { id: string; hex: Hex; actedThisTurn: boolean; gone: boolean },
  teamName: string,
): GameState {
  if (!canDig(state, player)) return state;
  const label = key(player.hex);
  const spent: GameState = {
    ...state,
    players: state.players.map((p) => (p.id === player.id ? { ...p, actedThisTurn: true } : p)),
  };

  if (label === state.secret.target) {
    return note(
      { ...spent, phase: "gameOver", ending: "escaped", escapedTeam: teamName },
      `${teamName} dig here - and the ground gives way onto a way out. They are gone before the dragon ever wakes for them.`,
    );
  }

  const marked: GameState = {
    ...spent,
    secret: {
      ...spent.secret,
      marks: { ...spent.secret.marks, [label]: "x" },
      digsMissed: spent.secret.digsMissed + 1,
    },
  };
  return note(marked, `${teamName} dig here. Nothing but dirt - this is not the spot.`);
}
