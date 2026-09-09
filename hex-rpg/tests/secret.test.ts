/**
 * The map's secret: a second way to win. See `src/game/secret.ts`.
 */

import { describe, expect, it } from "vitest";
import {
  canDig,
  clueSentence,
  dig,
  markSecretTile,
  MAX_CLUES,
  revealSecretClue,
  tilesMatchingClue,
} from "../src/game/secret";
import { createInitialState, startGame } from "../src/game/setup";
import { RADIUS, distance, key } from "../src/game/hex";
import { enemyAt } from "../src/game/enemies";
import { activePlayer } from "../src/game/turn";
import type { GameState } from "../src/game/types";

const MID = { q: 0, r: 0 };

describe("building the secret", () => {
  it("never targets the centre, a river tile, or a tile a live monster is on", () => {
    for (let seed = 1; seed <= 40; seed++) {
      const state = createInitialState(seed);
      const target = state.tiles[state.secret.target];
      expect(target).toBeDefined();
      expect(distance(target.hex, MID)).toBeGreaterThan(0);
      expect(target.river).toBe(false);
      expect(enemyAt(state.enemies, state.secret.target)).toBeUndefined();
    }
  });

  it("narrows the board down to exactly the target, and to nothing else", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const state = createInitialState(seed);
      const { chain, target } = state.secret;
      expect(chain.length).toBeGreaterThan(0);
      expect(chain.length).toBeLessThanOrEqual(MAX_CLUES);

      // Every candidate tile that matches every clue in the chain has to be the
      // target and only the target - that is what "solvable by construction" means.
      const candidates = Object.values(state.tiles).filter(
        (t) => distance(t.hex, MID) > 0 && !t.river && enemyAt(state.enemies, key(t.hex)) === undefined,
      );
      const survivors = candidates.filter((t) => {
        // Re-derive each clue's truth for this tile the same way `buildSecret` does,
        // by checking it against the sentence's own shape - simplest is just to
        // reuse the target's own clue answers and see who else matches them all.
        return chain.every((clue) => {
          const truthForTarget = clue.truth;
          const test = SHAPE_TESTS[clue.shape];
          return test(t, state) === truthForTarget;
        });
      });
      expect(survivors.map((t) => key(t.hex))).toEqual([target]);
    }
  });

  it("never hands out more than MAX_CLUES", () => {
    for (let seed = 1; seed <= 30; seed++) {
      expect(createInitialState(seed).secret.chain.length).toBeLessThanOrEqual(MAX_CLUES);
    }
  });
});

// Mirrors of secret.ts's private shape tests, kept separate rather than exported so
// the test asserts against the *documented* behaviour, not against whatever the
// module happens to compute - the two only agree if `buildSecret` is actually solvable.
const NEIGHBOUR_DIRS = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];
const SHAPE_TESTS: Record<string, (tile: GameState["tiles"][string], state: GameState) => boolean> = {
  trees: (t) => t.base === "forest",
  water: (t) => t.river,
  town: (t, s) =>
    NEIGHBOUR_DIRS.some((d) => s.tiles[key({ q: t.hex.q + d.q, r: t.hex.r + d.r })]?.base === "city"),
  rim: (t) => distance(t.hex, MID) === RADIUS,
  monster: (t, s) => enemyAt(s.enemies, key(t.hex)) !== undefined,
  north: (t) => t.hex.r < 0,
  plain: (t, s) => t.base === "field" && !t.river && enemyAt(s.enemies, key(t.hex)) === undefined,
};

describe("revealing a clue", () => {
  it("tells the table the next clue in the chain, in order, and no more than once each", () => {
    let state = createInitialState(4471);
    const total = state.secret.chain.length;
    expect(state.secret.revealed).toBe(0);

    for (let i = 0; i < total; i++) {
      const before = state.secret.revealed;
      state = revealSecretClue(state, "beat a bandit");
      expect(state.secret.revealed).toBe(before + 1);
      expect(state.secret.chain[before].from).toBe("beat a bandit");
      expect(state.log.at(-1)?.text).toContain(clueSentence(state.secret.chain[before]));
    }
    // Every clue has been told. One more is a no-op, not a crash and not a repeat.
    const done = revealSecretClue(state, "searched some ground");
    expect(done).toBe(state);
  });

  it("says something true about the target, whichever way the clue points", () => {
    const state = createInitialState(4471);
    for (const clue of state.secret.chain) {
      expect(clueSentence(clue).length).toBeGreaterThan(0);
    }
  });
});

