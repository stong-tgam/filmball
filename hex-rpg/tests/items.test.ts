import { describe, expect, it } from "vitest";
import {
  ARMOUR,
  BONE,
  BOOTS,
  CAKE,
  EQUIPMENT,
  FOOD,
  FOOD_PRICE,
  GEAR_PRICE,
  SUPPLY_CAP,
  WEAPONS,
  consume,
  createItemPile,
  equip,
  equipped,
  makeItem,
  shopStock,
} from "../src/game/items";
import {
  buy,
  canHeal,
  canSearch,
  canTrade,
  eat,
  heal,
  openShop,
  readSearchCard,
  search,
  sell,
  sellable,
  stockFor,
} from "../src/game/actions";
import { attack, endCombat, takeSpoil } from "../src/game/combat";
import { ENEMIES } from "../src/game/enemies";
import { withMaxHealth } from "../src/game/players";
import { hasMoved } from "../src/game/players";
import { createInitialState } from "../src/game/setup";
import { activePlayer, endTurn, moveRange, movePlayer } from "../src/game/turn";
import { makeRng } from "../src/game/rng";
import { distance, key, label } from "../src/game/hex";
import type { GameState, Player, Terrain } from "../src/game/types";

const game = (seed = 4471) => createInitialState(seed);

/** Stand the active player on the first tile of the given terrain. */
function standing(base: Terrain, state = game()): GameState {
  const tile = Object.values(state.tiles).find((t) => t.base === base && !t.river)!;
  return {
    ...state,
    players: state.players.map((p, i) => (i === 0 ? { ...p, hex: tile.hex } : p)),
  };
}

const gearOf = (name: string) => makeItem(EQUIPMENT.find((e) => e.name === name)!, name);
const SWORD = WEAPONS[0];
const COAT = ARMOUR[0];
const SHOES = BOOTS[0];

describe("the item pile", () => {
  it("holds the rulebook's fifteen pieces of gear, and no food", () => {
    const pile = createItemPile(makeRng(1));
    expect(pile).toHaveLength(15);
    expect(pile.some((i) => i.slot === "supply")).toBe(false);
    expect(pile.filter((i) => i.slot === "weapon")).toHaveLength(WEAPONS.length);
    expect(pile.filter((i) => i.slot === "armor")).toHaveLength(ARMOUR.length);
    expect(pile.filter((i) => i.slot === "boots")).toHaveLength(BOOTS.length);
  });

  it("prices everything the way §11 does", () => {
    for (const item of createItemPile(makeRng(1))) expect(item.cost).toBe(GEAR_PRICE);
    for (const food of FOOD) expect(food.cost).toBe(FOOD_PRICE);
  });

  it("makes every weapon +1 attack, every coat +1 health, every boot +1 tile", () => {
    for (const item of EQUIPMENT) expect(item.value).toBe(1);
  });

  it("gives every item its own id, so copies move independently", () => {
    const pile = createItemPile(makeRng(2));
    expect(new Set(pile.map((i) => i.id)).size).toBe(pile.length);
  });

  it("is shuffled reproducibly and differs between seeds", () => {
    expect(createItemPile(makeRng(3))).toEqual(createItemPile(makeRng(3)));
    const order = (seed: number) => createItemPile(makeRng(seed)).map((i) => i.id).join();
    expect(order(3)).not.toBe(order(4));
  });

  it("shows a city only the top few", () => {
    const pile = createItemPile(makeRng(5));
    expect(shopStock(pile)).toEqual(pile.slice(0, 3));
    expect(shopStock([])).toEqual([]);
  });
});

