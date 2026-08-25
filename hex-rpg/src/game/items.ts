/**
 * Equipment, food, and the pile everything comes out of. Rulebook §10-§12.
 *
 * There is one pile of gear for the whole game. Cities sell from it, searches turn it
 * up, and beaten enemies drop it. Food is the exception: a city has as much as anyone
 * can pay for.
 *
 * Gear comes in two grades. Ordinary gear is +1 - one attack, one health, one tile -
 * and **fine** gear is +2. The name never changes between the two, only the number, so
 * a Frying Pan +2 is still a Frying Pan: the names are the point, because a
 * seven-year-old would rather find Bunny Slippers than Boots, and keeping the name
 * stable is also what lets the artwork look itself up.
 *
 * Where +2 comes from is the whole progression: ordinary monsters never drop it, mid
 * bosses sometimes do, and a chest in the river is the best odds in the game. See
 * `ENEMIES[kind].fineChance` and `FINE_CHEST_CHANCE`.
 */

import type { Rng } from "./rng";
import type { Item, ItemSlot, Player } from "./types";

export type ItemTemplate = {
  name: string;
  slot: ItemSlot;
  cost: number;
  value: number;
};

/** Rulebook §11: gear is $2 to buy and $2 to sell, food is $1. */
export const GEAR_PRICE = 2;
export const FOOD_PRICE = 1;

export const WEAPONS = ["Wooden Sword", "Frying Pan", "Slingshot", "Big Stick", "Broom"];
export const ARMOUR = ["Pot Helmet", "Turtle Shell", "Winter Coat", "Cardboard Box", "Oven Mitts"];
export const BOOTS = ["Running Shoes", "Rain Boots", "Roller Skates", "Bunny Slippers", "Flippers"];

/** Rulebook §12: all fifteen go in, so every game has a different set to find. */
export const EQUIPMENT: ItemTemplate[] = [
  ...WEAPONS.map((name) => ({ name, slot: "weapon" as const, cost: GEAR_PRICE, value: 1 })),
  ...ARMOUR.map((name) => ({ name, slot: "armor" as const, cost: GEAR_PRICE, value: 1 })),
  ...BOOTS.map((name) => ({ name, slot: "boots" as const, cost: GEAR_PRICE, value: 1 })),
];

/**
 * The fisherman's rod. Not in `EQUIPMENT`, so it is never in the pile, never in a
 * shop, and never dropped by anything - there is exactly one in the game and one
 * person holds it.
 *
 * It sits in the weapon slot and adds **nothing** to a roll, which is the trade the
 * whole role is built on: the fisherman is the worst fighter at the table and the
 * only one who can feed it. `FISH_TO_UPGRADE` fish in and it becomes a **+1** - an
 * ordinary weapon, not a fine one, because `FINE_VALUE` is what the best chest in the
 * game pays out and three fish should not beat that. So the fisherman is the one
 * character who earns their weapon by doing their job rather than by finding one.
 */
export const FISHING_ROD = "Fishing Rod";
export const ROD_TEMPLATE: ItemTemplate = {
  name: FISHING_ROD,
  slot: "weapon",
  cost: GEAR_PRICE,
  value: 0,
};

/** A caught fish. Ordinary food - one health - and the river never runs out. */
export const FISH = "Fish";
export const FISH_TEMPLATE: ItemTemplate = {
  name: FISH,
  slot: "supply",
  cost: FOOD_PRICE,
  value: 1,
};

/** How many fish it takes before the rod is a proper rod. */
export const FISH_TO_UPGRADE = 3;

export const isRod = (item: Item | null): boolean => item?.name === FISHING_ROD;

/** Cake heals two, the bone heals nothing, everything else heals one. */
export const CAKE = "Birthday Cake";
export const BONE = "Bone";

const PLAIN_FOOD = [
  "Sunny Side Up Egg", "Milk", "Lettuce", "Popsicle", "Orange", "Carrot", "Strawberry",
  "Candy", "Watermelon Slice", "Banana", "Apple Pie", "Hot Dog", "Corn on the Cob",
  "Pancakes", "Grilled Cheese", "Cherries", "Mushroom", "Honey Jar", "Jam Sandwich",
  "Pretzel", "Cookie",
];

export const FOOD: ItemTemplate[] = [
  { name: CAKE, slot: "supply", cost: FOOD_PRICE, value: 2 },
  // Rulebook §12: worthless as food, sells for a dollar, and a thief takes it first.
  { name: BONE, slot: "supply", cost: FOOD_PRICE, value: 0 },
  ...PLAIN_FOOD.map((name) => ({ name, slot: "supply" as const, cost: FOOD_PRICE, value: 1 })),
];

