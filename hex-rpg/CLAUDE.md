# Hex RPG

A hex-crawl board game for kids, played hotseat on one device passed around the
table. Players roam a 61-tile map, fight bosses, buy and loot equipment, and get
knocked sideways by random events.

**The goal is family time, not simulation depth.** Every decision below serves that:
a game a 7-year-old can play without an adult reading rules aloud, that an adult
still enjoys, and that finishes in one sitting.

`webapp-spec.md` in `reference/` is the build plan. `hex-rpg-rulebook.md` is meant to
be the authoritative rules document — **it is missing** (see `reference/README.md`);
ask rather than inventing rules that the rulebook should settle.

## What that goal means when you make a call

These are the tiebreakers when a design question comes up mid-task:

- **A 7-year-old is the primary player.** Never make them compute. Highlight legal
  moves, grey out what they cannot do, name things in plain words. If a rule needs a
  paragraph to explain, it is the wrong rule.
- **Protect the exciting moments.** The dice roll, the boss reveal, the loot drop,
  the event card. These get animation and space. Everything else gets out of the way.
- **Nobody waits.** It is one device: the player whose turn it is not should still be
  able to act (eat food, watch the roll). Dead time at the table kills the evening.
- **Losing must not feel like punishment.** Setbacks are funny — a tornado, a robber
  taking $3. Death and total loss need an obvious way back into play.
- **Legibility beats realism.** In the art and in the rules. If a tile, a token, or a
  number is ambiguous across the table, it is wrong even if it is accurate.
- **Arguments get settled by the log.** Anything that changes state says so in it.

## Hard rules

- **`src/game/` never imports React.** All rules are pure functions taking state and
  returning new state. That is what keeps combat and hazard movement unit-testable
  and an online rewrite possible later.
- **State is plain, serialisable data.** No classes, no functions in state, no Maps in
  `GameState`. Autosave, undo and replay all depend on it round-tripping through JSON.
- **One seeded PRNG, in `src/game/rng.ts`.** Every random draw — board generation,
  dice, direction rolls, card draws, feature draws — comes from it. Never call
  `Math.random()` in game logic. A game must be reproducible from its seed, so bugs
  arrive as "seed 4471, turn 6".
- **Axial coordinates for maths, A1–I5 labels for display.** Never do geometry on the
  labels; row widths change direction at the middle row.

## Where things are

```
src/game/     pure logic - hex.ts, types.ts, rng.ts, setup.ts, store.ts
src/ui/       Board.tsx (SVG map), Tile.tsx (one hex)
tests/        vitest, node environment, no rendering
reference/    the spec; the rulebook and card/tile/token HTML are missing
```

```sh
npm run dev        # http://localhost:5173
npm test           # 56 tests
npm run build      # type-check + production build
```

## Current state: v0.2, players and movement

Shipped: hex coordinates with pathing, seeded board generation, the SVG renderer, the
four-role party placed one to a corner, click-to-move with legal tiles highlighted,
turn order, the turn counter and limit, the active-player banner, party list and log.
**No enemies, items, events or hazards yet.**

Build order from the spec, one phase at a time — ship each working before starting
the next: **v0.3** combat (playtest here before going further; this is the core
loop) · **v0.4** items and economy · **v0.5** features and events · **v0.6**
hazards · **v0.7** autosave, undo, win/lose screens.

Turn logic lives in `src/game/turn.ts` as pure functions — `legalMoves`,
`movePlayer`, `endTurn`. v0.2 runs the short version of the spec's loop (each player
moves once, then the turn passes); hazard and event phases slot in ahead of it when
they exist, and the phase names are already in `Phase`.

## Conventions worth keeping

- **Tiles are compositions.** A tile carries one element per side (`Tile.sides`,
  indexed by `DIRS`) and holds up to three of field/forest/city/water, each owning at
  least one side. `Tile.base` is the dominant terrain the *rules* key off; `sides` is
  what the tile is made of. Terrain bleeds across shared sides on purpose — that is
  what makes the map read as a place.
- **Test generators structurally, not by snapshot.** Assert the river is connected,
  crosses the board and actually bends; that cities are never adjacent; that no tile
  exceeds three elements. Snapshots of a seeded generator pass happily on output that
  looks wrong to a human, and break on every harmless tuning change.
- **Tile art is original SVG** in `src/ui/Tile.tsx`, recoloured from CSS custom
  properties in `src/styles.css`. It stands in for artwork that was to be ported from
  the missing `hex-rpg-tiles.html`; keep it swappable.
- **Touch targets ≥44px.** This gets played on a tablet.
- Board-composition constants live at the top of `src/game/setup.ts`. Tune there.

## Open questions

The spec's §9 lists rules the code will need branches for — turn limit, how long
tornado damage lasts, whether a hazard hit costs your turn, whether mid bosses must
die before the final boss. Defaults are suggested there; confirm before v0.6.

Decisions taken in the absence of the rulebook, all marked in the code where they
are made, all cheap to reverse:

- **Pass-through**: you may move *through* another player, not stop on them
  (`legalMoves` in `turn.ts`).
- **Rivers do not cost movement.** No terrain does, yet.
- **Role stats are placeholders** (`players.ts`) — health 9–12, move 2–3, money $5–8.
- **Entry side is not a rule.** Sides are stored per direction, so "which element you
  are standing in depends on the side you entered from" remains available; nothing
  uses it, and `base` decides what a tile is for.
