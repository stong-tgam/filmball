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
  canDonate: boolean;
  canHeal: boolean;
  canPayOff: boolean;
  onSearch: () => void;
  onTrade: () => void;
  onDonate: () => void;
  onHeal: () => void;
  onPayOff: () => void;
  onEndTurn: () => void;
  disabled: boolean;
};

export default function ActionBar({
  canMove,
  moved,
  acted,
  canSearch,
  canTrade,
  canDonate,
  canHeal,
  canPayOff,
  onSearch,
  onTrade,
  onDonate,
  onHeal,
  onPayOff,
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

  const prompt = canPayOff
    ? "A thief is blocking the way. Fight, or hand it all over."
    : canDonate
    ? "Someone here could use a hand."
    : canSearch
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
      {(canSearch || canTrade || canDonate || canHeal || canPayOff) && (
        <div className="actionbar-buttons">
          {canPayOff && (
            <button type="button" className="ghost" onClick={onPayOff}>
              Pay them off
            </button>
          )}
          {canHeal && (
            <button type="button" className="ghost" onClick={onHeal}>
              Patch up
            </button>
          )}
          {canDonate && (
            <button type="button" className="ghost" onClick={onDonate}>
              Give $2
            </button>
          )}
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
