/**
 * The zustand store is a thin shell around `src/game/`: it holds a GameState and
 * swaps it for the one the pure functions return. No rules live here.
 */

import { create } from "zustand";
import { createInitialState } from "./setup";
import { randomSeed } from "./rng";
import { activePlayer, endTurn, legalMoves, movePlayer } from "./turn";
import { attack, combatants, endCombat, flee } from "./combat";
import { buy, canSearch, canTrade, eat, openShop, returnUnclaimedLoot, search, takeLoot } from "./actions";
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
  /** Shops are a panel, not a phase: opening one spends the turn's action. */
  shopOpen: boolean;
  openShop: () => void;
  closeShop: () => void;
  buy: (itemId: string) => void;
  eat: (playerId: string, itemId: string) => void;
  takeLoot: (itemId: string) => void;
  /** Close the fight, and pass the turn on now that it is spent. */
  closeCombat: () => void;
};

export const useGame = create<Store>((set, get) => ({
  game: createInitialState(randomSeed()),
  selected: null,
  newGame: (seed) => set({ game: createInitialState(seed ?? randomSeed()), selected: null }),
  select: (label) => set({ selected: label }),
  tile: (label) => get().game.tiles[label],
  moveTo: (label) => set({ game: movePlayer(get().game, label), selected: null }),
  endTurn: () => set({ game: endTurn(get().game), selected: null }),
  attack: () => set({ game: attack(get().game) }),
  flee: () => set({ game: flee(get().game) }),
  closeCombat: () =>
    set({ game: endTurn(endCombat(returnUnclaimedLoot(get().game))), selected: null }),
  search: () => set({ game: search(get().game) }),
  shopOpen: false,
  openShop: () => set({ game: openShop(get().game), shopOpen: true }),
  closeShop: () => set({ shopOpen: false }),
  buy: (itemId) => set({ game: buy(get().game, itemId) }),
  eat: (playerId, itemId) => set({ game: eat(get().game, playerId, itemId) }),
  takeLoot: (itemId) => set({ game: takeLoot(get().game, itemId) }),
}));

/** Selectors, so components subscribe to the narrowest slice they can. */
export const useActivePlayer = (): Player => useGame((s) => activePlayer(s.game));
export const useLegalMoves = (): Map<string, number> =>
  useGame((s) => legalMoves(s.game, activePlayer(s.game)));

export const useCanSearch = (): boolean =>
  useGame((s) => canSearch(s.game, activePlayer(s.game)));
export const useCanTrade = (): boolean =>
  useGame((s) => canTrade(s.game, activePlayer(s.game)));

/** The two sides of the fight on screen, or null when nobody is fighting. */
export const useCombatants = (): { player: Player; enemy: Enemy } | null =>
  useGame((s) => combatants(s.game));
