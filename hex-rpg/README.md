# Hex RPG — web app

Hotseat (one device, passed around) digital version of the Hex RPG tabletop game.
Built to `reference/hex-rpg-rulebook.md`, with `reference/webapp-spec.md` as the build
plan.

**This build is v0.26.** Every system the spec asks for is in, every placeholder from
the early builds has been replaced with what the rulebook actually says, and the two
rules the rulebook leans on hardest — the hidden board and the group fight — are both
built. **The goal: kill the dragon before the board falls out from under you.**

The version is `v0.<milestone>`, and it stays below 1 on purpose: `v1.0` is reserved
for the first build worth handing to somebody outside the family, and that is a
decision to be made rather than a number to drift into.

## Running it

```sh
npm install
npm run dev        # http://localhost:5173
npm test           # 362 tests
npm run build      # type-check + production build into dist/
npm run build:play # one self-contained .html, plus the artifact fragment

npx vite-node tools/sim.ts 800   # bot playtest: how do 800 games end?
```

## The game, in one paragraph

Two to five players — knight, rogue, scout, doctor, fisher, chosen at the table — start
on **3 health and $2** on the corners of a 61-tile board **they cannot see** — a board
that loses its outermost ring every quarter of the game. Each round
a poker card turns over and a high one brings an event, more often the later it gets.
Then everyone moves a tile at a time (the scout gets two) and takes one action: search
the ground, fish a river, trade in a city, hand something to whoever they are standing
with, or fight what they walked into. Nobody fights a boss alone if they can help it —
you shout, your friends run in, and all the dice count. Four hazards wander the board.
Bandits, ogres and one dragon stand between the party and turn 16, and how many of each
depends on how many of you sat down.

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
| Loot | Coins | **Items and a small purse** — 2/4/6 dropped, 1/2/3 kept |
| Income | Enemy purses | **Selling, plus purses off bodies and out of the ground** |
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
    vision.ts    what the player on turn can see, and what stays hidden
    sense.ts     bearings to whatever is within two moves
    store.ts     zustand store wrapping the above
  ui/
    Compass.tsx  what a player actually sees: their tile, their steps, the bearings
    Tile.tsx     one hex
    Board.tsx    the overhead map, behind the grown-up's "Peek" button
    art/         the drawings - monsters, gear, food, terrain, boss features
tools/
    sim.ts       a bot that plays a few hundred games and reports the endings
    inline.mjs   folds a build into one self-contained .html
