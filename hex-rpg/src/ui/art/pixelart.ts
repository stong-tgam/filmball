/**
 * The generated pixel-art pictures, keyed back to the slots they are for.
 *
 * `tools/generate-art.ts` writes one PNG per slot into `./generated/`, named by
 * `slotToFilename` - imported from here rather than duplicated there, so the writer
 * and the reader can never name a file differently. This is the reading half: a
 * build-time glob picks up whatever has actually been generated so far (there is no
 * manifest to keep in sync - drop a new file in and it is picked up automatically),
 * and `pixelArtFor` looks one up by its slot id.
 *
 * **A slot nothing has generated yet returns `undefined`.** That is what lets
 * `Art.tsx` keep falling back to the old drawing while the set is still filling in -
 * this file never needs to know whether the pivot to pixel art is 1% or 100% done.
 */

import type { ArtSlot } from "./overrides";

/** "item:Frying Pan" -> "item-Frying_Pan.png". Lossy but stable; the slot id, not the
 *  filename, is still what the app and the generator both key off. */
export function slotToFilename(slot: ArtSlot): string {
  return slot.replace(/:/g, "-").replace(/[^a-zA-Z0-9_-]/g, "_") + ".png";
}

// Vite-only: resolves every PNG under ./generated/ to its built URL at build time, so
// a file the generator drops in later shows up here with no further wiring.
const files = import.meta.glob("./generated/*.png", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

const byFilename = new Map<string, string>(
  Object.entries(files).map(([path, url]) => [path.split("/").pop()!, url]),
);

export const pixelArtFor = (slot: ArtSlot): string | undefined => byFilename.get(slotToFilename(slot));

/** How many of the game's slots currently have a generated picture. For a status line
 *  somewhere, or a sanity check that the glob actually found what it should have. */
export const generatedCount = (): number => byFilename.size;
