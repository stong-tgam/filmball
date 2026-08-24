/**
 * The zustand store is a thin shell around `src/game/`: it holds a GameState and
 * swaps it for the one the pure functions return. No rules live here.
 */

import { create } from "zustand";
import { createInitialState } from "./setup";
import { randomSeed } from "./rng";
import { activePlayer, endTurn, legalMoves, movePlayer } from "./turn";
import type { GameState, Player, Tile } from "./types";

type Store = {
  game: GameState;
  /** Tile the player last tapped, for the inspector panel. Pure UI state. */
  selected: string | null;
  newGame: (seed?: number) => void;
  select: (label: string | null) => void;
  tile: (label: string) => Tile | undefined;
  moveTo: (label: string) => void;
  endTurn: () => void;
};

export const useGame = create<Store>((set, get) => ({
  game: createInitialState(randomSeed()),
  selected: null,
  newGame: (seed) => set({ game: createInitialState(seed ?? randomSeed()), selected: null }),
  select: (label) => set({ selected: label }),
  tile: (label) => get().game.tiles[label],
  moveTo: (label) => set({ game: movePlayer(get().game, label), selected: null }),
  endTurn: () => set({ game: endTurn(get().game), selected: null }),
}));

/** Selectors, so components subscribe to the narrowest slice they can. */
export const useActivePlayer = (): Player => useGame((s) => activePlayer(s.game));
export const useLegalMoves = (): Map<string, number> =>
  useGame((s) => legalMoves(s.game, activePlayer(s.game)));
