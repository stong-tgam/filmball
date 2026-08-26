/**
 * The drawing a slot names, whatever kind of thing it is.
 *
 * The art room and the compass both need "show me the picture called
 * `monster:midboss`" without caring which family of drawings that belongs to. Splitting
 * on the prefix here means the two of them cannot disagree about what a slot looks
 * like, and a new family of pictures is one more case.
 *
 * Uploads are honoured, because it goes through `<Art>`.
 */

import Art from "./Art";
import ItemArt from "./items";
import MonsterArt from "./monsters";
import FeatureArt from "./features";
import GemArt from "./gems";
import RoleArt from "./roles";
import HazardArt from "./hazards";
import type { EnemyKind, Feature, GemKind, HazardKind, Role } from "../../game/types";

/** The generated drawing for a slot, before any upload is considered. */
export function Generated({ slot }: { slot: string }) {
  const cut = slot.indexOf(":");
  const [what, rest] = [slot.slice(0, cut), slot.slice(cut + 1)];
  switch (what) {
    case "role":
      return <RoleArt role={rest as Role} />;
    case "monster":
      return <MonsterArt kind={rest as EnemyKind} seedName={slot} />;
    case "hazard":
      return <HazardArt kind={rest as HazardKind} />;
    case "gem":
      return <GemArt kind={rest as GemKind} />;
    case "feature":
      return <FeatureArt feature={rest as Feature} seedName={slot} />;
    default:
      return <ItemArt name={rest} seedName={slot} />;
  }
}

/** The picture for a slot: the family's own if they have drawn one, ours if not. */
export default function Drawing({ slot, fit = "fit" }: { slot: string; fit?: "fit" | "slice" }) {
  return (
    <Art slot={slot} fit={fit}>
      <Generated slot={slot} />
    </Art>
  );
}
