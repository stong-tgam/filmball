# Hex RPG — web app

Hotseat (one device, passed around) digital version of the Hex RPG tabletop game.
Built to `reference/hex-rpg-rulebook.md`, with `reference/webapp-spec.md` as the build
plan.

**This build is v0.31, and it is the one where the game changed shape.** A fight used
to be three dice against a health bar. It is now **a mini-game the table plays
together**: a monster deals a poker card, the suit picks the game — Quick Draw, Act It
Out, True or Poo, Puzzle — the rank picks how hard, a clock runs, and *the family*
decides whether they did it. Everything else in this list is downstream of that.
**The goal: beat the dragon on the last turn, together.**

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

Two to five players — knight, rogue, scout, doctor, fisher, chosen at the table — split
into **teams** (two or three make one; four make two; five make three and two) and start
on **3 health and $2** on the corners of a 37-tile board **they cannot see**, which
loses its outer ring halfway through and the next one at three quarters. Each turn a
poker card turns over and a high one brings an event, more often the later it gets. Then
each team walks two tiles, one at a time, and takes one action: search the ground, fish
a river, trade in a city, hand something over, or **take on** whatever they have found.

A fight is a run of mini-games — one card for a bandit, two for an ogre, three for the
dragon — and the team has to win **all** of them. Miss one and the fight is lost: a
health off everybody, and the monster is standing there tomorrow exactly as it was.
Health at zero costs a player their **skill**, never their place at the table. Gear buys
seconds, hints and health rather than damage. Four hazards wander the board. **On the
last turn everybody is carried to the dragon whatever they are holding**, and that is
the evening.

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

## v0.27: three stones

Red and blue, and the grid closes:

| in your… | **green** — *keep going* | **red** — *you, now* | **blue** — *everybody else* |
|---|---|---|---|
| **weapon** | **Spoils** — win a fight and everyone who swung finds something to eat | **Second swing** — throw your dice twice and keep the better roll | **Carry** — your shout for help reaches one tile further |
| **coat** | **Second wind** — a blow that would put you down leaves you on one | **Grit** — a round that falls short costs you no health | **Take the hit** — a friend's blow lands on you instead |
| **boots** | **Dig again** — search ground somebody has already been over | **Slip away** — backing out of a fight is certain to work | **Long arm** — hand something to a friend a tile away |

The rows mean the same thing in every colour: **weapon is the fight, coat is surviving,
boots are reach.** Nine abilities from three objects, none of them a number, and a child
never has to memorise the table — what a stone does is written on the button that does
it, and a stone you are not carrying shows nothing at all.

**Green's two big powers fire once an evening; red's whole set comes back every fight.**
That is what makes red the *now* stone: small, and there every time. It also needed a
second kind of bookkeeping — a fight-limited power lives on the fight
(`Combat.stonesSpent`), which disappears when the fight does, so there is nothing to
reset and nothing to forget to reset.

Two of the nine are worth calling out:

- **Second swing is its own button in the fight**, not an automatic re-roll on a bad
  round. Choosing *which* round to spend it on is the decision, and a re-roll that
  happens to you is not a moment.
- **Take the hit fires by itself, but only while the holder stays standing.** A child
  asked "do you want to save your sister?" every round says yes every round, so the
  automatic version is the honest one — but heroism that swaps one of them for the
  other is a trade nobody chose, so it sits the round out rather than backfiring.

**And the dragon carries a stone now** — green, so once in the fight the blow that
should have finished it leaves it on one health. That was added as the *counter* to the
party's three colours, and measured at doing **nothing at all** to the win rate: the
dragon fight is a siege spread over a dozen attempts, so one health is a rounding error.
It is kept for the beat, not for the balance. What actually paid for the stones was the
dial that has always done it: the dragon went from 9-13 health a head to **10-14**.

| Players | Win | Out of time | Wiped | Stones a game |
|---|---|---|---|---|
| 2 | 48% | 22% | 30% | 0.9 |
| 3 | 46% | 27% | 27% | 1.2 |
| 4 | 43% | 36% | 21% | 1.6 |
| 5 | 45% | 43% | 12% | 1.9 |

