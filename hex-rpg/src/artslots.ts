/**
 * The name of every picture in the game, in one place.
 *
 * Exactly the argument `src/palette.ts` makes about colour, for the same reason. A
 * thing's drawing has to be the same on its token on the board, on its blip on the
 * compass, on the card when it turns up and in the art room where somebody replaces it
 * — and the only way to be sure of that is for the name to be written down once.
 *
 * It lives here rather than beside the drawings because `src/game/sense.ts` needs it
 * too: the compass blip carries the slot the same way it already carries the colour, so
 * the dot and the token cannot drift apart. `src/game/` never imports React, and there
 * is none here.
 *
 * **A slot is only real if something reads it.** `art/catalogue.ts` offers a square for
 * each of these in the art room, and a square that takes a drawing nothing ever shows
 * is a promise broken to a child.
 */

import type { EnemyKind, Feature, GemKind, HazardKind, Role } from "./game/types";

export const roleSlot = (role: Role): string => `role:${role}`;

/**
 * One picture per *kind* of monster, not per name.
 *
 * The gallery keys bandit faces individually (`monster:mob:Goblin`) because it is a
 * sheet of faces; the game only ever knows "a bandit", and one picture per kind is the
 * honest granularity for a board where every bandit is just a bandit.
 */
export const monsterSlot = (kind: EnemyKind): string => `monster:${kind}`;

export const gemSlot = (kind: GemKind): string => `gem:${kind}`;

export const featureSlot = (feature: Feature): string => `feature:${feature}`;

export const itemSlot = (name: string): string => `item:${name}`;

/**
 * The wanderers.
 *
 * The robber and the pirates point at their **monster** picture. They are one character
 * wearing two hats — a hazard record that walks and a monster record that fights — and
 * two drawings of one character would mean two squares in the art room and a board
 * where the thing you fight looks nothing like the thing you were avoiding.
 */
export const hazardSlot = (kind: HazardKind): string =>
  kind === "robber" || kind === "pirates" ? monsterSlot(kind) : `hazard:${kind}`;
