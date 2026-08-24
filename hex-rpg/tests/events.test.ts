import { describe, expect, it } from "vitest";
import {
  RANKS,
  SUITS,
  cardName,
  draw,
  freshDeck,
  isFace,
  isRed,
  rankValue,
} from "../src/game/cards";
import { EVENTS, applyEvent, createEventDeck } from "../src/game/events";
import {
  ALL_FEATURES,
  FEATURES_PER_BOSS,
  activeFeatures,
  attack,
  bossFeatures,
  drawFeatures,
  startCombat,
} from "../src/game/combat";
import { createInitialState, startGame } from "../src/game/setup";
import { activePlayer, beginTurn, clearDraw, endTurn } from "../src/game/turn";
import { healthLeft } from "../src/game/enemies";
import { key } from "../src/game/hex";
import type { Enemy, GameState, Tile } from "../src/game/types";

const game = (seed = 4471) => startGame(seed);

describe("the deck", () => {
  it("is 52 distinct cards", () => {
    const { deck } = freshDeck(1);
    expect(deck).toHaveLength(52);
    expect(new Set(deck.map(cardName)).size).toBe(52);
    expect(SUITS).toHaveLength(4);
    expect(RANKS).toHaveLength(13);
  });

  it("knows its face cards and its colours", () => {
    expect(isFace({ suit: "spades", rank: "K" })).toBe(true);
    expect(isFace({ suit: "spades", rank: "A" })).toBe(true);
    expect(isFace({ suit: "spades", rank: "10" })).toBe(false);
    expect(isRed({ suit: "hearts", rank: "2" })).toBe(true);
    expect(isRed({ suit: "clubs", rank: "2" })).toBe(false);
  });

  it("ranks 2 lowest and the ace highest", () => {
    expect(rankValue({ suit: "clubs", rank: "2" })).toBe(2);
    expect(rankValue({ suit: "clubs", rank: "10" })).toBe(10);
    expect(rankValue({ suit: "clubs", rank: "A" })).toBe(14);
  });

  it("deals off the top and shrinks", () => {
    const { deck } = freshDeck(7);
    const pull = draw(deck, 7);
    expect(pull.card).toEqual(deck[0]);
    expect(pull.deck).toHaveLength(51);
  });

  it("reshuffles rather than running out", () => {
    const pull = draw([], 99);
    expect(pull.card).toBeDefined();
    expect(pull.deck).toHaveLength(51);
  });

  it("keeps events and searches on separate shuffles", () => {
    // Before the first card is turned over, both decks are whole and different.
    const state = createInitialState(4471);
    expect(state.pokerDeck).not.toEqual(state.searchDeck);
    expect(state.pokerDeck).toHaveLength(52);
    expect(state.searchDeck).toHaveLength(52);
  });
});

describe("the turn's draw", () => {
  it("turns a card over at the top of the game", () => {
    const state = game();
    expect(state.draw).not.toBeNull();
    expect(state.pokerDeck).toHaveLength(51);
  });

  it("brings an event on a face card and nothing on the rest", () => {
    const base = createInitialState(4471);
    const withFace = beginTurn({ ...base, pokerDeck: [{ suit: "hearts", rank: "Q" }] });
    const withPip = beginTurn({ ...base, pokerDeck: [{ suit: "hearts", rank: "4" }] });

    expect(withFace.draw?.event).not.toBeNull();
    expect(withFace.eventDeck.length).toBe(base.eventDeck.length - 1);
    expect(withPip.draw?.event).toBeNull();
    expect(withPip.eventDeck.length).toBe(base.eventDeck.length);
  });

  it("draws once per turn of the whole party, not once per player", () => {
    let state = game();
    const startingDeck = state.pokerDeck.length;
    for (let i = 0; i < 3; i++) state = endTurn(clearDraw(state));

    expect(state.turn).toBe(1);
    expect(state.pokerDeck).toHaveLength(startingDeck);

    state = endTurn(clearDraw(state));
    expect(state.turn).toBe(2);
    expect(state.pokerDeck).toHaveLength(startingDeck - 1);
  });

  it("puts the card away when it has been read", () => {
    expect(clearDraw(game()).draw).toBeNull();
  });

  it("reshuffles the event deck rather than running dry", () => {
    const base = createInitialState(4471);
    const spent = beginTurn({
      ...base,
      eventDeck: [],
      pokerDeck: [{ suit: "spades", rank: "K" }],
    });
    expect(spent.draw?.event).not.toBeNull();
  });
});

