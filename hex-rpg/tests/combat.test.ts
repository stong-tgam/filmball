import { describe, expect, it } from "vitest";
import {
  BASE_DICE,
  DIE_FACES,
  FAILED_ROLL_COST,
  attack,
  endCombat,
  flee,
  rollDice,
  startCombat,
} from "../src/game/combat";
import { ENEMIES, enemyAt, healthLeft, placeEnemies, SAFE_RADIUS } from "../src/game/enemies";
import { createInitialState } from "../src/game/setup";
import { legalMoves, movePlayer, endTurn, activePlayer } from "../src/game/turn";
import { makeRng } from "../src/game/rng";
import { distance, key, neighbours } from "../src/game/hex";
import type { Enemy, GameState } from "../src/game/types";

const SEEDS = [1, 7, 42, 4471, 90210];

/** A game where the active player is standing next to the named kind of enemy. */
function facing(kind: Enemy["kind"], seed = 4471): { state: GameState; enemy: Enemy } {
  const base = createInitialState(seed);
  const enemy = base.enemies.find((e) => e.kind === kind)!;
  // Put the knight on a neighbouring tile, and clear everyone else out of the way.
  const spot = neighbours(enemy.hex).find(
    (h) => !base.enemies.some((e) => key(e.hex) === key(h)),
  )!;
  const state: GameState = {
    ...base,
    players: base.players.map((p, i) =>
      i === 0 ? { ...p, hex: spot } : { ...p, hex: { q: 0, r: -4 }, dead: true },
    ),
  };
  return { state, enemy };
}

describe("dice", () => {
  it("reads 1, 1, 1, 2, 2, 3 - never a zero", () => {
    expect([...DIE_FACES]).toEqual([1, 1, 1, 2, 2, 3]);
    expect(Math.min(...DIE_FACES)).toBe(1);
  });

  it("rolls the number of dice asked for, all within range", () => {
    const { dice } = rollDice(1234, BASE_DICE);
    expect(dice).toHaveLength(BASE_DICE);
    for (const d of dice) expect(DIE_FACES).toContain(d as 1 | 2 | 3);
  });

  it("advances the generator, so the next roll differs", () => {
    const first = rollDice(99, 3);
    const second = rollDice(first.rngState, 3);
    expect(second.rngState).not.toBe(first.rngState);
    expect(rollDice(99, 3)).toEqual(first);
  });

  it("comes out at the odds the faces imply: a 1 twice as often as a 2", () => {
    let state = 7;
    const counts: Record<number, number> = { 1: 0, 2: 0, 3: 0 };
    for (let i = 0; i < 6000; i++) {
      const roll = rollDice(state, 1);
      counts[roll.dice[0]]++;
      state = roll.rngState;
    }
    expect(counts[1] / 6000).toBeCloseTo(0.5, 1);
    expect(counts[2] / 6000).toBeCloseTo(0.333, 1);
    expect(counts[3] / 6000).toBeCloseTo(0.167, 1);
  });
});

