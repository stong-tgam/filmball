/**
 * The event deck. Rulebook §13.
 *
 * Once a round the starting player turns over a poker card. A jack, queen or king
 * brings an event; anything else is a quiet round.
 *
 * §13's targeting rule is the important one, and it is honoured card by card:
 * **terrain events hit every player standing on that terrain; encounter events hit
 * only the player who drew.** Each card below says which it is.
 *
 * Cards that need something to be remembered until later - *Foggy morning*, *Trade
 * caravan*, *Scarecrow*, *Lost puppy* - are not in the deck. They need a modifier
 * system that does not exist yet, and half-implementing them would mean a rule the
 * table can see on the card but the game quietly ignores. When modifiers arrive, they
 * belong here with the rest.
 */

import { key } from "./hex";
import { BONE, carriedGear, equip, makeItem, randomFood, FOOD } from "./items";
import { maxHealthOf, withMaxHealth } from "./players";
import { makeRng } from "./rng";
import type { EventCard, GameState, Item, LogEntry, Player, Terrain } from "./types";

type Target = "terrain" | "encounter" | "everyone";

type EventDefinition = EventCard & {
  /** §13: who the card reaches. Written on every card, as the rulebook asks. */
  target: Target;
  apply: (state: GameState) => GameState;
};

const note = (state: GameState, text: string): GameState => ({
  ...state,
  log: [...state.log, { turn: state.turn, text } satisfies LogEntry],
});

const active = (state: GameState): Player => state.players[state.activePlayerIndex];

/** Is this player standing on that kind of ground? */
function standingOn(state: GameState, player: Player, terrain: Terrain | "river" | "railroad"): boolean {
  const tile = state.tiles[key(player.hex)];
  if (!tile) return false;
  if (terrain === "river") return tile.river;
  if (terrain === "railroad") return tile.rail;
  return tile.sides.includes(terrain);
}

const living = (state: GameState): Player[] => state.players.filter((p) => !p.dead);

/** Apply a change to every living player who passes the filter. */
const each = (
  state: GameState,
  who: (p: Player) => boolean,
  change: (p: Player, s: GameState) => Player,
): GameState => ({
  ...state,
  players: state.players.map((p) => (p.dead || !who(p) ? p : change(p, state))),
});

const onlyDrawer = (state: GameState, change: (p: Player) => Player): GameState =>
  each(state, (p) => p.id === active(state).id, change);

const damage = (player: Player, amount: number, turn: number): Player => {
  const health = Math.max(0, player.health - amount);
  return {
    ...player,
    health,
    dead: health === 0,
    fellAt: health === 0 ? player.hex : player.fellAt,
    fellOn: health === 0 ? turn : player.fellOn,
  };
};

const healed = (player: Player, amount: number): Player => ({
  ...player,
  health: Math.min(player.maxHealth, player.health + amount),
});

const poorer = (player: Player, amount: number): Player => ({
  ...player,
  money: Math.max(0, player.money - amount),
});

/** Hand somebody the top of the item pile. */
function givePileItem(state: GameState, playerId: string): GameState {
  if (state.itemPile.length === 0) return note(state, "There is nothing left in the world to give.");
  const [gift, ...rest] = state.itemPile;
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return state;
  const { player: carrying, returned } = equip(player, gift);
  return note(
    {
      ...state,
      itemPile: returned ? [...rest, returned] : rest,
      players: state.players.map((p) => (p.id === playerId ? withMaxHealth(carrying) : p)),
    },
    `${player.name} received ${gift.name}.`,
  );
}

/** Hand everybody a piece of food, if they have room for it. */
const feed = (state: GameState, who: (p: Player) => boolean, helpings = 1): GameState => {
  const rng = makeRng(state.rngState);
  let next: GameState = { ...state, rngState: 0 };
  const players = state.players.map((p) => {
    if (p.dead || !who(p)) return p;
    let fed = p;
    for (let i = 0; i < helpings; i++) {
      fed = equip(fed, randomFood(rng, `event-${state.turn}-${p.id}-${i}`)).player;
    }
    return fed;
  });
  next = { ...next, players, rngState: rng.state() };
  return next;
};

/** Give up one thing: a piece of food if you have any, otherwise a health. */
const surrenderFoodOrHealth = (state: GameState, player: Player, want?: string): Player => {
  const match = want
    ? player.supply.find((i) => i.name === want)
    : player.supply[0];
  if (match) return { ...player, supply: player.supply.filter((i) => i.id !== match.id) };
  return damage(player, 1, state.turn);
};

