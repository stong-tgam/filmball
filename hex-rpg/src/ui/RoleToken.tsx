/**
 * A player's piece, off the board and at any size.
 *
 * There is no drawn portrait for a role — the artwork is monsters, gear and terrain —
 * so a player's token *is* the coloured disc with their initial that `TokenLayer` puts
 * on the board. Showing the same disc on the role picker is the point: the first thing
 * a child learns is "I am the pink one", and the piece they choose from should be the
 * piece they then look for.
 *
 * Colour and ink both come from `src/palette.ts`, which is what stops this and the
 * board drifting apart.
 */

import { ROLES } from "../game/players";
import { inkOn } from "../palette";
import type { Role } from "../game/types";

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
  return (
    <svg
      className="role-token"
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label={ROLES[role].name}
    >
      <circle cx="50" cy="50" r="44" fill={colour} stroke="#141a1f" strokeWidth="8" />
      <text
        x="50"
        y="50"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize="52"
        fontWeight="700"
        fontFamily="system-ui, sans-serif"
        fill={inkOn(role)}
      >
        {ROLES[role].name[0]}
      </text>
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
