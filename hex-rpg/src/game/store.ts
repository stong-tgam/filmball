/**
 * The zustand store is a thin shell around `src/game/`: it holds a GameState and
 * swaps it for the one the pure functions return. No rules live here.
 */

import { create } from "zustand";
import { startGame } from "./setup";
import { randomSeed } from "./rng";
import { activePlayer, clearDraw, endTurn, legalMoves, movePlayer } from "./turn";
import { attack, combatants, endCombat, flee, takeSpoil } from "./combat";
import {
  buy,
  canHeal,
  canSearch,
  canTrade,
  eat,
  heal,
  healTargets,
  openShop,
  search,
  sell,
} from "./actions";
import { canDonate, canPayOff, donate, payOff } from "./hazards";
import type { Enemy, GameState, Player, Tile } from "./types";

type Store = {
  game: GameState;
  /** Tile the player last tapped, for the inspector panel. Pure UI state. */
  selected: string | null;
  newGame: (seed?: number) => void;
  select: (label: string | null) => void;
  tile: (label: string) => Tile | undefined;
  moveTo: (label: string) => void;
  endTurn: () => void;
  attack: () => void;
  flee: () => void;
  search: () => void;
  donate: () => void;
  /** Shops are a panel, not a phase: opening one spends the turn's action. */
  shopOpen: boolean;
  openShop: () => void;
  closeShop: () => void;
  buy: (itemId: string) => void;
  sell: (itemId: string) => void;
  heal: (playerId: string) => void;
  payOff: () => void;
  eat: (playerId: string, itemId: string) => void;
  takeLoot: (itemId: string) => void;
  /** Put the turn's card away once the table has read it. */
  clearDraw: () => void;
  /** Close the fight, and pass the turn on now that it is spent. */
  closeCombat: () => void;
};

export const useGame = create<Store>((set, get) => ({
  game: startGame(randomSeed()),
  selected: null,
  newGame: (seed) => set({ game: startGame(seed ?? randomSeed()), selected: null, shopOpen: false }),
  select: (label) => set({ selected: label }),
  tile: (label) => get().game.tiles[label],
  moveTo: (label) => set({ game: movePlayer(get().game, label), selected: null }),
  endTurn: () => set({ game: endTurn(get().game), selected: null }),
  attack: () => set({ game: attack(get().game) }),
  flee: () => set({ game: flee(get().game) }),
  closeCombat: () => set({ game: endTurn(endCombat(get().game)), selected: null }),
  search: () => set({ game: search(get().game) }),
  donate: () => set({ game: donate(get().game) }),
  shopOpen: false,
  openShop: () => set({ game: openShop(get().game), shopOpen: true }),
  closeShop: () => set({ shopOpen: false }),
  buy: (itemId) => set({ game: buy(get().game, itemId) }),
  sell: (itemId) => set({ game: sell(get().game, itemId) }),
  heal: (playerId) => set({ game: heal(get().game, playerId), selected: null }),
  payOff: () => set({ game: payOff(get().game) }),
  eat: (playerId, itemId) => set({ game: eat(get().game, playerId, itemId) }),
  takeLoot: (itemId) => set({ game: takeSpoil(get().game, itemId) }),
  clearDraw: () => set({ game: clearDraw(get().game) }),
}));

/** Selectors, so components subscribe to the narrowest slice they can. */
export const useActivePlayer = (): Player => useGame((s) => activePlayer(s.game));
export const useLegalMoves = (): Map<string, number> =>
  useGame((s) => legalMoves(s.game, activePlayer(s.game)));

export const useCanSearch = (): boolean =>
  useGame((s) => canSearch(s.game, activePlayer(s.game)));
export const useCanTrade = (): boolean =>
  useGame((s) => canTrade(s.game, activePlayer(s.game)));
export const useCanDonate = (): boolean =>
  useGame((s) => canDonate(s.game, activePlayer(s.game)));
export const useCanPayOff = (): boolean =>
  useGame((s) => canPayOff(s.game, activePlayer(s.game)));
export const useCanHeal = (): boolean =>
  useGame((s) => canHeal(s.game, activePlayer(s.game)));
export const useHealTargets = (): Player[] =>
  useGame((s) => healTargets(s.game, activePlayer(s.game)));

/** The two sides of the fight on screen, or null when nobody is fighting. */
export const useCombatants = (): { player: Player; enemy: Enemy } | null =>
  useGame((s) => combatants(s.game));
