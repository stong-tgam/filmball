/**
 * Teams, the mini-game they play, and §10's loot.
 *
 * This replaced §8's invitation system in v0.31, and the reason is the same one that
 * replaced the dice: **the team is the group fight**. Everybody standing on the tile is
 * about to shout guesses at whoever is drawing, so there is nobody left to invite.
 */

import { describe, expect, it } from "vitest";
import {
  HINTS_A_FIGHT,
  canHoldTheLine,
  canUseGear,
  answerTrial,
  canUseSkill,
  fighters,
  nowPlaying,
  hintsFor,
  holdTheLine,
  lostTrial,
  secondsFor,
  takeSpoil,
  useGear,
  useHint,
  useSkill,
} from "../src/game/combat";
import { GEAR_RULES, gearBlurb, ruleFor, rulePlaysOn, usesOf } from "../src/game/gear";
import { allChallenges, challengeFor, poolSize } from "../src/game/challenges";
import { HOLD_THE_LINE_COST, LINGER_SECONDS, SKILLS, hasSkill, whoTakesTheHit } from "../src/game/skills";
import { createTeams, teamSizes } from "../src/game/teams";
import { createInitialState } from "../src/game/setup";
import { activePlayer, bringsEvent, endTurn, eventThreshold, legalMoves, movePlayer } from "../src/game/turn";
import { sense } from "../src/game/sense";
import { HAZARDS } from "../src/game/hazards";
import { ENEMIES } from "../src/game/enemies";
import { PALETTE } from "../src/palette";
import { ROLES, TURN_ORDER } from "../src/game/players";
import { EQUIPMENT, FISHING_ROD, ROD_TEMPLATE, makeFine, makeItem } from "../src/game/items";
import { key } from "../src/game/hex";
import { intoFight } from "./fight";
import type { Enemy, GameState } from "../src/game/types";

/** The whole party standing on one monster, as a team, with the fight running. */
function brawl(kind: Enemy["kind"], seed = 4471): GameState {
  const base = createInitialState(seed);
  const enemy = base.enemies.find((e) => e.kind === kind)!;
  const together: GameState = {
    ...base,
    activePlayerIndex: 0,
    teams: [{ id: "team-1", name: "everybody", memberIds: base.players.map((p) => p.id) }],
    players: base.players.map((p) => ({ ...p, hex: enemy.hex, health: 9, maxHealth: 9 })),
  };
  return intoFight(together, enemy, base.players.map((p) => p.id));
}

describe("who walks with whom", () => {
  it("splits the party the way the table asked for", () => {
    expect(teamSizes(2)).toEqual([2]);
    expect(teamSizes(3)).toEqual([3]);
    expect(teamSizes(4)).toEqual([2, 2]);
    expect(teamSizes(5)).toEqual([3, 2]);
  });

  it("never leaves anybody out and never puts anybody in twice", () => {
    for (const size of [2, 3, 4, 5]) {
      const players = createInitialState(4471, TURN_ORDER.slice(0, size)).players;
      const teams = createTeams(players);
      const listed = teams.flatMap((t) => t.memberIds);
      expect(listed.sort()).toEqual(players.map((p) => p.id).sort());
      expect(new Set(listed).size).toBe(players.length);
      for (const team of teams) expect(team.memberIds.length).toBeGreaterThanOrEqual(2);
    }
  });

  it("starts a team on one tile, so the first thing you see is who you are with", () => {
    for (const size of [2, 3, 4, 5]) {
      const state = createInitialState(4471, TURN_ORDER.slice(0, size));
      for (const team of state.teams) {
        const spots = new Set(
          team.memberIds.map((id) => key(state.players.find((p) => p.id === id)!.hex)),
        );
        expect(spots.size, `${size} players`).toBe(1);
      }
      // ...and two teams do not start on top of each other, or the hidden map has
      // nothing left to talk about.
      const corners = new Set(
        state.teams.map((t) => key(state.players.find((p) => p.id === t.memberIds[0])!.hex)),
      );
      expect(corners.size).toBe(state.teams.length);
    }
  });

  it("gives the turn to the other team, and only rolls the turn over on the way round", () => {
    const state = createInitialState(4471, TURN_ORDER.slice(0, 4));
    expect(state.teams).toHaveLength(2);
    const second = endTurn(state);
    expect(second.turn, "the second team goes on the same turn").toBe(state.turn);
    expect(second.teams[1].memberIds).toContain(second.players[second.activePlayerIndex].id);

    const third = endTurn({ ...second, draw: null });
    expect(third.turn).toBe(state.turn + 1);
  });

  it("walks the whole team, never one of them", () => {
    const state = createInitialState(4471, TURN_ORDER.slice(0, 4));
    const step = [...legalMoves(state, activePlayer(state)).keys()][0];
    const after = movePlayer(state, step);
    const team = after.teams[0];
    const spots = new Set(
      team.memberIds.map((id: string) => key(after.players.find((p) => p.id === id)!.hex)),
    );
    expect(spots.size).toBe(1);
    expect([...spots][0]).toBe(step);
  });
});

