# Hex RPG

A hex-crawl board game for kids, played hotseat on one device passed around the
table. Players roam a 61-tile map, fight bosses, buy and loot equipment, and get
knocked sideways by random events.

**The goal is family time, not simulation depth.** Every decision below serves that:
a game a 7-year-old can play without an adult reading rules aloud, that an adult
still enjoys, and that finishes in one sitting.

`reference/hex-rpg-rulebook.md` is the authoritative rules document and **it is here**.
Follow it. `reference/webapp-spec.md` is the build plan. Where the rulebook leaves
something open (its §15 list), the choice taken is written in a comment at the place
it is made — say so in the same way if you take another one.

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
- **Anything rolling dice mid-game reads and writes `GameState.rngState`.** The
  generator's whole state is one number, so it saves with the game and a reloaded
  game rolls the sequence it would have rolled. `rollDice` returns the new value;
  put it back in the state you return.
- **Axial coordinates for maths, A1–I5 labels for display.** Never do geometry on the
  labels; row widths change direction at the middle row.

## Where things are

```
src/game/     pure logic, no React - hex, rng, setup, turn, combat, actions,
              hazards, events, items, enemies, vision, sense, store
src/ui/       Compass.tsx (what a player sees), Tile.tsx (one hex),
              Board.tsx (the grown-up's map peek), art/ (the drawings)
tools/        sim.ts (bot playtests), inline.mjs (single-file build)
tests/        vitest, node environment, no rendering
reference/    the rulebook, the build spec, and the token art prompt
```

```sh
npm run dev        # http://localhost:5173
npm test           # 272 tests
npm run build      # type-check + production build
npm run build:play # one self-contained .html you can hand to somebody
npx vite-node tools/sim.ts 200   # bot playtest: how do 200 games end?
```

## Current state: v1.4

Every system is in, and every earlier placeholder has been replaced with what the
rulebook says. The numbers are small on purpose: **3 health, $2, a tile at a time, and
a failed roll costs exactly one health.** Do not inflate them without a playtest —
the whole game is legible to a child because it runs on single digits.

Key rules, so nothing gets "improved" back to a guess:

- **Roles (§3)**: knight +1 health, **rogue +1 attack**, **scout +1 movement and +1
  sight**, doctor heals and revives. Everyone starts on 3 health and $2. The scout's
  sight is the bonus that matters most now the board is hidden — one extra ring is
  roughly triple what a turn tells you.
- **Combat (§7)**: roll 3 dice + attack against the enemy's *remaining* health. Over
  it, beaten. Under it, the damage sticks and you lose **1 health, flat**. Exactly
  equal, **nothing happens and you go back where you started**.
- **Features (§9)**: every monster draws one, the dragon two, before the encounter.
  Water = escape once on a river; railway = a health at the start; forest = −1 attack
  for everyone; field = +1 to the toll per player; city = $1 on a city tile, else a
  health.
- **Search (§6)**: on field or forest, red finds gear, black finds nothing, the joker
  is a thief who takes the bone if you have one. **On a river you pull up a chest
  instead** (`searchKind`): face card = armour, red = two items, black = river water,
  joker = the lid on your fingers for 1 health. Better than the ground on average, and
  that is the point — the river should be worth a detour, not scenery.
- **Gear grades**: ordinary gear is **+1**, fine gear is **+2**, and the name never
  changes between them — a Frying Pan +2 is still a Frying Pan, which is what keeps the
  artwork lookups working and keeps the names doing their job. Where +2 comes from *is*
  the progression, so the ordering matters more than the numbers:
  **mob 0%, mid boss 30%, dragon 50%, river chest 50%** (`ENEMIES[kind].fineChance`,
  `FINE_CHEST_CHANCE`). A chest must stay at or above a mid boss or the river stops
  being worth the walk. There is a test on the ordering.
