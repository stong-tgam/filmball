/**
 * What the ground gave up, held on screen for a moment.
 *
 * Searching is one of the four or five things in this game worth stopping for, and
 * until now it was a line in the sidebar log that scrolled past while somebody was
 * still looking at the board. The find is one of the exciting moments, so it gets the
 * treatment the others get: the card turns over, and then the thing you found lands on
 * top of it.
 *
 * **A find with nothing in it still gets a card.** A quiet card is information too -
 * the same reason `EventCard` shows the turn's draw even when nothing happens - and a
 * seven-year-old who searched and got no card at all would reasonably think the button
 * was broken. Empty ground gets its own line, its own animation, and its own way out.
 *
 * The card comes up face down first and says what is being done - *Searching...*,
 * *Opening...* - for `SUSPENSE_MS` before it turns over. The whole outcome is decided
 * the instant the button is pressed and has been sitting in `GameState.find` ever
 * since; this is theatre, and it is the point of the feature. Waiting two seconds to
 * find out is the difference between a rule firing and something happening to you.
 */

import { useEffect, useState } from "react";
import { PlayingCard } from "./EventCard";
import Token from "./Token";
import ItemArt from "./art/items";
import { MARKER } from "./art/crayon";
import { gearLabel } from "../game/items";
import { gearBlurb } from "../game/gear";
import type { Find } from "../game/types";
import Art from "./art/Art";

/** The headline, the way you would say it out loud, and the button that closes it. */
const HEADLINE: Record<Find["kind"] | "gearOnTheLine", { title: string; close: string }> = {
  gear: { title: "Look what was down there!", close: "Take it" },
  // The rarest thing the ground has. It gets the shout even when gear came up with it.
  // Same outcome, different place - "down there" is a hole, and this came out of a river.
  gearOnTheLine: { title: "Something on the end of it!", close: "Take it" },
  fish: { title: "Fish on!", close: "In the bag" },
  coins: { title: "Money!", close: "Pocket it" },
  full: { title: "No room for it.", close: "A shame" },
  nothing: { title: "Nothing at all.", close: "Never mind" },
  mishap: { title: "That went badly.", close: "Ow" },
  thief: { title: "Somebody was waiting.", close: "Rotten luck" },
  trap: { title: "The lid came down.", close: "Ow" },
};

/**
 * What coming up empty says, in the words of what you were doing.
 *
 * Four each, picked by the card that came up rather than at random, so the same seed
 * tells the same story twice and the fourth empty field in a row is not word for word
 * the third. Split by source because "a very good hole" over a fishing rod is the app
 * not paying attention, and a child notices that faster than an adult does.
 */
const EMPTY_HANDED: Record<Find["from"], string[]> = {
  ground: [
    "Stones, roots and a bottle top.",
    "Somebody has been here already.",
    "A very good hole. Nothing in it.",
    "Half a worm, and it did not want to be found.",
  ],
  chest: [
    "River water, and a great deal of it.",
    "Weed, mostly. Some of it moving.",
    "An empty box with a very good lock on it.",
    "Somebody got here first and left the lid open.",
  ],
  line: [
    "A bite, a splash, and an empty hook.",
    "Whatever that was, it is still out there.",
    "The line went tight and then it went slack.",
    "One boot. Not even a matching one.",
  ],
};

/** Where this came from, and what the face-down card says while you wait for it. */
const WHERE: Record<Find["from"], string> = {
  ground: "Under the ground",
  chest: "Out of the water",
  line: "On the end of the line",
};
const DOING: Record<Find["from"], string> = {
  ground: "Searching",
  chest: "Opening",
  line: "Fishing",
};

/** How long the card stays face down before it turns over. */
export const SUSPENSE_MS = 2000;

export default function FindCard({ find, onClose }: { find: Find; onClose: () => void }) {
  const { kind, gained, lost, coins, hurt } = find;
  const said = HEADLINE[kind === "gear" && find.from === "line" ? "gearOnTheLine" : kind];
  const lines = EMPTY_HANDED[find.from];
  const empty = lines[find.card.rank.charCodeAt(0) % lines.length];

  const [turned, setTurned] = useState(false);
  useEffect(() => {
    // Keyed on the search itself, so a second search starts its own two seconds
    // rather than inheriting the first one's timer.
    setTurned(false);
    const timer = setTimeout(() => setTurned(true), SUSPENSE_MS);
    return () => clearTimeout(timer);
  }, [find]);

  if (!turned) {
    return (
      <div
        className="modal-backdrop"
        role="dialog"
        aria-modal="true"
        aria-label={`${DOING[find.from]} — ${WHERE[find.from]}`}
      >
        {/*
          Tap to skip. Two seconds is right the first ten times and a toll the fortieth,
          and this fires on every single search - a table that has seen it can get on
          with the game. Deliberately not a button: nobody should be *looking* for the
          way out of the exciting bit.
        */}
        <div
          className="modal modal-narrow find find-waiting"
          onClick={() => setTurned(true)}
          role="presentation"
        >
          <p className="draw-turn">{WHERE[find.from]}</p>
          <div className="card card-down">
            <span className="card-down-word">
              {DOING[find.from]}
              <span className="card-down-dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
            </span>
          </div>
          <p className="find-waiting-hint">Hold your breath...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="What the search turned up">
      <div className={`modal modal-narrow find find-${kind}`}>
        <p className="draw-turn">{WHERE[find.from]}</p>

        {/* The card turns over first; everything below it is held back until it has. */}
        <div className="find-turn">
          <PlayingCard card={find.card} />
        </div>

        <h2 className="find-title">{said.title}</h2>


        {gained.length > 0 && (
          <ul className="find-haul">
            {gained.map((item, i) => (
              // Each token lands a beat after the one before it, so a two-item haul
              // reads as two things arriving rather than one wide picture appearing.
              <li key={item.id} className="find-token" style={{ animationDelay: `${0.45 + i * 0.18}s` }}>
                <Token
                  slot={`item:${item.name}`}
                  label={item.name}
                  size={116}
                  labelColour={item.slot === "supply" ? MARKER.strawberry : MARKER.cocoa}
                >
                  <Art slot={`item:${item.name}`}><ItemArt name={item.name} seedName={item.id} /></Art>
                </Token>
                {/* The token already has the name on it. Repeat only the grade -
                    and say what it is *for*, because finding a Broom means nothing
                    until somebody reads the rule on it. */}
                {gearLabel(item) !== item.name && (
                  <span className="find-token-note">{gearLabel(item)}</span>
                )}
                <span className="find-token-does">{gearBlurb(item)}</span>
              </li>
            ))}
          </ul>
        )}

        {coins > 0 && (
          <p className="find-coins" aria-label={`${coins} dollars`}>
            <span className="find-coin-stack" aria-hidden="true">
              {Array.from({ length: Math.min(coins, 5) }, (_, i) => (
                <span key={i} className="find-coin" style={{ animationDelay: `${0.5 + i * 0.12}s` }} />
              ))}
            </span>
            <strong>${coins}</strong>
          </p>
        )}

        {kind === "nothing" && <p className="find-empty">{empty}</p>}

        {hurt > 0 && <p className="find-hurt">−{hurt} health</p>}
        {lost.length > 0 && (
          <p className="find-lost">
            Gone: {lost.map((item) => gearLabel(item)).join(", ")}
          </p>
        )}

        {/* The log's own words, so the card and the log never tell different stories. */}
        <div className="find-lines">
          {find.lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>

        <button type="button" onClick={onClose}>
          {said.close}
        </button>
      </div>
    </div>
  );
}
