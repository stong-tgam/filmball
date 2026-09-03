import { describe, expect, it } from "vitest";
import { FAILED_FIGHT_COST, endCombat, lostTrial, startCombat, wonTrial } from "../src/game/combat";
import { ENEMIES, placeEnemies, safeRadiusFor } from "../src/game/enemies";
import { canTakeOn, takeOn } from "../src/game/turn";
import { intoFight, winAll } from "./fight";
import { createInitialState } from "../src/game/setup";
import { legalMoves, movePlayer, endTurn } from "../src/game/turn";
import { makeRng } from "../src/game/rng";
import { allHexes, distance, key, label, neighbours } from "../src/game/hex";
import type { Enemy, GameState, Tile } from "../src/game/types";

const SEEDS = [1, 7, 42, 4471, 90210];

/** A game where the active player is standing next to the named kind of enemy. */
/**
 * A game with the knight standing next to the given monster and everybody else out of
 * it, for testing one fight in isolation.
 *
 * Monsters are scattered at random, so on any given seed a monster can be hemmed in by
 * other monsters with no free tile to stand on - the dragon at seed 4471 is exactly
 * that. Rather than pin a seed that happens to work today, walk seeds until one gives
 * a free neighbour. A fixture that breaks whenever placement shifts is a fixture that
 * cries wolf.
 */
function facing(
  kind: Enemy["kind"],
  seed = 4471,
  ground: (tile: Tile) => boolean = () => true,
): { state: GameState; enemy: Enemy } {
  for (let attempt = 0; attempt < 60; attempt++) {
    const base = createInitialState(seed + attempt);
    const enemy = base.enemies.find((e) => e.kind === kind && ground(base.tiles[key(e.hex)]));
    if (!enemy) continue;
    const spot = neighbours(enemy.hex).find(
      (h) => !base.enemies.some((e) => key(e.hex) === key(h)),
    );
    if (!spot) continue;
    const state: GameState = {
      ...base,
      // The dragon sleeps through the opening (`DRAGON_WAKES_ON`) and cannot be walked
      // into while it does. These tests are about the fight, not about the calendar,
      // so they start the day it has landed.
      enemies: base.enemies.map((e) => ({ ...e, dormant: false })),
      // One team, standing together, because a team is what fights.
      teams: [{ id: "team-1", name: "solo", memberIds: [base.players[0].id] }],
      players: base.players.map((p, i) => (i === 0 ? { ...p, hex: spot } : p)),
    };
    return { state, enemy: { ...enemy, dormant: false } };
  }
  throw new Error(`no seed near ${seed} leaves a free tile beside a ${kind}`);
}

