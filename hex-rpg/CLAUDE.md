# Hex RPG

A hex-crawl board game for kids, played hotseat on one device passed around the
table. Players roam a 91-tile map, fight bosses, buy and loot equipment, and get
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
- **Axial coordinates for maths, row-letter labels for display.** Never do geometry on the
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
src/artslots.ts the name of every picture, in one place - same argument
src/game/     pure logic, no React - hex, rng, setup, turn, combat, actions,
              hazards, events, items, gems, enemies, collapse, vision, sense,
              save, store
src/ui/       TitleScreen.tsx (who is playing), Compass.tsx (what a player
              sees), Tile.tsx (one hex), Board.tsx (the grown-up's map peek),
              CombatModal.tsx (the fight, invitations and loot), FindCard.tsx
              (what a search turned up), HookModal/GiveModal (the fisherman's
              rope, and handing things over), ArtRoom.tsx (swap any picture for
              one of your own), art/ (the drawings, and the upload store)
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
npm test           # 434 tests
npm run build      # type-check + production build
npm run build:play # one self-contained .html, plus the artifact fragment
npx vite-node tools/sim.ts 800 5 # bot playtest: how do 800 five-player games end?
```

## Current state: v0.30

Every system is in, and every earlier placeholder has been replaced with what the
rulebook says. The numbers are small on purpose: **3 health, $2, a tile at a time, and
a failed roll costs exactly one health.** Do not inflate them without a playtest —
the whole game is legible to a child because it runs on single digits.

Key rules, so nothing gets "improved" back to a guess:

- **Roles**: knight +1 health, **rogue +1 attack**, **scout +1 movement and +1
  sight**, doctor heals and revives, **fisherman fishes and hooks**. Everyone starts on
  3 health and $2. The scout's sight is the bonus that matters most now the board is
  hidden — one extra ring is roughly triple what a turn tells you. Four are rulebook
  §3; the fisherman is this build's own. The party is **whichever two to five of them
  the table picked**, starting in pairs on the corners — see the roster bullet below.
- **The fisherman's bargain** (v0.30): they cross open water at will and can never lose
  the rod, and in exchange **they hand nothing to the party**
  (`RoleProfile.tradesWithTheParty`). One-way, not exile — they can still be given to. A
  role that fished forever *and* fed four other people would make the whole supply
  economy one player's job. The water freedom is what makes bridges possible later
  without deleting the role.
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
- **Walking onto a thief offers a fight; it does not start one** (`canFightThief`,
  `fightThief`, and the `THIEVES` guard in `movePlayer`). §5.5 makes this the one
  encounter you are allowed to buy your way past, and a fight that began the instant
  you stepped on the tile took that decision away before anybody was asked — so the
  choice only ever existed when the thief walked onto *you*. Both are buttons now.
  Everything else on the board is unchanged: walk onto it, you are in it.
- **Beating a thief hands back every coin they took** (`Hazard.carrying`, paid out in
  `beaten`). Their stolen *gear* always came back; the money went nowhere at all, which
  quietly made "catch them to get it back" — the entire reason chasing one is worth a
  turn — untrue. Split between everybody who swung, with the odd dollars to the starter.
- **The turn card reports what happened before your go** (`Draw.stirred`,
  `Draw.happenings`, `hazardMoves`). A turn opens with the rim maybe falling, the dragon
  maybe landing, four wanderers each taking a step and a bandit maybe arriving — all
  decided while the device was crossing the table, and all previously reported only as
  log lines nobody was reading. The moves are **directions, never tiles** (the log rule
  holds here too), and the happenings are read back off the log rather than described
  branch by branch, the same way `Find` is — add an effect and it reports itself.
- **Chests are rare** (`chestsFor`, a share of **the river** and not of the board).
  Counting them off `TILE_COUNT` was wrong in a way only a bigger board could show: the
  river is a *line* across the map and grows with the radius, while the tile count grows
  with the square of it — so at radius 5 the old rule wanted six chests in eleven water
  tiles and **most of the river had one** - which is the thing the constant exists to
  prevent. Rare and worth the walk beats common and ignored —
  and because they are rare, a chest no longer has a dud outcome: a black number pays
  one piece of gear where it used to be a soaked empty box. A chestless river tile
  searches as ordinary ground and still fishes.
- **Events get more likely as the game goes on** (`eventThreshold`, `bringsEvent`).
  §4's "face cards" is 23% of the deck on turn one and 23% on turn thirty-two; the back
  half of a game is where a quiet turn is just a turn spent walking. Three bands: jack
  and up, then ten and up, then nine and up (31% / 38% / 46%). The ace counts
  throughout, which §4 quietly excluded.
- **A turn is two tiles, and you can see two** (`BASE_MOVE`, `BASE_SIGHT`, both 2 as of
  v0.30). They are deliberately equal: you can always see the whole of where you might
  go, so a turn is a *route* rather than a poke at the next hex. **Movement is still
  spent one tile at a time**, which is what keeps an ambush able to interrupt you
  halfway and keeps "push on or stop?" a real question — and it is why there is no route
  in state to go stale. If sight ever falls behind movement the last step becomes a
  guess again; there is a test.
- **The board is 91 tiles (`RADIUS` 5), and the turn limit is 16** — but the
  board **falls in as the game runs** (`src/game/collapse.ts`), so what the party
  actually plays on is 91 tiles, then 61, then 37, then 19. v0.22 had cut the ring off
  to get an evening under twenty minutes; v0.24 puts it back because the collapse is a
  better version of the same lever - it shortens the game by **closing the distance**
  rather than by never having had any. Measured at five players: **10.7 rounds, 53
  individual goes** — *shorter* than the 61-tile board, because two tiles a turn covers
  ground faster than the board grew.
- **`ROWS` is sized off `RADIUS`.** It was the literal `"ABCDEFGHI"` — nine letters,
  which is exactly a radius-4 board and no more. Growing the board did not produce a
  bigger map, it produced `undefined` row letters, keys reading `"undefined3"`, and a
  crash three layers down in `distance`.
- **The rim falls in every quarter of the game** (`COLLAPSE_MARKS`, `collapseRim`), and
  anybody standing on it is **out of the game for good** (`Player.gone`). This is the
  one permanent loss in a design that otherwise refuses them, so it is fenced:
  a full turn's warning on the banner, the doomed ring drawn cracked, and one step is
  always enough to get clear — falling in is a mistake, never bad luck. The exception
  is a player who is *down* when the warning comes, who needs the doctor or the hook;
  that is the sharpest thing in the game and it is meant to be.
  - **It tells you where the middle is**, which the hidden board otherwise withholds.
    Deliberate: a game that ends in a fight has to let the party find the fight, and a
    crumbling edge is the one honest way to say "the middle is that way" without
    printing a map. It also ended "we never found the dragon" as a way to lose.
  - **`LAST_RING` is 1, not 0.** The last tile standing would be the dragon's own, and
    a tile with the dragon on it is not somewhere a player can stand — walking onto it
    starts a fight, and only one fight runs at a time. Seven tiles is the arena.
  - Monsters and hazards on the ring go with it; the **dragon backs up a tile instead**,
    because an ending that falls down a hole is not one.
- **The dragon sleeps through the opening** (`DRAGON_WAKES_ON`, turn 6): `Enemy.dormant`
  means no smoke, no blip, nothing to walk into, and the middle is an ordinary mountain
  until it lands on it. It is left on the board rather than held back, so nothing else
  can be placed on the middle tile. The opening exists so the party meets the bandits
  **first** — you should arrive at the ending carrying what the middle of the game gave
  you.
- **Bandits keep arriving, more often the later it gets** (`mobArrivalChance`,
  `wanderIn`). The board used to be laid out once and then only ever empty out. Only
  bandits: an ogre appearing out of nowhere is a boss nobody could have planned for.
- **The dragon carries `DRAGON_HEALTH_PER_PLAYER` (10-14) for every player at the
  table**, which is the full slope and then some, while mid bosses keep the half slope.
  Reported from the table: four players who shouted for each other killed the game's
  ending **in a single round**. A dragon is now three or four rounds against any size of
  party, and every round they fall short costs each of them a health. Bringing everybody
  is still right; it is no longer free.
- **Board furniture is counted off `TILE_COUNT`**, not written down: cities /12, forests
  /9, chests /15. Those divisors reproduce every hand-tuned number this file has ever
  had at both board sizes, which is the point — the hand-tuned ones went stale the
  moment `RADIUS` moved, twice.
- **Visual feedback is deliberate and short** (`styles.css`, "things happening"). Every
  button presses in; a modal that matters washes the screen behind it while a quiet
  turn card does not; the turn banner replays its entrance because it is keyed on the
  active player's id; a fight shakes on a roll that fell short and glows when the
  monster goes down, keyed on the round so every beat gets its own. All of it is off
  under `prefers-reduced-motion`, and **none of it carries information that is not also
  written down** — these fire dozens of times an evening, so an effect you have to sit
  through is a tax rather than a moment.
- **The hourglass is not part of the game** (`src/ui/Hourglass.tsx`). Ninety seconds a
  turn, and when the sand runs out it calls the same `endTurn` the button does. It lives
  in the **view and never in `GameState`**, and that matters more than it looks: the
  whole design rests on a game being reproducible from its seed, and a wall clock in the
  state would make a saved game resume differently from the one that was put down. It
  pauses behind a card and during a fight — a timer that ran while a child read the
  event card would be punishing them for the app's own theatre — and it can be switched
  off, because some evenings the point is the talking.
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
  child to a particular tile, and that is the party talking to each other.
- **A chest tile gives up a chest instead of ground** (`searchKind`, and only where
  `Tile.chest` is set): face card = armour, red = two pieces, black = one piece, joker
  = the lid on your fingers for a health. The best odds in the game, which is what
  makes a chest worth changing course for.
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
- **Stones give verbs, not numbers** (`src/game/gems.ts`). This is the equipment-depth
  system and it is deliberately not more arithmetic: gear owns the numbers, and by turn
  six everybody holds the best of all three slots and a find is a shrug. A stone gives
  you **a button you did not have**. All three colours are built.
  - **One stone per player, three meanings.** It may be moved between weapon, coat and
    boots for **nothing** on your turn — that is the whole decision, and it is re-made
    whenever the game changes shape. **Never mid-fight** (`canSetGem`): switching to the
    coat after seeing a roll fall short would turn a once-a-game save into a save every
    fight, which is the one way this could quietly become a number again.
  - **Green is *keep going*, red is *you, now*, blue is *everybody else*.** Nine
    abilities from three objects, and the rows mean the same thing in every colour:
    weapon is the fight, coat is surviving, boots are reach.

    | | weapon | coat | boots |
    |---|---|---|---|
    | **green** | Spoils — everyone who swung eats | Second wind — a blow that would down you leaves you on one | Dig again — search spent ground |
    | **red** | Second swing — throw twice, keep the better | Grit — a round that falls short costs you nothing | Slip away — backing out is certain |
    | **blue** | Carry — your shout reaches one tile further | Take the hit — a friend's blow lands on you | Long arm — hand something a tile away |
  - **Three limits, and they are the shape of the colours** (`GemPower.limit`).
    `"always"` never runs out; `"game"` fires once an evening and is tracked per setting
    on `Gem.spent`, so the coat's save and the boots' dig are separate; `"fight"` comes
    back with the next fight and is tracked on `Combat.stonesSpent`, which disappears
    with the fight so there is nothing to reset. Red's whole set is `"fight"` — small,
    and there every time — which is what makes it the *now* stone.
  - **`stone(player, kind, setting, combat)` is the only question any power asks.** One
    call site per power. A new colour is a row in the table and a call here, and the
    rules about what counts as available cannot drift between the nine of them.
  - Three rules the next two colours must also hold to. **No stone may show you the
    board** — the hidden map is what the note-taking is for. **No stone may do a role's
    job better than the role** — none heals, sees further, or hits harder. **No
    invisible passives** — either it is a button, or it is drawn where a child can see
    it, and a spent power is greyed out on the strip and in the party list.
  - **Drops are low and only ever to somebody empty-handed** (`maybeAStone`): a body
    `GEM_FROM_A_BODY`, ground `GEM_FROM_THE_GROUND`, a chest `GEM_FROM_A_CHEST`, and the
    colour is its own even roll. That one rule replaces a whole pile of "you already
    have one" handling and spreads stones round the party by itself. A search rolls for
    one **on top of** its card, never instead of it. Measured at **1.9 a game with five
    players**; that is the dial if the table wants them commoner.
  - **Dig again never opens a chest twice** (`canDigAgain`). `Tile.searched` is what a
    chest spends, so without that guard the stone would be the best find in the game
    rather than a nice one.
  - **Take the hit only fires when the holder stays standing.** Heroism that swaps one
    child for another is a trade nobody chose, and this one fires by itself — a player
    asked "do you want to save your sister?" every round says yes every round, so the
    automatic version is the honest one, but only while it cannot backfire.
  - **The dragon carries a stone too** (`DRAGON_STONE`, green): once in the fight, the
    blow that should finish it leaves it on one health. Added as the counter to the
    party's three colours and **measured at doing nothing to the win rate** — the dragon
    fight is a siege spread over a dozen attempts, so one health is a rounding error. It
    is kept for the beat, not for the balance; `DRAGON_HEALTH_PER_PLAYER` is what
    actually moved (9-13 to **10-14**).
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

## The ground around you (v0.11)

The 3D experiment is gone. The view is 2D again, and there is **no board and no
position on screen at all** - not the player's, not anybody's. What a player gets is
`src/ui/Compass.tsx`: **the real tile they are standing on and the real tiles they could
step onto**, drawn with the ordinary `Tile` renderer, plus a blip for everything within
two moves placed on the bearing it actually lies on.

The distinction to hold on to: the compass shows **what is adjacent, never where any of
it is**. The remembered map is the other half, and it is behind the header's **"Your
map"** button (`Board.tsx`) - which used to be a grown-up's debug peek and is now the
player's own record, fogged by `hasSeen` rather than by `canSee`.
You have to be able to see that the next hex is a river before deciding to walk into it
— that is a choice, not a map. What stays hidden is position: no labels on the hexes
(`showLabel={false}`), no grid, no coordinates. Two players can both be looking at a
field with a river to the north-east and be nowhere near each other.

How much ground is drawn comes from `sightOf`, so the Scout's extra ring appears here as
two rings of real tiles — which is also what makes their two-tile move reachable. Hexes
past the rim of the board are drawn as dashed "edge" holes: `neighbours()` filters
off-board, so the view adds them itself with `allNeighbours`. A child needs to see that
there is nothing that way, not an absence of drawing.

`src/game/sense.ts` is the whole rule. `SENSE_RANGE` is two tiles; past that you
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

`Board.tsx` is that remembered map, behind the header's **"Your map"** button. It draws
a tile the viewer has seen - live ones in full colour, remembered ones faded and with
their search marks stripped - and nothing at all where they have never been. Monsters
still follow `enemyVisible`, so the map never shows one that is not in sight right now.

## The board is hidden, and now you remember it (v0.8, rewritten in v0.30)

**There is no bird's-eye view.** A player sees the tile they stand on and two rings
around it; the rest of the board is blank paper. What changed in v0.30 is that **ground
they have already seen stays on their map**, faded.

### The rule that was retired, and why

Until v0.30 this section said, in bold: *never add a remembered-tiles cache — it deletes
the note-taking and the talking the whole design is for, and it is the one change most
likely to look like an improvement and be the opposite.* **That was a good rule and it
is deliberately gone. Do not put it back without reading this.**

It was written for a 37-tile board with five kinds of terrain, where a child could hold
the shape of the map in their head or on one sheet of paper. It stopped being true when
the board grew to 91 tiles and started carrying things worth remembering — a bridge, a
shop, a chest, and eventually a mountain. At that size nobody takes notes; they simply
forget, and then the exploring is *wasted* rather than banked, which is worse than
either version of the rule intended.

**What the old rule was protecting is still protected, by a different mechanism:**
memory is **per player, not per party** (`Player.seen`). You still have to tell your
sister where the shop is, because she has not been there. The conversation survives; the
bookkeeping does not.

And memory holds **ground only, never contents**. Monsters walk, hazards walk, other
players walk, and ground you left unsearched may have been searched by somebody else
since. A remembered tile shows terrain and nothing else, drawn faded, so it can never
say something that has stopped being true. The rule to keep is not "no memory" — it is
**a memory may never lie**.

Read `src/game/vision.ts` before touching any of it. The rules that still hold:
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
- **The dragon smokes** (`SMOKE_RADIUS`, one ring **further than sight**) and sits at
  the centre. One monster on one tile in ninety, blind, is never found inside the turn
  limit, and "we never found it" is not a defeat, it is a shrug. It is derived from
  `BASE_SIGHT` rather than written down: it was a flat 2 while sight was a flat 1, and
  raising sight to 2 in v0.30 made the smoke reach exactly as far as ordinary eyesight
  and quietly stop being a clue at all. **A hint that is not better than looking is not
  a hint.**
- **There is no in-app notepad.** There was one; it was removed because players keep
  notes on paper or a phone, and a text box in the sidebar was a worse version of that.
  The point stands regardless: the app remembers nothing, so the map lives outside it.

Monsters are also **scattered at random** now rather than spaced out. Even spacing was
right when you could see them coming; hidden, it makes every tile equally likely to
hold something, so exploring tells you nothing. Clumps and empty runs are what the
notes are for.

## Balance, and how to check it

`npx vite-node tools/sim.ts 800 5` plays 800 five-player games with a bot and prints
how they end; the second argument is the party size, and every size wants its own run.
**Use 800, not 200** — at 200 the standard error is about 3 points, which is wide
enough to invent an improvement that is not there. That happened: v0.17 read 20% on 200
games and 25% on 800.

At v0.27, five players: **45% wins, 43% out of time, 12% wipes**, and every party size
from two to five lands in a **43-48% win band**. The per-size
table is in the README. v0.23 had drifted to 85% wins after the sim bot was taught to
eat (which was a measurement fix, not a game change, and which made every wipe figure
printed before it fiction); v0.24's harder dragon, sleeping opening and collapsing board
are what brought it back.

Two numbers that come with it: the dragon is **fought about thirteen times a game** at
five players, because the arena delivers the party to it over and over and a bot flees
at one health — damage accumulates across those attempts, which is what makes the siege
work. And **"we never found the dragon" is gone** as an ending; timeouts are now parties
who found it and could not finish it.

How it got here, because the shape of the story is the useful part:

| | win | timeout | wipe | what moved it |
|---|---|---|---|---|
| v0.13 | 20% | 55% | 26% | — |
| v0.18 | 32% | 49% | 20% | food from searches, rogue's extra pick, **and the bot finally taking loot** |
| v0.19 | 38% | 45% | 17% | **group fights** |
| v0.20 | 40% | 34% | 26% | more events late on |
| v0.22 | 40% | 34% | 26% | half the board, half the turns - length changed, difficulty did not |
| v0.23 | 74% | 21% | 5% | **the bot learned to eat** - a sim fix, not a game change |
| v0.23 | 85% | 12% | 3% | the party starting in pairs |
| v0.24 | 48% | 35% | 17% | **a dragon that scales per player**, a board that falls in, and the dragon sleeping through the opening |
| v0.26 | 46% | 39% | 15% | the green stone — inside the noise, which is the point: it adds a decision, not a number |
| v0.27 | 45% | 43% | 12% | red and blue stones (**+6 on their own**), paid for with a dragon at 10-14 a head |

Two things worth keeping in mind before you trust a number here:

- **The bot is deliberately worse than a family.** It never buys gear, never sells
  anything, and coordinates only as far as shouting for help in a fight. Treat every
  figure as a floor. It **does** eat as of v0.23; it went twenty-two versions without,
  which made every wipe figure before that badly pessimistic.
- **Fixing the bot moves the numbers without the game changing.** It went a dozen
  versions never picking up loot, which made every change to what monsters drop
  invisible to the sim; fixing that alone was worth three points. When a jump follows a
  change to `tools/sim.ts`, say so rather than banking it as balance.

Run it after any change to the turn limit, sight, monster placement, the economy, or
anything in `bossHealth` / `monsterCount`.

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

**The drawings are in the game now** (v0.14). Monsters are chits on the board and a
portrait in the fight; boss features, shop stock, loot and the party's kit all show
their drawing. `CrayonDefs` is mounted once at the top of `App.tsx` — every drawing
points into its filters, so nothing renders without it.

**Any of them can be replaced by the children's own** (v0.28, `src/ui/ArtRoom.tsx`).
Four things about that worth not rediscovering:

- **`src/artslots.ts` names every picture, once.** Exactly the argument `palette.ts`
  makes about colour: a thing's drawing has to be the same on its piece on the board, on
  its blip on the compass, on the card when it turns up and in the art room. It sits at
  the root rather than beside the drawings because `sense.ts` needs it — `Sensed.art` is
  carried on the blip the same way `Sensed.colour` is, so the dot and the token cannot
  drift apart. There is no React in it.
- **`<Art slot>` is the only place an upload is looked up** (`src/ui/art/Art.tsx`).
  Wrap a generated drawing in it and an uploaded picture wins *everywhere at once*.
  Before v0.28 only the round `Token` honoured uploads, so a photographed frying pan
  showed on the find card and nowhere else — fifteen call sites drew the art directly
  and never asked. If you add a place a drawing appears, wrap it.
- **`art/catalogue.ts` reads the slots off the game's own data**, so a new stone, a new
  monster or a new piece of gear appears in the art room by itself. **Only list slots
  something actually reads** — a slot the room offers and nothing honours is a promise
  the app breaks, and a child who draws a picture that never appears will not draw a
  second one.
- **Everything on the board has a face** (v0.29). A player's piece is their drawing on
  their colour, not an initial in a circle; a wanderer's marker is its drawing on its
  plaque, not an emoji — which was the one place in the game where a system font decided
  what something looked like, at three different weights on three different devices. The
  compass blips are the same pictures with the step count in a corner bubble, because
  the compass is the only map a *player* ever sees and a coloured dot asked a child to
  remember that purple means the pirates.
  - **The colour stays behind the drawing everywhere**, never replaced by it. Colour is
    how a seven-year-old finds their piece at a glance; the picture is how they know
    what it is.
  - **A thief has one picture, not two** (`hazardSlot`). They are one character wearing
    two hats — a hazard record that walks and a monster record that fights — so the
    wanderer points at the monster's drawing. Two squares in the art room for one
    character would leave one of them undrawn and a board where the thing you fight
    looks nothing like the thing you were avoiding.
- **It is in the app, not on the gallery page.** `gallery.html` is a second entry point
  and is *not in the build the family plays*, which is how the upload feature managed
  to be real and unreachable for fourteen versions.
- **Uploads live in `localStorage`, keyed to the page and not to the version**, so they
  survive a rebuild — the artifact keeps its drawings when it is republished. They do
  not survive a cleared cache or move to another device, which is what
  `exportDrawings` / `importDrawings` and the room's save-to-a-file are for.
- **Saving a file needs the host's permission in the artifact** (`art/downloads.ts`).
  A page in a sandboxed frame cannot start a download at all — `<a download>`, blob
  URLs, script-driven saves, all inert and all failing *silently*. The artifact host
  offers a route instead: the published page declares the `downloads` capability and
  asks for it with `claude.use("downloads")`, and the viewer confirms the save. So
  **`capabilities: {downloads: true}` has to be passed when publishing** or the button
  goes back to doing nothing. The capability is asked for as the room opens, because
  the answer takes up to ten seconds when nothing is listening. `<a download>` is still
  the path when the single-file build is opened straight off a disk. Same story with
  `confirm()`, which a sandboxed frame refuses: the room asks with a second tap instead
  of a modal.

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
- **Hazards are placed before the party**, as §5.5 says; the party starts **in pairs on
  the corners** (`startingSpots`), which is this build's choice, not the rulebook's (its
  sample setup clusters them at the top edge). One to a corner was the older choice and
  it meant nobody was ever beside anybody, which quietly disabled the doctor, the hook,
  handing things over and half of §8's invitations. Partners take the *rim* neighbours,
  so everybody still starts three tiles from the dragon; an odd party makes a trio
  rather than leaving its last member on a corner alone.
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