/** How much food one player can carry. The rulebook caps gear, not food; this keeps
 *  a pack from becoming an infinite health bar. */
export const SUPPLY_CAP = 4;

/** How many items of the pile a city has on its shelves at once. */
export const SHOP_WINDOW = 3;

/** What a fine piece of gear is worth. Ordinary gear is 1. */
export const FINE_VALUE = 2;

export const isFine = (item: Item): boolean => item.slot !== "supply" && item.value >= FINE_VALUE;

/**
 * The same piece of gear, but a good one. Deliberately a transformation of an existing
 * item rather than a separate pile: there are fifteen pieces of gear in the game and
 * that is the whole stock, so a +2 has to be one of them found in better condition.
 */
export const makeFine = (item: Item): Item =>
  item.slot === "supply" ? item : { ...item, value: FINE_VALUE };

/**
 * "Frying Pan +2". Numbers are never handwritten, so the UI reads this, not the name.
 *
 * A "+0" is not a grade, it is a piece of gear that does nothing, and printing it
 * invites a child to hunt for the +1 version of a thing that has none. Only the
 * fisherman's rod is ever worth nothing, and it is worth nothing on purpose.
 */
export const gearLabel = (item: Item): string =>
  item.slot === "supply" || item.value === 0 ? item.name : `${item.name} +${item.value}`;

let counter = 0;
export const makeItem = (template: ItemTemplate, id?: string): Item => ({
  id: id ?? `${template.name.toLowerCase().replace(/[^a-z]+/g, "-")}-${++counter}`,
  name: template.name,
  slot: template.slot,
  cost: template.cost,
  value: template.value,
});

/** The game's whole stock of gear, shuffled. Fifteen pieces, and that is all there is. */
export function createItemPile(rng: Rng): Item[] {
  return rng.shuffle(
    EQUIPMENT.map((template) =>
      makeItem(template, template.name.toLowerCase().replace(/[^a-z]+/g, "-")),
    ),
  );
}

/** A random piece of food, for shops and for events that hand it out. */
export const randomFood = (rng: Rng, id?: string): Item => makeItem(rng.pick(FOOD), id);

/** What a city currently has on the shelf. */
export const shopStock = (pile: Item[]): Item[] => pile.slice(0, SHOP_WINDOW);

export const equipped = (player: Player, slot: ItemSlot): Item | null =>
  slot === "weapon" ? player.weapon : slot === "armor" ? player.armor : slot === "boots" ? player.boots : null;

export const slotKey = (slot: ItemSlot): "weapon" | "armor" | "boots" =>
  slot === "weapon" ? "weapon" : slot === "armor" ? "armor" : "boots";

/** Everything the player is carrying that could be sold or stolen. */
export const carriedGear = (player: Player): Item[] =>
  [player.weapon, player.armor, player.boots].filter((i): i is Item => i !== null);

/**
 * Put an item on. Rulebook §10: one weapon, one coat, one pair of boots - so anything
 * already in that slot comes off, and goes back to the pile for somebody else.
 *
 * Food goes into the pack instead, up to `SUPPLY_CAP`. A full pack refuses.
 */
export function equip(player: Player, item: Item): { player: Player; returned: Item | null } {
  if (item.slot === "supply") {
    if (player.supply.length >= SUPPLY_CAP) return { player, returned: item };
    return { player: { ...player, supply: [...player.supply, item] }, returned: null };
  }
  // The rod is not swappable. A ground search equips what it finds without asking,
  // so without this the fisherman loses the whole role to a lucky card and a child
  // has no idea why they can no longer fish.
  if (item.slot === "weapon" && isRod(player.weapon)) return { player, returned: item };

  const returned = equipped(player, item.slot);
  return { player: { ...player, [slotKey(item.slot)]: item }, returned };
}

/** Whether taking this would actually do anything for the player. */
export const canTake = (player: Player, item: Item): boolean =>
  item.slot === "supply"
    ? player.supply.length < SUPPLY_CAP
    : !(item.slot === "weapon" && isRod(player.weapon));

/**
 * Eat something. Heals up to the player's maximum and leaves the pack. The bone heals
 * nothing at all, which is the joke and also the point of carrying it.
 */
export function consume(player: Player, itemId: string): { player: Player; used: Item | null } {
  const item = player.supply.find((i) => i.id === itemId);
  if (!item || player.dead) return { player, used: null };
  return {
    player: {
      ...player,
      health: Math.min(player.maxHealth, player.health + item.value),
      supply: player.supply.filter((i) => i.id !== itemId),
    },
    used: item,
  };
}
