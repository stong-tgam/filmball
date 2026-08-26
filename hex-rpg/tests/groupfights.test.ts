/**
 * Teams, the mini-game they play, and §10's loot.
 *
 * This replaced §8's invitation system in v0.31, and the reason is the same one that
 * replaced the dice: **the team is the group fight**. Everybody standing on the tile is
 * about to shout guesses at whoever is drawing, so there is nobody left to invite.
 */

import { describe, expect, it } from "vitest";
import { canUseSkill, fighters, hintsFor, secondsFor, takeSpoil, useHint, useSkill } from "../src/game/combat";
import { challengeFor } from "../src/game/challenges";
import { LINGER_SECONDS, SKILLS, hasSkill, whoTakesTheHit } from "../src/game/skills";
import { createTeams, teamSizes } from "../src/game/teams";
import { createInitialState } from "../src/game/setup";
import { activePlayer, bringsEvent, endTurn, eventThreshold, legalMoves, movePlayer } from "../src/game/turn";
import { sense } from "../src/game/sense";
import { HAZARDS } from "../src/game/hazards";
import { ENEMIES } from "../src/game/enemies";
import { PALETTE } from "../src/palette";
import { ROLES, TURN_ORDER } from "../src/game/players";
import { EQUIPMENT, makeItem } from "../src/game/items";
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
  it("buys seconds with the team's best weapon, not everybody's added up", () => {
    const state = brawl("mob");
    const thing = challengeFor({ suit: "diamonds", rank: "7" });
    const bare = state.players.map((p) => ({ ...p, weapon: null }));
    const armed = bare.map((p) => ({
      ...p,
      weapon: makeItem(EQUIPMENT.find((e) => e.slot === "weapon")!, `w-${p.id}`),
    }));
    // Five children with frying pans must not get three minutes to draw a cat.
    expect(secondsFor(thing, armed, false)).toBe(
      secondsFor(thing, [armed[0]], false),
    );
    expect(secondsFor(thing, armed, false)).toBeGreaterThan(secondsFor(thing, bare, false));
  });

  it("buys hints with boots, one a pair", () => {
    const state = brawl("mob");
    const bare = state.players.map((p) => ({ ...p, boots: null }));
    expect(hintsFor(bare)).toBe(0);
    expect(
      hintsFor(bare.map((p) => ({ ...p, boots: makeItem(EQUIPMENT.find((e) => e.slot === "boots")!, `b-${p.id}`) }))),
    ).toBe(bare.length);
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

describe("skills, which are what health is for", () => {
  it("gives every role exactly one, and only the knight's fires by itself", () => {
    for (const role of TURN_ORDER) expect(SKILLS[role]).toBeDefined();
    expect(SKILLS.knight.pressed).toBe(false);
    for (const role of TURN_ORDER.filter((r) => r !== "knight")) {
      expect(SKILLS[role].pressed, role).toBe(true);
    }
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
