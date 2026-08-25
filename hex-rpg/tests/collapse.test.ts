/**
 * The rim falling in, the dragon sleeping through the opening, and the bandits that
 * keep arriving - the three rules that turn a wandering hunt into something with a
 * clock on it.
 */

import { describe, expect, it } from "vitest";
import {
  COLLAPSE_MARKS,
  LAST_RING,
  collapseRim,
  collapseTurns,
  doomed,
  edgeFallsAfter,
  hasFallen,
  liveRadius,
  rimWarning,
} from "../src/game/collapse";
import { createInitialState, startGame } from "../src/game/setup";
import { endTurn, legalMoves, movePlayer } from "../src/game/turn";
import { DRAGON_HEALTH_PER_PLAYER, DRAGON_WAKES_ON, mobArrivalChance } from "../src/game/enemies";
import { RADIUS, allHexes, distance, key } from "../src/game/hex";
import { sense } from "../src/game/sense";
import { TURN_ORDER } from "../src/game/players";
import type { GameState, Player } from "../src/game/types";

const MIDDLE = { q: 0, r: 0 };
const LIMIT = 16;

/** A game sitting on a given turn, with everybody parked where you put them. */
function on(turn: number, at: { q: number; r: number }, seed = 4471): GameState {
  const base = createInitialState(seed);
  return {
    ...base,
    turn,
    turnLimit: LIMIT,
    players: base.players.map((p, i) =>
      i === 0 ? { ...p, hex: at } : { ...p, hex: MIDDLE, dead: true },
    ),
  };
}

describe("the collapse clock", () => {
  it("takes a ring every quarter of the game", () => {
    expect(collapseTurns(16)).toEqual([4, 8, 12]);
    expect(collapseTurns(16)).toHaveLength(COLLAPSE_MARKS.length);
    // Never on turn 1: nobody loses a player before they have had a go.
    expect(Math.min(...collapseTurns(4))).toBeGreaterThanOrEqual(2);
  });

  it("shrinks the board one ring at a time, and never past the dragon's own ring", () => {
    expect(liveRadius(1, LIMIT)).toBe(RADIUS);
    expect(liveRadius(3, LIMIT)).toBe(RADIUS);
    expect(liveRadius(4, LIMIT)).toBe(RADIUS - 1);
    expect(liveRadius(8, LIMIT)).toBe(Math.max(LAST_RING, RADIUS - 2));
    expect(liveRadius(LIMIT, LIMIT)).toBeGreaterThanOrEqual(LAST_RING);
    // Monotonic, and it stops rather than reaching nothing. A single tile would be
    // the dragon's own, which is not somewhere a player can stand.
    for (let turn = 2; turn <= LIMIT; turn++) {
      expect(liveRadius(turn, LIMIT)).toBeLessThanOrEqual(liveRadius(turn - 1, LIMIT));
      expect(liveRadius(turn, LIMIT)).toBeGreaterThanOrEqual(LAST_RING);
    }
  });

  it("warns exactly one turn before, and only then", () => {
    for (let turn = 1; turn < LIMIT; turn++) {
      const falls = collapseTurns(LIMIT).includes(turn + 1);
      const shrinks = liveRadius(turn + 1, LIMIT) < liveRadius(turn, LIMIT);
      expect(edgeFallsAfter(turn, LIMIT)).toBe(falls && shrinks);
    }
  });

  it("marks the ring that is going, and nothing further in", () => {
    const warned = collapseTurns(LIMIT)[0] - 1;
    for (const hex of allHexes()) {
      const out = distance(hex, MIDDLE) === liveRadius(warned, LIMIT);
      expect(doomed(hex, warned, LIMIT), key(hex)).toBe(out);
    }
  });
});

