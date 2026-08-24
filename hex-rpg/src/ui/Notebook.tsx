/**
 * Each player's own map notes.
 *
 * The game deliberately remembers nothing about the board (`game/vision.ts`), so this
 * is where the map actually lives. Three things follow from that and are not
 * negotiable:
 *
 * - **It is always open, on anybody's turn.** A player who spots the river on someone
 *   else's turn has to be able to write it down before they forget.
 * - **One pad per player, not one for the party.** Four children typing into one box
 *   overwrite each other, and half the fun is that your map and mine disagree.
 * - **Nothing is filled in for them.** No auto-stamped coordinates, no "you are here"
 *   button. The moment the app writes the note, the table stops talking.
 */

import { useEffect, useRef, useState } from "react";
import { ROLES } from "../game/players";
import type { Player } from "../game/types";

export default function Notebook({
  players,
  activeId,
  onWrite,
}: {
  players: Player[];
  activeId: string;
  onWrite: (playerId: string, notes: string) => void;
}) {
  const [openId, setOpenId] = useState(activeId);
  const lastActive = useRef(activeId);

  // Follow the turn, but only when it actually changes: a player who has deliberately
  // opened somebody else's pad to read it out should not have it yanked away.
  useEffect(() => {
    if (lastActive.current !== activeId) {
      lastActive.current = activeId;
      setOpenId(activeId);
    }
  }, [activeId]);

  const open = players.find((p) => p.id === openId) ?? players.find((p) => p.id === activeId)!;

  return (
    <div className="notebook">
      <div className="notebook-tabs" role="tablist" aria-label="Whose notes">
        {players.map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={p.id === open.id}
            className={`notebook-tab${p.id === open.id ? " is-open" : ""}`}
            style={{ ["--who" as string]: ROLES[p.role].colour }}
            onClick={() => setOpenId(p.id)}
          >
            {p.name}
            {p.notes.trim() !== "" && <span className="notebook-dot" aria-hidden="true" />}
          </button>
        ))}
      </div>

      <textarea
        className="notebook-page"
        value={open.notes}
        spellCheck={false}
        placeholder={
          open.id === activeId
            ? "E4 river, trees to the north. Nothing at E5."
            : `${open.name}'s notes. Anybody can write, any time.`
        }
        aria-label={`${open.name}'s map notes`}
        onChange={(e) => onWrite(open.id, e.target.value)}
      />

      <p className="notebook-hint muted">
        Nobody's map is drawn for them. Say what you can see out loud — that is how the
        party works out where everyone is.
      </p>
    </div>
  );
}
