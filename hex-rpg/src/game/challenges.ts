/**
 * The mini-games. Fifty-two of them, one per card.
 *
 * This is the turn the project took in v0.31, and it is worth writing down why. For
 * fifteen versions every number in this game was tuned by a **bot** playing eight
 * hundred games against itself - which meant the thing being optimised was the win
 * rate, and nobody ever measured whether a family laughed. The stated goal was always
 * "family time, not simulation depth". A dice roll is simulation depth. **A challenge
 * the table does together is family time**, and that is what a fight is now.
 *
 * **The suit says which game. The rank says how hard.**
 *
 * | suit | game | what happens |
 * |---|---|---|
 * | ♥ hearts | Quick Draw | one of you draws it, the rest guess |
 * | ♠ spades | Act It Out | one of you does it, the rest guess |
 * | ♣ clubs | True or Poo | the whole team calls it, together |
 * | ♦ diamonds | Puzzle | the whole team works it out |
 *
 * Two rules the content has to hold to, and they are why this file is hand-written
 * rather than generated:
 *
 * - **The app poses and times; the family judges.** No machine can tell whether a
 *   drawing looked enough like a dragon, and one that tried would be wrong in front of
 *   a child. Every challenge ends with the table tapping *we did it* or *we did not*,
 *   which puts people in charge of each other - the whole point of the change.
 * - **A seven-year-old has to be able to attempt every single one.** The hard end is
 *   hard because the *thing* is hard to draw or to know, never because the words are
 *   long. Nothing here needs reading age above about seven.
 *
 * Difficulty runs 2 (easiest) to Ace (hardest) within each suit. **Time does not**:
 * every game of a kind gets the same clock, because taking time away *and* making the
 * thing harder is two punishments for one card, and the one that reads at a table is
 * the content. Gear buys extra seconds instead (see `SECONDS`).
 *
 * BACKLOG: generating these with an LLM so a family never sees the same card twice.
 * The shape here - `Challenge`, with a prompt and an optional answer - is deliberately
 * what a model would return, so that swap is a source change and not a redesign.
 */

import type { Card, Rank, Suit } from "./types";

export type ChallengeKind = "draw" | "act" | "truth" | "puzzle";

export type Challenge = {
  kind: ChallengeKind;
  /** 2 through Ace: the harder the card, the harder the thing. */
  rank: Rank;
  /** Shown to whoever is doing it. For `truth` and `puzzle`, shown to everybody. */
  prompt: string;
  /**
   * One nudge, bought with gear or with the rogue's peek.
   *
   * **Every game has one, including the two with no right answer.** A hint on a
   * drawing is not a step towards an answer - there is no answer - it is a second
   * thing to draw that makes the first one guessable, which is exactly what an older
   * sibling would lean over and whisper. A help that only worked on half the deck
   * would make gear feel broken on the other half.
   */
  hint: string;
  /**
   * What the answer was, revealed when the clock stops.
   *
   * Only for the two games where there *is* a right answer. Nobody adjudicates a
   * drawing, so `draw` and `act` have none - and that is the point of them.
   */
  answer?: string;
  /** Seconds on the clock. */
  seconds: number;
};

/** Which game each suit is. The one thing a child has to learn to play. */
export const GAME_OF: Record<Exclude<Suit, "joker">, ChallengeKind> = {
  hearts: "draw",
  spades: "act",
  clubs: "truth",
  diamonds: "puzzle",
};

/**
 * The suit each game comes on, which is `GAME_OF` read backwards.
 *
 * Here because a piece of gear has to be able to *show* its suit: a rule card that
 * says only "Both of you" is a button a child cannot plan around, and one that says
 * "\u2665 Both of you" teaches the whole system the first time a heart comes up.
 */
export const SUIT_OF: Record<ChallengeKind, Exclude<Suit, "joker">> = {
  draw: "hearts",
  act: "spades",
  truth: "clubs",
  puzzle: "diamonds",
};

export const GAME_NAME: Record<ChallengeKind, string> = {
  draw: "Quick Draw",
  act: "Act It Out",
  truth: "True or Poo",
  puzzle: "Puzzle",
};

