/**
 * Stones.
 *
 * Gear owns the **numbers** in this game - one weapon, one coat, one pair of boots, at
 * +1 or +2 - and by about turn six everybody is holding the best of all three and a
 * find is a shrug. The fix is not bigger numbers. Every number here is a single digit
 * on purpose, and a seven-year-old holding the whole game in their head is the property
 * most easily lost.
 *
 * So a stone never changes a number. **A stone gives you a verb**: a button you did not
 * have before. "The green stone makes your sword +2" is arithmetic; "the green stone
 * feeds everybody who helped you win" is a reason to shout for help. Nothing has to be
 * remembered, because the ability *is* the button, and the action bar has always shown
 * only what you can actually do right now.
 *
 * **One stone, three meanings.** A player carries at most one, and may move it between
 * their weapon, their coat and their boots for nothing, on their turn. That is the
 * whole decision, and it is re-made every time the game changes shape: the stone is not
 * a thing you own, it is a question you answer - *what do I want this to be today?*
 *
 * Three rules held to, which the next two colours must also hold to:
 *
 * - **No stone may show you the board.** The hidden map is what the note-taking and the
 *   talking across the table are for, and a reveal would delete both.
 * - **No stone may do a role's job better than the role does it.** The roles are the
 *   game's identity. None of these heals, or sees further, or hits harder.
 * - **No invisible passives.** Either it is a button, or it is drawn on the stone. A
 *   once-a-game power that a child forgets they have is a power they never had, so a
 *   spent one is greyed out where they can see it.
 */

import { PALETTE } from "../palette";
import { makeRng } from "./rng";
import type { Combat, GameState, Gem, GemKind, GemSetting, Player } from "./types";

export type { Gem, GemKind, GemSetting } from "./types";

/** The three places a stone can sit, in the order the buttons show them. */
export const SETTINGS: GemSetting[] = ["weapon", "armor", "boots"];

/**
 * How often a power comes back.
 *
 * - `"always"` - no limit at all. Green's spoils and blue's two reaches.
 * - `"fight"` - once per fight, and it recharges with the next one. Red's whole set,
 *   which is why red is the *now* stone: it is small, and it is there every time.
 * - `"game"` - once in an evening, and then it is gone. The two biggest things a stone
 *   does, so they get the weight of being spendable exactly once.
 */
export type GemLimit = "always" | "fight" | "game";

export type GemPower = {
  /** What the button says. */
  title: string;
  /** One line a child can act on. Shown under the button, not in a rulebook. */
  text: string;
  limit: GemLimit;
};

export type GemProfile = {
  name: string;
  colour: string;
  /** What the stone is *about*, in three words. */
  theme: string;
  powers: Record<GemSetting, GemPower>;
};

