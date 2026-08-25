/**
 * The whole of what a player sees: the ground around them, and bearings to the rest.
 *
 * There is no board and no position. What there *is* is the tile underfoot and the
 * tiles they could step onto, drawn properly - you have to be able to see that the next
 * hex is a river before you decide to walk into it. Around and beyond that, anything
 * within two moves shows as a blip on the bearing it actually lies on.
 *
 * The distinction that matters: **this shows what is adjacent, never where any of it
 * is.** No labels on the hexes, no grid, no coordinates. Two players can both be
 * looking at a forest with a river to the north-east and be nowhere near each other,
 * and working out whether they are is the game.
 *
 * How much ground is drawn comes from `sightOf`, so the Scout's extra ring shows up
 * here as two rings of real tiles rather than one - which is also what makes their
 * two-tile move legal to take.
 */

import Tile from "./Tile";
import { DIRS, add, allNeighbours, distance, hexPoints, hexToPixel, inBoard, key } from "../game/hex";
import { compassName, type Sensed } from "../game/sense";
import { sightOf, visibleFrom } from "../game/vision";
import { hasFindings, searchKind } from "../game/actions";
import { isDestroyed } from "../game/hazards";
import { ROLES } from "../game/players";
import type { Player, Tile as TileData } from "../game/types";

const SIZE = 46;
/** Centre-to-centre distance between neighbours, which is where a one-move blip sits. */
const STEP = Math.sqrt(3) * SIZE;

const TONE: Record<Sensed["kind"], string> = {
  dragon: "#e2574c",
  monster: "#d98324",
  hazard: "#f2b705",
  player: "#57b7e8",
};

const point = (bearing: number, radius: number) => {
  const rad = ((bearing - 90) * Math.PI) / 180;
  return { x: Math.cos(rad) * radius, y: Math.sin(rad) * radius };
};

/** Which way the railway runs on, so a line does not stop dead at the tile edge. */
function railConnections(tiles: Record<string, TileData>, tile: TileData): number[] {
  return DIRS.flatMap((dir, i) => {
    const n = add(tile.hex, dir);
    return inBoard(n) && tiles[key(n)]?.rail ? [i] : [];
  });
}

export default function Compass({
  viewer,
  tiles,
  turn,
  sensed,
  legalMoves,
  onMove,
}: {
  viewer: Player;
  tiles: Record<string, TileData>;
  turn: number;
  sensed: Sensed[];
  legalMoves: Map<string, number>;
  onMove: (label: string) => void;
}) {
  const origin = hexToPixel(viewer.hex, SIZE);
  const here = tiles[key(viewer.hex)];
  const underfoot = here && hasFindings(here) ? searchKind(here) : null;
  const ground = visibleFrom(viewer);
  // `visibleFrom` walks the board, so it stops at the rim and the world just ends.
  // Draw the hexes past the rim as holes: a child needs to see that there is nothing
  // that way, not an absence of drawing.
  const brink = ground
    .flatMap(allNeighbours)
    .filter((h) => !inBoard(h) && distance(viewer.hex, h) <= sightOf(viewer));
  const seen = new Set(ground.map(key));
  const around = [
    ...ground,
    ...brink.filter((h) => !seen.has(key(h)) && (seen.add(key(h)), true)),
  ];
  // Fit the drawing to what is actually on it: the furthest hex drawn, the furthest
  // blip, and a hex of margin. Guessing from the ring count left it lost in the corner.
  const furthest = Math.max(
    ...around.map((h) => {
      const p = hexToPixel(h, SIZE);
      return Math.hypot(p.x - origin.x, p.y - origin.y);
    }),
    ...sensed.map((thing) => STEP * thing.steps),
    STEP,
  );
  const span = furthest + SIZE * 1.5;

  return (
    <div className="compass" style={{ ["--who" as string]: ROLES[viewer.role].colour }}>
      <svg
        className="compass-rose"
        viewBox={`${-span} ${-span} ${span * 2} ${span * 2}`}
        role="group"
        aria-label="The ground around you, and what you can feel nearby"
      >
        <text className="rose-north" x="0" y={-span + 22} textAnchor="middle">
          N
        </text>

        <g transform={`translate(${-origin.x} ${-origin.y})`}>
          {around.map((hex) => {
            const label = key(hex);
            const tile = tiles[label];
            const at = hexToPixel(hex, SIZE);

            // Off the board: the edge of the world, drawn as a hole rather than left
            // blank, or players cannot tell "nothing there" from "not drawn yet".
            if (!tile) {
              return (
                <g key={label} className="rose-edge" transform={`translate(${at.x} ${at.y})`}>
                  <polygon points={hexPoints(SIZE)} />
                  <text y="5" textAnchor="middle">
                    edge
                  </text>
                </g>
              );
            }

            const mine = label === key(viewer.hex);
            return (
              <Tile
                key={label}
                tile={tile}
                label={label}
                size={SIZE}
                railDirs={tile.rail ? railConnections(tiles, tile) : []}
                selected={mine}
                legal={legalMoves.has(label)}
                wrecked={isDestroyed(tile, turn)}
                findings={hasFindings(tile) ? searchKind(tile) : null}
                showLabel={false}
                onSelect={(l) => legalMoves.has(l) && onMove(l)}
              />
            );
          })}
        </g>

        {/* You. Not a position on a map - just a marker for which hex is underfoot. */}
        <circle className="rose-you" r="11" style={{ fill: ROLES[viewer.role].colour }} />

        {/*
          Bearings. A one-move blip lands exactly on the tile it is standing on, because
          the six neighbours sit at exactly those bearings and that distance. A two-move
          one is placed on its true bearing further out, which may be past the drawn
          ground - that is the point of it.
        */}
        {sensed.map((thing) => {
          const at = point(thing.bearing, STEP * thing.steps);
          return (
            <g key={thing.id} className={`rose-blip rose-blip-${thing.kind}`}>
              <title>{`${thing.name}, ${thing.steps} away, ${compassName(thing.bearing)}`}</title>
              <circle cx={at.x} cy={at.y} r="13" fill={TONE[thing.kind]} />
              <text x={at.x} y={at.y + 5} textAnchor="middle">
                {thing.steps}
              </text>
            </g>
          );
        })}
      </svg>

      <ul className="compass-read">
        <li className="compass-here">
          <span className="blip-dot" style={{ background: ROLES[viewer.role].colour }} />
          <strong>Underfoot:</strong> {tiles[key(viewer.hex)]?.base}
          {tiles[key(viewer.hex)]?.river ? ", on the river" : ""}
          {tiles[key(viewer.hex)]?.rail ? ", by the railway" : ""}
        </li>
        {/* Its own line rather than a tail on the one above, which capitalises every
            word it is given and turned a sentence into a shop sign. */}
        {underfoot && (
          <li className="compass-findings">
            <span className="blip-dot" style={{ background: "var(--accent)" }} />
            {underfoot === "chest"
              ? "There is a chest in the water here."
              : "Nobody has searched this ground."}
          </li>
        )}
        {sensed.length === 0 ? (
          <li className="muted">Nothing else within two moves. Wherever this is, it is quiet.</li>
        ) : (
          sensed.map((thing) => (
            <li key={thing.id}>
              <span className="blip-dot" style={{ background: TONE[thing.kind] }} />
              <strong>{thing.name}</strong> — {thing.steps === 1 ? "one move" : "two moves"}{" "}
              {compassName(thing.bearing)}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}
