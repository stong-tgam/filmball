/**
 * The name of every sound effect in the game, in one place.
 *
 * Same argument as `src/artslots.ts` and `src/palette.ts`: one list, read by both the
 * generation tool (`tools/generate-sfx.ts`) and the runtime player
 * (`src/ui/sound/player.ts`), so nothing can name a sound in one place and reach for a
 * different name in the other.
 *
 * Scoped to the moments `CLAUDE.md` already calls out as worth protecting - "the card
 * turning over, the boss reveal, the loot drop, the event card" - plus the handful of
 * other state transitions a table would actually want to hear. No narration, no
 * ambience: short, specific cues only.
 */

export type SfxKey =
  | "cardFlip"
  | "trialWon"
  | "trialLost"
  | "fightWon"
  | "fightLost"
  | "dragonWakes"
  | "chestOpen"
  | "foundGear"
  | "foundNothing"
  | "mishap"
  | "thief"
  | "victory"
  | "outOfTime"
  | "escaped";

export type SfxEntry = {
  key: SfxKey;
  /** What to call it, for a human reading a list. */
  name: string;
  /** The text prompt sent to ElevenLabs' sound-generation endpoint. */
  prompt: string;
  /** Roughly how long the clip should be, in seconds. Left unset lets the API guess. */
  durationSeconds?: number;
};

export const SFX: Record<SfxKey, SfxEntry> = {
  cardFlip: {
    key: "cardFlip",
    name: "Card flip",
    prompt: "a quick, light playing card flip and snap, crisp and short",
    durationSeconds: 0.6,
  },
  trialWon: {
    key: "trialWon",
    name: "Mini-game won",
    prompt: "a short, cheerful upward chime, like winning a small round in a kids' game",
    durationSeconds: 1,
  },
  trialLost: {
    key: "trialLost",
    name: "Mini-game lost",
    prompt: "a short, gentle, comedic descending trombone 'womp womp', playful not harsh",
    durationSeconds: 1.2,
  },
  fightWon: {
    key: "fightWon",
    name: "Fight won",
    prompt: "a short triumphant fanfare, like beating a friendly monster in a kids' board game",
    durationSeconds: 2,
  },
  fightLost: {
    key: "fightLost",
    name: "Fight lost",
    prompt: "a soft, bouncy, comedic failure sound - a sad boing, not scary or harsh",
    durationSeconds: 1.2,
  },
  dragonWakes: {
    key: "dragonWakes",
    name: "The dragon wakes",
    prompt: "a low, rumbling dragon waking up with a deep growl, powerful and exciting but not frightening for children",
    durationSeconds: 3,
  },
  chestOpen: {
    key: "chestOpen",
    name: "Chest opens",
    prompt: "a wooden treasure chest creaking open followed by a sparkling magical chime",
    durationSeconds: 1.5,
  },
  foundGear: {
    key: "foundGear",
    name: "Found something",
    prompt: "a bright, satisfying item-pickup chime, like finding treasure in a kids' video game",
    durationSeconds: 0.8,
  },
  foundNothing: {
    key: "foundNothing",
    name: "Found nothing",
    prompt: "a short, silly 'nothing here' shrug sound effect, light and comedic",
    durationSeconds: 0.8,
  },
  mishap: {
    key: "mishap",
    name: "A mishap",
    prompt: "a short comedic 'uh-oh' boing sound effect, silly and surprising, not scary",
    durationSeconds: 0.8,
  },
  thief: {
    key: "thief",
    name: "A thief",
    prompt: "sneaky cartoon footsteps and a quick mischievous giggle, playful",
    durationSeconds: 1.2,
  },
  victory: {
    key: "victory",
    name: "Victory - the dragon is beaten",
    prompt: "an epic, joyful victory fanfare for winning a board game, triumphant, warm and celebratory",
    durationSeconds: 3,
  },
  outOfTime: {
    key: "outOfTime",
    name: "Out of time",
    prompt: "a gentle, soft chime that says time is up - a little disappointing but friendly, never harsh",
    durationSeconds: 1.5,
  },
  escaped: {
    key: "escaped",
    name: "Escaped through the secret spot",
    prompt: "a magical whoosh and a sparkle, like slipping away through a secret passage",
    durationSeconds: 1.5,
  },
};

export const everySfx = (): SfxEntry[] => Object.values(SFX);
