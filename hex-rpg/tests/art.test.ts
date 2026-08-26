/**
 * The upload store, and the promise the art room makes.
 *
 * The catalogue is the interesting half: it offers a picture slot for every drawing in
 * the game, and **a slot nothing reads is a lie**. A child who draws something that
 * never turns up will not draw a second one, so the shape of the slot names is
 * asserted against the same helpers the game itself calls.
 */

import { beforeEach, describe, expect, it } from "vitest";
import { everySlot, shelves } from "../src/ui/art/catalogue";
import {
  clearAllOverrides,
  clearOverride,
  drawnCount,
  exportDrawings,
  importDrawings,
  overrideFor,
  putOverride,
  storageUsed,
} from "../src/ui/art/overrides";
import { gemSlot } from "../src/ui/art/gems";
import { monsterSlot } from "../src/ui/art/monsters";
import { roleSlot } from "../src/ui/art/roles";
import { EQUIPMENT, FOOD } from "../src/game/items";
import { ENEMIES } from "../src/game/enemies";
import { GEMS } from "../src/game/gems";
import { TURN_ORDER } from "../src/game/players";
import { ALL_FEATURES } from "../src/game/combat";
import type { EnemyKind, GemKind } from "../src/game/types";

const PICTURE = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==";

describe("the catalogue", () => {
  it("offers a slot for everything in the game, and nothing else", () => {
    const offered = new Set(everySlot().map((e) => e.slot));

    for (const role of TURN_ORDER) expect(offered.has(roleSlot(role)), role).toBe(true);
    for (const kind of Object.keys(ENEMIES) as EnemyKind[]) {
      expect(offered.has(monsterSlot(kind)), kind).toBe(true);
    }
    for (const kind of Object.keys(GEMS) as GemKind[]) {
      expect(offered.has(gemSlot(kind)), kind).toBe(true);
    }
    for (const feature of ALL_FEATURES) expect(offered.has(`feature:${feature}`), feature).toBe(true);
    for (const item of [...EQUIPMENT, ...FOOD]) {
      expect(offered.has(`item:${item.name}`), item.name).toBe(true);
    }

    // Nothing invented: every slot is one of the five shapes the game asks for.
    for (const slot of offered) {
      expect(slot, slot).toMatch(/^(role|monster|gem|feature|item):/);
    }
  });

  it("names and describes every one of them, and never twice", () => {
    const all = everySlot();
    expect(new Set(all.map((e) => e.slot)).size).toBe(all.length);
    for (const entry of all) {
      expect(entry.name.length, entry.slot).toBeGreaterThan(0);
      expect(entry.hint.length, entry.slot).toBeGreaterThan(0);
    }
  });

  it("keeps the party and the monsters at the top, where the biggest pictures are", () => {
    const titles = shelves().map((s) => s.title);
    expect(titles[0]).toBe("The party");
    expect(titles[1]).toBe("Monsters");
    // Food is twenty-odd thumbnails; it is the last thing worth drawing.
    expect(titles[titles.length - 1]).toBe("Food");
  });
});

describe("the store", () => {
  beforeEach(() => clearAllOverrides());

  it("keeps a picture against a slot and hands it back", () => {
    expect(overrideFor("item:Frying Pan")).toBeUndefined();
    putOverride("item:Frying Pan", PICTURE);
    expect(overrideFor("item:Frying Pan")).toBe(PICTURE);
    expect(drawnCount()).toBe(1);
    expect(storageUsed()).toBeGreaterThan(PICTURE.length);

    clearOverride("item:Frying Pan");
    expect(overrideFor("item:Frying Pan")).toBeUndefined();
    expect(drawnCount()).toBe(0);
  });

  it("round-trips through a file", () => {
    putOverride(roleSlot("knight"), PICTURE);
    putOverride(gemSlot("green"), PICTURE);
    const file = exportDrawings();

    clearAllOverrides();
    expect(drawnCount()).toBe(0);

    const result = importDrawings(file);
    expect("error" in result).toBe(false);
    expect((result as { added: number }).added).toBe(2);
    expect(overrideFor(roleSlot("knight"))).toBe(PICTURE);
  });

  it("adds to what is there rather than wiping it", () => {
    putOverride(roleSlot("knight"), PICTURE);
    const theirs = JSON.stringify({
      format: "hex-rpg-art",
      version: 1,
      drawings: { [roleSlot("rogue")]: PICTURE },
    });
    importDrawings(theirs);

    // Importing one tablet's drawings onto another must not silently lose the second
    // tablet's - an evening's work each way.
    expect(overrideFor(roleSlot("knight"))).toBe(PICTURE);
    expect(overrideFor(roleSlot("rogue"))).toBe(PICTURE);
  });

  it("refuses anything that is not our file, and anything that is not a picture", () => {
    expect(importDrawings("not json at all")).toEqual({
      error: expect.stringContaining("JSON") as unknown as string,
    });
    expect("error" in importDrawings(JSON.stringify({ hello: "there" }))).toBe(true);

    // A remote address would be a picture that stops working off the wifi, and a way
    // to point the game at anything at all.
    const remote = JSON.stringify({
      format: "hex-rpg-art",
      version: 1,
      drawings: { "item:Broom": "https://example.com/cat.png" },
    });
    expect("error" in importDrawings(remote)).toBe(true);
    expect(overrideFor("item:Broom")).toBeUndefined();
  });
});