describe("everybody in the fight", () => {
  it("puts the whole team into it, with no invitation step", () => {
    const state = brawl("midboss");
    expect(fighters(state).map((p) => p.id).sort()).toEqual(
      state.players.map((p) => p.id).sort(),
    );
  });

  it("deals the monster's own number of cards", () => {
    for (const kind of ["mob", "midboss", "finalboss"] as const) {
      expect(brawl(kind).combat?.trials).toHaveLength(ENEMIES[kind].cards);
    }
  });
});

describe("what gear buys, now that it cannot buy damage", () => {
  it("buys seconds with the team's best boots, not everybody's added up", () => {
    const state = brawl("mob");
    const thing = challengeFor({ suit: "diamonds", rank: "7" });
    const bare = state.players.map((p) => ({ ...p, boots: null }));
    const shod = bare.map((p) => ({
      ...p,
      boots: makeItem(EQUIPMENT.find((e) => e.slot === "boots")!, `b-${p.id}`),
    }));
    // Five children in running shoes must not get three minutes to draw a cat.
    expect(secondsFor(thing, shod, false)).toBe(secondsFor(thing, [shod[0]], false));
    expect(secondsFor(thing, shod, false)).toBeGreaterThan(secondsFor(thing, bare, false));
  });

  it("gives one hint a fight to anybody, gear or no gear", () => {
    // Fifty-two hints were written on the promise that gear would not gate them, and
    // a party that never found boots used to see none at all.
    const state = brawl("mob");
    const bare = state.players.map((p) => ({ ...p, boots: null }));
    expect(hintsFor(bare)).toBe(HINTS_A_FIGHT);
    expect(hintsFor(state.players)).toBe(HINTS_A_FIGHT);
  });

  it("gives every one of the five things a rule, one per suit and a wild", () => {
    const things = EQUIPMENT.filter((e) => e.slot === "weapon").map((e) => e.name);
    for (const name of things) expect(GEAR_RULES[name], name).toBeDefined();

    const games = things.map((n) => GEAR_RULES[n].game);
    // One for each of the four mini-games, and exactly one that works on anything.
    expect(new Set(games.filter((g) => g !== null)).size).toBe(4);
    expect(games.filter((g) => g === null)).toHaveLength(1);
  });

  it("gives the fishing rod one too, or the fisherman could never carry a rule", () => {
    // The rod lives in the weapon slot and `equip` refuses to swap it away, so without
    // an entry the fisherman is the one role locked out of the whole system.
    expect(GEAR_RULES[FISHING_ROD]).toBeDefined();
    const rod = makeItem(ROD_TEMPLATE, "rod-1");
    expect(ruleFor(rod)).not.toBeNull();
    for (const suit of ["hearts", "spades", "clubs", "diamonds"] as const) {
      expect(rulePlaysOn(GEAR_RULES[FISHING_ROD], suit), suit).toBe(true);
    }
  });

  it("says what every piece of gear is for, in one place", () => {
    // Four screens draw gear - the shop, the find card, the party's kit and the art
    // room - and a coat that said different things in two of them is a rule the table
    // cannot settle by looking.
    for (const template of EQUIPMENT) {
      const item = makeItem(template, `x-${template.name}`);
      expect(gearBlurb(item), template.name).toMatch(/\S/);
    }
    expect(gearBlurb(makeItem(EQUIPMENT.find((e) => e.slot === "armor")!, "c"))).toContain("health");
    expect(gearBlurb(makeItem(EQUIPMENT.find((e) => e.slot === "boots")!, "b"))).toContain("seconds");
  });

  it("only lets a rule bend the game it is for", () => {
    const pan = GEAR_RULES["Frying Pan"];
    expect(rulePlaysOn(pan, "hearts")).toBe(true);
    expect(rulePlaysOn(pan, "spades")).toBe(false);
    // The wild works on everything, which is what makes it the one worth carrying when
    // you have no idea what is coming.
    for (const suit of ["hearts", "spades", "clubs", "diamonds"] as const) {
      expect(rulePlaysOn(GEAR_RULES.Broom, suit), suit).toBe(true);
    }
  });

  it("bends a rule once, and a fine one twice", () => {
    const plain = makeItem(EQUIPMENT.find((e) => e.name === "Broom")!, "broom-1");
    expect(usesOf(plain)).toBe(1);
    expect(usesOf(makeFine(plain))).toBe(2);
  });

  it("spends a use when the rule is bent, and refuses a second on a plain one", () => {
    const state = brawl("midboss");
    const holder = state.players[0];
    const broom = makeItem(EQUIPMENT.find((e) => e.name === "Broom")!, "broom-1");
    const armed: GameState = {
      ...state,
      players: state.players.map((p) => (p.id === holder.id ? { ...p, weapon: broom } : p)),
    };

    expect(canUseGear(armed, "broom-1")).toBe(true);
    const bent = useGear(armed, "broom-1");
    expect(bent.combat?.gearUsed).toEqual(["broom-1"]);
    expect(canUseGear(bent, "broom-1")).toBe(false);
    expect(useGear(bent, "broom-1")).toBe(bent);
  });

  it("spends a hint to read one, and only once a card", () => {
    const state = brawl("mob");
    const stocked: GameState = { ...state, combat: { ...state.combat!, hintsLeft: 2 } };
    const read = useHint(stocked);
    expect(read.combat?.trials[0].hinted).toBe(true);
    expect(read.combat?.hintsLeft).toBe(1);
    // Already read: nothing more to buy.
    expect(useHint(read)).toBe(read);
  });

  it("gives no hints at all to a monster fighting in the streets - §9", () => {
    const state = brawl("mob");
    const streets: GameState = { ...state, combat: { ...state.combat!, hintsLeft: 0 } };
    expect(useHint(streets)).toBe(streets);
  });
});

