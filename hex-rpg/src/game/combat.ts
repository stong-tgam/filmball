/**
 * Fighting, which is now a game the family plays.
 *
 * A monster deals **one poker card**, a mid boss two, the dragon three. The suit says
 * which mini-game (`challenges.ts`) and the rank says how hard the thing is. A clock
 * runs; the team draws, acts, argues or works it out; and then **the table** says
 * whether they did it. Win every card and the monster is beaten. Miss one and the
 * fight is lost, which costs a health and nothing else - the monster is still standing
 * on that tile and can be taken on again.
 *
 * What went, and why it went:
 *
 * - **The dice.** Three of them plus a weapon bonus against a health bar was the
 *   entire fight for thirty versions, and it is the thing a bot could play and a
 *   family could not enjoy. Nobody at a table has ever laughed at a 4.
 * - **Wounded enemies.** Damage used to accumulate across fights, which turned the
 *   dragon into a siege spread over a dozen goes. A siege is the opposite of a moment.
 *   Every fight now starts clean, and that is what makes the turn-8 dragon an event.
 * - **Escaping.** You choose whether to take a fight at all now (`turn.ts`), so
 *   there is nothing left to run from. A decision before beats a gamble after.
 * - **Invitations.** The team *is* the group fight. Everybody standing there plays,
 *   because everybody standing there is going to shout guesses anyway.
 *
 * The features (§9) stayed, and all five now bite the mini-game rather than the dice -
 * see `FEATURE_BITE`. The loot rules (§10) stayed untouched.
 */

import { ENEMIES, nameWithArticle, verb } from "./enemies";
import { challengeFor, type Challenge } from "./challenges";
import { draw as drawCard } from "./cards";
import { key, neighbours } from "./hex";
import { makeRng } from "./rng";
import { canTake, equip, makeFine, randomFood } from "./items";
import { ROLES, maxHealthOf } from "./players";
import { LINGER_SECONDS, hasSkill, spentSkill, whoTakesTheHit, SKILLS } from "./skills";
import type {
  Combat,
  Enemy,
  Feature,
  GameState,
  Item,
  Player,
  Tile,
  Trial,
} from "./types";

/** What one lost fight costs everybody who played it. */
export const FAILED_FIGHT_COST = 1;

/** Seconds a point of weapon buys. A plain weapon is +10, a fine one +20. */
export const SECONDS_PER_WEAPON = 10;

export const ALL_FEATURES: Feature[] = ["water", "railway", "city", "forest", "field"];

/**
 * What each feature does to the mini-game.
 *
 * §9 named five and specified only the water escape; the rest was a guess made against
 * dice, and dice are gone. Every one of them is re-pointed at the thing a fight is
 * now, and the rule for each is one sentence a seven-year-old can hold:
 *
 * | feature | what it does |
 * |---|---|
 * | water | beaten on a river, it slips away downstream. Once. |
 * | railway | it catches somebody on the tracks before the first card. A health. |
 * | forest | ten seconds off every clock. |
 * | field | losing out here costs a second health. |
 * | city | no hints. It knows these streets and you do not. |
 */
export const FEATURE_BITE: Record<Feature, string> = {
  water: "It can slip away downriver once.",
  railway: "It catches somebody on the tracks: a health, before the first card.",
  forest: "Ten seconds off every clock.",
  field: "Losing out here costs a second health.",
  city: "No hints. It knows these streets.",
};

const note = (state: GameState, text: string): GameState => ({
  ...state,
  log: [...state.log, { turn: state.turn, text }],
});

/** Everybody playing this fight - the whole team, standing on the tile. */
export function fighters(state: GameState): Player[] {
  if (!state.combat) return [];
  const ids = [state.combat.playerId, ...state.combat.allies];
  return ids
    .map((id) => state.players.find((p) => p.id === id))
    .filter((p): p is Player => p !== undefined && !p.gone);
}