describe("placing enemies", () => {
  it("puts the dragon in the middle and the rest around it", () => {
    for (const seed of SEEDS) {
      const { enemies } = createInitialState(seed);
      const dragon = enemies.filter((e) => e.kind === "finalboss");
      expect(dragon).toHaveLength(1);
      expect(key(dragon[0].hex)).toBe(label({ q: 0, r: 0 }));
      expect(enemies.filter((e) => e.kind === "midboss")).toHaveLength(ENEMIES.midboss.count);
      expect(enemies.filter((e) => e.kind === "mob")).toHaveLength(ENEMIES.mob.count);
      // How hard a thing is, is how many mini-games it takes, and that is on the
      // profile rather than rolled per monster: two bandits that took different
      // numbers of cards would be two bandits a child could not tell apart.
      for (const e of enemies) {
        expect(ENEMIES[e.kind].cards, e.kind).toBeGreaterThanOrEqual(1);
        expect(ENEMIES[e.kind].cards, e.kind).toBeLessThanOrEqual(3);
      }
    }
  });

  it("never starts a fight on turn 1: no monster spawns beside the party", () => {
    for (const seed of SEEDS) {
      const { players, enemies } = createInitialState(seed);
      const monsters = enemies.filter((e) => e.kind !== "robber" && e.kind !== "pirates");
      // The ring the board can actually afford. It is `SAFE_RADIUS` when there is room
      // and one less when the party is big enough that holding it would jam every
      // monster into the middle - see `safeRadiusFor`.
      const radius = safeRadiusFor(players, monsters.length - 1);
      expect(radius).toBeGreaterThanOrEqual(1);

      // The thieves are placed as hazards, under §5.5's rules, not with the monsters.
      for (const enemy of monsters) {
        for (const player of players) {
          expect(distance(enemy.hex, player.hex)).toBeGreaterThan(radius);
        }
      }
    }
  });

  it("leaves the board scattered rather than packed, whatever the party size", () => {
    // The point of the safe ring is that it costs tiles; the point of shrinking it is
    // that a saturated board is not a scatter. If every legal tile has a monster on it
    // then "explore and find out" means nothing, so hold the line at half.
    for (const seed of SEEDS) {
      const { players, enemies } = createInitialState(seed);
      const monsters = enemies.filter((e) => e.kind !== "robber" && e.kind !== "pirates");
      const radius = safeRadiusFor(players, monsters.length - 1);
      const open = allHexes().filter((h) => players.every((p) => distance(p.hex, h) > radius));
      // Half. On the small board with a full party this runs close to the line, which
      // is the point of measuring it rather than trusting the constants.
      expect(monsters.length / open.length).toBeLessThanOrEqual(0.55);
    }
  });

  it("never stacks two enemies on one tile", () => {
    for (const seed of SEEDS) {
      const { enemies } = createInitialState(seed);
      expect(new Set(enemies.map((e) => key(e.hex))).size).toBe(enemies.length);
    }
  });

  it("is reproducible from the seed", () => {
    const players = createInitialState(4471).players;
    const once = placeEnemies(makeRng(11), players);
    const twice = placeEnemies(makeRng(11), players);
    expect(once).toEqual(twice);
  });

  it("always places the full complement, relaxing the spacing if it must", () => {
    const players = createInitialState(4471).players;
    for (let seed = 1; seed <= 30; seed++) {
      const placed = placeEnemies(makeRng(seed), players);
      expect(placed.filter((e) => e.kind === "mob")).toHaveLength(ENEMIES.mob.count);
      expect(placed.filter((e) => e.kind === "midboss")).toHaveLength(ENEMIES.midboss.count);
    }
  });
});

describe("meeting an enemy", () => {
  it("lets you walk onto one but never past it", () => {
    const base = createInitialState(4471);
    const rogue = { ...base.players[1], hex: { q: 0, r: 0 } };
    const guard: Enemy = { ...base.enemies[0], hex: { q: 1, r: 0 } };
    const state: GameState = {
      ...base,
      activePlayerIndex: 0,
      players: [rogue],
      enemies: [guard],
    };

    const moves = legalMoves(state, rogue);
    // Derived rather than written out: tile labels move whenever `RADIUS` does.
    expect(moves.has(label({ q: 1, r: 0 }))).toBe(true); // onto it: that is the offer
    expect(moves.has(label({ q: 2, r: 0 }))).toBe(false); // past it: blocked
  });

  it("finds it but does not start the fight - the team gets asked", () => {
    const { state, enemy } = facing("mob");
    const after = movePlayer(state, key(enemy.hex));

    // The whole reason this is a button: a fight is three minutes of everybody's
    // evening with a clock on it, so walking onto something must not spend it.
    expect(after.combat).toBeNull();
    expect(after.enemies.find((e) => e.id === enemy.id)?.found).toBe(true);
    expect(canTakeOn(after)).toBe(true);
    expect(after.players[0].actedThisTurn).toBe(false);
  });

  it("deals the monster's cards when the team takes it on", () => {
    const { state, enemy } = facing("mob");
    const fighting = takeOn(movePlayer(state, key(enemy.hex)));

    expect(fighting.phase).toBe("combat");
    expect(fighting.combat?.enemyId).toBe(enemy.id);
    expect(fighting.combat?.trials).toHaveLength(ENEMIES.mob.cards);
    expect(fighting.combat?.at).toBe(0);
    // The fight is the turn's action, and there is only one a turn.
    expect(fighting.players[0].actedThisTurn).toBe(true);
    expect(canTakeOn(fighting)).toBe(false);
  });

  it("will not let the turn pass while a fight is on", () => {
    const { state, enemy } = facing("mob");
    const fighting = takeOn(movePlayer(state, key(enemy.hex)));
    expect(endTurn(fighting)).toBe(fighting);
  });
});

