/**
 * Fighting. Rulebook §7 and §9.
 *
 * Roll three dice, add your attack, and compare the total to what the enemy has left.
 *
 * - **Damage ≥ remaining health** → beaten, and it drops its loot.
 * - **Damage < remaining health** → the damage sticks, and you lose 1 health.
 * - **Exact tie** → nothing at all happens, and you go back where you started.
 *
 * Then roll again or walk away. Damage stays on a wounded enemy either way, which is
 * the rule that makes the health numbers work: nothing has to die in one turn.
 *
 * Losing a roll costs exactly one health, never a dice roll's worth. On three health
 * that is the difference between a game a child can read and one they cannot.
 */

import { ENEMIES, healthLeft, nameWithArticle, verb } from "./enemies";
import { key, neighbours } from "./hex";
import { makeRng } from "./rng";
import { canTake, equip } from "./items";
import { maxHealthOf } from "./players";
import type { Combat, Enemy, Feature, GameState, Item, LogEntry, Player, Roll, Tile } from "./types";

/** Rulebook §2: three faces of 1, two of 2, one of 3. Average 1.67 a die. */
export const DIE_FACES = [1, 1, 1, 2, 2, 3] as const;

/** Dice you roll before any bonus. */
export const BASE_DICE = 3;

/** A failed roll costs this much health, before any boss feature adds to it. */
export const FAILED_ROLL_COST = 1;

export const ALL_FEATURES: Feature[] = ["water", "railway", "city", "forest", "field"];

const note = (state: GameState, text: string): GameState => ({
  ...state,
  log: [...state.log, { turn: state.turn, text } satisfies LogEntry],
});

const total = (dice: number[]): number => dice.reduce((sum, d) => sum + d, 0);

/** Roll `count` dice, returning the faces and the state the generator ended on. */
export function rollDice(rngState: number, count: number): { dice: number[]; rngState: number } {
  const rng = makeRng(rngState);
  const dice = Array.from({ length: count }, () => rng.pick(DIE_FACES));
  return { dice, rngState: rng.state() };
}

export const combatants = (state: GameState): { player: Player; enemy: Enemy } | null => {
  if (!state.combat) return null;
  const player = state.players.find((p) => p.id === state.combat!.playerId);
  const enemy = state.enemies.find((e) => e.id === state.combat!.enemyId);
  return player && enemy ? { player, enemy } : null;
};

/* ------------------------------------------------------------------ features */

/** Rulebook §9: every enemy draws a feature, and the final boss draws two. */
export function drawFeatures(rngState: number, count: number): { features: Feature[]; rngState: number } {
  const rng = makeRng(rngState);
  return { features: rng.shuffle(ALL_FEATURES).slice(0, count), rngState: rng.state() };
}

/** The features that the ground underfoot actually matches. */
export function activeFeatures(enemy: Enemy, tile: Tile | undefined): Feature[] {
  if (!tile) return [];
  return enemy.features.filter((feature) =>
    feature === "railway" ? tile.rail : tile.sides.includes(feature),
  );
}

/** Rulebook §9, field: the boss hits for one more per player in the fight. */
export const extraToll = (enemy: Enemy, tile: Tile | undefined, party: number): number =>
  activeFeatures(enemy, tile).includes("field") ? party : 0;

/** Rulebook §9, forest: everybody in the fight loses a point of attack. */
export const attackPenalty = (enemy: Enemy, tile: Tile | undefined): number =>
  activeFeatures(enemy, tile).includes("forest") ? 1 : 0;

/* ------------------------------------------------------------------- attack */

/** Rulebook §3 and §12: the role's own arm, plus a weapon, less any forest penalty. */
export function attackValue(player: Player, enemy?: Enemy, tile?: Tile): number {
  const base = (player.weapon?.value ?? 0) + roleAttack(player);
  const penalty = enemy ? attackPenalty(enemy, tile) : 0;
  return Math.max(0, base - penalty);
}

const roleAttack = (player: Player): number =>
  player.role === "rogue" ? 1 : 0;

/* -------------------------------------------------------------- the encounter */