describe("wearing things", () => {
  const bare = (): Player => ({ ...game().players[0] });

  it("fills an empty slot", () => {
    const { player, returned } = equip(bare(), gearOf(SWORD));
    expect(player.weapon?.name).toBe(SWORD);
    expect(returned).toBeNull();
  });

  it("swaps what is already there and hands the old one back", () => {
    const armed = equip(bare(), gearOf(WEAPONS[3])).player;
    const { player, returned } = equip(armed, gearOf(SWORD));
    expect(player.weapon?.name).toBe(SWORD);
    expect(returned?.name).toBe(WEAPONS[3]);
  });

  it("keeps each slot separate", () => {
    let player = bare();
    for (const name of [SWORD, COAT, SHOES]) {
      player = equip(player, gearOf(name)).player;
    }
    expect(equipped(player, "weapon")?.name).toBe(SWORD);
    expect(equipped(player, "armor")?.name).toBe(COAT);
    expect(equipped(player, "boots")?.name).toBe(SHOES);
  });

  it("stacks food up to the cap and then refuses", () => {
    let player = bare();
    const bread = () => makeItem(FOOD[0]);
    for (let i = 0; i < SUPPLY_CAP; i++) player = equip(player, bread()).player;
    expect(player.supply).toHaveLength(SUPPLY_CAP);

    const { player: unchanged, returned } = equip(player, bread());
    expect(unchanged.supply).toHaveLength(SUPPLY_CAP);
    expect(returned).not.toBeNull();
  });

  it("boots add a tile of movement", () => {
    const player = bare();
    const booted = equip(player, gearOf(SHOES)).player;
    expect(moveRange(booted)).toBe(moveRange(player) + 1);
  });

  it("armour adds max health, per §12 - it is not a damage shield", () => {
    const player = bare();
    const coated = withMaxHealth(equip(player, gearOf(COAT)).player);
    expect(coated.maxHealth).toBe(player.maxHealth + 1);
  });
});

describe("eating", () => {
  const cake = FOOD.find((f) => f.name === CAKE)!;
  const bone = FOOD.find((f) => f.name === BONE)!;

  const hungry = (): Player => ({
    ...game().players[0],
    health: 1,
    maxHealth: 5,
    supply: [makeItem(cake, "cake")],
  });

  it("heals and leaves the pack", () => {
    const { player, used } = consume(hungry(), "cake");
    expect(used?.name).toBe(CAKE);
    expect(player.health).toBe(1 + cake.value);
    expect(player.supply).toEqual([]);
  });

  it("gives the cake two and everything else one, per §12", () => {
    expect(cake.value).toBe(2);
    expect(bone.value).toBe(0);
    for (const food of FOOD) {
      if (food.name === CAKE || food.name === BONE) continue;
      expect(food.value).toBe(1);
    }
  });

  it("never heals past the maximum", () => {
    const nearlyFull = { ...hungry(), health: 4, maxHealth: 5 };
    expect(consume(nearlyFull, "cake").player.health).toBe(5);
  });

  it("does nothing for food nobody is carrying, or for the dead", () => {
    expect(consume(hungry(), "nope").used).toBeNull();
    expect(consume({ ...hungry(), dead: true }, "cake").used).toBeNull();
  });

  it("works on another player's turn - it is not an action", () => {
    const state = game();
    const other = state.players[2];
    const fed: GameState = {
      ...state,
      players: state.players.map((p) =>
        p.id === other.id
          ? { ...p, health: 1, maxHealth: 5, supply: [makeItem(cake, "cake")] }
          : p,
      ),
    };
    const after = eat(fed, other.id, "cake");
    const healed = after.players.find((p) => p.id === other.id)!;

    expect(activePlayer(after).id).not.toBe(other.id);
    expect(healed.health).toBe(1 + cake.value);
    expect(healed.actedThisTurn).toBe(false);
  });
});

