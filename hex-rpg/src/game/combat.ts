/**
 * Fighting.
 *
 * The shape of it, from the spec: three dice, each face `[1,1,1,2,2,3]`, plus your
 * weapon. Damage accumulates on the enemy across fights, so hurting something and
 * walking away is a real option - come back next turn and finish it.
 *
 * A round is one exchange: you hit, then it hits back if it is still standing. Then
 * the choice is yours again - roll again, or run. Running is always available and
 * always free, because the alternative is a seven-year-old watching their piece die
 * with nothing they could have done about it.
 *
 * PLACEHOLDER: how a downed player gets back into the game. `dead` is what the spec
 * models and it is what this implements, but a game meant for family night needs an
 * answer better than "you are out" - see CLAUDE.md.
 */

import { ENEMIES, healthLeft } from "./enemies";
import { key, neighbours } from "./hex";
import { makeRng } from "./rng";
import type { Combat, Enemy, Feature, GameState, LogEntry, Player, Roll, Tile } from "./types";

/** Each die reads 1, 1, 1, 2, 2, 3 - kind to young arithmetic, and rarely a zero. */
export const DIE_FACES = [1, 1, 1, 2, 2, 3] as const;

/** Dice you roll before any bonus. */
export const BASE_DICE = 3;

/** The enemy answers with a single die plus its own strength. */
export const ENEMY_DICE = 1;

export const attackValue = (player: Player): number => player.weapon?.value ?? 0;
export const armourValue = (player: Player): number => player.armor?.value ?? 0;

/** How many features a boss draws the first time anybody meets it. */
export const FEATURES_PER_BOSS = 2;

export const ALL_FEATURES: Feature[] = ["water", "railway", "city", "forest", "field"];

/**
 * A feature is ground the monster is at home on. Draw them once, on first sight, and
 * they stay drawn - the party learns what it is up against and can plan around it.
 *
 * PLACEHOLDER RULE. The spec names features and gives exactly one of their effects
 * (water lets a monster slip away once); the rest is missing with the rulebook. What
 * is implemented: a feature that matches the ground the fight is on makes the monster
 * hit harder, and water additionally buys it one escape.
 */
export const bossFeatures = (kind: Enemy["kind"]): boolean =>
  kind === "midboss" || kind === "finalboss";

export function drawFeatures(rngState: number): { features: Feature[]; rngState: number } {
  const rng = makeRng(rngState);
  return { features: rng.shuffle(ALL_FEATURES).slice(0, FEATURES_PER_BOSS), rngState: rng.state() };
}

/** The drawn features that the tile underfoot actually matches. */
export function activeFeatures(enemy: Enemy, tile: Tile | undefined): Feature[] {
  if (!tile) return [];
  return enemy.features.filter((feature) =>
    feature === "railway" ? tile.rail : tile.sides.includes(feature),
  );
}

/** Each matching feature adds a point to what the monster hits for. */
export const featureBonus = (enemy: Enemy, tile: Tile | undefined): number =>
  activeFeatures(enemy, tile).length;

/** "a Bandit", but "an Ogre". Small thing; the log is read aloud at the table. */
const an = (name: string): string => `${/^[aeiou]/i.test(name) ? "an" : "a"} ${name}`;

const note = (state: GameState, text: string): GameState => ({
  ...state,
  log: [...state.log, { turn: state.turn, text } satisfies LogEntry],
});

/** Roll `count` dice, returning the faces and the state the generator ended on. */
export function rollDice(rngState: number, count: number): { dice: number[]; rngState: number } {
  const rng = makeRng(rngState);
  const dice = Array.from({ length: count }, () => rng.pick(DIE_FACES));
  return { dice, rngState: rng.state() };
}

const total = (dice: number[]): number => dice.reduce((sum, d) => sum + d, 0);

export const combatants = (
  state: GameState,
): { player: Player; enemy: Enemy } | null => {
  if (!state.combat) return null;
  const player = state.players.find((p) => p.id === state.combat!.playerId);
  const enemy = state.enemies.find((e) => e.id === state.combat!.enemyId);
  return player && enemy ? { player, enemy } : null;
};

/** Start a fight between the active player and the enemy on their tile. */
export function startCombat(state: GameState, enemy: Enemy, from: string): GameState {
  const player = state.players[state.activePlayerIndex];

  // Bosses show what they are made of the first time somebody meets them.
  let next = state;
  if (bossFeatures(enemy.kind) && !enemy.featuresRevealed) {
    const drawn = drawFeatures(state.rngState);
    next = note(
      {
        ...state,
        rngState: drawn.rngState,
        enemies: state.enemies.map((e) =>
          e.id === enemy.id ? { ...e, features: drawn.features, featuresRevealed: true } : e,
        ),
      },
      `The ${ENEMIES[enemy.kind].name} is at home on ${drawn.features.join(" and ")}.`,
    );
  }

  const combat: Combat = {
    enemyId: enemy.id,
    playerId: player.id,
    from,
    round: 0,
    playerRoll: null,
    enemyRoll: null,
    outcome: "ongoing",
  };
  return note(
    { ...next, phase: "combat", combat },
    `${player.name} met ${an(ENEMIES[enemy.kind].name)} at ${key(enemy.hex)}.`,
  );
}

/**
 * One exchange. The player swings; if the enemy is still standing it swings back.
 */
