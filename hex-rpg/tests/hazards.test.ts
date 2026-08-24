import { describe, expect, it } from "vitest";
import {
  DONATION,
  HAZARDS,
  HAZARD_SAFE_RADIUS,
  ROBBERY,
  canDonate,
  donate,
  hazardAt,
  isDestroyed,
  meet,
  moveHazards,
  placeHazards,
} from "../src/game/hazards";
import { createInitialState, startGame } from "../src/game/setup";
import { activePlayer, beginTurn, clearDraw, endTurn, legalMoves, movePlayer } from "../src/game/turn";
import { attack } from "../src/game/combat";
import { makeRng } from "../src/game/rng";
import { distance, fromLabel, key, neighbours } from "../src/game/hex";
import { makeItem } from "../src/game/items";
import { EQUIPMENT } from "../src/game/items";
import type { GameState, HazardKind } from "../src/game/types";

const SEEDS = [1, 7, 42, 4471, 90210];
const base = (seed = 4471) => createInitialState(seed);

/** Put a hazard on the active player's tile, with nothing resolved yet. */
function sharing(kind: HazardKind, state = base()): GameState {
  const player = activePlayer(state);
  return {
    ...state,
    hazards: state.hazards.map((h) =>
      h.kind === kind ? { ...h, hex: player.hex, resolvedWith: [] } : h,
    ),
  };
}

describe("placing hazards", () => {
  it("puts all four out, one to a tile", () => {
    for (const seed of SEEDS) {
      const { hazards } = base(seed);
      expect(hazards).toHaveLength(4);
      expect(new Set(hazards.map((h) => h.kind)).size).toBe(4);
      expect(new Set(hazards.map((h) => key(h.hex))).size).toBe(4);
    }
  });

  it("keeps them well clear of the party at the start", () => {
    for (const seed of SEEDS) {
      const { hazards, players } = base(seed);
      for (const hazard of hazards) {
        for (const player of players) {
          expect(distance(hazard.hex, player.hex)).toBeGreaterThanOrEqual(HAZARD_SAFE_RADIUS);
        }
      }
    }
  });

  it("keeps them off tiles a monster already holds", () => {
    for (const seed of SEEDS) {
      const state = base(seed);
      const monsters = state.enemies.filter((e) => e.kind !== "robber" && e.kind !== "pirates");
      const monsterTiles = new Set(monsters.map((e) => key(e.hex)));
      for (const hazard of state.hazards) expect(monsterTiles.has(key(hazard.hex))).toBe(false);
    }
  });

  it("starts the pirates on the water", () => {
    for (const seed of SEEDS) {
      const state = base(seed);
      const pirates = state.hazards.find((h) => h.kind === "pirates")!;
      expect(state.tiles[key(pirates.hex)].river).toBe(true);
    }
  });

  it("gives the thieves a fightable record on the same tile", () => {
    for (const seed of SEEDS) {
      const state = base(seed);
      for (const kind of ["robber", "pirates"] as const) {
        const hazard = state.hazards.find((h) => h.kind === kind)!;
        const enemy = state.enemies.find((e) => e.kind === kind)!;
        expect(key(enemy.hex)).toBe(key(hazard.hex));
      }
    }
  });

  it("is reproducible from the seed", () => {
    const { players, tiles } = base();
    expect(placeHazards(makeRng(3), players, tiles)).toEqual(
      placeHazards(makeRng(3), players, tiles),
    );
  });
});