describe("searching", () => {
  it("is offered on open ground, in woods and round the streets", () => {
    // Cities became searchable alongside the mishaps: the shop and a rummage cost the
    // same one action, so on a city tile it is a choice rather than a free extra.
    const on = (base: Terrain) => {
      const state = standing(base);
      return canSearch(state, activePlayer(state));
    };
    expect(on("field")).toBe(true);
    expect(on("forest")).toBe(true);
    expect(on("city")).toBe(true);
  });

  it("reads the card the rulebook's way: red finds, black does not, joker is a thief", () => {
    expect(readSearchCard({ suit: "hearts", rank: "3" })).toBe("found");
    expect(readSearchCard({ suit: "diamonds", rank: "K" })).toBe("found");
    expect(readSearchCard({ suit: "spades", rank: "A" })).toBe("nothing");
    expect(readSearchCard({ suit: "clubs", rank: "7" })).toBe("nothing");
    expect(readSearchCard({ suit: "joker", rank: "Joker" })).toBe("thief");
  });

  it("gives up a tile's findings once and once only", () => {
    const first = search(standing("forest"));
    const player = activePlayer(first);
    expect(first.tiles[key(player.hex)].searched).toBe(true);
    expect(canSearch(first, player)).toBe(false);
    expect(search(first)).toBe(first);
  });

  it("spends the turn's action and one card", () => {
    const before = standing("field");
    const after = search(before);
    expect(activePlayer(after).actedThisTurn).toBe(true);
    expect(after.searchDeck.length).toBe(before.searchDeck.length - 1);
  });

  it("hands over a piece of gear on a red card", () => {
    const state: GameState = {
      ...standing("forest"),
      searchDeck: [{ suit: "hearts", rank: "9" }],
    };
    const after = search(state);
    const me = activePlayer(after);
    expect(after.itemPile.length).toBe(state.itemPile.length - 1);
    expect([me.weapon, me.armor, me.boots].filter(Boolean).length).toBe(1);
  });

  it("hands over nothing on a black card", () => {
    const state: GameState = {
      ...standing("forest"),
      searchDeck: [{ suit: "clubs", rank: "9" }],
    };
    const after = search(state);
    expect(after.itemPile).toEqual(state.itemPile);
    expect(after.log.at(-1)?.text).toContain("found nothing");
  });

  it("takes a dollar on the joker, and the bone first if there is one", () => {
    const base = standing("field");
    const jokered: GameState = { ...base, searchDeck: [{ suit: "joker", rank: "Joker" }] };

    const poorer = search(jokered);
    expect(activePlayer(poorer).money).toBe(activePlayer(base).money - 1);

    // Rulebook §12: the bone's one job is to be the thing a thief takes.
    const bone = makeItem(FOOD.find((f) => f.name === BONE)!, "bone");
    const withBone: GameState = {
      ...jokered,
      players: jokered.players.map((p, i) => (i === 0 ? { ...p, supply: [bone] } : p)),
    };
    const saved = search(withBone);
    expect(activePlayer(saved).money).toBe(activePlayer(withBone).money);
    expect(activePlayer(saved).supply).toEqual([]);
  });

  it("says so when the world has run out of gear", () => {
    const empty: GameState = {
      ...standing("field"),
      itemPile: [],
      searchDeck: [{ suit: "hearts", rank: "A" }],
    };
    const after = search(empty);
    expect(after.itemPile).toEqual([]);
    expect(activePlayer(after).actedThisTurn).toBe(true);
  });
});