/**
 * Meeting something. Features are drawn here, before the first roll - rulebook §9 is
 * explicit that they are known before the encounter, so the party can decide whether
 * to take the fight at all.
 *
 * Two of them bite the moment the fight opens: railway costs a health, and city costs
 * a dollar on a city tile or a health anywhere else.
 */
export function startCombat(
  state: GameState,
  enemy: Enemy,
  from: string,
  /** True when the player walked onto a hidden monster rather than picking the fight. */
  ambush = false,
): GameState {
  const player = state.players[state.activePlayerIndex];
  const profile = ENEMIES[enemy.kind];
  let next = state;
  let fighter = enemy;

  if (!enemy.featuresRevealed && profile.features > 0) {
    const drawn = drawFeatures(state.rngState, profile.features);
    fighter = { ...enemy, features: drawn.features, featuresRevealed: true };
    next = {
      ...state,
      rngState: drawn.rngState,
      enemies: state.enemies.map((e) => (e.id === enemy.id ? fighter : e)),
    };
    next = note(next, `${profile.name} is at home on ${drawn.features.join(" and ")}.`);
  }

  const combat: Combat = {
    enemyId: enemy.id,
    playerId: player.id,
    from,
    round: 0,
    playerRoll: null,
    toll: 0,
    spoils: [],
    picksLeft: 0,
    ambush,
    outcome: "ongoing",
  };
  // Found is permanent. Back away from an ambush and the monster stays on the board
  // for everyone who can see that tile - the party paid a turn for that information.
  next = {
    ...next,
    enemies: next.enemies.map((e) => (e.id === enemy.id ? { ...e, found: true } : e)),
  };
  next = note(
    { ...next, phase: "combat", combat },
    `${player.name} met ${nameWithArticle(enemy.kind)}.`,
  );

  return openingBite(next, fighter);
}

/** Railway and city both take something the moment the fight starts. */
function openingBite(state: GameState, enemy: Enemy): GameState {
  const ground = state.tiles[key(enemy.hex)];
  const active = activeFeatures(enemy, ground);
  const profile = ENEMIES[enemy.kind];
  let next = state;

  if (active.includes("railway")) {
    next = hurt(next, FAILED_ROLL_COST, `The ${profile.name} caught someone on the tracks.`);
  }
  if (active.includes("city")) {
    const player = next.players.find((p) => p.id === next.combat?.playerId);
    if (player && ground?.sides.includes("city")) {
      next = note(
        {
          ...next,
          players: next.players.map((p) =>
            p.id === player.id ? { ...p, money: Math.max(0, p.money - 1) } : p,
          ),
        },
        `Fighting in the streets costs ${player.name} $1.`,
      );
    } else {
      next = hurt(next, 1, `The ${profile.name} fights dirty out here.`);
    }
  }
  return next;
}

/** Take health off whoever is in the fight, and see whether they are still standing. */
function hurt(state: GameState, amount: number, why: string): GameState {
  const player = state.players.find((p) => p.id === state.combat?.playerId);
  if (!player || amount <= 0) return state;

  const health = Math.max(0, player.health - amount);
  const down = health === 0;
  let next: GameState = {
    ...state,
    players: state.players.map((p) =>
      p.id === player.id
        ? {
            ...p,
            health,
            dead: down,
            fellAt: down ? p.hex : p.fellAt,
            fellOn: down ? state.turn : p.fellOn,
          }
        : p,
    ),
    combat: state.combat
      ? { ...state.combat, toll: amount, outcome: down ? "playerDown" : state.combat.outcome }
      : null,
  };
  next = note(next, `${why} ${player.name} is down to ${health} health.`);
  return down ? note(next, `${player.name} has fallen.`) : next;
}

/* ---------------------------------------------------------------- one round */

