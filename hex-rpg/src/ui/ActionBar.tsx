/**
 * What the active player can do right now: one action, then end the turn.
 *
 * Only what is actually available is shown. An empty row of greyed-out buttons makes
 * a child ask an adult what they are for; a row with one live button does not.
 * Ending a turn asks first - on a tablet being passed around, an accidental tap
 * should not cost somebody their go.
 */

import { useState } from "react";

type Props = {
  canMove: boolean;
  moved: boolean;
  acted: boolean;
  canSearch: boolean;
  canTrade: boolean;
  onSearch: () => void;
  onTrade: () => void;
  onEndTurn: () => void;
  disabled: boolean;
};

export default function ActionBar({
  canMove,
  moved,
  acted,
  canSearch,
  canTrade,
  onSearch,
  onTrade,
  onEndTurn,
  disabled,
}: Props) {
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

  const prompt = canSearch
    ? "Search the ground here, or move on."
    : canTrade
      ? "There is a market here."
      : acted
        ? "Turn spent."
        : moved
          ? "Move used."
          : canMove
            ? "Choose a tile to move to."
            : "Nowhere to go.";

  return (
    <div className="actionbar">
      <p className="actionbar-ask">{prompt}</p>
      {(canSearch || canTrade) && (
        <div className="actionbar-buttons">
          {canSearch && (
            <button type="button" className="ghost" onClick={onSearch}>
              Search here
            </button>
          )}
          {canTrade && (
            <button type="button" className="ghost" onClick={onTrade}>
              Go shopping
            </button>
          )}
        </div>
      )}
      <div className="actionbar-buttons">
        <button type="button" onClick={() => setConfirming(true)}>
          End turn
        </button>
      </div>
    </div>
  );
}
