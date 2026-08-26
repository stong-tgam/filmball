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

import { useId } from "react";
import Tile from "./Tile";
import Drawing from "./art/Drawing";
import RoleArt from "./art/roles";
import Art from "./art/Art";
import { roleSlot } from "../artslots";
import { DIRS, add, allNeighbours, distance, hexPoints, hexToPixel, inBoard, key } from "../game/hex";
import { compassName, type Sensed } from "../game/sense";
import { sightOf, visibleFrom } from "../game/vision";
import { hasFindings, searchKind } from "../game/actions";
import { isDestroyed } from "../game/hazards";
import { doomed, hasFallen } from "../game/collapse";
import { ROLES } from "../game/players";
import type { Player, Tile as TileData } from "../game/types";

const SIZE = 46;
/** Centre-to-centre distance between neighbours, which is where a one-move blip sits. */
const STEP = Math.sqrt(3) * SIZE;

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
  turnLimit,
  sensed,
  legalMoves,
  onMove,
}: {
  viewer: Player;
  tiles: Record<string, TileData>;
  turn: number;
  /** Needed for the collapse clock: which ring goes, and when. See `collapse.ts`. */
  turnLimit: number;
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
            // Ground that has already fallen in reads the same way and says so - it
            // was there last turn, and a child needs to see that it is not any more.
            const abyss = tile !== undefined && hasFallen(hex, turn, turnLimit);
            if (!tile || abyss) {
              return (
                <g
                  key={label}
                  className={`rose-edge${abyss ? " rose-abyss" : ""}`}
                  transform={`translate(${at.x} ${at.y})`}
                >
                  <polygon points={hexPoints(SIZE)} />
                  <text y="5" textAnchor="middle">
                    {abyss ? "gone" : "edge"}
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
                doomed={doomed(hex, turn, turnLimit)}
                findings={hasFindings(tile) ? searchKind(tile) : null}
                showLabel={false}
                onSelect={(l) => legalMoves.has(l) && onMove(l)}
              />
            );
          })}
        </g>

        {/* You. Not a position on a map - just a marker for which hex is underfoot, and
            the same drawing that is on your piece and in the party list. */}
        <g className="rose-you">
          <circle r={YOU} style={{ fill: ROLES[viewer.role].colour }} />
          <Cropped r={YOU}>
            <Art slot={roleSlot(viewer.role)} fit="slice">
              <RoleArt role={viewer.role} />
            </Art>
          </Cropped>
          <circle r={YOU} fill="none" className="rose-you-rim" />
        </g>

        {/*
          Bearings. A one-move blip lands exactly on the tile it is standing on, because
          the six neighbours sit at exactly those bearings and that distance. A two-move
          one is placed on its true bearing further out, which may be past the drawn
          ground - that is the point of it.
        */}
        {sensed.map((thing) => {
          const at = point(thing.bearing, STEP * thing.steps);
          return <Blip key={thing.id} thing={thing} at={at} />;
        })}
      </svg>

      <ul className="compass-read">
        <li className="compass-here">
          <Swatch slot={roleSlot(viewer.role)} colour={ROLES[viewer.role].colour} />
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
        {doomed(viewer.hex, turn, turnLimit) && (
          <li className="compass-doom">
            <span className="blip-dot blip-doom" />
            <strong>This ground goes when the turn ends.</strong> Step inwards.
          </li>
        )}
        {sensed.length === 0 ? (
          <li className="muted">Nothing else within two moves. Wherever this is, it is quiet.</li>
        ) : (
          sensed.map((thing) => (
            <li key={thing.id}>
              <Swatch slot={thing.art} colour={thing.colour} />
              <strong>{thing.name}</strong> — {thing.steps === 1 ? "one move" : "two moves"}{" "}
              {compassName(thing.bearing)}
            </li>
          ))
        )}
      </ul>
    </div>
  );
}

/** Half the width of the marker for the player themselves. */
const YOU = 13;

/** Clip whatever is inside to a disc, and scale the 0-100 drawing box onto it. */
function Cropped({ r, children }: { r: number; children: React.ReactNode }) {
  const clip = useId();
  return (
    <>
      <defs>
        <clipPath id={clip}>
          <circle r={r} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clip})`}>
        <g transform={`translate(${-r} ${-r}) scale(${(r * 2) / 100})`}>{children}</g>
      </g>
    </>
  );
}

/**
 * One thing you can feel, on the bearing it is on.
 *
 * A coloured dot with a number was the whole blip until v0.29, which asked a child to
 * hold "purple means the pirates" in their head while working out which way to walk.
 * The picture is on it now and the colour stays behind it - colour is still how a
 * seven-year-old finds a thing at a glance, and the drawing is how they know what it
 * is. The number of moves stays, in its own bubble so nothing swallows it.
 */
function Blip({
  thing,
  at,
}: {
  thing: Sensed;
  at: { x: number; y: number };
}) {
  const r = 15;
  return (
    <g className={`rose-blip rose-blip-${thing.kind}`} transform={`translate(${at.x} ${at.y})`}>
      <title>{`${thing.name}, ${thing.steps} away, ${compassName(thing.bearing)}`}</title>
      <circle r={r} fill={thing.colour} />
      <Cropped r={r}>
        <Drawing slot={thing.art} fit="slice" />
      </Cropped>
      <circle r={r} fill="none" className="blip-rim" />
      <circle cx={r * 0.72} cy={r * 0.72} r={r * 0.5} className="blip-steps-disc" />
      <text x={r * 0.72} y={r * 0.72 + r * 0.19} textAnchor="middle" className="blip-steps">
        {thing.steps}
      </text>
    </g>
  );
}

/** The picture beside a line of the read-out, where a plain colour swatch used to be. */
function Swatch({ slot, colour }: { slot: string; colour: string }) {
  return (
    <svg className="blip-dot blip-drawn" viewBox="0 0 100 100" style={{ background: colour }}>
      <Drawing slot={slot} fit="slice" />
    </svg>
  );
}
