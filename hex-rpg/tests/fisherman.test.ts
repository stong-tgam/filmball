/**
 * The fisherman: the rod, the river, and the rope.
 *
 * The role is built on one trade - the worst fighter at the table, and the only one
 * who can feed it or move somebody who is not themselves - so most of what is worth
 * testing here is that the trade cannot be dodged in either direction.
 */

import { describe, expect, it } from "vitest";
import {
  canFish,
  canHook,
  fish,
  fishPerCast,
  hook,
  hookTargets,
  readFishCard,
  search,
} from "../src/game/actions";
import { createInitialState } from "../src/game/setup";
import {
  eat,
  give,
  giveTargets,
  heal,
  isMishap,
  readSearchCard,
  searchKind,
  tileMates,
  worthASecondLook,
} from "../src/game/actions";
import { activePlayer } from "../src/game/turn";
import { ROLES, TURN_ORDER, withMaxHealth } from "../src/game/players";
import {
  EQUIPMENT,
  FISHING_ROD,
  FISH,
  FISH_TO_UPGRADE,
  BONE,
  FOOD,
  SUPPLY_CAP,
  canTake,
  equip,
  makeItem,
} from "../src/game/items";
import { DIRS, allHexes, distance, key } from "../src/game/hex";
import { JOKER } from "../src/game/cards";
import type { Card, GameState, Player, Tile } from "../src/game/types";

const card = (rank: string, suit: Card["suit"]): Card => ({ rank, suit } as Card);
const fisherIndex = TURN_ORDER.indexOf("fisherman");

/** A game with the fisherman active and standing on a tile of the given sort. */
function fishing(pick: (t: Tile) => boolean, seed = 4471): GameState {
  const base = createInitialState(seed);
  const tile = Object.values(base.tiles).find(
    (t) => pick(t) && !base.enemies.some((e) => key(e.hex) === key(t.hex)),
  )!;
  return {
    ...base,
    activePlayerIndex: fisherIndex,
    players: base.players.map((p, i) => (i === fisherIndex ? { ...p, hex: tile.hex } : p)),
  };
}

const drawing = (state: GameState, next: Card): GameState => ({ ...state, searchDeck: [next] });
const fisher = (state: GameState): Player => state.players[fisherIndex];

describe("the rod", () => {
  it("is the one thing anybody starts holding, and it adds nothing", () => {
    const party = createInitialState(4471).players;
    const rods = party.filter((p) => p.weapon?.name === FISHING_ROD);
    expect(rods).toHaveLength(1);
    expect(rods[0].role).toBe("fisherman");
    expect(rods[0].weapon?.value).toBe(0);
    // Everybody else is empty-handed, so the rod is a role and not a head start.
    expect(party.filter((p) => p.weapon !== null)).toHaveLength(1);
  });

  it("cannot be swapped away, by a search or by anything else", () => {
    const sword = makeItem(EQUIPMENT.find((e) => e.slot === "weapon")!, "a-real-weapon");
    const rodder = fisher(createInitialState(4471));

    // A ground search equips what it finds without asking. Without the guard the role
    // evaporates on a lucky card and a child has no idea why they can no longer fish.
    expect(canTake(rodder, sword)).toBe(false);
    const { player: after, returned } = equip(rodder, sword);
    expect(after.weapon?.name).toBe(FISHING_ROD);
    expect(returned).toBe(sword);
  });

  it("is only the fisherman's to use", () => {
    for (const role of TURN_ORDER) {
      expect(ROLES[role].canFish).toBe(role === "fisherman");
    }
  });
});