describe("the market", () => {
  const shopping = () => openShop(standing("city"));

  it("only opens in a city, and opening it spends the action", () => {
    const state = standing("field");
    expect(canTrade(state, activePlayer(state))).toBe(false);
    expect(openShop(state)).toBe(state);
    expect(activePlayer(shopping()).actedThisTurn).toBe(true);
  });

  it("sells food that never runs out, and gear off the world's one pile", () => {
    const state = shopping();
    const stock = stockFor(state);
    expect(stock.food.length).toBeGreaterThan(0);
    expect(stock.gear).toEqual(state.itemPile.slice(0, 3));
  });

  it("takes the money and hands over the goods", () => {
    const state = shopping();
    const food = stockFor(state).food[0];
    const before = activePlayer(state);
    const after = buy(state, food.id);
    const me = activePlayer(after);

    expect(me.money).toBe(before.money - FOOD_PRICE);
    expect(me.supply).toHaveLength(1);
  });

  it("takes bought gear out of the pile for good", () => {
    const rich = shopping();
    const state: GameState = {
      ...rich,
      players: rich.players.map((p, i) => (i === 0 ? { ...p, money: 99 } : p)),
    };
    const item = stockFor(state).gear[0];
    const after = buy(state, item.id);

    expect(after.itemPile.some((i) => i.id === item.id)).toBe(false);
    expect(after.itemPile).toHaveLength(state.itemPile.length - 1);
  });

  it("pays out for what you sell - §11's main income", () => {
    const state = shopping();
    const stocked: GameState = {
      ...state,
      players: state.players.map((p, i) =>
        i === 0 ? { ...p, weapon: gearOf(SWORD) } : p,
      ),
    };
    const before = activePlayer(stocked);
    expect(sellable(before).map((i) => i.name)).toContain(SWORD);

    const after = sell(stocked, before.weapon!.id);
    expect(activePlayer(after).weapon).toBeNull();
    expect(activePlayer(after).money).toBe(before.money + GEAR_PRICE);
    expect(after.itemPile.some((i) => i.name === SWORD)).toBe(true);
  });

  it("drops the health a sold coat was providing", () => {
    const state = shopping();
    const coated: GameState = {
      ...state,
      players: state.players.map((p, i) =>
        i === 0 ? withMaxHealth({ ...p, armor: gearOf(COAT) }) : p,
      ),
    };
    const before = activePlayer(coated);
    const after = sell(coated, before.armor!.id);
    expect(activePlayer(after).maxHealth).toBe(before.maxHealth - 1);
    expect(activePlayer(after).health).toBeLessThanOrEqual(activePlayer(after).maxHealth);
  });

  it("refuses what the player cannot afford", () => {
    const state = shopping();
    const broke: GameState = {
      ...state,
      players: state.players.map((p, i) => (i === 0 ? { ...p, money: 0 } : p)),
    };
    expect(buy(broke, stockFor(broke).food[0].id)).toBe(broke);
  });

  it("refuses food when the pack is already full", () => {
    const state = shopping();
    const loaded: GameState = {
      ...state,
      players: state.players.map((p, i) =>
        i === 0
          ? {
              ...p,
              money: 99,
              supply: Array.from({ length: SUPPLY_CAP }, (_, n) => makeItem(FOOD[5], `b${n}`)),
            }
          : p,
      ),
    };
    expect(buy(loaded, stockFor(loaded).food[0].id)).toBe(loaded);
  });
});

describe("the doctor", () => {
  /** The doctor is last in turn order; put them on the clock. */
  const doctorsTurn = (state = game()): GameState => ({ ...state, activePlayerIndex: 3 });

  it("can patch up somebody next to them, as their action", () => {
    const state = doctorsTurn();
    const doctor = state.players[3];
    const patient = { ...state.players[0], hex: doctor.hex, health: 1 };
    const staged: GameState = {
      ...state,
      players: state.players.map((p) => (p.id === patient.id ? patient : p)),
    };

    expect(canHeal(staged, doctor)).toBe(true);
    const after = heal(staged, patient.id);
    expect(after.players[0].health).toBe(2);
    expect(activePlayer(after).actedThisTurn).toBe(true);
  });

  it("brings a fallen player back at one health, on the tile where they fell", () => {
    const state = doctorsTurn();
    const doctor = state.players[3];
    const fallen = {
      ...state.players[0],
      dead: true,
      health: 0,
      hex: doctor.hex,
      fellAt: doctor.hex,
      fellOn: state.turn,
    };
    const staged: GameState = {
      ...state,
      players: state.players.map((p) => (p.id === fallen.id ? fallen : p)),
    };
    const after = heal(staged, fallen.id);

    expect(after.players[0].dead).toBe(false);
    expect(after.players[0].health).toBe(1);
    expect(after.players[0].fellAt).toBeNull();
  });

  it("is the only role that can", () => {
    const state = game();
    for (const player of state.players) {
      const near = { ...state.players[1], hex: player.hex, health: 1 };
      const staged: GameState = {
        ...state,
        activePlayerIndex: state.players.findIndex((p) => p.id === player.id),
        players: state.players.map((p) => (p.id === near.id ? near : p)),
      };
      expect(canHeal(staged, player)).toBe(player.role === "doctor");
    }
  });

  it("cannot reach somebody across the board", () => {
    const state = doctorsTurn();
    const doctor = state.players[3];
    expect(canHeal(state, doctor)).toBe(
      state.players.some(
        (p) => p.id !== doctor.id && p.health < p.maxHealth && distance(p.hex, doctor.hex) <= 1,
      ),
    );
  });
});