/** One roll of the dice, and what it does. */
export function attack(state: GameState): GameState {
  const pair = combatants(state);
  if (!state.combat || state.combat.outcome !== "ongoing" || !pair) return state;
  const { player, enemy } = pair;

  const ground = state.tiles[key(enemy.hex)];
  const swing = rollDice(state.rngState, BASE_DICE + player.bonusDiceNextFight);
  const dealt = total(swing.dice) + attackValue(player, enemy, ground);
  const playerRoll: Roll = { dice: swing.dice, damage: dealt };
  const remaining = healthLeft(enemy);

  let next: GameState = {
    ...state,
    rngState: swing.rngState,
    // The donated die is spent whether or not it helped.
    players: state.players.map((p) =>
      p.id === player.id ? { ...p, bonusDiceNextFight: 0 } : p,
    ),
    combat: { ...state.combat, round: state.combat.round + 1, playerRoll, toll: 0 },
  };
  next = note(next, `${player.name} rolled ${swing.dice.join("+")} for ${dealt}.`);

  // Rulebook §7: an exact tie does nothing at all, and you go back where you started.
  if (dealt === remaining) return standoff(next, enemy);

  if (dealt > remaining) {
    const finished: GameState = {
      ...next,
      enemies: next.enemies.map((e) =>
        e.id === enemy.id ? { ...e, damageTaken: e.maxHealth } : e,
      ),
    };
    const slipsAway =
      !enemy.escapedOnce && activeFeatures(enemy, ground).includes("water") && ground?.river === true;
    return slipsAway ? escapeDownriver(finished, enemy) : beaten(finished, enemy);
  }

  // Short of it: the damage sticks and it costs a health.
  const wounded: GameState = {
    ...next,
    enemies: next.enemies.map((e) =>
      e.id === enemy.id ? { ...e, damageTaken: e.damageTaken + dealt } : e,
    ),
  };
  const toll = FAILED_ROLL_COST + extraToll(enemy, ground, 1);
  return hurt(
    wounded,
    toll,
    `Not enough — the ${ENEMIES[enemy.kind].name} has ${remaining - dealt} left.`,
  );
}

/** Rulebook §7: an exact tie. Nothing happens; you are back where you started. */
function standoff(state: GameState, enemy: Enemy): GameState {
  const back = state.combat!.from;
  const home = state.tiles[back]?.hex;
  return note(
    {
      ...state,
      players: home
        ? state.players.map((p) =>
            p.id === state.combat!.playerId ? { ...p, hex: home } : p,
          )
        : state.players,
      combat: { ...state.combat!, outcome: "standoff" },
    },
    `Dead even against the ${ENEMIES[enemy.kind].name}. Nothing doing — back where they started.`,
  );
}

/* --------------------------------------------------------------------- loot */

/**
 * Beaten. Rulebook §10: it drops a fixed number of items and the winner keeps some of
 * them; the rest go back in the pile. Money is not dropped - selling what you keep is
 * how the party gets paid.
 */
function beaten(state: GameState, enemy: Enemy): GameState {
  const profile = ENEMIES[enemy.kind];
  const drops = state.itemPile.slice(0, profile.drops);
  const rest = state.itemPile.slice(profile.drops);
  // A thief drops what it stole on top of its own haul.
  const stolen = state.enemies.find((e) => e.id === enemy.id)?.loot ?? [];
  const spoils: Item[] = [...stolen, ...drops];

  let next: GameState = {
    ...state,
    itemPile: rest,
    enemies: state.enemies.map((e) =>
      e.id === enemy.id ? { ...e, defeated: true, loot: [] } : e,
    ),
    combat: {
      ...state.combat!,
      outcome: "enemyDefeated",
      spoils,
      picksLeft: Math.min(profile.picks, spoils.length),
    },
  };
  if (profile.purse > 0) {
    const winner = next.players.find((p) => p.id === next.combat!.playerId);
    if (winner) {
      next = {
        ...next,
        players: next.players.map((p) =>
          p.id === winner.id ? { ...p, money: p.money + profile.purse } : p,
        ),
      };
      next = note(next, `${winner.name} took $${profile.purse} off the body.`);
    }
  }
  next = note(next, `${profile.name} ${verb(enemy.kind, "is", "are")} beaten!`);

  // Rulebook §14: the dragon is the game.
  if (enemy.kind === "finalboss") {
    next = note({ ...next, ending: "victory" }, "The dragon is dead. The party has won.");
  }
  return next;
}

