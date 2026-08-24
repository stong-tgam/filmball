/**
 * What the active player can do right now.
 *
 * v0.2 has one action: end the turn. Searching, trading, fighting and healing arrive
 * with the phases that own them. Ending a turn asks first - on a tablet being passed
 * around, an accidental tap should not cost somebody their go.
 */

import { useState } from "react";

type Props = {
  canMove: boolean;
  moved: boolean;
  onEndTurn: () => void;
  disabled: boolean;
};

export default function ActionBar({ canMove, moved, onEndTurn, disabled }: Props) {
  const [confirming, setConfirming] = useState(false);

  if (disabled) return null;

  if (confirming) {
    return (
      <div className="actionbar">
        <p className="actionbar-ask">
          {moved ? "End the turn?" : "End the turn without moving?"}
        </p>
        <div className="actionbar-buttons">
          <button
            type="button"
            className="ghost"
            onClick={() => setConfirming(false)}
          >
            Not yet
          </button>
          <button
            type="button"
            onClick={() => {
              setConfirming(false);
              onEndTurn();
            }}
          >
            Yes, end turn
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="actionbar">
      <p className="actionbar-ask">
        {moved ? "Move used." : canMove ? "Choose a tile to move to." : "Nowhere to go."}
      </p>
      <div className="actionbar-buttons">
        <button type="button" onClick={() => setConfirming(true)}>
          End turn
        </button>
      </div>
    </div>
  );
}