export const GEMS: Record<GemKind, GemProfile> = {
  green: {
    name: "Green Stone",
    colour: PALETTE.gemGreen,
    theme: "keep going",
    powers: {
      // Not a damage bonus and not a pick: the rogue already goes through pockets, and
      // food is the smallest win in the game, which is exactly what makes it safe to
      // hand out - it never competes with gear, so §10's keep-it-or-sell-it decision
      // is untouched. What it *does* do is make shouting for help pay everybody, which
      // is the co-operative rule the whole design leans on.
      weapon: {
        title: "Spoils",
        text: "Win a fight and everyone who swung finds something to eat.",
        limit: "always",
      },
      // The best thing in the set, and the reason the stone is green. "Losing must not
      // feel like punishment" is the house rule; this is that rule as an object you can
      // hold, hand to the child who keeps going down, and see on the table.
      armor: {
        title: "Second wind",
        text: "Once a game, a blow that would put you down leaves you on one health.",
        limit: "game",
      },
      // Ground is searched once per game or standing still beats playing. This is the
      // one exception, and it is once a game too - it turns a tile the party has
      // already wrung out into a reason to walk back across the shrinking board.
      boots: {
        title: "Dig again",
        text: "Once a game, search ground that somebody has already been over.",
        limit: "game",
      },
    },
  },

  red: {
    name: "Red Stone",
    colour: PALETTE.gemRed,
    theme: "you, now",
    powers: {
      // A re-throw rather than a bigger number, and that is the whole difference: the
      // dice roll is one of the four or five moments this game stops for, and this
      // gives a child a second one on the round it matters instead of quietly adding
      // to the total on every round. Choosing *which* round to spend it on is the
      // decision - which is why it is a second button and not an automatic re-roll.
      weapon: {
        title: "Second swing",
        text: "Once a fight, throw your dice twice and keep the better roll.",
        limit: "fight",
      },
      // The smallest possible save, and the one that fires every fight. Green's coat
      // is the once-an-evening rescue; this is the one you can count on, which is why
      // it stops a single health rather than a fall.
      armor: {
        title: "Grit",
        text: "Once a fight, a round that falls short costs you no health.",
        limit: "fight",
      },
      // Running is a gamble on purpose (`escapeChance` is never certain), and this is
      // the one thing in the game that makes it a certainty. It does not make you
      // braver, it makes you able to leave - which is what lets a child walk into
      // something frightening in the first place.
      boots: {
        title: "Slip away",
        text: "Once a fight, backing out of it is certain to work.",
        limit: "fight",
      },
    },
  },

  blue: {
    name: "Blue Stone",
    colour: PALETTE.gemBlue,
    theme: "everybody else",
    powers: {
      // §8's invitations reach as far as the starter's own legs, which is why a scout
      // who picks the fight pulls from further away. This is the other way to get
      // there, and it is the most co-operative thing in the set: it is worth nothing
      // at all to a player on their own.
      weapon: {
        title: "Carry",
        text: "Your shout for help reaches one tile further.",
        limit: "always",
      },
      // The only power in the game that spends *your* health on somebody else's
      // behalf, and it fires by itself because a child who has to be asked "do you
      // want to save your sister" every round will say yes every round anyway. It only
      // ever fires when you can afford it - see `takeTheHit`.
      armor: {
        title: "Take the hit",
        text: "Once a fight, a blow that would put a friend on your tile down lands on you instead.",
        limit: "fight",
      },
      // Handing something over needs a shared tile, which is two turns of walking. One
      // tile of reach turns that into nothing at all, and it is the difference between
      // the doctor's food reaching the knight this turn or next.
      boots: {
        title: "Long arm",
        text: "Hand something to a friend one tile away, not just one you are standing with.",
        limit: "always",
      },
    },
  },
};

/** How often a stone turns up. Low: two or three find a home in an evening. */
export const GEM_FROM_A_BODY = 0.15;
export const GEM_FROM_THE_GROUND = 0.1;
export const GEM_FROM_A_CHEST = 0.4;

/** Every colour, in the order they are described. */
export const KINDS: GemKind[] = ["green", "red", "blue"];

let counter = 0;
export const makeGem = (kind: GemKind, id?: string): Gem => ({
  id: id ?? `gem-${kind}-${++counter}`,
  kind,
  // Lands in the coat, which is the kindest of the three to be handed by surprise -
  // every colour's coat power is a save of some sort.
  set: "armor",
  spent: [],
});

/** What this stone is doing where it currently sits. */
export const powerOf = (gem: Gem): GemPower => GEMS[gem.kind].powers[gem.set];

/** Has this stone's once-a-game power in this setting already been used up? */
export const isSpent = (gem: Gem, setting: GemSetting = gem.set): boolean =>
  gem.spent.includes(setting);

/** Mark the current setting's once-a-game power used. */
export const spend = (gem: Gem): Gem =>
  isSpent(gem) ? gem : { ...gem, spent: [...gem.spent, gem.set] };

/**
 * Is this stone's power available to this player right now?
 *
 * The three limits are checked in one place so that "the holder must be carrying it,
 * it must be in the right setting, and it must not be used up" is written once rather
 * than nine times. A fight-limited power needs the fight to ask about - outside one
 * there is nothing to spend it on, so it reads as unavailable.
 */