/** Rulebook §9, water: beaten on a river tile, it slips away to another one. Once. */
function escapeDownriver(state: GameState, enemy: Enemy): GameState {
  const rng = makeRng(state.rngState);
  const river = neighbours(enemy.hex).filter((h) => state.tiles[key(h)]?.river);
  const bolthole = river.length > 0 ? rng.pick(river) : rng.pick(neighbours(enemy.hex));
  const profile = ENEMIES[enemy.kind];

  return note(
    {
      ...state,
      rngState: rng.state(),
      enemies: state.enemies.map((e) =>
        e.id === enemy.id
          ? { ...e, damageTaken: 0, escapedOnce: true, hex: bolthole, defeated: false }
          : e,
      ),
      combat: { ...state.combat!, outcome: "enemyEscaped" },
    },
    `The ${profile.name} went into the water and surfaced somewhere downriver, whole again. ${verb(
      enemy.kind,
      "It will",
      "They will",
    )} not get away twice.`,
  );
}

/** Take one of the things on the ground, up to what the rulebook lets you keep. */
export function takeSpoil(state: GameState, itemId: string): GameState {
  const combat = state.combat;
  if (!combat || combat.picksLeft <= 0) return state;

  const item = combat.spoils.find((i) => i.id === itemId);
  const player = state.players.find((p) => p.id === combat.playerId);
  if (!item || !player) return state;

  if (!canTake(player, item)) return state;

  const { player: carrying, returned } = equip(player, item);
  let next: GameState = {
    ...state,
    itemPile: returned ? [...state.itemPile, returned] : state.itemPile,
    players: state.players.map((p) =>
      p.id === player.id ? withHealthCap(carrying) : p,
    ),
    combat: {
      ...combat,
      spoils: combat.spoils.filter((i) => i.id !== item.id),
      picksLeft: combat.picksLeft - 1,
    },
  };
  next = note(next, `${player.name} kept the ${item.name}.`);
  return returned ? note(next, `${returned.name} went back to the pile.`) : next;
}

/** Anything not picked goes back to the pile, per §10. */
export function discardSpoils(state: GameState): GameState {
  const combat = state.combat;
  if (!combat || combat.spoils.length === 0) return state;
  return {
    ...state,
    itemPile: [...state.itemPile, ...combat.spoils],
    combat: { ...combat, spoils: [], picksLeft: 0 },
  };
}

/* ------------------------------------------------------------------ leaving */

/** Rulebook §7: escaping costs your turn, and the wounds you dealt stay dealt. */
export function flee(state: GameState): GameState {
  const pair = combatants(state);
  if (!state.combat || state.combat.outcome !== "ongoing" || !pair) return state;
  const { player, enemy } = pair;

  const back = state.combat.from;
  const home = state.tiles[back]?.hex ?? player.hex;
  // Walking into a hidden monster is not a decision, so backing straight out of one
  // is free: it costs the move you already spent and nothing more. Once you have
  // swung at it you have chosen the fight, and leaving costs your action as usual.
  const freeLook = state.combat.ambush && state.combat.round === 0;

  if (freeLook) {
    return note(
      {
        ...state,
        players: state.players.map((p) =>
          p.id === player.id ? { ...p, hex: home, actedThisTurn: false } : p,
        ),
        combat: { ...state.combat, outcome: "playerEscaped" },
      },
      `${player.name} found ${nameWithArticle(enemy.kind)} and backed straight out again.`,
    );
  }

  return note(
    {
      ...state,
      players: state.players.map((p) =>
        p.id === player.id ? { ...p, hex: home, actedThisTurn: true } : p,
      ),
      combat: { ...state.combat, outcome: "playerEscaped" },
    },
    `${player.name} backed off. The ${ENEMIES[enemy.kind].name} ${verb(
      enemy.kind,
      "keeps its",
      "keep their",
    )} wounds.`,
  );
}

/** Close the fight and hand the state back to the turn machine. */
export function endCombat(state: GameState): GameState {
  if (!state.combat) return state;
  return { ...discardSpoils(state), combat: null, phase: "playerMove" };
}

/* ------------------------------------------------------------------ helpers */

const withHealthCap = (player: Player): Player => {
  const maxHealth = maxHealthOf(player);
  return { ...player, maxHealth, health: Math.min(player.health, maxHealth) };
};
