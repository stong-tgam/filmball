import { describe, expect, it } from "vitest";
import { hasMoved } from "../src/game/players";
import { stepsLeft } from "../src/game/players";
import { createInitialState } from "../src/game/setup";
import { activePlayer, endTurn, legalMoves, movePlayer, moveRange } from "../src/game/turn";
import { BASE_HEALTH, BASE_MONEY, ROLES, TURN_ORDER, createPlayers } from "../src/game/players";
import { makeRng } from "../src/game/rng";
import { FISHING_ROD } from "../src/game/items";
import {
  boardCorners,
  distance,
  fromLabel,
  hexesInRange,
  inBoard,
  key,
  label,
} from "../src/game/hex";
import type { GameState } from "../src/game/types";

const SEEDS = [1, 7, 42, 4471, 90210];
const game = (seed = 4471) => createInitialState(seed);

/** Play a whole turn for whoever is up, moving to the given tile if one is named. */
const take = (state: GameState, destination?: string): GameState =>
  endTurn(destination ? movePlayer(state, destination) : state);

describe("the party", () => {
  it("puts one player on the board per role", () => {
    const state = game();
    expect(state.players).toHaveLength(TURN_ORDER.length);
    expect(state.players.map((p) => p.role)).toEqual(TURN_ORDER);
    // Six corners, so the party has to keep fitting on them.
    expect(TURN_ORDER.length).toBeLessThanOrEqual(boardCorners().length);
  });

  it("starts everyone on a corner, four tiles apart and equidistant from the middle", () => {
    for (const seed of SEEDS) {
      const players = createInitialState(seed).players;
      const corners = boardCorners().map(key);
      for (const p of players) {
        expect(corners).toContain(key(p.hex));
        expect(distance(p.hex, { q: 0, r: 0 })).toBe(4);
      }
      for (const a of players) {
        for (const b of players) {
          if (a.id === b.id) continue;
          expect(distance(a.hex, b.hex)).toBeGreaterThanOrEqual(4);
        }
      }
    }
  });

  it("starts everyone alive, at full health, and empty-handed but for the rod", () => {
    for (const p of game().players) {
      expect(p.dead).toBe(false);
      expect(p.health).toBe(p.maxHealth);
      expect(p.health).toBe(BASE_HEALTH + ROLES[p.role].healthBonus);
      expect([p.armor, p.boots]).toEqual([null, null]);
      expect(p.supply).toEqual([]);
      expect(hasMoved(p)).toBe(false);
      expect(p.fishCaught).toBe(0);

      // The fisherman is the one exception, and the rod adds nothing to a roll -
      // the whole role is paid for by being the worst fighter at the table.
      if (ROLES[p.role].canFish) {
        expect(p.weapon?.name).toBe(FISHING_ROD);
        expect(p.weapon?.value).toBe(0);
      } else {
        expect(p.weapon).toBeNull();
      }
    }
  });

  it("is reproducible from the seed, and independent of the board", () => {
    expect(createPlayers(makeRng(5))).toEqual(createPlayers(makeRng(5)));
    const positions = (seed: number) => createInitialState(seed).players.map((p) => key(p.hex));
    expect(positions(4471)).toEqual(positions(4471));
    expect(new Set(SEEDS.map((s) => positions(s).join("/"))).size).toBeGreaterThan(1);
  });
});

describe("legal moves", () => {
  it("offers every tile within range, and never the tile you are on", () => {
    const state = game();
    const player = activePlayer(state);
    const moves = legalMoves(state, player);

    expect(moves.has(label(player.hex))).toBe(false);
    for (const [tile, steps] of moves) {
      const hex = fromLabel(tile)!;
      expect(inBoard(hex)).toBe(true);
      expect(steps).toBe(distance(player.hex, hex));
      expect(steps).toBeLessThanOrEqual(moveRange(player));
    }
  });

  it("gives everyone one tile a turn, and the scout two", () => {
    // Rulebook §3 and §5: one tile is the default; the scout is the movement role.
    const state = game();
    for (const player of state.players) {
      expect(moveRange(player)).toBe(player.role === "scout" ? 2 : 1);
    }
  });

  it("starts everyone on the rulebook's 3 health and $2", () => {
    for (const player of game().players) {
      expect(player.money).toBe(BASE_MONEY);
      expect(player.maxHealth).toBe(BASE_HEALTH + ROLES[player.role].healthBonus);
      expect(player.maxHealth).toBeLessThanOrEqual(4);
    }
  });

  it("offers a corner its three neighbours, and no more", () => {
    const state = game();
    const knight = state.players[0];
    // A corner is hemmed in by the rim: three neighbours, against a middle tile's six.
    expect(hexesInRange(knight.hex, 1)).toHaveLength(4);
    expect(legalMoves(state, knight).size).toBe(3);
  });

  it("treats another player as a wall to walk round", () => {
    // Movement is spent a tile at a time, so there is no such thing as passing
    // through any more: you could always just stop on them. Scout in the middle,
    // someone standing due east of them.
    const base = game();
    const rogue = { ...base.players[2], hex: { q: 0, r: 0 } };
    const blocker = { ...base.players[0], hex: { q: 1, r: 0 } };
    const beyond = { q: 2, r: 0 };
    // Clear the monsters: they block movement, and this test is about players.
    const state: GameState = {
      ...base,
      activePlayerIndex: 0,
      players: [rogue, blocker],
      enemies: [],
    };

    expect(moveRange(rogue)).toBe(2);
    const moves = legalMoves(state, rogue);
    expect(moves.has(label(blocker.hex))).toBe(false);
    // Two tiles of movement, but only ever one tile offered: the far side of the
    // blocker is next turn's problem, or this turn's second step taken the long way.
    expect(moves.has(label(beyond))).toBe(false);
    for (const steps of moves.values()) expect(steps).toBe(1);
  });

  it("spends movement one tile at a time, so a scout looks before the second step", () => {
    const base = game();
    const scout = { ...base.players.find((p) => p.role === "scout")!, hex: { q: 0, r: 0 } };
    const state: GameState = { ...base, activePlayerIndex: 0, players: [scout], enemies: [] };

    expect(moveRange(scout)).toBe(2);
    const first = legalMoves(state, scout);
    expect(first.size).toBeGreaterThan(0);
    for (const steps of first.values()) expect(steps).toBe(1);

    const after = movePlayer(state, [...first.keys()][0]);
    const walked = after.players[0];
    expect(walked.stepsTaken).toBe(1);
    expect(stepsLeft(walked)).toBe(1);

    // The second step is offered from the new tile - which is the point: the scout
    // sees what the first step turned up before committing to the next one.
    const second = legalMoves(after, walked);
    expect(second.size).toBeGreaterThan(0);
    expect(second.has(label(scout.hex))).toBe(true);

    const done = movePlayer(after, [...second.keys()][0]);
    expect(stepsLeft(done.players[0])).toBe(0);
    expect(legalMoves(done, done.players[0]).size).toBe(0);
  });

  it("offers nothing once the player has moved, or is dead, or the game is over", () => {
    const state = game();
    const player = activePlayer(state);
    expect(legalMoves(state, { ...player, stepsTaken: 1 }).size).toBe(0);
    expect(legalMoves(state, { ...player, dead: true }).size).toBe(0);
    expect(legalMoves({ ...state, phase: "gameOver" }, player).size).toBe(0);
  });
});

