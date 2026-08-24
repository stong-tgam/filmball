/**
 * The whole of what a player sees: a compass, and what they can feel from it.
 *
 * No map, no grid, no position. Six spokes for the six ways you can walk, arrows for
 * everything within two moves, and the ground under your own feet named in the middle.
 * Where any of it *is* is not on screen and never will be - four people comparing
 * bearings in their notebooks is the game.
 *
 * Kept flat 2D on purpose after the 3D experiment: the information here is a set of
 * directions and distances, and a diagram says that in one glance where a first-person
 * view made you turn around to find it.
 */

import { DIRS, add, key } from "../game/hex";
import { compassName, type Sensed } from "../game/sense";
import { ROLES } from "../game/players";
import type { Player, Tile } from "../game/types";

const R = 116;
const HUB = 34;

/** Bearing of each of the six walkable directions, in the same frame as `sense`. */
const SPOKE_BEARING = [90, 30, 330, 270, 210, 150];

const point = (bearing: number, radius: number) => {
  const rad = ((bearing - 90) * Math.PI) / 180;
  return { x: Math.cos(rad) * radius, y: Math.sin(rad) * radius };
};

const TONE: Record<Sensed["kind"], string> = {
  dragon: "#e2574c",
  monster: "#d98324",
  hazard: "#f2b705",
  player: "#57b7e8",
};

export default function Compass({
  viewer,
  here,
  sensed,
  legalMoves,
  onMove,
}: {
  viewer: Player;
  /** The tile underfoot - the one thing you can always examine. */
  here: Tile;
  sensed: Sensed[];
  legalMoves: Map<string, number>;
  onMove: (label: string) => void;
}) {
  const steps = DIRS.map((dir, i) => {
    const label = key(add(viewer.hex, dir));
    return { label, bearing: SPOKE_BEARING[i], legal: legalMoves.has(label) };
  });

  return (
    <div className="compass" style={{ ["--who" as string]: ROLES[viewer.role].colour }}>
      <svg
        className="compass-rose"
        viewBox="-150 -150 300 300"
        role="group"
        aria-label="Which way you can walk, and what you can feel nearby"
      >
        <circle className="rose-ring" r={R} />
        <circle className="rose-ring rose-ring-inner" r={R * 0.55} />
        <text className="rose-north" x="0" y={-R - 12} textAnchor="middle">
          N
        </text>

        {/* The six ways out. A spoke you cannot take is drawn but dead. */}
        {steps.map(({ label, bearing, legal }) => {
          const outer = point(bearing, R - 6);
          const inner = point(bearing, HUB + 6);
          return (
            <g
              key={label}
              className={`rose-step${legal ? " is-legal" : ""}`}
              onClick={() => legal && onMove(label)}
              role={legal ? "button" : undefined}
              aria-label={legal ? `Walk ${compassName(bearing)}` : undefined}
            >
              <line x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y} />
              <circle cx={outer.x} cy={outer.y} r={legal ? 15 : 7} />
              {legal && (
                <text x={outer.x} y={outer.y + 5} textAnchor="middle">
                  ›
                </text>
              )}
            </g>
          );
        })}

        {/*
          Everything within two moves. Placed at the bearing it actually lies on rather
          than snapped to a spoke: at two tiles out a thing can sit between two
          directions, and rounding it would send the party the wrong way.
        */}
        {sensed.map((thing) => {
          const at = point(thing.bearing, thing.steps === 1 ? R * 0.55 : R * 0.86);
          return (
            <g key={thing.id} className={`rose-blip rose-blip-${thing.kind}`}>
              <title>{`${thing.name}, ${thing.steps} away, ${compassName(thing.bearing)}`}</title>
              <circle cx={at.x} cy={at.y} r="9" fill={TONE[thing.kind]} />
              <text x={at.x} y={at.y + 4} textAnchor="middle">
                {thing.steps}
              </text>
            </g>
          );
        })}

        {/* Underfoot. */}
        <circle className="rose-hub" r={HUB} style={{ fill: ROLES[viewer.role].colour }} />
        <text className="rose-hub-label" x="0" y="-2" textAnchor="middle">
          {here.base}
        </text>
        <text className="rose-hub-sub" x="0" y="12" textAnchor="middle">
          {here.river ? "river" : here.rail ? "railway" : "underfoot"}
        </text>
      </svg>

      <ul className="compass-read">
        {sensed.length === 0 ? (
          <li className="muted">Nothing within two moves. Wherever this is, it is quiet.</li>
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
