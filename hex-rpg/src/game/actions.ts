/**
 * What a player does with their turn once they have moved: search the ground, or
 * trade in a city. One action a turn, and a fight counts as it.
 *
 * Eating is not an action. The spec is explicit that supply may be used at any time,
 * including on somebody else's turn and in the middle of a fight, so `eat` takes the
 * player it applies to and ignores whose turn it is.
 */

import { cardName, draw as drawCard, isFace, isJoker, isRed } from "./cards";
import { distance, key } from "./hex";
import {
  BONE,
  FOOD_PRICE,
  GEAR_PRICE,
  canTake,
  carriedGear,
  consume,
  equip,
  makeFine,
  makeItem,
  randomFood,
  shopStock,
  gearLabel,
  slotKey,
} from "./items";
import { ROLES, withMaxHealth } from "./players";
import { makeRng } from "./rng";
import { activePlayer } from "./turn";
import type { Card, GameState, Item, LogEntry, Player, Terrain, Tile } from "./types";

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

/** Nothing is available mid-fight, after your action, or once the game is over. */
const busy = (state: GameState, player: Player): boolean =>
  state.phase === "gameOver" ||
  state.ending !== null ||
  state.combat !== null ||
  player.actedThisTurn ||
  player.dead;

/**
 * Where you can have a poke about, and only the once per tile.
 *
 * The rulebook's §4 says forest or field. Two additions on top of it:
 *
 * - **Rivers**, which give up a chest rather than turning over ground (`searchKind`).
 * - **Cities**, so that rummaging round the streets is a thing you can do. A city tile
 *   already offers the shop, and both cost the turn's one action, so this is a real
 *   choice - buy what you can see, or take a chance on the alleys - rather than a free
 *   extra. It is also where the wire strung across an alley lives; see `MISHAPS`.
 */
export function canSearch(state: GameState, player: Player): boolean {
  if (busy(state, player)) return false;
  const tile = tileUnder(state, player);
  if (tile.searched) return false;
  return tile.river || tile.base === "field" || tile.base === "forest" || tile.base === "city";
}

/**
 * Turning over a field is not the same as fishing something out of the water.
 *
 * A river tile gives up a **chest**, which is better than the ground on average and
 * occasionally bites: it is the one place worth going out of your way for, which is
 * the point - a river you can see from two tiles away should be a decision, not
 * scenery. Ground search is unchanged from the rulebook.
 */
export const searchKind = (tile: Tile): "chest" | "ground" => (tile.river ? "chest" : "ground");

export function canTrade(state: GameState, player: Player): boolean {
  return !busy(state, player) && tileUnder(state, player).base === "city";
}

/** Rulebook §6: red finds something, black finds nothing, the joker is a thief. */
export type SearchResult = "found" | "nothing" | "thief";

export const readSearchCard = (card: Card): SearchResult =>
  isJoker(card) ? "thief" : isRed(card) ? "found" : "nothing";


/**
 * What is in the chest, by the card drawn.
 *
 * Weighted so the river beats the ground clearly but not for free: a face card is
 * armour, red is a good haul of two, black is a soaked and empty box, and the joker
 * is the lid coming down on your fingers. Roughly: half the time something good,
 * a third of the time nothing, and a small chance of a hit.
 */
export type ChestResult = "armour" | "haul" | "empty" | "trap";

/**
 * How often what comes out of a chest is fine (+2).
 *
 * Half. Better than a mid boss on purpose - a chest is the best odds in the game, and
 * that is what makes a river worth walking to instead of past.
 */
export const FINE_CHEST_CHANCE = 0.5;

export const readChestCard = (card: Card): ChestResult =>
  isJoker(card) ? "trap" : isFace(card) ? "armour" : isRed(card) ? "haul" : "empty";

/** Pull the first item matching a slot out of the pile, or the first of anything. */
function pullFromPile(pile: Item[], slot: "armor" | null): [Item | null, Item[]] {
  const at = slot ? pile.findIndex((i) => i.slot !== "supply" && slotKey(i.slot) === slot) : 0;
  if (at < 0 || pile.length === 0) return [null, pile];
  return [pile[at], [...pile.slice(0, at), ...pile.slice(at + 1)]];
}