describe("moving", () => {
  it("puts the player on the tile and uses up their move", () => {
    const state = game();
    const destination = [...legalMoves(state, activePlayer(state)).keys()][0];
    const after = movePlayer(state, destination);
    const moved = after.players[after.activePlayerIndex];

    expect(key(moved.hex)).toBe(destination);
    expect(hasMoved(moved)).toBe(true);
    expect(legalMoves(after, moved).size).toBe(0);
    // The log says which way, never which tile: there is no map on screen, so a grid
    // reference in the log would hand the party the thing the design hides.
    expect(after.log.at(-1)?.text).not.toContain(destination);
    expect(after.log.at(-1)?.text).toMatch(
      /\b(north|south|east|west|north-east|north-west|south-east|south-west)\b/,
    );
  });

  it("refuses a tile out of range, an occupied tile, and nonsense", () => {
    const state = game();
    const player = activePlayer(state);
    const far = label({ q: -player.hex.q, r: -player.hex.r });
    const occupied = label(state.players[1].hex);

    for (const bad of [far, occupied, "Z9", ""]) {
      expect(movePlayer(state, bad)).toBe(state);
    }
  });

  it("does not mutate the state it was given", () => {
    const state = game();
    const before = JSON.stringify(state);
    movePlayer(state, [...legalMoves(state, activePlayer(state)).keys()][0]);
    expect(JSON.stringify(state)).toBe(before);
  });

  it("only ever moves the player whose turn it is", () => {
    const state = game();
    const others = state.players.slice(1).map((p) => key(p.hex));
    const after = movePlayer(state, [...legalMoves(state, activePlayer(state)).keys()][0]);
    expect(after.players.slice(1).map((p) => key(p.hex))).toEqual(others);
  });
});

describe("turn order", () => {
  it("passes the turn round the party and then rolls the counter over", () => {
    let state = game();
    expect(state.turn).toBe(1);

    const seen: string[] = [];
    for (let i = 0; i < TURN_ORDER.length; i++) {
      seen.push(activePlayer(state).id);
      state = endTurn(state);
    }

    expect(seen).toEqual(TURN_ORDER);
    expect(state.turn).toBe(2);
    expect(activePlayer(state).id).toBe(TURN_ORDER[0]);
  });

  it("gives the next player a fresh move", () => {
    let state = game();
    const destination = [...legalMoves(state, activePlayer(state)).keys()][0];
    state = take(state, destination);

    expect(hasMoved(activePlayer(state))).toBe(false);
    expect(legalMoves(state, activePlayer(state)).size).toBeGreaterThan(0);
  });

  it("notes holding position when a player ends their turn without moving", () => {
    const state = endTurn(game());
    expect(state.log.some((e) => e.text.includes("held position"))).toBe(true);
  });

  it("skips the dead", () => {
    const state = game();
    const withCasualty: GameState = {
      ...state,
      players: state.players.map((p, i) => (i === 1 ? { ...p, dead: true } : p)),
    };
    expect(activePlayer(endTurn(withCasualty)).id).toBe(TURN_ORDER[2]);
  });

  it("ends the game when the turn limit runs out", () => {
    let state: GameState = { ...game(), turnLimit: 2 };
    const passes = TURN_ORDER.length * 3;
    for (let i = 0; i < passes && state.phase !== "gameOver"; i++) state = endTurn(state);

    expect(state.phase).toBe("gameOver");
    expect(state.turn).toBe(2);
    expect(endTurn(state)).toBe(state);
    expect(legalMoves(state, activePlayer(state)).size).toBe(0);
  });

  it("ends the game when nobody is left standing", () => {
    const state = game();
    const wiped: GameState = { ...state, players: state.players.map((p) => ({ ...p, dead: true })) };
    expect(endTurn(wiped).phase).toBe("gameOver");
  });

  it("keeps the whole game serialisable as it is played", () => {
    let state = game();
    for (let i = 0; i < 6; i++) {
      const moves = [...legalMoves(state, activePlayer(state)).keys()];
      state = take(state, moves[i % moves.length]);
    }
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });
});
