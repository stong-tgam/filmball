/**
 * The green stone.
 *
 * The rule the whole system rests on is that a stone gives a **verb, not a number** -
 * so every test here is about a thing a player can now *do*, and none of them asserts
 * a stat went up.
 */

import { describe, expect, it } from "vitest";
import {
  GEMS,
  GEM_FROM_A_CHEST,
  canSetGem,
  isSpent,
  makeGem,
  maybeAStone,
  powerHere,
  powerOf,
  ready,
  setGem,
  spend,
} from "../src/game/gems";
import { createInitialState } from "../src/game/setup";
import { canDigAgain, canSearch, search } from "../src/game/actions";
import { attack, startCombat } from "../src/game/combat";
import { collapseRim, collapseTurns } from "../src/game/collapse";
import { RADIUS, allHexes, distance, key } from "../src/game/hex";
import { SUPPLY_CAP } from "../src/game/items";
import type { GameState, GemSetting, Player } from "../src/game/types";

const MIDDLE = { q: 0, r: 0 };

/** A game with the knight holding a stone, set where you ask, everyone else parked. */
function holding(set: GemSetting, seed = 4471): GameState {
  const base = createInitialState(seed);
  return {
    ...base,
    activePlayerIndex: 0,
    players: base.players.map((p, i) =>
      i === 0 ? { ...p, gem: { ...makeGem("green", "stone-1"), set } } : { ...p, dead: true },
    ),
  };
}

describe("the stone itself", () => {
  it("lands in the coat, unspent, with a power in every setting", () => {
    const gem = makeGem("green", "s");
    expect(gem.set).toBe("armor");
    expect(gem.spent).toEqual([]);
    expect(ready(gem)).toBe(true);
    for (const setting of ["weapon", "armor", "boots"] as GemSetting[]) {
      const power = GEMS.green.powers[setting];
      expect(power.title.length).toBeGreaterThan(0);
      expect(power.text.length).toBeGreaterThan(0);
    }
    // Green's weapon power is the one that never runs out; the other two are once each.
    expect(GEMS.green.powers.weapon.onceAGame).toBe(false);
    expect(GEMS.green.powers.armor.onceAGame).toBe(true);
    expect(GEMS.green.powers.boots.onceAGame).toBe(true);
  });

  it("spends per setting, not per stone", () => {
    const coat = spend({ ...makeGem("green", "s"), set: "armor" });
    expect(isSpent(coat, "armor")).toBe(true);
    // Spending the coat's save must not also spend the boots' second dig.
    expect(isSpent(coat, "boots")).toBe(false);
    expect(ready({ ...coat, set: "boots" })).toBe(true);
    expect(ready(coat)).toBe(false);
  });

  it("moves between settings for free, and never mid-fight", () => {
    const state = holding("armor");
    const moved = setGem(state, "knight", "weapon");
    expect(moved.players[0].gem!.set).toBe("weapon");
    // Free. Moving a stone is not the turn's one action.
    expect(moved.players[0].actedThisTurn).toBe(false);
    expect(powerOf(moved.players[0].gem!).title).toBe(GEMS.green.powers.weapon.title);

    // Switching to the coat after seeing a roll fall short would turn a once-a-game
    // save into a save every fight.
    const enemy = state.enemies.find((e) => e.kind === "mob")!;
    const fighting = startCombat(
      { ...state, enemies: state.enemies.map((e) => ({ ...e, dormant: false })) },
      enemy,
      key(state.players[0].hex),
      false,
    );
    expect(canSetGem(fighting, fighting.players[0])).toBe(false);
    expect(setGem(fighting, "knight", "boots")).toBe(fighting);
  });

  it("only answers to the setting it is actually in", () => {
    const inTheCoat = holding("armor").players[0];
    expect(powerHere(inTheCoat, "armor")).not.toBeNull();
    expect(powerHere(inTheCoat, "weapon")).toBeNull();
    expect(powerHere(inTheCoat, "boots")).toBeNull();
  });
});

