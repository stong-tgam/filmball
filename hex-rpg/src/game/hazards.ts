/**
 * The four hazards: a tornado, someone down on their luck, a robber and pirates.
 *
 * They wander the board a tile a turn, before the event card is drawn - the spec is
 * explicit that the order matters, because an event that changes the weather has to
 * land after the weather has moved.
 *
 * Two of them, the robber and the pirates, are also things you can fight: they have a
 * `Hazard` record that wanders and an `Enemy` record that brawls, and `moveHazards`
 * is the single place that moves both, so the two can never drift apart.
 *
 * PLACEHOLDER EFFECTS, from the spec's own list of unresolved questions (§9). The
 * defaults it suggests are the ones taken here: a tornado costs you your next turn,
 * the others do not; destroyed ground recovers as soon as the tornado moves on;
 * players caught by it are pushed a tile clear while enemies sit tight; a thief you
 * beat is gone for good.
 */

import { distance, hexesInRange, key, neighbours, type Hex } from "./hex";
import { slotKey } from "./items";
import { PALETTE } from "../palette";
import { withMaxHealth } from "./players";
import { makeRng, type Rng } from "./rng";
import type { GameState, Hazard, HazardKind, LogEntry, Player, Tile } from "./types";

export type HazardProfile = {
  name: string;
  blurb: string;
  colour: string;
  glyph: string;
  /** Pirates keep to the water. Everything else goes where it likes. */
  keepsToWater: boolean;
};

export const HAZARDS: Record<HazardKind, HazardProfile> = {
  tornado: {
    name: "Tornado",
    blurb: "Wrecks the ground it crosses and knocks people flat.",
    colour: PALETTE.tornado,
    glyph: "🌀",
    keepsToWater: false,
  },
  homeless: {
    name: "Traveller",
    blurb: "Down on their luck. Give them something and they will wish you well.",
    colour: PALETTE.homeless,
    glyph: "☂",
    keepsToWater: false,
  },
  robber: {
    name: "Robber",
    blurb: "Takes your coins and keeps moving. Catch them to get it back.",
    colour: PALETTE.robber,
    glyph: "R",
    keepsToWater: false,
  },
  pirates: {
    name: "Pirates",
    blurb: "River thieves. They take your gear, not your money.",
    colour: PALETTE.pirates,
    glyph: "P",
    keepsToWater: true,
  },
};

/** Rulebook §5.5: a dollar or a supply buys one extra die in your next fight. */
export const DONATION = 1;
/** How far the tornado can put you down (§5.5). */
export const TORNADO_THROW = 3;
/** Hazards start at least this far from the party. */
export const HAZARD_SAFE_RADIUS = 3;

const note = (state: GameState, text: string): GameState => ({
  ...state,
  log: [...state.log, { turn: state.turn, text } satisfies LogEntry],
});

/** Ground the tornado has just been through, until it moves on. */
export const isDestroyed = (tile: Tile | undefined, turn: number): boolean =>
  tile !== undefined && tile.destroyedUntil !== null && turn < tile.destroyedUntil;

export const hazardAt = (hazards: Hazard[], label: string): Hazard | undefined =>
  hazards.find((h) => key(h.hex) === label);

/**
 * Hazards start scattered, well clear of the party and off the tiles the monsters
 * are already standing on - the thieves among them are monsters themselves, and two
 * things on one tile is a fight nobody chose.
 */
export function placeHazards(
  rng: Rng,
  players: Player[],
  tiles: Record<string, Tile>,
  monsters: { hex: Hex }[] = [],
): Hazard[] {
  const placed: Hazard[] = [];
  const kinds = Object.keys(HAZARDS) as HazardKind[];
  const taken = new Set(monsters.map((m) => key(m.hex)));

  for (const kind of kinds) {
    const open = (tile: Tile) =>
      !taken.has(key(tile.hex)) && placed.every((h) => key(h.hex) !== key(tile.hex));

    // Never on a player and never next to one: whatever else gives, nobody opens
    // the game standing in a tornado.
    const shuffled = rng
      .shuffle(Object.values(tiles))
      .filter((tile) => players.every((p) => distance(p.hex, tile.hex) > 1));

    const wants = shuffled.filter(
      (tile) =>
        open(tile) &&
        (!HAZARDS[kind].keepsToWater || tile.river) &&
        players.every((p) => distance(p.hex, tile.hex) >= HAZARD_SAFE_RADIUS),
    );
    // Fall back through the softer constraints rather than failing to place a hazard.
    const home =
      wants[0] ??
      shuffled.find((tile) => open(tile) && (!HAZARDS[kind].keepsToWater || tile.river)) ??
      shuffled.find(open) ??
      shuffled[0];

    placed.push({ kind, hex: home.hex, resolvedWith: [], carrying: 0 });
  }
  return placed;
}