describe("hazards moving", () => {
  it("steps each one a single tile", () => {
    const before = base();
    const after = moveHazards(before);
    for (const hazard of after.hazards) {
      const was = before.hazards.find((h) => h.kind === hazard.kind)!;
      expect(distance(was.hex, hazard.hex)).toBeLessThanOrEqual(1);
    }
  });

  it("keeps the pirates on the river when there is river to take", () => {
    for (let seed = 1; seed <= 20; seed++) {
      let state = base(seed);
      for (let i = 0; i < 6; i++) {
        const before = state.hazards.find((h) => h.kind === "pirates")!;
        const hadWater = neighbours(before.hex).some((h) => state.tiles[key(h)]?.river);
        state = moveHazards(state);
        const after = state.hazards.find((h) => h.kind === "pirates")!;
        if (hadWater) expect(state.tiles[key(after.hex)].river).toBe(true);
      }
    }
  });

  it("drags a thief's fightable record along with it", () => {
    let state = base();
    for (let i = 0; i < 8; i++) {
      state = moveHazards(state);
      for (const kind of ["robber", "pirates"] as const) {
        const hazard = state.hazards.find((h) => h.kind === kind);
        const enemy = state.enemies.find((e) => e.kind === kind)!;
        if (hazard) expect(key(enemy.hex)).toBe(key(hazard.hex));
      }
    }
  });

  it("wipes the slate on moving, so the same player can be met again", () => {
    const met = { ...base() };
    const marked: GameState = {
      ...met,
      hazards: met.hazards.map((h) => ({ ...h, resolvedWith: ["knight"] })),
    };
    for (const hazard of moveHazards(marked).hazards) {
      expect(hazard.resolvedWith.length).toBeLessThanOrEqual(1);
    }
  });

  it("takes a beaten thief off the board for good", () => {
    const state = base();
    const beaten: GameState = {
      ...state,
      enemies: state.enemies.map((e) => (e.kind === "robber" ? { ...e, defeated: true } : e)),
    };
    const after = moveHazards(beaten);
    expect(after.hazards.some((h) => h.kind === "robber")).toBe(false);
    expect(after.hazards).toHaveLength(3);
  });

  it("moves before the card is drawn", () => {
    const before = base();
    const after = beginTurn(before);
    const moved = after.hazards.some((h) => {
      const was = before.hazards.find((x) => x.kind === h.kind)!;
      return key(was.hex) !== key(h.hex);
    });
    expect(moved).toBe(true);
    expect(after.draw).not.toBeNull();
  });
});

describe("the tornado", () => {
  it("wrecks the ground it lands on, and the ground recovers when it moves on", () => {
    const state = moveHazards(base());
    const tornado = state.hazards.find((h) => h.kind === "tornado")!;
    const wrecked = state.tiles[key(tornado.hex)];

    expect(wrecked.destroyedUntil).toBe(state.turn + 1);
    expect(isDestroyed(wrecked, state.turn)).toBe(true);
    expect(isDestroyed(wrecked, state.turn + 1)).toBe(false);
  });

  it("makes wrecked ground impassable", () => {
    const state = base();
    const player = activePlayer(state);
    const next = neighbours(player.hex)[0];
    const blocked: GameState = {
      ...state,
      tiles: {
        ...state.tiles,
        [key(next)]: { ...state.tiles[key(next)], destroyedUntil: state.turn + 1 },
      },
    };
    expect(legalMoves(blocked, player).has(key(next))).toBe(false);
  });

  it("throws a player clear and costs them their next turn", () => {
    const caught = meet(sharing("tornado"), "tornado", activePlayer(base()).id);
    const player = caught.players[caught.activePlayerIndex];
    const tornado = caught.hazards.find((h) => h.kind === "tornado")!;

    expect(player.stunned).toBe(true);
    expect(key(player.hex)).not.toBe(key(tornado.hex));
    expect(distance(player.hex, tornado.hex)).toBe(1);
  });

  it("leaves monsters where they are", () => {
    const state = base();
    const before = state.enemies.map((e) => key(e.hex));
    const after = moveHazards(state);
    const monsters = after.enemies.filter((e) => e.kind !== "robber" && e.kind !== "pirates");
    for (const monster of monsters) {
      expect(before).toContain(key(monster.hex));
    }
  });

  it("skips a flattened player's turn, once", () => {
    const state = startGame(4471);
    const flattened: GameState = {
      ...state,
      players: state.players.map((p, i) => (i === 1 ? { ...p, stunned: true } : p)),
    };
    const after = endTurn(clearDraw(flattened));

    expect(activePlayer(after).id).toBe(state.players[2].id);
    expect(after.players[1].stunned).toBe(false);
    expect(after.log.some((e) => e.text.includes("picking themselves up"))).toBe(true);
  });
});