describe("fishing", () => {
  it("needs the river, the rod and the role", () => {
    const onWater = fishing((t) => t.river);
    expect(canFish(onWater, fisher(onWater))).toBe(true);

    const onLand = fishing((t) => !t.river && t.base === "field");
    expect(canFish(onLand, fisher(onLand))).toBe(false);

    // The knight standing in the same river cannot.
    const knight = { ...onWater, activePlayerIndex: 0, players: onWater.players.map((p, i) =>
      i === 0 ? { ...p, hex: fisher(onWater).hex } : p) };
    expect(canFish(knight, activePlayer(knight))).toBe(false);

    const barehanded = { ...onWater, players: onWater.players.map((p, i) =>
      i === fisherIndex ? { ...p, weapon: null } : p) };
    expect(canFish(barehanded, fisher(barehanded))).toBe(false);
  });

  it("reads the card: nearly always a fish, a picture card is more than dinner", () => {
    expect(readFishCard(card("2", "clubs"))).toBe("fish");
    expect(readFishCard(card("10", "hearts"))).toBe("fish");
    expect(readFishCard(card("A", "spades"))).toBe("fish");
    expect(readFishCard(card("K", "hearts"))).toBe("treasure");
    expect(readFishCard(JOKER)).toBe("snag");
  });

  it("lands a fish that heals like any other food", () => {
    const state = drawing(fishing((t) => t.river), card("7", "clubs"));
    const after = fish(state);
    const caught = fisher(after).supply.filter((i) => i.name === FISH);
    expect(caught).toHaveLength(1);
    expect(caught[0].value).toBe(1);
    expect(caught[0].slot).toBe("supply");
    expect(fisher(after).fishCaught).toBe(1);
    expect(fisher(after).actedThisTurn).toBe(true);
  });

  it("comes up empty on the joker, and that is the only way it does", () => {
    const after = fish(drawing(fishing((t) => t.river), JOKER));
    expect(fisher(after).supply).toEqual([]);
    expect(after.find?.kind).toBe("nothing");
    // The one that got away costs a turn, never a health. Fishing must not hurt.
    expect(fisher(after).health).toBe(fisher(fishing((t) => t.river)).health);
  });

  it("is not once per tile the way a search is - a river restocks", () => {
    let state = drawing(fishing((t) => t.river), card("7", "clubs"));
    const spot = key(fisher(state).hex);
    state = fish(state);
    state = {
      ...state,
      searchDeck: [card("8", "clubs")],
      players: state.players.map((p, i) => (i === fisherIndex ? { ...p, actedThisTurn: false } : p)),
    };
    expect(canFish(state, fisher(state))).toBe(true);
    const twice = fish(state);
    expect(fisher(twice).supply.filter((i) => i.name === FISH)).toHaveLength(2);
    expect(key(fisher(twice).hex)).toBe(spot);
  });

  it("gives up its treasure once, and only once", () => {
    const water = fishing((t) => t.river);
    const first = fish(drawing(water, card("K", "hearts")));
    expect(first.tiles[key(fisher(first).hex)].searched).toBe(true);
    expect(fisher(first).money).toBeGreaterThan(fisher(water).money);

    const again = fish({
      ...first,
      searchDeck: [card("Q", "hearts")],
      players: first.players.map((p, i) => (i === fisherIndex ? { ...p, actedThisTurn: false } : p)),
    });
    // Still a fish. No second payday.
    expect(fisher(again).money).toBe(fisher(first).money);
    expect(fisher(again).fishCaught).toBeGreaterThan(fisher(first).fishCaught);
  });

  it("upgrades the rod on the third fish, once, and then brings up two", () => {
    let state = fishing((t) => t.river);
    expect(fishPerCast(fisher(state))).toBe(1);

    for (let i = 0; i < FISH_TO_UPGRADE; i++) {
      state = fish({
        ...state,
        searchDeck: [card("7", "clubs")],
        players: state.players.map((p, j) =>
          // Keep the pack clear so the cap is never what stops the count.
          j === fisherIndex ? { ...p, actedThisTurn: false, supply: [] } : p,
        ),
      });
    }

    const rod = fisher(state).weapon!;
    expect(rod.name).toBe(FISHING_ROD);
    expect(rod.value).toBe(1);
    expect(fishPerCast(fisher(state))).toBe(2);
    expect(state.log.some((l) => l.text.includes("proper rod"))).toBe(true);

    // It happens on crossing the line, not on being over it.
    const later = fish({
      ...state,
      searchDeck: [card("7", "clubs")],
      players: state.players.map((p, j) => (j === fisherIndex ? { ...p, actedThisTurn: false, supply: [] } : p)),
    });
    expect(fisher(later).weapon?.value).toBe(1);
    expect(fisher(later).supply.filter((i) => i.name === FISH)).toHaveLength(2);
  });

  it("puts nothing back that there is no room for", () => {
    const water = fishing((t) => t.river);
    const stuffed: GameState = {
      ...drawing(water, card("7", "clubs")),
      players: water.players.map((p, i) =>
        i === fisherIndex
          ? { ...p, supply: Array.from({ length: SUPPLY_CAP }, (_, n) => makeItem(EQUIPMENT[0], `x${n}`)) }
          : p,
      ),
    };
    const after = fish(stuffed);
    expect(fisher(after).supply).toHaveLength(SUPPLY_CAP);
    expect(after.log.at(-1)?.text).toContain("nowhere to put it");
  });
});

