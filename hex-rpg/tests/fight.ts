/**
 * Getting a test into a fight, and through one.
 *
 * A fight is a run of mini-games now, and none of them can be resolved by the code
 * under test - the table says whether a drawing was good enough. So a test that wants
 * a beaten monster says so directly: `winAll` taps "we did it" until the run is over.
 */

import { startCombat, wonTrial, lostTrial } from "../src/game/combat";
import { key } from "../src/game/hex";
import type { Combat, Enemy, GameState } from "../src/game/types";

/** Walk a team onto the monster and take it on. */
export function intoFight(state: GameState, enemy: Enemy, ids?: string[]): GameState {
  const team = ids ?? [state.players[state.activePlayerIndex].id];
  const there: GameState = {
    ...state,
    players: state.players.map((p) => (team.includes(p.id) ? { ...p, hex: enemy.hex } : p)),
  };
  return startCombat(there, enemy, key(enemy.hex), team);
}

/** Win every card. The fight ends beaten, or downriver if the water feature bit. */
export function winAll(state: GameState): GameState {
  let s = state;
  for (let i = 0; i < 8 && s.combat?.outcome === "ongoing"; i++) s = wonTrial(s);
  return s;
}

/** Miss the first card, which is the whole of losing a fight. */
export const loseIt = (state: GameState): GameState => lostTrial(state);

/** A fight record, for tests that need one without playing into it. */
export function aCombat(over: Partial<Combat> & Pick<Combat, "enemyId" | "playerId">): Combat {
  return {
    allies: [],
    trials: [],
    at: 0,
    hintsLeft: 0,
    skillsUsed: [],
    gearUsed: [],
    from: "",
    spoils: [],
    picksLeft: 0,
    outcome: "ongoing",
    ...over,
  };
}
