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

/* ------------------------------------------------- getting them out and back in */

/**
 * Everything drawn so far, as one JSON string.
 *
 * The store lives in **one browser on one device**, which is the right trade for a
 * family game with no back end - but it also means an evening's drawing is one cleared
 * cache away from gone, and there is no way to get it onto the other tablet. This is
 * the way out: a file that can be kept, mailed, or handed back to whoever is building
 * the game so the drawings can be baked in for everybody.
 */
export const exportDrawings = (): string =>
  JSON.stringify({ format: "hex-rpg-art", version: 1, drawings: read() }, null, 1);

export type ImportResult = { added: number; kept: boolean } | { error: string };

/**
 * Read a file back in. **Adds to what is there rather than replacing it**, so importing
 * the tablet's drawings onto a machine that already has some does not silently wipe
 * them - the imported one wins per slot, and everything else stays.
 */
export function importDrawings(text: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { error: "That file is not the drawings file — it would not open as JSON." };
  }
  const box = parsed as { format?: string; drawings?: unknown };
  if (box?.format !== "hex-rpg-art" || typeof box.drawings !== "object" || box.drawings === null) {
    return { error: "That is a JSON file, but not one of ours." };
  }

  const coming = box.drawings as Record<string, unknown>;
  const good: Store = {};
  for (const [slot, value] of Object.entries(coming)) {
    // Only data URLs. A remote address here would be a picture that stops working the
    // first time the tablet is off the wifi, and a way to point the game at anything.
    if (typeof value === "string" && value.startsWith("data:image/")) good[slot] = value;
  }
  const added = Object.keys(good).length;
  if (added === 0) return { error: "There were no drawings in that file." };
  return { added, kept: write({ ...read(), ...good }) };
}

/** Roughly how much room the drawings are taking, for the art room to show. */
export const storageUsed = (): number => JSON.stringify(read()).length;

/** How many slots have a drawing against them. */
export const drawnCount = (): number => Object.keys(read()).length;
