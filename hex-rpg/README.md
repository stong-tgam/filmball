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

## v1.1: the ground around you

There is no board on screen and nothing shows where you are. What you see is the hex
you are standing on and the hexes you could step onto, drawn properly — so you can tell
that the tile to your north-east has a river through it, and that the one south is
forest, before you choose. Past the rim of the board the hexes are drawn as dashed
holes marked "edge": that way is the end of the world.

Around that, a blip for anything within two moves — the dragon's smoke, a tornado, the
robber, another player — each on the bearing it actually lies on, one move out or two.

"Tornado, two moves south." That is all you are told. Where south*of what* is, is for
you and your notebook and the other three people at the table. You can see the ground; you cannot see where
the ground is.

Everything else works the way it did: monsters stay hidden until somebody walks into
one, hazards are always felt, rivers hide chests. The log tells you which way you
walked, never which square you walked to — printing a grid reference would put the map
straight back on the screen, and there is a test that fails if one ever appears.

There is a **"Peek at the map"** button in the header for grown-ups. It shows the old
2D board, positions and all. It is a debug switch, not part of the game.

## v0.8: nobody can see the map

The board is hidden. On your turn you see the tile you are standing on and the ring
around it, and nothing else — and it goes blank again as soon as you walk away, because
**the game keeps no map at all**. Working out where everybody is, and what is where, is
something the four of you do out loud, with the notebook in the sidebar.

- **Take your own notes.** Every player has their own pad, always open, writable on
  anybody's turn. Nothing is filled in for you. Your map and your sister's map will
  disagree, and sorting that out at the table is the game.
- **Monsters hide.** They are scattered at random and drawn to nobody until somebody
  walks into one. That is an ambush, so you can always back straight out of a fight you
  did not choose, for free — you only committed once you have swung.
- **Hazards never hide.** The tornado, the robber, the pirates and the family are on
  the board for everyone, all the time. Half of them are the funny part, and the three
  players who are not moving need something to watch.
- **The dragon smokes.** You can smell it two tiles out. It is in the middle.
- **The scout finally earns its keep** — two tiles of movement *and* two rings of sight.
- **Rivers hide chests**: armour, a double haul, river water, or the lid on your
  fingers. Better than turning over a field, which is why the river is worth a detour.
- **Monsters carry a little money** — $1, $2, $5 — on top of what they drop. Selling is
  still where the real money is.
- The turn limit is **32**, up from 25, because a hidden board takes longer to cross.

`npx vite-node tools/sim.ts 200` plays a couple of hundred bot games and reports how
they end. Right now: 23% wins, 56% out of time, 21% wipes.

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
- **Too many games run out of time** (56% in the bot sim). More turns barely helps; the
  binding constraint is one player grinding down a 20–30 health dragon alone. Group
  fights are the fix.

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