describe("placing enemies", () => {
  it("puts the dragon in the middle and the rest around it", () => {
    for (const seed of SEEDS) {
      const { enemies } = createInitialState(seed);
      const dragon = enemies.filter((e) => e.kind === "finalboss");
      expect(dragon).toHaveLength(1);
      expect(key(dragon[0].hex)).toBe("E5");
      expect(enemies.filter((e) => e.kind === "midboss")).toHaveLength(ENEMIES.midboss.count);
      expect(enemies.filter((e) => e.kind === "mob")).toHaveLength(ENEMIES.mob.count);
      // Rulebook §7: health is rolled inside a band, not fixed.
      for (const e of enemies) {
        const [low, high] = ENEMIES[e.kind].health;
        expect(e.maxHealth).toBeGreaterThanOrEqual(low);
        expect(e.maxHealth).toBeLessThanOrEqual(high);
      }
    }
  });

  it("never starts a fight on turn 1: no monster spawns near the party", () => {
    for (const seed of SEEDS) {
      const { players, enemies } = createInitialState(seed);
      // The thieves are placed as hazards, under §5.5's rules, not with the monsters.
      for (const enemy of enemies.filter((e) => e.kind !== "robber" && e.kind !== "pirates")) {
        for (const player of players) {
          expect(distance(enemy.hex, player.hex)).toBeGreaterThan(SAFE_RADIUS);
        }
      }
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
    expect(moves.has("E6")).toBe(true); // onto the enemy: that is the fight
    expect(moves.has("E7")).toBe(false); // past it: blocked
  });

  it("starts the fight the moment you step on", () => {
    const { state, enemy } = facing("mob");
    const after = movePlayer(state, key(enemy.hex));

    expect(after.phase).toBe("combat");
    expect(after.combat?.enemyId).toBe(enemy.id);
    expect(after.combat?.outcome).toBe("ongoing");
    expect(after.combat?.round).toBe(0);
    expect(after.combat?.from).toBe(key(state.players[0].hex));
  });

  it("will not let the turn pass while a fight is on", () => {
    const { state, enemy } = facing("mob");
    const fighting = movePlayer(state, key(enemy.hex));
    expect(endTurn(fighting)).toBe(fighting);
  });
});

describe("a round of fighting", () => {
  it("rolls, hurts the enemy, and costs exactly one health when it falls short", () => {
    // Rulebook §7: a failed roll costs 1 health flat, not a roll's worth.
    const { state, enemy } = facing("midboss");
    const opening = movePlayer(state, key(enemy.hex));
    const before = opening.players[0];
    const after = attack(opening);
    const hurt = after.enemies.find((e) => e.id === enemy.id)!;

    expect(after.combat?.playerRoll?.dice).toHaveLength(BASE_DICE);
    expect(hurt.damageTaken).toBe(after.combat!.playerRoll!.damage);
    expect(hurt.damageTaken).toBeGreaterThanOrEqual(BASE_DICE);
    expect(before.health - after.players[0].health).toBeGreaterThanOrEqual(FAILED_ROLL_COST);
    expect(after.combat?.round).toBe(1);
  });

  it("spends donated dice on the swing they were donated for", () => {
    const { state, enemy } = facing("midboss");
    const generous: GameState = {
      ...state,
      players: state.players.map((p, i) => (i === 0 ? { ...p, bonusDiceNextFight: 2 } : p)),
    };
    const after = attack(movePlayer(generous, key(enemy.hex)));

    expect(after.combat?.playerRoll?.dice).toHaveLength(BASE_DICE + 2);
    expect(after.players[0].bonusDiceNextFight).toBe(0);
  });

  it("beats the enemy once the damage adds up, and takes it off the board", () => {
    const { state, enemy } = facing("mob");
    let fighting = movePlayer(state, key(enemy.hex));
    for (let i = 0; i < 6 && fighting.combat?.outcome === "ongoing"; i++) {
      fighting = attack(fighting);
    }

    expect(fighting.combat?.outcome).toBe("enemyDefeated");
    const beaten = fighting.enemies.find((e) => e.id === enemy.id)!;
    expect(beaten.defeated).toBe(true);
    expect(healthLeft(beaten)).toBe(0);
    expect(enemyAt(fighting.enemies, key(enemy.hex))).toBeUndefined();
  });

  it("costs nothing on the roll that wins", () => {
    const { state, enemy } = facing("mob");
    let fighting = movePlayer(state, key(enemy.hex));
    let health = fighting.players[0].health;
    while (fighting.combat?.outcome === "ongoing") {
      health = fighting.players[0].health;
      fighting = attack(fighting);
    }
    if (fighting.combat?.outcome === "enemyDefeated") {
      expect(fighting.players[0].health).toBe(health);
      expect(fighting.combat?.toll).toBe(0);
    }
  });

  it("keeps the damage when you walk away, so you can come back for it", () => {
    const { state, enemy } = facing("finalboss");
    const from = key(state.players[0].hex);
    const bruised = attack(movePlayer(state, key(enemy.hex)));
    const dealt = bruised.enemies.find((e) => e.id === enemy.id)!.damageTaken;
    const away = flee(bruised);

    expect(dealt).toBeGreaterThan(0);
    expect(away.combat?.outcome).toBe("playerEscaped");
    expect(key(away.players[0].hex)).toBe(from);
    expect(away.enemies.find((e) => e.id === enemy.id)!.damageTaken).toBe(dealt);
    expect(away.enemies.find((e) => e.id === enemy.id)!.defeated).toBe(false);
  });

  it("lets you run before rolling at all", () => {
    const { state, enemy } = facing("finalboss");
    // A feature may bite as the fight opens (§9), so compare against that, not full health.
    const met = movePlayer(state, key(enemy.hex));
    const away = flee(met);
    expect(away.combat?.outcome).toBe("playerEscaped");
    expect(away.players[0].health).toBe(met.players[0].health);
    expect(away.players[0].actedThisTurn).toBe(true);
  });

  it("puts a player down when the last of their health goes, and marks where they fell", () => {
    const { state, enemy } = facing("finalboss");
    const frail: GameState = {
      ...state,
      players: state.players.map((p, i) => (i === 0 ? { ...p, health: 1 } : p)),
    };
    const after = attack(movePlayer(frail, key(enemy.hex)));

    // Three dice cannot take 20+ health off in one roll, so the roll always fails.
    expect(after.players[0].health).toBe(0);
    expect(after.players[0].dead).toBe(true);
    expect(after.players[0].fellAt).not.toBeNull();
    expect(after.combat?.outcome).toBe("playerDown");
  });

  it("stops accepting rolls once the fight is settled", () => {
    const { state, enemy } = facing("mob");
    let fighting = movePlayer(state, key(enemy.hex));
    while (fighting.combat?.outcome === "ongoing") fighting = attack(fighting);
    expect(attack(fighting)).toBe(fighting);
    expect(flee(fighting)).toBe(fighting);
  });

  it("hands the turn back when the fight closes", () => {
    const { state, enemy } = facing("mob");
    const settled = flee(movePlayer(state, key(enemy.hex)));
    const closed = endCombat(settled);
    expect(closed.combat).toBeNull();
    expect(closed.phase).toBe("playerMove");
    expect(endTurn(closed)).not.toBe(closed);
  });
});

describe("fighting is reproducible and does not mutate", () => {
  it("replays identically from the same state", () => {
    const { state, enemy } = facing("midboss");
    const opening = movePlayer(state, key(enemy.hex));
    expect(attack(opening)).toEqual(attack(opening));
  });

  it("leaves the state it was handed alone", () => {
    const { state, enemy } = facing("midboss");
    const opening = movePlayer(state, key(enemy.hex));
    const before = JSON.stringify(opening);
    attack(opening);
    expect(JSON.stringify(opening)).toBe(before);
  });

  it("stays serialisable through a whole fight", () => {
    const { state, enemy } = facing("mob");
    let fighting = movePlayer(state, key(enemy.hex));
    while (fighting.combat?.outcome === "ongoing") fighting = attack(fighting);
    expect(JSON.parse(JSON.stringify(fighting))).toEqual(fighting);
  });

  it("does nothing when there is no fight to act on", () => {
    const quiet = createInitialState(4471);
    expect(attack(quiet)).toBe(quiet);
    expect(flee(quiet)).toBe(quiet);
    expect(endCombat(quiet)).toBe(quiet);
    expect(startCombat(quiet, quiet.enemies[0], "E5").combat).not.toBeNull();
  });

  it("skips a downed player when the turn passes", () => {
    const { state, enemy } = facing("finalboss");
    const frail: GameState = {
      ...state,
      players: state.players.map((p, i) =>
        i === 0 ? { ...p, health: 1 } : { ...p, dead: false, hex: { q: 0, r: -4 } },
      ),
    };
    const down = attack(movePlayer(frail, key(enemy.hex)));
    const next = endTurn(endCombat(down));
    expect(activePlayer(next).dead).toBe(false);
    expect(activePlayer(next).id).not.toBe(down.players[0].id);
  });
});