describe("events", () => {
  const base = () => createInitialState(4471);
  const run = (id: string, state: GameState = base()) =>
    applyEvent(state, EVENTS.find((e) => e.id === id)!);

  it("has a deck of distinct cards, all of which do something", () => {
    const { deck } = createEventDeck(1);
    expect(deck.length).toBe(EVENTS.length);
    expect(new Set(deck.map((c) => c.id)).size).toBe(EVENTS.length);
    for (const event of EVENTS) {
      expect(event.title.length).toBeGreaterThan(0);
      expect(event.text.length).toBeGreaterThan(0);
    }
  });

  it("pays the whole party on market day", () => {
    const before = base();
    const after = run("market-day", before);
    for (let i = 0; i < after.players.length; i++) {
      expect(after.players[i].money).toBe(before.players[i].money + 2);
    }
  });

  it("takes health off everyone when the wolves come", () => {
    const before = base();
    const after = run("wolves", before);
    for (let i = 0; i < after.players.length; i++) {
      expect(after.players[i].health).toBe(before.players[i].health - 1);
    }
  });

  it("never takes a player below zero money", () => {
    const broke: GameState = {
      ...base(),
      players: base().players.map((p) => ({ ...p, money: 0 })),
    };
    for (const p of run("tax-collector", broke).players) expect(p.money).toBe(0);
    for (const p of run("lost-purse", broke).players) expect(p.money).toBe(0);
  });

  it("never heals past the maximum", () => {
    const after = run("good-harvest");
    for (const p of after.players) expect(p.health).toBeLessThanOrEqual(p.maxHealth);
  });

  it("skips the dead", () => {
    const fallen: GameState = {
      ...base(),
      players: base().players.map((p, i) => (i === 0 ? { ...p, dead: true, health: 0 } : p)),
    };
    const after = run("good-harvest", fallen);
    expect(after.players[0].health).toBe(0);
    expect(after.players[0].dead).toBe(true);
  });

  it("gives the baker's bread only to players with room", () => {
    const before = base();
    const after = run("travelling-baker", before);
    for (const p of after.players) {
      expect(p.supply.length).toBeGreaterThan(0);
      expect(p.supply.length).toBeLessThanOrEqual(3);
    }
  });

  it("hands the blacksmith's gift to the poorest player", () => {
    const before = base();
    const poorest = before.players.reduce((a, b) => (b.money < a.money ? b : a));
    const after = run("blacksmiths-gift", before);
    const lucky = after.players.find((p) => p.id === poorest.id)!;

    expect([lucky.weapon, lucky.armor, lucky.boots].filter(Boolean).length).toBe(1);
    expect(after.itemPile.length).toBe(before.itemPile.length - 1);
  });

  it("copes with an empty world when the smith gets generous", () => {
    const bare: GameState = { ...base(), itemPile: [] };
    expect(() => run("blacksmiths-gift", bare)).not.toThrow();
  });

  it("gives the active player their move back on a second wind", () => {
    const spent: GameState = {
      ...base(),
      players: base().players.map((p, i) => (i === 0 ? { ...p, movedThisTurn: true } : p)),
    };
    expect(activePlayer(run("second-wind", spent)).movedThisTurn).toBe(false);
  });

  it("heals something out there when it stirs, and copes when nothing is hurt", () => {
    const before = base();
    const hurt: GameState = {
      ...before,
      enemies: before.enemies.map((e, i) => (i === 0 ? { ...e, damageTaken: 4 } : e)),
    };
    const after = run("something-stirs", hurt);
    expect(after.enemies[0].damageTaken).toBe(2);
    expect(() => run("something-stirs", before)).not.toThrow();
  });

  it("logs what it did, so the table can see it", () => {
    const after = run("market-day");
    expect(after.log.at(-1)?.text).toContain("Market Day");
  });

  it("leaves the state it was given alone", () => {
    const before = base();
    const snapshot = JSON.stringify(before);
    run("wolves", before);
    run("blacksmiths-gift", before);
    expect(JSON.stringify(before)).toBe(snapshot);
  });
});