- **Escaping (§7)**: no longer free. `escapeChance` is `ESCAPE_BASE` plus
  `ESCAPE_PER_TILE` per tile of movement over one, plus `ESCAPE_AMBUSH_BONUS` if you
  walked into it blind, capped at `ESCAPE_CAP` — never certain, so running is a gamble
  rather than an undo. **A failed attempt costs no health**: if running could hurt you
  it would be strictly worse than swinging and nobody would ever do it. This is what
  makes boots matter twice, and `ESCAPE_CAP` is the dial to move if fights start
  feeling inescapable at the table.
- **Searches can go wrong** (`MISHAPS`): a black **face** card is a mishap keyed to the
  ground — a snake in the woods, wire across a city alley, a wasps' nest in a field.
  Roughly one search in nine. They cost a health or a piece of gear, never a turn, and
  **a player on one health loses gear instead of the health**: a search must never be
  the thing that puts a child out of the game.
- **Cities are searchable** now, which the rulebook's §4 does not say. The shop and a
  rummage cost the same one action, so it is a choice rather than a free extra — and it
  is where the wire lives.
- **Loot (§10)**: items, **plus a small purse** — $1 mob, $2 mid boss, $5 dragon. This
  bends §10, which is items-only, on purpose. Keep the amounts under `GEAR_PRICE`:
  the moment a mob out-earns a sale, the shop stops mattering and so does the
  keep-it-or-sell-it decision the rule exists to protect. There is a test for it.
- **Winning (§14)**: kill the dragon before the turn limit. `GameState.ending`.

What is left is listed under "Still open" in the README. The largest is **group fights
(§8)** — every fight is currently one player against one enemy, and §7.4's boss maths
assumes four.

- `turn.ts` — `legalMoves`, `movePlayer`, `endTurn`. One move per turn; moving onto
  an enemy starts a fight, and the turn cannot pass while one is running.
- `combat.ts` — `startCombat`, `attack`, `flee`, `endCombat`. A round is one
  exchange: you swing, it swings back if it is still up.
- `enemies.ts` — profiles, placement, `healthLeft`, `enemyAt`.
- `items.ts` — the gear list, the pile, `equip`, `consume`. One pile for the whole
  game; food is the only unlimited thing.
- `actions.ts` — `search`, `openShop`, `buy`, `eat`, `takeLoot`. One action a turn
  and a fight counts as it; `eat` deliberately ignores whose turn it is.
- `cards.ts` — two poker decks, drawn down and reshuffled. Events and searches never
  share a shuffle; the spec is explicit about that.
- `events.ts` — the deck and every card's effect. Add new events here.
- `hazards.ts` — the four wanderers, their movement, what happens when they land on
  somebody, and the tornado's tile destruction. `moveHazards` is the only thing that
  moves a hazard, and for the two thieves it moves their monster record too.

Hazard and event phases slot in ahead of the move phase when they exist; the phase
names are already in `Phase`.

## The ground around you (v1.1)

The 3D experiment is gone. The view is 2D again, and there is **no board and no
position on screen at all** - not the player's, not anybody's. What a player gets is
`src/ui/Compass.tsx`: **the real tile they are standing on and the real tiles they could
step onto**, drawn with the ordinary `Tile` renderer, plus a blip for everything within
two moves placed on the bearing it actually lies on.

The distinction to hold on to: this shows **what is adjacent, never where any of it is**.
You have to be able to see that the next hex is a river before deciding to walk into it
— that is a choice, not a map. What stays hidden is position: no labels on the hexes
(`showLabel={false}`), no grid, no coordinates. Two players can both be looking at a
field with a river to the north-east and be nowhere near each other.

How much ground is drawn comes from `sightOf`, so the Scout's extra ring appears here as
two rings of real tiles — which is also what makes their two-tile move reachable. Hexes
past the rim of the board are drawn as dashed "edge" holes: `neighbours()` filters
off-board, so the view adds them itself with `allNeighbours`. A child needs to see that
there is nothing that way, not an absence of drawing.

`src/game/sense.ts` is the whole rule. `SENSE_RANGE` is two movements; past that you
feel nothing. What is sensed follows the hidden-board rules exactly: hazards always,
the dragon always because it smokes, an ordinary monster only once somebody has walked
into it. **Never sense an unfound monster** - that would undo the ambush the hiding is
for.