800 games each. Red and blue were worth **+6 points on their own** — the band ran 48-53%
before the dragon was paid — and the finished set sits at 43-48%, which is where v0.26
was. The stones are a decision, not a difficulty setting, and that is what these numbers
are meant to show.

## v0.28: our drawings

**The upload feature was real and unreachable.** There was a store for the children's
own pictures, a control to upload one, and a shrink-and-square step to keep them small —
and the only screen that used any of it was `gallery.html`, a second HTML entry point
that is *not in the build the family plays*. So for fourteen versions the answer to "can
we use my drawing?" was yes, in a page nobody could open.

It is in the app now: **Our drawings**, on the title screen and in the header. Every
picture in the game, in one list — the five of you, five monsters, three stones, fifteen
pieces of gear, five boss features and the food. Photograph a drawing, tap the square,
and it replaces ours.

Three things that had to change underneath:

- **An uploaded picture now wins everywhere at once.** Only the round token honoured
  uploads before, so a photographed frying pan showed up on the find card and nowhere
  else — not in the party's kit, not on the shop shelf, not in the fight. Fifteen places
  drew the art directly and never asked. There is one component that asks now
  (`<Art slot>`), and everything goes through it.
- **The list reads itself off the game's own data**, so a new stone or a new piece of
  gear turns up in the art room by itself and nothing can be quietly left out. It only
  lists slots something actually reads: a square that takes a drawing and never shows it
  is a promise broken to the one person least likely to forgive it.
- **Saving them to a file**, because the pictures live in one browser on one device.
  They survive the game being rebuilt — the artifact keeps its drawings when I republish
  it — but not a cleared cache, and they do not travel. The file is how they get onto
  the other tablet, or back to me to be baked in for good. Importing **adds to** what is
  already there rather than replacing it, so bringing one tablet's drawings to another
  cannot cost an evening's work.

Pictures are squared off and shrunk to 320px on the way in, so a phone photograph does
not eat the storage budget: all 56 slots fit in about a megabyte.

## v0.29: everything has a face

The art room went in last version and immediately showed up what was still missing: you
could photograph a drawing of your knight and it would appear on the title screen, on
the find card and in the shop — and **not on the board, not on the compass, and not in
the party list**, which is where a child actually looks.

Because those three were never pictures in the first place. A player's piece was an
initial in a coloured circle. A wanderer was **an emoji on a plaque** — the one place in
the game where a system font decided what something looked like, and it rendered at
three different weights on three different devices. And the compass blips, which are the
only map a *player* ever gets, were coloured dots with a number on them.

All three are drawings now:

- **Player pieces** carry the role's drawing, on the role's colour.
- **The wanderers** have drawings at last — a tornado and a traveller under an umbrella,
  in the same marker-on-card hand as everything else — and two new squares in the art
  room. The robber and the pirates deliberately do *not* get their own: they are one
  character wearing two hats, so the thing that walks the board points at the monster's
  picture. Two squares for one character would leave one of them undrawn.
- **The compass** shows the picture on each blip with the step count in a corner bubble,
  your own drawing at the middle, and the same little pictures down the read-out beside
  each line. Your friends, the tornado and the smoke on the wind are recognisable now
  rather than being three colours you have to remember.
- **The turn banner and the party list** show each player's drawing too.

Two rules that fell out of doing it, both worth keeping:

- **The colour stays behind the drawing, never replaced by it.** Colour is how a
  seven-year-old finds their piece at a glance; the picture is how they know what it is.
  Both, always.
- **The name of a picture is written down once** (`src/artslots.ts`), the same way every
  colour is. The compass blip carries the slot alongside the colour, so the dot and the
  token cannot show different drawings — which is exactly the bug the colour rule was
  written to prevent, one layer up.

Which means the art room now covers **58 squares**, and every one of them shows up
somewhere a player is looking.

## v0.30: the map you remember

Groundwork for a bigger, more featured map. Four changes, and one of them retires a rule
this repo had held since v0.8.

