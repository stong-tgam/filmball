/**
 * Player tokens.
 *
 * A ring of the role's colour with its initial inside, plus a heavy dark rim so it
 * reads against every terrain on the board. The active player's token pulses - with
 * one device going round the table, whose piece is live has to be obvious from
 * across the room.
 */

import { hexToPixel, type Hex } from "../game/hex";
import { ROLES } from "../game/players";
import { inkOn } from "../palette";
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

  return (
    <g
      className={`token${active ? " is-active" : ""}`}
      transform={`translate(${(centre.x + nudge.x).toFixed(2)} ${(centre.y + nudge.y).toFixed(2)})`}
    >
      {active && <circle className="token-halo" r={r * 1.55} fill="none" stroke={colour} />}
      <circle r={r} fill={colour} stroke="#141a1f" strokeWidth={size * 0.06} />
      <text
        className="token-initial"
        y={r * 0.36}
        textAnchor="middle"
        fontSize={r * 1.05}
        fill={inkOn(player.role)}
      >
        {player.name[0]}
      </text>
    </g>
  );
}
