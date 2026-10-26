/**
 * One drawing, wherever a drawing goes.
 *
 * Every picture in the game can be replaced by one of the children's own
 * (`art/overrides.ts`), and until now only the round `Token` honoured that - so a
 * photograph of a hand-drawn frying pan showed up on the find card and nowhere else:
 * not in the party's kit, not on the shop shelf, not in the fight. Fifteen call sites
 * drew the generated art directly and never asked whether somebody had drawn a better
 * one.
 *
 * This is the single place that asks - and, since the pivot to generated pixel art
 * (v0.33, `tools/generate-art.ts`), the single place that falls three ways: an
 * uploaded drawing first, then a generated picture for the slot
 * (`art/pixelart.ts`), and `children` only if neither exists yet:
 *
 *     <Art slot={`item:${item.name}`}>
 *       <ItemArt name={item.name} seedName={item.id} />
 *     </Art>
 *
 * **`children` is the old crayon-SVG art, kept on purpose while the generated set is
 * still filling in.** `tools/generate-art.ts` is resumable and gets run slot by slot,
 * so at any moment some slots have a picture and some do not - dropping `children` now
 * would blank out everything not generated yet instead of showing the old drawing.
 * Once every slot has a generated picture, drop `children` here and at every call site
 * and delete the retired SVG modules (`CLAUDE.md` tracks this as the last step).
 *
 * It renders inside SVG on the usual 0-100 box, so it drops in exactly where the
 * generated `<g>` used to sit. `Token` and `RoleToken` keep their own copies of this
 * because they crop to a disc and want the clip path; everything else uses this.
 */

import { useId, useSyncExternalStore, type ReactNode } from "react";
import { overrideFor, subscribe, type ArtSlot } from "./overrides";
import { pixelArtFor } from "./pixelart";

/** The uploaded picture for a slot, if there is one. Re-renders when one arrives. */
export function useDrawing(slot: ArtSlot | undefined): string | undefined {
  return useSyncExternalStore(
    subscribe,
    () => (slot === undefined ? undefined : overrideFor(slot)),
    () => undefined,
  );
}

export default function Art({
  slot,
  children,
  /**
   * How to fit a picture into the 100x100 box.
   *
   * `"slice"` fills the box and crops - right for a token, where the shape is a disc
   * and the edges are going to be cut off anyway. `"fit"` shows the whole picture
   * inside the box, which is what a piece of gear in a list wants: a frying pan with
   * its handle cropped off is a different frying pan.
   */
  fit = "fit",
}: {
  slot: ArtSlot;
  children: ReactNode;
  fit?: "fit" | "slice";
}) {
  const uploaded = useDrawing(slot);
  const drawing = uploaded ?? pixelArtFor(slot);
  const clip = useId();
  if (!drawing) return <>{children}</>;

  return (
    <g>
      <defs>
        <clipPath id={clip}>
          <rect x="0" y="0" width="100" height="100" rx="8" />
        </clipPath>
      </defs>
      <image
        href={drawing}
        x="0"
        y="0"
        width="100"
        height="100"
        clipPath={`url(#${clip})`}
        preserveAspectRatio={fit === "slice" ? "xMidYMid slice" : "xMidYMid meet"}
        // Generated art is a small raster (64x64) scaled up to fill the box; without
        // this it blurs, which defeats the whole point of pixel art. An uploaded photo
        // wants the opposite - but a scan or a photo already looks soft at this size
        // regardless, so the crispness only matters for the generated case.
        style={uploaded ? undefined : { imageRendering: "pixelated" }}
      />
    </g>
  );
}