function openChest(state: GameState, player: Player, card: Card): GameState {
  const condition = makeRng(state.rngState);
  const graded = (item: Item): Item =>
    condition.next() < FINE_CHEST_CHANCE ? makeFine(item) : item;

  const give = (from: GameState, holder: Player, item: Item): GameState => {
    const { player: carrying, returned } = equip(holder, item);
    return withPlayer(
      { ...from, itemPile: returned ? [...from.itemPile, returned] : from.itemPile },
      withMaxHealth(carrying),
    );
  };

  switch (readChestCard(card)) {
    case "armour": {
      const [armour, rest] = pullFromPile(state.itemPile, "armor");
      if (!armour) return note(state, `The chest holds a suit of armour ${player.name} already owns.`);
      const kit = graded(armour);
      return note(
        give({ ...state, itemPile: rest, rngState: condition.state() }, player, kit),
        `The chest was full of armour - ${player.name} took ${gearLabel(kit)}!`,
      );
    }
    case "haul": {
      let next = state;
      let holder = player;
      const taken: string[] = [];
      for (let i = 0; i < 2; i++) {
        const [item, rest] = pullFromPile(next.itemPile, null);
        if (!item) break;
        const kit = graded(item);
        next = give({ ...next, itemPile: rest, rngState: condition.state() }, holder, kit);
        holder = next.players.find((p) => p.id === holder.id) ?? holder;
        taken.push(gearLabel(kit));
      }
      if (taken.length === 0) return note(next, "The chest is open and there is nothing left to put in it.");
      return note(next, `${player.name} hauled the chest out: ${taken.join(" and ")}!`);
    }
    case "trap": {
      const hurt = { ...player, health: Math.max(0, player.health - 1) };
      return note(
        withPlayer(state, hurt),
        `The lid came down on ${player.name}'s fingers. One health.`,
      );
    }
    default:
      return note(state, `${player.name} dragged up a chest full of river water.`);
  }
}


/**
 * The ground bites back.
 *
 * A black card used to mean "nothing", which made searching a free roll with no reason
 * ever not to. A black **face** card now means something went wrong instead, and what
 * goes wrong belongs to the ground you are standing on: snakes in the woods, wire in
 * the streets, wasps in the fields. Roughly one search in nine.
 *
 * They cost a health or a piece of gear, never a turn and never a life on their own -
 * a setback should be funny at the table and recoverable on the next turn, not the end
 * of somebody's evening. A player already on their last health takes the gear version
 * instead, so a search can never be what kills a child's character.
 */
export type Mishap = {
  /** Read aloud. Say what happened, not what statistic changed. */
  text: string;
  /** Which is spent: a health, or the named slot's gear. */
  cost: "health" | "weapon" | "armor" | "boots";
};

export const MISHAPS: Record<Terrain, Mishap[]> = {
  forest: [
    { text: "A snake in the leaf litter. It bit before anyone saw it", cost: "health" },
    { text: "A branch came down and took the pack with it", cost: "armor" },
  ],
  city: [
    { text: "Tripped over a wire strung across an alley, and left the boots behind", cost: "boots" },
    { text: "Something heavy came off a windowsill", cost: "health" },
  ],
  field: [
    { text: "Straight into a wasps' nest", cost: "health" },
    { text: "The mud took hold and would not give the boots back", cost: "boots" },
  ],
};

/** A black face card is a mishap. Everything else black is simply nothing. */
export const isMishap = (card: Card): boolean => !isJoker(card) && !isRed(card) && isFace(card);

function somethingWentWrong(state: GameState, player: Player, card: Card): GameState {
  const ground = tileUnder(state, player).base;
  const table = MISHAPS[ground] ?? MISHAPS.field;
  const mishap = table[card.rank === "K" ? 0 : card.rank === "Q" ? 1 : 0];

  // Never let a search be the thing that puts a child out of the game.
  const lastLegs = player.health <= 1;
  const cost = mishap.cost === "health" && lastLegs ? "boots" : mishap.cost;

  if (cost === "health") {
    return note(
      withPlayer(state, { ...player, health: Math.max(0, player.health - 1) }),
      `${mishap.text}. ${player.name} loses a health.`,
    );
  }

  const lost = cost === "weapon" ? player.weapon : cost === "armor" ? player.armor : player.boots;
  if (!lost) {
    return note(state, `${mishap.text}. ${player.name} had nothing to lose but their dignity.`);
  }
  const stripped = withMaxHealth({ ...player, [cost]: null });
  return note(
    withPlayer({ ...state, itemPile: [...state.itemPile, lost] }, stripped),
    `${mishap.text}. ${player.name} lost ${gearLabel(lost)}.`,
  );
}