export const combatants = (state: GameState): { player: Player; enemy: Enemy } | null => {
  if (!state.combat) return null;
  const player = state.players.find((p) => p.id === state.combat!.playerId);
  const enemy = state.enemies.find((e) => e.id === state.combat!.enemyId);
  return player && enemy ? { player, enemy } : null;
};

/* ------------------------------------------------------------------ features */

/** Rulebook §9: every enemy draws a feature, and the final boss draws two. */
export function drawFeatures(rngState: number, count: number): { features: Feature[]; rngState: number } {
  const rng = makeRng(rngState);
  return { features: rng.shuffle(ALL_FEATURES).slice(0, count), rngState: rng.state() };
}

/** The features that the ground underfoot actually matches. */
export function activeFeatures(enemy: Enemy, tile: Tile | undefined): Feature[] {
  if (!tile) return [];
  return enemy.features.filter((feature) =>
    feature === "railway" ? tile.rail : tile.sides.includes(feature),
  );
}

/** §9, field: it hits harder in the open, so losing out here costs one extra. */
export const extraToll = (enemy: Enemy, tile: Tile | undefined): number =>
  activeFeatures(enemy, tile).includes("field") ? 1 : 0;

/** §9, forest: the clock is shorter under the trees. */
export const FOREST_SECONDS = 10;

/** §9, city: it knows the streets, and no hint is going to help you out here. */
export const noHints = (enemy: Enemy, tile: Tile | undefined): boolean =>
  activeFeatures(enemy, tile).includes("city");

/* ---------------------------------------------------------------- the clock */

/**
 * How long a card gets, and where every second of it came from.
 *
 * The base is the game kind's own (`SECONDS`), because the rank already decides how
 * hard the thing is and taking the clock away as well would be two punishments for one
 * card. What moves it is **gear**: the best weapon in the team buys `SECONDS_PER_WEAPON`
 * a point. The team's best rather than everybody's added together - five children with
 * frying pans should not get three minutes to draw a cat.
 */
export function secondsFor(challenge: Challenge, team: Player[], shorter: boolean): number {
  const best = Math.max(0, ...team.map((p) => p.weapon?.value ?? 0));
  return Math.max(15, challenge.seconds + best * SECONDS_PER_WEAPON - (shorter ? FOREST_SECONDS : 0));
}

/**
 * Hints the team gets for the whole fight, bought with boots.
 *
 * One a pair. Boots were "an extra tile and a better chance of running away", and both
 * of those are gone - this is the same idea pointed at the thing a fight is now:
 * something you spend at the moment you are stuck.
 */
export const hintsFor = (team: Player[]): number => team.filter((p) => p.boots !== null).length;

/* -------------------------------------------------------------- the encounter */

/**
 * Meeting something.
 *
 * Features are drawn first, because §9 is explicit that they are known *before* the
 * encounter - and it matters more now than it ever did with dice, since the team is
 * about to be told how long they have and whether hints work.
 */
