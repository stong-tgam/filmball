/**
 * Every colour that names a thing on the board, in one place.
 *
 * A player learns the game by colour before they learn it by name — "the pink one" is
 * how a seven-year-old refers to the knight for the first hour. So a thing's colour has
 * to be the same on its token, on its chit, in the party list, on the compass blip and
 * in the log, and the only way to be sure of that is for there to be exactly one place
 * the colour is written down. That is this file.
 *
 * **Do not hard-code a token or blip colour anywhere else.** If you need a colour for
 * something on the board, add it here and import it. `styles.css` still owns the
 * *scenery* — terrain fills, panel chrome, the accent — because none of that names a
 * character or an event.
 *
 * The ten below were chosen by the game's owner. Bandits and ogres were not specified
 * and are picked to stay clear of the ten: orange and teal are the two hues nothing
 * else is using.
 */

export const PALETTE = {
  /* ------------------------------------------------------------- the party */
  knight: "#f27bb0",
  rogue: "#f2c53d",
  scout: "#1f7a44",
  doctor: "#f7f4ec",
  fisherman: "#7fc8f0",

  /* ---------------------------------------------------------- the monsters */
  /** Not specified; orange is the only warm hue nothing else claims. */
  mob: "#e8734a",
  /** Not specified; teal sits clear of the scout's green and the fisher's blue. */
  midboss: "#0d8080",
  finalboss: "#e02424",

  /* ------------------------------------------------- the things that wander */
  pirates: "#8e44c9",
  robber: "#8a5a2b",
  tornado: "#9aa3ab",
  homeless: "#8fd67a",
} as const;

export type PaletteKey = keyof typeof PALETTE;

/**
 * Ink for text sitting on top of one of these.
 *
 * The doctor's white and the rogue's yellow need dark text on them; everything else
 * takes light. Worked out once here rather than guessed at each call site.
 */
const DARK_TEXT: PaletteKey[] = ["doctor", "rogue", "homeless", "fisherman", "tornado"];

export const inkOn = (key: PaletteKey): string =>
  DARK_TEXT.includes(key) ? "#141a1f" : "#ffffff";
