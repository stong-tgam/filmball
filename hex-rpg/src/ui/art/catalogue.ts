/**
 * Every picture in the game, in one list.
 *
 * The point of this file is that **nothing can be left out by accident**. The slots
 * were scattered across a dozen components as inline template strings, so the only way
 * to know what could be replaced was to read all of them - and the art room would have
 * quietly missed anything added later. This reads the slots off the game's own data, so
 * a new piece of gear, a new stone or a new monster turns up here on its own.
 *
 * Only slots the **game** actually honours are listed. A slot the art room offers and
 * nothing reads is a promise the app does not keep, and a child who draws a picture
 * that never appears will not draw a second one.
 */

import { EQUIPMENT, FOOD } from "../../game/items";
import { ENEMIES } from "../../game/enemies";
import { GEMS } from "../../game/gems";
import { ROLES, TURN_ORDER } from "../../game/players";
import { ALL_FEATURES } from "../../game/combat";
import { gemSlot } from "./gems";
import { monsterSlot } from "./monsters";
import { roleSlot } from "./roles";
import type { ArtSlot } from "./overrides";
import type { EnemyKind, Feature, GemKind, Role } from "../../game/types";

export type ArtEntry = {
  slot: ArtSlot;
  /** What to call it in the art room. */
  name: string;
  /** One line about what the picture is for, so a child knows what to draw. */
  hint: string;
};

export type ArtShelf = {
  title: string;
  /** Why this shelf matters, for the person doing the drawing. */
  blurb: string;
  entries: ArtEntry[];
};

/**
 * The shelves, in the order they are worth drawing.
 *
 * People and monsters first: they are on screen constantly and at the biggest size, so
 * a drawing there changes how the whole game looks. Food is last - there are twenty-odd
 * of them and each one appears as a thumbnail in a pack.
 */
export function shelves(): ArtShelf[] {
  const gear = EQUIPMENT.filter((item) => item.slot !== "supply");

  return [
    {
      title: "The party",
      blurb: "The five of you. These are the biggest pictures in the game — they are on the title screen and on every turn banner.",
      entries: TURN_ORDER.map((role: Role) => ({
        slot: roleSlot(role),
        name: ROLES[role].name,
        hint: ROLES[role].blurb,
      })),
    },
    {
      title: "Monsters",
      blurb: "One picture each. Every bandit on the board shares the bandit drawing, which is right — to the party they are all just bandits.",
      entries: (Object.keys(ENEMIES) as EnemyKind[]).map((kind) => ({
        slot: monsterSlot(kind),
        name: ENEMIES[kind].name,
        hint: ENEMIES[kind].blurb,
      })),
    },
    {
      title: "Stones",
      blurb: "Three colours. Whatever you draw, keep them telling each other apart from across the table — colour is how a child knows which one they have.",
      entries: (Object.keys(GEMS) as GemKind[]).map((kind) => ({
        slot: gemSlot(kind),
        name: GEMS[kind].name,
        hint: `${GEMS[kind].theme} — three powers, one for each place you can put it.`,
      })),
    },
    {
      title: "Gear",
      blurb: "The fifteen things in the game. A picture here shows up in the fight, on the shop shelf, in the party's kit and on the card when it is found.",
      entries: gear.map((item) => ({
        slot: `item:${item.name}`,
        name: item.name,
        hint:
          item.slot === "weapon"
            ? "A weapon. Adds to what you roll."
            : item.slot === "armor"
            ? "A coat. Adds a health."
            : "Boots. An extra tile, and a better chance of running away.",
      })),
    },
    {
      title: "Boss features",
      blurb: "The card a monster turns over before a fight — what the ground does for it.",
      entries: ALL_FEATURES.map((feature: Feature) => ({
        slot: `feature:${feature}`,
        name: feature,
        hint: FEATURE_HINT[feature],
      })),
    },
    {
      title: "Food",
      blurb: "Small pictures, in a pack. Worth doing last, and worth doing at all — food is the thing a child looks at most.",
      entries: FOOD.map((item) => ({
        slot: `item:${item.name}`,
        name: item.name,
        hint: item.value > 0 ? `Eat it for ${item.value} health.` : "No use as food. Sells for a dollar.",
      })),
    },
  ];
}

const FEATURE_HINT: Record<Feature, string> = {
  water: "It can slip away downriver, once.",
  railway: "It starts the fight with a health in hand.",
  city: "A dollar on a city tile, a health anywhere else.",
  forest: "Everybody hits it one softer.",
  field: "It hits back one harder.",
};

/** Every slot the game honours, flat. */
export const everySlot = (): ArtEntry[] => shelves().flatMap((shelf) => shelf.entries);
