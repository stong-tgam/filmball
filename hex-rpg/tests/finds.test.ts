/**
 * What a search hands the UI to put on screen.
 *
 * `GameState.find` is read back off the two states a search produced rather than
 * written out by each branch, so these tests are as much about that derivation
 * holding as about the outcomes: a branch that changes what it does should change
 * what the card says without anybody editing the card.
 */

import { describe, expect, it } from "vitest";
import { clearFind, search } from "../src/game/actions";
import { createInitialState } from "../src/game/setup";
import { endTurn } from "../src/game/turn";
import { key } from "../src/game/hex";
import { JOKER } from "../src/game/cards";
import { EQUIPMENT, FOOD, SUPPLY_CAP, makeItem } from "../src/game/items";
import type { Card, GameState, Tile } from "../src/game/types";

const card = (rank: string, suit: Card["suit"]): Card => ({ rank, suit } as Card);

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

const ground = (t: Tile) => !t.river && (t.base === "field" || t.base === "forest");

/** A game about to draw exactly this card on the next search. */
const drawing = (state: GameState, next: Card): GameState => ({ ...state, searchDeck: [next] });

describe("what a search hands to the screen", () => {
  it("says nothing happened until somebody searches", () => {
    expect(createInitialState(4471).find).toBeNull();
  });

  it("names the gear it found, so the card can draw its token", () => {
    const state = drawing(standingOn(ground), card("9", "hearts"));
    const find = search(state).find!;
    expect(find.kind).toBe("gear");
    expect(find.gained).toHaveLength(1);
    expect(find.gained[0].name).toBe(state.itemPile[0].name);
    expect(find.from).toBe("ground");
  });

  it("counts the coins, and calls a purse a purse", () => {
    const find = search(drawing(standingOn(ground), card("K", "diamonds")))!.find!;
    // A red picture card is gear *and* money; the gear is the headline.
    expect(find.kind).toBe("gear");
    expect(find.coins).toBe(3);
  });

  it("gives empty ground a card of its own rather than nothing at all", () => {
    const find = search(drawing(standingOn(ground), card("9", "clubs")))!.find!;
    expect(find.kind).toBe("nothing");
    expect(find.gained).toEqual([]);
    expect(find.coins).toBe(0);
    expect(find.lines.join(" ")).toContain("found nothing");
  });

  it("tells 'could not carry it' apart from 'there was nothing there'", () => {
    // A full pack and a card that found food: the ground did hold something.
    const base = standingOn(ground);
    const pack = Array.from({ length: SUPPLY_CAP }, (_, i) =>
      makeItem(FOOD[0], `packed-${i}`),
    );
    const stuffed: GameState = {
      ...drawing(base, card("9", "hearts")),
      itemPile: [makeItem(FOOD[1], "loose-carrot")],
      players: base.players.map((p, i) => (i === 0 ? { ...p, supply: pack } : p)),
    };
    const find = search(stuffed).find!;
    expect(find.gained).toEqual([]);
    expect(find.kind).toBe("full");
  });

  it("records both sides of a swap: the piece taken and the piece put down", () => {
    const base = standingOn(ground);
    const held = makeItem(EQUIPMENT.find((e) => e.slot === "weapon")!, "old-pan");
    const loose = makeItem(EQUIPMENT.filter((e) => e.slot === "weapon")[1], "new-stick");
    const swapping: GameState = {
      ...drawing(base, card("9", "hearts")),
      itemPile: [loose],
      players: base.players.map((p, i) => (i === 0 ? { ...p, weapon: held } : p)),
    };

    const find = search(swapping).find!;
    expect(find.kind).toBe("gear");
    expect(find.gained.map((i) => i.id)).toEqual(["new-stick"]);
    expect(find.lost.map((i) => i.id)).toEqual(["old-pan"]);
    // The log used to call this "no room for it", which is what a full *pack* is.
    expect(find.lines.join(" ")).toContain("left");
  });

  it("counts the health a joker or a lid costs", () => {
    const trapped = search({ ...standingOn((t) => t.chest), searchDeck: [JOKER] }).find!;
    expect(trapped.from).toBe("chest");
    expect(trapped.kind).toBe("trap");
    expect(trapped.hurt).toBe(1);
  });

  it("carries the log's own words, so the card and the log cannot disagree", () => {
    const after = search(drawing(standingOn(ground), card("9", "clubs")));
    const find = after.find!;
    // Every line on the card is a line in the log, and the draw line is not repeated.
    for (const line of find.lines) expect(after.log.some((l) => l.text === line)).toBe(true);
    expect(find.lines.some((l) => l.includes("drew"))).toBe(false);
  });

  it("is put away by the table, and by the turn passing if they forget", () => {
    const after = search(drawing(standingOn(ground), card("9", "hearts")));
    expect(after.find).not.toBeNull();
    expect(clearFind(after).find).toBeNull();
    expect(endTurn(after).find).toBeNull();
  });
});
