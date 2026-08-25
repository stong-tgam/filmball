/**
 * The turn's draw.
 *
 * A poker card turns over at the top of every turn. Most of them are nothing, and the
 * card still gets shown - a quiet card is information too, and the moment of turning
 * it over is half the fun. A face card brings an event, and then the card shares the
 * screen with what it did.
 */

import { SUIT_PIP, isFace, isJoker, isRed } from "../game/cards";
import type { Draw } from "../game/types";

export function PlayingCard({ draw }: { draw: Draw }) {
  const { card } = draw;
  return (
    <div
      className={`card${isRed(card) ? " card-red" : ""}${isFace(card) ? " card-face" : ""}${
        isJoker(card) ? " card-joker" : ""
      }`}
    >
      <span className="card-rank">{card.rank}</span>
      <span className="card-pip">{SUIT_PIP[card.suit]}</span>
    </div>
  );
}

export default function EventCardModal({ draw, turn, onClose }: { draw: Draw; turn: number; onClose: () => void }) {
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="The turn's card">
      <div className="modal modal-narrow">
        <p className="draw-turn">Turn {turn}</p>
        <PlayingCard draw={draw} />

        {draw.event ? (
          <div className="draw-event">
            <h2>{draw.event.title}</h2>
            <p>{draw.event.text}</p>
          </div>
        ) : (
          <p className="muted draw-quiet">Nothing happens. Get on with it.</p>
        )}

        <button type="button" onClick={onClose}>
          {draw.event ? "Right then" : "Carry on"}
        </button>
      </div>
    </div>
  );
}
