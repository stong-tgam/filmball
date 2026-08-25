/**
 * Saving, resuming, and letting the table pick who they are.
 */

import { describe, expect, it, beforeEach } from "vitest";
import { SAVE_VERSION, clearSave, hasSave, howLongAgo, readSave, saveGame } from "../src/game/save";
import { createInitialState, startGame } from "../src/game/setup";
import { MAX_PARTY, MIN_PARTY, TURN_ORDER, createPlayers } from "../src/game/players";
import { makeRng } from "../src/game/rng";
import { endTurn } from "../src/game/turn";
import { key } from "../src/game/hex";
import type { GameState, Role } from "../src/game/types";

/** A localStorage that behaves, since vitest runs in node. */
function shelf() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } as unknown as Storage;
}

beforeEach(() => {
  globalThis.localStorage = shelf();
});

describe("putting a game on the shelf", () => {
  it("round-trips the whole state through JSON", () => {
    // The "no classes, no Maps, no functions in state" rule exists for this moment.
    const game = startGame(4471);
    saveGame(game);
    expect(readSave()!.game).toEqual(JSON.parse(JSON.stringify(game)));
  });

  it("comes back mid-game with the board, party and decks intact", () => {
    let game = startGame(4471);
    for (let i = 0; i < 7; i++) game = endTurn(game);
    saveGame(game);

    const back = readSave()!.game;
    expect(back.turn).toBe(game.turn);
    expect(back.rngState).toBe(game.rngState);
    expect(back.players.map((p) => key(p.hex))).toEqual(game.players.map((p) => key(p.hex)));
    expect(back.searchDeck).toHaveLength(game.searchDeck.length);
    expect(Object.keys(back.tiles)).toHaveLength(Object.keys(game.tiles).length);
  });

  it("refuses a save from an older shape rather than half-loading it", () => {
    // A save written before a field existed loads without it and then crashes three
    // turns later reading `undefined.length`, with nothing on screen to say why.
    // Refusing costs one game; loading costs an evening and looks like a broken app.
    localStorage.setItem(
      "hex-rpg-save",
      JSON.stringify({ version: SAVE_VERSION - 1, at: Date.now(), game: startGame(1) }),
    );
    expect(readSave()).toBeNull();
  });

  it("survives junk on the shelf", () => {
    localStorage.setItem("hex-rpg-save", "{not json");
    expect(readSave()).toBeNull();
    localStorage.setItem("hex-rpg-save", JSON.stringify({ version: SAVE_VERSION }));
    expect(readSave()).toBeNull();
  });

  it("does not offer to resume a game that is over", () => {
    const finished: GameState = { ...startGame(4471), ending: "victory" };
    saveGame(finished);
    expect(readSave()).toBeNull();
  });

  it("never throws when storage refuses", () => {
    globalThis.localStorage = {
      getItem: () => { throw new Error("private window"); },
      setItem: () => { throw new Error("private window"); },
      removeItem: () => { throw new Error("private window"); },
    } as unknown as Storage;
    // A failed save must not take the game down in front of a seven-year-old.
    expect(() => saveGame(startGame(1))).not.toThrow();
    expect(readSave()).toBeNull();
    expect(hasSave()).toBe(false);
    expect(() => clearSave()).not.toThrow();
  });

  it("says how long ago in words a child can read", () => {
    expect(howLongAgo(Date.now())).toBe("a moment ago");
    expect(howLongAgo(Date.now() - 20 * 60_000)).toBe("20 minutes ago");
    expect(howLongAgo(Date.now() - 3 * 3_600_000)).toBe("3 hours ago");
    expect(howLongAgo(Date.now() - 2 * 86_400_000)).toBe("2 days ago");
  });
});

describe("choosing who is playing", () => {
  it("seats exactly the roles asked for, in the order asked for", () => {
    const roster: Role[] = ["doctor", "knight"];
    const party = createPlayers(makeRng(1), roster);
    expect(party.map((p) => p.role)).toEqual(roster);
    // Turn order is the order they were tapped, and going first is a real advantage.
    expect(party[0].role).toBe("doctor");
  });

  it("still seats everybody when nobody chose", () => {
    expect(createPlayers(makeRng(1)).map((p) => p.role)).toEqual(TURN_ORDER);
  });

  it("puts every party on its own corner, however many there are", () => {
    for (let n = MIN_PARTY; n <= MAX_PARTY; n++) {
      const party = createPlayers(makeRng(n), TURN_ORDER.slice(0, n));
      expect(party).toHaveLength(n);
      expect(new Set(party.map((p) => key(p.hex))).size).toBe(n);
    }
  });

  it("refuses to seat the same role twice", () => {
    // Duplicates would collide on `Player.id`, which is the role name.
    const party = createPlayers(makeRng(1), ["knight", "knight", "rogue"]);
    expect(party.map((p) => p.role)).toEqual(["knight", "rogue"]);
  });

  it("builds a whole game around a two-player roster", () => {
    const game = createInitialState(4471, ["scout", "doctor"]);
    expect(game.players.map((p) => p.role)).toEqual(["scout", "doctor"]);
    // Monster placement adapts to party size, so a small party must still get a
    // scattered board rather than a wall.
    expect(game.enemies.length).toBeGreaterThan(0);
    expect(game.activePlayerIndex).toBe(0);
  });
});