export function ready(player: Player, gem: Gem, combat?: Combat | null): boolean {
  switch (powerOf(gem).limit) {
    case "always":
      return true;
    case "game":
      return !isSpent(gem);
    case "fight":
      return combat != null && !combat.stonesSpent.includes(player.id);
  }
}

/**
 * The stone this player is holding, if it is this colour, in this setting, and its
 * power is available.
 *
 * **Every power in the game asks this and nothing else.** One call site per power, so
 * a new colour is a row in the table above and a call here, and the rules about what
 * counts as available cannot drift between them.
 */
export function stone(
  player: Player,
  kind: GemKind,
  setting: GemSetting,
  combat?: Combat | null,
): Gem | null {
  const gem = player.gem;
  if (!gem || gem.kind !== kind || gem.set !== setting) return null;
  return ready(player, gem, combat) ? gem : null;
}

/** Write a fight-limited power off for the rest of this fight. */
export const spendForTheFight = (combat: Combat, playerId: string): Combat =>
  combat.stonesSpent.includes(playerId)
    ? combat
    : { ...combat, stonesSpent: [...combat.stonesSpent, playerId] };

/**
 * Move your stone. Free, and it does not cost the turn's action.
 *
 * **Never once a fight has started.** Switching to the coat after seeing a roll fall
 * short would turn a once-a-game save into a save every fight, which is the one way
 * this system could quietly become a number again.
 */
export const canSetGem = (state: GameState, player: Player): boolean =>
  player.gem !== null && !player.dead && state.combat === null && state.ending === null;

export function setGem(state: GameState, playerId: string, setting: GemSetting): GameState {
  const player = state.players.find((p) => p.id === playerId);
  if (!player?.gem || !canSetGem(state, player) || player.gem.set === setting) return state;

  const moved = { ...player.gem, set: setting };
  return {
    ...state,
    players: state.players.map((p) => (p.id === playerId ? { ...p, gem: moved } : p)),
    log: [
      ...state.log,
      {
        turn: state.turn,
        text: `${player.name} moved the ${GEMS[moved.kind].name.toLowerCase()} into their ${WORN[setting]}. ${powerOf(moved).title}: ${powerOf(moved).text}`,
      },
    ],
  };
}

/** What a child calls the thing the stone is sitting in. */
export const WORN: Record<GemSetting, string> = {
  weapon: "weapon",
  armor: "coat",
  boots: "boots",
};

/**
 * Roll for a stone, and hand it over if one turns up.
 *
 * **Only to somebody who has not got one.** A player carries at most one stone, so a
 * second find would either be a dud card ("you already have one") or a swap that loses
 * the first - and both are worse than the drop simply going to whoever is still
 * empty-handed. That also spreads stones round the party by itself, which is the
 * behaviour we want and did not have to write a rule for.
 *
 * Rolls off the state's own generator, so a seed still replays exactly.
 */
export function maybeAStone(state: GameState, playerId: string, chance: number): GameState {
  const player = state.players.find((p) => p.id === playerId);
  if (!player || player.gem || player.dead) return state;

  const rng = makeRng(state.rngState);
  const lucky = rng.next() < chance;
  if (!lucky) return { ...state, rngState: rng.state() };

  // Which colour is its own roll, off the same generator. Even thirds: none of the
  // three is the good one, they are three different games to play with the same object.
  const kind = KINDS[Math.floor(rng.next() * KINDS.length)] ?? "green";
  const gem = makeGem(kind, `gem-${kind}-${playerId}-${state.log.length}`);
  return {
    ...state,
    rngState: rng.state(),
    players: state.players.map((p) => (p.id === playerId ? { ...p, gem } : p)),
    log: [
      ...state.log,
      {
        turn: state.turn,
        text: `${player.name} turned up a ${GEMS[kind].name.toLowerCase()}. It is in their ${WORN[gem.set]}: ${powerOf(gem).title} — ${powerOf(gem).text}`,
      },
    ],
  };
}

/** What the strip says under a power's name, for the two that run out. */
export const LIMIT_LABEL: Record<GemLimit, string> = {
  always: "",
  fight: "once a fight",
  game: "once a game",
};
