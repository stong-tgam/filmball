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
import type { GameState, Gem, GemKind, GemSetting, Player } from "./types";

export type { Gem, GemKind, GemSetting } from "./types";

/** The three places a stone can sit, in the order the buttons show them. */
export const SETTINGS: GemSetting[] = ["weapon", "armor", "boots"];

export type GemPower = {
  /** What the button says. */
  title: string;
  /** One line a child can act on. Shown under the button, not in a rulebook. */
  text: string;
  /** True for the two that only ever fire once in an evening. */
  onceAGame: boolean;
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
        onceAGame: false,
      },
      // The best thing in the set, and the reason the stone is green. "Losing must not
      // feel like punishment" is the house rule; this is that rule as an object you can
      // hold, hand to the child who keeps going down, and see on the table.
      armor: {
        title: "Second wind",
        text: "Once a game, a blow that would put you down leaves you on one health.",
        onceAGame: true,
      },
      // Ground is searched once per game or standing still beats playing. This is the
      // one exception, and it is once a game too - it turns a tile the party has
      // already wrung out into a reason to walk back across the shrinking board.
      boots: {
        title: "Dig again",
        text: "Once a game, search ground that somebody has already been over.",
        onceAGame: true,
      },
    },
  },
};

/** How often a stone turns up. Low: two or three find a home in an evening. */
export const GEM_FROM_A_BODY = 0.15;
export const GEM_FROM_THE_GROUND = 0.1;
export const GEM_FROM_A_CHEST = 0.4;

let counter = 0;
export const makeGem = (kind: GemKind, id?: string): Gem => ({
  id: id ?? `gem-${kind}-${++counter}`,
  kind,
  // Lands in the coat, which is the kindest of the three to be handed by surprise.
  set: "armor",
  spent: [],
});

/** What this stone is doing where it currently sits. */
export const powerOf = (gem: Gem): GemPower => GEMS[gem.kind].powers[gem.set];

/** Has this stone's power in this setting already been used up? */
export const isSpent = (gem: Gem, setting: GemSetting = gem.set): boolean =>
  gem.spent.includes(setting);

/** Is this stone's current power available right now? */
export const ready = (gem: Gem): boolean => !powerOf(gem).onceAGame || !isSpent(gem);

/** Mark the current setting's once-a-game power used. */
export const spend = (gem: Gem): Gem =>
  isSpent(gem) ? gem : { ...gem, spent: [...gem.spent, gem.set] };

/**
 * The stone a player has, if it is set here and still has its power.
 *
 * One call site per power, and they all read this - so "the holder must be carrying it,
 * it must be in the right setting, and it must not be spent" is written once.
 */
export function powerHere(player: Player, setting: GemSetting): Gem | null {
  const gem = player.gem;
  if (!gem || gem.set !== setting) return null;
  return ready(gem) ? gem : null;
}

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
  const rolled: GameState = { ...state, rngState: rng.state() };
  if (!lucky) return rolled;

  const gem = makeGem("green", `gem-green-${playerId}-${state.log.length}`);
  return {
    ...rolled,
    players: rolled.players.map((p) => (p.id === playerId ? { ...p, gem } : p)),
    log: [
      ...rolled.log,
      {
        turn: rolled.turn,
        text: `${player.name} turned up a ${GEMS.green.name.toLowerCase()}. It is in their ${WORN[gem.set]}: ${powerOf(gem).title} — ${powerOf(gem).text}`,
      },
    ],
  };
}
