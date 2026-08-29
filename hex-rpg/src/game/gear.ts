/**
 * What a piece of gear is *for*, now that there is no damage to add it to.
 *
 * The problem this file solves: after v0.31 all five weapons were the same object with
 * a different drawing, and so were all five coats and all five pairs of boots. Fifteen
 * items, three actual behaviours. That is exactly the flatness the stones were invented
 * to fix in v0.26 and it came straight back the moment the dice left.
 *
 * **Two slots stay dead simple and one slot carries the whole decision.** A child can
 * be told the first two in a sentence each and never think about them again, which is
 * what buys the attention to spend on the third:
 *
 * | slot | what it does | how many kinds |
 * |---|---|---|
 * | coat | **+1 health**, and health is skills | one, all five identical |
 * | boots | **+10 seconds** on every clock, all fight | one, all five identical |
 * | your thing | **one rule you may break**, once a fight | five, one per suit plus a wild |
 *
 * Some gear being *just a coat* is deliberate. A game where every object is a special
 * rule is a game nobody can hold in their head, and "a coat is a health" is a sentence
 * a seven-year-old owns forever.
 *
 * **The rules are things the table does, not things the app checks.** "Noises allowed"
 * is not enforced anywhere and never will be - the app poses and times, the family
 * judges. That is what makes this the right home for depth: a rule card costs nothing
 * to adjudicate and changes how the next ninety seconds actually go.
 *
 * And each rule names a **suit**, which is the point of the whole slot: an ogre deals
 * a spade and the table asks *who has the sword?* Gear stops being a number nobody
 * mentions and becomes a reason to hand something to your sister.
 */

import type { Combat, Item, Player, Suit } from "./types";
import { FISHING_ROD } from "./items";
import { GAME_OF, type ChallengeKind } from "./challenges";

export type GearRule = {
  /** Which game it bends, or null for the one that works on anything. */
  game: ChallengeKind | null;
  /** On the button. */
  title: string;
  /** Read aloud. The whole rule, in one line a child can act on. */
  text: string;
};

/**
 * The five things, one per suit and a wild.
 *
 * Keyed by item name because that is what survives being found, sold, dropped and
 * re-found - and because `artslots.ts` already keys the drawings the same way, so a
 * family's own picture of the Broom is the picture on the Broom's button.
 */
export const GEAR_RULES: Record<string, GearRule> = {
  // Flat like a sheet of paper, and big enough for two.
  "Frying Pan": {
    game: "draw",
    title: "Both of you",
    text: "Two of you draw it, together, on the same paper.",
  },
  // It is a prop. Props make noises.
  "Wooden Sword": {
    game: "act",
    title: "Noises allowed",
    text: "You may make any sound you like. Still no words.",
  },
  // A line in the sand: pick both sides of it.
  "Big Stick": {
    game: "truth",
    title: "Call both",
    text: "Say True *and* Poo. One of you is right, and that counts.",
  },
  // A second shot at it.
  "Slingshot": {
    game: "puzzle",
    title: "Two goes",
    text: "Say an answer. If it is wrong, say one more.",
  },
  // Sweep it aside and start again with somebody else.
  Broom: {
    game: null,
    title: "Swap over",
    text: "Somebody else does this one instead - and you have already seen the card.",
  },
  // The fisherman's rod lives in this slot and can never be swapped away (`equip`
  // refuses), so without an entry here the fisherman would be the one role that can
  // never carry a rule at all. Theirs is patience, which is what a rod is: the
  // guessers get to draw the answer out of whoever is performing.
  [FISHING_ROD]: {
    game: null,
    title: "Reel it in",
    text: "The guessers may ask one question. Whoever is performing answers yes or no - by nodding.",
  },
};

/** The rule this item carries, or null if it is a coat, a pair of boots or lunch. */
export const ruleFor = (item: Item | null): GearRule | null =>
  item ? (GEAR_RULES[item.name] ?? null) : null;

/**
 * Whether a rule is worth anything against the card in play.
 *
 * A wild works on everything; the rest only on their own suit. Offered greyed out
 * rather than hidden, with the reason on it: a button that vanishes teaches nobody
 * that the Frying Pan is for hearts.
 */
export const rulePlaysOn = (rule: GearRule, suit: Suit): boolean =>
  rule.game === null || (suit !== "joker" && GAME_OF[suit] === rule.game);

/**
 * How many times one thing may be used in a fight.
 *
 * **This is what a fine (+2) piece is now.** It used to be a bigger number; there is no
 * number left, so being fine means *twice*. That keeps `FINE_VALUE` meaning "better"
 * everywhere - a fine coat is two health, fine boots are twenty seconds, and a fine
 * thing bends its rule twice.
 */
export const usesOf = (item: Item): number => Math.max(1, item.value);

/** Everybody in the fight who is holding a thing, with what it does. */
export function rulesInPlay(
  team: Player[],
  combat: Combat | null,
): { who: Player; item: Item; rule: GearRule; left: number }[] {
  return team.flatMap((who) => {
    const item = who.weapon;
    const rule = ruleFor(item);
    if (!item || !rule) return [];
    const spent = (combat?.gearUsed ?? []).filter((id) => id === item.id).length;
    return [{ who, item, rule, left: usesOf(item) - spent }];
  });
}

/**
 * One line saying what a piece of gear is for, wherever a piece of gear is drawn.
 *
 * In one place because it appears in four - the shop shelf, the find card, the party's
 * kit and the art room - and a coat that said different things in two of them would be
 * a rule the table could not settle by looking.
 */
export function gearBlurb(item: Item): string {
  const rule = ruleFor(item);
  if (rule) {
    const many = usesOf(item) > 1 ? ` Twice a fight.` : ` Once a fight.`;
    return `${rule.title} — ${rule.text}${many}`;
  }
  if (item.slot === "armor") {
    return `${item.value} more health, and health is skills.`;
  }
  if (item.slot === "boots") {
    return `${item.value * 10} more seconds on every clock in a fight.`;
  }
  return item.value > 0 ? `Worth ${item.value} health to whoever eats it.` : `Not food. Sell it.`;
}