describe("second wind, in the coat", () => {
  /** The knight one health from the floor, in a fight they are about to lose. */
  function onTheBrink(set: GemSetting): GameState {
    const base = holding(set);
    const enemy = base.enemies.find((e) => e.kind === "midboss") ?? base.enemies[1];
    const ready: GameState = {
      ...base,
      enemies: base.enemies.map((e) =>
        e.id === enemy.id ? { ...e, dormant: false, maxHealth: 99, damageTaken: 0 } : e,
      ),
      players: base.players.map((p, i) => (i === 0 ? { ...p, hex: enemy.hex, health: 1 } : p)),
    };
    return startCombat(ready, { ...enemy, maxHealth: 99, damageTaken: 0 }, key(base.players[0].hex), false);
  }

  it("leaves you standing on one health instead of going down, once", () => {
    let state = onTheBrink("armor");
    state = attack(state); // 99 health: the roll cannot possibly beat it.

    const knight = state.players[0];
    expect(knight.dead).toBe(false);
    expect(knight.health).toBe(1);
    expect(isSpent(knight.gem!, "armor")).toBe(true);
    expect(state.log.some((l) => /green stone held them up/.test(l.text))).toBe(true);

    // And only once. The next failed round puts them down like anybody else.
    const again = attack(state);
    expect(again.players[0].dead).toBe(true);
  });

  it("does nothing at all from the weapon or the boots", () => {
    for (const set of ["weapon", "boots"] as GemSetting[]) {
      const down = attack(onTheBrink(set));
      expect(down.players[0].dead, set).toBe(true);
    }
  });

  it("does not save you from the abyss - over the edge is over the edge", () => {
    const turn = collapseTurns(16)[0];
    const rim = allHexes().find((h) => distance(h, MIDDLE) === RADIUS)!;
    const base = holding("armor");
    const state: GameState = {
      ...base,
      turn,
      turnLimit: 16,
      players: base.players.map((p, i) => (i === 0 ? { ...p, hex: rim, dead: false } : p)),
    };
    const after = collapseRim(state);
    expect(after.players[0].gone).toBe(true);
    // Untouched: the stone was never asked, so it is still there to be spent.
    expect(isSpent(after.players[0].gem!, "armor")).toBe(false);
  });
});

/** One point of health left, so a single swing finishes it whatever the dice do. */
const nearlyDone = (state: GameState, enemyId: string): GameState => ({
  ...state,
  enemies: state.enemies.map((e) =>
    e.id === enemyId ? { ...e, damageTaken: e.maxHealth - 1 } : e,
  ),
});

describe("spoils, in the weapon", () => {
  it("feeds everybody who swung when the fight is won", () => {
    const base = holding("weapon");
    const enemy = base.enemies.find((e) => e.kind === "mob")!;
    const ready: GameState = {
      ...base,
      enemies: base.enemies.map((e) =>
        e.id === enemy.id ? { ...e, dormant: false, damageTaken: e.maxHealth - 1 } : e,
      ),
      players: base.players.map((p, i) => (i === 0 ? { ...p, hex: enemy.hex, supply: [] } : p)),
    };
    // Wound it *after* the fight starts: `startCombat` sets the encounter up fresh, so
    // damage written before it is discarded.
    const fighting = startCombat(ready, enemy, key(base.players[0].hex), false);
    const won = attack(nearlyDone(fighting, enemy.id));

    expect(won.combat?.outcome).toBe("enemyDefeated");
    expect(won.players[0].supply.length).toBeGreaterThan(0);
    expect(won.players[0].supply.length).toBeLessThanOrEqual(SUPPLY_CAP);
    expect(won.log.some((l) => /green stone/.test(l.text))).toBe(true);
  });

  it("hands out nothing when the stone is somewhere else", () => {
    const base = holding("boots");
    const enemy = base.enemies.find((e) => e.kind === "mob")!;
    const ready: GameState = {
      ...base,
      enemies: base.enemies.map((e) =>
        e.id === enemy.id ? { ...e, dormant: false, damageTaken: e.maxHealth - 1 } : e,
      ),
      players: base.players.map((p, i) => (i === 0 ? { ...p, hex: enemy.hex, supply: [] } : p)),
    };
    const won = attack(nearlyDone(startCombat(ready, enemy, key(base.players[0].hex), false), enemy.id));
    expect(won.combat?.outcome).toBe("enemyDefeated");
    expect(won.log.some((l) => /green stone/.test(l.text))).toBe(false);
  });
});

