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
import { key } from "./hex";
import { makeRng } from "./rng";
import type { Combat, Enemy, GameState, LogEntry, Player, Roll } from "./types";

/** Each die reads 1, 1, 1, 2, 2, 3 - kind to young arithmetic, and rarely a zero. */
export const DIE_FACES = [1, 1, 1, 2, 2, 3] as const;

/** Dice you roll before any bonus. */
export const BASE_DICE = 3;

/** The enemy answers with a single die plus its own strength. */
export const ENEMY_DICE = 1;

export const attackValue = (player: Player): number => player.weapon?.value ?? 0;
export const armourValue = (player: Player): number => player.armor?.value ?? 0;

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
    { ...state, phase: "combat", combat },
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
  const killed = healthLeft(hurt) === 0;
  const profile = ENEMIES[enemy.kind];

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

  if (killed) {
    return note(spoils({ ...next, combat: { ...next.combat!, outcome: "enemyDefeated" } }), `${profile.name} is beaten!`);
  }

  // Still standing, so it hits back.
  const bite = rollDice(next.rngState, ENEMY_DICE);
  const raw = total(bite.dice) + profile.attack;
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