describe("the robber", () => {
  it("takes coins and carries them", () => {
    const state = sharing("robber");
    const before = activePlayer(state);
    const after = meet(state, "robber", before.id);
    const robbed = activePlayer(after);

    expect(robbed.money).toBe(before.money - ROBBERY);
    expect(hazardAt(after.hazards, key(robbed.hex))?.carrying).toBe(ROBBERY);
  });

  it("takes what it can when the pockets are nearly empty", () => {
    const state = sharing("robber");
    const poor: GameState = {
      ...state,
      players: state.players.map((p, i) => (i === 0 ? { ...p, money: 1 } : p)),
    };
    const after = meet(poor, "robber", activePlayer(poor).id);
    expect(activePlayer(after).money).toBe(0);
    expect(after.hazards.find((h) => h.kind === "robber")!.carrying).toBe(1);
  });

  it("does not rob the same player twice on one tile", () => {
    const state = sharing("robber");
    const once = meet(state, "robber", activePlayer(state).id);
    const twice = meet(once, "robber", activePlayer(once).id);
    expect(activePlayer(twice).money).toBe(activePlayer(once).money);
  });
});

describe("catching a thief", () => {
  /** The active player on the robber's tile, with the robber one hit from beaten. */
  function cornered(carrying: number) {
    const state = sharing("robber");
    const robber = state.enemies.find((e) => e.kind === "robber")!;
    const player = activePlayer(state);
    return {
      ...state,
      hazards: state.hazards.map((h) => (h.kind === "robber" ? { ...h, carrying } : h)),
      enemies: state.enemies.map((e) =>
        e.id === robber.id ? { ...e, hex: player.hex, damageTaken: e.maxHealth - 1 } : e,
      ),
      combat: {
        enemyId: robber.id,
        playerId: player.id,
        from: key(player.hex),
        round: 0,
        playerRoll: null,
        enemyRoll: null,
        outcome: "ongoing" as const,
      },
    };
  }

  it("hands back everything it stole", () => {
    const state = cornered(7);
    const before = activePlayer(state);
    const after = attack(state);

    expect(after.combat?.outcome).toBe("enemyDefeated");
    expect(activePlayer(after).money).toBe(before.money + 7);
    expect(after.hazards.find((h) => h.kind === "robber")!.carrying).toBe(0);
  });

  it("hands back the gear the pirates took, as loot to pick up", () => {
    const state = sharing("pirates");
    const player = activePlayer(state);
    const pirates = state.enemies.find((e) => e.kind === "pirates")!;
    const stolen = makeItem(EQUIPMENT[1], "taken-sword");
    const fight: GameState = {
      ...state,
      enemies: state.enemies.map((e) =>
        e.id === pirates.id
          ? { ...e, hex: player.hex, damageTaken: e.maxHealth - 1, loot: [stolen] }
          : e,
      ),
      combat: {
        enemyId: pirates.id,
        playerId: player.id,
        from: key(player.hex),
        round: 0,
        playerRoll: null,
        enemyRoll: null,
        outcome: "ongoing",
      },
    };
    const after = attack(fight);
    expect(after.enemies.find((e) => e.id === pirates.id)!.loot.map((i) => i.id)).toContain(
      "taken-sword",
    );
  });
});

describe("walking into a hazard", () => {
  it("sets it off, the same as it walking into you", () => {
    const state = base();
    const player = activePlayer(state);
    const target = [...legalMoves(state, player).keys()][0];
    const waiting: GameState = {
      ...state,
      hazards: state.hazards.map((h) =>
        h.kind === "robber" ? { ...h, hex: fromLabel(target)!, resolvedWith: [] } : h,
      ),
      // Keep the robber's fightable twin out of the way so this is purely the hazard.
      enemies: state.enemies.filter((e) => e.kind !== "robber"),
    };
    const after = movePlayer(waiting, target);

    expect(activePlayer(after).money).toBe(player.money - ROBBERY);
    expect(after.hazards.find((h) => h.kind === "robber")!.resolvedWith).toContain(player.id);
  });
});