describe("the hook", () => {
  /** The fisherman and the knight standing next to each other. */
  /**
   * The fisherman with the knight next to them and nobody else in reach.
   *
   * The party now starts in pairs (see `startingSpots`), so somebody is beside the
   * fisherman from turn one - which is the point of that change and no use at all to a
   * test about how far a rope reaches. Everybody who is not the knight is walked out of
   * range first, so what these tests measure is the hook and not the setup.
   */
  function paired(seed = 4471): GameState {
    const base = createInitialState(seed);
    const rod = base.players[fisherIndex];
    const usable = (h: { q: number; r: number }) =>
      base.tiles[key(h)] && !base.enemies.some((e) => key(e.hex) === key(h));

    const spot = DIRS.map((d) => ({ q: rod.hex.q + d.q, r: rod.hex.r + d.r })).find(usable)!;
    const away = allHexes().filter(
      (h) => usable(h) && distance(h, rod.hex) > 1 && key(h) !== key(spot),
    );

    let next = 0;
    return {
      ...base,
      activePlayerIndex: fisherIndex,
      players: base.players.map((p, i) => {
        if (i === fisherIndex) return p;
        return { ...p, hex: i === 0 ? spot : away[next++] };
      }),
    };
  }

  it("reaches exactly one tile, and only for the fisherman", () => {
    const state = paired();
    const targets = hookTargets(state, fisher(state));
    expect(targets.map((p) => p.id)).toEqual(["knight"]);
    for (const t of targets) expect(distance(t.hex, fisher(state).hex)).toBe(1);

    // Nobody else has a rope, whatever they are holding.
    expect(hookTargets(state, state.players[0])).toEqual([]);
    expect(canHook({ ...state, activePlayerIndex: 0 }, state.players[0])).toBe(false);
  });

  it("reels a friend onto your tile - which walking may not do", () => {
    const state = paired();
    const before = key(fisher(state).hex);
    const after = hook(state, "knight", "pull");

    expect(key(after.players[0].hex)).toBe(before);
    expect(key(fisher(after).hex)).toBe(before);
    // Two players, one tile. `legalMoves` still forbids *walking* onto a friend; a
    // rope is not a walk, and this is how the party gets into one place.
    expect(fisher(after).actedThisTurn).toBe(true);
  });

  it("hauls you across to them instead, if that is the way round you want", () => {
    const state = paired();
    const knightSpot = key(state.players[0].hex);
    const after = hook(state, "knight", "cross");

    expect(key(fisher(after).hex)).toBe(knightSpot);
    expect(key(after.players[0].hex)).toBe(knightSpot);
    expect(fisher(after).actedThisTurn).toBe(true);
  });

  it("drags a friend with no health left to the doctor, which is the best thing it does", () => {
    const state = paired();
    const flat = state.players[0];
    const down: GameState = {
      ...state,
      players: state.players.map((p) => (p.id === flat.id ? { ...p, health: 0 } : p)),
    };
    expect(hookTargets(down, fisher(down)).map((p) => p.id)).toEqual(["knight"]);

    const hauled = hook(down, "knight", "pull");
    const moved = hauled.players[0];
    expect(key(moved.hex)).toBe(key(fisher(hauled).hex));
  });

  it("costs the action, so it is the turn's one thing", () => {
    const state = paired();
    const after = hook(state, "knight", "pull");
    expect(canHook(after, fisher(after))).toBe(false);
    expect(hook(after, "knight", "cross")).toBe(after);
  });

  it("will not reach somebody who is not next to you", () => {
    const state = paired();
    const far: GameState = {
      ...state,
      players: state.players.map((p, i) => (i === 0 ? { ...p, hex: { q: 0, r: 0 } } : p)),
    };
    expect(hookTargets(far, fisher(far))).toEqual([]);
    expect(hook(far, "knight", "pull")).toBe(far);
  });
});

