/**
 * The dice.
 *
 * This is the moment the whole game is built around, so the dice tumble before they
 * settle rather than a number appearing. Faces are drawn as pips, because a
 * seven-year-old reads three dots faster than the numeral 3, and the total is spelled
 * out underneath as the sum they can check themselves.
 */

type Props = {
  dice: number[];
  /** Added to the dice total: a weapon, or a monster's claws. */
  bonus: number;
  total: number;
  label: string;
  tone: "player" | "enemy";
};

/** Pip positions on a 3x3 grid, for faces 1 to 3. */
const PIPS: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [
    [0, 0],
    [2, 2],
  ],
  3: [
    [0, 0],
    [1, 1],
    [2, 2],
  ],
};

function Die({ face, index }: { face: number; index: number }) {
  return (
    <span className="die" style={{ animationDelay: `${index * 90}ms` }}>
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <rect x="4" y="4" width="92" height="92" rx="18" />
        {(PIPS[face] ?? []).map(([col, row], i) => (
          <circle key={i} cx={22 + col * 28} cy={22 + row * 28} r="9" className="pip" />
        ))}
      </svg>
      <span className="visually-hidden">{face}</span>
    </span>
  );
}

export default function DiceRoller({ dice, bonus, total, label, tone }: Props) {
  return (
    <div className={`roll roll-${tone}`}>
      <p className="roll-label">{label}</p>
      <div className="dice" key={dice.join("-")}>
        {dice.map((face, i) => (
          <Die key={i} face={face} index={i} />
        ))}
      </div>
      <p className="roll-sum">
        {dice.join(" + ")}
        {bonus > 0 && <span className="roll-bonus"> + {bonus}</span>} ={" "}
        <strong>{total}</strong> damage
      </p>
    </div>
  );
}
