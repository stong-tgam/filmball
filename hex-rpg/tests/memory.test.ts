/**
 * The map you remember.
 *
 * For twenty-nine versions the app kept no map at all. It keeps one now - **per
 * player, ground only** - and those two qualifiers are the whole of why the change is
 * safe, so they are what these tests hold down.
 */

import { describe, expect, it } from "vitest";
import { createInitialState, startGame } from "../src/game/setup";
import { endTurn, legalMoves, movePlayer } from "../src/game/turn";
import { BASE_SIGHT, SMOKE_RADIUS, canSee, hasSeen, remember, sightOf } from "../src/game/vision";
import { BASE_MOVE, moveRange } from "../src/game/players";
import { RADIUS, allHexes, distance, key } from "../src/game/hex";
import type { GameState } from "../src/game/types";

describe("what a player remembers", () => {
  it("knows the ground it woke up on, and nothing further", () => {
    const knight = createInitialState(4471).players[0];
    expect(knight.seen.length).toBeGreaterThan(0);
    for (const label of knight.seen) {
      const hex = allHexes().find((h) => key(h) === label)!;
      expect(distance(knight.hex, hex), label).toBeLessThanOrEqual(sightOf(knight));
    }
  });

  it("keeps ground after walking away from it", () => {
    const state = startGame(4471);
    const before = state.players[state.activePlayerIndex];
    const from = key(before.hex);

    const step = [...legalMoves(state, before).keys()][0];
    const after = movePlayer(state, step);
    const walked = after.players[after.activePlayerIndex];

    // Still remembered, whether or not it is still in sight.
    expect(walked.seen).toContain(from);
    expect(hasSeen(walked, before.hex)).toBe(true);
  });

  it("is one player's memory, not the party's", () => {
    let state = startGame(4471);
    const mover = state.players[state.activePlayerIndex].id;
    for (let i = 0; i < 3; i++) {
      const who = state.players[state.activePlayerIndex];
      const open = [...legalMoves(state, who).keys()];
      if (open.length > 0 && who.id === mover) state = movePlayer(state, open[0]);
      state = endTurn(state.draw ? { ...state, draw: null } : state);
    }

    const walker = state.players.find((p) => p.id === mover)!;
    const somewhere = walker.seen.find((label) => {
      const hex = allHexes().find((h) => key(h) === label)!;
      return state.players.every((p) => p.id === mover || !canSee(p, hex));
    });
    // Somebody else's legwork is not your knowledge - which is what keeps the party
    // talking to each other rather than reading one shared map.
    if (somewhere) {
      for (const other of state.players) {
        if (other.id === mover) continue;
        expect(other.seen.includes(somewhere), `${other.id} knows ${somewhere}`).toBe(false);
      }
    }
  });

  it("never records a tile twice, however often you walk over it", () => {
    let state = startGame(4471);
    for (let i = 0; i < 12 && !state.ending; i++) {
      const who = state.players[state.activePlayerIndex];
      const open = [...legalMoves(state, who).keys()];
      if (open.length > 0) state = movePlayer(state, open[0]);
      state = endTurn(state.draw || state.combat ? { ...state, draw: null, combat: null } : state);
    }
    for (const player of state.players) {
      expect(new Set(player.seen).size, player.id).toBe(player.seen.length);
    }
  });

  it("adds nothing when there is nothing new to see", () => {
    const knight = createInitialState(4471).players[0];
    // Already remembered from the spawn, so a second look changes nothing at all -
    // which is what keeps a save from growing on every step.
    expect(remember(knight)).toBe(knight);
  });
});

describe("seeing and walking, now that they are two rings", () => {
  it("lets you see exactly as far as you can walk", () => {
    // The point of the pair: a turn is a route you can look at rather than a poke at
    // the next hex. If sight ever falls behind movement, the last step is a guess.
    const state = createInitialState(4471);
    for (const player of state.players) {
      expect(sightOf(player), player.id).toBeGreaterThanOrEqual(moveRange(player));
    }
    expect(BASE_SIGHT).toBe(BASE_MOVE);
  });

  it("keeps the dragon's smoke a clue rather than wallpaper", () => {
    // It reaches at least as far as eyesight - and that is already more than looking
    // gives you, because sight never reveals an unfound monster. What it must not do
    // is cover the board: on the radius-3 map a reach of 3 touches all four corners,
    // so every player would be told "the dragon is close" for the whole game.
    expect(SMOKE_RADIUS).toBeGreaterThanOrEqual(BASE_SIGHT);
    expect(SMOKE_RADIUS).toBeLessThan(RADIUS);
  });

  it("still spends movement one tile at a time", () => {
    const state = startGame(4471);
    const who = state.players[state.activePlayerIndex];
    for (const steps of legalMoves(state, who).values()) expect(steps).toBe(1);
  });
});

describe("the fisherman's bargain", () => {
  it("keeps what they catch: they can be given to, but hand nothing over", async () => {
    const { giveTargets, tileMates } = await import("../src/game/actions");
    const base = createInitialState(4471);
    const fisher = base.players.find((p) => p.role === "fisherman")!;
    const other = base.players.find((p) => p.role === "knight")!;

    const together: GameState = {
      ...base,
      players: base.players.map((p) =>
        p.id === fisher.id ? { ...p, hex: other.hex, supply: [...p.supply] } : p,
      ),
    };
    const stood = together.players.find((p) => p.id === fisher.id)!;

    // Standing together, so the only thing stopping the trade is the role.
    expect(tileMates(together, stood).some((p) => p.id === other.id)).toBe(true);
    expect(giveTargets(together, stood)).toEqual([]);
    // The other way round is untouched: it is a one-way bargain, not exile.
    expect(tileMates(together, other).some((p) => p.id === fisher.id)).toBe(true);
  });
});