describe("more content than there are cards", () => {
  it("runs True or Poo two deep, and everything else at least one", () => {
    // Fifty-two cards, one club of each rank - so a fourteenth True or Poo had nowhere
    // to live until each rank held a pool. This is also the shape the LLM backlog
    // needs: contents grow without the deck changing size.
    expect(poolSize({ suit: "clubs", rank: "9" })).toBe(2);
    for (const suit of ["hearts", "spades", "clubs", "diamonds"] as const) {
      for (const rank of ["2", "7", "K", "A"] as const) {
        expect(poolSize({ suit, rank }), `${suit} ${rank}`).toBeGreaterThanOrEqual(1);
      }
    }
  });

  it("keeps every prompt and every hint its own", () => {
    const all = allChallenges();
    expect(new Set(all.map((c) => c.prompt)).size).toBe(all.length);
    expect(new Set(all.map((c) => c.hint)).size).toBe(all.length);
  });

  it("never offers an answer that is not among the buttons", () => {
    // A right tap that read as wrong would be the app cheating, and it is the one bug
    // in this system a family could not talk their way past.
    for (const c of allChallenges()) {
      if (!c.options || !c.answer) continue;
      expect(c.options, c.prompt).toContain(c.answer);
    }
  });

  it("gives a card the same challenge every time it is asked for", () => {
    const card = { suit: "clubs", rank: "9" } as const;
    expect(challengeFor(card, 1)).toEqual(challengeFor(card, 1));
    expect(challengeFor(card, 0)).not.toEqual(challengeFor(card, 1));
    // Out-of-range picks wrap rather than crashing, so a save written against a bigger
    // pool than this build has still opens.
    expect(challengeFor(card, 7)).toEqual(challengeFor(card, 7 % 2));
    expect(challengeFor(card, -1)).toEqual(challengeFor(card, 1));
  });

  it("remembers which one it dealt, so a reload does not change the question", () => {
    const state = brawl("finalboss");
    for (const trial of state.combat!.trials) {
      expect(typeof trial.pick).toBe("number");
    }
    const reloaded: GameState = JSON.parse(JSON.stringify(state));
    expect(nowPlaying(reloaded)!.challenge).toEqual(nowPlaying(state)!.challenge);
  });
});

