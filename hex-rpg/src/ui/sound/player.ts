/**
 * Playing a sound effect.
 *
 * Generated clips (`tools/generate-sfx.ts`) live in `src/assets/sfx/<key>.mp3`, keyed
 * by the same `SfxKey` the generator used. **A key with no clip generated yet is a
 * quiet no-op, not an error** - same "degrade gracefully while the set fills in"
 * reasoning as `Art.tsx`'s pixel-art fallback, because this is written before any
 * clip actually exists.
 *
 * `muted` is a device preference (`App.tsx`'s own `useState`, next to `timed`), never
 * read off `GameState` - the hard rule that clocks and device-level things live in the
 * view applies here too: a sound playing or not is not a fact about the game.
 */

import type { SfxKey } from "../../sfxslots";

// Vite-only, same trick as `art/pixelart.ts`: resolves every mp3 under
// src/assets/sfx/ to its built URL at build time, so a clip the generator drops in
// later is picked up with no further wiring.
const files = import.meta.glob("../../assets/sfx/*.mp3", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

const urlFor = new Map<string, string>(
  Object.entries(files).map(([path, url]) => [
    path.split("/").pop()!.replace(/\.mp3$/, ""),
    url,
  ]),
);

const cache = new Map<SfxKey, HTMLAudioElement>();

function audioFor(key: SfxKey): HTMLAudioElement | undefined {
  const cached = cache.get(key);
  if (cached) return cached;
  const url = urlFor.get(key);
  if (!url) return undefined;
  const audio = new Audio(url);
  audio.preload = "auto";
  cache.set(key, audio);
  return audio;
}

/**
 * Play a sound effect by key.
 *
 * A no-op when muted, when the clip has not been generated yet, or when the browser
 * blocks the play (autoplay policies want a user gesture in the call stack - every
 * trigger here is a `useEffect` reacting to something a tap just caused, which
 * satisfies that in every browser tested, but a stray rejection is swallowed rather
 * than surfaced either way: a missing sound effect is never worth interrupting a
 * family's game over).
 */
export function playSfx(key: SfxKey, muted: boolean): void {
  if (muted) return;
  const audio = audioFor(key);
  if (!audio) return;
  audio.currentTime = 0;
  audio.play().catch(() => {});
}

/** Whether a clip has actually been generated for this key yet. */
export const hasSfx = (key: SfxKey): boolean => urlFor.has(key);