/** One step, at random. Pirates take the river where there is one to take. */
function step(hazard: Hazard, state: GameState, rng: Rng): Hex {
  const options = neighbours(hazard.hex);
  if (options.length === 0) return hazard.hex;
  if (HAZARDS[hazard.kind].keepsToWater) {
    const wet = options.filter((h) => state.tiles[key(h)]?.river);
    if (wet.length > 0) return rng.pick(wet);
  }
  return rng.pick(options);
}

/**
 * Move every hazard a tile, then see who they landed on.
 *
 * A thief that has been beaten is gone for good, so it drops out of the wandering
 * before anything moves.
 */
export function moveHazards(state: GameState): GameState {
  const rng = makeRng(state.rngState);
  const beaten = new Set<string>(state.enemies.filter((e) => e.defeated).map((e) => e.kind));

  let next: GameState = {
    ...state,
    hazards: state.hazards.filter((h) => !beaten.has(h.kind)),
  };

  const moved: Hazard[] = next.hazards.map((hazard) => ({
    ...hazard,
    hex: step(hazard, next, rng),
    // Moving wipes the slate: whoever it met last turn can be met again.
    resolvedWith: [],
  }));

  next = { ...next, rngState: rng.state(), hazards: moved };

  // Thieves are also fightable, and their two records share one position.
  next = {
    ...next,
    enemies: next.enemies.map((enemy) => {
      const twin = moved.find((h) => h.kind === enemy.kind);
      return twin ? { ...enemy, hex: twin.hex } : enemy;
    }),
  };

  for (const hazard of moved) next = resolve(next, hazard.kind);
  return next;
}

/** What happens to whoever is standing where a hazard has just arrived. */
function resolve(state: GameState, kind: HazardKind): GameState {
  const hazard = state.hazards.find((h) => h.kind === kind);
  if (!hazard) return state;

  let next = kind === "tornado" ? flatten(state, hazard) : state;

  for (const player of next.players) {
    if (player.dead || key(player.hex) !== key(hazard.hex)) continue;
    if (hazard.resolvedWith.includes(player.id)) continue;
    next = meet(next, kind, player.id);
  }
  return next;
}

/**
 * One player, one hazard, one meeting - and only one. The guard lives here rather
 * than in the caller so that no route into this function can charge a player twice
 * for standing still (rulebook §5.5: it does not trigger again until one of you moves).
 */
export function meet(state: GameState, kind: HazardKind, playerId: string): GameState {
  const hazard = state.hazards.find((h) => h.kind === kind);
  const player = state.players.find((p) => p.id === playerId);
  if (!hazard || !player || player.dead) return state;
  if (hazard.resolvedWith.includes(playerId)) return state;

  const marked: GameState = {
    ...state,
    hazards: state.hazards.map((h) =>
      h.kind === kind ? { ...h, resolvedWith: [...h.resolvedWith, playerId] } : h,
    ),
  };

  switch (kind) {
    case "tornado":
      return blowAway(marked, player);
    case "robber":
    case "pirates":
      return confront(marked, player, kind);
    case "homeless":
      // Rulebook §5.5: nothing to give means a turn spent looking after them.
      if (player.money < DONATION && player.supply.length === 0) {
        return note(
          {
            ...marked,
            players: marked.players.map((p) =>
              p.id === player.id ? { ...p, stunned: true } : p,
            ),
          },
          `${player.name} had nothing to give, and spent the time looking after them. That is next turn gone.`,
        );
      }
      return note(marked, `${player.name} met a traveller.`);
  }
}

/**
 * Rulebook §5.5: the tornado destroys the **six tiles around it**, not the one it is
 * standing on - it drags a no-go ring across the board. The ground recovers as soon
 * as it moves on, which is the rulebook's own suggested answer to its §15 question.
 */
function flatten(state: GameState, hazard: Hazard): GameState {
  const ring = neighbours(hazard.hex);
  const tiles = { ...state.tiles };
  for (const hex of ring) {
    const label = key(hex);
    if (tiles[label]) tiles[label] = { ...tiles[label], destroyedUntil: state.turn + 1 };
  }
  return note(
    { ...state, tiles },
    "The tornado has moved. Everything around it is impassable.",
  );
}

/**
 * Caught by it. Rulebook §5.5: you lose **all your supply and one piece of
 * equipment**, and you come down anywhere within three tiles.
 *
 * Which piece of gear is the player's choice at the table; here it takes the least
 * useful thing they have - boots before armour before a weapon - so nobody has to
 * pause the game for a decision they were always going to make the same way. Where
 * they land is picked for them too, for the same reason: the nearest safe tile.
 */