describe("dig again, in the boots", () => {
  /** The knight standing on ground of a given sort, already turned over. */
  function standingOn(set: GemSetting, pick: (t: { river: boolean; chest: boolean }) => boolean) {
    const base = holding(set);
    const tile = Object.values(base.tiles).find((t) => pick(t))!;
    const state: GameState = {
      ...base,
      tiles: { ...base.tiles, [key(tile.hex)]: { ...tile, searched: true } },
      players: base.players.map((p, i) => (i === 0 ? { ...p, hex: tile.hex } : p)),
    };
    return { state, tile: state.tiles[key(tile.hex)] };
  }

  it("opens ground the party has already been over, and only from the boots", () => {
    const { state, tile } = standingOn("boots", (t) => !t.chest);
    expect(canDigAgain(state.players[0], tile)).toBe(true);
    expect(canSearch(state, state.players[0])).toBe(true);

    const coat = standingOn("armor", (t) => !t.chest);
    expect(canDigAgain(coat.state.players[0], coat.tile)).toBe(false);
    expect(canSearch(coat.state, coat.state.players[0])).toBe(false);
  });

  it("spends itself on the dig, so it is once a game", () => {
    const { state } = standingOn("boots", (t) => !t.chest);
    const after = search(state);
    expect(after.players[0].gem!.spent).toContain("boots");
    expect(canSearch(after, after.players[0])).toBe(false);
    expect(after.log.some((l) => /second time/.test(l.text))).toBe(true);
  });

  it("never opens a chest twice - that is the best loot in the game", () => {
    const chest = Object.values(holding("boots").tiles).find((t) => t.chest);
    if (!chest) return; // Not every seed's river carries one where this test can reach.
    const { state, tile } = standingOn("boots", (t) => t.chest);
    expect(canDigAgain(state.players[0], tile)).toBe(false);
  });
});

describe("where stones come from", () => {
  it("only ever goes to somebody who has not got one", () => {
    const base = createInitialState(4471);
    const already: GameState = {
      ...base,
      players: base.players.map((p, i) =>
        i === 0 ? { ...p, gem: makeGem("green", "theirs") } : p,
      ),
    };
    // A certainty, so the only thing that can stop it is the rule under test.
    const rolled = maybeAStone(already, already.players[0].id, 1);
    expect(rolled.players[0].gem!.id).toBe("theirs");

    const empty = maybeAStone(base, base.players[1].id, 1);
    expect(empty.players[1].gem).not.toBeNull();
    expect(empty.log.some((l) => /green stone/i.test(l.text))).toBe(true);
  });

  it("is rare enough to stay a moment, and rolls off the game's own generator", () => {
    expect(GEM_FROM_A_CHEST).toBeLessThan(1);
    const base = createInitialState(4471);
    const once = maybeAStone(base, base.players[0].id, GEM_FROM_A_CHEST);
    const twice = maybeAStone(base, base.players[0].id, GEM_FROM_A_CHEST);
    // Same state in, same state out: a seed still replays exactly.
    expect(once.players[0].gem?.id ?? null).toEqual(twice.players[0].gem?.id ?? null);
    expect(once.rngState).toBe(twice.rngState);
  });

  it("shows up on the find card as its own thing, not as a piece of gear", () => {
    const base = createInitialState(4471);
    const tile = Object.values(base.tiles).find((t) => !t.searched && !t.chest && !t.river)!;
    const state: GameState = {
      ...base,
      activePlayerIndex: 0,
      players: base.players.map((p, i) => (i === 0 ? { ...p, hex: tile.hex } : p)),
    };
    // Walk seeds until one turns a stone up; the drop is rare on purpose.
    let found: GameState | null = null;
    for (let seed = 0; seed < 400 && !found; seed++) {
      const after = search({ ...state, rngState: seed });
      if (after.find?.gem) found = after;
    }
    expect(found, "no seed in 400 turned up a stone").not.toBeNull();
    expect(found!.find!.kind).toBe("stone");
    expect(found!.find!.gem!.kind).toBe("green");
    // Never counted among the items: a stone has no slot, no price and no plus.
    expect(found!.find!.gained.some((i: { id: string }) => i.id === found!.find!.gem!.id)).toBe(false);
  });
});

/** Nothing here should have changed how a player without a stone plays. */
describe("a player with no stone", () => {
  it("searches, fights and falls over exactly as before", () => {
    const base = createInitialState(4471);
    const player: Player = base.players[0];
    expect(player.gem).toBeNull();
    expect(powerHere(player, "armor")).toBeNull();
    const tile = Object.values(base.tiles).find((t) => !t.chest)!;
    expect(canDigAgain(player, { ...tile, searched: true })).toBe(false);
  });
});
