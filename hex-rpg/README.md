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
npm test           # 48 tests over the hex maths and board generation
npm run build      # type-check + production build into dist/
```

## What v0.1 does

- **Axial hex coordinates** with neighbours, distance, range, and breadth-first
  pathing (`src/game/hex.ts`). The A1–I5 labels players use at the table are a
  display conversion, not the internal representation.
- **Seeded board generation** (`src/game/setup.ts`): a hexagon of radius 4, a river
  bending from one rim to the far rim, a dead-straight railway crossing it, five
  cities spaced apart and preferring the railway, and forests in clumps. Everything
  is a pure function of the seed, so `4471` always builds the same board.
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
  cities at least three tiles apart, five forest clumps of two to five tiles, one
  river, one railway. The constants are at the top of `src/game/setup.ts`.
- Terrain generation is tested for structure rather than exact output — the river is
  connected, crosses the board, and actually bends; the railway is straight and
  crosses the river rather than running alongside it; cities are never adjacent.
  Those tests are what stop a plausible-looking generator from producing a sawtooth
  river or a canal ruled straight across the map.