**You remember where you have been.** Ground a player has laid eyes on stays on their
map, drawn faded, behind the header's **Your map** button — which used to be a grown-up's
debug peek and is now the player's own record.

The old rule said, in bold, *never add a remembered-tiles cache*, and it was a good rule:
it protected the note-taking and the talking across the table that the hidden board
exists to create. It was written for a 37-tile board with five kinds of terrain. It does
not survive 91 tiles with bridges and mountains coming — at that size nobody takes notes,
they just forget, and the exploring is wasted rather than banked.

What the rule protected is protected differently now:

- **Memory is per player, not per party.** You still have to tell your sister where the
  shop is; she has not been there. The conversation survives, the bookkeeping does not.
- **Memory holds ground, never contents.** Monsters walk, hazards walk, and ground you
  left unsearched may have been searched by somebody else. A remembered tile shows
  terrain and nothing else, faded, so it can never say something that has stopped being
  true. The rule to keep is not *no memory* — it is **a memory may never lie**.

**Two tiles a turn, and you can see two.** Deliberately equal, so you can always see the
whole of where you might go — a turn is a route rather than a poke at the next hex.
Movement is still spent one tile at a time, which is what keeps an ambush able to
interrupt you halfway and keeps *push on or stop?* a real question. It also means there
is no planned route sitting in state to go stale when the rim falls or a fight moves you.

**The board is 91 tiles**, up from 61 — and it plays *shorter*: 53 individual goes at
five players against 58 before, because two tiles a turn covers ground faster than the
board grew.

**An hourglass**, ninety seconds a turn, because two tiles and a route to plan makes
turns longer and *nobody waits* is a design rule. It pauses behind a card and during a
fight, it can be switched off, and it lives in the view and never in the game state —
a wall clock in the state would make a saved game resume differently from the one that
was put down.

**And the fisherman's bargain**, ahead of bridges landing: they cross open water at will
and can never lose the rod, and in exchange they hand nothing to the party. One-way, not
exile — they can still be given to. A role that fished forever *and* fed four other
people would make the whole supply economy one player's job.

### Three things the bigger board broke, which is why it was worth doing now

- **The row letters were the literal `"ABCDEFGHI"`** — nine of them, exactly a radius-4
  board. Growing the map produced `undefined` row letters, keys reading `"undefined3"`,
  and a crash three layers down.
- **The dragon's smoke stopped being a clue.** It was a flat two tiles while sight was
  one; raising sight to two made it reach exactly as far as ordinary eyesight. A hint
  that is not better than looking is not a hint. It is derived from sight now.
- **Chests were counted off the whole board**, but they live in the river — and a river
  is a line while a board is an area. At radius 5 the old rule wanted six chests in
  eleven water tiles, so *most of the river had one*, which is exactly what the
  rarity rule exists to prevent.

Balance, 400 games a size: **52-53% wins**, a little above the 43-48% band, with the
shape moving from timeouts to wipes (five players: 52/27/22 against 45/43/12). Getting
around better means finding more trouble. `DRAGON_HEALTH_PER_PLAYER` is the dial if the
table wants it tighter.

## v0.31: the game the family plays

The pivot, and the reason for it is worth writing down because it is not a balance
note. For fifteen versions every number in this game was set by `tools/sim.ts` — a bot
playing eight hundred games of dice against itself. **The thing being optimised was a
win rate, and nobody ever measured whether a family laughed.** The stated goal was
always family time rather than simulation depth, and a dice roll is simulation depth.

**A fight is now a mini-game.** A bandit deals one poker card, an ogre two, the dragon
three, and the team has to win all of them.

| suit | game | how |
|---|---|---|
| ♥ hearts | Quick Draw | one of you draws it, the rest shout guesses |
| ♠ spades | Act It Out | one of you acts it, no words, no noises |
| ♣ clubs | True or Poo | the whole team calls it, together |
| ♦ diamonds | Puzzle | the whole team works it out |

The **rank** says how hard the thing is. The **clock** is flat per game kind: taking
time away *and* making the task harder is two punishments for one card, and the one a
table feels is the content. Fifty-two challenges are hand-written in
`src/game/challenges.ts`, every one of them attemptable by a seven-year-old, and every
one carries a hint — including the two games with no right answer, where a hint is a
second thing to draw rather than a step towards an answer.

