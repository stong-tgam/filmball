/**
 * A tile nobody is looking at.
 *
 * Blank paper with a soft edge - the hex is there, so the board keeps its shape and a
 * child can still see how far there is to go, but nothing on it is drawn. There is no
 * label either: not knowing which tile is which is the puzzle the party solves out
 * loud, and printing "F6" on an unseen hex would hand them the answer.
 */

import { hexPoints, hexToPixel } from "../game/hex";
import type { Tile as TileData } from "../game/types";

export default function FogTile({
  tile,
  size,
  legal,
  selected,
  label,
  onSelect,
}: {
  tile: TileData;
  size: number;
  legal: boolean;
  selected: boolean;
  label: string;
  onSelect: (label: string | null) => void;
}) {
  const p = hexToPixel(tile.hex, size);
  return (
    <g
      className={`tile tile-fog${legal ? " is-legal" : ""}${selected ? " is-selected" : ""}`}
      transform={`translate(${p.x} ${p.y})`}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(legal ? label : null);
      }}
      role={legal ? "button" : undefined}
      aria-label={legal ? "Unexplored tile, one step away" : "Unexplored"}
    >
      <polygon className="tile-fog-face" points={hexPoints(size)} />
      {legal && <polygon className="tile-fog-legal" points={hexPoints(size * 0.86)} />}
    </g>
  );
}