describe("tapping an answer, on the games that have one", () => {
  /** A fight whose card in play is the given suit, dealt honestly from the deck. */
  function facing(suit: "clubs" | "diamonds" | "hearts"): GameState | null {
    for (let seed = 1; seed < 400; seed++) {
      const state = brawl("finalboss", seed);
      const at = state.combat!.trials.findIndex((t) => t.card.suit === suit);
      if (at >= 0) return { ...state, combat: { ...state.combat!, at } };
    }
    return null;
  }

  it("gives True or Poo two buttons and a puzzle four, and a drawing none", () => {
    const clubs = facing("clubs");
    const diamonds = facing("diamonds");
    const hearts = facing("hearts");
    expect(nowPlaying(clubs!)!.trial.options).toHaveLength(2);
    expect(nowPlaying(diamonds!)!.trial.options).toHaveLength(4);
    // Nobody can put a drawing in a list, which is the whole line.
    expect(nowPlaying(hearts!)!.trial.options).toBeUndefined();
  });

  it("keeps the right answer among them, and shuffles where it sits", () => {
    const orders = new Set<string>();
    for (let seed = 1; seed < 60; seed++) {
      const state = brawl("finalboss", seed);
      for (let at = 0; at < state.combat!.trials.length; at++) {
        const playing = nowPlaying({ ...state, combat: { ...state.combat!, at } })!;
        if (!playing.trial.options) continue;
        expect(playing.trial.options, playing.challenge.prompt).toContain(playing.challenge.answer);
        expect(new Set(playing.trial.options).size).toBe(playing.trial.options.length);
        orders.add(playing.trial.options.join("|"));
      }
    }
    // Shuffled from the game's own generator, so the answer is not always first.
    expect(orders.size).toBeGreaterThan(4);
  });

  it("wins the card on the right answer", () => {
    const state = facing("clubs")!;
    const playing = nowPlaying(state)!;
    const after = answerTrial(state, playing.challenge.answer!);
    expect(after.combat!.trials[state.combat!.at].result).toBe("won");
  });

  it("loses the fight on a wrong one, the same as running out of time", () => {
    const state = facing("clubs")!;
    const playing = nowPlaying(state)!;
    const wrong = playing.trial.options!.find((o) => o !== playing.challenge.answer)!;
    const after = answerTrial(state, wrong);
    expect(after.combat?.outcome).toBe("partyBeaten");
    expect(after.combat!.trials[state.combat!.at].wrong).toEqual([wrong]);
  });

  it("lets the Slingshot forgive exactly one wrong answer on a puzzle", () => {
    const base = facing("diamonds")!;
    const holder = base.players[0];
    const sling = makeItem(EQUIPMENT.find((e) => e.name === "Slingshot")!, "sling-1");
    const armed: GameState = {
      ...base,
      players: base.players.map((p) => (p.id === holder.id ? { ...p, weapon: sling } : p)),
    };
    const ready = useGear(armed, "sling-1");
    expect(nowPlaying(ready)!.trial.forgiven).toBe(true);

    const playing = nowPlaying(ready)!;
    const wrong = playing.trial.options!.filter((o) => o !== playing.challenge.answer);
    const once = answerTrial(ready, wrong[0]);
    expect(once.combat?.outcome, "the first miss is bought off").toBe("ongoing");

    const twice = answerTrial(once, wrong[1]);
    expect(twice.combat?.outcome, "the second is not").toBe("partyBeaten");
  });

  it("does not offer a second go on True or Poo, where it would be the answer", () => {
    // Two buttons and one forgiven miss is a guaranteed pass, which is a button that
    // says "win this card" - the kind of thing the stones were removed for.
    expect(GEAR_RULES["Big Stick"].secondGo).toBeUndefined();
    expect(GEAR_RULES.Slingshot.secondGo).toBe(true);
  });

  it("ignores an answer that is not on the card, or one already tried", () => {
    const state = facing("clubs")!;
    expect(answerTrial(state, "Bananas")).toBe(state);
    const playing = nowPlaying(state)!;
    const wrong = playing.trial.options!.find((o) => o !== playing.challenge.answer)!;
    const missed = answerTrial(state, wrong);
    expect(answerTrial(missed, wrong)).toBe(missed);
  });
});