describe("the rim going", () => {
  it("takes whoever is standing on it, for good", () => {
    const turn = collapseTurns(LIMIT)[0];
    const rim = allHexes().find((h) => distance(h, MIDDLE) === RADIUS)!;
    const after = collapseRim(on(turn, rim));
    const lost = after.players[0];

    expect(lost.gone).toBe(true);
    expect(lost.dead).toBe(true);
    // `fellOn: null` is what stops §7's get-up-after-a-turn clock from ever starting.
    expect(lost.fellOn).toBeNull();
    expect(lost.fellAt).toBeNull();
  });

  it("leaves anybody who moved inwards alone", () => {
    const turn = collapseTurns(LIMIT)[0];
    const inner = allHexes().find((h) => distance(h, MIDDLE) === RADIUS - 1)!;
    const after = collapseRim(on(turn, inner));
    expect(after.players[0].gone).toBe(false);
    expect(after.players[0].dead).toBe(false);
  });

  it("does nothing at all on the turns between", () => {
    const quiet = on(collapseTurns(LIMIT)[0] + 1, MIDDLE);
    expect(collapseRim(quiet)).toBe(quiet);
  });

  it("hands the turn on when it swallows the player whose go it is", () => {
    const turn = collapseTurns(LIMIT)[0];
    const rim = allHexes().find((h) => distance(h, MIDDLE) === RADIUS)!;
    const base = createInitialState(4471);
    const state: GameState = {
      ...base,
      turn,
      turnLimit: LIMIT,
      activePlayerIndex: 0,
      players: base.players.map((p, i) => (i === 0 ? { ...p, hex: rim } : { ...p, hex: MIDDLE })),
    };
    const after = collapseRim(state);
    expect(after.players[0].gone).toBe(true);
    expect(after.activePlayerIndex).not.toBe(0);
    expect(after.players[after.activePlayerIndex].dead).toBe(false);
  });

  it("ends the game if it takes the last of them", () => {
    const turn = collapseTurns(LIMIT)[0];
    const rim = allHexes().filter((h) => distance(h, MIDDLE) === RADIUS);
    const base = createInitialState(4471);
    const state: GameState = {
      ...base,
      turn,
      turnLimit: LIMIT,
      players: base.players.map((p, i) => ({ ...p, hex: rim[i % rim.length] })),
    };
    expect(collapseRim(state).ending).toBe("partyLost");
  });

  it("backs the dragon up a tile rather than dropping it down the hole", () => {
    const turn = collapseTurns(LIMIT)[0];
    const rim = allHexes().find((h) => distance(h, MIDDLE) === RADIUS)!;
    const base = on(turn, MIDDLE);
    const state: GameState = {
      ...base,
      enemies: base.enemies.map((e) => (e.kind === "finalboss" ? { ...e, hex: rim } : e)),
    };
    const dragon = collapseRim(state).enemies.find((e) => e.kind === "finalboss");
    expect(dragon, "the ending must not fall down a hole").toBeDefined();
    expect(distance(dragon!.hex, MIDDLE)).toBeLessThan(RADIUS);
  });

  it("sweeps everything else off the ring - monsters, thieves and weather alike", () => {
    const turn = collapseTurns(LIMIT)[0];
    const after = collapseRim(on(turn, MIDDLE));
    const live = liveRadius(turn, LIMIT);
    for (const enemy of after.enemies) {
      expect(distance(enemy.hex, MIDDLE), enemy.id).toBeLessThanOrEqual(live);
    }
    for (const hazard of after.hazards) {
      expect(distance(hazard.hex, MIDDLE), hazard.kind).toBeLessThanOrEqual(live);
    }
  });

  it("is not ground any more: you cannot step into the abyss", () => {
    const turn = collapseTurns(LIMIT)[0];
    const edge = allHexes().find(
      (h) => distance(h, MIDDLE) === RADIUS - 1 && allHexes().some((n) => distance(n, h) === 1 && distance(n, MIDDLE) === RADIUS),
    )!;
    const state = on(turn, edge);
    const moves = [...legalMoves(state, state.players[0]).keys()];
    expect(moves.length).toBeGreaterThan(0);
    for (const label of moves) {
      expect(hasFallen(state.tiles[label].hex, turn, LIMIT), label).toBe(false);
    }
  });

  it("says so on the banner, on the turn before and to the player who has to move", () => {
    const warned = collapseTurns(LIMIT)[0] - 1;
    const rim = allHexes().find((h) => distance(h, MIDDLE) === RADIUS)!;
    const inner = allHexes().find((h) => distance(h, MIDDLE) === 1)!;

    const onIt = on(warned, rim);
    expect(rimWarning(onIt, onIt.players[0])).toMatch(/move inwards/i);

    const safe = on(warned, inner);
    expect(rimWarning(safe, safe.players[0])).toMatch(/crumbles/i);

    const quiet = on(warned - 1, rim);
    expect(rimWarning(quiet, quiet.players[0])).toBeNull();
  });
});

