# Hex RPG — web app

Hotseat (one device, passed around) digital version of the Hex RPG tabletop game.
Built to the plan in `reference/webapp-spec.md`.

**This build is v0.6: hazards.** All four wander the board — a tornado, a traveller,
a robber and pirates — moving a tile a turn before the event card is drawn. Every
system the spec asks for is now in. v0.7 is polish: autosave, undo, win and lose
screens.

## Running it

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # 209 tests over the maths, board, turns, combat, gear, events and hazards
npm run build      # type-check + production build into dist/
```

## What v0.6 adds

- **Four hazards, moving a tile a turn** — and moving *before* the event card, which
  the spec is explicit about and which matters: an event that changes the ground has
  to land after the ground has been changed.
- **The tornado** wrecks the tile it lands on. Wrecked ground is impassable until the
  tornado moves on, anyone caught is thrown a tile clear, and the turn they lose is
  spent getting up. Monsters sit tight.
- **The traveller** asks rather than takes. Give them $2 and you roll an extra die in
  your next fight. It does not cost your turn — the spec's own default.
- **The robber** lifts $3 and carries it. The board shows what they are holding, and
  beating them hands back every penny.
- **The pirates** keep to the river and take gear rather than coins. Beat them and the
  stolen piece is there in the loot to take back.
- Both thieves are **hazards and monsters at once** — one wanders, one brawls, and one
  function moves both so they can never end up on different tiles.

## What v0.5 added

- **A card a turn.** One poker card off the event deck at the top of every turn. A
  face card — jack, queen, king or ace — brings an event with it; anything else is a
  quiet turn, and the card is shown either way, because turning it over is half the
  fun.
- **Ten events**, all of which resolve the moment they are read: market day, wolves,
  the tax collector, the travelling baker, a blacksmith who takes pity on whoever has
  the least money. Nothing lingers, nothing needs a marker on the table.
- **Boss features.** The first time anyone meets an ogre or the dragon it draws two
  of `water / railway / city / forest / field`. Standing on ground that matches makes
  it hit harder, and the fight screen shows which of its features are biting here.
- **The water escape**, the one feature effect the spec actually specifies: a monster
  at home in water, beaten on a river tile, goes into the water instead of going down
  and surfaces next door with every wound it had. Once per monster, ever.
- **Searching now reads off cards**, from the second deck the spec asks for. Face card
  finds gear, middling cards find coins, low cards find nothing — and in woods you
  draw twice and keep the better card, which is what makes trees worth walking to.

## What v0.4 added

- **One pile of gear for the whole game** — three big sticks, two swords, one great
  axe, armour and boots: thirteen items, and no more than that. Cities sell from it,
  searches turn it up, and beaten bosses drop it. It runs out.
- **Searching**: on open ground or in woods, once per tile. Woods hide more than
  fields. You get gear, coins, or nothing.
- **Markets**: city tiles sell unlimited food and whatever three items of the pile are
  on the shelf. Buying gear for a slot you have filled swaps the old piece out, and it
  goes back into the world for somebody else to find.
- **Equipment does something**: weapons add damage, armour takes it off, boots add a
  tile of movement.
- **Food can be eaten at any moment** — on someone else's turn, in the middle of a
  fight — straight from the party list. That is the spec's rule, and it means the
  child watching their sibling's turn still has something to do.
- **Loot**: beaten enemies pay out coins on the spot, and bosses drop gear to pick
  over. What nobody takes goes back into the pile.
- **One action a turn**: search, shop, or fight. Eating is free and does not count.

## What v0.3 added

- **Enemies on the board**: six bandits, two ogres, and a dragon in the middle tile,
  which gives the map a destination. Nothing spawns within two tiles of a player, so
  turn 1 is never an ambush. Enemies are angular where players are round.
- **Fighting**: walk onto an enemy and the fight starts. Three dice, faces
  `[1,1,1,2,2,3]`, plus your weapon; the enemy answers with one die plus its own
  strength. Roll again or back off, round after round.
- **Damage accumulates.** Hurting something and walking away is a real move — the
  wound is still there next turn, and the token on the board carries a health bar
  showing it.
- **Running away is always available and always free.** A child should be able to see
  the way out of a fight they are losing without asking an adult.
- **Dice are the moment**: they tumble before they settle, faces are pips rather than
  numerals, and the sum is spelled out — `1 + 1 + 1 = 3 damage` — as arithmetic a
  seven-year-old can check.

## What v0.2 added

- **The party**: four roles (knight, rogue, scout, doctor), one to a corner of the
  board. Corners are always four tiles apart and all the same distance from the
  middle, so nobody starts closer to anything than anybody else.
- **Movement**: one tile per turn for everyone, two for the rogue. Legal tiles glow
  in the active player's own colour with a pip in the middle; tap one to move there.
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
- **Prices and stats are placeholders** (`src/game/items.ts`, `src/game/enemies.ts`):
  bandit 6 health, ogre 12 with +1, dragon 20 with +2; sticks $3 up to the axe at $10. A bandit is about two good rolls; the dragon cannot be
  beaten bare-handed, which is what the spec says it should be — that fight needs the
  gear that arrives in v0.4.
- **What happens to a downed player is the biggest open question in the game.** The
  spec models `dead`, so that is what this implements: out, and the turn order skips
  them. For a game whose whole point is family night, that is probably wrong, and
  CLAUDE.md flags it. Escape being always free is the mitigation for now.
- **Enemies block movement**, where players do not: you may walk onto one, which
  starts the fight, but never past it.
- **A tile can be searched once per game.** Otherwise the best play is to stand still
  and search the same square for twenty-five turns, which is not a game.
- **Nothing can be sold.**
- **What a feature does, beyond water, was mine to invent.** The spec names five
  features and specifies only the water escape. Here a feature that matches the
  ground adds 1 to what the monster hits for. It is legible at a table — "the ogre is
  strong in the woods" — and it is a guess.
- **Every event resolves immediately.** Lingering effects like the spec's *Foggy
  morning* need a modifier system that does not exist; when one arrives, those cards
  belong in `events.ts` with the rest.
- **The hazard rules are the spec's §9 defaults**, taken as suggested: a tornado costs
  you your next turn and the others do not; wrecked ground recovers as soon as the
  tornado moves on; players are pushed clear while monsters stay; a thief you beat is
  gone for good. Change them in `src/game/hazards.ts`.
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