export function startCombat(
  state: GameState,
  enemy: Enemy,
  from: string,
  /** Everybody fighting it. The first is the starter and gets §10's picks. */
  teamIds: string[],
): GameState {
  const starter = state.players.find((p) => p.id === teamIds[0]) ?? state.players[0];
  const profile = ENEMIES[enemy.kind];
  let next = state;
  let fighter = enemy;

  if (!enemy.featuresRevealed && profile.features > 0) {
    const drawn = drawFeatures(state.rngState, profile.features);
    fighter = { ...enemy, features: drawn.features, featuresRevealed: true };
    next = {
      ...state,
      rngState: drawn.rngState,
      enemies: state.enemies.map((e) => (e.id === enemy.id ? fighter : e)),
    };
    next = note(next, `${profile.name} is at home on ${drawn.features.join(" and ")}.`);
  }

  const team = teamIds
    .map((id) => next.players.find((p) => p.id === id))
    .filter((p): p is Player => p !== undefined && !p.gone);
  const ground = next.tiles[key(enemy.hex)];
  const shorter = activeFeatures(fighter, ground).includes("forest");

  // Deal the whole hand up front. The team is allowed to see what it has taken on
  // before the first clock starts - three cards is the dragon telling you what the
  // next five minutes are, and that is the moment worth having.
  const trials: Trial[] = [];
  let deck = next.challengeDeck;
  let seed = next.rngState;
  for (let i = 0; i < profile.cards; i++) {
    const pull = drawCard(deck, seed);
    deck = pull.deck;
    seed = pull.rngState;
    trials.push({
      card: pull.card,
      seconds: secondsFor(challengeFor(pull.card), team, shorter),
      hinted: false,
      result: null,
    });
  }

  const combat: Combat = {
    enemyId: enemy.id,
    playerId: starter.id,
    allies: teamIds.slice(1),
    trials,
    at: 0,
    hintsLeft: noHints(fighter, ground) ? 0 : hintsFor(team),
    skillsUsed: [],
    from,
    spoils: [],
    picksLeft: 0,
    outcome: "ongoing",
  };
  // Found is permanent: the party paid a turn for that information.
  next = {
    ...next,
    challengeDeck: deck,
    rngState: seed,
    enemies: next.enemies.map((e) => (e.id === enemy.id ? { ...e, found: true } : e)),
  };
  next = note(
    { ...next, phase: "combat", combat },
    `${starter.name}${team.length > 1 ? ` and ${team.length - 1} more` : ""} met ${nameWithArticle(
      enemy.kind,
    )}. ${profile.cards === 1 ? "One card." : `${profile.cards} cards, and they have to win all of them.`}`,
  );

  return openingBite(next, fighter);
}

/** §9, railway: it takes a health before the first card is even turned over. */
function openingBite(state: GameState, enemy: Enemy): GameState {
  const ground = state.tiles[key(enemy.hex)];
  if (!activeFeatures(enemy, ground).includes("railway")) return state;
  return hurt(state, 1, `The ${ENEMIES[enemy.kind].name} caught someone on the tracks.`);
}

/**
 * Take health off the team.
 *
 * The knight wears it alone if they can (`whoTakesTheHit`). Nobody falls out of the
 * fight and nobody falls out of the game: a player on zero keeps playing every
 * mini-game and loses only the button with their name on it.
 */
function hurt(state: GameState, amount: number, why: string): GameState {
  const combat = state.combat;
  const team = fighters(state);
  if (!combat || team.length === 0 || amount <= 0) return state;

  const hero = whoTakesTheHit(team, amount);
  const paying = hero ? [hero] : team;
  const lost = new Set(paying.map((p) => p.id));

  let next: GameState = {
    ...state,
    players: state.players.map((p) =>
      lost.has(p.id) ? { ...p, health: Math.max(0, p.health - amount) } : p,
    ),
  };
  next = note(next, why);
  if (hero) {
    next = note(next, `${hero.name} wore it. Nobody else lost anything.`);
  }
  for (const p of paying) {
    const now = next.players.find((q) => q.id === p.id)!;
    if (now.health === 0 && p.health > 0) {
      next = note(next, `${now.name} is out of health, and out of ${SKILLS[now.role].title}. They are still playing.`);
    }
  }
  return next;
}

/* ------------------------------------------------------------- the mini-game */

/** The card being played right now, and the game it asks for. */
export function nowPlaying(
  state: GameState,
): { trial: Trial; challenge: Challenge; index: number; of: number } | null {
  const combat = state.combat;
  if (!combat || combat.outcome !== "ongoing") return null;
  const trial = combat.trials[combat.at];
  if (!trial) return null;
  return {
    trial,
    challenge: challengeFor(trial.card),
    index: combat.at + 1,
    of: combat.trials.length,
  };
}