**The app poses and times; the family judges — where there is anything to judge.** No
machine can tell whether a drawing looked enough like a dragon, and one that tried would
be wrong in front of a child, so Quick Draw and Act It Out end with the table tapping
*We did it!* or *We could not*.

**Where there is a right answer, the app marks it.** True or Poo is two buttons; a
Puzzle is four, shuffled, with three hand-written wrong answers beside the right one —
the off-by-one, the subtraction done backwards, the pattern continued by the wrong rule.
Asking a family to adjudicate whether a tomato is a fruit when the app already knows is
making them do the app's job, and it is the hard half: on a drawing a table agrees in a
second, and on a puzzle they argue. A wrong tap loses the card exactly as the clock
does; the Slingshot forgives one, which is what four buttons make room for and two do
not.

One piece of stagecraft that turned out to be load-bearing: **Quick Draw and Act It Out
hide the card from everybody but the performer.** The device sits on the table with
four people round it, so the card goes face down, the person doing it taps to look, and
taps again to hide it before the clock starts. Without that step those two games do not
work at all.

**Teams, not players.** Two or three make one team, four make two of two, five make
three and two. A team walks as one tile-stack and everybody in it plays every card —
which is why the tokens fan out on one hex, and why the banner names the team rather
than a person.

**An evening is sixteen goes, however it divides.** The table asked for eight turns
with two movements each, which is the four- and five-player game. At a flat eight a
two-player party — one team, one movement a turn — got half an evening: three
mini-games against six. The thing being budgeted was never the turn, it was the go. So
one team plays 16 turns and two play 8, and every size now measures at **six to eight
mini-games a game, with 100% of parties reaching the dragon**.

**Nobody can lose their place at the table.** Losing a fight costs a health; health at
zero costs a player their **skill** and nothing else. They keep drawing, keep acting,
keep shouting the answer. `partyLost` is gone as an ending, and so are `Player.dead`,
`fellAt`, `fellOn` and the whole get-up-after-a-turn subsystem — nothing could set them
any more. The abyss at the board's edge is the one thing that removes anybody at all.

**Every role has a button and something that is always true.**

| | button, once a fight | always |
|---|---|---|
| knight | **Hold the line** — the fight is not over; that card comes back as a new one, and the knight pays a health | Take the hit — wears a lost fight alone |
| rogue | Peek — the hint, without spending the team's | Light fingers — one extra thing off a body |
| scout | Keep looking — fifteen more seconds, on the clock that is running | Sharp eyes — a ring further, and a second look in a wood |
| doctor | Patch up — a health for a friend, and their skill with it | Field kit — food they hand over is worth one more |
| fisherman | Cast again — throw this card back | The rod — fishes, crosses water, never loses it |

**Hold the line is the best moment in the game**, and it is built to be one: the table
watches the fight end, and *then* the knight stands up. Automatic would delete the
moment and free would make a three-card dragon a formality, so it is a button that only
exists on a lost fight, it costs the knight a health nobody else pays, and it is the
only thing in the game that undoes a missed card.

**Gear: two slots stay dead simple and one carries the whole decision.**

| slot | what it does |
|---|---|
| coat | +1 health, and health is skills |
| boots | +10 seconds on every clock, all fight |
| your thing | **one rule you may break**, once a fight |

The five things, one per suit and a wild:

| | suit | you may |
|---|---|---|
| Frying Pan | ♥ Quick Draw | **both of you** draw it, on the same paper |
| Wooden Sword | ♠ Act It Out | make **noises**. Still no words |
| Big Stick | ♣ True or Poo | **ask the others** — the other team calls this one for you |
| Slingshot | ♦ Puzzle | have **two goes** — get it wrong once and pick again |
| Broom | any | **swap over** — somebody else does it, and you have seen the card |

Plus the fisherman's rod (**reel it in** — the guessers may ask one yes-or-no question),
because it lives in that slot and can never be swapped away.

