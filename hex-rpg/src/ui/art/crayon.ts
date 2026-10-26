/**
 * The crayon box, in code. See `docs/art-direction.md` for why each value is what it is.
 *
 * Everything drawn for this game goes through here: the palette read off the children's
 * own chits, the darkening rule that keeps outlines out of pure black, and the seed
 * hash that gives every object its own permanent wobble.
 */

/** Ground and ink. */
export const PAPER = "#F0E7D6";
export const CHIP = "#FBF7EE";
export const INK = "#23201C";
export const NAVY = "#1F3A6E";

/** The eight markers. Artwork only - never interface chrome. */
export const MARKER = {
  strawberry: "#DC2F2A",
  cake: "#E0407E",
  carrot: "#F0821E",
  sunshine: "#F2B705",
  leaf: "#45A63F",
  river: "#1E6FD9",
  grape: "#7B2FA0",
  cocoa: "#7A4A22",
} as const;

/**
 * An outline is a darkened version of its own fill, never black. 35% is the amount
 * that reads as "the same pen pressed harder" rather than as a second colour.
 */
export function darken(hex: string, amount = 0.35): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const mix = (channel: number) => Math.round(channel * (1 - amount));
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

/** A paler wash of the same colour, for bellies, highlights and label bands. */
export function lighten(hex: string, amount = 0.35): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const mix = (channel: number) => Math.round(channel + (255 - channel) * amount);
  const r = mix((n >> 16) & 255);
  const g = mix((n >> 8) & 255);
  const b = mix(n & 255);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

/**
 * How many wobble filters exist. SVG filters cannot take arguments, so the seed has to
 * be baked in - a handful of them, picked by hash, is enough that no two neighbouring
 * tokens shake the same way.
 */
export const WOBBLE_VARIANTS = 6;

const hash = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

/** The same name always gets the same wobble, so nothing shimmers between renders. */
export const wobbleFor = (name: string): string =>
  `url(#crayon-wobble-${hash(name) % WOBBLE_VARIANTS})`;

/** Deterministic small jitter, for tilting labels and nudging details off-centre. */
export const jitter = (name: string, spread: number): number =>
  ((hash(name) % 1000) / 1000 - 0.5) * 2 * spread;

/** Pick one of a set by name - which mob drawing a given bandit gets, and so on. */
export const pickFor = <T,>(name: string, options: readonly T[]): T =>
  options[hash(name) % options.length];