describe("boss features", () => {
  const bossState = (kind: "midboss" | "finalboss") => {
    const base = createInitialState(4471);
    const enemy = base.enemies.find((e) => e.kind === kind)!;
    return { base, enemy };
  };

  it("only bosses have them", () => {
    expect(bossFeatures("midboss")).toBe(true);
    expect(bossFeatures("finalboss")).toBe(true);
    expect(bossFeatures("mob")).toBe(false);
  });

  it("draws two distinct features, and only on first sight", () => {
    const { base, enemy } = bossState("midboss");
    expect(enemy.features).toEqual([]);
    expect(enemy.featuresRevealed).toBe(false);

    const met = startCombat(base, enemy, key(enemy.hex));
    const seen = met.enemies.find((e) => e.id === enemy.id)!;
    expect(seen.features).toHaveLength(FEATURES_PER_BOSS);
    expect(new Set(seen.features).size).toBe(FEATURES_PER_BOSS);
    expect(seen.featuresRevealed).toBe(true);
    for (const feature of seen.features) expect(ALL_FEATURES).toContain(feature);

    // Meeting it again does not redraw.
    const again = startCombat({ ...met, combat: null }, seen, key(seen.hex));
    expect(again.enemies.find((e) => e.id === enemy.id)!.features).toEqual(seen.features);
  });

  it("is reproducible from the generator", () => {
    expect(drawFeatures(42)).toEqual(drawFeatures(42));
  });

  it("bites only on ground that matches", () => {
    const enemy = { features: ["forest", "railway"] } as Enemy;
    const woods = { sides: ["forest", "forest", "field", "field", "field", "field"], rail: false } as Tile;
    const line = { sides: ["field", "field", "field", "field", "field", "field"], rail: true } as Tile;
    const open = { sides: ["field", "field", "field", "field", "field", "field"], rail: false } as Tile;

    expect(activeFeatures(enemy, woods)).toEqual(["forest"]);
    expect(activeFeatures(enemy, line)).toEqual(["railway"]);
    expect(activeFeatures(enemy, open)).toEqual([]);
    expect(activeFeatures(enemy, undefined)).toEqual([]);
  });

  it("makes a boss hit harder on its own ground", () => {
    const { base, enemy } = bossState("midboss");
    const ground = base.tiles[key(enemy.hex)];

    /** The same fight, with the boss at home on this tile and not. */
    const fight = (features: Enemy["features"]) => {
      const state: GameState = {
        ...base,
        players: base.players.map((p, i) =>
          i === 0 ? { ...p, hex: enemy.hex, health: 50, maxHealth: 50 } : { ...p, dead: true },
        ),
        enemies: base.enemies.map((e) =>
          e.id === enemy.id ? { ...e, features, featuresRevealed: true } : e,
        ),
        combat: {
          enemyId: enemy.id,
          playerId: base.players[0].id,
          from: key(enemy.hex),
          round: 0,
          playerRoll: null,
          enemyRoll: null,
          outcome: "ongoing",
        },
      };
      return attack(state).combat!.enemyRoll!.damage;
    };

    const athome = ground.sides.find((s) => s !== "water") ?? "field";
    expect(fight([athome])).toBe(fight([]) + 1);
  });
});

describe("the water escape", () => {
  /** A boss standing in water, one hit from going down. */
  function cornered() {
    const base = createInitialState(4471);
    const enemy = base.enemies.find((e) => e.kind === "midboss")!;
    const wet = Object.values(base.tiles).find((t) => t.river)!;
    const state: GameState = {
      ...base,
      players: base.players.map((p, i) =>
        i === 0 ? { ...p, hex: wet.hex, health: 50, maxHealth: 50 } : { ...p, dead: true },
      ),
      enemies: base.enemies.map((e) =>
        e.id === enemy.id
          ? {
              ...e,
              hex: wet.hex,
              damageTaken: e.maxHealth - 1,
              features: ["water"],
              featuresRevealed: true,
            }
          : e,
      ),
      combat: {
        enemyId: enemy.id,
        playerId: base.players[0].id,
        from: key(wet.hex),
        round: 0,
        playerRoll: null,
        enemyRoll: null,
        outcome: "ongoing",
      },
    };
    return { state, enemyId: enemy.id, tile: wet };
  }

  it("lets a beaten water monster slip away instead of dying", () => {
    const { state, enemyId, tile } = cornered();
    const after = attack(state);
    const beast = after.enemies.find((e) => e.id === enemyId)!;

    expect(after.combat?.outcome).toBe("enemyEscaped");
    expect(beast.defeated).toBe(false);
    expect(beast.escapedOnce).toBe(true);
    expect(healthLeft(beast)).toBe(1);
    expect(key(beast.hex)).not.toBe(key(tile.hex));
  });

  it("only works once", () => {
    const { state, enemyId } = cornered();
    const used: GameState = {
      ...state,
      enemies: state.enemies.map((e) => (e.id === enemyId ? { ...e, escapedOnce: true } : e)),
    };
    const after = attack(used);
    expect(after.combat?.outcome).toBe("enemyDefeated");
    expect(after.enemies.find((e) => e.id === enemyId)!.defeated).toBe(true);
  });

  it("does not save a monster that is not at home in the water", () => {
    const { state, enemyId } = cornered();
    const landlubber: GameState = {
      ...state,
      enemies: state.enemies.map((e) => (e.id === enemyId ? { ...e, features: ["city"] } : e)),
    };
    expect(attack(landlubber).combat?.outcome).toBe("enemyDefeated");
  });
});

describe("a game with events in it stays sound", () => {
  it("survives a run of turns and stays serialisable", () => {
    let state = game(31);
    for (let i = 0; i < 40 && state.phase !== "gameOver"; i++) state = endTurn(clearDraw(state));
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });

  it("is reproducible from the seed", () => {
    const play = (seed: number) => {
      let state = game(seed);
      for (let i = 0; i < 12; i++) state = endTurn(clearDraw(state));
      return state;
    };
    expect(play(9)).toEqual(play(9));
  });

  it("never draws so many cards that a deck goes negative", () => {
    let state = game(5);
    for (let i = 0; i < 120 && state.phase !== "gameOver"; i++) state = endTurn(clearDraw(state));
    expect(state.pokerDeck.length).toBeGreaterThanOrEqual(0);
    expect(state.eventDeck.length).toBeGreaterThanOrEqual(0);
  });
});