/**
 * Turn over the ground you are standing on and draw a card.
 *
 * A red card finds a random piece of gear; a black one finds nothing; the joker is
 * somebody waiting in the undergrowth who takes a dollar, an item or a health off
 * you. Rulebook §12 gives the bone one job, and this is it: a thief takes the bone
 * and leaves everything else alone.
 */
export function search(state: GameState): GameState {
  const player = activePlayer(state);
  if (!canSearch(state, player)) return state;

  const tile = tileUnder(state, player);
  const pull = drawCard(state.searchDeck, state.rngState, true);

  let next: GameState = {
    ...state,
    rngState: pull.rngState,
    searchDeck: pull.deck,
    tiles: { ...state.tiles, [key(player.hex)]: { ...tile, searched: true } },
  };
  const acted = { ...player, actedThisTurn: true };
  next = withPlayer(next, acted);
  next = note(next, `${player.name} ${searchKind(tile) === "chest" ? "fished a chest out of the water" : "searched the ground here"} and drew ${cardName(pull.card)}.`);

  if (searchKind(tile) === "chest") return openChest(next, acted, pull.card);

  switch (readSearchCard(pull.card)) {
    case "found":
      return findSomething(next, acted);
    case "thief":
      return robbedWhileSearching(next, acted);
    default:
      return isMishap(pull.card)
        ? somethingWentWrong(next, acted, pull.card)
        : note(next, `${player.name} found nothing.`);
  }
}

function findSomething(state: GameState, player: Player): GameState {
  if (state.itemPile.length === 0) {
    return note(state, `${player.name} turned the ground over, but there is nothing left to find.`);
  }
  const [found, ...rest] = state.itemPile;
  const { player: carrying, returned } = equip(player, found);
  const next = withPlayer({ ...state, itemPile: returned ? [...rest, returned] : rest }, withMaxHealth(carrying));
  return note(
    next,
    returned
      ? `${player.name} found ${an(found.name)} but had no room for it.`
      : `${player.name} found ${an(found.name)}!`,
  );
}

/**
 * The joker. A dollar, an item, or a health - and the bone goes first if they have
 * one, which is the whole reason to carry it.
 */
function robbedWhileSearching(state: GameState, player: Player): GameState {
  const bone = player.supply.find((i) => i.name === BONE);
  if (bone) {
    return note(
      withPlayer(state, { ...player, supply: player.supply.filter((i) => i.id !== bone.id) }),
      `A thief! They took ${player.name}'s bone and left everything else.`,
    );
  }
  if (player.money > 0) {
    return note(
      withPlayer(state, { ...player, money: player.money - 1 }),
      `A thief! ${player.name} is a dollar lighter.`,
    );
  }
  const gear = carriedGear(player);
  if (gear.length > 0) {
    const lost = gear[0];
    return note(
      withPlayer(
        { ...state, itemPile: [...state.itemPile, lost] },
        withMaxHealth({ ...player, [slotKey(lost.slot)]: null }),
      ),
      `A thief! ${player.name} lost their ${lost.name}.`,
    );
  }
  const health = Math.max(0, player.health - 1);
  return note(
    withPlayer(state, {
      ...player,
      health,
      dead: health === 0,
      fellAt: health === 0 ? player.hex : player.fellAt,
      fellOn: health === 0 ? state.turn : player.fellOn,
    }),
    `A thief! Nothing to take, so they took it out on ${player.name}.`,
  );
}

/** Opening a shop is the player's action for the turn; buying inside it is free. */
export function openShop(state: GameState): GameState {
  const player = activePlayer(state);
  if (!canTrade(state, player)) return state;
  return note(
    withPlayer(state, { ...player, actedThisTurn: true }),
    `${player.name} went shopping.`,
  );
}

