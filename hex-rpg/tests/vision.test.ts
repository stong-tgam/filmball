import { describe, expect, it } from "vitest";
import { BASE_SIGHT, SMOKE_RADIUS, canSee, enemyVisible, playerVisible, sightOf, smellsSmoke, visibleFrom } from "../src/game/vision";
import { createInitialState } from "../src/game/setup";
import { RADIUS, distance, key } from "../src/game/hex";
import { movePlayer } from "../src/game/turn";
import type { GameState } from "../src/game/types";

const at = (state: GameState, i: number) => state.players[i];

describe("what a player can see", () => {
  it("shows the tile underfoot and the rings around it, and nothing else", () => {
    const state = createInitialState(4471);
    const knight = at(state, 0);
    const seen = visibleFrom(knight);

    expect(sightOf(knight)).toBe(BASE_SIGHT);
    // A hexagon of radius R holds 3R(R+1)+1 tiles, minus whatever the board edge cuts
    // off. Written against the constant: sight went from one ring to two in v0.30 and
    // a literal 7 here would have quietly stopped meaning anything.
    const most = 3 * BASE_SIGHT * (BASE_SIGHT + 1) + 1;
    expect(seen.length).toBeLessThanOrEqual(most);
    expect(seen.some((h) => key(h) === key(knight.hex))).toBe(true);
    for (const hex of seen) expect(distance(knight.hex, hex)).toBeLessThanOrEqual(BASE_SIGHT);
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
    // Most of the board, wherever the rim is: the point is that sight is a couple of
    // rings and the rest is blank paper.
    expect(far.length).toBeGreaterThan(Object.keys(state.tiles).length / 2);
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
    // Awake: a dormant dragon is somewhere else entirely and smells of nothing, which
    // is why the banner used to say "the dragon is close" on turn one.
    const fresh = createInitialState(4471);
    const state = {
      ...fresh,
      enemies: fresh.enemies.map((e) => (e.kind === "finalboss" ? { ...e, dormant: false } : e)),
    };
    const dragon = state.enemies.find((e) => e.kind === "finalboss")!;
    const near = { ...at(state, 0), hex: dragon.hex };
    expect(smellsSmoke(state, near)).toBe(true);
    expect(enemyVisible(dragon, near)).toBe(true);
    // The clue is real because **eyesight never shows an unfound monster at all**.
    // Seeing the middle tile says it is a mountain; smelling it says what is on it.
    expect(SMOKE_RADIUS).toBeGreaterThanOrEqual(BASE_SIGHT);
    // ...and it must not cover the whole board, or every player smells it always.
    expect(SMOKE_RADIUS).toBeLessThan(RADIUS);
  });

  it("hides other players until they are in sight", () => {
    const state = createInitialState(4471);
    const [a, b] = state.players;
    expect(playerVisible(a, a)).toBe(true);
    if (distance(a.hex, b.hex) > sightOf(a)) expect(playerVisible(b, a)).toBe(false);
  });
});
