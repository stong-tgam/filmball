/**
 * The turn timer.
 *
 * One device goes round a table and "nobody waits" is a design rule, so a turn that
 * takes forever is not a small problem - it is four children watching. Two tiles of
 * movement and a route to plan made turns longer, and this is the counterweight: an
 * hourglass on the banner, and when the sand runs out the turn passes.
 *
 * **It is not part of the game.** It lives in the view and never in `GameState`, which
 * matters more than it looks: the whole design rests on a game being reproducible from
 * its seed, and a wall clock in the state would make a saved game resume differently
 * from the one that was put down. It calls the same `endTurn` the button does, so as
 * far as the rules are concerned somebody pressed the button.
 *
 * It can be turned off. Some evenings the point is the talking.
 */

import { useEffect, useRef, useState } from "react";

/** How long a turn gets. Long enough to think, short enough that nobody drifts off. */
export const TURN_SECONDS = 90;
/** When the sand starts running visibly low, and the glass starts pulsing. */
export const LOW_WATER = 15;

export default function Hourglass({
  /** Restarts the sand whenever this changes - so, whenever the device changes hands. */
  turnKey,
  running,
  seconds = TURN_SECONDS,
  onOut,
}: {
  turnKey: string;
  running: boolean;
  seconds?: number;
  onOut: () => void;
}) {
  const [left, setLeft] = useState(seconds);
  // Held in a ref so the interval never closes over a stale callback: `endTurn` comes
  // from the store and is a new function on every render.
  const ring = useRef(onOut);
  ring.current = onOut;

  useEffect(() => setLeft(seconds), [turnKey, seconds]);

  useEffect(() => {
    if (!running) return;
    const tick = setInterval(() => {
      setLeft((was) => {
        if (was <= 1) {
          // Out of the render, or React is being asked to update the store mid-paint.
          setTimeout(() => ring.current(), 0);
          return 0;
        }
        return was - 1;
      });
    }, 1000);
    return () => clearInterval(tick);
  }, [turnKey, running]);

  const share = Math.max(0, Math.min(1, left / seconds));
  const low = left <= LOW_WATER;

  return (
    <div
      className={`hourglass${low ? " is-low" : ""}${left === 0 ? " is-out" : ""}`}
      title={`${left} seconds left in this turn`}
    >
      <svg viewBox="0 0 24 32" aria-hidden="true">
        {/* The frame. */}
        <path
          d="M4 2 h16 M4 30 h16 M5 2 v5 l7 9 l-7 9 v5 M19 2 v5 l-7 9 l7 9 v5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Sand in the top, draining. The two halves are drawn as clipped rectangles
            rather than as shapes that morph, because a shape that morphs at one frame
            a second reads as a glitch. */}
        <clipPath id="glass-top">
          <path d="M6 3 l6 12 l6 -12 Z" />
        </clipPath>
        <rect
          x="4"
          y={3 + 12 * (1 - share)}
          width="16"
          height={12 * share}
          clipPath="url(#glass-top)"
          fill="currentColor"
        />
        <clipPath id="glass-bottom">
          <path d="M6 29 l6 -12 l6 12 Z" />
        </clipPath>
        <rect
          x="4"
          y={29 - 12 * (1 - share)}
          width="16"
          height={12 * (1 - share)}
          clipPath="url(#glass-bottom)"
          fill="currentColor"
        />
      </svg>
      {/* The number as well as the picture. An hourglass says "some time left"; a
          child deciding whether to search or run needs to know how much. */}
      <span className="hourglass-count">{left}</span>
    </div>
  );
}
