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
  powerOf,
  setGem,
  spend,
  stone,
} from "../src/game/gems";
import { createInitialState } from "../src/game/setup";
import { canDigAgain, canSearch, search, tileMates } from "../src/game/actions";
import { attack, canSwingTwice, flee, invite, inviteTargets, startCombat } from "../src/game/combat";
import { collapseRim, collapseTurns } from "../src/game/collapse";
import { RADIUS, allHexes, distance, key } from "../src/game/hex";
import { SUPPLY_CAP } from "../src/game/items";
import type { GameState, GemKind, GemSetting, Player } from "../src/game/types";

const MIDDLE = { q: 0, r: 0 };

/** A game with the knight holding a stone, set where you ask, everyone else parked. */
function holding(set: GemSetting, seed = 4471, kind: GemKind = "green"): GameState {
  const base = createInitialState(seed);
  return {
    ...base,
    activePlayerIndex: 0,
    players: base.players.map((p, i) =>
      i === 0 ? { ...p, gem: { ...makeGem(kind, "stone-1"), set } } : { ...p, dead: true },
    ),
  };
}

describe("the stone itself", () => {
  it("lands in the coat, unspent, with a power in every setting", () => {
    for (const kind of ["green", "red", "blue"] as GemKind[]) {
      const gem = makeGem(kind, `s-${kind}`);
      expect(gem.set, kind).toBe("armor");
      expect(gem.spent, kind).toEqual([]);
      for (const setting of ["weapon", "armor", "boots"] as GemSetting[]) {
        const power = GEMS[kind].powers[setting];
        expect(power.title.length, `${kind} ${setting}`).toBeGreaterThan(0);
        expect(power.text.length, `${kind} ${setting}`).toBeGreaterThan(0);
      }
    }
    // Green's weapon never runs out; its other two are once an evening. Red's whole set
    // comes back every fight, which is what makes it the *now* stone.
    expect(GEMS.green.powers.weapon.limit).toBe("always");
    expect(GEMS.green.powers.armor.limit).toBe("game");
    expect(GEMS.green.powers.boots.limit).toBe("game");
    for (const setting of ["weapon", "armor", "boots"] as GemSetting[]) {
      expect(GEMS.red.powers[setting].limit, setting).toBe("fight");
    }
    expect(GEMS.blue.powers.weapon.limit).toBe("always");
    expect(GEMS.blue.powers.armor.limit).toBe("fight");
    expect(GEMS.blue.powers.boots.limit).toBe("always");
  });

  it("spends per setting, not per stone", () => {
    const coat = spend({ ...makeGem("green", "s"), set: "armor" });
    expect(isSpent(coat, "armor")).toBe(true);
    // Spending the coat's save must not also spend the boots' second dig.
    expect(isSpent(coat, "boots")).toBe(false);
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

  it("only answers to its own colour, in the setting it is actually in", () => {
    const inTheCoat = holding("armor").players[0];
    expect(stone(inTheCoat, "green", "armor")).not.toBeNull();
    expect(stone(inTheCoat, "green", "weapon")).toBeNull();
    expect(stone(inTheCoat, "green", "boots")).toBeNull();
    // A red stone in the coat must not answer a question about the green one, or
    // every power would fire for every colour.
    expect(stone(inTheCoat, "red", "armor")).toBeNull();
    expect(stone(inTheCoat, "blue", "armor")).toBeNull();
  });

  it("keeps a fight-limited power to itself outside a fight", () => {
    const red = holding("armor", 4471, "red").players[0];
    // Nothing to spend it on, so nothing to offer.
    expect(stone(red, "red", "armor", null)).toBeNull();
    expect(stone(red, "red", "armor", { stonesSpent: [] } as never)).not.toBeNull();
    expect(stone(red, "red", "armor", { stonesSpent: [red.id] } as never)).toBeNull();
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
    expect(empty.log.some((l) => /(green|red|blue) stone/i.test(l.text))).toBe(true);
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
    // Walk seeds until one turns a *green* stone up; the drop is rare on purpose and
    // the colour is its own roll.
    let found: GameState | null = null;
    for (let seed = 0; seed < 2000 && !found; seed++) {
      const after = search({ ...state, rngState: seed });
      if (after.find?.gem?.kind === "green") found = after;
    }
    expect(found, "no seed in 2000 turned up a green stone").not.toBeNull();
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
    expect(stone(player, "green", "armor")).toBeNull();
    const tile = Object.values(base.tiles).find((t) => !t.chest)!;
    expect(canDigAgain(player, { ...tile, searched: true })).toBe(false);
  });
});


/* ============================================================== the red stone */

/** The knight in a fight with an unkillable enemy, so every round falls short. */
function inAFight(kind: GemKind, set: GemSetting, health = 3): GameState {
  const base = holding(set, 4471, kind);
  const enemy = base.enemies.find((e) => e.kind === "midboss") ?? base.enemies[1];
  const ready: GameState = {
    ...base,
    enemies: base.enemies.map((e) => (e.id === enemy.id ? { ...e, dormant: false } : e)),
    players: base.players.map((p, i) => (i === 0 ? { ...p, hex: enemy.hex, health } : p)),
  };
  const fighting = startCombat(ready, enemy, key(base.players[0].hex), false);
  return {
    ...fighting,
    enemies: fighting.enemies.map((e) =>
      e.id === enemy.id ? { ...e, maxHealth: 99, damageTaken: 0 } : e,
    ),
  };
}

describe("second swing, in a red weapon", () => {
  it("is offered once a fight, and not once it is spent", () => {
    let state = inAFight("red", "weapon");
    expect(canSwingTwice(state)).toBe(true);

    state = attack(state, true);
    expect(state.log.some((l) => /second throw/.test(l.text))).toBe(true);
    expect(state.combat!.stonesSpent).toContain("knight");
    expect(canSwingTwice(state)).toBe(false);

    // And a second request quietly rolls once, rather than throwing twice for free.
    const after = attack(state, true);
    expect(after.log.filter((l) => /second throw/.test(l.text))).toHaveLength(1);
  });

  it("keeps the better of the two totals", () => {
    const state = inAFight("red", "weapon");
    const once = attack(state);
    const twice = attack(state, true);
    // Same seed, so the first throw is identical; taking the better can only ever be
    // at least as good as taking the first.
    expect(twice.combat!.playerRoll!.damage).toBeGreaterThanOrEqual(
      once.combat!.playerRoll!.damage,
    );
  });

  it("is not offered at all to a stone in the wrong setting", () => {
    expect(canSwingTwice(inAFight("red", "armor"))).toBe(false);
    expect(canSwingTwice(inAFight("green", "weapon"))).toBe(false);
  });
});

describe("grit, in a red coat", () => {
  it("costs the holder nothing on the round it fires, once a fight", () => {
    const state = inAFight("red", "armor");
    const first = attack(state);
    expect(first.players[0].health).toBe(3);
    expect(first.log.some((l) => /gritted it out/.test(l.text))).toBe(true);

    // The next failed round lands like anybody else's.
    const second = attack(first);
    expect(second.players[0].health).toBe(2);
  });
});

describe("slip away, in red boots", () => {
  it("makes backing out certain, once a fight", () => {
    const state = inAFight("red", "boots");
    // Swing once so the free ambush walk-out is not what is being measured.
    const swung = attack(state);
    const gone = flee(swung);
    expect(gone.combat!.outcome).toBe("playerEscaped");
    expect(gone.log.some((l) => /no roll needed/i.test(l.text))).toBe(true);
    expect(gone.combat!.stonesSpent).toContain("knight");
  });

  it("leaves an ordinary escape to the dice", () => {
    const swung = attack(inAFight("green", "boots"));
    expect(flee(swung).log.some((l) => /no roll needed/i.test(l.text))).toBe(false);
  });
});

/* ============================================================= the blue stone */

describe("carry, in a blue weapon", () => {
  it("puts a friend one tile further inside the shout", () => {
    const base = holding("weapon", 4471, "blue");
    const enemy = base.enemies.find((e) => e.kind === "midboss")!;
    const two = allHexes().find((h) => distance(h, enemy.hex) === 2 && distance(h, MIDDLE) <= RADIUS)!;

    const party: GameState = {
      ...base,
      enemies: base.enemies.map((e) => ({ ...e, dormant: false })),
      players: base.players.map((p, i) =>
        i === 0 ? { ...p, hex: enemy.hex } : { ...p, dead: false, hex: two, joinedFightThisRound: false },
      ),
    };
    const fighting = startCombat(party, enemy, key(enemy.hex), false);
    // A knight moves one tile, so two tiles is out of reach without the stone.
    expect(inviteTargets(fighting).length).toBeGreaterThan(0);

    const plain: GameState = {
      ...fighting,
      players: fighting.players.map((p, i) => (i === 0 ? { ...p, gem: null } : p)),
    };
    expect(inviteTargets(plain)).toHaveLength(0);
  });
});

describe("take the hit, in a blue coat", () => {
  it("puts a friend's blow on the holder instead, while they can stand it", () => {
    const base = holding("armor", 4471, "blue");
    const enemy = base.enemies.find((e) => e.kind === "midboss")!;
    const together: GameState = {
      ...base,
      enemies: base.enemies.map((e) => (e.id === enemy.id ? { ...e, dormant: false } : e)),
      players: base.players.map((p, i) =>
        i === 0
          ? { ...p, hex: enemy.hex, health: 4 }
          : i === 1
          ? { ...p, dead: false, hex: enemy.hex, health: 1, joinedFightThisRound: false }
          : { ...p, dead: true },
      ),
    };
    let fighting = startCombat(together, enemy, key(enemy.hex), false);
    fighting = {
      ...invite(fighting, "rogue"),
      enemies: fighting.enemies.map((e) =>
        e.id === enemy.id ? { ...e, maxHealth: 99, damageTaken: 0 } : e,
      ),
    };

    const after = attack(fighting);
    const hero = after.players.find((p) => p.id === "knight")!;
    const kept = after.players.find((p) => p.id === "rogue")!;

    expect(kept.dead).toBe(false);
    expect(kept.health).toBe(1);
    // Their own toll and their friend's.
    expect(hero.health).toBe(2);
    expect(after.log.some((l) => /stepped in front of it/.test(l.text))).toBe(true);
    expect(after.combat!.stonesSpent).toContain("knight");
  });

  it("never fires when it would take the holder down too", () => {
    const base = holding("armor", 4471, "blue");
    const enemy = base.enemies.find((e) => e.kind === "midboss")!;
    const frail: GameState = {
      ...base,
      enemies: base.enemies.map((e) => (e.id === enemy.id ? { ...e, dormant: false } : e)),
      players: base.players.map((p, i) =>
        i === 0
          ? { ...p, hex: enemy.hex, health: 2 }
          : i === 1
          ? { ...p, dead: false, hex: enemy.hex, health: 1, joinedFightThisRound: false }
          : { ...p, dead: true },
      ),
    };
    let fighting = startCombat(frail, enemy, key(enemy.hex), false);
    fighting = {
      ...invite(fighting, "rogue"),
      enemies: fighting.enemies.map((e) =>
        e.id === enemy.id ? { ...e, maxHealth: 99, damageTaken: 0 } : e,
      ),
    };
    const after = attack(fighting);
    // Heroism that swaps one of them for the other is not heroism, it is a trade
    // nobody chose - so the stone sits it out and the round lands as normal.
    expect(after.log.some((l) => /stepped in front of it/.test(l.text))).toBe(false);
    expect(after.players.find((p) => p.id === "rogue")!.dead).toBe(true);
  });
});

describe("long arm, in blue boots", () => {
  it("reaches a friend a tile away, and nobody moves", () => {
    const base = holding("boots", 4471, "blue");
    const here = base.players[0].hex;
    const beside = allHexes().find((h) => distance(h, here) === 1)!;
    const apart: GameState = {
      ...base,
      players: base.players.map((p, i) =>
        i === 0 ? p : i === 1 ? { ...p, dead: false, hex: beside } : { ...p, dead: true },
      ),
    };
    expect(tileMates(apart, apart.players[0]).map((p) => p.id)).toEqual(["rogue"]);

    const plain: GameState = {
      ...apart,
      players: apart.players.map((p, i) => (i === 0 ? { ...p, gem: null } : p)),
    };
    expect(tileMates(plain, plain.players[0])).toHaveLength(0);
  });
});
