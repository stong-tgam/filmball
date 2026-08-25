/**
 * Rulebook §8, group fights, and §10's loot distribution.
 *
 * This is the rule the whole boss maths assumes. §7.4's health bands were set against
 * a party rolling together, and until now every fight was one player against one
 * enemy - which is why over half of simulated games ran out the clock with a wounded
 * dragon still standing.
 */

import { describe, expect, it } from "vitest";
import {
  BASE_DICE,
  attack,
  canInvite,
  fighters,
  invitable,
  invite,
  inviteTargets,
  takeSpoil,
} from "../src/game/combat";
import { createInitialState } from "../src/game/setup";
import { endTurn } from "../src/game/turn";
import { moveRange, TURN_ORDER } from "../src/game/players";
import { EQUIPMENT, makeItem } from "../src/game/items";
import { distance, key } from "../src/game/hex";
import type { Combat, Enemy, GameState } from "../src/game/types";

/**
 * The knight fighting the given monster, with everybody else parked one tile away so
 * they are all inside a shout.
 */
function brawl(kind: Enemy["kind"], seed = 4471): GameState {
  const base = createInitialState(seed);
  const enemy = base.enemies.find((e) => e.kind === kind)!;
  const beside = [
    { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
    { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 },
  ].map((d) => ({ q: enemy.hex.q + d.q, r: enemy.hex.r + d.r }));

  const combat: Combat = {
    enemyId: enemy.id,
    playerId: "knight",
    allies: [],
    from: key(beside[0]),
    round: 0,
    playerRoll: null,
    toll: 0,
    spoils: [],
    picksLeft: 0,
    ambush: false,
    outcome: "ongoing",
  };

  return {
    ...base,
    activePlayerIndex: 0,
    phase: "combat",
    combat,
    players: base.players.map((p, i) => ({
      ...p,
      hex: i === 0 ? enemy.hex : beside[i % beside.length],
      health: 9,
      maxHealth: 9,
    })),
  };
}

describe("who may be shouted for", () => {
  it("keeps mobs solo, which is §8's own balance guard", () => {
    const mobs = brawl("mob");
    expect(invitable(mobs.enemies.find((e) => e.id === mobs.combat!.enemyId)!)).toBe(false);
    expect(inviteTargets(mobs)).toEqual([]);
    expect(canInvite(mobs)).toBe(false);
    // Without this the whole party clusters on every bandit and turn order stops
    // meaning anything - the rulebook says so in as many words.
    expect(invite(mobs, "rogue")).toBe(mobs);
  });

  it("opens the big ones up, thieves included", () => {
    for (const kind of ["midboss", "finalboss"] as const) {
      const state = brawl(kind);
      expect(canInvite(state)).toBe(true);
    }
  });

  it("reaches as far as the starter's own legs", () => {
    const state = brawl("finalboss");
    const enemy = state.enemies.find((e) => e.id === state.combat!.enemyId)!;
    const reach = moveRange(state.players[0]);
    for (const who of inviteTargets(state)) {
      expect(distance(who.hex, enemy.hex)).toBeLessThanOrEqual(reach);
    }

    // Park somebody out of earshot and they are not on the list.
    const far: GameState = {
      ...state,
      players: state.players.map((p) => (p.id === "rogue" ? { ...p, hex: { q: 0, r: -4 } } : p)),
    };
    expect(inviteTargets(far).map((p) => p.id)).not.toContain("rogue");
  });

  it("never lists the dead, the already-in, or somebody who fought this round", () => {
    const state = brawl("finalboss");
    const busy: GameState = {
      ...state,
      players: state.players.map((p) =>
        p.id === "rogue"
          ? { ...p, joinedFightThisRound: true }
          : p.id === "scout"
            ? { ...p, dead: true }
            : p,
      ),
    };
    const listed = inviteTargets(busy).map((p) => p.id);
    expect(listed).not.toContain("rogue");
    expect(listed).not.toContain("scout");
    expect(listed).not.toContain("knight");

    const joined = invite(state, "rogue");
    expect(inviteTargets(joined).map((p) => p.id)).not.toContain("rogue");
  });
});

describe("piling in", () => {
  it("moves them onto the tile and does not spend their turn", () => {
    const state = brawl("finalboss");
    const enemy = state.enemies.find((e) => e.id === state.combat!.enemyId)!;
    const before = state.players.find((p) => p.id === "rogue")!;
    expect(before.actedThisTurn).toBe(false);

    const after = invite(state, "rogue");
    const rogue = after.players.find((p) => p.id === "rogue")!;
    expect(key(rogue.hex)).toBe(key(enemy.hex));
    // §8 is explicit: they roll, but it is still their turn to spend afterwards.
    expect(rogue.actedThisTurn).toBe(false);
    expect(rogue.stepsTaken).toBe(before.stepsTaken);
    expect(rogue.joinedFightThisRound).toBe(true);
    expect(after.combat?.allies).toEqual(["rogue"]);
    expect(fighters(after).map((p) => p.id)).toEqual(["knight", "rogue"]);
  });

  it("clears the once-a-round guard when the round rolls over", () => {
    let state = invite(brawl("finalboss"), "rogue");
    state = { ...state, combat: null, phase: "playerMove" };
    expect(state.players.find((p) => p.id === "rogue")!.joinedFightThisRound).toBe(true);

    for (let i = 0; i < TURN_ORDER.length; i++) state = endTurn(state);
    expect(state.turn).toBeGreaterThan(1);
    expect(state.players.every((p) => !p.joinedFightThisRound)).toBe(true);
  });
});

describe("rolling together", () => {
  it("totals every participant's dice into one number", () => {
    const solo = attack(brawl("finalboss"));
    const group = attack(invite(invite(brawl("finalboss"), "rogue"), "scout"));

    expect(solo.combat?.playerRoll?.dice).toHaveLength(BASE_DICE);
    // Three fighters, three dice each, one total against the monster.
    expect(group.combat?.playerRoll?.dice).toHaveLength(BASE_DICE * 3);
    expect(group.combat?.playerRoll?.damage).toBeGreaterThan(0);
  });

  it("charges every participant a health for a failed roll", () => {
    const state = invite(invite(brawl("finalboss"), "rogue"), "scout");
    const before = fighters(state).map((p) => p.health);
    const after = attack(state);

    // The dragon has 20-30 health; three players cannot clear that in one roll, so
    // this is a failed roll and §8 says everybody pays for it.
    expect(after.combat?.outcome).toBe("ongoing");
    for (const [i, who] of fighters(after).entries()) {
      expect(who.health).toBe(before[i] - 1);
    }
  });

  it("hands the fight on when the starter falls but friends are still up", () => {
    const state = invite(brawl("finalboss"), "rogue");
    const frail: GameState = {
      ...state,
      players: state.players.map((p) => (p.id === "knight" ? { ...p, health: 1 } : p)),
    };
    const after = attack(frail);

    expect(after.players.find((p) => p.id === "knight")!.dead).toBe(true);
    // The party is standing right there. Ending the fight because one of them went
    // down would be the app overruling the table.
    expect(after.combat?.outcome).toBe("ongoing");
    expect(after.combat?.playerId).toBe("rogue");
    expect(after.combat?.allies).toEqual([]);
  });

  it("ends the fight only when everybody in it is down", () => {
    const state = invite(brawl("finalboss"), "rogue");
    const frail: GameState = {
      ...state,
      players: state.players.map((p) =>
        p.id === "knight" || p.id === "rogue" ? { ...p, health: 1 } : p,
      ),
    };
    expect(attack(frail).combat?.outcome).toBe("playerDown");
  });
});

describe("sharing out the loot", () => {
  /** A won fight with a known haul, and two people who fought for it. */
  function won(): GameState {
    const state = invite(brawl("midboss"), "rogue");
    const spoils = [
      makeItem(EQUIPMENT.find((e) => e.slot === "weapon")!, "prize-weapon"),
      makeItem(EQUIPMENT.find((e) => e.slot === "armor")!, "prize-armour"),
    ];
    return {
      ...state,
      combat: { ...state.combat!, outcome: "enemyDefeated", spoils, picksLeft: 2 },
    };
  }

  it("lets the starter keep a pick, exactly as it always did", () => {
    const after = takeSpoil(won(), "prize-weapon");
    expect(after.players.find((p) => p.id === "knight")!.weapon?.id).toBe("prize-weapon");
    expect(after.combat?.picksLeft).toBe(1);
  });

  it("lets the starter hand a pick to somebody who fought", () => {
    // §10, in as many words: keep them, or give them to any player in the fight.
    const after = takeSpoil(won(), "prize-armour", "rogue");
    expect(after.players.find((p) => p.id === "rogue")!.armor?.id).toBe("prize-armour");
    expect(after.players.find((p) => p.id === "knight")!.armor).toBeNull();
    expect(after.combat?.picksLeft).toBe(1);
    expect(after.log.at(-1)?.text).toContain("was handed");
  });

  it("gives nothing to somebody who was only watching", () => {
    const state = won();
    // The scout is standing right next to the fight and did not join it.
    expect(fighters(state).map((p) => p.id)).not.toContain("scout");
    expect(takeSpoil(state, "prize-weapon", "scout")).toBe(state);
  });

  it("pays the purse to everybody who swung", () => {
    const state = invite(brawl("midboss"), "rogue");
    const wounded: GameState = {
      ...state,
      enemies: state.enemies.map((e) =>
        e.id === state.combat!.enemyId ? { ...e, damageTaken: e.maxHealth - 1 } : e,
      ),
    };
    const before = Object.fromEntries(state.players.map((p) => [p.id, p.money]));
    const after = attack(wounded);
    expect(after.combat?.outcome).toBe("enemyDefeated");

    // Splitting $2 two ways is one argument and two disappointments.
    for (const id of ["knight", "rogue"]) {
      expect(after.players.find((p) => p.id === id)!.money).toBeGreaterThan(before[id]);
    }
    expect(after.players.find((p) => p.id === "doctor")!.money).toBe(before.doctor);
  });
});
