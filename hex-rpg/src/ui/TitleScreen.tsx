/**
 * Who is playing, and are we carrying on from last time.
 *
 * The first thing anybody sees, and the audience is a table of children deciding who
 * gets to be the knight — so the roles are the screen, not a dropdown on it. Each one
 * shows its colour and the one line that says what it does, because "the pink one who
 * takes an extra hit" is how a seven-year-old picks.
 *
 * Turn order is the order they are tapped. That is worth knowing at the table and it
 * is why the chosen list is numbered: going first is a real advantage on a board where
 * the good ground is found rather than seen.
 */

import { useState } from "react";
import { MAX_PARTY, MIN_PARTY, ROLES, TURN_ORDER } from "../game/players";
import { howLongAgo } from "../game/save";
import { allHexes } from "../game/hex";
import { DEFAULT_TURN_LIMIT } from "../game/setup";
import RoleToken from "./RoleToken";
import CrayonDefs from "./art/CrayonDefs";
import type { Role } from "../game/types";

export default function TitleScreen({
  saved,
  onResume,
  onStart,
  onArtRoom,
}: {
  /** When the game on the shelf was put down, or null if there is not one. */
  saved: number | null;
  onResume: () => void;
  onStart: (roster: Role[]) => void;
  /** The way in to replacing the game's pictures with the children's own. */
  onArtRoom: () => void;
}) {
  const [picked, setPicked] = useState<Role[]>([]);

  const toggle = (role: Role) =>
    setPicked((party) =>
      party.includes(role)
        ? party.filter((r) => r !== role)
        : party.length >= MAX_PARTY
          ? party
          : [...party, role],
    );

  const enough = picked.length >= MIN_PARTY;

  return (
    <div className="title">
      {/* The wobble filters the drawings point into. App mounts these too, but the
          title screen returns before it gets there — and an SVG element referencing a
          filter that does not exist is not drawn at all, so the picker would be five
          bare discs. */}
      <CrayonDefs />
      <div className="title-card">
        <h1 className="title-name">Hex RPG</h1>
        <p className="title-blurb">
          {/* Counted and read off the board rather than written out: the last two
              numbers here went stale the moment the board shrank in v0.22. */}
          {allHexes().length} tiles nobody can see, one device passed round the table,
          and a dragon in the middle of it. Kill it before turn {DEFAULT_TURN_LIMIT}.
        </p>

        {saved !== null && (
          <div className="title-resume">
            <p>
              There is a game on the shelf from <strong>{howLongAgo(saved)}</strong>.
            </p>
            <button type="button" onClick={onResume}>
              Carry on with it
            </button>
            <p className="muted title-warn">
              Starting a new one below throws that game away.
            </p>
          </div>
        )}

        <h2 className="title-ask">Who is playing?</h2>
        <ul className="title-roles">
          {TURN_ORDER.map((role) => {
            const at = picked.indexOf(role);
            const chosen = at >= 0;
            const full = !chosen && picked.length >= MAX_PARTY;
            return (
              <li key={role}>
                <button
                  type="button"
                  className={`title-role${chosen ? " is-picked" : ""}`}
                  onClick={() => toggle(role)}
                  disabled={full}
                  aria-pressed={chosen}
                  style={{ ["--who" as string]: ROLES[role].colour }}
                >
                  <RoleToken role={role} size={46} order={chosen ? at + 1 : undefined} />
                  <span className="title-role-text">
                    <strong>{ROLES[role].name}</strong>
                    <em>{ROLES[role].blurb}</em>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>

        <p className="title-count">
          {picked.length === 0
            ? `Tap ${MIN_PARTY} to ${MAX_PARTY} of them.`
            : `${picked.length} player${picked.length === 1 ? "" : "s"}${
                enough ? ", in that order" : ` — one more at least`
              }.`}
        </p>

        <button type="button" className="title-go" disabled={!enough} onClick={() => onStart(picked)}>
          {enough ? "Start the game" : `Pick ${MIN_PARTY - picked.length} more`}
        </button>

        {/* Not part of picking a party, so it is quiet and underneath - but it is on
            the first screen, because a drawing is something you do before a game
            rather than in the middle of one. */}
        <button type="button" className="title-art" onClick={onArtRoom}>
          Our drawings — use your own pictures
        </button>
      </div>
    </div>
  );
}
