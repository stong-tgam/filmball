/**
 * What a player does with their turn once they have moved: search the ground, or
 * trade in a city. One action a turn, and a fight counts as it.
 *
 * Eating is not an action. The spec is explicit that supply may be used at any time,
 * including on somebody else's turn and in the middle of a fight, so `eat` takes the
 * player it applies to and ignores whose turn it is.
 */

import { cardName, draw as drawCard, rankValue } from "./cards";
import { key } from "./hex";
import { canTake, consume, equip, shopStock, FOOD, SUPPLY_CAP, makeItem } from "./items";
import { activePlayer } from "./turn";
import type { Card, GameState, Item, LogEntry, Player, Tile } from "./types";

/**
 * What a search turns up, read off the card you drew. The spec asks for a second
 * poker deck to drive searches, and this is it.
 *
 * PLACEHOLDER TABLE, like everything else the missing rulebook should set.
 */
export const SEARCH_TABLE = [
  { atLeast: 11, find: "gear" as const, text: "gear" }, // J, Q, K, A
  { atLeast: 8, find: "coins" as const, coins: 3, text: "$3" },
  { atLeast: 5, find: "coins" as const, coins: 1, text: "$1" },
  { atLeast: 2, find: "nothing" as const, text: "nothing" },
];

/** Cards drawn per terrain. In woods you look twice and keep the better card. */
export const SEARCH_DRAWS: Record<string, number> = { forest: 2, field: 1 };

export const searchResult = (card: Card) =>
  SEARCH_TABLE.find((row) => rankValue(card) >= row.atLeast)!;

/** "a Sword", but "an Axe". The log gets read aloud. */
const an = (name: string): string => `${/^[aeiou]/i.test(name) ? "an" : "a"} ${name}`;

const note = (state: GameState, text: string): GameState => ({
  ...state,
  log: [...state.log, { turn: state.turn, text } satisfies LogEntry],
});

const tileUnder = (state: GameState, player: Player): Tile => state.tiles[key(player.hex)];

const withPlayer = (state: GameState, updated: Player): GameState => ({
  ...state,
  players: state.players.map((p) => (p.id === updated.id ? updated : p)),
});

const busy = (state: GameState, player: Player): boolean =>
  state.phase === "gameOver" || state.combat !== null || player.actedThisTurn || player.dead;

/** Searchable ground: open country or woods, and only the once. */
export function canSearch(state: GameState, player: Player): boolean {
  if (busy(state, player)) return false;
  const tile = tileUnder(state, player);
  return !tile.searched && (tile.base === "field" || tile.base === "forest");
}

export function canTrade(state: GameState, player: Player): boolean {
  return !busy(state, player) && tileUnder(state, player).base === "city";
}

/**
 * Turn over the ground you are standing on: draw from the search deck and read what
 * it says. Open ground gets one card; woods get two and you keep the better one,
 * which is what makes the trees worth walking to.
 *
 * If the world has run out of gear, a card that would have found some pays coins.
 */
export function search(state: GameState): GameState {
  const player = activePlayer(state);
  if (!canSearch(state, player)) return state;

  const tile = tileUnder(state, player);
  const draws = SEARCH_DRAWS[tile.base] ?? 1;

  let deck = state.searchDeck;
  let rngState = state.rngState;
  const cards: Card[] = [];
  for (let i = 0; i < draws; i++) {
    const pull = drawCard(deck, rngState);
    cards.push(pull.card);
    deck = pull.deck;
    rngState = pull.rngState;
  }
  const best = cards.reduce((a, b) => (rankValue(b) > rankValue(a) ? b : a));
  const result = searchResult(best);

  let next: GameState = {
    ...state,
    rngState,
    searchDeck: deck,
    tiles: { ...state.tiles, [key(player.hex)]: { ...tile, searched: true } },
  };
  next = note(
    next,
    `${player.name} searched ${key(player.hex)} and turned up ${cards.map(cardName).join(" and ")}.`,
  );
  const acted = { ...player, actedThisTurn: true };

  if (result.find === "gear" && next.itemPile.length > 0) {
    const [found, ...rest] = next.itemPile;
    const { player: carrying, returned } = equip(acted, found);
    next = withPlayer({ ...next, itemPile: returned ? [...rest, returned] : rest }, carrying);
    return note(
      next,
      returned
        ? `${player.name} found ${an(found.name)} but had no room for it.`
        : `${player.name} found ${an(found.name)}!`,
    );
  }

  // Gear on a card, but nothing left in the world to find: coins instead.
  const coins = result.find === "gear" ? 3 : (result.coins ?? 0);
  if (coins > 0) {
    return note(
      withPlayer(next, { ...acted, money: acted.money + coins }),
      `${player.name} picked up $${coins}.`,
    );
  }

  return note(withPlayer(next, acted), `${player.name} found nothing.`);
}

