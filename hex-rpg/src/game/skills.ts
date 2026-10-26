/**
 * What each role is for, now that a fight is a mini-game.
 *
 * Every skill in this file helps the **team** get through a challenge, and none of
 * them touches the challenge itself. That is the line: the app poses the thing and
 * times it, and the family decides whether it was done. A skill that judged a drawing
 * would be the app overruling the table, which is the whole thing this version exists
 * to stop.
 *
 * **A skill is what health is for.** There is no dice roll left for health to feed
 * into, so a player at zero is not out of the game and never was meant to be - they
 * still draw, still act, still shout the answer, exactly like everybody else. What
 * they lose is the button with their name on it (`hasSkill`). That is the whole of
 * the consequence model, and it is why the doctor's skill is the best one at the
 * table: theirs is the only one that gives somebody else theirs back.
 *
 * One use each, per fight. Not per game: a power that fires once an evening gets
 * hoarded and then forgotten, and five children hoarding five buttons is five buttons
 * nobody presses.
 */

import type { Combat, Player, Role } from "./types";

export type SkillKind = "holdTheLine" | "peek" | "linger" | "patch" | "recast";

export type Skill = {
  kind: SkillKind;
  title: string;
  /** One line, on the button. */
  text: string;

  /**
   * Whether it is something you press.
   *
   * All five are, now. The knight's used to be automatic - a child asked "do you want
   * to save your sister?" every single time says yes every single time - but **Hold the
   * line is a real decision**: it costs the knight a health nobody else pays, and it is
   * the only thing in the game that undoes a missed card. That one is worth stopping
   * the table for.
   *
   * `Take the hit` survives as the knight's **passive** (`whoTakesTheHit`) and is not
   * in this table, because a passive is not a button and should never be drawn as one.
   */
  pressed: boolean;
  /** True where the role also has a passive that is simply always on. */
  passive?: { title: string; text: string };
};

export const SKILLS: Record<Role, Skill> = {
  knight: {
    kind: "holdTheLine",
    title: "Hold the line",
    text: "The fight is not over. That card comes back as a new one, and the knight pays a health for it.",
    pressed: true,
    passive: {
      title: "Take the hit",
      text: "When a fight is lost, the knight wears it. Nobody else loses a health.",
    },
  },
  rogue: {
    kind: "peek",
    title: "Peek",
    text: "Read the hint, without spending the team's one.",
    pressed: true,
    passive: {
      title: "Light fingers",
      text: "One extra thing off every body they help bring down.",
    },
  },
  scout: {
    kind: "linger",
    title: "Keep looking",
    text: "Fifteen more seconds, on the clock that is running.",
    pressed: true,
    passive: {
      title: "Sharp eyes",
      text: "One more ring of the map, and a second look at any wood.",
    },
  },
  doctor: {
    kind: "patch",
    title: "Patch up",
    text: "A health back for a friend - and their skill with it.",
    pressed: true,
    passive: {
      title: "Field kit",
      text: "Anything they hand somebody to eat is worth one more health.",
    },
  },
  fisherman: {
    kind: "recast",
    title: "Cast again",
    text: "Throw this card back and draw a different one.",
    pressed: true,
    passive: {
      title: "The rod",
      text: "Fishes any river, crosses any water, and can never lose the rod.",
    },
  },
};

/** Fifteen seconds, which is a whole extra go at a drawing and not a whole extra game. */
export const LINGER_SECONDS = 15;

/**
 * What the knight pays to keep a lost fight alive.
 *
 * One health, on top of what the loss already cost everybody. Expensive on purpose:
 * this is the only thing in the game that undoes a missed card, and against a
 * three-card dragon it is the difference between "we nearly had it" and the ending.
 * It is the best moment the design has - the table watches the fight end, and then the
 * knight stands up - which is exactly why it must not be free and must not be
 * automatic.
 */
export const HOLD_THE_LINE_COST = 1;

/**
 * Has this player still got their skill?
 *
 * Health is the only thing that takes it away, and a health back gives it straight
 * back. Somebody who went over the rim (`gone`) is not at the table at all.
 */
export const hasSkill = (player: Player): boolean => player.health > 0 && !player.gone;

/** Has this player already spent theirs in this fight? */
export const spentSkill = (combat: Combat | null, player: Player): boolean =>
  combat?.skillsUsed.includes(player.id) === true;

/** The skill a player could press right now, or null. */
export function readySkill(combat: Combat | null, player: Player): Skill | null {
  const skill = SKILLS[player.role];
  if (!skill.pressed || !hasSkill(player) || spentSkill(combat, player)) return null;
  return skill;
}

/**
 * Who wears the failure, if anybody wears it alone.
 *
 * The knight, and **only while they stay standing**. Heroism that swaps one child for
 * another is a trade nobody chose: a knight on one health who took everybody's failure
 * would go down to save four people from a scratch, and then the party would have no
 * knight. The guard is what makes it safe to fire by itself.
 */
export function whoTakesTheHit(team: Player[], amount: number): Player | null {
  return (
    team.find(
      (p) => p.role === "knight" && hasSkill(p) && p.health > amount,
    ) ?? null
  );
}