const withTrial = (combat: Combat, at: number, patch: Partial<Trial>): Combat => ({
  ...combat,
  trials: combat.trials.map((t, i) => (i === at ? { ...t, ...patch } : t)),
});

/**
 * The table says they did it.
 *
 * **Only the table can say this.** No machine can tell whether a drawing looked enough
 * like a dragon, and one that tried would be wrong in front of a child - so the button
 * is the whole adjudication system and it is meant to be.
 */
export function wonTrial(state: GameState): GameState {
  const combat = state.combat;
  const enemy = state.enemies.find((e) => e.id === combat?.enemyId);
  if (!combat || !enemy || combat.outcome !== "ongoing") return state;

  const done = withTrial(combat, combat.at, { result: "won" });
  const more = combat.at + 1 < combat.trials.length;
  let next = note(
    { ...state, combat: { ...done, at: combat.at + 1 } },
    more
      ? `They did it. ${combat.trials.length - combat.at - 1} to go.`
      : `They did it.`,
  );
  if (more) return next;

  const ground = next.tiles[key(enemy.hex)];
  const slipsAway =
    !enemy.escapedOnce && activeFeatures(enemy, ground).includes("water") && ground?.river === true;
  return slipsAway ? escapeDownriver(next, enemy) : beaten(next, enemy);
}

/**
 * The clock beat them, or the table says it was not close enough.
 *
 * One card is the whole fight. There is no partial credit and nothing to come back to,
 * which is what keeps a fight to a few minutes and keeps a monster worth thinking twice
 * about - but it is also why losing one costs a single health and never a player.
 */
export function lostTrial(state: GameState): GameState {
  const combat = state.combat;
  const enemy = state.enemies.find((e) => e.id === combat?.enemyId);
  if (!combat || !enemy || combat.outcome !== "ongoing") return state;

  const ground = state.tiles[key(enemy.hex)];
  const cost = FAILED_FIGHT_COST + extraToll(enemy, ground);
  const beatenBy = ENEMIES[enemy.kind].name;

  let next: GameState = {
    ...state,
    combat: { ...withTrial(combat, combat.at, { result: "lost" }), outcome: "partyBeaten" },
  };
  next = hurt(next, cost, `Out of time. The ${beatenBy} got the better of them.`);
  return note(next, `${beatenBy} ${verb(enemy.kind, "is", "are")} still there. They can try again.`);
}

/** Read the hint on the card in play. Costs one of the team's hints. */
export function useHint(state: GameState): GameState {
  const combat = state.combat;
  const playing = nowPlaying(state);
  if (!combat || !playing || playing.trial.hinted || combat.hintsLeft <= 0) return state;
  return note(
    { ...state, combat: { ...withTrial(combat, combat.at, { hinted: true }), hintsLeft: combat.hintsLeft - 1 } },
    `A hint, off somebody's boots.`,
  );
}

/**
 * Whether a player's skill is pressable right now.
 *
 * Every reason it might not be: the fight is over, they have spent it this fight, they
 * are out of health, or the thing it does has nothing to do here - a peek at a hint
 * already read, a re-cast on the last card of a fight nobody is going to survive
 * anyway. Each of those is a greyed-out button with a reason, never a button that does
 * nothing.
 */
export function canUseSkill(state: GameState, player: Player): boolean {
  const combat = state.combat;
  const playing = nowPlaying(state);
  if (!combat || !playing || !hasSkill(player) || spentSkill(combat, player)) return false;
  if (!fighters(state).some((f) => f.id === player.id)) return false;

  switch (SKILLS[player.role].kind) {
    case "peek":
      return !playing.trial.hinted;
    case "patch":
      return fighters(state).some((f) => f.id !== player.id && f.health < maxHealthOf(f));
    case "linger":
    case "recast":
      return true;
    // The knight's is not a button. It fires on its own, in `hurt`.
    default:
      return false;
  }
}

