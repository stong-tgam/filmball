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

## Version numbers

**We are pre-release and the number must say so.** `v1.0` is reserved for the first
build that is actually ready to hand to somebody outside the family — it is a decision
point for the owner of this project, not a milestone this repo reaches on its own.
Nothing here may number itself 1.x without them saying so.

So the scheme is: **`v0.<milestone>`**, a milestone being a chunk of work worth a
heading in the README, and **`v0.<milestone>.<fix>`** for bug fixes on top of one. The
current number lives in `src/App.tsx`'s header and in "Current state" below; keep the
two the same.

The history was renumbered one decimal place in v0.16.1 - what used to read v1.4 is
now v0.14 - because a run of 1.x numbers had accumulated without anybody deciding the
game was released. Ordering is unchanged; the old "v1.0" was simply the tenth
milestone.

## Where things are

```
src/palette.ts  every colour that names a character or an event, in one place
src/game/     pure logic, no React - hex, rng, setup, turn, combat, actions,
              hazards, events, items, enemies, vision, sense, store
src/ui/       Compass.tsx (what a player sees), Tile.tsx (one hex),
              Board.tsx (the grown-up's map peek), FindCard.tsx (what a
              search turned up), art/ (the drawings)
tools/        sim.ts (bot playtests), inline.mjs (single-file build)
tests/        vitest, node environment, no rendering
reference/    the rulebook, the build spec, and the token art prompt
```

**Every build ships to the artifact.** The owner playtests in a side panel next to the
conversation, so `npm run build:play` is not finished until `dist-play/hex-rpg-artifact.html`
has been republished — same file path every time, which keeps the URL stable so their
tab does not break. `tools/inline.mjs` emits that fragment (title, styles, `#root`, the
bundle, no doctype) precisely because the artifact host wraps the page in its own
document and a second `<html>` inside one does not mount. Do not hand over a version
you have not published.

```sh
npm run dev        # http://localhost:5173
npm test           # 362 tests
npm run build      # type-check + production build
npm run build:play # one self-contained .html, plus the artifact fragment
npx vite-node tools/sim.ts 200   # bot playtest: how do 200 games end?
```

## Current state: v0.21

Every system is in, and every earlier placeholder has been replaced with what the
rulebook says. The numbers are small on purpose: **3 health, $2, a tile at a time, and
a failed roll costs exactly one health.** Do not inflate them without a playtest —
the whole game is legible to a child because it runs on single digits.

Key rules, so nothing gets "improved" back to a guess:

- **Roles**: knight +1 health, **rogue +1 attack**, **scout +1 movement and +1
  sight**, doctor heals and revives, **fisherman fishes and hooks**. Everyone starts on
  3 health and $2. The scout's sight is the bonus that matters most now the board is
  hidden — one extra ring is roughly triple what a turn tells you. Four are rulebook
  §3; the fisherman is this build's own, and the party is **five**, on five of the six
  corners.
- **The fisherman** is the odd role out on purpose: every other bonus is a number added
  to a roll, theirs is a **thing they hold**. The rod is in the weapon slot at **+0**,
  cannot be swapped away (`equip` refuses — a ground search equips what it finds
  without asking, and the role would evaporate on a lucky card), and becomes **+1**
  after `FISH_TO_UPGRADE` fish. **+1, not `makeFine`'s +2**: fine is what the best chest
  in the game pays, and three fish must not beat that.
  - **Fishing** (`canFish`, `fish`) needs a river and costs the action. Nearly every
    card is a fish; only the joker is a blank. Unlike a search it is **not once per
    tile** — a river restocks, and a role whose job can be done four times a game is
    not a role. The **treasure** is the once-only half and it does consume
    `tile.searched`; that split is what lets the fisherman always eat without letting
    them farm one bend.
  - **The hook** (`hookTargets`, `hook`) reaches one tile and either reels a friend
    onto your tile or hauls you onto theirs. Dragging a downed friend to the doctor is
    the best thing it does, so `fellAt` moves with the body. It is now a shortcut
    rather than the only way onto a shared tile — see below.
- **Players stack.** Walking onto a friend is legal, and getting the party onto one
  tile is something the game wants: it is where you trade face to face, where the
  fisherman's hook puts you, and where a group fight will have to happen. The old
  blocking rule made the party five people who could never quite meet. Monsters are
  unchanged — onto one, never past it (§5).