describe("the pirates", () => {
  const armed = () => {
    const state = sharing("pirates");
    return {
      ...state,
      players: state.players.map((p, i) =>
        i === 0 ? { ...p, weapon: makeItem(EQUIPMENT[1], "sword-x") } : p,
      ),
    };
  };

  it("take gear rather than coins, and keep it", () => {
    const state = armed();
    const before = activePlayer(state);
    const after = meet(state, "pirates", before.id);

    expect(activePlayer(after).weapon).toBeNull();
    expect(activePlayer(after).money).toBe(before.money);
    expect(after.enemies.find((e) => e.kind === "pirates")!.loot.map((i) => i.id)).toContain(
      "sword-x",
    );
  });

  it("shrug at a player with nothing worth taking", () => {
    const state = sharing("pirates");
    const bare: GameState = {
      ...state,
      players: state.players.map((p, i) =>
        i === 0 ? { ...p, weapon: null, armor: null, boots: null } : p,
      ),
    };
    const after = meet(bare, "pirates", activePlayer(bare).id);
    expect(after.enemies.find((e) => e.kind === "pirates")!.loot).toEqual([]);
  });
});

describe("the traveller", () => {
  it("is offered a donation when you share their tile, and not otherwise", () => {
    const met = sharing("homeless");
    expect(canDonate(met, activePlayer(met))).toBe(true);

    const apart = base();
    expect(canDonate(apart, activePlayer(apart))).toBe(false);
  });

  it("takes the money and gives you a die", () => {
    const met = sharing("homeless");
    const before = activePlayer(met);
    const after = donate(met);
    const giver = activePlayer(after);

    expect(giver.money).toBe(before.money - DONATION);
    expect(giver.bonusDiceNextFight).toBe(before.bonusDiceNextFight + 1);
  });

  it("does not cost the turn - that is the spec's own default", () => {
    const after = donate(sharing("homeless"));
    expect(activePlayer(after).actedThisTurn).toBe(false);
    expect(activePlayer(after).movedThisTurn).toBe(false);
  });

  it("refuses a player who cannot afford it", () => {
    const met = sharing("homeless");
    const broke: GameState = {
      ...met,
      players: met.players.map((p, i) => (i === 0 ? { ...p, money: 0 } : p)),
    };
    expect(canDonate(broke, activePlayer(broke))).toBe(false);
    expect(donate(broke)).toBe(broke);
  });
});

describe("every hazard has a face", () => {
  it("names and draws all four", () => {
    for (const kind of ["tornado", "homeless", "robber", "pirates"] as HazardKind[]) {
      const look = HAZARDS[kind];
      expect(look.name.length).toBeGreaterThan(0);
      expect(look.blurb.length).toBeGreaterThan(0);
      expect(look.glyph.length).toBeGreaterThan(0);
    }
  });
});

describe("a game with hazards in it stays sound", () => {
  it("plays out without breaking, and stays serialisable", () => {
    let state = startGame(17);
    for (let i = 0; i < 60 && state.phase !== "gameOver"; i++) state = endTurn(clearDraw(state));
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });

  it("keeps every hazard on the board through a long game", () => {
    let state = startGame(23);
    for (let i = 0; i < 60 && state.phase !== "gameOver"; i++) {
      state = endTurn(clearDraw(state));
      for (const hazard of state.hazards) {
        expect(state.tiles[key(hazard.hex)]).toBeDefined();
      }
    }
  });

  it("is reproducible from the seed", () => {
    const play = (seed: number) => {
      let state = startGame(seed);
      for (let i = 0; i < 20; i++) state = endTurn(clearDraw(state));
      return state;
    };
    expect(play(4)).toEqual(play(4));
  });

  it("never leaves a player stuck with nowhere to go", () => {
    let state = startGame(29);
    for (let i = 0; i < 40 && state.phase !== "gameOver"; i++) {
      const player = activePlayer(state);
      if (!player.dead) {
        // Either somewhere to move, or standing on something to do.
        const stuck = legalMoves(state, player).size === 0;
        if (stuck) expect(state.tiles[key(player.hex)]).toBeDefined();
      }
      state = endTurn(clearDraw(state));
    }
  });
});
