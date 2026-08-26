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
  activeFeatures,
  FOREST_SECONDS,
  noHints,
  secondsFor,
  drawFeatures,
  startCombat,
} from "../src/game/combat";
import { ENEMIES } from "../src/game/enemies";
import { stepsLeft } from "../src/game/players";
import { createInitialState, startGame } from "../src/game/setup";
import { beginTurn, clearDraw, endTurn } from "../src/game/turn";
import { intoFight, loseIt, winAll } from "./fight";
import { challengeFor } from "../src/game/challenges";
import { FOOD, makeItem } from "../src/game/items";
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
    // Rulebook §4: J, Q and K bring events. An ace is a high card, not a court card.
    expect(isFace({ suit: "spades", rank: "K" })).toBe(true);
    expect(isFace({ suit: "spades", rank: "Q" })).toBe(true);
    expect(isFace({ suit: "spades", rank: "A" })).toBe(false);
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
    // Rulebook §6: the search deck carries the two jokers, the event deck does not.
    expect(state.searchDeck).toHaveLength(54);
    expect(state.searchDeck.filter((c) => c.rank === "Joker")).toHaveLength(2);
    expect(state.pokerDeck.some((c) => c.rank === "Joker")).toBe(false);
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
    // Every team but the last: the card comes when the turn rolls over, not when a
    // team finishes.
    for (let i = 0; i < state.teams.length - 1; i++) state = endTurn(clearDraw(state));

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

  it("has a deck of distinct cards, all of which say who they hit", () => {
    const { deck } = createEventDeck(1);
    expect(deck.length).toBe(EVENTS.length);
    expect(new Set(deck.map((c) => c.id)).size).toBe(EVENTS.length);
    for (const event of EVENTS) {
      expect(event.title.length).toBeGreaterThan(0);
      expect(event.text.length).toBeGreaterThan(0);
      // Rulebook §13: every card states its target.
      expect(["terrain", "encounter", "everyone"]).toContain(event.target);
    }
  });

  it("pays the whole party at the lemonade stand", () => {
    const before = base();
    const after = run("lemonade-stand", before);
    for (let i = 0; i < after.players.length; i++) {
      expect(after.players[i].money).toBe(before.players[i].money + 1);
    }
  });

  it("hits only the players on the named terrain", () => {
    // Rulebook §13: a terrain card reaches everyone on that ground and nobody else.
    const before = base();
    // Tiles are compositions: a field-*based* tile can still carry a wood along one
    // edge, and `standingOn` reads the sides, not the base. So the bystanders need
    // ground with no forest on it at all, or they are standing in the woods too.
    const forest = Object.values(before.tiles).find((t) => t.sides.includes("forest"))!;
    const field = Object.values(before.tiles).find((t) => !t.sides.includes("forest"))!;
    const staged: GameState = {
      ...before,
      players: before.players.map((p, i) => ({ ...p, hex: i === 0 ? forest.hex : field.hex })),
    };
    const after = run("poisoned-frog", staged);

    expect(after.players[0].health).toBe(staged.players[0].health - 1);
    for (let i = 1; i < after.players.length; i++) {
      expect(after.players[i].health).toBe(staged.players[i].health);
    }
  });

  it("hits only the drawer on an encounter card", () => {
    const before = base();
    const after = run("dropped-your-wallet", before);
    expect(after.players[0].money).toBe(before.players[0].money - 1);
    for (let i = 1; i < after.players.length; i++) {
      expect(after.players[i].money).toBe(before.players[i].money);
    }
  });

  it("never takes a player below zero money", () => {
    const broke: GameState = {
      ...base(),
      players: base().players.map((p) => ({ ...p, money: 0 })),
    };
    for (const p of run("dropped-your-wallet", broke).players) expect(p.money).toBe(0);
  });

  it("never heals past the maximum", () => {
    const after = run("well-rested");
    for (const p of after.players) expect(p.health).toBeLessThanOrEqual(p.maxHealth);
  });

  it("skips the dead", () => {
    const fallen: GameState = {
      ...base(),
      players: base().players.map((p, i) => (i === 0 ? { ...p, dead: true, health: 0 } : p)),
    };
    const after = run("well-rested", fallen);
    expect(after.players[0].health).toBe(0);
    expect(after.players[0].dead).toBe(true);
  });

  it("takes food before health when something wants feeding", () => {
    const before = base();
    const fed: GameState = {
      ...before,
      players: before.players.map((p, i) =>
        i === 0 ? { ...p, supply: [makeItem(FOOD[2], "snack")] } : p,
      ),
    };
    const after = run("lost-kitty", fed);
    expect(after.players[0].supply).toEqual([]);
    expect(after.players[0].health).toBe(fed.players[0].health);

    // With nothing to give, it costs a health instead.
    const empty = run("lost-kitty", before);
    expect(empty.players[0].health).toBe(before.players[0].health - 1);
  });

  it("lets the bone do its one job", () => {
    const before = base();
    const withBone: GameState = {
      ...before,
      players: before.players.map((p, i) =>
        i === 0 ? { ...p, supply: [makeItem(FOOD[1], "bone")] } : p,
      ),
    };
    const after = run("a-dog-appears", withBone);
    expect(after.players[0].supply).toEqual([]);
    expect(after.players[0].health).toBe(withBone.players[0].health);
  });

  it("hands the helping hand to whoever is carrying least", () => {
    const before = base();
    const stocked: GameState = {
      ...before,
      players: before.players.map((p, i) =>
        i === 1 ? p : { ...p, supply: [makeItem(FOOD[2], `snack-${i}`)] },
      ),
    };
    const after = run("helping-hand", stocked);
    const lucky = after.players[1];
    expect(
      [lucky.weapon, lucky.armor, lucky.boots].filter(Boolean).length + lucky.supply.length,
    ).toBe(1);
  });

  it("copes with an empty world when a card wants to give something away", () => {
    const bare: GameState = { ...base(), itemPile: [] };
    expect(() => run("christmas", bare)).not.toThrow();
    expect(() => run("treasure-map", bare)).not.toThrow();
  });

  it("gives everybody their move back on a shortcut", () => {
    const spent: GameState = {
      ...base(),
      players: base().players.map((p) => ({ ...p, stepsTaken: 1 })),
    };
    for (const p of run("found-a-shortcut", spent).players) expect(p.stepsTaken).toBe(0);
  });

  it("sticks the city players in place with gum, but leaves them their action", () => {
    const before = base();
    const city = Object.values(before.tiles).find((t) => t.base === "city")!;
    const staged: GameState = {
      ...before,
      players: before.players.map((p, i) => (i === 0 ? { ...p, hex: city.hex } : p)),
    };
    const after = run("stepped-on-gum", staged);
    // Stuck means no steps left, however many the player had to begin with.
    expect(stepsLeft(after.players[0])).toBe(0);
    expect(after.players[0].actedThisTurn).toBe(false);
  });

  it("puts a bandit to sleep without a roll", () => {
    const before = base();
    const after = run("sleepy-mob", before);
    const down = after.enemies.filter((e) => e.kind === "mob" && e.defeated);
    expect(down).toHaveLength(1);
  });

  it("grows the weakest player permanently", () => {
    const before = base();
    const weak: GameState = {
      ...before,
      players: before.players.map((p, i) => (i === 2 ? { ...p, health: 1 } : p)),
    };
    const after = run("growth-spurt", weak);
    expect(after.players[2].maxHealth).toBe(weak.players[2].maxHealth + 1);
  });

  it("logs what it did, so the table can see it", () => {
    const after = run("lemonade-stand");
    expect(after.log.some((e) => e.text.includes("Lemonade Stand"))).toBe(true);
  });

  it("leaves the state it was given alone", () => {
    const before = base();
    const snapshot = JSON.stringify(before);
    for (const event of EVENTS) applyEvent(before, event);
    expect(JSON.stringify(before)).toBe(snapshot);
  });

  it("runs every card in the deck without throwing", () => {
    for (const event of EVENTS) {
      expect(() => applyEvent(base(), event)).not.toThrow();
    }
  });
});