Bearings are continuous degrees, not one of the six flat sides. At two tiles out a
thing can sit between two directions and snapping it would send the party the wrong way.

**The log never prints a tile label.** There is no map on screen, so a grid reference
read out of the log hands the party the thing the design hides - "the tornado is at C2"
was exactly that leak. Movement says which way and how far ("walked one tile west"),
never which tile. `tests/sense.test.ts` plays a whole game and fails on any log line
matching a tile label; if you add a message, say the direction, not the square.

The 2D board survives in `Board.tsx` behind the header's **"Peek at the map"** button -
a grown-up's debug switch, off by default. It does show positions, which is the point
of it and the reason it is not something a player should be looking at.

## The board is hidden (v0.8, still the substrate)

**There is no bird's-eye view and the game remembers nothing about the map.** A player
sees the tile they stand on and the ring around it; everything else is blank paper, and
it goes blank again the moment they walk away. The map lives in the players' notes and
in what they say to each other across the table. That is the feature, not a limitation
to be smoothed over.

Read `src/game/vision.ts` before touching any of it. The rules:

- **Never add a remembered-tiles cache.** An "explored" overlay, a fog that stays
  lifted, a minimap — any of them deletes the note-taking and the talking that the
  whole design is for. This is the one change most likely to look like an improvement
  and be the opposite.
- **You always know your own tile's label.** Otherwise "where are you?" cannot be
  answered and the party can pool nothing.
- **The sidebar must never say more than the board shows.** `App.tsx` gates the Tile
  panel on `canSee`, or tapping round the fog reads the whole map without walking it.
- **Hazards are always visible to everyone**; monsters never are. A tornado you cannot
  see coming is not a funny setback, and the three players who are not moving need
  something to watch.
- **Monsters are hidden until somebody walks into one** (`Enemy.found`), which makes
  that an ambush, so `flee` lets you straight back out of a first-round ambush for
  free. Once found, a monster stays on the board — the party paid a turn for that.
- **The dragon smokes** (`SMOKE_RADIUS`, 2 tiles) and sits at the centre. Both are
  deliberate: one monster on one tile in sixty-one, blind, is never found inside the
  turn limit, and "we never found it" is not a defeat, it is a shrug.
- **There is no in-app notepad.** There was one; it was removed because players keep
  notes on paper or a phone, and a text box in the sidebar was a worse version of that.
  The point stands regardless: the app remembers nothing, so the map lives outside it.

Monsters are also **scattered at random** now rather than spaced out. Even spacing was
right when you could see them coming; hidden, it makes every tile equally likely to
hold something, so exploring tells you nothing. Clumps and empty runs are what the
notes are for.

## Balance, and how to check it

`npx vite-node tools/sim.ts 200` plays the game with a bot and prints how it ends.

At v1.3: **20% wins, 55% out of time, 26% wipes** (v1.2 was 23/61/17, v0.8 23/56/21,
35/45/20 before the fog). Step-by-step movement means the bot now spends every step
instead of one, so it covers the same ground but bumps into more on the way: fewer
timeouts, more wipes.
Raising the turn limit barely helps — about +1% win per two turns — because the limit
is not what is binding. What binds is that one player at 3 health grinds a 20–30 health
dragon down alone: **§7.4's boss maths assumes the four-player group fight in §8, and
§8 is not built.** That is the real fix for the timeout share, and it is the top item
under "Open questions".

The bot is deliberately worse than a family — it never eats, never buys gear and never
coordinates — so treat these as a floor, not a forecast. Run it after any change to the
turn limit, sight, monster placement or the economy.

## Artwork

The game is drawn to look like the children made it — marker on card. The whole of it
is in `docs/art-direction.md`: palette, the three typefaces, how a token is built, and
the SVG wobble filter. Read it before drawing anything.

Three things not to rediscover the hard way:

- **Numbers are never handwritten.** Names in Patrick Hand, quantities in Nunito with
  tabular figures.
