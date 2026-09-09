/**
 * The turn's draw.
 *
 * A poker card turns over at the top of every turn. Most of them are nothing, and the
 * card still gets shown - a quiet card is information too, and the moment of turning
 * it over is half the fun. A face card brings an event, and then the card shares the
 * screen with what it did.
 */

import { SUIT_PIP, isFace, isJoker, isRed } from "../game/cards";
import type { Card, Draw } from "../game/types";

export function PlayingCard({ card }: { card: Card }) {
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
    <div
      className={`modal-backdrop${draw.event ? " backdrop-flash" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="The turn's card"
    >
      <div className={`modal modal-narrow draw${draw.event ? " draw-event-card" : ""}`}>
        <p className="draw-turn">Turn {turn}</p>
        <PlayingCard card={draw.card} />

        {draw.event ? (
          <div className="draw-event">
            <h2>{draw.event.title}</h2>
            <p>{draw.event.text}</p>
          </div>
        ) : (
          <p className="muted draw-quiet">Nothing happens. Get on with it.</p>
        )}

        {/*
          What happened before anybody's go. All of this was decided while the device
          was being passed across the table - the rim maybe falling in, the dragon
          maybe landing, four wanderers each taking a step - and until v0.25 it was
          only ever log lines scrolling past a sidebar. A child being handed the
          device has to be told what moved and who it landed on.

          Directions, never tiles: the log rule holds here too.
        */}
        {(draw.stirred.length > 0 || draw.happenings.length > 0) && (
          <div className="draw-stir">
            <h3>Meanwhile</h3>
            {draw.stirred.length > 0 && (
              <ul className="stir-moves">
                {draw.stirred.map((thing) => (
                  <li key={thing.kind}>
                    <span className="blip-dot" style={{ background: thing.colour }} />
                    <strong>{thing.name}</strong>{" "}
                    {thing.heading ? `moved ${thing.heading}` : "stayed put"}
                  </li>
                ))}
              </ul>
            )}
            {draw.happenings.length > 0 && (
              <ul className="stir-lines">
                {draw.happenings.map((line, i) => (
                  <li key={i}>{line}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <button type="button" onClick={onClose}>
          {draw.event ? "Right then" : "Carry on"}
        </button>
      </div>
    </div>
  );
}
