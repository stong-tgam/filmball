/**
 * Fighting. Rulebook §7 and §9.
 *
 * Roll three dice, add your attack, and compare the total to what the enemy has left.
 *
 * - **Damage ≥ remaining health** → beaten, and it drops its loot.
 * - **Damage < remaining health** → the damage sticks, and you lose 1 health.
 * - **Exact tie** → nothing at all happens, and you go back where you started.
 *
 * Then roll again or walk away. Damage stays on a wounded enemy either way, which is
 * the rule that makes the health numbers work: nothing has to die in one turn.
 *
 * Losing a roll costs exactly one health, never a dice roll's worth. On three health
 * that is the difference between a game a child can read and one they cannot.
 */

import { ENEMIES, healthLeft, nameWithArticle, verb } from "./enemies";
import { distance, key, neighbours, type Hex } from "./hex";
import { standing } from "./collapse";
import { makeRng } from "./rng";
import { canTake, equip, makeFine, randomFood } from "./items";
import { ROLES, maxHealthOf, moveRange } from "./players";
import type { Combat, Enemy, Feature, GameState, Item, LogEntry, Player, Roll, Tile } from "./types";

/** Rulebook §2: three faces of 1, two of 2, one of 3. Average 1.67 a die. */
export const DIE_FACES = [1, 1, 1, 2, 2, 3] as const;

/** Dice you roll before any bonus. */
export const BASE_DICE = 3;

/** A failed roll costs this much health, before any boss feature adds to it. */
export const FAILED_ROLL_COST = 1;

export const ALL_FEATURES: Feature[] = ["water", "railway", "city", "forest", "field"];

const note = (state: GameState, text: string): GameState => ({
  ...state,
  log: [...state.log, { turn: state.turn, text } satisfies LogEntry],
});

const total = (dice: number[]): number => dice.reduce((sum, d) => sum + d, 0);

/** Roll `count` dice, returning the faces and the state the generator ended on. */
export function rollDice(rngState: number, count: number): { dice: number[]; rngState: number } {
  const rng = makeRng(rngState);
  const dice = Array.from({ length: count }, () => rng.pick(DIE_FACES));
  return { dice, rngState: rng.state() };
}

/**
 * Everybody swinging, starter first.
 *
 * The starter is not special in a roll - §8 totals every participant's dice together -
 * but they are special afterwards, because §10 gives them the picks. Keeping them at
 * the head of the list is what makes both true at once.
 */
