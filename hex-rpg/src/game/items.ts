/**
 * Equipment, food, and the pile everything comes out of. Rulebook §10-§12.
 *
 * There is one pile of gear for the whole game. Cities sell from it, searches turn it
 * up, and beaten enemies drop it. Food is the exception: a city has as much as anyone
 * can pay for.
 *
 * Gear is deliberately flat - every weapon is +1 attack, every coat +1 health, every
 * pair of boots +1 tile. What differs is the name, and the names are the point: a
 * seven-year-old would rather find Bunny Slippers than Boots.
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

  const returned = equipped(player, item.slot);
  return { player: { ...player, [slotKey(item.slot)]: item }, returned };
}

/** Whether taking this would actually do anything for the player. */
export const canTake = (player: Player, item: Item): boolean =>
  item.slot !== "supply" || player.supply.length < SUPPLY_CAP;

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
