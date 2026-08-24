/**
 * A token: a drawing on a card disc, with the details on the back.
 *
 * Tap it and it turns over. That is the interaction the table already knows — a child
 * who wants to know what an ogre does picks the ogre up and looks at the back of it —
 * and it keeps the front of the token clear for the drawing, which is the part they
 * care about.
 *
 * Any token's picture can be replaced by one of their own: see `art/overrides.ts`.
 */

import { useId, useState, useSyncExternalStore, type ReactNode } from "react";
import { CHIP, MARKER, jitter } from "./art/crayon";
import { overrideFor, subscribe, type ArtSlot } from "./art/overrides";

type Props = {
  /** Which artwork this is, and what an uploaded drawing would replace. */
  slot: ArtSlot;
  label: string;
  /** The generated drawing, on a 100x100 canvas. Used when nobody has uploaded one. */
  children: ReactNode;
  /** What the back says. Leave it out and the token does not turn. */
  back?: ReactNode;
  size?: number;
  labelColour?: string;
  /** Overrides the tap-to-turn behaviour, for tokens that are buttons in a game. */
  onSelect?: () => void;
};

/** Long names shrink rather than running off the edge of the disc. */
const labelSize = (label: string): number =>
  label.length <= 8 ? 12 : Math.max(7.5, 96 / label.length);

const useOverride = (slot: ArtSlot): string | undefined =>
  useSyncExternalStore(
    subscribe,
    () => overrideFor(slot),
    () => undefined,
  );

export default function Token({
  slot,
  label,
  children,
  back,
  size = 104,
  labelColour = MARKER.strawberry,
  onSelect,
}: Props) {
  const [turned, setTurned] = useState(false);
  const drawing = useOverride(slot);
  const clipId = useId();
  const canTurn = back !== undefined && !onSelect;

  const act = () => (onSelect ? onSelect() : canTurn && setTurned((t) => !t));

  return (
    <div
      className={`chit${turned ? " is-turned" : ""}${canTurn || onSelect ? " is-live" : ""}`}
      style={{ width: size, height: size }}
    >
      <div className="chit-spin">
        <button
          type="button"
          className="chit-face chit-front"
          onClick={act}
          aria-label={canTurn ? `${label} — turn over for details` : label}
          aria-pressed={canTurn ? turned : undefined}
          tabIndex={turned ? -1 : 0}
        >
          <svg viewBox="0 0 100 100" width="100%" height="100%" aria-hidden="true">
            <defs>
              <clipPath id={clipId}>
                <circle cx="50" cy="50" r="47" />
              </clipPath>
            </defs>
            <circle cx="50" cy="50" r="47" fill={CHIP} />
            {drawing ? (
              <image
                href={drawing}
                x="3"
                y="3"
                width="94"
                height="94"
                clipPath={`url(#${clipId})`}
                preserveAspectRatio="xMidYMid slice"
              />
            ) : (
              // The drawing lives in the upper four fifths; the label owns the foot of
              // the disc, the way it does on the children's own chits.
              <g clipPath={`url(#${clipId})`} transform="translate(50 43) scale(0.84) translate(-50 -50)">
                {children}
              </g>
            )}
            {/* A breath of card under the label, so a stray leg never crosses it. */}
            <ellipse cx="50" cy="84" rx="42" ry="12" fill={CHIP} opacity="0.82" />
            <circle cx="50" cy="50" r="47" fill="none" stroke="#DED2BC" strokeWidth="2" />
            <text
              x="50"
              y="88"
              textAnchor="middle"
              fontSize={labelSize(label)}
              fill={labelColour}
              fontFamily="'Patrick Hand','Comic Sans MS',cursive"
              transform={`rotate(${jitter(label, 2.4).toFixed(2)} 50 88)`}
            >
              {label}
            </text>
          </svg>
        </button>

        {canTurn && (
          <button
            type="button"
            className="chit-face chit-back"
            onClick={act}
            aria-label={`${label} — turn back`}
            tabIndex={turned ? 0 : -1}
          >
            <span className="chit-back-inner">{back}</span>
          </button>
        )}
      </div>
    </div>
  );
}