- **The flip card's classes are `chit-*`, not `token-*`.** `.token` belongs to the
  board's SVG player pieces and sets `pointer-events: none`.
- **Any token's picture can be replaced by an upload** (`art/overrides.ts`). The
  generated drawing is the fallback, never the only option.

**The drawings are in the game now** (v1.4). Monsters are chits on the board and a
portrait in the fight; boss features, shop stock, loot and the party's kit all show
their drawing. `CrayonDefs` is mounted once at the top of `App.tsx` — every drawing
points into its filters, so nothing renders without it.

What is still not done: the app shell is dark slate and the artwork is cream paper, so
the drawings sit on their own little chits rather than the whole thing being one paper
theme. And the hex tiles still use the original `Tile.tsx` SVG rather than the crayon
`art/terrain.tsx`; both look fine, they are just two different hands. Moving the shell
onto paper is the remaining art job.

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

Still genuinely undecided, from the rulebook's §15:

- **Must mid bosses die before the dragon?** Nothing stops a party running at it on
  turn one. The dice punish that, but no rule forbids it.
- **Group fights (§8)** are unbuilt, and the boss maths in §7.4 assumes them. This is
  the biggest gap in the game: one player at 3 health grinding down a 20-30 health
  dragon alone is why over half of simulated games run out the clock.

Choices the rulebook leaves open (its §15), all marked in the code where they are made:

- **A downed player gets up on their own after a full turn, at 1 health**, and a
  doctor reaching them is instant — §7's suggested compromise, not both rules at once.
  Nobody is out of the game for good; a child knocked out on turn 8 of 32 with nothing
  to do for the rest of the evening is the failure this avoids.
- **Wrecked ground recovers as soon as the tornado moves on** — §15's own suggestion.
- **A beaten thief is gone for good.**
- **Two poker decks**, one for events and one for searches.
- **A city never runs out of food**, and sells gear only from the undrawn pile.
- **Hazards are placed before the party**, as §5.5 says; the party starts on the six
  corners, which is this build's choice, not the rulebook's (its sample setup clusters
  them at the top edge).
- **The tornado picks which piece of gear it takes and where it drops you.** The
  rulebook makes both the player's choice; automating them keeps a turn moving, and it
  takes the least useful piece.
- **Another player blocks outright.** The old rule let you move *through* somebody so
  long as you did not stop on them, which only worked when a multi-tile move was chosen
  in one go. Spent a step at a time you could always simply end the turn standing on
  them, so the rule was unenforceable — walk round your friend. Enemies are unchanged:
  onto, never past (§5).
- **Movement is spent one tile at a time** (`stepsTaken`, `stepsLeft`). Never offer a
  multi-tile destination up front: on a board nobody can see, that is a leap into the
  dark, and it turns the Scout's bonus from scouting into teleporting.
- **Rivers do not cost movement.** No terrain does, yet.
- **Entry side is not a rule.** Sides are stored per direction, so "which element you
  are standing in depends on the side you entered from" remains available; nothing uses
  it, and `base` decides what a tile is for.
- **Fights are one player against one enemy.** `Player.joinedFightThisRound` exists in
  the types for the party-joins-a-fight rule and nothing sets it yet.
- **A tile can be searched once per game** (`Tile.searched`), or standing still beats
  playing.
- **Swapped-out gear returns to the shared pile**, and so does anything a mishap takes:
  nothing ever leaves the game.
- **The hazard rules are the spec's §9 defaults**, taken as suggested (`hazards.ts`).
  A tornado costs the next turn; the traveller and the thieves do not.
- **A feature that matches the ground adds 1 to the monster's hit** (`combat.ts`). The
  spec names five features and specifies only the water escape; the rest is a guess,
  chosen because "the ogre is strong in the woods" explains itself at a table.
- **Every event resolves the moment it is read.** No lingering effects, no markers to
  remember — that is what keeps them playable by a child. The spec's *Foggy morning*
  needs a modifier system that does not exist yet.
