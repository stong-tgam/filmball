import { describe, expect, it } from "vitest";
import { hasMoved } from "../src/game/players";
import { stepsLeft } from "../src/game/players";
import { createInitialState } from "../src/game/setup";
import { activePlayer, endTurn, legalMoves, movePlayer, moveRange } from "../src/game/turn";
import { BASE_HEALTH, BASE_MONEY, BASE_MOVE, ROLES, TURN_ORDER, createPlayers } from "../src/game/players";
import { makeRng } from "../src/game/rng";
import { FISHING_ROD } from "../src/game/items";
import { endCombat, lostTrial } from "../src/game/combat";
import {
  RADIUS,
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

  it("starts each team together on its own corner", () => {
    // A team moves as one thing and fights as one thing, so it starts as one thing -
    // and a hex with three tokens on it is the first thing the table sees about how
    // this game is played. The corners stay separate, which is what keeps the hidden
    // map worth talking about.
    for (const seed of SEEDS) {
      const state = createInitialState(seed);
      const corners = boardCorners();

      for (const p of state.players) {
        expect(corners.some((c) => key(c) === key(p.hex)), `seed ${seed}`).toBe(true);
        // Out on the rim, the same distance from the dragon for everybody.
        expect(distance(p.hex, { q: 0, r: 0 }), `seed ${seed}, ${p.id}`).toBe(RADIUS);
      }

      for (const team of state.teams) {
        const spots = new Set(
          team.memberIds.map((id) => key(state.players.find((p) => p.id === id)!.hex)),
        );
        expect(spots.size, `seed ${seed}, ${team.id}`).toBe(1);
      }
      // Two teams never start on top of each other.
      const opened = new Set(
        state.teams.map((t) => key(state.players.find((p) => p.id === t.memberIds[0])!.hex)),
      );
      expect(opened.size, `seed ${seed}`).toBe(state.teams.length);
    }
  });

  it("starts everyone alive, at full health, and empty-handed but for the rod", () => {
    for (const p of game().players) {
      expect(p.gone).toBe(false);
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

  it("gives everyone the base move, and the scout one more", () => {
    // §5 says one tile; v0.30 made it two, because a turn is a route now rather than
    // a poke at the next hex. Written against the constant so it cannot go stale.
    const state = game();
    for (const player of state.players) {
      expect(moveRange(player)).toBe(BASE_MOVE + ROLES[player.role].moveBonus);
    }
    expect(moveRange(state.players.find((p) => p.role === "scout")!)).toBe(BASE_MOVE + 1);
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

  it("lets you walk onto a friend, because the party has to be able to meet", () => {
    // Players stack now. Standing on each other is how you trade face to face, where
    // the fisherman's hook puts you, and where a group fight has to happen; the old
    // blocking rule made the party four people who could never quite meet.
    const base = game();
    const rogue = { ...base.players.find((p) => p.role === "rogue")!, hex: { q: 0, r: 0 } };
    const friend = { ...base.players.find((p) => p.role === "knight")!, hex: { q: 1, r: 0 } };
    const beyond = { q: 2, r: 0 };
    // Clear the monsters: they still block, and this test is about players.
    const state: GameState = {
      ...base,
      activePlayerIndex: 0,
      players: [rogue, friend],
      enemies: [],
    };

    expect(moveRange(rogue)).toBe(BASE_MOVE);
    const moves = legalMoves(state, rogue);
    expect(moves.has(label(friend.hex))).toBe(true);
    // Still only ever one tile offered at a time, friend or no friend: the far side
    // is next turn's problem, or this turn's second step taken separately.
    expect(moves.has(label(beyond))).toBe(false);
    for (const steps of moves.values()) expect(steps).toBe(1);
  });

  it("spends movement one tile at a time, so a scout looks before the second step", () => {
    const base = game();
    const scout = { ...base.players.find((p) => p.role === "scout")!, hex: { q: 0, r: 0 } };
    const state: GameState = { ...base, activePlayerIndex: 0, players: [scout], enemies: [] };

    expect(moveRange(scout)).toBe(BASE_MOVE + 1);
    const first = legalMoves(state, scout);
    expect(first.size).toBeGreaterThan(0);
    for (const steps of first.values()) expect(steps).toBe(1);

    const after = movePlayer(state, [...first.keys()][0]);
    const walked = after.players[0];
    expect(walked.stepsTaken).toBe(1);
    expect(stepsLeft(walked)).toBe(BASE_MOVE);

    // The second step is offered from the new tile - which is the point: the scout
    // sees what the first step turned up before committing to the next one.
    const second = legalMoves(after, walked);
    expect(second.size).toBeGreaterThan(0);
    expect(second.has(label(scout.hex))).toBe(true);

    // Walk the legs out, a step at a time, and the offers stop.
    let done = after;
    for (let i = 0; i < BASE_MOVE && stepsLeft(done.players[0]) > 0; i++) {
      const open = legalMoves(done, done.players[0]);
      if (open.size === 0) break;
      done = movePlayer(done, [...open.keys()][0]);
    }
    expect(stepsLeft(done.players[0])).toBe(0);
    expect(legalMoves(done, done.players[0]).size).toBe(0);
    expect(legalMoves(done, done.players[0]).size).toBe(0);
  });

  it("offers nothing once the player has moved, or is dead, or the game is over", () => {
    const state = game();
    const player = activePlayer(state);
    expect(legalMoves(state, { ...player, stepsTaken: moveRange(player) }).size).toBe(0);
    expect(legalMoves(state, { ...player, gone: true }).size).toBe(0);
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
    expect(stepsLeft(moved)).toBe(moveRange(moved) - 1);
    // The log says which way, never which tile: there is no map on screen, so a grid
    // reference in the log would hand the party the thing the design hides.
    expect(after.log.at(-1)?.text).not.toContain(destination);
    expect(after.log.at(-1)?.text).toMatch(
      /\b(north|south|east|west|north-east|north-west|south-east|south-west)\b/,
    );
  });

  it("refuses a tile out of range, and nonsense", () => {
    const state = game();
    const player = activePlayer(state);
    const far = label({ q: -player.hex.q, r: -player.hex.r });

    for (const bad of [far, "Z9", ""]) {
      expect(movePlayer(state, bad)).toBe(state);
    }

    // A tile somebody is standing on is *not* refused - players have stacked since
    // v0.17. This assertion used to sit in the list above and passed only because the
    // party started four tiles apart and never got the chance to try.
    const friend = state.players.find((p) => p.id !== player.id)!;
    if (legalMoves(state, player).has(label(friend.hex))) {
      expect(movePlayer(state, label(friend.hex))).not.toBe(state);
    }
  });

  it("does not mutate the state it was given", () => {
    const state = game();
    const before = JSON.stringify(state);
    movePlayer(state, [...legalMoves(state, activePlayer(state)).keys()][0]);
    expect(JSON.stringify(state)).toBe(before);
  });

  it("moves the whole team, and nobody outside it", () => {
    const state = game();
    const mine = new Set(state.teams[0].memberIds);
    const theirs = state.players.filter((p) => !mine.has(p.id)).map((p) => key(p.hex));
    const step = [...legalMoves(state, activePlayer(state)).keys()][0];
    const after = movePlayer(state, step);

    for (const id of mine) {
      expect(key(after.players.find((p) => p.id === id)!.hex), id).toBe(step);
    }
    expect(after.players.filter((p) => !mine.has(p.id)).map((p) => key(p.hex))).toEqual(theirs);
  });
});

/** Everybody one tile off the middle, safe from every ring the collapse takes. */
const inland = (state: GameState): GameState => ({
  ...state,
  players: state.players.map((p) => ({ ...p, hex: { q: 0, r: 1 } })),
});

describe("turn order", () => {
  it("passes the turn round the teams and then rolls the counter over", () => {
    let state = game();
    expect(state.turn).toBe(1);

    const seen: string[] = [];
    for (let i = 0; i < state.teams.length; i++) {
      seen.push(activePlayer(state).id);
      state = endTurn(state);
    }

    // One go per team per turn - two teams is two movements and at most two fights,
    // which is the whole reason eight turns fits in an evening.
    expect(seen).toEqual(state.teams.map((t) => t.memberIds[0]));
    expect(state.turn).toBe(2);
    expect(activePlayer(state).id).toBe(state.teams[0].memberIds[0]);
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

  it("keeps a player with no health in the turn order", () => {
    // Zero health costs you your skill and nothing else. A child with nothing to do
    // for the rest of the evening is the failure this whole design refuses.
    const state = game();
    const flat: GameState = {
      ...state,
      players: state.players.map((p) => ({ ...p, health: 0 })),
    };
    const after = endTurn(flat);
    expect(after.ending).toBeNull();
    expect(after.teams[1].memberIds).toContain(activePlayer(after).id);
  });

  it("hands a team on to its next member when the first has gone over the rim", () => {
    const state = game();
    const lost: GameState = {
      ...state,
      players: state.players.map((p) =>
        p.id === state.teams[1].memberIds[0] ? { ...p, gone: true } : p,
      ),
    };
    expect(activePlayer(endTurn(lost)).id).toBe(state.teams[1].memberIds[1]);
  });

  it("carries everybody to the dragon on the last turn, whatever they are holding", () => {
    // Standing still on the rim for eight turns is a way to fall in the abyss, which
    // is a different test; this one is about the ending, so they start inland.
    let state = inland(game());
    for (let i = 0; i < 40 && !state.combat; i++) state = endTurn({ ...state, draw: null });

    // Turn 8 is the dragon, and nobody misses the ending for being three tiles away.
    expect(state.turn).toBe(state.turnLimit);
    const dragon = state.enemies.find((e) => e.kind === "finalboss")!;
    expect(state.combat?.enemyId).toBe(dragon.id);
    expect(state.combat?.trials).toHaveLength(3);
    for (const p of state.players) expect(key(p.hex)).toBe(key(dragon.hex));
  });

  it("runs out of time only after the last stand has been played", () => {
    let state = inland(game());
    for (let i = 0; i < 40 && !state.combat; i++) state = endTurn({ ...state, draw: null });
    state = endTurn(endCombat(lostTrial(state)));

    expect(state.phase).toBe("gameOver");
    expect(state.ending).toBe("outOfTime");
    expect(endTurn(state)).toBe(state);
  });

  it("has no ending that takes the party out of the game", () => {
    // Teams never wipe. There is nothing left that can end an evening early, which is
    // the point of health only ever costing somebody their skill.
    const state = game();
    const flat: GameState = { ...state, players: state.players.map((p) => ({ ...p, health: 0 })) };
    expect(endTurn(flat).ending).toBeNull();
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
