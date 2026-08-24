# Hex RPG — web app

Hotseat (one device, passed around) digital version of the Hex RPG tabletop game.
Built to `reference/hex-rpg-rulebook.md`, with `reference/webapp-spec.md` as the build
plan.

**This build is v0.7: the game, by the rulebook.** Every system the spec asks for is
in, and every placeholder that earlier builds invented has been replaced with what the
rulebook actually says. **The goal is now a real goal: beat the dragon before turn 25.**

## Running it

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # 228 tests
npm run build      # type-check + production build into dist/
```

## The game, in one paragraph

Four players — knight, rogue, scout, doctor — start on **3 health and $2** at the
corners of a 61-tile board. Each round a poker card turns over; a jack, queen or king
brings an event. Then everyone moves one tile (the scout gets two) and takes one
action: search the ground, trade in a city, fight what they are standing on, or, if
they are the doctor, patch somebody up. Four hazards wander the board. Fifteen bandits,
four ogres and one dragon stand between the party and turn 25.

## What the rulebook changed

Earlier builds guessed at everything the missing rulebook was meant to settle. It
arrived, and most of the guesses were wrong:

| | Guessed | Rulebook |
|---|---|---|
| Health | 9–12 | **3**, +1 for the knight, +1 per coat |
| Money | $5–8 | **$2** |
| Movement bonus | Rogue | **Scout** (the rogue gets **+1 attack**) |
| Failed roll | Enemy rolls a die back | **Exactly 1 health**, flat |
| Exact tie | — | **Nothing happens; you go back where you started** |
| Enemies | 6 mobs, 2 ogres | **15 mobs, 4 ogres**, health rolled in bands |
| Features | Bosses only, generic +1 | **Every monster**, five specific effects |
| Search | Card ranks | **Red finds, black does not, joker is a thief** |
| Loot | Coins | **Items only** — 2/4/6 dropped, 1/2/3 kept |
| Income | Enemy purses | **Selling what you do not need** |
| Armour | Damage reduction | **+1 max health** |
| Tornado | Wrecks its own tile | **Wrecks the six around it** |
| Thieves | Mug you as they pass | **Mid-boss fights you can pay off** |
| Death | Out for good | **Up next turn, or a doctor revives you now** |
| Winning | *nothing* | **Kill the dragon inside the turn limit** |

Sixty simulated games with a bot that walks straight at the dragon: **35% wins, 45%
out of time, 20% party wipes.** A party that gears up first should do better than that.

## Layout

```
src/
  game/          pure logic - never imports React
    hex.ts       coordinates, neighbours, distance, pathing
    types.ts     all game types
    rng.ts       seeded PRNG (mulberry32), its position stored in GameState
    cards.ts     two poker decks; only the search deck has jokers
    setup.ts     board generation and a new game
    players.ts   the four roles
    enemies.ts   monsters, their bands, their loot counts
    items.ts     the fifteen pieces of gear and the food
    combat.ts    rolling, features, loot, fleeing
    actions.ts   search, trade, sell, heal, eat
    hazards.ts   the four wanderers
    events.ts    the event deck
    turn.ts      turn order, the draw, win and loss
    store.ts     zustand store wrapping the above
  ui/            Board, Tile, tokens, fight, market, cards, endings
tests/           vitest, node environment, no rendering
```

The hard rule from the spec holds: `src/game/` never imports React, and every rule is
a pure function over serialisable state.

## Still open

- **Group fights (§8)** — inviting nearby players into a boss fight. Every fight is
  one player against one enemy; `Player.joinedFightThisRound` is in the types waiting
  for it. This is the biggest gap, and it changes the boss maths (§7.4 assumes 4
  players against the dragon).
- **River and rail travel (§5)** — the optional $1 fast travel.
- **Four event cards** that need effects lasting beyond the moment they are read:
  *Foggy morning*, *Trade caravan*, *Scarecrow*, *Lost puppy*. They need a modifier
  system; the other ~28 cards are in.
- **Tier-2 boss drops and special supply (§12)** — the rulebook says to add these once
  the base game plays smoothly.
- **Must mid bosses die first? (§15)** — nothing stops a party running at the dragon
  on turn one. The dice make that a bad idea, but no rule forbids it.
- Autosave, undo and a seed you can share are still unbuilt.

## Notes on this build

- **The tile artwork is original.** `hex-rpg-tiles.html` and the card and token files
  were never available; the fields, forests and cities are drawn from scratch in
  `src/ui/Tile.tsx` and recolour from CSS custom properties.
- **Tiles are compositions.** Each carries one element per side — field, forest, city
  or water — and holds up to three, which is what the rulebook means by "a tile may
  carry more than one". `Tile.base` is the dominant terrain the rules key off.
- **Two poker decks**, resolving §15's open question the way the spec suggested: one
  for events, one for searches, so a run of face cards cannot skew both at once.
- **Where the rulebook leaves a choice, the code says so in a comment** at the place
  the choice is made.