tests/           vitest, node environment, no rendering
```

The hard rule from the spec holds: `src/game/` never imports React, and every rule is
a pure function over serialisable state.

## v0.14: the drawings are in the game

The monsters, gear, food and boss features drawn for this game now appear in it —
monsters as chits on the ground and a portrait when a fight opens, gear and food in the
shop, in the loot, and beside each player's kit.

Two smaller things: the in-app notepad is gone (keep notes on paper — the app still
remembers nothing about the map, which is the whole point), and standing on a river the
button now reads **"Open the chest"** instead of "Search here", because a river is the
best odds in the game and nothing was saying so.

## v0.13: movement is a step at a time

A Scout has two tiles of movement, and now spends them **one at a time**. Take a step,
look at what that step turned up, and *then* decide: another step, or search, or shop,
or stop. The same goes for anyone in boots.

This is what the Scout is for. Picking a destination two tiles away on a board nobody
can see was a leap into the dark; stepping and looking is scouting.

One consequence: another player now blocks you outright. You used to be allowed to move
*through* someone so long as you did not stop on them, which only made sense when the
whole move was chosen in one go — taken step by step you could always just end the turn
standing on them. Walk round your friend.

## v0.12: better gear, riskier running, searches that bite

- **Gear comes in two grades.** Ordinary is +1, fine is +2, and the name is the same
  either way — a Frying Pan +2 is still a Frying Pan. Ordinary monsters never drop a
  +2; a mid boss does about three times in ten; the dragon and a river chest, about
  half the time. The river is the best odds in the game, which is what makes it worth
  walking to.
- **Running away is a gamble now.** Your chance comes from how fast you are, so boots
  and the Scout's legs finally do two jobs. Fail the roll and you are still in the
  fight — but it costs you no health to have tried, and walking back out of an ambush
  you never chose is easier than leaving a fight you picked. It is never a certainty.
- **A search can go wrong.** A black face card is a mishap belonging to the ground
  you are on: a snake in the leaf litter, a wire strung across a city alley that takes
  your boots, a wasps' nest in a field. About one search in nine. Nobody is ever
  knocked out by one — on your last health it takes your gear instead.
- **Cities can be searched** as well as shopped in. Both cost your one action, so it
  is a choice.

## v0.11: the ground around you

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

## v0.08: nobody can see the map

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

## v0.15: money in the ground, and a moment for finding it

Two ways to get paid, both open to somebody nowhere near a shop:

- **Bodies carry purses** — $1 off a bandit, $2 off an ogre, $5 off the dragon. This
  was already true and is now written down where the rest of the rules are.
- **Red picture cards pay as well as find.** A search that turns up a jack, queen or
  king of hearts or diamonds hands over the gear *and* a purse worth $1, $2 or $3.
  Every other card is untouched, so it costs the gear finds nothing — the alternative,
  paying red faces in coin *instead* of gear, cost the bot a quarter of its finds and
  five points of win rate.
- **Chests have coins in the bottom** — $3, alongside whatever gear was in them, and
  a chest with no gear left to give pays the $3 anyway.
- **Ground that has not been turned over is marked on the map** — an X on land, a
  chest on the water, up in the corner of the tile so it survives a token being stood
  on top of it. It is the one thing about a tile you cannot see by looking at it, and
  without it a child searches the same square twice.
- **A search stops the table for a moment.** The card comes up face down for two
  seconds — *Searching…*, *Opening…* — and then turns over on what came out of the
  ground (tap to skip if the table is impatient): the item's own token if you found something,
  a purse of coins if it paid, and a card that says so if it did not. Empty ground
  gets its own line — *"A very good hole. Nothing in it."* — because a search that
  showed nothing at all reads as a broken button.

The endings do not move: 20% wins, 55% out of time, 26% wipes, the same games as
before. Money per player at the end goes $2.5 to $4.3, which `tools/sim.ts` now
reports alongside the endings.

## v0.16: the fisherman

A fifth role, and the first one whose bonus is a **thing** rather than a number.

- **Starts holding a Fishing Rod** — the only starting kit anybody has, and it adds
  **nothing** to a roll. That is the trade: the worst fighter at the table, and the
  only one who can feed it.
- **Fishes any river tile.** Nearly every card is a fish (only the joker is a blank);
  a picture card brings up treasure as well. Fish are ordinary food, +1 health.
  Fishing is *not* once per tile the way a search is — a river restocks — but the
  treasure comes off a stretch of water once.
- **Three fish in, the rod is a proper rod**: +1 on every roll, and two fish a cast
  from then on. The fisherman is the one character who earns their weapon by doing
  their job instead of finding one.
- **Casts at a friend one tile away** — reel them onto your tile, or haul yourself
  onto theirs. This is the only thing in the game that puts two players on one square:
  you still may not *walk* onto a friend, but a rope is not a walk. It works on a
  downed friend too, and dragging one to the Doctor is the best thing it does.

Adding a fifth body forced a placement fix. With five players and the old safe ring
there were 20 legal tiles for 19 monsters, so the middle of the board became a solid
wall and every tile round the dragon was occupied on every seed. The safe ring now
gives ground to keep the scatter a scatter.

The bot says **19% wins, 63% out of time, 19% wipes** against 20/55/26 before — fewer
wipes for the extra body, more timeouts because that body is the *worst* fighter and
spends its turns fishing. Both of the fisherman's payoffs (food, and pulling the party
into one place) are things the bot cannot use: it never eats and never coordinates. So
this is a floor, and an unusually pessimistic one. The honest read is that a support
role does not pay off until §8 lets bodies join a fight.

## v0.17: the party can finally meet

- **Players stand on the same tile now.** Walking onto a friend is legal. Sharing a
  square is something the game wants — it is where you trade, where the Fisher's hook
  puts you, and where a group fight will have to happen — and the old blocking rule
  made the party five people who could never quite get together.
- **Hand anything to somebody on your tile**, and it costs nothing. Walking to each
  other already cost you both turns; that is the price. Only things the other player
  gains outright are offered, so a gift can never quietly cost them their better coat.
- **The Knight carries the party's spare coat.** A second piece of armour rides on
  their back instead of displacing the one they are wearing. It does nothing for them
  at all — it is there to be given away. Their own bonus is taking one more hit, so
  they are the one who can afford to carry something they are not using.

The bot reads **20% wins, 56% out of time, 24% wipes**, up from 19/63/19 — it stopped
getting boxed in by its own teammates on the way to the middle.

## v0.18: the ground is worth turning over

Playtest feedback, mostly about searches coming up empty too often.

- **Black 2 to 6 now turns up something to eat.** Every black card used to be a
  blank — two searches in five spent on a card that says no, and a turn is most of
  what a child gets to do. Food is the smallest win in the game, which is exactly why
  it is the right filler: it never competes with gear, so the keep-it-or-sell-it
  decision is untouched. Roughly gear 48%, food 19%, nothing 18%, mishap 11%, thief 4%.
- **Beaten monsters may be carrying food** (half the time), and an empty river chest
  has something floating in it rather than being a flat dud.
- **The Scout gets a second look in a wood** — one re-draw, and only when the first
  card was a blank. Not on a mishap (that would make them a shield against bad luck
  rather than a nose for good ground) and not on a find (that would be taking
  something off them).
- **The Rogue keeps one extra thing off a body.** They go through the pockets while
  everyone else is catching their breath — their own bonus pointed at the aftermath
  instead of the fight.

**Balance, and one caveat.** Like for like at 800 games, the game changes take wins
from **25% to 29%** (timeouts 53% → 50%). Then the bot itself was fixed: it had never
once picked up loot, so every change to what monsters drop — and the Rogue's extra
pick outright — was invisible to the sim, which could measure the fight and not the
reward. With the bot taking loot the same build reads **32% wins, 49% out of time, 20%
wipes**. That last jump is the instrument getting honest, not the game getting better.

(The 20% quoted under v0.17 was a 200-game run; 800 games puts that build at 25%. Use
800 for anything you intend to act on.)

## v0.19: group fights

The rule the whole boss maths was waiting for. §7.4 set the dragon at 20–30 health
against a *party* rolling together; every fight until now was one child at 3 health
grinding it down alone, which is why over half of games ran out the clock.

- **Shout for help.** Whoever started the fight can call anybody within their own
  movement range. They run in, roll with you, and **it does not cost them their turn**.
- **All the dice count.** Every participant rolls three, and the whole lot is totalled
  into one number against the monster.
- **A bad roll costs everybody a health.** That is the price of all those dice.
- **Mobs stay solo**, and you can only join one fight per round — both of §8's own
  balance guards, without which the party clusters on every bandit and turn order stops
  meaning anything.
- **If the leader goes down and friends are still standing, the fight carries on** and
  the next one along takes over. It ends only when everybody in it is down.
- **The loot is handed out** (§10): the starter keeps each pick or gives it to anybody
  who fought, one button per person. The purse is paid to each of them rather than
  split — splitting $2 two ways is one argument and two disappointments.

**Balance: 38% wins, 45% out of time, 17% wipes**, from 32/49/20. The biggest single
move the game has made, and it lands exactly where the docs kept predicting it would —
on the timeout share. Wipes fell too, because fights now end before they grind.

## v0.20: colour, chests, and a louder world

- **One file owns every colour** (`src/palette.ts`). A child learns this game by colour
  before they learn it by name, so a thing has to be the same colour on its token, in
  the party list and on the compass blip. Knight pink, Rogue yellow, Scout dark green,
  Doctor white, Fisher light blue, Pirates purple, Robber brown, Dragon red, Tornado
  grey, Traveller light green. Bandits and ogres were not specified and took the two
  hues nothing else was using — orange and teal.
- **There was never a second crew of pirates.** They are one thing wearing two hats: a
  hazard record and a monster record on the same tile. The board already drew them
  once, but the compass read-out listed both, so the table went looking for a crew that
  did not exist. Fixed at the source.
- **Four chests in the river, not one per tile.** The best odds in the game had become
  something you tripped over on the way past. Because they are rare now, they no longer
  have a dud outcome — a black number pays a piece of gear where it used to be an empty
  box. A chestless river tile searches as ordinary ground and still fishes.
- **Events get more likely as the game goes on.** Face cards only was 23% of the deck
  on turn one and 23% on turn thirty-two. Now it is jack-and-up, then ten-and-up, then
  nine-and-up across the thirds of the game — 31%, 38%, 46%. The ace counts throughout,
  which the old rule quietly excluded.

**Balance: 40% wins, 34% out of time, 26% wipes**, from 38/45/17. Timeouts fell hard —
that is the events. Wipes rose almost as hard, which is the same cause: a louder world
hurts. Read the wipe figure as the most pessimistic of the three, because the bot never
eats and a real family does.

*(Hazards landing on a player already fired their event immediately — checked over 400
hazard moves, 42 of 43 landings resolved on the spot. No change needed there.)*

## v0.21: save the game, and pick who you are

- **The game saves itself.** Every change is written to the browser, and the title
  screen offers to carry on. A thirty-two-turn game across five players is more than
  one sitting, and on a tablet the tab closes itself. A save from an older build is
  refused rather than half-loaded — that costs one game instead of an evening.
- **The table picks the party.** Two to five players, chosen by tapping roles on the
  opening screen, and **turn order is the order you tap** — going first matters on a
  board where the good ground is found rather than seen, so the picker numbers them.
- **The board now scales to the party.** This turned out to matter more than expected:
  two children facing five players' worth of monsters wiped **62%** of the time. Monster
  counts scale with the party, and boss health scales at half that slope.
- **In a group fight, the Doctor can patch somebody up instead of rolling** — their
  dice are the price. This is the hook the weapon skills and gems will hang on later;
  healing is just the first one.

**Balance across party sizes** (400 games each):

| Players | Win | Out of time | Wiped |
|---|---|---|---|
| 2 | 41% | 16% | 44% |
| 3 | 51% | 16% | 34% |
| 4 | 43% | 25% | 32% |
| 5 | 40% | 32% | 28% |

Two is still the hardest, which is right — a pair *should* struggle. Five is unchanged
from v0.20, so the existing balance is preserved rather than re-tuned underneath it.

## v0.22: half the length, and something happening when you tap

**The game was too long.** Measured, not guessed: the old board took 20 rounds and
**94 individual turns** to play out — well over an hour on one device, with each child
watching four fifths of it. Interestingly, only 10% of turns produced nothing at all,
so the board was never boring; it was simply too far across.

- **The board is 37 tiles, down from 61.** One ring smaller. A corner is three tiles
  from the dragon rather than four, and a third of the walking is gone.
- **Sixteen rounds, down from thirty-two.** That only works *because* the board shrank
  with it — cut one without the other and the ending becomes "we never found it".
- Monsters, cities, forests, chests and hazard spacing all scale off the board size, so
  the density is unchanged; there is just less ground.

| Players | Turns | Roughly | Win | Out of time | Wiped |
|---|---|---|---|---|---|
| 3 | 26 | 9–15 min | 45% | 28% | 26% |
| 5 | 48 | 16–28 min | 46% | 41% | 14% |

**Visual feedback**, because a tap should visibly do something:

- Every button presses in.
- A modal that matters — an event fired, a monster went down — washes the screen behind
  it. A quiet turn card gets none of it, which is exactly what makes the loud one read.
- The turn banner replays its entrance when the device changes hands.
- A fight shakes on a roll that fell short and glows when the monster drops, once per
  round rather than once per fight.

Everything stops under `prefers-reduced-motion`, and none of it is longer than a beat —
these fire dozens of times an evening.

## v0.23: nobody starts alone, and the bot learns to eat

Two changes, and the second one rewrites every balance number in this README.

**The party starts in pairs.** One to a corner read well — everyone the same distance
from the middle, nobody with a head start — but it also meant **nobody was ever next to
anybody**, and half the rules written since need exactly that: the doctor can only patch
somebody adjacent, the Fisher's hook reaches one tile, handing something over needs a
shared tile, and §8's invitations reach only as far as the starter's own legs. That
spread is how a bug that made self-healing do nothing survived twenty versions.

Now each pair takes a corner, one player on it and one beside it, and an odd party makes
a **trio** at the last corner rather than stranding somebody on a corner of their own.
Partners take the *rim* neighbours, so the whole party still starts three tiles from the
dragon and nobody opens inside the smoke. Two or three separate corners still means the
hidden map is worth talking about — putting everybody on one tile would have deleted the
exploring, which is the actual game.

It does what it was for: **friends joining a boss fight went from 0.39 per fight to
0.65**, and boss fights got bigger rather than more numerous (12.3 fights a game down to
8.3, with more people in each).

**The sim bot eats now.** It never had, for twenty-two versions, and not eating is
precisely what kills you — so every wipe figure this README has ever printed was badly
pessimistic. Teaching it to eat when hurt, on its own, took five players from **40% wins
and 26% wipes to 74% and 5%**. The game did not get easier; the measurement got honest.
`tools/sim.ts` also takes a party size now (`npx vite-node tools/sim.ts 800 3`), and
counts group fights, allies and meals alongside the endings — a party that never fights
together and one that always does post identical win rates otherwise.

| Players | Win | Out of time | Wiped |
|---|---|---|---|
| 2 | 58% | 17% | 25% |
| 3 | 71% | 17% | 12% |
| 4 | 75% | 19% | 6% |
| 5 | 87% | 11% | 2% |

**That is well outside the brief** — CLAUDE.md asks for roughly a third wins, a third
out of time, a third wiped — and the sizes no longer land in one band. It is a decision
for the owner rather than a knob to turn quietly mid-playtest, and it is now the top
item under "Still open". Worth holding on to while deciding: the bot is still worse than
a family, so these remain a floor.

## v0.24: the ground gives way

Reported from the table: *"if a player invites all four others with little gear, it is
really easy to kill the final boss."* True, and worse than it sounds — a 25-health
dragon against four people rolling three dice each is not a fight, it is a formality,
and it was the ending of the whole evening. Four changes, and they turned out to be one
change.

**The dragon carries 9-13 health for every player at the table.** Mid bosses keep the
half-slope they were tuned to; the dragon takes the full one and then some, so a full
party needs three or four rounds and pays a health each for every round they fall short.
Bringing everybody is still right. It is no longer free.

**The dragon sleeps through the opening** and lands on the middle of the map on turn 6.
Until then there is no smoke, no blip, and nothing to walk into — the middle is an
ordinary mountain. The point is the order of the evening: you should arrive at the
ending carrying what the middle of the game gave you, and a dragon findable on turn two
lets a lucky party skip that and a hasty one throw the game away in one roll.

**Bandits keep arriving**, more often the later it gets. The board used to be laid out
once and then only ever empty out; by turn ten the ground was searched, the gear bought,
and a turn was walking.

**And the rim falls in.** Every quarter of the game the outermost ring of the board
drops away — turns 4, 8 and 12 of a sixteen-turn game — and the board goes 61 tiles, 37,
19, 7. Anybody still standing on the ring when it goes is **out of the game for good**.

That last one is the one that changes how the evening feels, so it is fenced carefully:

- **A full turn's warning**, shouted on the banner, and the doomed ring is drawn cracked
  on the ground itself. One step always gets you clear, so falling in is a mistake
  rather than bad luck. The sharp case is a player who is *down* when the warning comes
  — they need the doctor or the fisherman's hook, and that is meant to be sharp.
- **It tells you where the middle is**, which the hidden board otherwise refuses to. A
  deliberate trade: a game that ends in a fight has to let the party *find* the fight,
  and a crumbling edge says "the middle is that way" without printing a map. **"We never
  found the dragon" is gone as a way to lose.**
- **It stops at seven tiles**, the dragon's mountain and the ring around it, rather than
  at one. The last tile standing would be the dragon's own, and a tile with the dragon
  on it is not somewhere a player can stand.
- Monsters and hazards on the ring go over with it. The dragon **backs up a tile**
  instead, because an ending that falls down a hole is not one.

**The board is 61 tiles again** (it was cut to 37 in v0.22 to shorten the evening). The
collapse is a better version of that lever: it shortens the game by closing the distance
rather than by never having had any. And the board's furniture — cities, woods, chests —
is now **counted off the tile count** instead of written down, because the hand-tuned
numbers went stale the moment `RADIUS` moved, twice.

**The action bar moved under the map.** It was in the top corner of the sidebar, which
is a diagonal across the whole screen from the hex a child has just tapped.

| Players | Win | Out of time | Wiped | Rounds | Individual goes |
|---|---|---|---|---|---|
| 2 | 45% | 20% | 36% | 10.2 | 20 |
| 3 | 44% | 27% | 29% | 10.7 | 32 |
| 4 | 41% | 34% | 25% | 11.6 | 46 |
| 5 | 48% | 35% | 17% | 11.5 | 58 |

800 games each. Every size inside a 41-48% band, which is the tightest this has been —
and back inside the brief after v0.23 drifted to 85%. Timeouts are now parties who
*found* the dragon and could not finish it, which is a different and much better way to
run out of time.

## v0.25: what happened while you waited

Three things, and they are all the same complaint: **the world moves while the device
is crossing the table, and nobody was being told.**

**The turn card now opens with a "Meanwhile".** Which way each wanderer went — the
tornado south-east, the pirates west — as a coloured chip apiece, and under it
everything the opening actually did: the rim falling in, the dragon landing, whoever a
hazard caught and what it cost them. It is directions and never tiles, because the
board is hidden and a grid reference on the card would hand the table the thing the
whole design withholds. And the lines are read back off the log rather than written out
by each effect, so a new hazard reports itself for free.

**Walking onto a thief offers a fight instead of starting one.** §5.5 makes the robber
and the pirates the one encounter you can buy your way past — and the choice only ever
existed when *they* walked onto *you*, because stepping onto their tile started the
fight before anybody was asked. Now the bar says *"The Robber is here, holding $6 of
yours. Fight for it, or hand over the rest"* and both are buttons. Everything else on
the board is unchanged: walk into it and you are in it.

**And beating a thief hands back every coin they took.** Their stolen *gear* always came
back. The money went nowhere at all — `carrying` went up when you paid them off and was
never paid out to anyone — which quietly made "catch them to get it back", the entire
reason chasing one is worth a turn, untrue. It is split between everybody who swung,
with the odd dollars to whoever picked the fight.

Balance is unmoved: 49% wins at five players, 44% at two, against 48/45 in v0.24. The
bot always fights a thief now, which is how the sim measures the money coming back.

## v0.26: the green stone

The equipment problem, stated plainly: gear is one number in one of three slots, and by
turn six everybody holds +2 in all three. After that a find is a shrug, and *keep it or
sell it* — the decision §10 exists to protect — always answers "sell it".

More numbers would not fix that. They would inflate the single digits that make this
game legible to a seven-year-old, which is the property most at risk from any depth
system. So the rule the whole thing rests on is:

> **Gear gives numbers. Stones give verbs.**

A stone never changes a stat. It gives you **a button you did not have before**. Nothing
has to be remembered, because the ability *is* the button and the button says what it
does — the action bar has always shown only what you can actually do right now.

**One stone, three meanings.** A player carries at most one, and may move it between
their weapon, coat and boots for nothing on their turn. That is the decision, and it is
re-made every time the game changes shape: the stone is not a thing you own, it is a
question you answer — *what do I want this to be today?*

| The green stone, in your… | does |
|---|---|
| **weapon** — *Spoils* | Win a fight and everyone who swung finds something to eat |
| **coat** — *Second wind* | Once a game, a blow that would put you down leaves you on one health |
| **boots** — *Dig again* | Once a game, search ground somebody has already been over |

Spending is tracked per setting, so the coat's save and the boots' dig are separate, and
a spent one is greyed out on the strip and in the party list — a once-a-game power a
child forgets they have is a power they never had.

Three rules the next two colours have to hold to as well:

- **No stone may show you the board.** The hidden map is what the note-taking and the
  talking across the table are for, and a reveal would delete both.
- **No stone may do a role's job better than the role does it.** None of these heals,
  sees further, or hits harder. The roles are the game's identity.
- **No invisible passives.** Either it is a button, or it is drawn where you can see it.

**They are rare, and only ever go to somebody empty-handed** — off a body, out of the
ground, out of a chest. That one rule does a lot of work: it means a second find is
never a dud, and it spreads stones round the party without a rule saying so. A search
rolls for one *on top of* its card, never instead of it. Two of five children get one in
a typical game; that is the dial to turn if the table wants them commoner.

Balance is unmoved, which is the point of the design: **46% wins at five players against
48% in v0.24**, inside the noise. Every party size is now in a 44-47% band.

| Players | Win | Out of time | Wiped | Stones a game |
|---|---|---|---|---|
| 2 | 47% | 20% | 33% | 0.9 |
| 3 | 47% | 24% | 29% | 1.2 |
| 4 | 44% | 33% | 23% | 1.6 |
| 5 | 46% | 39% | 15% | 1.8 |

800 games each. **Red and blue are designed and not built.** Red is *you, now* —
re-throw your dice, ignore one failed round, one guaranteed escape. Blue is *everybody
else* — shout for help one tile further, take a hit meant for a friend on your tile,
hand something across a gap. If they make the party too strong, the answer is the same
system pointed the other way: give the dragon a stone.

## Still open
- **River and rail travel (§5)** — the optional $1 fast travel.
- **Four event cards** that need effects lasting beyond the moment they are read:
  *Foggy morning*, *Trade caravan*, *Scarecrow*, *Lost puppy*. They need a modifier
  system; the other ~28 cards are in.
- **Special supply (§12)** — the rulebook's tier-2 consumables. Tier-2 *gear* is in as
  the +1/+2 grades; this is the other half.
- **Must mid bosses die first? (§15)** — nothing stops a party running at the dragon
  on turn one. The dice make that a bad idea, but no rule forbids it.
- **The other two stones.** Green is in (v0.26); red and blue are designed and written
  up there and not built. The other half of that direction is still open too: **random
  skills on monsters late on so they keep pace**, which is also the balance lever if
  three colours of stone make the party too strong.
- **Undo is unbuilt.** Autosave is in as of v0.21 and rests on the same groundwork, so
  this is now the cheap half of the pair. The seed is visible and typeable in the header.
- **The bot never spends its money**, so the sim's purse line is gross earnings, not
  savings. It says money is reaching the party; it says nothing about whether the
  shop is worth walking to.
- **Two-player games are the hardest by some way** — 36% wipes against 17% at five. A
  pair *should* struggle, so this may be right rather than wrong; it is the number to
  watch if the kids play in twos.
- **A dragon fought thirteen times.** At five players the sim picks a fight with the
  dragon about thirteen times a game: the arena delivers the party to it, and a bot
  flees at one health. Damage accumulates across attempts, so the siege works — but
  watch whether it *reads* as a siege at the table or as the same fight on a loop.
- **The group-fight UI is verified by construction, not by eye.** The rules underneath
  it have 20-odd tests and the owner has played it, but the invite and loot-handout
  buttons have never been driven in an automated browser run: the random-walking bot
  cannot reliably get a party to a mid boss, and two attempts timed out.
- **The art is two hands.** The drawings are cream paper; the app shell around them is
  dark slate, and the hex tiles use their own older SVG renderer. Moving the shell onto
  the paper theme is the remaining art job.

## Notes on this build

- **All the artwork is original.** `hex-rpg-tiles.html` and the card and token files
  were never available; the fields, forests and cities are drawn from scratch in
  `src/ui/Tile.tsx` and recolour from CSS custom properties.
- **Tiles are compositions.** Each carries one element per side — field, forest, city
  or water — and holds up to three, which is what the rulebook means by "a tile may
  carry more than one". `Tile.base` is the dominant terrain the rules key off.
- **Two poker decks**, resolving §15's open question the way the spec suggested: one
  for events, one for searches, so a run of face cards cannot skew both at once.
- **Where the rulebook leaves a choice, the code says so in a comment** at the place
  the choice is made.
