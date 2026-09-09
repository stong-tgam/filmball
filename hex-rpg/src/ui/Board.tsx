/**
 * The SVG map: 37 tiles, one <g> each, laid out pointy-top.
 *
 * The whole board is one SVG with a computed viewBox, so it scales to the window
 * without any pixel maths in CSS - important on a tablet, which is where this gets
 * played. **This is the only view of the game since v0.32** - there is no fog and no
 * separate "your ground" screen any more; the whole board, every monster on it, is on
 * screen from turn one. See `CLAUDE.md`'s "The map is not hidden any more" for why:
 * the table asked to see the monsters and choose their own fights, and a puzzle you
 * eliminate your way through needs the whole board eliminable, not just the ground
 * somebody happens to have walked.
 */

import { useMemo } from "react";
import Tile from "./Tile";
import TokenLayer from "./TokenLayer";
import EnemyLayer from "./EnemyLayer";
import HazardLayer from "./HazardLayer";
import { DIRS, add, hexPoints, hexToPixel, inBoard, key } from "../game/hex";
import { hasFindings, searchKind } from "../game/actions";
import { isDestroyed } from "../game/hazards";
import { doomed, hasFallen } from "../game/collapse";
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
  /** With the turn, which rings of the board have fallen in. See `collapse.ts`. */
  turnLimit: number;
  /** The team whose go it is: every one of their tokens pulses. */
  activeIds: string[];
  /** The active player's colour: legal moves are drawn in it. */
  activeColour: string;
  /** Tap marks the table has made against the map's secret - "x" ruled out, "?" a
   *  maybe. Shared across the party, not per player: they are one table. */
  secretMarks: Record<string, "x" | "?">;
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
  turnLimit,
  activeIds,
  activeColour,
  secretMarks,
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
      aria-label="Game board, 37 hex tiles"
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

      {entries.map(([label, tile]) =>
        // Gone into the abyss: drawn as nothing at all, which is what it is now.
        hasFallen(tile.hex, turn, turnLimit) ? null : (
          <Tile
            key={label}
            label={label}
            tile={tile}
            size={SIZE}
            railDirs={rails[label]}
            selected={selected === label}
            legal={legalMoves.has(label)}
            wrecked={isDestroyed(tile, turn)}
            doomed={doomed(tile.hex, turn, turnLimit)}
            findings={hasFindings(tile) ? searchKind(tile) : null}
            onSelect={onSelect}
          />
        ),
      )}

      {/* The secret's marks: the table's own notes, crossing off what cannot be it. */}
      <g className="secret-marks">
        {Object.entries(secretMarks).map(([label, mark]) => {
          const hex = tiles[label]?.hex;
          if (!hex || hasFallen(hex, turn, turnLimit)) return null;
          const { x, y } = hexToPixel(hex, SIZE);
          return mark === "x" ? (
            <g key={label} transform={`translate(${x} ${y})`} className="secret-mark secret-mark-x">
              <line x1={-16} y1={-16} x2={16} y2={16} />
              <line x1={16} y1={-16} x2={-16} y2={16} />
            </g>
          ) : (
            <text key={label} x={x} y={y + 9} textAnchor="middle" className="secret-mark secret-mark-maybe">
              ?
            </text>
          );
        })}
      </g>

      <EnemyLayer
        enemies={enemies}
        size={SIZE}
        purses={Object.fromEntries(hazards.map((h) => [h.kind, h.carrying]))}
      />
      <HazardLayer hazards={hazards} size={SIZE} />
      <TokenLayer players={players} activeIds={activeIds} size={SIZE} />
    </svg>
  );
}
