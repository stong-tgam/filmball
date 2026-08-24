/**
 * The children's own drawings, in place of the generated ones.
 *
 * Any token can have its artwork replaced by a photograph or scan. The replacement is
 * keyed by a slot name - "monster:mob:Goblin", "feature:water" - so one upload covers
 * every bandit that shares that face, and the game's own drawing stays as the fallback
 * for anything nobody has drawn yet.
 *
 * Stored in localStorage, which means it lives on that one tablet. That is the right
 * trade for now: no backend, and the drawings belong to the family that made them.
 * Pictures are shrunk hard before saving, because the whole store is a few megabytes.
 */

/** Longest edge, in pixels, that a saved drawing is kept at. */
export const MAX_EDGE = 320;
const KEY = "hex-rpg-art";

export type ArtSlot = string;
type Store = Record<ArtSlot, string>;

let cache: Store | null = null;
const listeners = new Set<() => void>();

function read(): Store {
  if (cache) return cache;
  try {
    cache = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Store;
  } catch {
    // A private window, cleared site data, or a browser that refuses storage.
    cache = {};
  }
  return cache;
}

function write(next: Store): boolean {
  cache = next;
  listeners.forEach((l) => l());
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
    return true;
  } catch {
    // Out of quota, or storage blocked. The drawing still shows this session.
    return false;
  }
}

export const allOverrides = (): Store => read();
export const overrideFor = (slot: ArtSlot): string | undefined => read()[slot];

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Save a drawing against a slot. Returns false when storage refused it. */
export const putOverride = (slot: ArtSlot, dataUrl: string): boolean =>
  write({ ...read(), [slot]: dataUrl });

export function clearOverride(slot: ArtSlot): boolean {
  const next = { ...read() };
  delete next[slot];
  return write(next);
}

export const clearAllOverrides = (): boolean => write({});

/**
 * Shrink a photograph to something a browser will happily keep, square-cropped to the
 * middle so it drops into a round token without a limb going missing.
 */
export function prepareDrawing(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(url);
      const side = Math.min(img.width, img.height);
      const canvas = document.createElement("canvas");
      canvas.width = MAX_EDGE;
      canvas.height = MAX_EDGE;

      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("This browser will not let us resize the picture."));

      // Paper, so a drawing on white paper keeps its ground rather than going glassy.
      ctx.fillStyle = "#FBF7EE";
      ctx.fillRect(0, 0, MAX_EDGE, MAX_EDGE);
      ctx.drawImage(
        img,
        (img.width - side) / 2,
        (img.height - side) / 2,
        side,
        side,
        0,
        0,
        MAX_EDGE,
        MAX_EDGE,
      );
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That file did not open as a picture."));
    };
    img.src = url;
  });
}