/** Everything this city will sell right now: the pile's top few, plus food. */
export function stockFor(state: GameState): { gear: Item[]; food: Item[] } {
  // Food is unlimited (§11's open question, resolved: a city never runs out of lunch),
  // but which three things are on the counter is fixed for the game by the seed.
  const rng = makeRng(state.seed ^ 0x5f356495);
  return {
    gear: shopStock(state.itemPile),
    food: [0, 1, 2].map((n) => randomFood(rng, `food-${n}`)),
  };
}

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

  const bought = food ? makeItem(food, `${food.id}-${state.turn}-${player.id}`) : item;
  const { player: carrying, returned } = equip(
    { ...player, money: player.money - item.cost },
    bought,
  );
  const pile = gear ? state.itemPile.filter((i) => i.id !== gear.id) : state.itemPile;

  let next = withPlayer(
    { ...state, itemPile: returned ? [...pile, returned] : pile },
    withMaxHealth(carrying),
  );
  next = note(next, `${player.name} bought ${an(item.name)} for $${item.cost}.`);
  return returned ? note(next, `${returned.name} went back to the pile.`) : next;
}

/**
 * Sell. Rulebook §11 is explicit that this is the party's main income, so anything
 * you are carrying goes for what it costs: $2 for gear, $1 for food.
 */
export function sell(state: GameState, itemId: string): GameState {
  const player = activePlayer(state);
  if (state.phase === "gameOver" || state.combat || player.dead) return state;

  const gear = carriedGear(player).find((i) => i.id === itemId);
  const food = player.supply.find((i) => i.id === itemId);
  const item = gear ?? food;
  if (!item) return state;

  const price = gear ? GEAR_PRICE : FOOD_PRICE;
  const stripped: Player = gear
    ? { ...player, [slotKey(gear.slot)]: null, money: player.money + price }
    : {
        ...player,
        supply: player.supply.filter((i) => i.id !== item.id),
        money: player.money + price,
      };

  return note(
    withPlayer(
      // Sold gear goes back into the world; sold food is eaten by somebody else.
      { ...state, itemPile: gear ? [...state.itemPile, gear] : state.itemPile },
      withMaxHealth(stripped),
    ),
    `${player.name} sold the ${item.name} for $${price}.`,
  );
}

/** What the active player could sell right now. */
export const sellable = (player: Player): Item[] => [...carriedGear(player), ...player.supply];

/* ------------------------------------------------------------------- doctor */

/** Rulebook §3: the doctor may heal themselves or somebody next to them, as an action. */
export function canHeal(state: GameState, player: Player): boolean {
  return !busy(state, player) && ROLES[player.role].canHeal && healTargets(state, player).length > 0;
}

/** Rulebook §3 and §7: patch up a neighbour, or put a fallen one back on their feet. */
export function healTargets(state: GameState, healer: Player): Player[] {
  if (!ROLES[healer.role].canHeal) return [];
  return state.players.filter((p) => {
    const spot = p.dead ? p.fellAt : p.hex;
    if (!spot) return false;
    const near = distance(spot, healer.hex) <= 1;
    return near && (p.dead || p.health < p.maxHealth);
  });
}

export function heal(state: GameState, targetId: string): GameState {
  const healer = activePlayer(state);
  if (!canHeal(state, healer)) return state;
  const target = healTargets(state, healer).find((p) => p.id === targetId);
  if (!target) return state;

  const revived = target.dead;
  const patched: Player = {
    ...target,
    dead: false,
    fellAt: null,
    fellOn: null,
    hex: revived ? (target.fellAt ?? target.hex) : target.hex,
    health: revived ? 1 : Math.min(target.maxHealth, target.health + 1),
  };

  let next = withPlayer(state, patched);
  next = withPlayer(next, { ...healer, actedThisTurn: true });
  return note(
    next,
    revived
      ? `${healer.name} got ${target.name} back on their feet.`
      : `${healer.name} patched ${target.name} up to ${patched.health} health.`,
  );
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

/**
 * Write in a player's notebook.
 *
 * The board remembers nothing (`vision.ts`), so this is where the map lives. It is
 * free, it is not an action, and it works on anybody's turn - a player who has spotted
 * something on somebody else's turn should be able to write it down while they still
 * remember, and reading each other's notes out loud is most of the game.
 *
 * Notes are per player rather than one shared pad: four people typing into one box
 * overwrite each other, and half the fun is that your map and mine disagree.
 */
export function writeNotes(state: GameState, playerId: string, notes: string): GameState {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) return state;
  return withPlayer(state, { ...player, notes });
}
