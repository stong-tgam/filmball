/**
 * How it ended. Rulebook §14: beat the dragon inside the turn limit, **or, since
 * v0.32, work out the map's secret and dig it.**
 *
 * Three endings, and the losing one says what to do about it rather than just
 * announcing the loss — a game that ends at a full stop is a game nobody plays twice.
 * `escaped` is a second *winning* ending, not a consolation prize: only the team
 * standing on the spot when it opens gets to take it, which is what makes leaving a
 * real choice against holding out for the whole party's dragon fight at turn 8.
 */

import type { Ending } from "../game/types";

const ENDINGS: Record<Ending, { title: string; line: (detail: string | null) => string; tone: string }> = {
  victory: {
    title: "The dragon is dead",
    line: () => "You did it. Everybody who is still standing goes home rich.",
    tone: "win",
  },
  escaped: {
    title: "Gone before the dragon woke",
    line: (detail) =>
      `${detail ?? "The team on the spot"} worked out the map's secret and dug it. They are out - and the dragon never even stirred for the rest of the table.`,
    tone: "win",
  },
  outOfTime: {
    title: "Out of time",
    line: () => "The dragon is still out there, and the turn limit ran out. Closer next time.",
    tone: "lose",
  },
};

export default function GameOver({
  ending,
  turn,
  detail,
  onNewGame,
}: {
  ending: Ending;
  turn: number;
  /** The escaping team's name, when `ending` is `"escaped"`. */
  detail?: string | null;
  onNewGame: () => void;
}) {
  const { title, line, tone } = ENDINGS[ending];
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Game over">
      <div className={`modal modal-narrow ending ending-${tone}`}>
        <p className="draw-turn">Turn {turn}</p>
        <h2>{title}</h2>
        <p className="muted">{line(detail ?? null)}</p>
        <button type="button" onClick={onNewGame}>
          Play again
        </button>
      </div>
    </div>
  );
}