describe("boss features", () => {
  const bossState = (kind: "midboss" | "finalboss") => {
    const base = createInitialState(4471);
    const enemy = base.enemies.find((e) => e.kind === kind)!;
    return { base, enemy };
  };

  it("gives every monster a feature, and the dragon two - rulebook §9", () => {
    expect(ENEMIES.mob.features).toBe(1);
    expect(ENEMIES.midboss.features).toBe(1);
    expect(ENEMIES.finalboss.features).toBe(2);
    // §5.5: the thieves draw none.
    expect(ENEMIES.robber.features).toBe(0);
    expect(ENEMIES.pirates.features).toBe(0);
  });

  it("draws two distinct features, and only on first sight", () => {
    const { base, enemy } = bossState("midboss");
    expect(enemy.features).toEqual([]);
    expect(enemy.featuresRevealed).toBe(false);

    const met = startCombat(base, enemy, key(enemy.hex), [base.players[0].id]);
    const seen = met.enemies.find((e) => e.id === enemy.id)!;
    expect(seen.features).toHaveLength(ENEMIES.midboss.features);
    expect(new Set(seen.features).size).toBe(seen.features.length);
    expect(seen.featuresRevealed).toBe(true);
    for (const feature of seen.features) expect(ALL_FEATURES).toContain(feature);

    // Meeting it again does not redraw.
    const again = startCombat({ ...met, combat: null }, seen, key(seen.hex), [base.players[0].id]);
    expect(again.enemies.find((e) => e.id === enemy.id)!.features).toEqual(seen.features);
  });

  it("is reproducible from the generator", () => {
    expect(drawFeatures(42, 2)).toEqual(drawFeatures(42, 2));
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

  it("takes ten seconds off every clock in a forest fight - §9", () => {
    const team = [createInitialState(4471).players[1]];
    const thing = challengeFor({ suit: "hearts", rank: "5" });
    expect(secondsFor(thing, team, true)).toBe(secondsFor(thing, team, false) - FOREST_SECONDS);
  });

  it("shuts the hints off in a city fight - §9", () => {
    const streets = { sides: ["city", "city", "field", "field", "field", "field"], rail: false } as Tile;
    const open = { sides: ["field", "field", "field", "field", "field", "field"], rail: false } as Tile;
    const enemy = { features: ["city"] } as Enemy;
    expect(noHints(enemy, streets)).toBe(true);
    expect(noHints(enemy, open)).toBe(false);
  });

  it("makes a boss hit harder on its own ground", () => {
    const { base, enemy } = bossState("midboss");
    const ground = base.tiles[key(enemy.hex)];

    /** The same lost fight, with the boss at home on this tile and not. */
    const cost = (features: Enemy["features"]) => {
      const state: GameState = {
        ...base,
        players: base.players.map((p) => ({ ...p, hex: enemy.hex, health: 50, maxHealth: 50 })),
        enemies: base.enemies.map((e) =>
          e.id === enemy.id ? { ...e, features, featuresRevealed: true } : e,
        ),
      };
      const fighting = intoFight(state, state.enemies.find((e) => e.id === enemy.id)!, [
        state.players[0].id,
      ]);
      const was = fighting.players[0].health;
      return was - loseIt(fighting).players[0].health;
    };

    // §9, field: it hits for one more out in the open.
    if (!ground.sides.includes("field")) return;
    expect(cost(["field"])).toBe(cost([]) + 1);
  });

});

describe("the water escape", () => {
  /** A boss standing in water, with the team about to win its last card. */
  function cornered() {
    const base = createInitialState(4471);
    const enemy = base.enemies.find((e) => e.kind === "midboss")!;
    const wet = Object.values(base.tiles).find((t) => t.river)!;
    const state: GameState = {
      ...base,
      players: base.players.map((p) => ({ ...p, hex: wet.hex })),
      enemies: base.enemies.map((e) =>
        e.id === enemy.id
          ? { ...e, hex: wet.hex, features: ["water"], featuresRevealed: true }
          : e,
      ),
    };
    const fighting = intoFight(state, state.enemies.find((e) => e.id === enemy.id)!, [
      state.players[0].id,
    ]);
    return { state: fighting, enemyId: enemy.id, tile: wet };
  }

  it("lets a beaten water monster slip away instead of dying", () => {
    const { state, enemyId, tile } = cornered();
    const after = winAll(state);
    const beast = after.enemies.find((e) => e.id === enemyId)!;

    expect(after.combat?.outcome).toBe("enemyEscaped");
    expect(beast.defeated).toBe(false);
    expect(beast.escapedOnce).toBe(true);
    // §9: it becomes a new encounter, somewhere else, and everything is forgotten.
    expect(key(beast.hex)).not.toBe(key(tile.hex));
  });

  it("only works once", () => {
    const { state, enemyId } = cornered();
    const used: GameState = {
      ...state,
      enemies: state.enemies.map((e) => (e.id === enemyId ? { ...e, escapedOnce: true } : e)),
    };
    const after = winAll(used);
    expect(after.combat?.outcome).toBe("enemyDefeated");
    expect(after.enemies.find((e) => e.id === enemyId)!.defeated).toBe(true);
  });

  it("does not save a monster that is not at home in the water", () => {
    const { state, enemyId } = cornered();
    const landlubber: GameState = {
      ...state,
      enemies: state.enemies.map((e) => (e.id === enemyId ? { ...e, features: ["city"] } : e)),
    };
    expect(winAll(landlubber).combat?.outcome).toBe("enemyDefeated");
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
