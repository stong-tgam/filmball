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
   * The answers to choose between, or undefined where there is nothing to choose.
   *
   * **Only the two games that have a right answer get these**, and that is the whole
   * line: True or Poo is two buttons, a Puzzle is four, and a drawing is none, because
   * nobody can put a drawing in a list. Where the app *can* mark the work it should,
   * and asking a family to adjudicate "is a tomato a fruit" when the app knows is
   * making them do the app's job.
   *
   * Stored unshuffled, answer first. `startCombat` shuffles them onto the trial with
   * the game's own generator, so a saved game comes back with the buttons in the order
   * it left them and a seed replays identically.
   */
  options?: string[];
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
  draw: "One of you draws it. Everybody else shouts guesses — it is always one word.",
  act: "One of you acts it out — no words, no noises. Everybody else guesses one word.",
  truth: "Is it true, or is it poo? Decide together and call it.",
  puzzle: "Work it out together, out loud.",
};

/**
 * True where the answer is a single word the guessers have to land on exactly.
 *
 * Drawn on screen (`ONE_WORD` on the card) because the guessers need it more than the
 * performer does: knowing the target is one word is the difference between shouting
 * "knight!" and shouting a sentence nobody can match.
 */
export const guessesOneWord = (kind: ChallengeKind): boolean =>
  kind === "draw" || kind === "act";

/**
 * How long each kind gets.
 *
 * Drawing needs the longest because somebody has to find a pencil; True or Poo needs
 * the least, because thinking about it *is* the game and a long clock only lets an
 * adult talk a child out of the right answer.
 */
export const SECONDS: Record<ChallengeKind, number> = {
  draw: 60,
  act: 45,
  // Thirty, up from twenty-five, because the statements got harder after a real table
  // found them too easy. A question worth doubting needs a moment to doubt it in.
  truth: 30,
  puzzle: 60,
};

const RANKS: Rank[] = ["2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K", "A"];

/** What every entry below carries: the thing itself, and the whisper that helps. */
type Said = { prompt: string; hint: string };

/** True or Poo is always the same two buttons, and the right one is on the card. */
export const TRUE_OR_POO = ["True", "Poo"];

/**
 * Easiest first, hardest last. Thirteen each, in rank order.
 *
 * **Everything you draw or act is ONE WORD.** This is the rule the first version got
 * wrong and it cost more than anything else in the game: measured at a real table,
 * fewer than half of these were completed by ten-year-olds. The prompts were *scenes* -
 * "a knight on a horse", "trying not to laugh at a funeral", "a dragon with a cold" -
 * and a scene is not harder to draw, it is harder to **say**. A child draws a perfect
 * knight, somebody shouts "knight!", and it is not the answer. That is an unwinnable
 * win condition dressed up as a hard drawing.
 *
 * So: one word, the way every product that has solved this does it. Google's
 * Quick, Draw! runs on a few hundred single common nouns; a kids' Pictionary or
 * charades deck is the same. **Difficulty is how hard the thing is to get *across*,
 * never how many words it takes to say it.**
 *
 * - **Draw** is concrete nouns, ordered by how many distinct parts the picture needs
 *   before it stops being ambiguous. A sun is one circle and some lines; an astronaut
 *   is a person, a helmet, a tank and a reason.
 * - **Act** is actions and animals, ordered the same way - and remembering that the
 *   rule is no words *and no noises*, which is what makes Sneeze easy and Snore hard.
 */

const DRAW: Said[] = [
  { prompt: "Sun", hint: "A circle, and lines coming off it." },
  { prompt: "Fish", hint: "Add bubbles." },
  { prompt: "House", hint: "Start with the roof." },
  { prompt: "Cat", hint: "Do the whiskers." },
  { prompt: "Flower", hint: "Petals round a middle." },
  { prompt: "Snowman", hint: "Three circles, then a carrot." },
  { prompt: "Bicycle", hint: "Two circles first." },
  { prompt: "Elephant", hint: "The nose does all the work." },
  { prompt: "Castle", hint: "Square teeth along the top." },
  { prompt: "Skeleton", hint: "Ribs, then a big round head." },
  { prompt: "Octopus", hint: "Count the legs as you go." },
  { prompt: "Dragon", hint: "Wings, and something on fire." },
  { prompt: "Astronaut", hint: "It is the round helmet that gives it away." },
];

const ACT: Said[] = [
  { prompt: "Sleep", hint: "Hands under your head." },
  { prompt: "Eat", hint: "Pick something up and put it in your mouth." },
  { prompt: "Swim", hint: "Big arms. Hold your nose." },
  { prompt: "Rabbit", hint: "Ears, then hop." },
  { prompt: "Monkey", hint: "Scratch, and let your arms hang." },
  { prompt: "Sneeze", hint: "The build-up is the whole thing." },
  { prompt: "Penguin", hint: "Arms straight down. Little steps." },
  { prompt: "Juggle", hint: "Three of them. Keep looking up." },
  { prompt: "Fishing", hint: "Cast, wait, then show them how big." },
  { prompt: "Robot", hint: "Every joint bends once, and only once." },
  { prompt: "Superhero", hint: "Land on one knee first." },
  { prompt: "Shiver", hint: "Start at the shoulders." },
  { prompt: "Snore", hint: "No noises, remember. Show it with your face." },
];

