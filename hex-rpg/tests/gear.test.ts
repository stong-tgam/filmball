import { describe, expect, it } from "vitest";
import { FINE_VALUE, gearLabel, isFine, makeFine } from "../src/game/items";
import { ENEMIES } from "../src/game/enemies";
import { FINE_CHEST_CHANCE, MISHAPS, isMishap, search, searchKind } from "../src/game/actions";
import { createInitialState } from "../src/game/setup";
import { key } from "../src/game/hex";
import { JOKER } from "../src/game/cards";
import { movePlayer } from "../src/game/turn";
import { attack, endCombat } from "../src/game/combat";
import type { Card, GameState, Item, Tile } from "../src/game/types";

const card = (rank: string, suit: Card["suit"]): Card => ({ rank, suit } as Card);
const pan: Item = { id: "pan", name: "Frying Pan", slot: "weapon", cost: 2, value: 1 };

function standingOn(pick: (t: Tile) => boolean, seed = 4471): GameState {
  const base = createInitialState(seed);
  const tile = Object.values(base.tiles).find(
    (t) => pick(t) && !base.enemies.some((e) => key(e.hex) === key(t.hex)),
  )!;
  return {
    ...base,
    activePlayerIndex: 0,
    players: base.players.map((p, i) => (i === 0 ? { ...p, hex: tile.hex } : p)),
  };
}

describe("two grades of gear", () => {
  it("keeps the name and changes only the number", () => {
    const fine = makeFine(pan);
    expect(fine.name).toBe(pan.name);
    expect(fine.value).toBe(FINE_VALUE);
    expect(gearLabel(pan)).toBe("Frying Pan +1");
    expect(gearLabel(fine)).toBe("Frying Pan +2");
    expect(isFine(fine)).toBe(true);
    expect(isFine(pan)).toBe(false);
  });

  it("never upgrades food - a +2 apple is not a thing", () => {
    const apple: Item = { id: "a", name: "Apple Pie", slot: "supply", cost: 1, value: 1 };
    expect(makeFine(apple)).toEqual(apple);
    expect(gearLabel(apple)).toBe("Apple Pie");
  });

  it("orders the sources of +2 the way the progression needs", () => {
    // A mob never. A mid boss sometimes. A chest more often than a mid boss - that is
    // what makes a river worth walking to.
    expect(ENEMIES.mob.fineChance).toBe(0);
    expect(ENEMIES.midboss.fineChance).toBeCloseTo(0.3);
    expect(FINE_CHEST_CHANCE).toBeGreaterThan(ENEMIES.midboss.fineChance);
    expect(ENEMIES.finalboss.fineChance).toBeGreaterThanOrEqual(ENEMIES.midboss.fineChance);
  });

  it("means a mob's drops are always ordinary", () => {
    const base = createInitialState(4471);
    const mob = base.enemies.find((e) => e.kind === "mob")!;
    // Wind the mob down to nothing so the next hit finishes it.
    const doomed: GameState = {
      ...base,
      activePlayerIndex: 0,
      players: base.players.map((p, i) => (i === 0 ? { ...p, hex: mob.hex, health: 9 } : p)),
      enemies: base.enemies.map((e) => (e.id === mob.id ? { ...e, maxHealth: 1 } : e)),
    };
    let fighting = movePlayer(
      { ...doomed, players: doomed.players.map((p, i) => (i === 0 ? { ...p, hex: base.players[0].hex } : p)) },
      key(mob.hex),
    );
    for (let i = 0; i < 8 && fighting.combat?.outcome === "ongoing"; i++) fighting = attack(fighting);
    for (const item of fighting.combat?.spoils ?? []) expect(isFine(item)).toBe(false);
    endCombat(fighting);
  });
});

describe("searches that go wrong", () => {
  it("only a black face card is a mishap", () => {
    expect(isMishap(card("K", "spades"))).toBe(true);
    expect(isMishap(card("Q", "clubs"))).toBe(true);
    expect(isMishap(card("7", "clubs"))).toBe(false);
    expect(isMishap(card("K", "hearts"))).toBe(false);
    expect(isMishap(JOKER)).toBe(false);
  });

  it("has something for every kind of ground you can search", () => {
    for (const terrain of ["forest", "city", "field"] as const) {
      expect(MISHAPS[terrain].length).toBeGreaterThan(0);
      for (const mishap of MISHAPS[terrain]) expect(mishap.text.length).toBeGreaterThan(10);
    }
  });

  it("takes a health in the woods", () => {
    const state = standingOn((t) => !t.river && t.base === "forest");
    const before = state.players[0].health;
    const bitten = search({ ...state, searchDeck: [card("K", "spades"), ...state.searchDeck] });
    expect(bitten.players[0].health).toBe(before - 1);
    expect(bitten.log.at(-1)?.text).toMatch(/snake/i);
  });

  it("never kills: a player on one health loses gear instead", () => {
    const state = standingOn((t) => !t.river && t.base === "forest");
    const frail: GameState = {
      ...state,
      players: state.players.map((p, i) =>
        i === 0 ? { ...p, health: 1, boots: { ...pan, id: "boots", name: "Rain Boots", slot: "boots" } } : p,
      ),
      searchDeck: [card("K", "spades"), ...state.searchDeck],
    };
    const after = search(frail);
    expect(after.players[0].health).toBe(1);
    expect(after.players[0].boots).toBeNull();
  });

  it("puts what it takes back in the pile, so nothing leaves the game", () => {
    const state = standingOn((t) => !t.river && t.base === "city");
    const shod: GameState = {
      ...state,
      players: state.players.map((p, i) =>
        i === 0 ? { ...p, boots: { ...pan, id: "boots", name: "Rain Boots", slot: "boots" } } : p,
      ),
      searchDeck: [card("K", "spades"), ...state.searchDeck],
    };
    const before = shod.itemPile.length;
    const after = search(shod);
    expect(after.players[0].boots).toBeNull();
    expect(after.itemPile.length).toBe(before + 1);
  });

  it("still finds nothing on an ordinary black card", () => {
    const state = standingOn((t) => !t.river && t.base === "field");
    const after = search({ ...state, searchDeck: [card("7", "clubs"), ...state.searchDeck] });
    expect(after.log.at(-1)?.text).toMatch(/found nothing/i);
    expect(after.players[0].health).toBe(state.players[0].health);
  });

  it("does not apply to a river, which gives up a chest instead", () => {
    const state = standingOn((t) => t.chest);
    expect(searchKind(state.tiles[key(state.players[0].hex)])).toBe("chest");
    const after = search({ ...state, searchDeck: [card("K", "spades"), ...state.searchDeck] });
    expect(after.log.at(-1)?.text).not.toMatch(/snake|wasps|wire/i);
  });
});
