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

import { distance, key, neighbours, type Hex } from "./hex";
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
    colour: "#9aa7b4",
    glyph: "🌀",
    keepsToWater: false,
  },
  homeless: {
    name: "Traveller",
    blurb: "Down on their luck. Give them something and they will wish you well.",
    colour: "#c9a227",
    glyph: "☂",
    keepsToWater: false,
  },
  robber: {
    name: "Robber",
    blurb: "Takes your coins and keeps moving. Catch them to get it back.",
    colour: "#b0894a",
    glyph: "R",
    keepsToWater: false,
  },
  pirates: {
    name: "Pirates",
    blurb: "River thieves. They take your gear, not your money.",
    colour: "#4a90b0",
    glyph: "P",
    keepsToWater: true,
  },
};

/** What a robber lifts, and what a donation to the traveller buys. */
export const ROBBERY = 3;
export const DONATION = 2;
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

    const shuffled = rng.shuffle(Object.values(tiles));
    const wants = shuffled.filter(
      (tile) =>
        open(tile) &&
        (!HAZARDS[kind].keepsToWater || tile.river) &&
        players.every((p) => distance(p.hex, tile.hex) >= HAZARD_SAFE_RADIUS),
    );
    // Fall back through the constraints rather than failing to place a hazard.
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

/** The tornado wrecks the ground under it whether anybody is there or not. */
function flatten(state: GameState, hazard: Hazard): GameState {
  const label = key(hazard.hex);
  const tile = state.tiles[label];
  if (!tile) return state;

  return note(
    {
      ...state,
      // Recovers as soon as the tornado moves on, which is next turn.
      tiles: { ...state.tiles, [label]: { ...tile, destroyedUntil: state.turn + 1 } },
    },
    `The tornado tore through ${label}.`,
  );
}

/**
 * One player, one hazard, one meeting - and only one. The guard lives here rather
 * than in the caller so that no route into this function can charge a player twice
 * for standing still.
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
      return rob(marked, player);
    case "pirates":
      return plunder(marked, player);
    // The traveller asks rather than takes: see `donate`.
    case "homeless":
      return note(marked, `${player.name} met a traveller at ${key(player.hex)}.`);
  }
}

/** Picked up and put down a tile away, with the next turn spent getting up. */
function blowAway(state: GameState, player: Player): GameState {
  const rng = makeRng(state.rngState);
  const clear = neighbours(player.hex).filter(
    (h) => !isDestroyed(state.tiles[key(h)], state.turn),
  );
  const landing = clear.length > 0 ? rng.pick(clear) : player.hex;

  return note(
    {
      ...state,
      rngState: rng.state(),
      players: state.players.map((p) =>
        p.id === player.id ? { ...p, hex: landing, stunned: true } : p,
      ),
    },
    `${player.name} was caught by the tornado and dumped at ${key(landing)}. That is next turn gone.`,
  );
}

function rob(state: GameState, player: Player): GameState {
  const taken = Math.min(ROBBERY, player.money);
  if (taken === 0) {
    return note(state, `The robber went through ${player.name}'s pockets and found nothing.`);
  }
  return note(
    {
      ...state,
      players: state.players.map((p) =>
        p.id === player.id ? { ...p, money: p.money - taken } : p,
      ),
      hazards: state.hazards.map((h) =>
        h.kind === "robber" ? { ...h, carrying: h.carrying + taken } : h,
      ),
    },
    `The robber took $${taken} from ${player.name}. Catch them to get it back.`,
  );
}

/** Pirates take gear rather than coins, and carry it until somebody beats them. */
function plunder(state: GameState, player: Player): GameState {
  const prize = player.weapon ?? player.armor ?? player.boots;
  if (!prize) {
    return note(state, `The pirates looked ${player.name} over and found nothing worth taking.`);
  }
  const slot = prize.slot === "weapon" ? "weapon" : prize.slot === "armor" ? "armor" : "boots";

  return note(
    {
      ...state,
      players: state.players.map((p) => (p.id === player.id ? { ...p, [slot]: null } : p)),
      enemies: state.enemies.map((e) =>
        e.kind === "pirates" ? { ...e, loot: [...e.loot, prize] } : e,
      ),
    },
    `The pirates made off with ${player.name}'s ${prize.name}.`,
  );
}

/**
 * Give the traveller something. Costs money, not the turn - the spec's own default -
 * and buys an extra die in the next fight.
 */
export function donate(state: GameState): GameState {
  const player = state.players[state.activePlayerIndex];
  const traveller = state.hazards.find((h) => h.kind === "homeless");
  if (!traveller || !canDonate(state, player)) return state;

  return note(
    {
      ...state,
      players: state.players.map((p) =>
        p.id === player.id
          ? {
              ...p,
              money: p.money - DONATION,
              bonusDiceNextFight: p.bonusDiceNextFight + 1,
            }
          : p,
      ),
    },
    `${player.name} gave the traveller $${DONATION}. An extra die in the next fight.`,
  );
}

export function canDonate(state: GameState, player: Player): boolean {
  const traveller = state.hazards.find((h) => h.kind === "homeless");
  return (
    !player.dead &&
    state.combat === null &&
    state.phase !== "gameOver" &&
    traveller !== undefined &&
    key(traveller.hex) === key(player.hex) &&
    player.money >= DONATION
  );
}
