/**
 * Keeping a game between sittings.
 *
 * A game runs thirty-two turns across five players, which is a long evening and often
 * more than one. Closing the tab used to throw all of it away — and on a tablet the
 * tab closes itself.
 *
 * The whole of `GameState` is plain serialisable data, which is a hard rule in
 * `CLAUDE.md` written down for exactly this moment: saving is `JSON.stringify` and
 * nothing else. No migration layer, no field-by-field mapping to drift out of date.
 *
 * **Bump `SAVE_VERSION` whenever `GameState` changes shape.** A save written before a
 * field existed will load without it and then crash somewhere far away — reading
 * `undefined.length` three turns later, with nothing on screen to say why. Refusing an
 * old save costs a family one game; loading one costs them an evening and leaves them
 * thinking the game is broken.
 */

import type { GameState } from "./types";

const KEY = "hex-rpg-save";

/**
 * Bumped on every change to the shape of `GameState`.
 *
 * 1 — first saves (v0.21): the state as of group fights, the palette and the roster.
 */
export const SAVE_VERSION = 3;

type Saved = {
  version: number;
  /** When it was put down, so the title screen can say how long ago. */
  at: number;
  game: GameState;
};

/** Write the game down. Never throws: a failed save must not take the game with it. */
export function saveGame(game: GameState): void {
  try {
    const saved: Saved = { version: SAVE_VERSION, at: Date.now(), game };
    localStorage.setItem(KEY, JSON.stringify(saved));
  } catch {
    // A private window, a full disk, a browser that refuses storage. The game carries
    // on unsaved rather than falling over in front of a seven-year-old.
  }
}

/** What is on the shelf, or null if there is nothing readable there. */
export function readSave(): { game: GameState; at: number } | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw) as Partial<Saved>;
    if (saved.version !== SAVE_VERSION || !saved.game) return null;
    // A finished game is not worth offering to resume.
    if (saved.game.ending) return null;
    return { game: saved.game, at: saved.at ?? 0 };
  } catch {
    return null;
  }
}

export const hasSave = (): boolean => readSave() !== null;

export function clearSave(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to do about it, and nothing that needs saying.
  }
}

/** "picked up 20 minutes ago", for the title screen. */
export function howLongAgo(at: number): string {
  const minutes = Math.round((Date.now() - at) / 60000);
  if (minutes < 1) return "a moment ago";
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}