describe("the dragon sleeping in", () => {
  it("is not on the board for the opening: no smoke, nothing to walk into", () => {
    const base = createInitialState(4471);
    const dragon = base.enemies.find((e) => e.kind === "finalboss")!;
    expect(dragon.dormant).toBe(true);

    // Standing right next to it and feeling nothing.
    const beside = { q: dragon.hex.q + 1, r: dragon.hex.r };
    const near = on(1, beside);
    expect(sense(near, near.players[0]).some((t) => t.kind === "dragon")).toBe(false);

    // And walking onto the tile is a walk, not a fight.
    const walked = movePlayer({ ...near, activePlayerIndex: 0 }, key(dragon.hex));
    expect(walked.combat).toBeNull();
    expect(key(walked.players[0].hex)).toBe(key(dragon.hex));
  });

  it("comes home on its turn, and smokes from then on", () => {
    let state = huddled(4471);
    const asleep = () => state.enemies.find((e) => e.kind === "finalboss")!.dormant;
    expect(asleep()).toBe(true);

    for (let guard = 0; guard < 400 && state.turn < DRAGON_WAKES_ON && !state.ending; guard++) {
      state = advance(state);
    }
    expect(state.turn).toBeGreaterThanOrEqual(DRAGON_WAKES_ON);
    expect(asleep()).toBe(false);
    expect(state.log.some((l) => /come home/i.test(l.text))).toBe(true);
  });
});

/**
 * A game with the whole party parked next to the middle, so a test that wants to run
 * the clock out is not measuring the abyss eating everybody on turn 4.
 */
function huddled(seed: number): GameState {
  const base = startGame(seed);
  const ring = allHexes().filter((h) => distance(h, MIDDLE) === 1);
  return { ...base, players: base.players.map((p, i) => ({ ...p, hex: ring[i % ring.length] })) };
}

/** End the active player's turn, whatever they are in the middle of. */
function advance(state: GameState): GameState {
  const next = state.combat ? { ...state, combat: null, phase: "playerMove" as const } : state;
  return endTurn(next);
}

describe("bandits keep coming", () => {
  it("gets likelier as the game goes on, and never reaches certain", () => {
    const early = mobArrivalChance(1, LIMIT);
    const late = mobArrivalChance(LIMIT, LIMIT);
    expect(late).toBeGreaterThan(early);
    expect(early).toBeGreaterThan(0);
    expect(late).toBeLessThan(1);
  });

  it("keeps putting fresh ones on the board as the game runs on", () => {
    let state = huddled(4471);
    for (let i = 0; i < 400 && !state.ending; i++) state = advance(state);

    expect(state.log.filter((l) => /hear them moving/.test(l.text)).length).toBeGreaterThan(0);
    // Never out in the abyss, and never two with one name - a duplicate id is a fight
    // that picks the wrong monster.
    for (const enemy of state.enemies) {
      expect(hasFallen(enemy.hex, state.turn, state.turnLimit), enemy.id).toBe(false);
    }
    expect(new Set(state.enemies.map((e) => e.id)).size).toBe(state.enemies.length);
  });
});

describe("the dragon itself", () => {
  it("carries health for every player at the table, not a flat band", () => {
    const [low, high] = DRAGON_HEALTH_PER_PLAYER;
    for (const size of [2, 3, 4, 5]) {
      const roster = TURN_ORDER.slice(0, size);
      const dragon = createInitialState(4471, roster).enemies.find((e) => e.kind === "finalboss")!;
      expect(dragon.maxHealth, `${size} players`).toBeGreaterThanOrEqual(low * size);
      expect(dragon.maxHealth, `${size} players`).toBeLessThanOrEqual(high * size);
    }
  });

  it("is a fight rather than a formality: a full party cannot roll it over in one go", () => {
    // Three dice average five, and a good weapon adds two. Even five players rolling
    // their best plausible round should not be able to end the game in one.
    const dragon = createInitialState(4471).enemies.find((e) => e.kind === "finalboss")!;
    const bestPlausibleRound = TURN_ORDER.length * (3 * 3 + 2);
    expect(dragon.maxHealth).toBeGreaterThan(TURN_ORDER.length * 5);
    expect(dragon.maxHealth, "still beatable by a party that turns up").toBeLessThan(
      bestPlausibleRound * 4,
    );
  });
});

/** Not exported anywhere, but the abyss must never be reachable by a hook or a heal. */
describe("nobody reaches into the abyss", () => {
  it("keeps a lost player out of the doctor's list and off the fisherman's line", async () => {
    const { healTargets, hookTargets } = await import("../src/game/actions");
    const base = createInitialState(4471);
    const doctor = base.players.find((p) => p.role === "doctor")!;
    const fisher = base.players.find((p) => p.role === "fisherman")!;
    const beside = { q: doctor.hex.q + 1, r: doctor.hex.r };

    const swallowed: Player = {
      ...base.players[0],
      hex: beside,
      gone: true,
      dead: true,
      health: 0,
      fellAt: null,
      fellOn: null,
    };
    const state: GameState = {
      ...base,
      players: base.players.map((p) => (p.id === swallowed.id ? swallowed : p)),
    };
    expect(healTargets(state, doctor).some((p) => p.id === swallowed.id)).toBe(false);
    expect(hookTargets(state, fisher).some((p) => p.id === swallowed.id)).toBe(false);
  });
});