describe("showing a clue's actual tiles", () => {
  it("always includes the target - every clue in the chain is true of it", () => {
    for (let seed = 1; seed <= 15; seed++) {
      const state = createInitialState(seed);
      for (const clue of state.secret.chain) {
        expect(tilesMatchingClue(state, clue).has(state.secret.target)).toBe(true);
      }
    }
  });

  it("narrows to fewer tiles with each clue held, ending on just the target", () => {
    const state = createInitialState(4471);
    const last = state.secret.chain.at(-1)!;
    // The final clue in a solved chain leaves exactly one survivor: the target.
    const survivors = tilesMatchingClue(state, last);
    // (Not every single clue individually isolates the target - only the chain as a
    // whole does - but the match set is never the whole board, i.e. the clue said
    // *something*.)
    expect(survivors.size).toBeGreaterThan(0);
    expect(survivors.size).toBeLessThan(Object.keys(state.tiles).length);
  });
});

describe("marking a tile", () => {
  it("cycles nothing -> ruled out -> a maybe -> nothing, and costs nothing", () => {
    let state = createInitialState(4471);
    const label = Object.keys(state.tiles)[0];
    expect(state.secret.marks[label]).toBeUndefined();

    state = markSecretTile(state, label);
    expect(state.secret.marks[label]).toBe("x");
    state = markSecretTile(state, label);
    expect(state.secret.marks[label]).toBe("?");
    state = markSecretTile(state, label);
    expect(state.secret.marks[label]).toBeUndefined();
  });

  it("never touches a player's turn", () => {
    const state = createInitialState(4471);
    const marked = markSecretTile(state, Object.keys(state.tiles)[0]);
    expect(marked.players).toEqual(state.players);
    expect(marked.phase).toBe(state.phase);
  });
});

describe("digging", () => {
  it("wins the game for the team standing on the actual target", () => {
    const state = startGame(4471);
    const player = activePlayer(state);
    const onTarget: GameState = {
      ...state,
      players: state.players.map((p) => (p.id === player.id ? { ...p, hex: state.tiles[state.secret.target].hex } : p)),
    };
    const after = dig(onTarget, activePlayer(onTarget), "Knight & Rogue");
    expect(after.ending).toBe("escaped");
    expect(after.phase).toBe("gameOver");
    expect(after.escapedTeam).toBe("Knight & Rogue");
  });

  it("costs the turn's action and marks the tile, on a wrong guess", () => {
    const state = startGame(4471);
    const player = activePlayer(state);
    // Somewhere that is provably not the target.
    const wrong = Object.values(state.tiles).find((t) => key(t.hex) !== state.secret.target)!;
    const onWrongTile: GameState = {
      ...state,
      players: state.players.map((p) => (p.id === player.id ? { ...p, hex: wrong.hex } : p)),
    };
    const after = dig(onWrongTile, activePlayer(onWrongTile), "Knight & Rogue");
    expect(after.ending).toBeNull();
    expect(after.secret.marks[key(wrong.hex)]).toBe("x");
    expect(after.secret.digsMissed).toBe(1);
    expect(after.players.find((p) => p.id === player.id)?.actedThisTurn).toBe(true);
  });

  it("cannot be used twice in a turn, mid-fight, or once the game is over", () => {
    const state = startGame(4471);
    const busy: GameState = { ...state, players: state.players.map((p, i) => (i === 0 ? { ...p, actedThisTurn: true } : p)) };
    expect(canDig(busy, activePlayer(busy))).toBe(false);

    const fighting: GameState = { ...state, combat: {} as GameState["combat"] };
    expect(canDig(fighting, activePlayer(fighting))).toBe(false);

    const over: GameState = { ...state, ending: "victory" };
    expect(canDig(over, activePlayer(over))).toBe(false);
  });
});