/** Press a skill. `toId` is only read by the doctor's. */
export function useSkill(state: GameState, playerId: string, toId?: string): GameState {
  const combat = state.combat;
  const player = state.players.find((p) => p.id === playerId);
  const playing = nowPlaying(state);
  if (!combat || !player || !playing || !canUseSkill(state, player)) return state;

  const spend = (s: GameState): GameState => ({
    ...s,
    combat: { ...s.combat!, skillsUsed: [...s.combat!.skillsUsed, playerId] },
  });
  const skill = SKILLS[player.role];

  switch (skill.kind) {
    case "peek":
      return note(
        spend({ ...state, combat: withTrial(combat, combat.at, { hinted: true }) }),
        `${player.name} peeked. ${skill.title} is spent.`,
      );

    case "linger":
      return note(
        spend({
          ...state,
          combat: withTrial(combat, combat.at, {
            seconds: playing.trial.seconds + LINGER_SECONDS,
          }),
        }),
        `${player.name} bought the team ${LINGER_SECONDS} more seconds.`,
      );

    case "patch": {
      const hurtFriend =
        fighters(state).find((f) => f.id === toId && f.id !== playerId) ??
        fighters(state).find((f) => f.id !== playerId && f.health < maxHealthOf(f));
      if (!hurtFriend) return state;
      const before = hurtFriend.health;
      let next = spend({
        ...state,
        players: state.players.map((p) =>
          p.id === hurtFriend.id
            ? { ...p, health: Math.min(maxHealthOf(p), p.health + 1) }
            : p,
        ),
      });
      next = note(next, `${player.name} patched ${hurtFriend.name} up.`);
      return before === 0
        ? note(next, `${hurtFriend.name} has ${SKILLS[hurtFriend.role].title} back.`)
        : next;
    }

    case "recast": {
      const pull = drawCard(state.challengeDeck, state.rngState);
      const team = fighters(state);
      const enemy = state.enemies.find((e) => e.id === combat.enemyId);
      const ground = enemy ? state.tiles[key(enemy.hex)] : undefined;
      const shorter = enemy ? activeFeatures(enemy, ground).includes("forest") : false;
      return note(
        spend({
          ...state,
          challengeDeck: pull.deck,
          rngState: pull.rngState,
          combat: withTrial(combat, combat.at, {
            card: pull.card,
            seconds: secondsFor(challengeFor(pull.card), team, shorter),
            hinted: false,
          }),
        }),
        `${player.name} threw that one back.`,
      );
    }

    default:
      return state;
  }
}

/* --------------------------------------------------------------------- loot */

/**
 * Beaten. Rulebook §10: it drops a fixed number of items and the winner keeps some of
 * them; the rest go back in the pile. Money is not dropped - selling what you keep is
 * how the party gets paid.
 */
/**
 * How often a beaten monster is carrying something to eat.
 *
 * Half. Monsters have to eat too, and it gives a fight a small consolation on the
 * rounds where the item pile hands over nothing anybody wants - which, late on, is
 * most of them. Food never competes with gear, so this cannot unbalance §10.
 */
export const SUPPLY_DROP_CHANCE = 0.5;

