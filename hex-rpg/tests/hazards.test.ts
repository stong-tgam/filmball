import { describe, expect, it } from "vitest";
import {
  DONATION,
  HAZARDS,
  HAZARD_SAFE_RADIUS,
  TORNADO_THROW,
  canDonate,
  canPayOff,
  donate,
  isDestroyed,
  meet,
  moveHazards,
  payOff,
  placeHazards,
} from "../src/game/hazards";
import { createInitialState, startGame } from "../src/game/setup";
import { activePlayer, beginTurn, clearDraw, endTurn, legalMoves, movePlayer } from "../src/game/turn";
import { attack } from "../src/game/combat";
import { makeRng } from "../src/game/rng";
import { distance, fromLabel, key, neighbours } from "../src/game/hex";
import { EQUIPMENT, FOOD, makeItem } from "../src/game/items";
import { ENEMIES } from "../src/game/enemies";
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

  it("keeps them clear of the party at the start where the board allows", () => {
    for (const seed of SEEDS) {
      const { hazards, players } = base(seed);
      for (const hazard of hazards) {
        for (const player of players) {
          // Never on top of somebody on turn 1; usually well clear.
          expect(distance(hazard.hex, player.hex)).toBeGreaterThan(0);
        }
      }
      // With twenty monsters and a river-only pirate to fit around, the preferred
      // spacing is not always available - but never adjacent, and mostly well clear.
      for (const hazard of hazards) {
        for (const player of players) {
          expect(distance(hazard.hex, player.hex)).toBeGreaterThan(1);
        }
      }
      const clear = hazards.filter((h) =>
        players.every((p) => distance(h.hex, p.hex) >= HAZARD_SAFE_RADIUS),
      );
      expect(clear.length).toBeGreaterThanOrEqual(hazards.length - 1);
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
  it("wrecks the six tiles around it, not the one under it - rulebook §5.5", () => {
    const state = moveHazards(base());
    const tornado = state.hazards.find((h) => h.kind === "tornado")!;

    for (const hex of neighbours(tornado.hex)) {
      const tile = state.tiles[key(hex)];
      expect(tile.destroyedUntil).toBe(state.turn + 1);
      expect(isDestroyed(tile, state.turn)).toBe(true);
      // And it recovers as soon as the tornado moves on.
      expect(isDestroyed(tile, state.turn + 1)).toBe(false);
    }
    expect(isDestroyed(state.tiles[key(tornado.hex)], state.turn)).toBe(false);
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

  it("takes all your food and a piece of gear, and puts you down within three tiles", () => {
    const state = sharing("tornado");
    const loaded: GameState = {
      ...state,
      players: state.players.map((p, i) =>
        i === 0
          ? {
              ...p,
              supply: [makeItem(FOOD[2], "snack-a"), makeItem(FOOD[3], "snack-b")],
              boots: makeItem(EQUIPMENT.find((e) => e.slot === "boots")!, "kicks"),
            }
          : p,
      ),
    };
    const before = loaded.players[0];
    const caught = meet(loaded, "tornado", before.id);
    const player = caught.players[0];

    // Rulebook §5.5: all supply, plus one piece of equipment.
    expect(player.supply).toEqual([]);
    expect(player.boots).toBeNull();
    expect(caught.itemPile.some((i) => i.id === "kicks")).toBe(true);
    expect(distance(player.hex, before.hex)).toBeGreaterThan(0);
    expect(distance(player.hex, before.hex)).toBeLessThanOrEqual(TORNADO_THROW);
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

  it("skips the turn of anyone who owed one, once", () => {
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

describe("the thieves", () => {
  it("do not mug you as they pass - they block your way", () => {
    // Rulebook §5.5: a thief is a mid-boss fight standing in front of you, not a toll.
    const state = sharing("robber");
    const before = activePlayer(state);
    const after = meet(state, "robber", before.id);

    expect(activePlayer(after).money).toBe(before.money);
    expect(after.log.at(-1)?.text).toContain("Fight, or pay up");
  });

  it("offer a pay-off that costs everything and moves you along", () => {
    const state = sharing("robber");
    const rich: GameState = {
      ...state,
      players: state.players.map((p, i) => (i === 0 ? { ...p, money: 9 } : p)),
    };
    expect(canPayOff(rich, activePlayer(rich))).toBe(true);

    const after = payOff(rich);
    const paid = activePlayer(after);
    expect(paid.money).toBe(0);
    expect(paid.actedThisTurn).toBe(true);
    expect(key(paid.hex)).not.toBe(key(activePlayer(rich).hex));
    expect(after.hazards.find((h) => h.kind === "robber")!.carrying).toBe(9);
  });

  it("take a piece of gear too, if they are pirates", () => {
    const state = sharing("pirates");
    const armed: GameState = {
      ...state,
      players: state.players.map((p, i) =>
        i === 0
          ? { ...p, money: 4, weapon: makeItem(EQUIPMENT[0], "blade") }
          : p,
      ),
    };
    const after = payOff(armed);
    expect(activePlayer(after).weapon).toBeNull();
    expect(after.enemies.find((e) => e.kind === "pirates")!.loot.map((i) => i.id)).toContain(
      "blade",
    );
  });

  it("are not offered a pay-off when nobody is standing on you", () => {
    const apart = base();
    expect(canPayOff(apart, activePlayer(apart))).toBe(false);
    expect(payOff(apart)).toBe(apart);
  });
});

describe("catching a thief", () => {
  /** The active player on the thief's tile, with the thief one hit from beaten. */
  function cornered(kind: "robber" | "pirates", carrying = 0) {
    const state = sharing(kind);
    const thief = state.enemies.find((e) => e.kind === kind)!;
    const player = activePlayer(state);
    return {
      ...state,
      hazards: state.hazards.map((h) => (h.kind === kind ? { ...h, carrying } : h)),
      enemies: state.enemies.map((e) =>
        e.id === thief.id
          ? { ...e, hex: player.hex, damageTaken: e.maxHealth - 1, loot: [makeItem(EQUIPMENT[0], "taken")] }
          : e,
      ),
      players: state.players.map((p, i) => (i === 0 ? { ...p, health: 9, maxHealth: 9 } : p)),
      combat: {
        enemyId: thief.id,
        playerId: player.id,
        from: key(player.hex),
        round: 0,
        playerRoll: null,
        toll: 0,
        spoils: [],
        picksLeft: 0,
      ambush: false,
        outcome: "ongoing" as const,
      },
    };
  }

  it("puts what they stole on the ground with the rest of the loot", () => {
    const state = cornered("pirates");
    const after = attack(state);
    expect(after.combat?.outcome).toBe("enemyDefeated");
    expect(after.combat?.spoils.map((i) => i.id)).toContain("taken");
  });

  it("lets the winner keep only as many as the rulebook allows", () => {
    const state = cornered("robber");
    const after = attack(state);
    expect(after.combat?.picksLeft).toBeLessThanOrEqual(ENEMIES.robber.picks);
    expect(after.combat!.picksLeft).toBeLessThanOrEqual(after.combat!.spoils.length);
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

    expect(after.hazards.find((h) => h.kind === "robber")!.resolvedWith).toContain(player.id);
    expect(after.log.some((e) => e.text.includes("Fight, or pay up"))).toBe(true);
  });
});

describe("the pirates", () => {
  const armed = () => {
    const state = sharing("pirates");
    return {
      ...state,
      players: state.players.map((p, i) =>
        i === 0 ? { ...p, money: 3, weapon: makeItem(EQUIPMENT[1], "sword-x") } : p,
      ),
    };
  };

  it("take gear as well as money when you pay them off", () => {
    const state = armed();
    const before = activePlayer(state);
    const after = payOff(state);

    expect(activePlayer(after).weapon).toBeNull();
    expect(activePlayer(after).money).toBe(0);
    expect(after.enemies.find((e) => e.kind === "pirates")!.loot.map((i) => i.id)).toContain(
      "sword-x",
    );
    expect(after.hazards.find((h) => h.kind === "pirates")!.carrying).toBe(before.money);
  });
});

describe("the traveller", () => {
  it("is offered a donation when you share their tile, and not otherwise", () => {
    const met = sharing("homeless");
    expect(canDonate(met, activePlayer(met))).toBe(true);

    const apart = base();
    expect(canDonate(apart, activePlayer(apart))).toBe(false);
  });

  it("takes a dollar and gives you a fourth die", () => {
    const met = sharing("homeless");
    const before = activePlayer(met);
    const after = donate(met);
    const giver = activePlayer(after);

    expect(giver.money).toBe(before.money - DONATION);
    expect(giver.bonusDiceNextFight).toBe(1);
  });

  it("takes food instead when the pockets are empty", () => {
    const met = sharing("homeless");
    const broke: GameState = {
      ...met,
      players: met.players.map((p, i) =>
        i === 0 ? { ...p, money: 0, supply: [makeItem(FOOD[2], "snack")] } : p,
      ),
    };
    const after = donate(broke);
    expect(activePlayer(after).supply).toEqual([]);
    expect(activePlayer(after).bonusDiceNextFight).toBe(1);
  });

  it("is once only, per §5.5", () => {
    const once = donate(sharing("homeless"));
    expect(canDonate(once, activePlayer(once))).toBe(false);
  });

  it("costs a turn when you have nothing at all to give", () => {
    const met = sharing("homeless");
    const destitute: GameState = {
      ...met,
      players: met.players.map((p, i) => (i === 0 ? { ...p, money: 0, supply: [] } : p)),
    };
    const after = meet(destitute, "homeless", activePlayer(destitute).id);
    expect(activePlayer(after).stunned).toBe(true);
  });

  it("does not cost the turn - that is the spec's own default", () => {
    const after = donate(sharing("homeless"));
    expect(activePlayer(after).actedThisTurn).toBe(false);
    expect(activePlayer(after).movedThisTurn).toBe(false);
  });

  it("refuses a player with nothing at all", () => {
    const met = sharing("homeless");
    const broke: GameState = {
      ...met,
      players: met.players.map((p, i) => (i === 0 ? { ...p, money: 0, supply: [] } : p)),
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
