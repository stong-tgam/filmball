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
  FISH_TEMPLATE,
  FISH_TO_UPGRADE,
  FOOD_PRICE,
  GEAR_PRICE,
  SUPPLY_CAP,
  canTake,
  isRod,
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
import { meet } from "./hazards";
import { ROLES, withMaxHealth } from "./players";
import { bearingBetween, compassName } from "./sense";
import { makeRng } from "./rng";
import { activePlayer } from "./turn";
import type { Card, Find, GameState, Item, LogEntry, Player, Terrain, Tile } from "./types";

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

/**
 * Put coins in somebody's pocket and say so.
 *
 * Takes the player by id off the state it is handed rather than trusting the copy
 * passed in, because the callers have usually just given that player an item and are
 * holding a stale one. `text` is the story; the money line is always the same, so it
 * is the same shape in the log whether the coins came off a body or out of a chest.
 */
function paid(state: GameState, who: Player, amount: number, text?: string): GameState {
  const said = text ? note(state, text) : state;
  const current = said.players.find((p) => p.id === who.id);
  if (!current || amount <= 0) return said;
  return note(
    withPlayer(said, { ...current, money: current.money + amount }),
    `$${amount} for ${current.name}.`,
  );
}

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
  return !busy(state, player) && hasFindings(tileUnder(state, player));
}

/**
 * Is there still anything to be had off this tile?
 *
 * Split out of `canSearch` because the map needs to answer it about a tile nobody is
 * standing on: the ground you *could* step onto is drawn with a mark when it has not
 * been turned over yet (see `Tile.tsx`), and that mark is this function. It knows
 * nothing about whose turn it is or whether they have already acted - only whether
 * the ground itself is spent.
 */