export function attack(state: GameState): GameState {
  const pair = combatants(state);
  if (!state.combat || state.combat.outcome !== "ongoing" || !pair) return state;
  const { player, enemy } = pair;

  const swing = rollDice(state.rngState, BASE_DICE + player.bonusDiceNextFight);
  const dealt = total(swing.dice) + attackValue(player);
  const playerRoll: Roll = { dice: swing.dice, damage: dealt };

  const hurt: Enemy = { ...enemy, damageTaken: enemy.damageTaken + dealt };
  const ground = state.tiles[key(enemy.hex)];
  const profile = ENEMIES[enemy.kind];

  // A monster at home on water gets one slip away, and only one.
  const slipsAway =
    healthLeft(hurt) === 0 &&
    !enemy.escapedOnce &&
    activeFeatures(enemy, ground).includes("water");
  const killed = healthLeft(hurt) === 0 && !slipsAway;

  let next: GameState = {
    ...state,
    rngState: swing.rngState,
    enemies: state.enemies.map((e) => (e.id === enemy.id ? { ...hurt, defeated: killed } : e)),
    // The donated dice are spent whether or not they helped.
    players: state.players.map((p) =>
      p.id === player.id ? { ...p, bonusDiceNextFight: 0 } : p,
    ),
    combat: { ...state.combat, round: state.combat.round + 1, playerRoll, enemyRoll: null },
  };
  next = note(next, `${player.name} rolled ${swing.dice.join("+")} for ${dealt} damage.`);

  if (slipsAway) return escapeDownriver(next, enemy);

  if (killed) {
    return note(spoils({ ...next, combat: { ...next.combat!, outcome: "enemyDefeated" } }), `${profile.name} is beaten!`);
  }

  // Still standing, so it hits back.
  const bite = rollDice(next.rngState, ENEMY_DICE);
  const raw = total(bite.dice) + profile.attack + featureBonus(enemy, ground);
  const taken = Math.max(0, raw - armourValue(player));
  const enemyRoll: Roll = { dice: bite.dice, damage: taken };
  const health = Math.max(0, player.health - taken);
  const down = health === 0;

  next = {
    ...next,
    rngState: bite.rngState,
    players: next.players.map((p) => (p.id === player.id ? { ...p, health, dead: down } : p)),
    combat: { ...next.combat!, enemyRoll, outcome: down ? "playerDown" : "ongoing" },
  };
  next = note(
    next,
    `${profile.name} hit back for ${taken}. ${player.name} has ${health} health left.`,
  );

  return down ? note(next, `${player.name} is down.`) : next;
}

/**
 * Beaten, but at home in the water: it goes over the side with its wounds and
 * surfaces on a neighbouring tile. Once per monster, ever.
 */
function escapeDownriver(state: GameState, enemy: Enemy): GameState {
  const rng = makeRng(state.rngState);
  const bolthole = rng.pick(neighbours(enemy.hex));
  const profile = ENEMIES[enemy.kind];

  return note(
    {
      ...state,
      rngState: rng.state(),
      enemies: state.enemies.map((e) =>
        e.id === enemy.id
          ? {
              ...e,
              // A hair from beaten, and it keeps every wound.
              damageTaken: e.maxHealth - 1,
              escapedOnce: true,
              hex: bolthole,
              defeated: false,
            }
          : e,
      ),
      combat: { ...state.combat!, outcome: "enemyEscaped" },
    },
    `The ${profile.name} went into the water and came up at ${key(bolthole)}. It will not get away twice.`,
  );
}

/**
 * Hand out what a beaten enemy was carrying: coins straight into the player's pocket,
 * gear onto the ground for them to pick over. Whatever they leave behind goes back
 * into the pile when the fight closes.
 */
function spoils(state: GameState): GameState {
  const pair = combatants(state);
  if (!pair) return state;
  const { player, enemy } = pair;
  const profile = ENEMIES[enemy.kind];

  const rng = makeRng(state.rngState);
  const coins = rng.int(...profile.purse);
  const drops = state.itemPile.slice(0, profile.drops);
  const rest = state.itemPile.slice(profile.drops);

  let next: GameState = {
    ...state,
    rngState: rng.state(),
    itemPile: rest,
    enemies: state.enemies.map((e) => (e.id === enemy.id ? { ...e, loot: drops } : e)),
    players: state.players.map((p) =>
      p.id === player.id ? { ...p, money: p.money + coins } : p,
    ),
  };
  if (coins > 0) next = note(next, `${player.name} picked up $${coins}.`);
  if (drops.length > 0) {
    next = note(
      next,
      `The ${profile.name} was carrying ${drops.map((d) => an(d.name)).join(" and ")}.`,
    );
  }
  return next;
}

/** Back off to the tile you came from. Always allowed, always free. */
export function flee(state: GameState): GameState {
  const pair = combatants(state);
  if (!state.combat || state.combat.outcome !== "ongoing" || !pair) return state;
  const { player, enemy } = pair;

  const back = state.combat.from;
  const hex = state.players.find((p) => p.id === player.id)!.hex;
  const destination = back === key(hex) ? hex : { ...state.tiles[back].hex };

  return note(
    {
      ...state,
      players: state.players.map((p) => (p.id === player.id ? { ...p, hex: destination } : p)),
      combat: { ...state.combat, outcome: "playerEscaped" },
    },
    `${player.name} backed off to ${key(destination)}. The ${ENEMIES[enemy.kind].name} keeps its wounds.`,
  );
}

/** Close the fight and hand the state back to the turn machine. */
export function endCombat(state: GameState): GameState {
  if (!state.combat) return state;
  return { ...state, combat: null, phase: "playerMove" };
}
