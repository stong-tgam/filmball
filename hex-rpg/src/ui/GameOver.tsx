/**
 * How it ended. Rulebook §14: beat the dragon inside the turn limit.
 *
 * Three endings, and the losing two say what to do about it rather than just
 * announcing the loss — a game that ends at a full stop is a game nobody plays twice.
 */

import type { Ending } from "../game/types";

const ENDINGS: Record<Ending, { title: string; line: string; tone: string }> = {
  victory: {
    title: "The dragon is dead",
    line: "You did it. Everybody who is still standing goes home rich.",
    tone: "win",
  },
  outOfTime: {
    title: "Out of time",
    line: "The dragon is still out there, and the turn limit ran out. Closer next time.",
    tone: "lose",
  },
};

export default function GameOver({ ending, turn, onNewGame }: { ending: Ending; turn: number; onNewGame: () => void }) {
  const { title, line, tone } = ENDINGS[ending];
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Game over">
      <div className={`modal modal-narrow ending ending-${tone}`}>
        <p className="draw-turn">Turn {turn}</p>
        <h2>{title}</h2>
        <p className="muted">{line}</p>
        <button type="button" onClick={onNewGame}>
          Play again
        </button>
      </div>
    </div>
  );
}