export function fighters(state: GameState): Player[] {
  if (!state.combat) return [];
  const ids = [state.combat.playerId, ...state.combat.allies];
  return ids
    .map((id) => state.players.find((p) => p.id === id))
    .filter((p): p is Player => p !== undefined && !p.dead);
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

/**
 * Rulebook §9, field: the boss hits harder in the open.
 *
 * §9 says "+1 to the toll per player in the fight", which with one player is +1 and
 * has only ever been read that way. With a group it splits two ways: +1 to *each* of
 * them, or +N to each. The second is a party wipe on one bad roll - five players, six
 * health gone each - so this build takes the first. A §15-style choice, made here.
 */
export const extraToll = (enemy: Enemy, tile: Tile | undefined): number =>
  activeFeatures(enemy, tile).includes("field") ? 1 : 0;

/** Rulebook §9, forest: everybody in the fight loses a point of attack. */
export const attackPenalty = (enemy: Enemy, tile: Tile | undefined): number =>
  activeFeatures(enemy, tile).includes("forest") ? 1 : 0;

/* ------------------------------------------------------------------- attack */

/** Rulebook §3 and §12: the role's own arm, plus a weapon, less any forest penalty. */
export function attackValue(player: Player, enemy?: Enemy, tile?: Tile): number {
  const base = (player.weapon?.value ?? 0) + roleAttack(player);
  const penalty = enemy ? attackPenalty(enemy, tile) : 0;
  return Math.max(0, base - penalty);
}

const roleAttack = (player: Player): number =>
  player.role === "rogue" ? 1 : 0;

/* -------------------------------------------------------------- the encounter */

/**
 * Meeting something. Features are drawn here, before the first roll - rulebook §9 is
 * explicit that they are known before the encounter, so the party can decide whether
 * to take the fight at all.
 *
 * Two of them bite the moment the fight opens: railway costs a health, and city costs
 * a dollar on a city tile or a health anywhere else.
 */
export function startCombat(
  state: GameState,
  enemy: Enemy,
  from: string,
  /** True when the player walked onto a hidden monster rather than picking the fight. */
  ambush = false,
): GameState {
  const player = state.players[state.activePlayerIndex];
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

  const combat: Combat = {
    enemyId: enemy.id,
    playerId: player.id,
    allies: [],
    support: [],
    from,
    round: 0,
    playerRoll: null,
    toll: 0,
    spoils: [],
    picksLeft: 0,
    ambush,
    outcome: "ongoing",
  };
  // Found is permanent. Back away from an ambush and the monster stays on the board
  // for everyone who can see that tile - the party paid a turn for that information.
  next = {
    ...next,
    enemies: next.enemies.map((e) => (e.id === enemy.id ? { ...e, found: true } : e)),
  };
  next = note(
    { ...next, phase: "combat", combat },
    `${player.name} met ${nameWithArticle(enemy.kind)}.`,
  );

  return openingBite(next, fighter);
}

/** Railway and city both take something the moment the fight starts. */
function openingBite(state: GameState, enemy: Enemy): GameState {
  const ground = state.tiles[key(enemy.hex)];
  const active = activeFeatures(enemy, ground);
  const profile = ENEMIES[enemy.kind];
  let next = state;

  if (active.includes("railway")) {
    next = hurt(next, FAILED_ROLL_COST, `The ${profile.name} caught someone on the tracks.`);
  }
  if (active.includes("city")) {
    const player = next.players.find((p) => p.id === next.combat?.playerId);
    if (player && ground?.sides.includes("city")) {
      next = note(
        {
          ...next,
          players: next.players.map((p) =>
            p.id === player.id ? { ...p, money: Math.max(0, p.money - 1) } : p,
          ),
        },
        `Fighting in the streets costs ${player.name} $1.`,
      );
    } else {
      next = hurt(next, 1, `The ${profile.name} fights dirty out here.`);
    }
  }
  return next;
}

/**
 * Take health off **everybody in the fight**. Rulebook §8: all participants lose 1
 * health on a failed roll, which is the price of all their dice counting.
 *
 * Anybody who runs out falls where they stand and drops out of the fight. If the
 * *starter* falls with friends still up, the fight carries on and the next one along
 * takes over as starter — the party is standing right there, and ending the fight
 * because one of them went down would be the app overruling the table. The picks go
 * with the job, per §10.
 */
function hurt(state: GameState, amount: number, why: string): GameState {
  const combat = state.combat;
  const hit = fighters(state);
  if (!combat || hit.length === 0 || amount <= 0) return state;

  const fallen = new Set<string>();

  let next: GameState = {
    ...state,
    players: state.players.map((p) => {
      if (!hit.some((f) => f.id === p.id)) return p;
      const health = Math.max(0, p.health - amount);
      if (health === 0) fallen.add(p.id);
      return {
        ...p,
        health,
        dead: health === 0,
        fellAt: health === 0 ? p.hex : p.fellAt,
        fellOn: health === 0 ? state.turn : p.fellOn,
      };
    }),
    combat: { ...combat, toll: amount },
  };

  const standing = hit.filter((f) => !fallen.has(f.id));
  next = note(
    next,
    hit.length === 1
      ? `${why} ${hit[0].name} is down to ${next.players.find((p) => p.id === hit[0].id)!.health} health.`
      : `${why} ${amount} health off each of ${hit.map((f) => f.name).join(", ")}.`,
  );
  for (const id of fallen) {
    next = note(next, `${state.players.find((p) => p.id === id)!.name} has fallen.`);
  }

  if (standing.length === 0) {
    return { ...next, combat: { ...next.combat!, outcome: "playerDown" } };
  }

  // Drop the fallen out, and hand the fight to whoever is still up if the starter
  // is not among them.
  const stillIn = standing.map((f) => f.id);
  return {
    ...next,
    combat: {
      ...next.combat!,
      playerId: stillIn[0],
      allies: stillIn.slice(1),
      outcome: next.combat!.outcome,
    },
  };
}


/* ------------------------------------------------------------- group fights */

/**
 * Rulebook §8's balance guard: **only the big ones**.
 *
 * Mobs stay solo. Without this the whole party clusters on every bandit, steamrolls
 * it, and turn order stops meaning anything - which the rulebook says in as many
 * words. The thieves fight as mid bosses (§5.5) and count as big.
 */
export const invitable = (enemy: Enemy): boolean => enemy.kind !== "mob";

/**
 * Who the starter can shout to.
 *
 * §8 says "within their movement range", so it is the *starter's* legs that decide
 * how far the shout carries - a scout who picks a fight can pull somebody in from two
 * tiles away, and that is a second reason to send the scout first.
 *
 * A player joins at most one fight per turn cycle (`joinedFightThisRound`, cleared
 * when the turn rolls over), which is §8's other guard: without it the same friend
 * can be dragged into all five fights of a round.
 */
export function inviteTargets(state: GameState): Player[] {
  const combat = state.combat;
  if (!combat || combat.outcome !== "ongoing") return [];
  const enemy = state.enemies.find((e) => e.id === combat.enemyId);
  const starter = state.players.find((p) => p.id === combat.playerId);
  if (!enemy || !starter || !invitable(enemy)) return [];

  const reach = moveRange(starter);
  const already = new Set([combat.playerId, ...combat.allies]);
  return state.players.filter(
    (p) =>
      !already.has(p.id) &&
      !p.dead &&
      !p.joinedFightThisRound &&
      distance(p.hex, enemy.hex) <= reach,
  );
}

export const canInvite = (state: GameState): boolean => inviteTargets(state).length > 0;

/**
 * Pull somebody into the fight. §8: they move onto the tile and roll, and it does
 * **not** spend their turn - so a player who has already had their go can still be
 * shouted for, and one who has not still gets their own turn afterwards.
 */
export function invite(state: GameState, playerId: string): GameState {
  const combat = state.combat;
  if (!combat) return state;
  const joining = inviteTargets(state).find((p) => p.id === playerId);
  const enemy = state.enemies.find((e) => e.id === combat.enemyId);
  if (!joining || !enemy) return state;

  const next: GameState = {
    ...state,
    players: state.players.map((p) =>
      p.id === joining.id ? { ...p, hex: enemy.hex, joinedFightThisRound: true } : p,
    ),
    combat: { ...combat, allies: [...combat.allies, joining.id] },
  };
  return note(next, `${joining.name} ran in to help. Their turn is still their own.`);
}

/**
 * A fighter choosing to do something other than swing.
 *
 * Only the doctor has one so far, and it is the obvious one: with everybody in the
 * fight losing a health per failed roll, a group fight is exactly where a doctor is
 * worth more than three dice. It costs them their dice for the round, which is the
 * trade — heal or hit, not both.
 */
export function supportOptions(state: GameState, who: Player): Player[] {
  const combat = state.combat;
  if (!combat || combat.outcome !== "ongoing") return [];
  if (!ROLES[who.role].canHeal) return [];
  if (combat.support.some((s) => s.by === who.id)) return [];
  return fighters(state).filter((f) => f.health < f.maxHealth);
}

/** Commit to patching somebody up this round instead of rolling. */
export function pledgeSupport(state: GameState, byId: string, toId: string): GameState {
  const combat = state.combat;
  if (!combat) return state;
  const healer = fighters(state).find((p) => p.id === byId);
  if (!healer || supportOptions(state, healer).every((p) => p.id !== toId)) return state;
  const target = state.players.find((p) => p.id === toId)!;

  return note(
    { ...state, combat: { ...combat, support: [...combat.support, { by: byId, kind: "heal", to: toId }] } },
    `${healer.name} is patching ${target.name} up instead of swinging.`,
  );
}

/** Undo it before the dice go, in case the table changes its mind. */
export function withdrawSupport(state: GameState, byId: string): GameState {
  const combat = state.combat;
  if (!combat) return state;
  return {
    ...combat.support.some((s) => s.by === byId)
      ? note(
          { ...state, combat: { ...combat, support: combat.support.filter((s) => s.by !== byId) } },
          `${state.players.find((p) => p.id === byId)?.name ?? "Somebody"} picked their weapon back up.`,
        )
      : state,
  };
}

/* ---------------------------------------------------------------- one round */

/** One roll of the dice, and what it does. */

/**
 * One exchange.
 */
export function attack(state: GameState): GameState {
  const pair = combatants(state);
  if (!state.combat || state.combat.outcome !== "ongoing" || !pair) return state;
  const { player, enemy } = pair;

  const ground = state.tiles[key(enemy.hex)];
  const party = fighters(state);

  // Anybody patching somebody up does it now, and takes no part in the roll. Their
  // dice are the price - heal or hit, never both.
  const combat = state.combat;
  let state2 = state;
  const medics = new Set(combat.support.map((s) => s.by));
  for (const pledge of combat.support) {
    const healer = state2.players.find((p) => p.id === pledge.by);
    const target = state2.players.find((p) => p.id === pledge.to);
    if (!healer || !target || target.health >= target.maxHealth) continue;
    state2 = note(
      {
        ...state2,
        players: state2.players.map((p) =>
          p.id === target.id ? { ...p, health: Math.min(p.maxHealth, p.health + 1) } : p,
        ),
      },
      `${healer.name} patched ${target.name} up mid-fight.`,
    );
  }
  state = state2;
  const swinging = party.filter((p) => !medics.has(p.id));

  // Rulebook §8: every participant rolls and the whole lot is totalled together. One
  // number against the monster's remaining health, not a turn each - which is what
  // makes five people meaningfully better than one against thirty health.
  let rngState = state.rngState;

  const throwEverybody = (from: number) => {
    let seed = from;
    const dice: number[] = [];
    const said: string[] = [];
    let dealt = 0;
    for (const who of swinging) {
      const swing = rollDice(seed, BASE_DICE + who.bonusDiceNextFight);
      seed = swing.rngState;
      const bonus = attackValue(who, enemy, ground);
      dice.push(...swing.dice);
      dealt += total(swing.dice) + bonus;
      said.push(`${who.name} ${swing.dice.join("+")}${bonus > 0 ? ` +${bonus}` : ""}`);
    }
    return { dice, said, dealt, rngState: seed };
  };

  const first = throwEverybody(rngState);
  const { dice, said, dealt } = first;
  rngState = first.rngState;

  const playerRoll: Roll = { dice, damage: dealt };
  const remaining = healthLeft(enemy);
  const inFight = new Set(party.map((p) => p.id));

  let next: GameState = {
    ...state,
    rngState,
    // The donated die is spent whether or not it helped.
    players: state.players.map((p) =>
      inFight.has(p.id) ? { ...p, bonusDiceNextFight: 0 } : p,
    ),
    combat: {
      ...combat,
      round: combat.round + 1,
      playerRoll,
      toll: 0,
      support: [],
    },
  };
  next = note(
    next,
    swinging.length === 1
      ? `${player.name} rolled ${dice.join("+")} for ${dealt}.`
      : `${said.join(", ")} — ${dealt} between them.`,
  );
  // Rulebook §7: an exact tie does nothing at all, and you go back where you started.
  if (dealt === remaining) return standoff(next, enemy);

  if (dealt > remaining) {
    const finished: GameState = {
      ...next,
      enemies: next.enemies.map((e) =>
        e.id === enemy.id ? { ...e, damageTaken: e.maxHealth } : e,
      ),
    };
    const slipsAway =
      !enemy.escapedOnce && activeFeatures(enemy, ground).includes("water") && ground?.river === true;
    return slipsAway ? escapeDownriver(finished, enemy) : beaten(finished, enemy);
  }

  // Short of it: the damage sticks and it costs a health.
  const wounded: GameState = {
    ...next,
    enemies: next.enemies.map((e) =>
      e.id === enemy.id ? { ...e, damageTaken: e.damageTaken + dealt } : e,
    ),
  };
  const toll = FAILED_ROLL_COST + extraToll(enemy, ground);
  return hurt(
    wounded,
    toll,
    `Not enough — the ${ENEMIES[enemy.kind].name} has ${remaining - dealt} left.`,
  );
}

/**
 * The tile a fight is backed out of, which is the one it was walked in from - unless
 * that ground has since fallen into the abyss (`collapse.ts`), in which case there is
 * no back and you stay where you are. Retreating onto a tile that no longer exists
 * would put a player outside the board with the rim already past them.
 */
function wayBack(state: GameState, player: Player): Hex {
  const from = state.tiles[state.combat?.from ?? ""]?.hex;
  return from && standing(state, from) ? from : player.hex;
}

/** Rulebook §7: an exact tie. Nothing happens; you are back where you started. */
function standoff(state: GameState, enemy: Enemy): GameState {
  const starter = state.players.find((p) => p.id === state.combat!.playerId);
  const home = starter ? wayBack(state, starter) : undefined;
  return note(
    {
      ...state,
      players: home
        ? state.players.map((p) =>
            p.id === state.combat!.playerId ? { ...p, hex: home } : p,
          )
        : state.players,
      combat: { ...state.combat!, outcome: "standoff" },
    },
    `Dead even against the ${ENEMIES[enemy.kind].name}. Nothing doing — back where they started.`,
  );
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

/* ------------------------------------------------------------------ leaving */

/** Rulebook §7: escaping costs your turn, and the wounds you dealt stay dealt. */
/**
 * How likely you are to get away, and why movement decides it.
 *
 * Running is the one thing boots should obviously be for. A player on one tile a turn
 * is slow and mostly has to see the fight through; a Scout in Roller Skates almost
 * always gets out. It is capped short of certain so that running is a gamble rather
 * than a free undo - `ESCAPE_CAP` is the number to move if fights start feeling
 * inescapable at the table.
 *
 * An ambush is easier than a fight you picked: you have not closed with it yet, you
 * are one step from where you came from, and walking into a hidden monster was not a
 * decision you got to make.
 */
export const ESCAPE_BASE = 0.4;
export const ESCAPE_PER_TILE = 0.2;
export const ESCAPE_AMBUSH_BONUS = 0.25;
export const ESCAPE_CAP = 0.9;

export function escapeChance(player: Player, ambush: boolean): number {
  const speed = moveRange(player);
  const chance = ESCAPE_BASE + ESCAPE_PER_TILE * (speed - 1) + (ambush ? ESCAPE_AMBUSH_BONUS : 0);
  return Math.min(ESCAPE_CAP, chance);
}

export function flee(state: GameState): GameState {
  const pair = combatants(state);
  if (!state.combat || state.combat.outcome !== "ongoing" || !pair) return state;
  const { player, enemy } = pair;

  const combat = state.combat;
  const home = wayBack(state, player);
  // Walking into a hidden monster is not a decision, so backing straight out of one
  // costs no action: only the move already spent. Once you have swung at it you have
  // chosen the fight, and leaving costs your action as usual.
  const freeLook = combat.ambush && combat.round === 0;

  // Getting away is not automatic any more. Fail it and you are still in the fight -
  // no health lost for trying, because a failed escape that also hurt would make
  // running strictly worse than swinging and nobody would ever do it.
  const rng = makeRng(state.rngState);
  const odds = escapeChance(player, freeLook);
  if (rng.next() >= odds) {
    return note(
      { ...state, rngState: rng.state() },
      `${player.name} tried to slip away and could not. The ${ENEMIES[enemy.kind].name} ${verb(
        enemy.kind,
        "is between them and the way back",
        "are between them and the way back",
      )}.`,
    );
  }
  let away: GameState = {
    ...state,
    rngState: rng.state(),
    combat,
  };

  if (freeLook) {
    return note(
      {
        ...away,
        players: away.players.map((p) =>
          p.id === player.id ? { ...p, hex: home, actedThisTurn: false } : p,
        ),
        combat: { ...away.combat!, outcome: "playerEscaped" },
      },
      `${player.name} found ${nameWithArticle(enemy.kind)} and backed straight out again.`,
    );
  }

  return note(
    {
      ...away,
      players: away.players.map((p) =>
        p.id === player.id ? { ...p, hex: home, actedThisTurn: true } : p,
      ),
      combat: { ...away.combat!, outcome: "playerEscaped" },
    },
    `${player.name} backed off. The ${ENEMIES[enemy.kind].name} ${verb(
      enemy.kind,
      "keeps its",
      "keep their",
    )} wounds.`,
  );
}

/** Close the fight and hand the state back to the turn machine. */
export function endCombat(state: GameState): GameState {
  if (!state.combat) return state;
  return { ...discardSpoils(state), combat: null, phase: "playerMove" };
}

/* ------------------------------------------------------------------ helpers */

const withHealthCap = (player: Player): Player => {
  const maxHealth = maxHealthOf(player);
  return { ...player, maxHealth, health: Math.min(player.health, maxHealth) };
};