**The rules are things the table does, not things the app checks.** "Noises allowed" is
not enforced anywhere and never will be — which is exactly what makes this the right
home for depth. And each rule names a suit, so an ogre dealing a spade becomes *who has
the sword?* A fine piece bends its rule twice.

**One hint a fight, for anybody.** Hints used to come off boots, which meant a party
that never found a pair never saw one — and all 52 hints were written on the promise
that gear would not gate them. The rogue's Peek is a second one.

**Turn 8 is the dragon, for everybody, wherever they were standing.** This removes the
two worst endings a hex crawl has — "we never found it", and "we found it and stood
next to it while the clock ran out" — and it is why nobody has to play efficiently. A
team that spent the evening searching woods and losing to bandits still gets the
ending, and gets it with everybody in it.

**The board came back to 37 tiles.** Sixteen goes of two tiles is sixteen tiles of
walking; spread over ninety-one that is mostly scenery nobody stands on. The collapse
re-times to two marks — halfway, and three quarters — so the last turn is fought in the
seven tiles round the dragon.

Gone with the dice, all of it deliberately rather than by neglect: escape rolls,
§8's invitations, support pledges, enemy health bands, damage that accumulated between
fights, per-party boss scaling, and the three stones (which need redesigning from
scratch, not reinterpreting).

**The sim can no longer measure whether this is fun**, and now says so at the top of
its own file. A bot cannot draw a dragon; it tosses a constant. The win rate it prints
is an artefact of that constant and should not be tuned against. What it still measures
honestly is pacing:

| players | teams | turns | fights | mini-games | met the dragon | lost to the abyss |
|---|---|---|---|---|---|---|
| 2 | 1 | 16 | 3.5 | 7.8 | 100% | 0.1 |
| 4 | 2 | 8 | 3.8 | 8.5 | 100% | 0.2 |
| 5 | 2 | 8 | 3.8 | 8.4 | 100% | 0.4 |

## Still open

- **Nobody has played v0.31 at a table yet.** Every number below the mini-games is a
  guess until a family sits down with it, and the sim cannot help: a bot cannot draw a
  dragon. The three things to watch are whether **eight mini-games is a good evening**,
  whether **losing a fight on one missed card** is too sharp for a seven-year-old, and
  whether the flat clocks are the right length.
- **The 52 mini-games will repeat.** A few evenings and a family has seen one twice.
  Generating them from an LLM is the fix, and `Challenge` is deliberately shaped like
  what a model would return, so it is a source change rather than a redesign.
- **The stones need redesigning from scratch.** They gave verbs that hung off dice
  rolls, rounds and escape odds; none of those exist. Removed in v0.31 rather than bent
  into something that would be a stone in name only.
- **Skills for the mini-game are one each and untested.** Take the hit, Peek, Keep
  looking, Patch up, Cast again. They are the entire consequence model for health, so
  if they turn out to be dull, health stops meaning anything.
- **Bridges are half built.** `src/game/bridges.ts` generates them and keeps the board
  in one piece; nothing calls `canWade`, so water is not yet a barrier and a bridge is
  not yet worth anything.
- **Mountains**, from the same conversation as the bridges. Not started.
- **River and rail travel (§5)** — the optional $1 fast travel.
- **Four event cards** that need effects lasting beyond the moment they are read:
  *Foggy morning*, *Trade caravan*, *Scarecrow*, *Lost puppy*. They need a modifier
  system; the other ~28 cards are in.
- **Special supply (§12)** — the rulebook's tier-2 consumables. Tier-2 *gear* is in as
  the +1/+2 grades; this is the other half.
- **Undo is unbuilt.** Autosave is in as of v0.21 and rests on the same groundwork, so
  this is now the cheap half of the pair. The seed is visible and typeable in the header.
- **The bot never spends its money**, so the sim's purse line is gross earnings, not
  savings.
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
- **Three poker decks**, resolving §15's open question the way the spec suggested and
  then some: one for events, one for searches, and one the monsters deal mini-games
  from, so no two of them can skew each other.
- **Where the rulebook leaves a choice, the code says so in a comment** at the place
  the choice is made.