/**
 * Statements a child can reason about. Every one of these is checked.
 *
 * **Two per rank**, and the pool is what makes that possible: the deck is fifty-two
 * cards and there is exactly one club of each rank, so a fourteenth True or Poo used to
 * have nowhere to live. `DECK` holds a *pool* per rank now and the deal picks from it,
 * which is also the shape the LLM backlog needs - contents grow without the deck
 * changing size.
 *
 * **The floor was raised after a real table.** Ten-year-olds found these too easy, and
 * looking at the old easy end it is obvious why: "a spider has eight legs", "penguins
 * can fly", "bats are birds" are not questions, they are recall. Every statement here
 * now has to be one where **the obvious answer is worth doubting** - either a thing
 * that sounds made up and is true, or a thing everybody has heard and is not.
 */
const TRUTH: (Said & { answer: "True" | "Poo" })[][] = [
  [
    { prompt: "Your nose never stops growing.", hint: "It droops with age - that is not the same as growing.", answer: "Poo" },
    { prompt: "Fish can blink.", hint: "What would they blink with?", answer: "Poo" },
  ],
  [
    { prompt: "Camels store water in their humps.", hint: "The hump is squishy, not sloshy.", answer: "Poo" },
    { prompt: "Goldfish forget everything after three seconds.", hint: "They can be taught tricks.", answer: "Poo" },
  ],
  [
    { prompt: "Polar bears have white fur.", hint: "Look closely at one. Then look at its nose.", answer: "Poo" },
    { prompt: "Chewing gum stays in your tummy for seven years.", hint: "Your tummy is not a bin. It empties.", answer: "Poo" },
  ],
  [
    { prompt: "Honey never goes off.", hint: "They found some in a pyramid.", answer: "True" },
    { prompt: "Butterflies taste with their feet.", hint: "They land on a flower before they drink from it.", answer: "True" },
  ],
  [
    { prompt: "People only use ten per cent of their brains.", hint: "Ask what the other ninety per cent would be doing.", answer: "Poo" },
    { prompt: "The Great Wall of China can be seen from the moon.", hint: "It is long, but it is only as wide as a road.", answer: "Poo" },
  ],
  [
    { prompt: "A baby has more bones than a grown-up.", hint: "Some of a baby's bones join up as they grow.", answer: "True" },
    { prompt: "A shrimp's heart is in its head.", hint: "There is not much else up there.", answer: "True" },
  ],
  [
    { prompt: "Octopuses have three hearts.", hint: "More than you, anyway.", answer: "True" },
    // The owner's own, added at the table.
    { prompt: "Your eyes see everything upside down.", hint: "Your brain turns the picture the right way up for you.", answer: "True" },
  ],
  [
    { prompt: "Sound travels faster through water than through air.", hint: "Whales talk a very long way.", answer: "True" },
    { prompt: "Nobody could hear a firework go off in space.", hint: "Sound needs something to travel through.", answer: "True" },
  ],
  [
    { prompt: "Bananas are berries, but strawberries are not.", hint: "Botanists decide this, and they are not sorry.", answer: "True" },
    { prompt: "Water goes down the plughole the other way round in Australia.", hint: "Your bath is far too small for the Earth to bother with.", answer: "Poo" },
  ],
  [
    { prompt: "Some frogs freeze solid all winter and hop away in spring.", hint: "They make their own antifreeze.", answer: "True" },
    { prompt: "Wombat poo comes out shaped like cubes.", hint: "Cubes do not roll off the rock you left them on.", answer: "True" },
  ],
  [
    { prompt: "Mount Everest is the tallest mountain on Earth.", hint: "Highest and tallest are not the same word. Where do you start measuring?", answer: "Poo" },
    { prompt: "A group of crows is called a murder.", hint: "It is the least friendly word for a group of anything.", answer: "True" },
  ],
  [
    { prompt: "The Eiffel Tower is taller in summer than in winter.", hint: "Metal does something when it gets hot.", answer: "True" },
    { prompt: "Sharks are older than trees.", hint: "Sharks are much older than you think.", answer: "True" },
  ],
  [
    { prompt: "A day on Venus lasts longer than a year on Venus.", hint: "It spins very slowly and goes round the sun quickly.", answer: "True" },
    { prompt: "There are more trees on Earth than stars in our galaxy.", hint: "Both numbers are enormous. Trees are more enormous.", answer: "True" },
  ],
];

/**
 * Puzzles, each with three wrong answers to sit beside the right one.
 *
 * Hand-written rather than borrowed from the other puzzles: "A clock" offered as an
 * answer to *seven apples minus three* is not a distractor, it is a giveaway. Every
 * wrong answer here is one a child might actually reach - the off-by-one, the
 * subtraction done the wrong way round, the pattern continued by the wrong rule.
 */