function blowAway(state: GameState, player: Player): GameState {
  const rng = makeRng(state.rngState);
  const dropped = player.boots ?? player.armor ?? player.weapon;

  const landings = hexesInRange(player.hex, TORNADO_THROW).filter(
    (h) => !isDestroyed(state.tiles[key(h)], state.turn) && key(h) !== key(player.hex),
  );
  const landing = landings.length > 0 ? rng.pick(landings) : player.hex;

  const stripped: Player = {
    ...player,
    hex: landing,
    supply: [],
    ...(dropped ? { [slotKey(dropped.slot)]: null } : {}),
  };

  let next: GameState = {
    ...state,
    rngState: rng.state(),
    itemPile: dropped ? [...state.itemPile, dropped] : state.itemPile,
    players: state.players.map((p) => (p.id === player.id ? withMaxHealth(stripped) : p)),
  };
  next = note(
    next,
    `The tornado picked ${player.name} up and put them down somewhere else.`,
  );
  if (player.supply.length > 0) {
    next = note(next, `Everything in ${player.name}'s pack went with it.`);
  }
  return dropped ? note(next, `So did their ${dropped.name}.`) : next;
}

/**
 * Rulebook §5.5: the thieves do not mug you as they pass. They are mid-boss fights
 * standing in your way - you either take them on, or pay them off and back away.
 */
function confront(state: GameState, player: Player, kind: "robber" | "pirates"): GameState {
  return note(
    state,
    `${player.name} ran into ${kind === "pirates" ? "the Pirates" : "the Robber"}. Fight, or pay up.`,
  );
}

/**
 * Pay them off: rulebook §5.5. They take everything you have - and the pirates take
 * a piece of gear as well - and you back off a tile.
 */
export function payOff(state: GameState): GameState {
  const player = state.players[state.activePlayerIndex];
  const thief = thiefFacing(state, player);
  if (!thief || !canPayOff(state, player)) return state;

  const rng = makeRng(state.rngState);
  const taken = player.money;
  const gear = thief === "pirates" ? (player.weapon ?? player.armor ?? player.boots) : null;

  const away = neighbours(player.hex).filter(
    (h) => !isDestroyed(state.tiles[key(h)], state.turn),
  );
  const retreat = away.length > 0 ? rng.pick(away) : player.hex;

  const stripped: Player = {
    ...player,
    money: 0,
    hex: retreat,
    actedThisTurn: true,
    ...(gear ? { [slotKey(gear.slot)]: null } : {}),
  };

  let next: GameState = {
    ...state,
    rngState: rng.state(),
    players: state.players.map((p) => (p.id === player.id ? withMaxHealth(stripped) : p)),
    hazards: state.hazards.map((h) =>
      h.kind === thief ? { ...h, carrying: h.carrying + taken } : h,
    ),
    enemies: state.enemies.map((e) =>
      e.kind === thief && gear ? { ...e, loot: [...e.loot, gear] } : e,
    ),
  };
  next = note(next, `${player.name} handed over $${taken} and backed off.`);
  return gear ? note(next, `The pirates took their ${gear.name} too.`) : next;
}

/** The thief standing on the player's tile, if there is one. */
export function thiefFacing(state: GameState, player: Player): "robber" | "pirates" | null {
  const here = state.hazards.find(
    (h) => key(h.hex) === key(player.hex) && (h.kind === "robber" || h.kind === "pirates"),
  );
  return (here?.kind as "robber" | "pirates") ?? null;
}

export const canPayOff = (state: GameState, player: Player): boolean =>
  !player.dead &&
  state.combat === null &&
  state.ending === null &&
  !player.actedThisTurn &&
  thiefFacing(state, player) !== null;

/**
 * Give the traveller something. Costs money, not the turn - the spec's own default -
 * and buys an extra die in the next fight.
 */
export function donate(state: GameState): GameState {
  const player = state.players[state.activePlayerIndex];
  if (!canDonate(state, player)) return state;

  // A dollar if they have one, otherwise something out of the pack.
  const coin = player.money >= DONATION;
  const given = coin ? null : player.supply[0];

  return note(
    {
      ...state,
      players: state.players.map((p) =>
        p.id === player.id
          ? {
              ...p,
              money: coin ? p.money - DONATION : p.money,
              supply: given ? p.supply.filter((i) => i.id !== given.id) : p.supply,
              bonusDiceNextFight: p.bonusDiceNextFight + 1,
            }
          : p,
      ),
    },
    `${player.name} gave the traveller ${coin ? `$${DONATION}` : `their ${given?.name}`}. Four dice in the next fight.`,
  );
}

export function canDonate(state: GameState, player: Player): boolean {
  const traveller = state.hazards.find((h) => h.kind === "homeless");
  return (
    !player.dead &&
    state.combat === null &&
    state.ending === null &&
    // Once only, per §5.5: an extra die is not something you stack.
    player.bonusDiceNextFight === 0 &&
    traveller !== undefined &&
    key(traveller.hex) === key(player.hex) &&
    (player.money >= DONATION || player.supply.length > 0)
  );
}