- **Handing things over** (`tileMates`, `giveTargets`, `give`) costs **nothing**, not
  the turn's action: walking to each other already cost both players turns, and a child
  who must spend a whole go to pass a sandwich will never do it. Only ever offered for
  something the receiver gains outright — `canReceive` is derived from `equip` (it
  returns nothing only when there was room), so a gift can never quietly cost somebody
  their better coat.
- **The knight carries the party's spare coat** (`Player.spareArmor`,
  `RoleProfile.carriesSpare`). A second piece of armour goes on their back instead of
  displacing what they are wearing; it does nothing for them — no health, no armour —
  and exists to be handed to somebody with a bare back. Same idea as their own bonus
  said twice: the one who can take a hit is the one who can afford to carry a spare.
- **Monster placement adapts to party size** (`safeRadiusFor`). `SAFE_RADIUS` is still
  2, but held at 2 with five players there were **20 legal tiles for 19 monsters** —
  every legal tile got one and all six tiles round the dragon were a wall. The radius
  now gives ground to keep at least `MIN_OPEN_PER_MONSTER` tiles free per monster, so
  the board stays a scatter. There is a test on the packing ratio.
- **`src/palette.ts` owns every colour that names a thing.** A child learns this game
  by colour before they learn it by name — "the pink one" is how a seven-year-old
  refers to the knight for the first hour — so a thing's colour has to be identical on
  its token, its chit, the party list and the compass blip. **Never hard-code a token
  or blip colour anywhere else.** `Sensed.colour` is carried on the blip from the same
  file, so the dot and the token cannot drift apart. `styles.css` still owns the
  scenery (terrain fills, panel chrome, the accent) because none of that names a
  character.
- **A thief is one thing wearing two hats**: a hazard record and a monster record on
  the same tile. `HazardLayer` skips them (`EnemyLayer` draws them) and `sense` skips
  them in the enemy loop (the hazard loop reports them). Miss either and the board
  grows a second crew of pirates that nobody can find.
- **Chests are rare** (`CHESTS_IN_THE_RIVER`, four). Every river tile used to hold one,
  which made the best odds in the game something you tripped over on the way past and
  put a chest mark on a dozen hexes. Rare and worth the walk beats common and ignored —
  and because they are rare, a chest no longer has a dud outcome: a black number pays
  one piece of gear where it used to be a soaked empty box. A chestless river tile
  searches as ordinary ground and still fishes.
- **Events get more likely as the game goes on** (`eventThreshold`, `bringsEvent`).
  §4's "face cards" is 23% of the deck on turn one and 23% on turn thirty-two; the back
  half of a game is where a quiet turn is just a turn spent walking. Three bands: jack
  and up, then ten and up, then nine and up (31% / 38% / 46%). The ace counts
  throughout, which §4 quietly excluded.
- **Games are saved after every change** (`src/game/save.ts`, and a `useGame.subscribe`
  in the store rather than a call in each of twenty setters — the twenty-first would be
  the one somebody forgot, and a save that is right most of the time loses an evening
  and looks like a different bug). **Bump `SAVE_VERSION` whenever `GameState` changes
  shape.** A save written before a field existed loads without it and crashes three
  turns later reading `undefined.length`, with nothing on screen to say why; refusing an
  old save costs one game, loading one costs an evening.
- **The table picks the party** (`TitleScreen`, `createPlayers(rng, roster)`). Two to
  five, and **turn order is the order they were tapped** — going first is a real
  advantage on a board where the good ground is found rather than seen, so the picker
  numbers them. `TURN_ORDER` is now the menu and the fallback, not the roster.
- **The board scales to the party** (`monsterCount`, `bossHealth`). Handing five
  players' worth of board to two children is a different game, not a harder one: the
  sim wiped two-player parties **62%** of the time. Monster *counts* scale linearly;
  boss *health* scales at **half** the slope, because scaling it fully overshot and
  flipped two-player games to 69% wins — a party's damage is not purely linear in its
  size, since each brings their own weapon bonus and the group only has to beat the
  remaining health once. Every size now lands in a 40-51% win band. Re-measure if you
  touch either.
- **A fighter may do something other than swing** (`Combat.support`, `supportOptions`,
  `pledgeSupport`). Only the doctor has one — patch somebody up instead of rolling, at
  the cost of their dice that round, which is exactly the trade worth making when a
  failed roll costs everybody a health. The shape is `{ by, kind, to }` rather than a
  doctor-shaped field **because this is where weapon skills and gems will hang**;
  `"heal"` is simply the only kind built.