describe("winning and losing a run of cards", () => {
  it("takes every card, and the last one beats it", () => {
    const { state, enemy } = facing("midboss");
    let fighting = intoFight(state, enemy);
    expect(fighting.combat?.trials).toHaveLength(2);

    fighting = wonTrial(fighting);
    // One down, still going: a boss is not one card.
    expect(fighting.combat?.outcome).toBe("ongoing");
    expect(fighting.combat?.at).toBe(1);

    fighting = wonTrial(fighting);
    expect(fighting.combat?.outcome).toBe("enemyDefeated");
    expect(fighting.enemies.find((e) => e.id === enemy.id)?.defeated).toBe(true);
  });

  it("loses the whole fight on one missed card, and costs a health", () => {
    const { state, enemy } = facing("midboss");
    const fighting = intoFight(state, enemy);
    const before = fighting.players[0].health;

    const after = lostTrial(fighting);
    expect(after.combat?.outcome).toBe("partyBeaten");
    expect(after.players[0].health).toBe(before - FAILED_FIGHT_COST);
    // Nothing is remembered: it is standing there exactly as it was.
    expect(after.enemies.find((e) => e.id === enemy.id)?.defeated).toBe(false);
  });

  it("never takes anybody out of the game, however badly it goes", () => {
    const { state, enemy } = facing("midboss");
    let broke: GameState = {
      ...state,
      players: state.players.map((p) => ({ ...p, health: 1 })),
    };
    broke = lostTrial(intoFight(broke, enemy));
    // Zero health is the loss of a skill, not the loss of a player. This is the whole
    // of the consequence model and there is deliberately nothing sharper behind it.
    expect(broke.players[0].health).toBe(0);
    expect(broke.ending).toBeNull();
    expect(broke.players[0].gone).toBe(false);
  });

  it("stops accepting calls once the fight is settled", () => {
    const { state, enemy } = facing("mob");
    const done = winAll(intoFight(state, enemy));
    expect(wonTrial(done)).toBe(done);
    expect(lostTrial(done)).toBe(done);
  });

  it("hands the turn back when the fight closes", () => {
    const { state, enemy } = facing("mob");
    const done = endCombat(winAll(intoFight(state, enemy)));
    expect(done.combat).toBeNull();
    expect(done.phase).toBe("playerMove");
  });

  it("leaves a monster on the board once it has been walked into", () => {
    const { state, enemy } = facing("mob");
    const after = movePlayer(state, key(enemy.hex));
    expect(after.enemies.find((e) => e.id === enemy.id)?.found).toBe(true);
  });
});

describe("fighting is reproducible and does not mutate", () => {
  it("replays identically from the same state", () => {
    const { state, enemy } = facing("midboss");
    expect(intoFight(state, enemy)).toEqual(intoFight(state, enemy));
  });

  it("leaves the state it was handed alone", () => {
    const { state, enemy } = facing("midboss");
    const opening = intoFight(state, enemy);
    const before = JSON.stringify(opening);
    wonTrial(opening);
    expect(JSON.stringify(opening)).toBe(before);
  });

  it("stays serialisable through a whole fight", () => {
    const { state, enemy } = facing("mob");
    const fighting = winAll(intoFight(state, enemy));
    expect(JSON.parse(JSON.stringify(fighting))).toEqual(fighting);
  });

  it("does nothing when there is no fight to act on", () => {
    const quiet = createInitialState(4471);
    expect(wonTrial(quiet)).toBe(quiet);
    expect(lostTrial(quiet)).toBe(quiet);
    expect(endCombat(quiet)).toBe(quiet);
    expect(startCombat(quiet, quiet.enemies[0], "E5", [quiet.players[0].id]).combat).not.toBeNull();
  });
});