function beaten(state: GameState, enemy: Enemy): GameState {
  const profile = ENEMIES[enemy.kind];
  // Roll each drop for condition before it hits the ground. Mid bosses and the dragon
  // are the only way to a +2 outside a river chest, so this roll is the progression.
  const conditionRng = makeRng(state.rngState);
  const drops = state.itemPile
    .slice(0, profile.drops)
    .map((item) => (conditionRng.next() < profile.fineChance ? makeFine(item) : item));
  const rest = state.itemPile.slice(profile.drops);
  // A thief drops what it stole on top of its own haul.
  const stolen = state.enemies.find((e) => e.id === enemy.id)?.loot ?? [];

  // Something in its pockets, half the time.
  const rations: Item[] =
    conditionRng.next() < SUPPLY_DROP_CHANCE
      ? [randomFood(conditionRng, `pocket-${enemy.id}`)]
      : [];

  const spoils: Item[] = [...stolen, ...drops, ...rations];

  // Rulebook §10 says how much the winner keeps. The rogue keeps one more: they go
  // through the pockets while everybody else is catching their breath, which is the
  // same character as "hits harder" pointed at the aftermath instead of the fight.
  const winner = state.players.find((p) => p.id === state.combat!.playerId);
  const robbing = winner !== undefined && ROLES[winner.role].robsTheBody;
  const keeps = Math.min(profile.picks + (robbing ? 1 : 0), spoils.length);

  let next: GameState = {
    ...state,
    rngState: conditionRng.state(),
    itemPile: rest,
    enemies: state.enemies.map((e) =>
      e.id === enemy.id ? { ...e, defeated: true, loot: [] } : e,
    ),
    combat: {
      ...state.combat!,
      outcome: "enemyDefeated",
      spoils,
      picksLeft: keeps,
    },
  };
  if (profile.purse > 0 && winner) {
    // Everybody who swung gets the purse. Splitting $1 five ways is four people
    // getting nothing and one argument; paying each of them is legible, and the
    // amounts are small enough (all under `GEAR_PRICE`) that it stays scarce.
    const paid = fighters(state);
    next = {
      ...next,
      players: next.players.map((p) =>
        paid.some((f) => f.id === p.id) ? { ...p, money: p.money + profile.purse } : p,
      ),
    };
    next = note(
      next,
      paid.length === 1
        ? `${winner.name} took $${profile.purse} off the body.`
        : `$${profile.purse} each off the body, for all ${paid.length} of them.`,
    );
  }
  // Everything a thief has taken off the party goes back, in one lump, to whoever
  // brought them down. `Hazard.carrying` is where `payOff` puts it, and until v0.25
  // it went nowhere: the gear came back and the coins quietly left the game. "Catch
  // them to get it back" is the whole reason chasing one is worth a turn.
  const purse = state.hazards.find((h) => h.kind === enemy.kind)?.carrying ?? 0;
  if (purse > 0 && winner) {
    const paid = fighters(state);
    const each = Math.floor(purse / paid.length);
    const odd = purse - each * paid.length;
    next = {
      ...next,
      hazards: next.hazards.map((h) => (h.kind === enemy.kind ? { ...h, carrying: 0 } : h)),
      players: next.players.map((p) => {
        const place = paid.findIndex((f) => f.id === p.id);
        if (place < 0) return p;
        // The odd dollars go to whoever picked the fight - a split that leaves change
        // is an argument, and the rulebook already gives the starter the picks.
        return { ...p, money: p.money + each + (p.id === winner.id ? odd : 0) };
      }),
    };
    next = note(
      next,
      paid.length === 1
        ? `${winner.name} got back the $${purse} ${verb(enemy.kind, "it was", "they were")} carrying.`
        : `The $${purse} ${verb(enemy.kind, "it had", "they had")} taken went back to the party.`,
    );
  }
  if (robbing && winner) {
    next = note(next, `${winner.name} went through its pockets as well. One extra thing to keep.`);
  }
  next = note(next, `${profile.name} ${verb(enemy.kind, "is", "are")} beaten!`);

  // Rulebook §14: the dragon is the game.
  if (enemy.kind === "finalboss") {
    next = note({ ...next, ending: "victory" }, "The dragon is dead. The party has won.");
  }
  return next;
}

