/**
 * One seeded PRNG drives the whole game: board generation, dice, direction rolls,
 * card draws, feature draws. A game is then reproducible from its seed, bugs are
 * reportable ("seed 4471, turn 6"), and undo-by-replay stays possible.
 */

export type Rng = {
  /** Float in [0, 1). */
  next(): number;
  /** Integer in [min, max], inclusive. */
  int(min: number, max: number): number;
  /** True with the given probability. */
  chance(p: number): boolean;
  pick<T>(items: readonly T[]): T;
  /** Fisher-Yates; returns a new array. */
  shuffle<T>(items: readonly T[]): T[];
  /** Weighted pick; weights need not sum to 1. */
  weighted<T>(entries: readonly [T, number][]): T;
};

/** mulberry32 - small, fast, good enough for a board game. */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const rng: Rng = {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (p) => next() < p,
    pick: (items) => items[Math.floor(next() * items.length)],
    shuffle: (items) => {
      const out = items.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    weighted: (entries) => {
      const total = entries.reduce((sum, [, w]) => sum + w, 0);
      let roll = next() * total;
      for (const [value, weight] of entries) {
        roll -= weight;
        if (roll < 0) return value;
      }
      return entries[entries.length - 1][0];
    },
  };
  return rng;
}

/** A fresh seed for "new game" when the player does not supply one. */
export const randomSeed = (): number => Math.floor(Math.random() * 0xffffffff) >>> 0;
