/**
 * The zustand store is a thin shell around `src/game/`: it holds a GameState and
 * swaps it for the one the pure functions return. No rules live here.
 */

import { create } from "zustand";
import { createInitialState } from "./setup";
import { randomSeed } from "./rng";
import type { GameState, Tile } from "./types";

type Store = {
  game: GameState;
  /** Tile the player last tapped, for the inspector panel. Pure UI state. */
  selected: string | null;
  newGame: (seed?: number) => void;
  select: (label: string | null) => void;
  tile: (label: string) => Tile | undefined;
};

export const useGame = create<Store>((set, get) => ({
  game: createInitialState(randomSeed()),
  selected: null,
  newGame: (seed) => set({ game: createInitialState(seed ?? randomSeed()), selected: null }),
  select: (label) => set({ selected: label }),
  tile: (label) => get().game.tiles[label],
}));
