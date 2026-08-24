/**
 * The SVG map: 61 tiles, one <g> each, laid out pointy-top.
 *
 * The whole board is one SVG with a computed viewBox, so it scales to the window
 * without any pixel maths in CSS - important on a tablet, which is where this gets
 * played.
 */

import { useMemo } from "react";
import Tile from "./Tile";
import TokenLayer from "./TokenLayer";
import EnemyLayer from "./EnemyLayer";
import HazardLayer from "./HazardLayer";
import { DIRS, add, hexPoints, hexToPixel, inBoard, key } from "../game/hex";
import { isDestroyed } from "../game/hazards";
import type { Enemy, Hazard, Player, Tile as TileData } from "../game/types";

const SIZE = 40;
const PADDING = SIZE * 0.9;

type Props = {
  tiles: Record<string, TileData>;
  selected: string | null;
  /** Tile label to the number of steps it takes the active player to get there. */
  legalMoves: Map<string, number>;
  players: Player[];
  enemies: Enemy[];
  hazards: Hazard[];
  /** The turn number, which decides which wrecked tiles have recovered. */
  turn: number;
  activeId: string;
  /** The active player's colour: legal moves are drawn in it. */
  activeColour: string;
  onSelect: (label: string | null) => void;
};

/**
 * Which of the six directions the railway continues into.
 *
 * A line that ends on the rim of the board gets one extra spoke pointing off the
 * edge, so it looks like it carries on past the map rather than stopping dead.
 * (The river needs no equivalent: water is part of a tile's own composition, and
 * `Tile.sides` already says which sides it flows through.)
 */
function railConnections(tiles: Record<string, TileData>, tile: TileData): number[] {
  const dirs: number[] = [];
  DIRS.forEach((d, i) => {
    const n = add(tile.hex, d);
    if (inBoard(n) && tiles[key(n)]?.rail) dirs.push(i);
  });
  if (dirs.length === 1) {
    const outward = (dirs[0] + 3) % 6;
    if (!inBoard(add(tile.hex, DIRS[outward]))) dirs.push(outward);
  }
  return dirs;
}

export default function Board({
  tiles,
  selected,
  legalMoves,
  players,
  enemies,
  hazards,
  turn,
  activeId,
  activeColour,
  onSelect,
}: Props) {
  const entries = useMemo(() => Object.entries(tiles), [tiles]);

  const viewBox = useMemo(() => {
    const points = entries.map(([, t]) => hexToPixel(t.hex, SIZE));
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const minX = Math.min(...xs) - SIZE - PADDING;
    const minY = Math.min(...ys) - SIZE - PADDING;
    const width = Math.max(...xs) - Math.min(...xs) + 2 * (SIZE + PADDING);
    const height = Math.max(...ys) - Math.min(...ys) + 2 * (SIZE + PADDING);
    return `${minX} ${minY} ${width} ${height}`;
  }, [entries]);

  const rails = useMemo(
    () =>
      Object.fromEntries(
        entries.map(([label, tile]) => [label, tile.rail ? railConnections(tiles, tile) : []]),
      ),
    [entries, tiles],
  );

  return (
    <svg
      className="board"
      style={{ ["--who" as string]: activeColour }}
      viewBox={viewBox}
      xmlns="http://www.w3.org/2000/svg"
      role="group"
      aria-label="Game board, 61 hex tiles"
      onClick={(e) => {
        if (e.target === e.currentTarget) onSelect(null);
      }}
    >
      <defs>
        <filter id="board-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="3" stdDeviation="4" floodOpacity="0.35" />
        </filter>
      </defs>

      <g filter="url(#board-shadow)" className="board-base">
        {entries.map(([label, tile]) => {
          const p = hexToPixel(tile.hex, SIZE);
          return (
            <polygon
              key={label}
              points={hexPoints(SIZE)}
              transform={`translate(${p.x} ${p.y})`}
            />
          );
        })}
      </g>

      {entries.map(([label, tile]) => (
        <Tile
          key={label}
          label={label}
          tile={tile}
          size={SIZE}
          railDirs={rails[label]}
          selected={selected === label}
          legal={legalMoves.has(label)}
          wrecked={isDestroyed(tile, turn)}
          onSelect={onSelect}
        />
      ))}

      <EnemyLayer
        enemies={enemies}
        size={SIZE}
        purses={Object.fromEntries(hazards.map((h) => [h.kind, h.carrying]))}
      />
      <HazardLayer hazards={hazards} size={SIZE} />
      <TokenLayer players={players} activeId={activeId} size={SIZE} />
    </svg>
  );
}