/** Opening a shop is the player's action for the turn; buying inside it is free. */
export function openShop(state: GameState): GameState {
  const player = activePlayer(state);
  if (!canTrade(state, player)) return state;
  return note(
    withPlayer(state, { ...player, actedThisTurn: true }),
    `${player.name} went shopping in ${key(player.hex)}.`,
  );
}

/** Everything this city will sell right now: the pile's top few, plus food. */
export const stockFor = (state: GameState): { gear: Item[]; food: Item[] } => ({
  gear: shopStock(state.itemPile),
  food: FOOD.map((template) => makeItem(template, `food-${template.name.toLowerCase()}`)),
});

/**
 * Buy. Food is unlimited and never touches the pile; gear leaves it for good, and
 * whatever it replaces goes back in.
 */
export function buy(state: GameState, itemId: string): GameState {
  const player = activePlayer(state);
  if (state.phase === "gameOver" || state.combat || player.dead) return state;

  const stock = stockFor(state);
  const food = stock.food.find((i) => i.id === itemId);
  const gear = stock.gear.find((i) => i.id === itemId);
  const item = food ?? gear;
  if (!item || player.money < item.cost || !canTake(player, item)) return state;

  // Food is copied off the shelf; gear is the very item that was in the pile.
  const bought = food ? makeItem({ ...food, copies: 0 }) : item;
  const { player: carrying, returned } = equip({ ...player, money: player.money - item.cost }, bought);

  const pile = gear
    ? state.itemPile.filter((i) => i.id !== gear.id)
    : state.itemPile;

  let next = withPlayer({ ...state, itemPile: returned ? [...pile, returned] : pile }, carrying);
  next = note(next, `${player.name} bought ${an(item.name)} for $${item.cost}.`);
  return returned ? note(next, `${returned.name} went back to the pile.`) : next;
}

/**
 * Eat something, whoever you are and whenever you like - during another player's
 * turn, or in the middle of a fight.
 */
export function eat(state: GameState, playerId: string, itemId: string): GameState {
  const player = state.players.find((p) => p.id === playerId);
  if (!player || state.phase === "gameOver") return state;

  const { player: fed, used } = consume(player, itemId);
  if (!used) return state;

  const gained = fed.health - player.health;
  return note(
    withPlayer(state, fed),
    gained > 0
      ? `${player.name} ate the ${used.name} and got ${gained} health back.`
      : `${player.name} ate the ${used.name} on a full stomach.`,
  );
}

/** Take one item off a beaten enemy. */
export function takeLoot(state: GameState, itemId: string): GameState {
  const combat = state.combat;
  if (!combat || combat.outcome !== "enemyDefeated") return state;

  const enemy = state.enemies.find((e) => e.id === combat.enemyId);
  const player = state.players.find((p) => p.id === combat.playerId);
  const item = enemy?.loot.find((i) => i.id === itemId);
  if (!enemy || !player || !item || !canTake(player, item)) return state;

  const { player: carrying, returned } = equip(player, item);
  let next: GameState = {
    ...state,
    enemies: state.enemies.map((e) =>
      e.id === enemy.id ? { ...e, loot: e.loot.filter((i) => i.id !== item.id) } : e,
    ),
    itemPile: returned ? [...state.itemPile, returned] : state.itemPile,
  };
  next = withPlayer(next, carrying);
  next = note(next, `${player.name} took the ${item.name}.`);
  return returned ? note(next, `${returned.name} went back to the pile.`) : next;
}

/** Anything left on the ground when the fight closes goes back into the pile. */
export function returnUnclaimedLoot(state: GameState): GameState {
  const combat = state.combat;
  const enemy = combat && state.enemies.find((e) => e.id === combat.enemyId);
  if (!enemy || enemy.loot.length === 0) return state;
  return {
    ...state,
    itemPile: [...state.itemPile, ...enemy.loot],
    enemies: state.enemies.map((e) => (e.id === enemy.id ? { ...e, loot: [] } : e)),
  };
}

export { SUPPLY_CAP };