/** Rulebook §9, water: beaten on a river tile, it slips away to another one. Once. */
function escapeDownriver(state: GameState, enemy: Enemy): GameState {
  const rng = makeRng(state.rngState);
  const river = neighbours(enemy.hex).filter((h) => state.tiles[key(h)]?.river);
  const bolthole = river.length > 0 ? rng.pick(river) : rng.pick(neighbours(enemy.hex));
  const profile = ENEMIES[enemy.kind];

  return note(
    {
      ...state,
      rngState: rng.state(),
      enemies: state.enemies.map((e) =>
        e.id === enemy.id
          ? { ...e, damageTaken: 0, escapedOnce: true, hex: bolthole, defeated: false }
          : e,
      ),
      combat: { ...state.combat!, outcome: "enemyEscaped" },
    },
    `The ${profile.name} went into the water and surfaced somewhere downriver, whole again. ${verb(
      enemy.kind,
      "It will",
      "They will",
    )} not get away twice.`,
  );
}

/** Take one of the things on the ground, up to what the rulebook lets you keep. */
/**
 * Take one of the picks - for yourself, or for anybody who fought beside you.
 *
 * Rulebook §10, in as many words: "the starting player may keep their picks or give
 * them to any player in the fight." That is the whole of loot distribution, and it is
 * deliberately the *starter's* call rather than a vote: five children negotiating a
 * dragon's hoard is not a mechanic, it is an evening.
 *
 * `toId` defaults to the starter, so every existing caller keeps working and the solo
 * case reads exactly as it did.
 */
export function takeSpoil(state: GameState, itemId: string, toId?: string): GameState {
  const combat = state.combat;
  if (!combat || combat.picksLeft <= 0) return state;

  const item = combat.spoils.find((i) => i.id === itemId);
  // Only somebody who was actually in the fight. A friend two tiles away does not get
  // a share for watching.
  const player = fighters(state).find((p) => p.id === (toId ?? combat.playerId));
  if (!item || !player) return state;

  if (!canTake(player, item)) return state;

  const { player: carrying, returned } = equip(player, item);
  let next: GameState = {
    ...state,
    itemPile: returned ? [...state.itemPile, returned] : state.itemPile,
    players: state.players.map((p) =>
      p.id === player.id ? withHealthCap(carrying) : p,
    ),
    combat: {
      ...combat,
      spoils: combat.spoils.filter((i) => i.id !== item.id),
      picksLeft: combat.picksLeft - 1,
    },
  };
  next = note(
    next,
    player.id === combat.playerId
      ? `${player.name} kept the ${item.name}.`
      : `${player.name} was handed the ${item.name}.`,
  );
  return returned ? note(next, `${returned.name} went back to the pile.`) : next;
}

/** Anything not picked goes back to the pile, per §10. */
export function discardSpoils(state: GameState): GameState {
  const combat = state.combat;
  if (!combat || combat.spoils.length === 0) return state;
  return {
    ...state,
    itemPile: [...state.itemPile, ...combat.spoils],
    combat: { ...combat, spoils: [], picksLeft: 0 },
  };
}

/**
 * Close the fight and hand the state back to the turn machine.
 *
 * On the last turn this is also where the evening ends. The final stand is the whole
 * of turn 8 (`finalStand`), so once the table has looked at what came of it there is
 * nothing left to play - and a half-turn of walking about after the dragon fight would
 * be the worst possible note to finish on.
 */
export function endCombat(state: GameState): GameState {
  if (!state.combat) return state;
  const settled: GameState = { ...discardSpoils(state), combat: null, phase: "playerMove" };
  if (settled.ending || settled.turn < settled.turnLimit) return settled;

  const dragon = settled.enemies.find((e) => e.kind === "finalboss");
  if (!dragon || dragon.defeated) return settled;
  return note(
    { ...settled, phase: "gameOver", ending: "outOfTime" },
    `The ${ENEMIES.finalboss.name} keeps the map. That was the last turn - closer next time.`,
  );
}

/* ------------------------------------------------------------------ helpers */

const withHealthCap = (player: Player): Player => {
  const maxHealth = maxHealthOf(player);
  return { ...player, maxHealth, health: Math.min(player.health, maxHealth) };
};