const PUZZLE: (Said & { answer: string; wrong: [string, string, string] })[] = [
  { prompt: "What comes next?  2, 4, 6, 8, \u2026", hint: "You are counting in twos.", answer: "10", wrong: ["9", "11", "12"] },
  { prompt: "You have 7 apples and eat 3. How many are left?", hint: "Count backwards from seven.", answer: "4", wrong: ["3", "5", "10"] },
  { prompt: "How many legs do 4 cats have altogether?", hint: "Four legs each.", answer: "16", wrong: ["8", "12", "20"] },
  { prompt: "What comes next?  1, 2, 4, 8, \u2026", hint: "Each one is double the last.", answer: "16", wrong: ["10", "12", "14"] },
  { prompt: "Half of 30, then add 5. What is it?", hint: "Half of thirty first.", answer: "20", wrong: ["15", "25", "35"] },
  { prompt: "I am tall when I am young and short when I am old. What am I?", hint: "It is on a birthday cake.", answer: "A candle", wrong: ["A tree", "A snowman", "A pencil"] },
  { prompt: "A farmer has 6 sheep. All but 2 run away. How many are left?", hint: "Read it again. Slowly.", answer: "2", wrong: ["4", "6", "0"] },
  { prompt: "What has hands but cannot clap?", hint: "It is on the wall.", answer: "A clock", wrong: ["A glove", "A door", "A teddy"] },
  { prompt: "3 people share 12 cakes evenly. Then one more person arrives and they share again. How many each now?", hint: "Forget the first share. Twelve between four.", answer: "3", wrong: ["4", "2", "6"] },
  { prompt: "What comes next?  1, 1, 2, 3, 5, \u2026", hint: "Add the last two together.", answer: "8", wrong: ["6", "7", "10"] },
  { prompt: "A book costs $7. You have two $5 notes. How much change?", hint: "You are handing over ten dollars.", answer: "$3", wrong: ["$2", "$5", "$7"] },
  { prompt: "If today is Tuesday, what day is it in 10 days?", hint: "Ten days is a week and three more.", answer: "Friday", wrong: ["Thursday", "Saturday", "Tuesday"] },
  { prompt: "What goes up but never comes down?", hint: "It goes up once a year.", answer: "Your age", wrong: ["A balloon", "The sun", "A kite"] },
];

/**
 * Every challenge, keyed by suit and then rank - and each rank holds a **pool**.
 *
 * The pool is the thing that lets the contents outgrow the deck. There are fifty-two
 * cards and only ever will be, but nothing says one card means one challenge: the deal
 * picks from the pool for that rank (`deal` in `combat.ts`, storing `Trial.pick` so a
 * save comes back on the same one). Clubs run two deep today and the rest one; adding
 * to any of them is appending to an array.
 *
 * Pools may be **ragged** on purpose. Requiring every rank to hold the same number
 * would mean writing thirteen at a time or none, which is exactly the friction that
 * stops good content getting added at the table.
 */
const DECK: Record<ChallengeKind, Challenge[][]> = {
  draw: DRAW.map((d, i) => [{ ...d, kind: "draw", rank: RANKS[i], seconds: SECONDS.draw }]),
  act: ACT.map((d, i) => [{ ...d, kind: "act", rank: RANKS[i], seconds: SECONDS.act }]),
  truth: TRUTH.map((pool, i) =>
    pool.map((d) => ({
      ...d,
      kind: "truth" as const,
      rank: RANKS[i],
      seconds: SECONDS.truth,
      options: TRUE_OR_POO,
    })),
  ),
  puzzle: PUZZLE.map(({ wrong, ...d }, i) => [
    {
      ...d,
      kind: "puzzle" as const,
      rank: RANKS[i],
      seconds: SECONDS.puzzle,
      // Answer first; the deal shuffles it onto the trial from the seeded generator.
      options: [d.answer, ...wrong],
    },
  ]),
};

/** How many challenges sit behind one card, so the deal knows what to pick between. */
export function poolSize(card: Card): number {
  if (card.suit === "joker") return DECK.draw[0].length;
  const at = RANKS.indexOf(card.rank);
  return DECK[GAME_OF[card.suit]][at < 0 ? 0 : at].length;
}

/**
 * The challenge a card asks for.
 *
 * A joker has no game of its own - it is the wild card everywhere else in this game
 * too - so it takes the easiest challenge of a kind picked from its own position in
 * the deck rather than being a dead draw. Nothing in the game should ever be a card
 * that does nothing.
 */
export function challengeFor(card: Card, pick = 0): Challenge {
  if (card.suit === "joker") return DECK.draw[0][0];
  const kind = GAME_OF[card.suit];
  const at = RANKS.indexOf(card.rank);
  const pool = DECK[kind][at < 0 ? 0 : at];
  return pool[((pick % pool.length) + pool.length) % pool.length];
}

/** Everything in the box, for the tests and for a future content editor. */
export const allChallenges = (): Challenge[] => Object.values(DECK).flat(2);

/** How hard this one is, in words, for the card on screen. */
export const difficultyOf = (rank: Rank): "easy" | "tricky" | "hard" => {
  const at = RANKS.indexOf(rank);
  if (at < 0 || at <= 4) return "easy";
  return at <= 8 ? "tricky" : "hard";
};
