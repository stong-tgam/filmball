import { describe, expect, it } from "vitest";
import { SENSE_RANGE, compassName, sense } from "../src/game/sense";
import { createInitialState } from "../src/game/setup";
import { distance } from "../src/game/hex";
import type { GameState } from "../src/game/types";

/**
 * The dragon on the board rather than asleep somewhere else. It sleeps through the
 * opening (`DRAGON_WAKES_ON`) and neither smokes nor senses while it does; these tests
 * are about what smoke tells you, not about when it starts.
 */
const awake = (state: GameState): GameState => ({
  ...state,
  enemies: state.enemies.map((e) => ({ ...e, dormant: false })),
});

/** A game with the knight standing on a named hex and everyone else out of the way. */
function standing(at: { q: number; r: number }, seed = 4471): GameState {
  const base = awake(createInitialState(seed));
  return {
    ...base,
    activePlayerIndex: 0,
    players: base.players.map((p, i) =>
      i === 0 ? { ...p, hex: at } : { ...p, hex: { q: 0, r: -4 }, gone: true },
    ),
  };
}

describe("what you can feel from where you stand", () => {
  it("reaches exactly two moves and no further", () => {
    const state = standing({ q: 0, r: 0 });
    const viewer = state.players[0];
    for (const thing of sense(state, viewer)) {
      expect(thing.steps).toBeGreaterThanOrEqual(1);
      expect(thing.steps).toBeLessThanOrEqual(SENSE_RANGE);
    }
  });

  it("never reports the tile you are standing on", () => {
    const dragon = createInitialState(4471).enemies.find((e) => e.kind === "finalboss")!;
    const state = standing(dragon.hex);
    expect(sense(state, state.players[0]).every((t) => t.steps > 0)).toBe(true);
  });

  it("feels the dragon two moves out, because it smokes", () => {
    const base = awake(createInitialState(4471));
    const dragon = base.enemies.find((e) => e.kind === "finalboss")!;
    // Two tiles due south of it. In this pointy-top layout raising r alone slides
    // east as well, so the q offset is what makes it a straight north-south line.
    const state = standing({ q: dragon.hex.q - 1, r: dragon.hex.r + 2 });
    const felt = sense(state, state.players[0]).find((t) => t.kind === "dragon");
    expect(felt).toBeDefined();
    expect(felt!.steps).toBe(2);
    expect(compassName(felt!.bearing)).toBe("north");
  });

  it("does not give away a monster nobody has walked into", () => {
    const base = createInitialState(4471);
    const mob = base.enemies.find((e) => e.kind === "mob")!;
    const beside = { q: mob.hex.q, r: mob.hex.r + 1 };
    expect(sense(standing(beside), standing(beside).players[0]).some((t) => t.kind === "monster")).toBe(
      false,
    );

    const known = standing(beside);
    const withFound: GameState = {
      ...known,
      enemies: known.enemies.map((e) => (e.id === mob.id ? { ...e, found: true } : e)),
    };
    expect(sense(withFound, withFound.players[0]).some((t) => t.kind === "monster")).toBe(true);
  });

  it("always feels a hazard within range - they are never hidden", () => {
    const base = createInitialState(4471);
    const hazard = base.hazards[0];
    const state = standing({ q: hazard.hex.q, r: hazard.hex.r + 1 });
    const felt = sense(state, state.players[0]).filter((t) => t.kind === "hazard");
    expect(felt.length).toBeGreaterThan(0);
    expect(felt[0].steps).toBe(1);
  });

  it("gives a bearing, never a position", () => {
    const state = standing({ q: 0, r: 0 });
    for (const thing of sense(state, state.players[0])) {
      expect(thing.bearing).toBeGreaterThanOrEqual(0);
      expect(thing.bearing).toBeLessThan(360);
      // Nothing in the payload may name a tile: that would put the map back on screen.
      expect(JSON.stringify(thing)).not.toMatch(/\b[A-I](1[0-9]|[1-9])\b/);
    }
  });

  it("names the six walkable directions the way a child would say them", () => {
    expect(compassName(0)).toBe("north");
    expect(compassName(90)).toBe("east");
    expect(compassName(180)).toBe("south");
    expect(compassName(270)).toBe("west");
    expect(compassName(359)).toBe("north");
  });

  it("puts the nearest thing first", () => {
    const state = standing({ q: 0, r: 0 });
    const felt = sense(state, state.players[0]);
    for (let i = 1; i < felt.length; i++) expect(felt[i].steps).toBeGreaterThanOrEqual(felt[i - 1].steps);
  });

  it("agrees with the hex distance it claims", () => {
    const state = standing({ q: 1, r: -1 });
    const viewer = state.players[0];
    for (const thing of sense(state, viewer)) {
      const source =
        state.enemies.find((e) => e.id === thing.id) ??
        state.hazards.find((h) => `hazard-${h.kind}` === thing.id) ??
        state.players.find((p) => p.id === thing.id);
      expect(source).toBeDefined();
      expect(distance(viewer.hex, source!.hex)).toBe(thing.steps);
    }
  });
});

describe("the log gives nothing away", () => {
  it("never prints a tile label, however the game is played", async () => {
    // The map is not on screen, so a grid reference read out of the log puts it back.
    // This walks a whole game and checks every line the players would ever see.
    const { startGame } = await import("../src/game/setup");
    const { activePlayer, endTurn, legalMoves, movePlayer, clearDraw } = await import("../src/game/turn");
    const { endCombat, wonTrial, lostTrial } = await import("../src/game/combat");
    const { canSearch, search } = await import("../src/game/actions");
    const { makeRng } = await import("../src/game/rng");

    const rng = makeRng(20260824);
    let state = startGame(4471);
    for (let i = 0; i < 900 && !state.ending; i++) {
      if (state.draw) state = clearDraw(state);
      if (state.combat && state.combat.outcome === "ongoing") {
        const who = state.players.find((p) => p.id === state.combat!.playerId)!;
        // A bot cannot draw a dragon, so it wins or loses cards on a toss of the same
        // seeded generator the rest of the game runs on.
        state = who.health <= 1 || rng.next() < 0.4 ? lostTrial(state) : wonTrial(state);
        continue;
      }
      if (state.combat) {
        state = endCombat(state);
        continue;
      }
      const me = activePlayer(state);
      if (!me.stepsTaken) {
        const moves = [...legalMoves(state, me).keys()];
        if (moves.length > 0) {
          state = movePlayer(state, moves[Math.floor(rng.next() * moves.length)]);
          continue;
        }
      }
      const now = activePlayer(state);
      if (!state.combat && canSearch(state, now)) {
        state = search(state);
        continue;
      }
      state = endTurn(state);
    }

    expect(state.log.length).toBeGreaterThan(30);
    const leaks = state.log.filter((entry) => /\b[A-I]([1-9]|1[0-9])\b/.test(entry.text));
    expect(leaks.map((l) => l.text)).toEqual([]);
  });
});