describe("loot", () => {
  /** Beat the first enemy of a kind and return the settled state. */
  function beat(kind: "mob" | "midboss" | "finalboss") {
    const base = game();
    const enemy = base.enemies.find((e) => e.kind === kind)!;
    const state: GameState = {
      ...base,
      players: base.players.map((p, i) =>
        i === 0
          ? { ...p, hex: enemy.hex, health: 99, maxHealth: 99 }
          : { ...p, dead: true },
      ),
      enemies: base.enemies.map((e) =>
        e.id === enemy.id ? { ...e, damageTaken: e.maxHealth - 1 } : e,
      ),
      combat: {
        enemyId: enemy.id,
        playerId: base.players[0].id,
        from: key(enemy.hex),
        round: 0,
        playerRoll: null,
        toll: 0,
        spoils: [],
        picksLeft: 0,
      ambush: false,
        outcome: "ongoing",
      },
    };
    return { state: attack(state), enemyId: enemy.id };
  }

  it("drops what §10 says and lets the winner keep what §10 says", () => {
    for (const kind of ["mob", "midboss", "finalboss"] as const) {
      const { state } = beat(kind);
      expect(state.combat?.outcome).toBe("enemyDefeated");
      expect(state.combat?.spoils.length).toBeLessThanOrEqual(ENEMIES[kind].drops);
      expect(state.combat?.picksLeft).toBeLessThanOrEqual(ENEMIES[kind].picks);
    }
  });

  it("pays a small purse on top of the items", () => {
    // §10 is items-only, and this bends it deliberately: the amounts are small enough
    // that selling is still where the money is. Keep them that way.
    const before = game().players[0].money;
    expect(beat("mob").state.players[0].money).toBe(before + ENEMIES.mob.purse);
    expect(beat("midboss").state.players[0].money).toBe(before + ENEMIES.midboss.purse);
    expect(ENEMIES.mob.purse).toBeLessThan(GEAR_PRICE);
  });

  it("hands over an item when the winner keeps it, and counts the pick", () => {
    const { state } = beat("midboss");
    const prize = state.combat!.spoils[0];
    const after = takeSpoil(state, prize.id);
    const me = after.players[0];

    expect([me.weapon?.id, me.armor?.id, me.boots?.id]).toContain(prize.id);
    expect(after.combat?.picksLeft).toBe(state.combat!.picksLeft - 1);
  });

  it("stops once the picks are used up", () => {
    let { state } = beat("mob");
    while ((state.combat?.picksLeft ?? 0) > 0 && state.combat!.spoils.length > 0) {
      state = takeSpoil(state, state.combat!.spoils[0].id);
    }
    const spent = state;
    if (spent.combat!.spoils.length > 0) {
      expect(takeSpoil(spent, spent.combat!.spoils[0].id)).toBe(spent);
    }
  });

  it("puts everything left behind back into the pile", () => {
    const { state } = beat("finalboss");
    const left = state.combat!.spoils.length;
    const closed = endCombat(state);
    expect(closed.combat).toBeNull();
    expect(closed.itemPile.length).toBe(state.itemPile.length + left);
  });

  it("wins the game when the dragon goes down", () => {
    const { state } = beat("finalboss");
    expect(state.ending).toBe("victory");
  });
});

describe("one action a turn", () => {
  it("stops a player searching twice by walking on", () => {
    const searched = search(standing("forest"));
    const player = activePlayer(searched);
    expect(canSearch(searched, { ...player, actedThisTurn: true })).toBe(false);
  });

  it("counts a fight as the action", () => {
    const base = game();
    const enemy = base.enemies.find((e) => e.kind === "mob")!;
    const next = { q: enemy.hex.q, r: enemy.hex.r };
    const state: GameState = {
      ...base,
      players: base.players.map((p, i) =>
        i === 1 ? { ...p, hex: { q: next.q - 1, r: next.r } } : { ...p, dead: true },
      ),
      activePlayerIndex: 1,
    };
    const fighting = movePlayer(state, label(next));
    expect(fighting.players[1].actedThisTurn).toBe(true);
  });

  it("hands the next player a clean slate", () => {
    const after = endTurn(search(standing("field")));
    expect(activePlayer(after).actedThisTurn).toBe(false);
    expect(hasMoved(activePlayer(after))).toBe(false);
  });
});