describe("the trade the role is built on", () => {
  it("leaves the fisherman searching like anybody else on dry land", () => {
    const state = fishing((t) => !t.river && t.base === "forest");
    const after = search({ ...state, searchDeck: [card("9", "clubs")] });
    expect(after.find?.from).toBe("ground");
  });

  it("marks a cast as its own kind of find, so the card knows what to say", () => {
    const after = fish(drawing(fishing((t) => t.river), card("7", "clubs")));
    expect(after.find?.from).toBe("line");
    expect(after.find?.kind).toBe("fish");
    expect(after.find?.gained.map((i) => i.name)).toEqual([FISH]);
  });
});

describe("bugs the playtest found", () => {
  it("lets the doctor patch themselves up - the heal used to be undone", () => {
    const base = createInitialState(4471);
    const di = TURN_ORDER.indexOf("doctor");
    const hurt: GameState = {
      ...base,
      activePlayerIndex: di,
      players: base.players.map((p, i) => (i === di ? { ...p, health: 1 } : p)),
    };

    const healed = heal(hurt, "doctor");
    // Spending the action wrote the pre-heal snapshot of the healer back over the
    // patched-up one. Self-healing is the doctor's common case, not the rare one:
    // the party starts four tiles apart, so there is usually nobody else in reach.
    expect(healed.players[di].health).toBe(2);
    expect(healed.players[di].actedThisTurn).toBe(true);
  });

  it("refuses food that would heal nothing instead of swallowing it", () => {
    const base = createInitialState(4471);
    const bone = makeItem(FOOD.find((f) => f.name === BONE)!, "bone-1");
    const hungry: GameState = {
      ...base,
      players: base.players.map((p, i) => (i === 0 ? { ...p, health: 1, supply: [bone] } : p)),
    };
    // §12 makes the bone worthless on purpose - it sells for a dollar and a thief
    // takes it first. Eating it must not quietly destroy it for no health.
    expect(eat(hungry, "knight", "bone-1")).toBe(hungry);
    expect(hungry.players[0].supply).toHaveLength(1);

    const full: GameState = {
      ...base,
      players: base.players.map((p, i) =>
        i === 0 ? { ...p, supply: [makeItem(FOOD[0], "cake-1")] } : p,
      ),
    };
    expect(eat(full, "knight", "cake-1")).toBe(full);
  });

  it("still feeds anybody who is actually hungry, on anybody's turn", () => {
    const base = createInitialState(4471);
    const cake = makeItem(FOOD[0], "cake-2");
    const hungry: GameState = {
      ...base,
      activePlayerIndex: 2,
      players: base.players.map((p, i) => (i === 0 ? { ...p, health: 1, supply: [cake] } : p)),
    };
    const fed = eat(hungry, "knight", "cake-2");
    expect(fed.players[0].health).toBe(3);
    expect(fed.players[0].supply).toEqual([]);
  });
});