describe("skills, which are what health is for", () => {
  it("gives every role a button and something that is always true", () => {
    for (const role of TURN_ORDER) {
      expect(SKILLS[role].pressed, role).toBe(true);
      expect(SKILLS[role].passive, role).toBeDefined();
    }
    // The knight's passive is the automatic one, and it is deliberately not a button:
    // a child asked "save your sister?" every time says yes every time.
    expect(SKILLS.knight.passive?.title).toBe("Take the hit");
  });

  it("lets the knight refuse a lost fight, once, for a health", () => {
    const state = brawl("midboss");
    const knight = state.players.find((p) => p.role === "knight")!;
    const beaten = lostTrial(state);
    expect(beaten.combat?.outcome).toBe("partyBeaten");
    expect(canHoldTheLine(beaten)).toBe(true);

    const was = beaten.players.find((p) => p.id === knight.id)!.health;
    const held = holdTheLine(beaten);
    expect(held.combat?.outcome).toBe("ongoing");
    // The card comes back as a *new* one: re-facing the puzzle you just failed, with
    // the answer on screen, is a formality rather than a second chance.
    expect(held.combat?.trials[0].result).toBeNull();
    expect(held.combat?.trials[0].card).not.toEqual(beaten.combat?.trials[0].card);
    expect(held.players.find((p) => p.id === knight.id)!.health).toBe(was - HOLD_THE_LINE_COST);
    // Once a fight, like every other skill.
    expect(canHoldTheLine(lostTrial(held))).toBe(false);
  });

  it("never lets the knight hold the line down to nothing", () => {
    const state = brawl("midboss");
    const frail: GameState = {
      ...state,
      players: state.players.map((p) => (p.role === "knight" ? { ...p, health: 1 } : p)),
    };
    // Saving the fight at the cost of their own skill is the trade `whoTakesTheHit`
    // already refuses on their behalf; this refuses the same one.
    expect(canHoldTheLine(lostTrial(frail))).toBe(false);
  });

  it("takes the skill away at zero health and gives it back with a health", () => {
    const state = brawl("midboss");
    const rogue = state.players.find((p) => p.role === "rogue")!;
    expect(hasSkill(rogue)).toBe(true);
    expect(hasSkill({ ...rogue, health: 0 })).toBe(false);
    expect(hasSkill({ ...rogue, health: 1 })).toBe(true);
  });

  it("will not let a player out of health press one", () => {
    const state = brawl("midboss");
    const spent: GameState = {
      ...state,
      players: state.players.map((p) => (p.role === "scout" ? { ...p, health: 0 } : p)),
    };
    const scout = spent.players.find((p) => p.role === "scout")!;
    expect(canUseSkill(spent, scout)).toBe(false);
    expect(useSkill(spent, scout.id)).toBe(spent);
  });

  it("lets the scout add seconds to the clock that is running", () => {
    const state = brawl("midboss");
    const scout = state.players.find((p) => p.role === "scout")!;
    const was = state.combat!.trials[0].seconds;
    const after = useSkill(state, scout.id);
    expect(after.combat?.trials[0].seconds).toBe(was + LINGER_SECONDS);
    // One each, per fight.
    expect(after.combat?.skillsUsed).toContain(scout.id);
    expect(canUseSkill(after, scout)).toBe(false);
  });

  it("lets the rogue read the hint without spending one of the team's", () => {
    const state = brawl("midboss");
    const rogue = state.players.find((p) => p.role === "rogue")!;
    const after = useSkill(state, rogue.id);
    expect(after.combat?.trials[0].hinted).toBe(true);
    expect(after.combat?.hintsLeft).toBe(state.combat?.hintsLeft);
  });

  it("lets the doctor give a friend a health, and their skill with it", () => {
    const state = brawl("midboss");
    const doctor = state.players.find((p) => p.role === "doctor")!;
    const flat: GameState = {
      ...state,
      players: state.players.map((p) => (p.role === "knight" ? { ...p, health: 0 } : p)),
    };
    const knight = flat.players.find((p) => p.role === "knight")!;
    expect(hasSkill(knight)).toBe(false);

    const after = useSkill(flat, doctor.id, knight.id);
    const mended = after.players.find((p) => p.role === "knight")!;
    expect(mended.health).toBe(1);
    expect(hasSkill(mended)).toBe(true);
  });

  it("lets the fisherman throw a card back for a different one", () => {
    const state = brawl("midboss");
    const fisher = state.players.find((p) => p.role === "fisherman");
    if (!fisher) return;
    const before = state.combat!.trials[0].card;
    const after = useSkill(state, fisher.id);
    expect(after.combat?.trials[0].card).not.toEqual(before);
    expect(after.combat?.trials[0].hinted).toBe(false);
  });

  it("makes the knight wear a lost fight, but never at the cost of going down for it", () => {
    const state = brawl("midboss");
    const team = state.players;
    const knight = team.find((p) => p.role === "knight")!;
    expect(whoTakesTheHit(team, 1)?.id).toBe(knight.id);

    // On one health the trade would swap one child for another, and that is a trade
    // nobody chose. It stops fending for everybody rather than falling over.
    const frail = team.map((p) => (p.role === "knight" ? { ...p, health: 1 } : p));
    expect(whoTakesTheHit(frail, 1)).toBeNull();
  });
});

