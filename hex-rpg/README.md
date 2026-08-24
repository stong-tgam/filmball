# Hex RPG — web app

Hotseat (one device, passed around) digital version of the Hex RPG tabletop game.
Built to the plan in `reference/webapp-spec.md`.

**This build is v0.1: the board.** 61 tiles generate from a seed and render as an SVG
map with labels. There are no players, enemies, hazards, items or turns yet — those
are v0.2 onwards, in the order the spec lays out.

## Running it

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # 56 tests over the hex maths and board generation
npm run build      # type-check + production build into dist/
```

## What v0.1 does

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
- **One open question the rules will have to settle.** Sides are stored per direction,
  so "which element you are standing in depends on the side you entered from" is
  available as a rule if you want it. Nothing uses it yet — for now `base` decides
  what a tile is for searching and trading.
- Terrain generation is tested for structure rather than exact output — the river is
  connected, crosses the board, and actually bends; the railway is straight and
  crosses the river rather than running alongside it; cities are never adjacent.
  Those tests are what stop a plausible-looking generator from producing a sawtooth
  river or a canal ruled straight across the map. Tile composition is tested the same
  way: at most three elements, each holding at least one side, water only where the
  river runs and only pointing at neighbours it also runs through, and borrowed
  terrain only ever borrowed from the tile actually on that side.