describe("standing together", () => {
  /** Two players on one tile, which is now a thing you can walk into. */
  /** Two named players on one tile, everybody else pushed to the far corner. */
  function together(seed = 4471): GameState {
    const base = createInitialState(seed);
    const away = { q: 0, r: 1 };
    return {
      ...base,
      activePlayerIndex: 0,
      players: base.players.map((p) =>
        p.id === "knight" || p.id === "rogue"
          ? { ...p, hex: base.players[0].hex }
          : { ...p, hex: away },
      ),
    };
  }

  it("lists everybody on your tile, and nobody who is merely next to you", () => {
    const state = together();
    expect(tileMates(state, state.players[0]).map((p) => p.id)).toEqual(["rogue"]);
    // A whole team starts stacked, which is what a team is; two teams do not.
    const fresh = createInitialState(4471);
    const mine = new Set(fresh.teams[0].memberIds);
    expect(tileMates(fresh, fresh.players[0]).every((p) => mine.has(p.id))).toBe(true);
  });

  it("hands something over without costing the turn's action", () => {
    const base = together();
    const cake = makeItem(FOOD[0], "cake-give");
    const state: GameState = {
      ...base,
      players: base.players.map((p, i) => (i === 0 ? { ...p, supply: [cake] } : p)),
    };

    const after = give(state, "rogue", "cake-give");
    expect(after.players[0].supply).toEqual([]);
    expect(after.players[1].supply.map((i) => i.id)).toEqual(["cake-give"]);
    // Walking to each other already cost both of them turns. That is the price.
    expect(after.players[0].actedThisTurn).toBe(false);
  });

  it("only ever offers what the other player can actually take", () => {
    const base = together();
    const coat = makeItem(EQUIPMENT.find((e) => e.slot === "armor")!, "spare-coat");
    const worn = makeItem(EQUIPMENT.filter((e) => e.slot === "armor")[1], "their-coat");
    const state: GameState = {
      ...base,
      players: base.players.map((p, i) =>
        i === 0 ? { ...p, armor: coat } : i === 1 ? { ...p, armor: worn } : p,
      ),
    };
    // The rogue is already wearing one. A trade that quietly costs them their coat is
    // an argument waiting to happen, so it is not offered at all.
    const offers = giveTargets(state, state.players[0]);
    const toTheRogue = offers.find((o) => o.player.id === "rogue");
    expect(toTheRogue?.items.map((i) => i.id) ?? []).not.toContain("spare-coat");
    expect(give(state, "rogue", "spare-coat")).toBe(state);
  });

  it("gives the knight somewhere to put a second coat, and nobody else", () => {
    const base = createInitialState(4471);
    const worn = makeItem(EQUIPMENT.find((e) => e.slot === "armor")!, "worn");
    const found = makeItem(EQUIPMENT.filter((e) => e.slot === "armor")[1], "found");

    const knight = { ...base.players[0], armor: worn };
    const kitted = equip(knight, found);
    expect(kitted.player.armor?.id).toBe("worn");
    expect(kitted.player.spareArmor?.id).toBe("found");
    expect(kitted.returned).toBeNull();

    // Everybody else swaps as before: a spare on the wrong back is never handed over.
    const rogue = { ...base.players[1], armor: worn };
    const swapped = equip(rogue, found);
    expect(swapped.player.armor?.id).toBe("found");
    expect(swapped.player.spareArmor).toBeNull();
    expect(swapped.returned?.id).toBe("worn");
  });

  it("lets the knight hand the spare to somebody with a bare back", () => {
    const base = together();
    const spare = makeItem(EQUIPMENT.find((e) => e.slot === "armor")!, "the-spare");
    const state: GameState = {
      ...base,
      players: base.players.map((p, i) => (i === 0 ? { ...p, spareArmor: spare } : p)),
    };

    const after = give(state, "rogue", "the-spare");
    expect(after.players[0].spareArmor).toBeNull();
    expect(after.players[1].armor?.id).toBe("the-spare");
    // Armour is max health in this game, so the receiver gets bigger on the spot.
    expect(after.players[1].maxHealth).toBeGreaterThan(state.players[1].maxHealth);
  });

  it("carries no weight: the spare does nothing for the knight holding it", () => {
    const base = createInitialState(4471);
    const spare = makeItem(EQUIPMENT.find((e) => e.slot === "armor")!, "dead-weight");
    const carrying = withMaxHealth({ ...base.players[0], spareArmor: spare });
    expect(carrying.maxHealth).toBe(base.players[0].maxHealth);
  });
});