export const hasFindings = (tile: Tile): boolean =>
  !tile.searched &&
  (tile.river || tile.base === "field" || tile.base === "forest" || tile.base === "city");

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
 * Coins under the gear, when the red card was a picture card.
 *
 * §10 wanted money to come only from selling, and the first build followed it:
 * searching found gear, gear became money at a shop. That reads fine and plays badly,
 * because the shop is in a city, and a child two rings out in the woods has no way to
 * turn a good afternoon into anything at all. So a red *picture* card pays a purse as
 * well - jack a dollar, queen two, king three - and every other card is untouched.
 *
 * On top of the gear rather than instead of it, for two reasons. The rule stays one
 * sentence a seven-year-old can hold ("red finds something, and a picture card finds
 * money too") instead of two that contradict each other. And gear is the only thing
 * that makes a party stronger: paying red faces in coin instead cost the bot a quarter
 * of its gear finds and five points of win rate, which is a nerf to the game dressed
 * up as an economy.
 *
 * Capped at three - one more than `GEAR_PRICE` - so a purse is a good afternoon and
 * never an alternative to the sword you were actually looking for.
 */
export const coinsFound = (card: Card): number =>
  !isRed(card) || !isFace(card) ? 0 : card.rank === "K" ? 3 : card.rank === "Q" ? 2 : 1;


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

/**
 * Coins in the bottom of a chest that had anything in it at all.
 *
 * Three, and it rides along with the gear rather than replacing it - the river is
 * meant to be the best thing you can walk to, and a chest that paid in either gear
 * or money would be worse than a mid boss half the time.
 */
export const CHEST_COINS = 3;

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
      return paid(
        note(
          give({ ...state, itemPile: rest, rngState: condition.state() }, player, kit),
          `The chest was full of armour - ${player.name} took ${gearLabel(kit)}!`,
        ),
        player,
        CHEST_COINS,
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
      if (taken.length === 0) {
        // Nothing left in the item pile to hand over, so the chest pays in coin. A
        // late-game chest that gave literally nothing would make the river dead
        // ground for the last third of the evening.
        return paid(next, player, CHEST_COINS, `${player.name} found the chest picked clean, bar the coins.`);
      }
      return paid(next, player, CHEST_COINS, `${player.name} hauled the chest out: ${taken.join(" and ")}!`);
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

/**
 * Where the money was, by the ground it was under.
 *
 * One line each rather than "you find some coins", for the same reason `MISHAPS` has
 * one per terrain: the log is read aloud, and a child wants to hear what happened,
 * not what changed.
 */
export const COIN_FINDS: Record<Terrain, string> = {
  forest: "A purse under the roots, and whoever buried it never came back for it.",
  city: "Somebody's takings, down the back of a market stall.",
  field: "A tin box in the furrow, and coins in the tin box.",
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
  const from = searchKind(tile);
  next = note(next, `${player.name} ${from === "chest" ? "fished a chest out of the water" : "searched the ground here"} and drew ${cardName(pull.card)}.`);

  const after = resolveSearch(next, acted, pull.card, from);
  return { ...after, find: whatTurnedUp(next, after, acted, pull.card, from) };
}

function resolveSearch(state: GameState, player: Player, card: Card, from: "chest" | "ground"): GameState {
  if (from === "chest") return openChest(state, player, card);

  switch (readSearchCard(card)) {
    case "found":
      return findSomething(state, player, card);
    case "thief":
      return robbedWhileSearching(state, player);
    default:
      return isMishap(card)
        ? somethingWentWrong(state, player, card)
        : note(state, `${player.name} found nothing.`);
  }
}

/** Everything a player is carrying, in one list, for working out what changed. */
const holdings = (player: Player): Item[] =>
  [player.weapon, player.armor, player.boots, ...player.supply].filter((i): i is Item => i !== null);

/**
 * Read the search back off the state it produced.
 *
 * Derived rather than declared, on purpose. Every branch of a search already does
 * exactly one honest thing to the state and writes one honest line to the log, and
 * asking the two states what changed cannot disagree with them - where a summary
 * written out by hand in each branch would, the first time somebody changed a branch
 * and not its summary. It also means a new outcome gets a card for free.
 */
function whatTurnedUp(
  before: GameState,
  after: GameState,
  player: Player,
  card: Card,
  from: Find["from"],
): Find {
  const was = before.players.find((p) => p.id === player.id) ?? player;
  const now = after.players.find((p) => p.id === player.id) ?? player;
  const had = holdings(was);
  const has = holdings(now);

  const gained = has.filter((i) => !had.some((h) => h.id === i.id));
  const lost = had.filter((i) => !has.some((h) => h.id === i.id));
  const coins = now.money - was.money;
  // Armour can raise the maximum and top a player up, so a gain is not a wound.
  const hurt = Math.max(0, was.health - now.health);

  // "There was something there and you could not take it" is not the same story as
  // "there was nothing there", and a card that said "Nothing at all" over a log line
  // about a carrot would be the app calling the player a liar. The card knows which
  // it was, so ask it rather than sniffing the log.
  const offered =
    from === "line"
      ? readFishCard(card) !== "snag"
      : from === "chest"
      ? readChestCard(card) !== "empty"
      : readSearchCard(card) === "found";

  // A joker means a different thing on each table: somebody in the undergrowth, the
  // lid of the chest, or - on the line - the big one getting away with your bait.
  const kind: Find["kind"] = isJoker(card) && from !== "line"
    ? from === "chest"
      ? "trap"
      : "thief"
    : gained.length > 0
    ? // A cast that brought up nothing but supper is its own headline. A cast that
      // also brought up gear is a find, and the gear is the part worth shouting about.
      from === "line" && gained.every((i) => i.slot === "supply")
      ? "fish"
      : "gear"
    : coins > 0
    ? "coins"
    : hurt > 0 || lost.length > 0
    ? "mishap"
    : offered
    ? "full"
    : "nothing";

  return {
    card,
    from,
    kind,
    gained,
    lost,
    coins: Math.max(0, coins),
    hurt,
    lines: after.log.slice(before.log.length).map((entry) => entry.text),
  };
}

/** Put the search away once the table has looked at what came up. */
export const clearFind = (state: GameState): GameState => ({ ...state, find: null });

/* ------------------------------------------------------------------- fishing */

/**
 * The fisherman on a river, with the rod still in their hands.
 *
 * Unlike a search this is **not** once per tile: a river restocks, and a role whose
 * whole job could be done four times a game is not a role. What stops it becoming
 * camping is that it costs the turn's action and the dragon clock keeps running -
 * an evening spent fishing one bend is an evening spent not walking to the middle.
 * The *treasure* is the once-only part; see `fish`.
 */
export function canFish(state: GameState, player: Player): boolean {
  if (busy(state, player)) return false;
  if (!ROLES[player.role].canFish || !isRod(player.weapon)) return false;
  return tileUnder(state, player).river;
}

/** A snag, a fish, or a fish and whatever else was down there. */
export type FishResult = "snag" | "fish" | "treasure";

/**
 * High chance of a fish, as asked. Only the joker is a blank - two cards in
 * fifty-four - because a role that eats has to actually eat; the interesting question
 * on a cast is not *whether* but *what else*.
 */
export const readFishCard = (card: Card): FishResult =>
  isJoker(card) ? "snag" : isFace(card) ? "treasure" : "fish";

/** A fine rod brings up two at a time. That is the whole of the upgrade's fishing half. */
export const fishPerCast = (player: Player): number => ((player.weapon?.value ?? 0) > 0 ? 2 : 1);

export function fish(state: GameState): GameState {
  const player = activePlayer(state);
  if (!canFish(state, player)) return state;

  const tile = tileUnder(state, player);
  const pull = drawCard(state.searchDeck, state.rngState, true);
  let next: GameState = { ...state, rngState: pull.rngState, searchDeck: pull.deck };

  const acted = { ...player, actedThisTurn: true };
  next = withPlayer(next, acted);
  next = note(next, `${player.name} cast the line and drew ${cardName(pull.card)}.`);

  const before = next;
  const result = readFishCard(pull.card);
  next = result === "snag" ? theOneThatGotAway(next, acted) : landFish(next, acted, pull.card);

  // Treasure comes off a stretch of water once. The fish do not - that is the split
  // that lets the fisherman always eat without letting them farm a single tile.
  if (result === "treasure") {
    next = tile.searched
      ? note(next, "Nothing else down there. This water has been fished out already.")
      : pullUpTreasure(
          { ...next, tiles: { ...next.tiles, [key(player.hex)]: { ...tile, searched: true } } },
          acted,
        );
  }

  return { ...next, find: whatTurnedUp(before, next, acted, pull.card, "line") };
}

function theOneThatGotAway(state: GameState, player: Player): GameState {
  return note(state, `Something big took the bait and went. ${player.name} has an empty hook.`);
}

/** The catch, and the rod getting better at its job on the third one. */
function landFish(state: GameState, player: Player, card: Card): GameState {
  let next = state;
  let holder = player;
  let landed = 0;

  for (let i = 0; i < fishPerCast(player); i++) {
    if (holder.supply.length >= SUPPLY_CAP) break;
    const caught = makeItem(FISH_TEMPLATE, `fish-${card.suit}-${card.rank}-${state.log.length}-${i}`);
    const { player: carrying } = equip(holder, caught);
    holder = { ...carrying, fishCaught: carrying.fishCaught + 1 };
    next = withPlayer(next, holder);
    landed++;
  }

  if (landed === 0) {
    return note(next, `${player.name} landed one and had nowhere to put it. Back in the water.`);
  }
  next = note(next, landed === 1 ? `${player.name} landed a fish.` : `${player.name} landed ${landed} fish.`);
  return upgradeRod(next, holder);
}

/**
 * Three fish in, and the rod is a proper rod: +1 on every roll, and two fish a cast
 * from then on. The fisherman is the one character who earns their weapon by doing
 * their job instead of by finding one, and it happens once - the check is on crossing
 * the line, not on being over it.
 */
function upgradeRod(state: GameState, player: Player): GameState {
  if (!isRod(player.weapon) || (player.weapon?.value ?? 0) > 0) return state;
  if (player.fishCaught < FISH_TO_UPGRADE) return state;
  // +1, not `makeFine`'s +2. Fine is what the best chest in the game pays out, and a
  // rod that got there by catching three fish would make the fisherman the hardest
  // hitter at the table - which is the exact opposite of the trade the role is.
  const proper = { ...player.weapon!, value: 1 };
  return note(
    withPlayer(state, withMaxHealth({ ...player, weapon: proper })),
    `${FISH_TO_UPGRADE} fish in, and ${player.name}'s rod is a proper rod now: +1, and two at a time.`,
  );
}

/** A face card brings up more than dinner. Same payout as a chest, minus the armour. */
function pullUpTreasure(state: GameState, player: Player): GameState {
  const condition = makeRng(state.rngState);
  const [found, ...rest] = state.itemPile;
  if (!found) {
    return paid(state, player, CHEST_COINS, "Something heavy on the line - a strongbox, and only coins left in it.");
  }
  const kit = condition.next() < FINE_CHEST_CHANCE ? makeFine(found) : found;
  const holder = state.players.find((p) => p.id === player.id) ?? player;
  const { player: carrying, returned } = equip(holder, kit);
  const landed: GameState = withPlayer(
    {
      ...state,
      rngState: condition.state(),
      itemPile: returned ? [...rest, returned] : rest,
    },
    withMaxHealth(carrying),
  );
  return paid(
    landed,
    player,
    CHEST_COINS,
    returned === kit
      ? `Something heavy on the line - ${gearLabel(kit)}, and no way to carry it.`
      : `Something heavy on the line: ${gearLabel(kit)}!`,
  );
}

/* ---------------------------------------------------------------------- hook */

/** The rod reaches one tile. Far enough to matter, short enough to need walking to. */
export const HOOK_RANGE = 1;

/**
 * Who is within a cast.
 *
 * The fallen count, and dragging one to the doctor is the best thing the hook does -
 * so a downed player is measured from where they fell rather than from where they
 * are standing, the same way `healTargets` does it.
 */
export function hookTargets(state: GameState, fisher: Player): Player[] {
  if (!ROLES[fisher.role].canFish || !isRod(fisher.weapon)) return [];
  return state.players.filter((p) => {
    if (p.id === fisher.id) return false;
    const spot = p.dead ? p.fellAt : p.hex;
    return spot !== null && distance(spot, fisher.hex) === HOOK_RANGE;
  });
}

export const canHook = (state: GameState, player: Player): boolean =>
  !busy(state, player) && hookTargets(state, player).length > 0;

/**
 * Cast the line at a friend and pull - or let it pull you.
 *
 * The two ways round are genuinely different because **the hook may land two players
 * on one tile**, which walking may not. `legalMoves` blocks moving onto a friend, and
 * that rule stands: it exists so nobody gets boxed in by their own family. A rope is
 * not a walk. Being hauled onto somebody's square is the fisherman's whole trick, and
 * it is how the party gets assembled in one place.
 *
 * Whoever ends up moving arrives properly - a hazard on the tile they land on goes off
 * under them, exactly as if they had walked there.
 */
export function hook(state: GameState, targetId: string, how: "pull" | "cross"): GameState {
  const fisher = activePlayer(state);
  if (!canHook(state, fisher)) return state;
  const target = hookTargets(state, fisher).find((p) => p.id === targetId);
  if (!target) return state;

  const moving = how === "pull" ? target : fisher;
  const landing = how === "pull" ? fisher.hex : (target.dead ? target.fellAt ?? target.hex : target.hex);
  const bearing = compassName(bearingBetween(moving.hex, landing));

  let next: GameState = {
    ...state,
    players: state.players.map((p) => {
      if (p.id === fisher.id && how === "cross") return { ...p, hex: landing, actedThisTurn: true };
      if (p.id === fisher.id) return { ...p, actedThisTurn: true };
      if (p.id === target.id && how === "pull") {
        return { ...p, hex: landing, fellAt: p.dead ? landing : p.fellAt };
      }
      return p;
    }),
  };

  next = note(
    next,
    how === "pull"
      ? `${fisher.name} cast the line and reeled ${target.name} in from the ${bearing}.`
      : `${fisher.name} hooked on to ${target.name} and hauled themselves across.`,
  );

  // Landing on a hazard sets it off, the same as walking into it does.
  for (const hazard of next.hazards) {
    if (key(hazard.hex) === key(landing)) next = meet(next, hazard.kind, moving.id);
  }
  return next;
}

function findSomething(state: GameState, player: Player, card: Card): GameState {
  const coins = coinsFound(card);
  const ground = tileUnder(state, player).base;

  if (state.itemPile.length === 0) {
    // Everything on the board is already on somebody's back. Pay in coin instead of
    // saying "nothing", or every search in the last third of the game is a dead turn.
    return paid(
      state,
      player,
      Math.max(coins, 1),
      `${player.name} turned the ground over. No gear left anywhere, but there were coins in the dirt.`,
    );
  }

  const [found, ...rest] = state.itemPile;
  const { player: carrying, returned } = equip(player, found);
  const next = withPlayer({ ...state, itemPile: returned ? [...rest, returned] : rest }, withMaxHealth(carrying));
  return paid(
    note(
      next,
      // `equip` hands the item straight back when the *pack* is full, and hands back
      // the old piece when a gear slot is swapped. They are not the same story, and
      // the old line told the swap as though nothing had been picked up.
      returned === found
        ? `${player.name} found ${an(found.name)} and had no room in the pack for it.`
        : returned
        ? `${player.name} found ${gearLabel(found)} and left ${gearLabel(returned)} behind.`
        : `${player.name} found ${an(found.name)}!`,
    ),
    player,
    coins,
    coins > 0 ? (COIN_FINDS[ground] ?? COIN_FINDS.field) : undefined,
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