export const GAME_HOW: Record<ChallengeKind, string> = {
  draw: "One of you draws it. Everybody else shouts guesses.",
  act: "One of you acts it out — no words, no noises. Everybody else guesses.",
  truth: "Is it true, or is it poo? Decide together and call it out.",
  puzzle: "Work it out together, out loud.",
};

/**
 * How long each kind gets.
 *
 * Drawing needs the longest because somebody has to find a pencil; a shout of TRUE or
 * POO needs the least because thinking about it is the whole game and a long clock
 * just lets an adult talk a child out of the right answer.
 */
export const SECONDS: Record<ChallengeKind, number> = {
  draw: 60,
  act: 45,
  truth: 25,
  puzzle: 60,
};

const RANKS: Rank[] = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];

/** What every entry below carries: the thing itself, and the whisper that helps. */
type Said = { prompt: string; hint: string };

/** Easiest first, hardest last. Thirteen each, in rank order. */
const DRAW: Said[] = [
  { prompt: "A ball", hint: "You kick it." },
  { prompt: "A house", hint: "Start with the roof." },
  { prompt: "A fish", hint: "Draw some bubbles too." },
  { prompt: "A tree", hint: "Put an apple in it." },
  { prompt: "A cat", hint: "Do the whiskers." },
  { prompt: "A birthday cake", hint: "Candles. Lots of candles." },
  { prompt: "A bicycle", hint: "Two circles first." },
  { prompt: "An elephant", hint: "The nose does all the work." },
  { prompt: "A castle", hint: "Square on top, like teeth." },
  { prompt: "A dragon", hint: "Wings, and something on fire." },
  { prompt: "A pirate ship", hint: "Put a flag on it." },
  { prompt: "A knight on a horse", hint: "Draw the horse first, then sit somebody on it." },
  { prompt: "A thunderstorm", hint: "A cloud, and a zigzag under it." },
];

const ACT: Said[] = [
  { prompt: "Brushing your teeth", hint: "Do not forget to spit." },
  { prompt: "A hopping rabbit", hint: "Ears." },
  { prompt: "Eating spaghetti", hint: "Twirl it, then slurp it." },
  { prompt: "A cat waking up", hint: "Stretch first. Really stretch." },
  { prompt: "Carrying something far too heavy", hint: "Let your knees wobble." },
  { prompt: "Sneaking past a sleeping giant", hint: "Show them how big he is first." },
  { prompt: "A robot running out of battery", hint: "Start stiff, end in a heap." },
  { prompt: "Fishing, and catching a big one", hint: "Show how big with your arms." },
  { prompt: "Being blown along by a tornado", hint: "Spin, and hold onto your hat." },
  { prompt: "A knight putting on armour", hint: "Every piece is heavy, one at a time." },
  { prompt: "Trying not to laugh at a funeral", hint: "Sad face, shaking shoulders." },
  { prompt: "Waking up late for school", hint: "Look at a clock, then panic." },
  { prompt: "A dragon with a cold", hint: "Big wings, tiny sneeze." },
];

/** Statements a child can reason about. Every one of these is checked. */
const TRUTH: (Said & { answer: "True" | "Poo" })[] = [
  { prompt: "A spider has eight legs.", hint: "Count the legs on a picture of one.", answer: "True" },
  { prompt: "Fish can blink.", hint: "What would they blink with?", answer: "Poo" },
  { prompt: "The sun is a star.", hint: "It only looks bigger because it is near.", answer: "True" },
  { prompt: "Bats are birds.", hint: "Birds lay eggs. Bats do not.", answer: "Poo" },
  { prompt: "Honey never goes off.", hint: "They found some in a pyramid.", answer: "True" },
  { prompt: "A tomato is a fruit.", hint: "It has seeds inside.", answer: "True" },
  { prompt: "Camels store water in their humps.", hint: "The hump is squishy, not sloshy.", answer: "Poo" },
  { prompt: "Octopuses have three hearts.", hint: "More than you, anyway.", answer: "True" },
  { prompt: "Goldfish forget everything after three seconds.", hint: "They can be taught tricks.", answer: "Poo" },
  { prompt: "Sound travels faster through water than through air.", hint: "Whales talk a very long way.", answer: "True" },
  { prompt: "The Great Wall of China can be seen from the moon.", hint: "It is long, but it is only as wide as a road.", answer: "Poo" },
  { prompt: "Sharks are older than trees.", hint: "Sharks are much older than you think.", answer: "True" },
  { prompt: "Lightning never strikes the same place twice.", hint: "Ask a very tall building.", answer: "Poo" },
];