describe("what the ground gives up", () => {
  const on = (base: "forest" | "field", who: number, seed = 4471): GameState => {
    const s = createInitialState(seed);
    const tile = Object.values(s.tiles).find(
      (t) => t.base === base && !t.river && !s.enemies.some((e) => key(e.hex) === key(t.hex)),
    )!;
    return {
      ...s,
      activePlayerIndex: who,
      players: s.players.map((p, i) => (i === who ? { ...p, hex: tile.hex } : p)),
    };
  };

  it("reads a low black card as something to eat, not as nothing", () => {
    // §6 made every black card a blank, which was two searches in five spent on a
    // card that says no. A turn is most of what a child gets to do.
    for (const rank of ["2", "3", "4", "5", "6"]) {
      expect(readSearchCard(card(rank, "clubs"))).toBe("supply");
    }
    for (const rank of ["7", "8", "9", "10", "A"]) {
      expect(readSearchCard(card(rank, "spades"))).toBe("nothing");
    }
    // The rest of §6 is untouched: red still finds, pictures still bite, joker robs.
    expect(readSearchCard(card("9", "hearts"))).toBe("found");
    expect(readSearchCard(card("K", "spades"))).toBe("nothing");
    expect(isMishap(card("K", "spades"))).toBe(true);
  });

  it("puts the food in the pack and leaves the gear pile alone", () => {
    const state = { ...on("field", 0), searchDeck: [card("4", "clubs")] };
    const after = search(state);
    expect(after.players[0].supply).toHaveLength(1);
    expect(after.players[0].supply[0].slot).toBe("supply");
    expect(after.itemPile).toEqual(state.itemPile);
    expect(after.find?.kind).toBe("gear");
  });

  it("gives the scout a second look in a wood, and only on a blank", () => {
    const si = TURN_ORDER.indexOf("scout");
    const woods = on("forest", si);
    const tile = woods.tiles[key(woods.players[si].hex)];
    const scout = woods.players[si];

    expect(worthASecondLook(scout, tile, card("9", "spades"))).toBe(true);
    // Not on a mishap - the role is a nose for good ground, not a shield from bad luck.
    expect(worthASecondLook(scout, tile, card("K", "spades"))).toBe(false);
    // Not on a find - that would be taking something away from them.
    expect(worthASecondLook(scout, tile, card("9", "hearts"))).toBe(false);
    expect(worthASecondLook(scout, tile, card("3", "clubs"))).toBe(false);

    // Nobody else gets it, and not on ground that is not theirs.
    const field = on("field", si);
    expect(worthASecondLook(field.players[si], field.tiles[key(field.players[si].hex)], card("9", "spades"))).toBe(false);
    const knight = on("forest", 0);
    expect(worthASecondLook(knight.players[0], tile, card("9", "spades"))).toBe(false);
  });

  it("actually draws the second card, and resolves that one", () => {
    const si = TURN_ORDER.indexOf("scout");
    const woods = on("forest", si);
    // A blank first, a find second. The scout should end up holding the gear.
    const state: GameState = { ...woods, searchDeck: [card("9", "spades"), card("9", "hearts")] };
    const after = search(state);
    expect(after.searchDeck).toHaveLength(0);
    expect(after.log.some((l) => l.text.includes("Second look"))).toBe(true);
    expect(after.find?.kind).toBe("gear");
    expect(after.itemPile.length).toBe(state.itemPile.length - 1);
  });

  it("searches a chestless stretch of river like any other ground", () => {
    const base = createInitialState(4471);
    const plain = Object.values(base.tiles).find((t) => t.river && !t.chest)!;
    const state: GameState = {
      ...base,
      activePlayerIndex: 0,
      players: base.players.map((p, i) => (i === 0 ? { ...p, hex: plain.hex } : p)),
      searchDeck: [card("4", "clubs")],
    };
    // Only a few stretches hold a chest. The rest are water you can fish and ground
    // you can turn over, which is what stops the river being a conveyor belt.
    expect(searchKind(plain)).toBe("ground");
    const after = search(state);
    expect(after.find?.from).toBe("ground");
    expect(after.players[0].supply).toHaveLength(1);
  });
});
