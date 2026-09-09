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
 * This is the single place that asks. Wrap any generated drawing in it, give it the
 * slot the upload is keyed by, and an uploaded picture wins everywhere at once:
 *
 *     <Art slot={`item:${item.name}`}>
 *       <ItemArt name={item.name} seedName={item.id} />
 *     </Art>
 *
 * It renders inside SVG on the usual 0-100 box, so it drops in exactly where the
 * generated `<g>` used to sit. `Token` and `RoleToken` keep their own copies of this
 * because they crop to a disc and want the clip path; everything else uses this.
 */

import { useId, useSyncExternalStore, type ReactNode } from "react";
import { overrideFor, subscribe, type ArtSlot } from "./overrides";

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
   * How to fit an uploaded photograph into the 100x100 box.
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
  const drawing = useDrawing(slot);
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
      />
    </g>
  );
}
