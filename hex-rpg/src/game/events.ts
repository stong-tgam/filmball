/**
 * The event deck.
 *
 * Once a turn a poker card comes off the top. A face card - jack, queen, king or ace
 * - brings an event with it; anything else is just a card, and the turn carries on.
 * That is the spec's rule, and it means most turns are quiet and the loud ones land.
 *
 * Every event here resolves the moment it is read. Nothing lingers, nothing has to be
 * remembered until later, and nothing needs a marker on the table - which is what
 * makes it playable by a child. Events with a lasting effect ("fog: everyone moves
 * one less this turn") need a modifier system that does not exist yet; when one
 * arrives, they belong in this file too.
 *
 * PLACEHOLDER DECK. The real cards live in the missing `hex-rpg-cards.html`.
 */

import { FOOD, equip, makeItem } from "./items";
import { makeRng } from "./rng";
import type { EventCard, GameState, LogEntry, Player } from "./types";

type EventDefinition = EventCard & {
  /** Resolves against the whole game; the active player is `state.activePlayerIndex`. */
  apply: (state: GameState) => GameState;
};

const note = (state: GameState, text: string): GameState => ({
  ...state,
  log: [...state.log, { turn: state.turn, text } satisfies LogEntry],
});

const eachLiving = (state: GameState, change: (p: Player) => Player): GameState => ({
  ...state,
  players: state.players.map((p) => (p.dead ? p : change(p))),
});

const changeActive = (state: GameState, change: (p: Player) => Player): GameState => ({
  ...state,
  players: state.players.map((p, i) => (i === state.activePlayerIndex && !p.dead ? change(p) : p)),
});

const spend = (money: number, amount: number): number => Math.max(0, money - amount);

export const EVENTS: EventDefinition[] = [
  {
    id: "market-day",
    title: "Market Day",
    text: "The roads are busy and everyone is buying. Every player finds $2.",
    apply: (state) => eachLiving(state, (p) => ({ ...p, money: p.money + 2 })),
  },
  {
    id: "travelling-baker",
    title: "The Travelling Baker",
    text: "A cart of hot bread comes through. Every player with room takes a loaf.",
    apply: (state) =>
      eachLiving(state, (p) => equip(p, makeItem(FOOD[0], `bread-${p.id}-${state.turn}`)).player),
  },
  {
    id: "wolves",
    title: "Wolves in the Night",
    text: "Something circles the camp. Every player loses 1 health.",
    apply: (state) =>
      eachLiving(state, (p) => {
        const health = Math.max(0, p.health - 1);
        return { ...p, health, dead: health === 0 };
      }),
  },
  {
    id: "tax-collector",
    title: "The Tax Collector",
    text: "He finds everyone eventually. Every player pays $1.",
    apply: (state) => eachLiving(state, (p) => ({ ...p, money: spend(p.money, 1) })),
  },
  {
    id: "good-harvest",
    title: "Good Harvest",
    text: "Full plates all round. Every player heals 2.",
    apply: (state) =>
      eachLiving(state, (p) => ({ ...p, health: Math.min(p.maxHealth, p.health + 2) })),
  },
  {
    id: "lost-purse",
    title: "A Hole in the Pocket",
    text: "The player whose turn it is loses $2.",
    apply: (state) => changeActive(state, (p) => ({ ...p, money: spend(p.money, 2) })),
  },
  {
    id: "second-wind",
    title: "Second Wind",
    text: "The player whose turn it is may move again.",
    apply: (state) => changeActive(state, (p) => ({ ...p, movedThisTurn: false })),
  },
  {
    id: "lucky-charm",
    title: "Lucky Charm",
    text: "The player whose turn it is rolls an extra die in their next fight.",
    apply: (state) =>
      changeActive(state, (p) => ({ ...p, bonusDiceNextFight: p.bonusDiceNextFight + 1 })),
  },
  {
    id: "blacksmiths-gift",
    title: "The Blacksmith's Gift",
    text: "A smith takes pity on whoever has the least money and gives them something.",
    apply: (state) => {
      if (state.itemPile.length === 0) return note(state, "The smith had nothing left to give.");
      const living = state.players.filter((p) => !p.dead);
      if (living.length === 0) return state;
      const poorest = living.reduce((a, b) => (b.money < a.money ? b : a));
      const [gift, ...rest] = state.itemPile;
      const { player, returned } = equip(poorest, gift);
      return note(
        {
          ...state,
          itemPile: returned ? [...rest, returned] : rest,
          players: state.players.map((p) => (p.id === poorest.id ? player : p)),
        },
        `${poorest.name} was given ${gift.name}.`,
      );
    },
  },
  {
    id: "something-stirs",
    title: "Something Stirs",
    text: "The monsters have been resting. One of them recovers 2 health.",
    apply: (state) => {
      const hurt = state.enemies.filter((e) => !e.defeated && e.damageTaken > 0);
      if (hurt.length === 0) return note(state, "Nothing out there needed the rest.");
      const rng = makeRng(state.rngState);
      const lucky = rng.pick(hurt);
      return note(
        {
          ...state,
          rngState: rng.state(),
          enemies: state.enemies.map((e) =>
            e.id === lucky.id ? { ...e, damageTaken: Math.max(0, e.damageTaken - 2) } : e,
          ),
        },
        "Something out there is looking healthier.",
      );
    },
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
