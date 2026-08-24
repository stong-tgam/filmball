# Hex RPG — web app

Hotseat (one device, passed around) digital version of the Hex RPG tabletop game.
Built to the plan in `reference/webapp-spec.md`.

**This build is v0.2: players and movement.** Four players start on the board, move
one tile-click at a time in turn order, and the turn counter runs to a limit. There
are no enemies, items, events or hazards yet — those are v0.3 onwards, in the order
the spec lays out.

## Running it

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # 76 tests over the hex maths, board generation and turns
npm run build      # type-check + production build into dist/
```

## What v0.2 adds

- **The party**: four roles (knight, rogue, scout, doctor), one to a corner of the
  board. Corners are always four tiles apart and all the same distance from the
  middle, so nobody starts closer to anything than anybody else.
- **Movement**: legal tiles glow in the active player's own colour with a pip in the
  middle; tap one to move there. Range comes from the role. One move per turn.
- **Turn order and the turn counter**: play passes round the party, the counter rolls
  over when it comes back to the first player, and the game ends at the turn limit.
- **Hotseat furniture**: a full-width banner for whose turn it is, the party list with
  health and money, a confirm step before ending a turn, and a log of what happened.

## What v0.1 did

- **Axial hex coordinates** with neighbours, distance, range, and breadth-first
  pathing (`src/game/hex.ts`). The A1–I5 labels players use at the table are a
  display conversion, not the internal representation.
- **Seeded board generation** (`src/game/setup.ts`): a hexagon of radius 4, a river
  bending from one rim to the far rim, a dead-straight railway crossing it, five
  cities spaced apart and preferring the railway, and woods in clumps spread across
  the board. Everything is a pure function of the seed, so `4471` always builds the
  same board.
- **Tiles are compositions, not single terrains.** Each tile carries one element per
  side — field, forest, city or water — and holds up to three of them, every element
  owning at least one side. Water takes the sides the river actually flows through,
  and neighbouring terrain bleeds across shared sides, so woods spill into the fields
  beside them and towns have outskirts. `Tile.base` stays the tile's dominant terrain,
  which is what the rules key off; the sides are what the board is made of.
- **SVG renderer** (`src/ui/`): one `<g>` per tile, artwork drawn in SVG, rivers and
  railways joined across tile edges into continuous lines. Tap a tile to inspect it.

Enter a seed in the top bar to rebuild the board, or leave it blank for a random one.

## Layout

```
src/
  game/          pure logic - never imports React
    hex.ts       coordinates, neighbours, distance, pathing
    types.ts     all game types
    rng.ts       seeded PRNG (mulberry32)
    setup.ts     board generation
    store.ts     zustand store wrapping the above
  ui/
    Board.tsx    the SVG map
    Tile.tsx     one hex
  App.tsx
tests/           vitest, node environment, no rendering
```

The hard rule from the spec holds: `src/game/` never imports React, and every rule is
a pure function over serialisable state. That is what keeps combat and hazard
movement unit-testable later, and keeps a networked rewrite possible.

## Notes on this build

- **The tile artwork is original.** The spec asks for it to be ported from
  `hex-rpg-tiles.html`; that file, `hex-rpg-rulebook.md` and the other references were
  not available, so the fields, forests and cities here are drawn from scratch in
  `src/ui/Tile.tsx`. They are deliberately simple and recolour from CSS custom
  properties in `src/styles.css`, so swapping in the real art is a contained change.
- **Board composition is a judgement call**, not a rule from the rulebook: five
  cities at least three tiles apart, seven woods of two to four tiles seeded three
  apart, one river, one railway, and a 45% chance of a neighbour's terrain bleeding
  across a shared side. The constants are at the top of `src/game/setup.ts`.
- **Two movement rules were mine to pick, and the rulebook should overrule them.**
  The *pass-through rule*: a player may move through a tile someone is standing on
  but may not stop there — the friendlier of the two readings, since being boxed in
  by your own family is a miserable way for a seven-year-old to lose a turn. And
  *rivers do not slow anyone down*; crossing costs nothing.
- **Role stats are placeholders**, marked as such at the top of `src/game/players.ts`:
  health 9–12, move 2–3, starting money $5–8. Chosen so no pick feels like a mistake,
  not balanced.
- **The entry-side question stays open.** Sides are stored per direction, so "which
  element you are standing in depends on the side you entered from" is available as a
  rule. v0.2 does not use it: a move is a move, and `base` decides what a tile is
  for. Reopen it if the rulebook says otherwise.
- Terrain generation is tested for structure rather than exact output — the river is
  connected, crosses the board, and actually bends; the railway is straight and
  crosses the river rather than running alongside it; cities are never adjacent.
  Those tests are what stop a plausible-looking generator from producing a sawtooth
  river or a canal ruled straight across the map. Tile composition is tested the same
  way: at most three elements, each holding at least one side, water only where the
  river runs and only pointing at neighbours it also runs through, and borrowed
  terrain only ever borrowed from the tile actually on that side.
