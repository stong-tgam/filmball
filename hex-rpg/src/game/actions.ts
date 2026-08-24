/**
 * What a player does with their turn once they have moved: search the ground, or
 * trade in a city. One action a turn, and a fight counts as it.
 *
 * Eating is not an action. The spec is explicit that supply may be used at any time,
 * including on somebody else's turn and in the middle of a fight, so `eat` takes the
 * player it applies to and ignores whose turn it is.
 */

import { key } from "./hex";
import { canTake, consume, equip, shopStock, FOOD, SUPPLY_CAP, makeItem } from "./items";
import { makeRng } from "./rng";
import { activePlayer } from "./turn";
import type { GameState, Item, LogEntry, Player, Tile } from "./types";

/** Chance a search turns up gear, by terrain. Woods hide more than open ground. */
export const FIND_ODDS: Record<string, { item: number; money: number }> = {
  forest: { item: 0.4, money: 0.4 },
  field: { item: 0.2, money: 0.45 },
};

/** Coins a search can turn up. */
export const SEARCH_PURSE: [number, number] = [1, 3];

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
 * Turn over the ground you are standing on. Gear, coins, or nothing at all - and if
 * the pile has run dry, what would have been gear is coins instead.
 */
export function search(state: GameState): GameState {
  const player = activePlayer(state);
  if (!canSearch(state, player)) return state;

  const tile = tileUnder(state, player);
  const rng = makeRng(state.rngState);
  const odds = FIND_ODDS[tile.base];
  const roll = rng.next();

  let next: GameState = {
    ...state,
    rngState: rng.state(),
    tiles: { ...state.tiles, [key(player.hex)]: { ...tile, searched: true } },
  };
  const acted = { ...player, actedThisTurn: true };

  if (roll < odds.item && next.itemPile.length > 0) {
    const [found, ...rest] = next.itemPile;
    const { player: carrying, returned } = equip(acted, found);
    next = { ...next, itemPile: returned ? [...rest, returned] : rest };
    next = withPlayer(next, carrying);
    return note(
      next,
      returned
        ? `${player.name} found ${an(found.name)} at ${key(player.hex)} but had no room for it.`
        : `${player.name} found ${an(found.name)} at ${key(player.hex)}!`,
    );
  }

  if (roll < odds.item + odds.money) {
    const coins = rng.int(...SEARCH_PURSE);
    next = { ...next, rngState: rng.state() };
    next = withPlayer(next, { ...acted, money: acted.money + coins });
    return note(next, `${player.name} turned up $${coins} at ${key(player.hex)}.`);
  }

  return note(withPlayer(next, acted), `${player.name} searched ${key(player.hex)} and found nothing.`);
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
