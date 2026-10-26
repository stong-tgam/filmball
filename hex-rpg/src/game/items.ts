/**
 * Equipment, food, and the pile everything comes out of.
 *
 * There is one pile of gear for the whole game. Cities sell from it, searches turn it
 * up, and beaten bosses drop it - so the axe somebody finds in the woods on turn 4 is
 * an axe nobody else can buy. It can run out. Food is the exception: cities have as
 * much as anyone can pay for.
 *
 * PLACEHOLDER PRICES AND VALUES. The rulebook sets these and it is missing. They are
 * picked so that a weapon is worth saving for, armour is worth as much as a weapon,
 * and nobody can shop their way to the dragon without finding something.
 */

import type { Rng } from "./rng";
import type { Item, ItemSlot, Player } from "./types";

export type ItemTemplate = {
  name: string;
  slot: ItemSlot;
  cost: number;
  /** Weapons add to damage, armour takes it off, boots add tiles, food heals. */
  value: number;
  /** How many exist in the whole game. Food is unlimited and has none. */
  copies: number;
};

export const EQUIPMENT: ItemTemplate[] = [
  { name: "Big Stick", slot: "weapon", cost: 3, value: 1, copies: 3 },
  { name: "Sword", slot: "weapon", cost: 6, value: 2, copies: 2 },
  { name: "Great Axe", slot: "weapon", cost: 10, value: 3, copies: 1 },
  { name: "Leather Jerkin", slot: "armor", cost: 4, value: 1, copies: 3 },
  { name: "Chain Mail", slot: "armor", cost: 8, value: 2, copies: 2 },
  { name: "Fast Boots", slot: "boots", cost: 6, value: 1, copies: 2 },
];

/** Always for sale in a city, never in the pile. */
export const FOOD: ItemTemplate[] = [
  { name: "Bread", slot: "supply", cost: 2, value: 2, copies: 0 },
  { name: "Hot Stew", slot: "supply", cost: 4, value: 4, copies: 0 },
];

/** How much food one player can carry. */
export const SUPPLY_CAP = 3;

/** How many items of the pile a city has on its shelves at once. */
export const SHOP_WINDOW = 3;

let counter = 0;
/** Items need distinct ids: there are three Big Sticks and they move separately. */
export const makeItem = (template: ItemTemplate, id?: string): Item => ({
  id: id ?? `${template.name.toLowerCase().replace(/\s+/g, "-")}-${++counter}`,
  name: template.name,
  slot: template.slot,
  cost: template.cost,
  value: template.value,
});

/** The game's whole stock of gear, shuffled. */
export function createItemPile(rng: Rng): Item[] {
  const all = EQUIPMENT.flatMap((template) =>
    Array.from({ length: template.copies }, (_, i) =>
      makeItem(template, `${template.name.toLowerCase().replace(/\s+/g, "-")}-${i + 1}`),
    ),
  );
  return rng.shuffle(all);
}

/** What a city currently has on the shelf. */
export const shopStock = (pile: Item[]): Item[] => pile.slice(0, SHOP_WINDOW);

export const equipped = (player: Player, slot: ItemSlot): Item | null =>
  slot === "weapon" ? player.weapon : slot === "armor" ? player.armor : slot === "boots" ? player.boots : null;

/**
 * Put an item on. One weapon, one coat, one pair of boots - so anything already in
 * that slot comes off, and goes back to the pile for somebody else to find.
 *
 * Food goes into the pack instead, up to `SUPPLY_CAP`. A full pack refuses.
 */
export function equip(player: Player, item: Item): { player: Player; returned: Item | null } {
  if (item.slot === "supply") {
    if (player.supply.length >= SUPPLY_CAP) return { player, returned: item };
    return { player: { ...player, supply: [...player.supply, item] }, returned: null };
  }

  const returned = equipped(player, item.slot);
  const slot = item.slot === "weapon" ? "weapon" : item.slot === "armor" ? "armor" : "boots";
  return { player: { ...player, [slot]: item }, returned };
}

/** Whether taking this would actually do anything for the player. */
export const canTake = (player: Player, item: Item): boolean =>
  item.slot !== "supply" || player.supply.length < SUPPLY_CAP;

/** Eat something. Heals up to the player's maximum and leaves the pack. */
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