const PUZZLE: (Said & { answer: string })[] = [
  { prompt: "What comes next?  2, 4, 6, 8, \u2026", hint: "You are counting in twos.", answer: "10" },
  { prompt: "You have 7 apples and eat 3. How many are left?", hint: "Count backwards from seven.", answer: "4" },
  { prompt: "How many legs do 4 cats have altogether?", hint: "Four legs each.", answer: "16" },
  { prompt: "What comes next?  1, 2, 4, 8, \u2026", hint: "Each one is double the last.", answer: "16" },
  { prompt: "Half of 30, then add 5. What is it?", hint: "Half of thirty first.", answer: "20" },
  { prompt: "I am tall when I am young and short when I am old. What am I?", hint: "It is on a birthday cake.", answer: "A candle" },
  { prompt: "A farmer has 6 sheep. All but 2 run away. How many are left?", hint: "Read it again. Slowly.", answer: "2" },
  { prompt: "What has hands but cannot clap?", hint: "It is on the wall.", answer: "A clock" },
  { prompt: "3 people share 12 cakes evenly. Then one more person arrives and they share again. How many each now?", hint: "Forget the first share. Twelve between four.", answer: "3" },
  { prompt: "What comes next?  1, 1, 2, 3, 5, \u2026", hint: "Add the last two together.", answer: "8" },
  { prompt: "A book costs $7. You have two $5 notes. How much change?", hint: "You are handing over ten dollars.", answer: "$3" },
  { prompt: "If today is Tuesday, what day is it in 10 days?", hint: "Ten days is a week and three more.", answer: "Friday" },
  { prompt: "What goes up but never comes down?", hint: "It goes up once a year.", answer: "Your age" },
];

/** Every challenge, keyed by suit and rank. Built once. */
const DECK: Record<ChallengeKind, Challenge[]> = {
  draw: DRAW.map((d, i) => ({ ...d, kind: "draw", rank: RANKS[i], seconds: SECONDS.draw })),
  act: ACT.map((d, i) => ({ ...d, kind: "act", rank: RANKS[i], seconds: SECONDS.act })),
  truth: TRUTH.map((d, i) => ({ ...d, kind: "truth", rank: RANKS[i], seconds: SECONDS.truth })),
  puzzle: PUZZLE.map((d, i) => ({ ...d, kind: "puzzle", rank: RANKS[i], seconds: SECONDS.puzzle })),
};

/**
 * The challenge a card asks for.
 *
 * A joker has no game of its own - it is the wild card everywhere else in this game
 * too - so it takes the easiest challenge of a kind picked from its own position in
 * the deck rather than being a dead draw. Nothing in the game should ever be a card
 * that does nothing.
 */
export function challengeFor(card: Card): Challenge {
  if (card.suit === "joker") return DECK.draw[0];
  const kind = GAME_OF[card.suit];
  const at = RANKS.indexOf(card.rank);
  return DECK[kind][at < 0 ? 0 : at];
}

/** Everything in the box, for the tests and for a future content editor. */
export const allChallenges = (): Challenge[] => Object.values(DECK).flat();

/** How hard this one is, in words, for the card on screen. */
export const difficultyOf = (rank: Rank): "easy" | "tricky" | "hard" => {
  const at = RANKS.indexOf(rank);
  if (at < 0 || at <= 4) return "easy";
  return at <= 8 ? "tricky" : "hard";
};