describe("sharing out the loot", () => {
  /** A won fight with a known haul, and the whole team standing in it. */
  function won(): GameState {
    const state = brawl("midboss");
    const spoils = [
      makeItem(EQUIPMENT.find((e) => e.slot === "weapon")!, "prize-weapon"),
      makeItem(EQUIPMENT.find((e) => e.slot === "armor")!, "prize-armour"),
    ];
    return {
      ...state,
      combat: { ...state.combat!, outcome: "enemyDefeated", spoils, picksLeft: 2 },
    };
  }

  it("lets the starter keep a pick, exactly as it always did", () => {
    const after = takeSpoil(won(), "prize-weapon");
    expect(after.players.find((p) => p.id === "knight")!.weapon?.id).toBe("prize-weapon");
    expect(after.combat?.picksLeft).toBe(1);
  });

  it("lets the starter hand a pick to somebody who fought", () => {
    // §10, in as many words: keep them, or give them to any player in the fight.
    const after = takeSpoil(won(), "prize-armour", "rogue");
    expect(after.players.find((p) => p.id === "rogue")!.armor?.id).toBe("prize-armour");
    expect(after.players.find((p) => p.id === "knight")!.armor).toBeNull();
    expect(after.combat?.picksLeft).toBe(1);
    expect(after.log.at(-1)?.text).toContain("was handed");
  });

  it("gives nothing to somebody who was not in the fight", () => {
    const state = won();
    const outsider: GameState = {
      ...state,
      combat: { ...state.combat!, allies: state.combat!.allies.filter((id) => id !== "scout") },
    };
    expect(fighters(outsider).map((p) => p.id)).not.toContain("scout");
    expect(takeSpoil(outsider, "prize-weapon", "scout")).toBe(outsider);
  });
});