export const EVENTS: EventDefinition[] = [
  /* ------------------------------------------------------------- negative */
  {
    id: "poisoned-frog",
    title: "Poisoned Frog",
    text: "Everyone standing in a forest takes 1 damage.",
    target: "terrain",
    apply: (s) => each(s, (p) => standingOn(s, p, "forest"), (p) => damage(p, 1, s.turn)),
  },
  {
    id: "falling-squirrel",
    title: "Falling Squirrel",
    text: "Straight out of a tree. Everyone in a forest loses 1 health.",
    target: "terrain",
    apply: (s) => each(s, (p) => standingOn(s, p, "forest"), (p) => damage(p, 1, s.turn)),
  },
  {
    id: "bird-poop",
    title: "Bird Poop",
    text: "Out in the open with nowhere to hide. Everyone on a field loses 1 health.",
    target: "terrain",
    apply: (s) => each(s, (p) => standingOn(s, p, "field"), (p) => damage(p, 1, s.turn)),
  },
  {
    id: "too-much-beer",
    title: "Too Much Beer",
    text: "Anyone by the river slips in and loses something.",
    target: "terrain",
    apply: (s) =>
      each(s, (p) => standingOn(s, p, "river"), (p) => surrenderFoodOrHealth(s, p)),
  },
  {
    id: "stepped-on-gum",
    title: "Stepped on Gum",
    text: "Anyone in a city is stuck fast — no moving this turn, but you can still act.",
    target: "terrain",
    apply: (s) =>
      each(s, (p) => standingOn(s, p, "city"), (p) => ({ ...p, movedThisTurn: true })),
  },
  {
    id: "lost-kitty",
    title: "Lost Kitty",
    text: "It wants feeding. Give it something, or it scratches you.",
    target: "encounter",
    apply: (s) => onlyDrawer(s, (p) => surrenderFoodOrHealth(s, p)),
  },
  {
    id: "a-dog-appears",
    title: "A Dog Appears",
    text: "Give it a bone, or lose 1 health.",
    target: "encounter",
    apply: (s) => onlyDrawer(s, (p) => surrenderFoodOrHealth(s, p, BONE)),
  },
  {
    id: "dropped-your-wallet",
    title: "Dropped Your Wallet",
    text: "Somewhere back down the road. Lose $1.",
    target: "encounter",
    apply: (s) => onlyDrawer(s, (p) => poorer(p, 1)),
  },

  /* ------------------------------------------------------------- positive */
  {
    id: "christmas",
    title: "Christmas",
    text: "Presents all round. Everyone gets an item.",
    target: "everyone",
    apply: (s) => living(s).reduce((acc, p) => givePileItem(acc, p.id), s),
  },
  {
    id: "your-birthday",
    title: "Your Birthday",
    text: "The player who drew gets an item.",
    target: "encounter",
    apply: (s) => givePileItem(s, active(s).id),
  },
  {
    id: "lemonade-stand",
    title: "Lemonade Stand",
    text: "Busy corner, good day. Everyone gains $1.",
    target: "everyone",
    apply: (s) => each(s, () => true, (p) => ({ ...p, money: p.money + 1 })),
  },
  {
    id: "farmers-market",
    title: "Farmer's Market",
    text: "Everyone on a field takes two lots of food.",
    target: "terrain",
    apply: (s) => feed(s, (p) => standingOn(s, p, "field"), 2),
  },
  {
    id: "fishing-trip",
    title: "Fishing Trip",
    text: "Everyone by the river takes some food.",
    target: "terrain",
    apply: (s) => feed(s, (p) => standingOn(s, p, "river")),
  },
  {
    id: "campfire",
    title: "Campfire",
    text: "Everyone in a forest heals 1.",
    target: "terrain",
    apply: (s) => each(s, (p) => standingOn(s, p, "forest"), (p) => healed(p, 1)),
  },
  {
    id: "train-delivery",
    title: "Train Delivery",
    text: "Everyone on the railway gains $1.",
    target: "terrain",
    apply: (s) => each(s, (p) => standingOn(s, p, "railroad"), (p) => ({ ...p, money: p.money + 1 })),
  },
  {
    id: "parade-in-town",
    title: "Parade in Town",
    text: "Everyone in a city heals 1 and gains $1.",
    target: "terrain",
    apply: (s) =>
      each(s, (p) => standingOn(s, p, "city"), (p) => ({ ...healed(p, 1), money: p.money + 1 })),
  },
  {
    id: "well-rested",
    title: "Well Rested",
    text: "A good night for once. Everyone heals 1.",
    target: "everyone",
    apply: (s) => each(s, () => true, (p) => healed(p, 1)),
  },
  {
    id: "treasure-map",
    title: "Treasure Map",
    text: "The player who drew takes an item from the pile.",
    target: "encounter",
    apply: (s) => givePileItem(s, active(s).id),
  },
  {
    id: "sharpening-stone",
    title: "Sharpening Stone",
    text: "Everyone rolls an extra die in their next fight.",
    target: "everyone",
    apply: (s) =>
      each(s, () => true, (p) => ({ ...p, bonusDiceNextFight: p.bonusDiceNextFight + 1 })),
  },
  {
    id: "helping-hand",
    title: "Helping Hand",
    text: "Whoever is carrying the least gets an item.",
    target: "everyone",
    apply: (s) => {
      const crew = living(s);
      if (crew.length === 0) return s;
      const count = (p: Player) => carriedGear(p).length + p.supply.length;
      const neediest = crew.reduce((a, b) => (count(b) < count(a) ? b : a));
      return givePileItem(s, neediest.id);
    },
  },
  {
    id: "friendly-ranger",
    title: "Friendly Ranger",
    text: "Whoever is closest to the dragon gets an item.",
    target: "everyone",
    apply: (s) => {
      const dragon = s.enemies.find((e) => e.kind === "finalboss" && !e.defeated);
      const crew = living(s);
      if (!dragon || crew.length === 0) return s;
      const near = crew.reduce((a, b) => {
        const d = (p: Player) =>
          Math.abs(p.hex.q - dragon.hex.q) + Math.abs(p.hex.r - dragon.hex.r);
        return d(b) < d(a) ? b : a;
      });
      return givePileItem(s, near.id);
    },
  },
  {
    id: "found-a-shortcut",
    title: "Found a Shortcut",
    text: "Everyone may move again this turn.",
    target: "everyone",
    apply: (s) => each(s, () => true, (p) => ({ ...p, movedThisTurn: false })),
  },

  /* ---------------------------------------------------------------- mixed */
  {
    id: "mud-puddle",
    title: "Mud Puddle",
    text: "Anyone on a field is stuck. Anyone by the river gets a wash and heals 1.",
    target: "terrain",
    apply: (s) => {
      const stuck = each(s, (p) => standingOn(s, p, "field"), (p) => ({ ...p, movedThisTurn: true }));
      return each(stuck, (p) => standingOn(s, p, "river"), (p) => healed(p, 1));
    },
  },
  {
    id: "sleepy-mob",
    title: "Sleepy Mob",
    text: "One bandit is fast asleep, and is dealt with quietly.",
    target: "encounter",
    apply: (s) => {
      const asleep = s.enemies.find((e) => e.kind === "mob" && !e.defeated);
      if (!asleep) return note(s, "Not a bandit left awake to catch napping.");
      return note(
        { ...s, enemies: s.enemies.map((e) => (e.id === asleep.id ? { ...e, defeated: true } : e)) },
        "One bandit slept through the whole thing.",
      );
    },
  },
  {
    id: "everyone-swaps-hats",
    title: "Everyone Swaps Hats",
    text: "Every player passes one thing to the left.",
    target: "everyone",
    apply: (s) => {
      const crew = s.players;
      const given: (Item | null)[] = crew.map((p) => (p.dead ? null : (p.supply[0] ?? null)));
      if (given.every((g) => g === null)) return note(s, "Nobody had anything to pass on.");

      const players = crew.map((p, i) => {
        if (p.dead) return p;
        const passedOn = given[i];
        const received = given[(i - 1 + crew.length) % crew.length];
        let hands = passedOn
          ? { ...p, supply: p.supply.filter((x) => x.id !== passedOn.id) }
          : p;
        if (received) hands = equip(hands, received).player;
        return hands;
      });
      return note({ ...s, players }, "Everything went one place to the left.");
    },
  },
  {
    id: "growth-spurt",
    title: "Growth Spurt",
    text: "Whoever is weakest gets a permanent extra health.",
    target: "everyone",
    apply: (s) => {
      const crew = living(s);
      if (crew.length === 0) return s;
      const weakest = crew.reduce((a, b) => (b.health < a.health ? b : a));
      // A permanent bonus lives as a keepsake in the pack, so it survives a save.
      const charm = makeItem(
        { name: "Growth Spurt", slot: "armor", cost: 0, value: 1 },
        `growth-${s.turn}`,
      );
      const { player } = equip(weakest, charm);
      const grown = withMaxHealth(player);
      return note(
        {
          ...s,
          players: s.players.map((p) =>
            p.id === weakest.id ? { ...grown, health: grown.health + 1 } : p,
          ),
        },
        `${weakest.name} shot up. Maximum health is now ${maxHealthOf(grown)}.`,
      );
    },
  },
  {
    id: "bake-sale",
    title: "Bake Sale",
    text: "A dollar buys two lots of food, for anyone who has a dollar.",
    target: "everyone",
    apply: (s) => {
      const buyers = (p: Player) => p.money >= 1;
      const paid = each(s, buyers, (p) => poorer(p, 1));
      return feed(paid, (p) => buyers(p), 2);
    },
  },
  {
    id: "wild-goose-chase",
    title: "Wild Goose Chase",
    text: "Everyone is dragged one tile along by it.",
    target: "everyone",
    apply: (s) => ({ ...s, players: s.players.map((p) => (p.dead ? p : { ...p, movedThisTurn: false })) }),
  },
];

/** The deck, shuffled. Drawn through and reshuffled when it runs out. */
export function createEventDeck(rngState: number): { deck: EventCard[]; rngState: number } {
  const rng = makeRng(rngState);
  return {
    deck: rng.shuffle(EVENTS.map(({ id, title, text }) => ({ id, title, text }))),
    rngState: rng.state(),
  };
}

/** Run an event's effect. Unknown ids pass through untouched. */
export function applyEvent(state: GameState, event: EventCard): GameState {
  const definition = EVENTS.find((e) => e.id === event.id);
  if (!definition) return state;
  return definition.apply(note(state, `${event.title}: ${event.text}`));
}

/** Exposed for the deck-composition test: no card should be unreachable. */
export const EVENT_TARGETS = EVENTS.map((e) => e.target);
export { FOOD };
