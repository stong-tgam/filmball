/**
 * Player tokens.
 *
 * A disc of the role's colour with **the role's drawing inside it**, plus a heavy dark
 * rim so it reads against every terrain on the board. The active player's token
 * pulses - with one device going round the table, whose piece is live has to be obvious
 * from across the room.
 *
 * It was an initial in a circle until v0.29, which meant two things: the piece looked
 * nothing like the picture of that character anywhere else in the game, and a family who
 * had drawn their own knight (`ArtRoom`) never saw it on the board. `<Art>` is what
 * makes the upload win here too.
 */

import { useId } from "react";
import Art from "./art/Art";
import RoleArt, { roleSlot } from "./art/roles";
import { hexToPixel, type Hex } from "../game/hex";
import { ROLES } from "../game/players";
import type { Player } from "../game/types";

type Props = {
  players: Player[];
  activeId: string;
  size: number;
};

/** Tokens fan out around the centre when more than one shares a tile. */
function offsets(count: number, size: number): { x: number; y: number }[] {
  if (count === 1) return [{ x: 0, y: 0 }];
  const radius = size * 0.3;
  return Array.from({ length: count }, (_, i) => {
    const angle = (Math.PI * 2 * i) / count - Math.PI / 2;
    return { x: radius * Math.cos(angle), y: radius * Math.sin(angle) };
  });
}

export default function TokenLayer({ players, activeId, size }: Props) {
  const alive = players.filter((p) => !p.dead);
  const byTile = new Map<string, Player[]>();
  for (const p of alive) {
    const k = `${p.hex.q},${p.hex.r}`;
    byTile.set(k, [...(byTile.get(k) ?? []), p]);
  }

  return (
    <g className="tokens">
      {[...byTile.values()].flatMap((group) => {
        const spread = offsets(group.length, size);
        return group.map((player, i) => (
          <Token
            key={player.id}
            player={player}
            hex={player.hex}
            size={size}
            nudge={spread[i]}
            active={player.id === activeId}
          />
        ));
      })}
    </g>
  );
}

function Token({
  player,
  hex,
  size,
  nudge,
  active,
}: {
  player: Player;
  hex: Hex;
  size: number;
  nudge: { x: number; y: number };
  active: boolean;
}) {
  const centre = hexToPixel(hex, size);
  const r = size * 0.29;
  const colour = ROLES[player.role].colour;
  const clip = useId();

  return (
    <g
      className={`token${active ? " is-active" : ""}`}
      transform={`translate(${(centre.x + nudge.x).toFixed(2)} ${(centre.y + nudge.y).toFixed(2)})`}
    >
      <defs>
        <clipPath id={clip}>
          <circle r={r} />
        </clipPath>
      </defs>
      {active && <circle className="token-halo" r={r * 1.55} fill="none" stroke={colour} />}
      {/* The role's colour stays behind the drawing rather than being replaced by it:
          a child finds their piece by colour before they read the picture. */}
      <circle r={r} fill={colour} stroke="#141a1f" strokeWidth={size * 0.06} />
      <g clipPath={`url(#${clip})`}>
        <g transform={`translate(${-r} ${-r}) scale(${(r * 2) / 100})`}>
          <Art slot={roleSlot(player.role)} fit="slice">
            <RoleArt role={player.role} />
          </Art>
        </g>
      </g>
      <circle r={r} fill="none" stroke="#141a1f" strokeWidth={size * 0.06} />
    </g>
  );
}
