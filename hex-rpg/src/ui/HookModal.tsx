/**
 * Casting the line at a friend.
 *
 * Two ways round, and they are genuinely different because the hook may land two
 * players on one tile where walking may not: reel them over to you, or haul yourself
 * across to them. Which you want depends on who is standing somewhere useful, and
 * that is a conversation at the table rather than a calculation - so both are offered
 * plainly, side by side, with no recommended one.
 *
 * A fallen friend is listed too, and dragging one to the doctor is the best thing the
 * hook does. Their row says so rather than leaving a child to work it out.
 */

import { ROLES } from "../game/players";
import type { Player } from "../game/types";

export default function HookModal({
  targets,
  onCast,
  onClose,
}: {
  targets: Player[];
  onCast: (targetId: string, how: "pull" | "cross") => void;
  onClose: () => void;
}) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Cast the line at a friend">
      <div className="modal modal-narrow hook">
        <p className="draw-turn">One tile of rope</p>
        <h2 className="hook-title">Who are you casting at?</h2>

        <ul className="hook-list">
          {targets.map((who) => (
            <li key={who.id} className="hook-who">
              <span className="hook-name">
                <span className="blip-dot" style={{ background: ROLES[who.role].colour }} />
                <strong>{who.name}</strong>
                {who.dead && <em className="hook-down"> — down. Bring them to the Doctor.</em>}
              </span>
              <span className="hook-ways">
                <button type="button" className="ghost" onClick={() => onCast(who.id, "pull")}>
                  Reel them in
                </button>
                <button type="button" className="ghost" onClick={() => onCast(who.id, "cross")}>
                  Haul yourself over
                </button>
              </span>
            </li>
          ))}
        </ul>

        <button type="button" onClick={onClose}>
          Put the rod down
        </button>
      </div>
    </div>
  );
}
