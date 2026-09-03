/**
 * A player's piece: their drawing, on a disc of their colour.
 *
 * The colour is the identity — "I am the pink one" is how a seven-year-old refers to
 * the knight for the first hour — so it is the background, and the character sits on
 * top of it. Both come from `src/palette.ts` by way of `ROLES`, which is what keeps
 * this and the board token the same colour without anybody checking.
 *
 * Any of the five can be replaced by a photograph of a real drawing: the slot name is
 * `role:<name>` and the machinery is `art/overrides.ts`, the same path the monsters
 * and the gear already use.
 */

import { useSyncExternalStore } from "react";
import RoleArt, { roleSlot } from "./art/roles";
import { ROLES } from "../game/players";
import { overrideFor, subscribe } from "./art/overrides";
import type { Role } from "../game/types";

const useOverride = (slot: string): string | undefined =>
  useSyncExternalStore(
    subscribe,
    () => overrideFor(slot),
    () => undefined,
  );

export default function RoleToken({
  role,
  size = 44,
  /** Turn-order position, shown as a corner badge once they have been picked. */
  order,
}: {
  role: Role;
  size?: number;
  order?: number;
}) {
  const colour = ROLES[role].colour;
  const drawing = useOverride(roleSlot(role));
  const clip = `role-clip-${role}`;

  return (
    <svg
      className="role-token"
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label={ROLES[role].name}
    >
      <defs>
        <clipPath id={clip}>
          <circle cx="50" cy="50" r="44" />
        </clipPath>
      </defs>

      <circle cx="50" cy="50" r="44" fill={colour} stroke="#141a1f" strokeWidth="7" />

      {drawing ? (
        <image
          href={drawing}
          x="6"
          y="6"
          width="88"
          height="88"
          clipPath={`url(#${clip})`}
          preserveAspectRatio="xMidYMid slice"
        />
      ) : (
        // Nudged up and in a touch: the drawings are built full-bleed on a square
        // canvas, and a disc crops the corners off feet and elbows otherwise.
        <g clipPath={`url(#${clip})`} transform="translate(50 52) scale(0.88) translate(-50 -50)">
          <RoleArt role={role} />
        </g>
      )}

      {order !== undefined && (
        <g>
          <circle cx="82" cy="18" r="20" fill="#141a1f" stroke={colour} strokeWidth="6" />
          <text
            x="82"
            y="18"
            textAnchor="middle"
            dominantBaseline="central"
            fontSize="26"
            fontWeight="700"
            fontFamily="system-ui, sans-serif"
            fill="#ffffff"
          >
            {order}
          </text>
        </g>
      )}
    </svg>
  );
}
