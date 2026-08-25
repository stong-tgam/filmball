/**
 * The robber and the pirates: the two things on the board you are allowed to buy your
 * way past, and the turn report that says where they went.
 */

import { describe, expect, it } from "vitest";
import { createInitialState, startGame } from "../src/game/setup";
import { canFightThief, canPayOff, fightThief, hazardMoves, payOff } from "../src/game/hazards";
import { attack, endCombat } from "../src/game/combat";
import { endTurn, movePlayer } from "../src/game/turn";
import { key } from "../src/game/hex";
import type { GameState } from "../src/game/types";

/** The knight standing beside the named thief, with everybody else out of the way. */
function beside(kind: "robber" | "pirates", seed = 4471): GameState {
  const base = createInitialState(seed);
  const thief = base.hazards.find((h) => h.kind === kind)!;
  const spot = base.players[0].hex;
  return {
    ...base,
    activePlayerIndex: 0,
    hazards: base.hazards.map((h) =>
      h.kind === kind
        ? { ...h, hex: neighbourOf(base, spot), resolvedWith: [] }
        : { ...h, hex: { q: 0, r: 0 } },
    ),
    enemies: base.enemies.map((e) =>
      e.kind === kind ? { ...e, hex: neighbourOf(base, spot) } : e,
    ),
    players: base.players.map((p, i) => (i === 0 ? p : { ...p, dead: true })),
    // Keep the original for reference in the closure; unused otherwise.
    log: [...base.log, { turn: base.turn, text: `set up beside the ${thief.kind}` }],
  };
}

function neighbourOf(state: GameState, at: { q: number; r: number }) {
  const dirs = [
    { q: 1, r: 0 },
    { q: 1, r: -1 },
    { q: 0, r: -1 },
    { q: -1, r: 0 },
    { q: -1, r: 1 },
    { q: 0, r: 1 },
  ];
  for (const d of dirs) {
    const hex = { q: at.q + d.q, r: at.r + d.r };
    if (state.tiles[key(hex)] && !state.enemies.some((e) => key(e.hex) === key(hex))) return hex;
  }
  throw new Error("no free neighbour");
}

describe("walking into a thief", () => {
  it("does not start the fight for you - it offers one", () => {
    const state = beside("robber");
    const thief = state.hazards.find((h) => h.kind === "robber")!;
    const met = movePlayer(state, key(thief.hex));

    // Rulebook §5.5 makes this a decision: fight them or hand it over. A fight that
    // starts the instant you step on the tile takes the decision away.
    expect(met.combat).toBeNull();
    expect(key(met.players[0].hex)).toBe(key(thief.hex));
    expect(canFightThief(met, met.players[0])).toBe(true);
    expect(canPayOff(met, met.players[0])).toBe(true);
    expect(met.log.some((l) => /Fight, or pay up/.test(l.text))).toBe(true);
  });

  it("still starts one on anything that is not a thief", () => {
    const base = createInitialState(4471);
    const mob = base.enemies.find((e) => e.kind === "mob")!;
    const state: GameState = {
      ...base,
      activePlayerIndex: 0,
      players: base.players.map((p, i) =>
        i === 0 ? { ...p, hex: neighbourOf(base, mob.hex) } : { ...p, dead: true },
      ),
    };
    expect(movePlayer(state, key(mob.hex)).combat).not.toBeNull();
  });

  it("costs the turn's action once you swing, and not before", () => {
    const state = beside("robber");
    const thief = state.hazards.find((h) => h.kind === "robber")!;
    const met = movePlayer(state, key(thief.hex));
    expect(met.players[0].actedThisTurn).toBe(false);

    const fighting = fightThief(met);
    expect(fighting.combat).not.toBeNull();
    expect(fighting.combat!.enemyId).toContain("robber");
    expect(fighting.players[0].actedThisTurn).toBe(true);
  });
});

describe("beating a thief", () => {
  it("hands back every coin they were carrying", () => {
    const state = beside("robber");
    const thief = state.hazards.find((h) => h.kind === "robber")!;
    const loaded: GameState = {
      ...state,
      hazards: state.hazards.map((h) => (h.kind === "robber" ? { ...h, carrying: 7 } : h)),
      // Nearly down, so one swing finishes it whatever the dice do.
      enemies: state.enemies.map((e) =>
        e.kind === "robber" ? { ...e, damageTaken: e.maxHealth - 1 } : e,
      ),
    };
    const met = movePlayer(loaded, key(thief.hex));
    const before = met.players[0].money;

    let fighting = fightThief(met);
    for (let i = 0; i < 6 && fighting.combat?.outcome === "ongoing"; i++) fighting = attack(fighting);
    expect(fighting.combat?.outcome).toBe("enemyDefeated");

    // The $7 plus the body's own purse. Before v0.25 the coins simply left the game.
    expect(fighting.players[0].money).toBeGreaterThanOrEqual(before + 7);
    expect(fighting.hazards.find((h) => h.kind === "robber")?.carrying).toBe(0);
    expect(fighting.log.some((l) => /\$7/.test(l.text))).toBe(true);
  });

  it("is the other half of paying them off: what you hand over is what you can win back", () => {
    const state = beside("pirates");
    const thief = state.hazards.find((h) => h.kind === "pirates")!;
    const rich: GameState = {
      ...state,
      players: state.players.map((p, i) => (i === 0 ? { ...p, money: 5, hex: thief.hex } : p)),
      hazards: state.hazards.map((h) =>
        h.kind === "pirates" ? { ...h, resolvedWith: [] } : h,
      ),
    };
    const paid = payOff(rich);
    expect(paid.players[0].money).toBe(0);
    expect(paid.hazards.find((h) => h.kind === "pirates")?.carrying).toBe(5);
  });
});

describe("the turn's report", () => {
  it("says which way each wanderer went, as a direction and never a tile", () => {
    const before = startGame(4471);
    let after = before;
    for (let i = 0; i < before.players.length; i++) after = endTurn(clear(after));

    const moves = hazardMoves(before, after);
    expect(moves.length).toBe(after.hazards.length);
    for (const move of moves) {
      expect(move.name.length).toBeGreaterThan(0);
      expect(move.colour).toMatch(/^#/);
      if (move.heading !== null) {
        expect(move.heading).toMatch(/^(north|south|east|west|north-east|north-west|south-east|south-west)$/);
      }
    }
    // The card must not hand the table a grid reference - the whole board is hidden.
    for (const move of moves) expect(move.heading ?? "").not.toMatch(/[A-I][1-9]/);
  });

  it("rides on the turn card, with everything the opening did", () => {
    let state = startGame(4471);
    for (let i = 0; i < state.players.length; i++) state = endTurn(clear(state));

    expect(state.draw).not.toBeNull();
    expect(state.draw!.stirred.length).toBeGreaterThan(0);
    // The opening always writes at least the hazard movement it did.
    expect(Array.isArray(state.draw!.happenings)).toBe(true);
    for (const line of state.draw!.happenings) expect(line).not.toMatch(/\b[A-I][1-9]\b/);
  });
});

/** Turns cannot pass with a card up or a fight running. */
function clear(state: GameState): GameState {
  const next = state.draw ? { ...state, draw: null } : state;
  return next.combat ? endCombat({ ...next, combat: { ...next.combat, outcome: "playerEscaped" } }) : next;
}
