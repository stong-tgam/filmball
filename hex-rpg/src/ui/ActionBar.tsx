/**
 * What the active player can do right now: one action, then end the turn.
 *
 * Only what is actually available is shown. An empty row of greyed-out buttons makes
 * a child ask an adult what they are for; a row with one live button does not.
 * Ending a turn asks first - on a tablet being passed around, an accidental tap
 * should not cost somebody their go.
 */

import { useState } from "react";
import { PALETTE } from "../palette";

type Props = {
  canMove: boolean;
  moved: boolean;
  acted: boolean;
  canSearch: boolean;
  /**
   * Whether searching here means turning over ground or pulling a chest out of the
   * water. A river is the best odds in the game and has to say so on the button, or
   * the whole reason to walk to one is invisible.
   */
  searchKind: "chest" | "ground";
  canFish: boolean;
  /** Whether this water still has anything in it beyond the fish. */
  freshWater: boolean;
  canHook: boolean;
  /** Somebody is standing on this tile who could be handed something. */
  canGive: boolean;
  canTrade: boolean;
  canDonate: boolean;
  canHeal: boolean;
  canPayOff: boolean;
  /**
   * There is something standing here and the team has a fight left this turn.
   *
   * A button rather than something that happens when you walk on. A fight is three
   * minutes of everybody's evening with a clock on it, so the team gets asked - and
   * "you do not have to fight every bandit" becomes true rather than merely stated.
   */
  canTakeOn: boolean;
  /** What is standing here, for the button's own words. */
  enemyHere: { name: string; cards: number } | null;
  onTakeOn: () => void;
  /** Take a swing at the thief you are standing with, rather than buying your way past. */
  canFightThief: boolean;
  /** Which thief it is and how much of the party's money they have, for the prompt. */
  thief: { kind: "robber" | "pirates"; carrying: number } | null;
  onSearch: () => void;
  onFish: () => void;
  onHook: () => void;
  onGive: () => void;
  onTrade: () => void;
  onDonate: () => void;
  onHeal: () => void;
  onPayOff: () => void;
  onFightThief: () => void;
  onEndTurn: () => void;
  disabled: boolean;
};

export default function ActionBar({
  canMove,
  moved,
  acted,
  canSearch,
  searchKind,
  canFish,
  freshWater,
  canHook,
  canGive,
  canTrade,
  canDonate,
  canHeal,
  canPayOff,
  canTakeOn,
  enemyHere,
  onTakeOn,
  canFightThief,
  thief,
  onSearch,
  onFish,
  onHook,
  onGive,
  onTrade,
  onDonate,
  onHeal,
  onPayOff,
  onFightThief,
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

  const thiefName = thief?.kind === "pirates" ? "The Pirates are" : "The Robber is";
  const prompt = thief
    ? // Say what is on the table. "Catch them to get it back" is the reason chasing a
      // thief is worth a turn, and a child cannot weigh that against a fight unless
      // the number is in front of them.
      thief.carrying > 0
      ? `${thiefName} here, holding $${thief.carrying} of yours. Fight for it, or hand over the rest.`
      : `${thiefName} here. Fight, or hand it all over.`
    : canDonate
    ? "Someone here could use a hand."
    : canFish
    ? freshWater
      ? "Good water. Nobody has fished this bend."
      : "You can always fish here. The treasure is long gone."
    : canSearch
    ? searchKind === "chest"
      ? "Something is caught in the water here."
      : "Search the ground here, or move on."
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
      {(canTakeOn || canSearch || canFish || canHook || canGive || canTrade || canDonate || canHeal || canPayOff || canFightThief) && (
        <div className="actionbar-buttons">
          {canTakeOn && enemyHere && (
            <button
              type="button"
              className="fight-thief"
              style={{ background: PALETTE.mob }}
              onClick={onTakeOn}
            >
              Take on the {enemyHere.name} — {enemyHere.cards === 1 ? "one card" : `${enemyHere.cards} cards`}
            </button>
          )}
          {canFightThief && (
            <button
              type="button"
              className="fight-thief"
              // The thief's own colour, off the one palette file - a child knows the
              // brown one and the purple one before they know either name.
              style={{ background: PALETTE[thief?.kind ?? "robber"] }}
              onClick={onFightThief}
            >
              {thief?.carrying ? `Fight for the $${thief.carrying}` : "Fight them"}
            </button>
          )}
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
          {canGive && (
            <button type="button" className="ghost" onClick={onGive}>
              Hand something over
            </button>
          )}
          {canFish && (
            <button type="button" className="ghost" onClick={onFish}>
              Cast the line
            </button>
          )}
          {canHook && (
            <button type="button" className="ghost" onClick={onHook}>
              Cast at a friend
            </button>
          )}
          {canSearch && (
            <button type="button" className="ghost" onClick={onSearch}>
              {searchKind === "chest" ? "Open the chest" : "Search here"}
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