describe("the world gets louder", () => {
  it("drops the bar for an event as the game goes on", () => {
    // §4's "face cards" is 23% of the deck on turn one and 23% on turn thirty-two.
    // The back half is where a quiet turn is just a turn spent walking.
    expect(eventThreshold(1, 32)).toBe(11);
    expect(eventThreshold(16, 32)).toBe(10);
    expect(eventThreshold(30, 32)).toBe(9);
  });

  it("counts the ace throughout, which §4 quietly excluded", () => {
    const ace = { suit: "spades", rank: "A" } as const;
    expect(bringsEvent(ace, 1, 32)).toBe(true);
    expect(bringsEvent({ suit: "spades", rank: "K" }, 1, 32)).toBe(true);
    expect(bringsEvent({ suit: "spades", rank: "10" }, 1, 32)).toBe(false);
  });

  it("turns a late ten into an event and an early one into a quiet turn", () => {
    const ten = { suit: "hearts", rank: "10" } as const;
    expect(bringsEvent(ten, 2, 32)).toBe(false);
    expect(bringsEvent(ten, 20, 32)).toBe(true);

    const nine = { suit: "hearts", rank: "9" } as const;
    expect(bringsEvent(nine, 20, 32)).toBe(false);
    expect(bringsEvent(nine, 30, 32)).toBe(true);
  });

  it("never lets a face card go quiet, whatever the maths says", () => {
    for (const rank of ["J", "Q", "K"] as const) {
      for (const turn of [1, 10, 20, 32]) {
        expect(bringsEvent({ suit: "clubs", rank }, turn, 32)).toBe(true);
      }
    }
  });
});

describe("one crew of pirates, not two", () => {
  it("reports a thief once, not once as a monster and once as a hazard", () => {
    const base = createInitialState(4471);
    const pirates = base.hazards.find((h) => h.kind === "pirates")!;
    // Stand somebody a tile away so the crew is inside sensing range.
    const near: GameState = {
      ...base,
      players: base.players.map((p, i) =>
        i === 0 ? { ...p, hex: { q: pirates.hex.q + 1, r: pirates.hex.r } } : p,
      ),
    };
    const blips = sense(near, near.players[0]).filter((s) => s.name === "Pirates");
    // They are one thing wearing two hats - a hazard record and a monster record on
    // one tile - and the read-out used to list both, which had the table hunting for
    // a second crew that was never there.
    expect(blips).toHaveLength(1);
    expect(blips[0].kind).toBe("hazard");
  });

  it("gives every blip the colour its token has on the board", () => {
    const base = createInitialState(4471);
    const pirates = base.hazards.find((h) => h.kind === "pirates")!;
    const near: GameState = {
      ...base,
      players: base.players.map((p, i) =>
        i === 0 ? { ...p, hex: { q: pirates.hex.q + 1, r: pirates.hex.r } } : p,
      ),
    };
    for (const blip of sense(near, near.players[0])) {
      expect(blip.colour).toMatch(/^#[0-9a-f]{6}$/i);
    }
    expect(sense(near, near.players[0]).find((s) => s.name === "Pirates")!.colour)
      .toBe(PALETTE.pirates);
  });

  it("keeps every character and wanderer on its own colour", () => {
    // A child learns the game by colour before they learn it by name. Two things
    // sharing one is two things they cannot tell apart across the table.
    const used = Object.values(PALETTE);
    expect(new Set(used).size).toBe(used.length);
    for (const role of TURN_ORDER) {
      expect(ROLES[role].colour).toBe(PALETTE[role as keyof typeof PALETTE]);
    }
    for (const kind of ["tornado", "homeless", "robber", "pirates"] as const) {
      expect(HAZARDS[kind].colour).toBe(PALETTE[kind]);
    }
    for (const kind of ["mob", "midboss", "finalboss", "robber", "pirates"] as const) {
      expect(ENEMIES[kind].colour).toBe(PALETTE[kind]);
    }
  });
});