- **Group fights (§8) are in.** The starter of a fight may shout for anybody inside
  **their own** movement range (`inviteTargets`) — so a scout who picks the fight pulls
  from further away, which is a second reason to send them first. Invited players move
  onto the tile and roll, and it **does not spend their turn**. Every participant's
  dice are totalled into one number against the monster, and a failed roll costs
  **every one of them** a health.
  - Both of §8's balance guards are enforced: **mobs stay solo** (`invitable`) and a
    player joins **one fight per round** (`joinedFightThisRound`, cleared when the turn
    rolls over). The rulebook is explicit that without these the party clusters on
    every bandit and turn order stops mattering.
  - **If the starter falls with friends still up, the fight carries on** and the next
    one along takes over as starter — the party is standing right there, and ending it
    because one of them went down would be the app overruling the table. The picks go
    with the job. The fight ends only when everybody in it is down.
  - **§9's field feature is +1 to each**, not +1 per player. §9's wording ("+1 to the
    toll per player in the fight") reads both ways and has only ever been exercised
    solo; the other reading is a five-player wipe on one bad roll. A §15-style choice,
    made in `extraToll`.
- **Loot distribution (§10)**: `takeSpoil(state, itemId, toId?)`. The starter keeps a
  pick or hands it to **anybody who fought** — the rulebook's own words. Deliberately
  the starter's call and not a vote: five children negotiating a dragon's hoard is not
  a mechanic, it is an evening. The purse is paid to **each** participant rather than
  split, because splitting $2 two ways is one argument and two disappointments.
- **Combat (§7)**: roll 3 dice + attack against the enemy's *remaining* health. Over
  it, beaten. Under it, the damage sticks and you lose **1 health, flat**. Exactly
  equal, **nothing happens and you go back where you started**.
- **Features (§9)**: every monster draws one, the dragon two, before the encounter.
  Water = escape once on a river; railway = a health at the start; forest = −1 attack
  for everyone; field = +1 to the toll per player; city = $1 on a city tile, else a
  health.
- **Search (§6)**: on field or forest, red finds gear, **black 2-6 turns up something
  to eat**, higher black finds nothing, the joker is a thief who takes the bone if you
  have one. The food is this build's own addition to §6: every black card being a
  blank meant two searches in five spent on a card that says no, and a turn is most of
  what a child gets to do. Food is the smallest win in the game, which is what makes it
  the right filler - it never competes with gear, so §10's keep-it-or-sell-it decision
  is untouched. Roughly gear 48%, food 19%, nothing 18%, mishap 11%, thief 4%.
- **The scout gets a second look in a wood** (`worthASecondLook`, `RoleProfile.homeGround`)
  — one re-draw, and **only when the first card was a blank**. Not on a mishap, which
  would make the role a shield against bad luck rather than a nose for good ground; not
  on a find, which would be taking something off them. A bonus that fires everywhere is
  just a bigger number; one that fires *somewhere* is a reason to send a particular
  child to a particular tile, and that is the party talking to each other. **On a river you pull up a chest
  instead** (`searchKind`): face card = armour, red = two items, black = river water,
  joker = the lid on your fingers for 1 health. Better than the ground on average, and
  that is the point — the river should be worth a detour, not scenery.
- **A red picture card pays as well as finds** (`coinsFound`): jack $1, queen $2, king
  $3, on top of the gear, and a chest carries `CHEST_COINS` in the bottom. Coin **as
  well as** gear, never instead of it — the version that paid red faces in coin rather
  than gear cost the bot a quarter of its finds and five points of win rate, which is
  a nerf to the game wearing an economy's hat. It also keeps the rule one sentence:
  *red finds something, and a picture card finds money too.*
- **Ground that has not been searched is marked on the map** (`hasFindings`, and
  `Findings` in `Tile.tsx`): an X on land, a chest on the water, in the tile's top
  corner so a player token standing on the middle of it does not cover it up. It is
  the one thing about a tile you genuinely cannot see by looking at it. Note that
  `hasFindings` is deliberately *not* `canSearch` — the map has to answer it about
  tiles nobody is standing on.
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
- **The rogue keeps one more thing off a body** (`RoleProfile.robsTheBody`): §10's
  `picks` plus one, capped by what actually dropped. Their own bonus said twice — "hits
  harder" pointed at the aftermath instead of the fight.
- **A beaten monster may be carrying food** (`SUPPLY_DROP_CHANCE`, half the time), and
  an empty river chest has something floating in it. Both are consolation on the rounds
  where the gear pile hands over nothing anybody wants, which late in a game is most of
  them. Neither competes with gear, so neither can unbalance §10.
- **Loot (§10)**: items, **plus a small purse** — $1 mob, $2 mid boss, $5 dragon. This
  bends §10, which is items-only, on purpose. Keep the amounts under `GEAR_PRICE`:
  the moment a mob out-earns a sale, the shop stops mattering and so does the
  keep-it-or-sell-it decision the rule exists to protect. There is a test for it.
  Money reaches the party three ways and no others — a body, the ground, and selling
  what you do not need. `tools/sim.ts` reports the party's purse alongside the
  endings; run it after touching any of the three.
- **Winning (§14)**: kill the dragon before the turn limit. `GameState.ending`.

What is left is listed under "Still open" in the README.

- `turn.ts` — `legalMoves`, `movePlayer`, `endTurn`. One move per turn; moving onto
  an enemy starts a fight, and the turn cannot pass while one is running.
- `combat.ts` — `startCombat`, `attack`, `flee`, `endCombat`. A round is one
  exchange: you swing, it swings back if it is still up.
- `enemies.ts` — profiles, placement, `healthLeft`, `enemyAt`.
- `items.ts` — the gear list, the pile, `equip`, `consume`. One pile for the whole
  game; food is the only unlimited thing.
- `actions.ts` — `search`, `openShop`, `buy`, `eat`, `takeLoot`. One action a turn
  and a fight counts as it; `eat` deliberately ignores whose turn it is. `search`
  also leaves a `Find` in the state for the screen to show; see below.
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

## The find card

A search puts a `Find` in `GameState.find`, and `src/ui/FindCard.tsx` holds it on
screen until the table has looked at it. The card comes up **face down** for
`SUSPENSE_MS` (two seconds) saying *Searching…* or *Opening…*, then turns over on what
was found — the item's own `Token`, a purse of coins, or a card that says the ground
was empty. The outcome was decided the instant the button was pressed and has been
sitting in state ever since; the wait is theatre, and it is the point. A tap skips it,
because two seconds is right the first ten times and a toll the fortieth. It clears on the button, and `endTurn` clears
it too so a search on one turn is never the first thing the next player sees.

Two things about it that are load-bearing:

- **The `Find` is derived, not declared.** `whatTurnedUp` reads the search back off the
  state before and the state after — what the player is holding now that they were not,
  what it displaced, the money, the health, and the log lines the search wrote. No
  branch of `search` describes itself. A hand-written summary per branch would go stale
  the first time somebody changed a branch and not its summary, and the card would then
  quietly lie about the rules. Add an outcome and it gets a card for free.
- **An empty search still gets a card.** Same reason `EventCard` shows a quiet draw: a
  seven-year-old who presses Search and sees nothing at all concludes the button is
  broken. `EMPTY_HANDED` picks its line from the card that came up, so a seed tells the
  same story twice.

The animations are decoration on top of information that is already on the card, and
every one of them is off under `prefers-reduced-motion`. Nothing runs longer than about
a second: this fires on every search, and an animation you sit through forty times an
evening is a tax, not a moment.

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
- **How much should a group fight cost?** §8 is built, and the win rate says it was
  the missing piece (32% to 38%). What is still a guess is the *price*: everybody in
  the fight pays a health per failed roll, which is the rulebook's rule, but with five
  players that is five health a round off the party. Watch whether big fights start
  feeling like a tax on turning up.

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
- **Players may stand on each other.** This has been round the houses: first you could
  move *through* somebody but not stop on them; then a friend blocked outright; now they
  do not block at all. The reason for the last change is that sharing a tile turned out
  to be something the game *wants* — trading face to face, the fisherman's hook, and
  group fights all need it — and a rule against it made the party people who could never
  quite meet. Enemies are unchanged: onto, never past (§5).
- **Movement is spent one tile at a time** (`stepsTaken`, `stepsLeft`). Never offer a
  multi-tile destination up front: on a board nobody can see, that is a leap into the
  dark, and it turns the Scout's bonus from scouting into teleporting.
- **Rivers do not cost movement.** No terrain does, yet.
- **Entry side is not a rule.** Sides are stored per direction, so "which element you
  are standing in depends on the side you entered from" remains available; nothing uses
  it, and `base` decides what a tile is for.
- **A group fight is joined by invitation, never automatically.** The starter chooses
  who to shout for; nobody is dragged in by standing too close. Standing on the tile is
  not joining either — you have to be asked, which keeps the decision with a person.
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
