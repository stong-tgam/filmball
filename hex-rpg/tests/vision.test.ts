import { describe, expect, it } from "vitest";
import { BASE_SIGHT, SMOKE_RADIUS, canSee, enemyVisible, playerVisible, sightOf, smellsSmoke, visibleFrom } from "../src/game/vision";
import { createInitialState } from "../src/game/setup";
import { distance, key } from "../src/game/hex";
import { movePlayer } from "../src/game/turn";
import { writeNotes } from "../src/game/actions";
import type { GameState } from "../src/game/types";

const at = (state: GameState, i: number) => state.players[i];

describe("what a player can see", () => {
  it("shows the tile underfoot and one ring, and nothing else", () => {
    const state = createInitialState(4471);
    const knight = at(state, 0);
    const seen = visibleFrom(knight);

    expect(sightOf(knight)).toBe(BASE_SIGHT);
    // Own tile plus six neighbours, minus whatever falls off the board edge.
    expect(seen.length).toBeLessThanOrEqual(7);
    expect(seen.some((h) => key(h) === key(knight.hex))).toBe(true);
    for (const hex of seen) expect(distance(knight.hex, hex)).toBeLessThanOrEqual(1);
  });

  it("gives the scout two rings - the bonus that matters now the board is hidden", () => {
    const state = createInitialState(4471);
    const scout = state.players.find((p) => p.role === "scout")!;
    const knight = state.players.find((p) => p.role === "knight")!;
    expect(sightOf(scout)).toBe(BASE_SIGHT + 1);
    expect(visibleFrom(scout).length).toBeGreaterThan(visibleFrom(knight).length);
  });

  it("hides the far side of the board from everybody", () => {
    const state = createInitialState(4471);
    const knight = at(state, 0);
    const far = Object.values(state.tiles).filter((t) => distance(knight.hex, t.hex) > 2);
    expect(far.length).toBeGreaterThan(30);
    for (const tile of far) expect(canSee(knight, tile.hex)).toBe(false);
  });

  it("remembers nothing: walking away hides the tile again", () => {
    // The whole design rests on this. If a 'seen tiles' cache ever appears, the
    // note-taking and the table talk it exists for go with it.
    const state = createInitialState(4471);
    const knight = at(state, 0);
    const step = [...visibleFrom(knight)].find((h) => key(h) !== key(knight.hex))!;
    const moved = movePlayer(state, key(step));
    const behind = knight.hex;
    const after = at(moved, 0);
    if (distance(after.hex, behind) > sightOf(after)) {
      expect(canSee(after, behind)).toBe(false);
    }
    expect(Object.keys(moved)).not.toContain("seen");
    expect(Object.keys(moved)).not.toContain("explored");
  });
});

describe("who is on the board", () => {
  it("hides a monster until somebody walks into it", () => {
    const state = createInitialState(4471);
    const knight = at(state, 0);
    const mob = state.enemies.find((e) => e.kind === "mob")!;
    expect(mob.found).toBe(false);
    expect(enemyVisible(mob, knight)).toBe(false);
    expect(enemyVisible({ ...mob, found: true, hex: knight.hex }, knight)).toBe(true);
  });

  it("keeps the thieves on the board always - they are hazards too", () => {
    const state = createInitialState(4471);
    const knight = at(state, 0);
    for (const kind of ["robber", "pirates"] as const) {
      const thief = state.enemies.find((e) => e.kind === kind);
      if (thief) expect(enemyVisible(thief, knight)).toBe(true);
    }
  });

  it("lets the dragon be smelled from two tiles out, so it can be found at all", () => {
    const state = createInitialState(4471);
    const dragon = state.enemies.find((e) => e.kind === "finalboss")!;
    const near = { ...at(state, 0), hex: dragon.hex };
    expect(smellsSmoke(state, near)).toBe(true);
    expect(enemyVisible(dragon, near)).toBe(true);
    expect(SMOKE_RADIUS).toBeGreaterThan(BASE_SIGHT);
  });

  it("hides other players until they are in sight", () => {
    const state = createInitialState(4471);
    const [a, b] = state.players;
    expect(playerVisible(a, a)).toBe(true);
    if (distance(a.hex, b.hex) > sightOf(a)) expect(playerVisible(b, a)).toBe(false);
  });
});

describe("notes", () => {
  it("keeps a note per player, and lets anybody write on anybody's turn", () => {
    const state = createInitialState(4471);
    const written = writeNotes(state, "scout", "river runs E4 to G6, nothing at C3");
    expect(written.players.find((p) => p.id === "scout")!.notes).toContain("river runs");
    // Untouched players keep their own pad.
    expect(written.players.find((p) => p.id === "knight")!.notes).toBe("");
    // Not the active player, and not an action: nothing else moved.
    expect(written.activePlayerIndex).toBe(state.activePlayerIndex);
    expect(written.players.every((p) => !p.actedThisTurn)).toBe(true);
  });

  it("survives a round trip through JSON, like the rest of the state", () => {
    const written = writeNotes(createInitialState(7), "doctor", "tornado heading north");
    expect(JSON.parse(JSON.stringify(written))).toEqual(written);
  });
});
