import { describe, expect, it } from "vitest";
import { CHEST_COINS, canSearch, readChestCard, search, searchKind } from "../src/game/actions";
import { chestsFor } from "../src/game/setup";
import { createInitialState } from "../src/game/setup";
import { key } from "../src/game/hex";
import { JOKER } from "../src/game/cards";
import type { Card, GameState, Tile } from "../src/game/types";

const card = (rank: string, suit: Card["suit"]): Card => ({ rank, suit } as Card);

/** A game with the active player standing on a tile of the given sort. */
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

describe("river chests", () => {
  it("makes a river searchable, where it never used to be", () => {
    const state = standingOn((t) => t.chest);
    expect(canSearch(state, state.players[0])).toBe(true);
    expect(searchKind(state.tiles[key(state.players[0].hex)])).toBe("chest");
  });

  it("still treats field and forest as ordinary ground", () => {
    const state = standingOn((t) => !t.river && (t.base === "field" || t.base === "forest"));
    expect(searchKind(state.tiles[key(state.players[0].hex)])).toBe("ground");
  });

  it("reads the card: face is armour, red is two, black is one, joker bites", () => {
    expect(readChestCard(card("K", "hearts"))).toBe("armour");
    expect(readChestCard(card("J", "spades"))).toBe("armour");
    expect(readChestCard(card("7", "diamonds"))).toBe("haul");
    // A black number used to be a soaked and empty box. Chests are rare now
    // (`chestsFor`), and a wasted chest is a wasted walk.
    expect(readChestCard(card("7", "clubs"))).toBe("single");
    expect(readChestCard(JOKER)).toBe("trap");
  });

  it("puts only a few chests in the river, so finding one is worth a detour", () => {
    for (const seed of [1, 42, 4471]) {
      const board = Object.values(createInitialState(seed).tiles);
      const water = board.filter((t) => t.river);
      const chests = board.filter((t) => t.chest);
      // Capped by the crossings: a chest is hauled out at a bridge now that the
      // river is a wall, so there can never be more chests than places to stand.
      const bridges = board.filter((t) => t.bridge).length;
      expect(chests).toHaveLength(Math.min(chestsFor(water.length), bridges));
      expect(chests.every((t) => t.bridge)).toBe(true);
      // Every chest is in the water, and most of the water has none - which is the
      // whole reason a chest is worth changing course for. Counted off the *river*
      // rather than the board: the river is a line and the board is an area, so a
      // share of the tile count over-produced chests the moment the map grew.
      expect(chests.every((t) => t.river)).toBe(true);
      expect(chests.length).toBeLessThan(water.length / 2);
    }
  });

  it("beats ground search on average - that is the whole reason to go to the river", () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    // Ground: red finds one item, everything else finds nothing.
    // Chest: face finds armour, red finds two, black nothing, joker hurts.
    const suits = ["hearts", "diamonds", "clubs", "spades"] as const;
    const ranks = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];
    let ground = 0;
    let chest = 0;
    for (const suit of suits) {
      for (const rank of ranks) {
        const c = card(rank, suit);
        if (suit === "hearts" || suit === "diamonds") ground += 1;
        const result = readChestCard(c);
        chest += result === "armour" ? 1 : result === "haul" ? 2 : result === "single" ? 1 : 0;
      }
    }
    expect(chest).toBeGreaterThan(ground);
  });

  it("costs the action and closes the tile, the same as any search", () => {
    const state = standingOn((t) => t.chest);
    const after = search(state);
    expect(after.players[0].actedThisTurn).toBe(true);
    expect(after.tiles[key(state.players[0].hex)].searched).toBe(true);
    expect(canSearch(after, after.players[0])).toBe(false);
  });

  it("says 'chest' in the log so the table knows which table was rolled on", () => {
    const state = standingOn((t) => t.chest);
    const after = search(state);
    expect(after.log.at(-2)?.text ?? after.log.at(-1)?.text).toMatch(/chest/i);
  });

  it("has coins in the bottom of it as well as gear", () => {
    const state = standingOn((t) => t.chest);
    const hauled: GameState = { ...state, searchDeck: [card("7", "diamonds"), ...state.searchDeck] };
    const after = search(hauled);
    expect(after.players[0].money).toBe(state.players[0].money + CHEST_COINS);
    // Coin *and* gear, not one or the other: the river has to stay the best thing
    // you can walk to, and a chest that paid either way would be worse than an ogre
    // half the time.
    expect(after.itemPile.length).toBeLessThan(state.itemPile.length);
  });

  it("pays in coin alone once every piece of gear is spoken for", () => {
    const state = standingOn((t) => t.chest);
    const bare: GameState = {
      ...state,
      itemPile: [],
      searchDeck: [card("7", "diamonds"), ...state.searchDeck],
    };
    const after = search(bare);
    expect(after.players[0].money).toBe(state.players[0].money + CHEST_COINS);
  });

  it("pays out on a black number too, now that chests are rare", () => {
    const state = standingOn((t) => t.chest);
    const single: GameState = { ...state, searchDeck: [card("7", "clubs"), ...state.searchDeck] };
    const after = search(single);
    // One piece rather than the red card's two, but never nothing: with only four
    // chests on the board a dud is a wasted walk, not a bit of texture.
    expect(after.itemPile.length).toBe(state.itemPile.length - 1);
    expect(after.players[0].money).toBe(state.players[0].money + CHEST_COINS);
  });

  it("never takes a player below zero health when the lid comes down", () => {
    const state = standingOn((t) => t.chest);
    const frail: GameState = {
      ...state,
      players: state.players.map((p, i) => (i === 0 ? { ...p, health: 0 } : p)),
      searchDeck: [JOKER, ...state.searchDeck],
    };
    expect(search(frail).players[0].health).toBe(0);
  });
});

describe("coins on the body", () => {
  it("keeps a mob's purse below the price of a piece of gear", async () => {
    const { ENEMIES } = await import("../src/game/enemies");
    const { GEAR_PRICE } = await import("../src/game/items");
    // §10 says loot is items only and money comes from selling. Purses bend that
    // deliberately; if a mob ever out-earns a sale, the shop stops mattering.
    expect(ENEMIES.mob.purse).toBeLessThan(GEAR_PRICE);
    expect(ENEMIES.midboss.purse).toBeGreaterThanOrEqual(ENEMIES.mob.purse);
    expect(ENEMIES.finalboss.purse).toBeGreaterThan(ENEMIES.midboss.purse);
  });
});
