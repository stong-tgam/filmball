# Hex RPG

A hex-crawl board game for kids, played hotseat on one device passed around the
table. Two to five people split into **teams**, roam a 37-tile map, loot equipment,
get knocked sideways by random events - and **fight by playing mini-games together**:
a monster deals a poker card, a clock runs, and the table draws, acts, argues or works
it out.

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
- **Protect the exciting moments.** The card turning over, the boss reveal, the loot
  drop, the event card. These get animation and space; everything else gets out of the
  way.
- **The app poses and times; the family judges — where there is nothing to judge by.**
  No machine can tell whether a drawing looked enough like a dragon, and one that tried
  would be wrong in front of a child, so Quick Draw and Act It Out end with the table
  tapping *we did it* or *we could not*. **But where there *is* a right answer, the app
  marks it**: True or Poo is two buttons and a Puzzle is four (`answerTrial`). Asking a
  table to adjudicate a question the app already knows the answer to is making them do
  the app's job — and it is the hard half, because on a drawing they agree in a second
  and on a puzzle they argue.
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
- **Anything drawing mid-game reads and writes `GameState.rngState`.** The generator's
  whole state is one number, so it saves with the game and a reloaded game draws the
  sequence it would have drawn. Return the new value in the state you return.
- **Clocks live in the view, never in `GameState`.** The turn hourglass and the
  mini-game countdown are both `useState` in a component. A wall clock in the state
  would make a saved game resume differently from the one that was put down, and the
  whole design rests on a game being reproducible from its seed.
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
src/game/     pure logic, no React - hex, rng, setup, teams, turn, combat,
              challenges, skills, actions, hazards, events, items, enemies,
              collapse, vision, sense, save, store
src/ui/       TitleScreen.tsx (who is playing), Compass.tsx (what a player
              sees), Tile.tsx (one hex), Board.tsx (the map you remember),
              CombatModal.tsx (the mini-game, the clock and the loot),
              Hourglass.tsx (the turn clock), FindCard.tsx (what a search
              turned up), HookModal/GiveModal (the fisherman's rope, and
              handing things over), ArtRoom.tsx (swap any picture for one of
              your own), art/ (the drawings, and the upload store)
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
npm test           # 400 tests
npm run build      # type-check + production build
npm run build:play # one self-contained .html, plus the artifact fragment
npx vite-node tools/sim.ts 800 5 # bot playtest: pacing, not balance - read the header
```

## Current state: v0.31

**v0.31 is the version where this stopped being a dice game.** Read the next four
paragraphs before changing anything in `src/game/`; most of what was here before them
was tuned against a number that turned out not to matter.

For fifteen versions every constant in this game was set by `tools/sim.ts` - a bot
playing eight hundred games of dice against itself. That meant the thing being
optimised was **the win rate**, and nobody ever measured whether a family laughed. The
stated goal at the top of this file was always "family time, not simulation depth". A
dice roll is simulation depth.

So **a fight is now a mini-game the table plays together** (`src/game/challenges.ts`,
`src/game/combat.ts`). A monster deals one poker card, a mid boss two, the dragon
three. The **suit** says which game - ♥ Quick Draw, ♠ Act It Out, ♣ True or Poo,
♦ Puzzle - and the **rank** says how hard the thing is. A clock runs, and then the
table taps whether they did it. Win every card and the monster is beaten; miss one and
the fight is lost, which costs a health and nothing else.

What that change dragged with it, in one list, because half of these look like
regressions if you meet them cold: the board went back to 37 tiles, the party plays in
teams, the evening is a fixed number of goes, health only ever costs you your skill,
gear buys time and hints instead of damage, the stones are gone, and the sim can no
longer measure fun and says so at the top of its own file.

Key rules, so nothing gets "improved" back to a guess:

- **Teams are the piece that moves** (`src/game/teams.ts`). Two or three players are
  one team; four split into two of two; five into three and two. **A team walks as one
  tile-stack, and everybody in it plays every mini-game** — which is why it has to be
  one stack, and why a hex with three tokens on it is the first thing the table sees
  about how this game works. `Team` is deliberately a list of ids and nothing else: no
  position, no health, no kit. Everything a team appears to own is owned by its members
  standing on the same tile, and keeping it that thin is what let every rule written
  before teams existed carry on working untouched.
  - **Turn order is still an index into `players`**, and it only ever lands on a team's
    first member. `endTurn` walks teams, not people.
  - **Two is a real minimum**, not a default. Every game in the box needs somebody to
    guess, to argue, or to be drawn for. One child and a timer is homework.
- **An evening is `GOES_IN_AN_EVENING` (16), however it divides** (`turnLimitFor`). The
  table asked for eight turns with two movements each, which is the four- and
  five-player game. At a flat eight, a two-player party — one team, one movement a turn
  — got **half an evening**: measured at three mini-games against six, and half the
  ground covered. The thing being budgeted was never the turn, it was the go. So one
  team plays 16 turns and two play 8, and every size measures at 6-8 mini-games.
- **Skills are what health is for** (`src/game/skills.ts`). Each role has **a button,
  once a fight, and something that is simply always true**. The passive is written into
  `SKILLS[role].passive` so the party list can draw it — a passive nobody can read is a
  bonus that may as well not exist.

  | | button (once a fight) | always |
  |---|---|---|
  | knight | **Hold the line** — the fight is not over: that card comes back as a new one, and the knight pays a health | Take the hit — wears a lost fight alone |
  | rogue | Peek — the hint, without spending the team's | Light fingers — one extra thing off a body |
  | scout | Keep looking — `LINGER_SECONDS` more, on the clock that is running | Sharp eyes — a ring further, and a second look in a wood |
  | doctor | Patch up — a health for a friend, **and their skill with it** | Field kit — food they hand over is worth one more |
  | fisherman | Cast again — throws this card back | The rod — fishes, crosses water, never loses it |

  - **Hold the line is the best moment the design has**, and everything about how it is
    built serves that: the table watches the fight end, and *then* the knight stands up.
    Automatic would be cheaper and would delete the moment; free would make a three-card
    dragon a formality. So it is a button that only exists on a lost fight
    (`canHoldTheLine`), it costs a health nobody else pays, and it is the only thing in
    the game that undoes a missed card. The card comes back as a **new draw** — re-facing
    the puzzle you just failed, with the answer on screen, is a formality with extra
    steps.
  - It is fenced the same way `whoTakesTheHit` is: **never while it would take the
    knight's own last health**. Saving the fight at the cost of your own skill is a
    trade nobody chose.
  - **One use per fight, not per game.** A power that fires once an evening gets hoarded
    and then forgotten, and five children hoarding five buttons is five buttons nobody
    presses.
- **Roles**: knight +1 health, scout +1 sight, doctor patches people up, **fisherman
  fishes and hooks**. Everyone starts on 3 health and $2. Four are rulebook §3; the
  fisherman is this build's own. The rogue's old +1 attack and the scout's +1 movement
  went with the dice and the per-player turn — their character now lives in their
  skill, which is the better place for it.
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
    onto your tile or hauls you onto theirs. Dragging a friend with no health left to
    the doctor is the best thing it does — a health back is a **skill** back.
- **Players stack**, and since v0.31 a team always does: it is where you trade face to
  face, where the fisherman's hook puts you, and where the mini-game happens. Monsters are
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
- **Walking onto a monster finds it and *offers* the fight** (`canTakeOn`, `takeOn`). It
  does not start one. A fight is three minutes of everybody's evening with a clock
  running, so the team gets asked — and it is what makes "you do not have to kill every
  bandit" true rather than merely stated. One fight per team per turn, and a fight is
  that team's action. This is the rule the thieves always had (§5.5), generalised.
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
  spent one tile at a time**, which keeps "push on or stop?" a real question and is why
  there is no route in state to go stale. If sight ever falls behind movement the last
  step becomes a guess again; there is a test.
- **The board is 37 tiles (`RADIUS` 3)**, and it **falls in as the game runs**
  (`src/game/collapse.ts`): 37 tiles, then 19, then the 7 round the dragon. It went to
  91 in v0.30 to hold more exploring and came back in v0.31 when the evening stopped
  being about exploring. **Sixteen goes of two tiles is sixteen tiles of walking for a
  whole game**; on ninety-one tiles most of the map would be scenery nobody ever stood
  on, which is a worse map than a small one. At radius 3 a corner is three steps from
  the middle, so a team crosses the board twice and still has turns left for the things
  worth stopping for.
- **`ROWS` is sized off `RADIUS`.** It was the literal `"ABCDEFGHI"` — nine letters,
  which is exactly a radius-4 board and no more. Growing the board did not produce a
  bigger map, it produced `undefined` row letters, keys reading `"undefined3"`, and a
  crash three layers down in `distance`.
- **The rim falls twice: halfway, and three quarters through** (`COLLAPSE_MARKS`,
  `collapseRim`), and anybody standing on it is **out of the game for good**
  (`Player.gone`). It was three quarter-marks; on an eight-turn game those land on turns
  2, 4 and 6, and a ring falling before anybody has walked anywhere is not a decision,
  it is a tax on where you happened to start. Two marks leave the last turn fought in
  the seven tiles round the dragon, which is the collapse doing exactly one job now:
  getting everybody near the middle in time for the ending. Measured at **0.1-0.4
  players lost a game**.
  - This is the **only** permanent loss left in the design, so it stays fenced: a full
    turn's warning on the banner, the doomed ring drawn cracked, and one step is always
    enough to get clear. Falling in is a mistake, never bad luck.
  - **It tells you where the middle is**, which the hidden board otherwise withholds.
    Deliberate: a game that ends in a fight has to let the party find the fight, and a
    crumbling edge is the one honest way to say "the middle is that way" without
    printing a map. It also ended "we never found the dragon" as a way to lose.
  - **`LAST_RING` is 1, not 0.** The last tile standing would be the dragon's own, and
    a tile with the dragon on it is not somewhere a player can stand — walking onto it
    starts a fight, and only one fight runs at a time. Seven tiles is the arena.
  - Monsters and hazards on the ring go with it; the **dragon backs up a tile instead**,
    because an ending that falls down a hole is not one.
- **Turn 8 is the dragon, for everybody, wherever they were standing** (`finalStand`).
  The table asked for this in as many words, and it is the best rule in the game: it
  removes the two worst endings a hex crawl has — "we never found it" and "we found it
  and stood next to it while the clock ran out". Everybody is carried to the middle and
  the last three cards are dealt to the whole table at once. It is also why nobody has
  to be efficient: a team that spent the evening searching woods and losing to bandits
  still gets the ending, and gets it with everybody in it. Measured: **100% of parties
  meet the dragon**, at every size.
  - `endCombat` ends the evening once the table has looked at how it went. A half-turn
    of walking about after the dragon fight would be the worst possible note to finish
    on.
- **The dragon sleeps through the opening** (`dragonWakesOn`, about a third in):
  `Enemy.dormant` means no smoke, no blip, nothing to walk into, and the middle is an
  ordinary mountain until it lands on it. It is left on the board rather than held back,
  so nothing else can be placed on the middle tile. A **share** of the limit rather than
  the literal turn 6 it used to be: at eight turns that would land it two turns before
  the last stand drags everybody to it anyway, and the loudest beat in the game would be
  a footnote.
- **Bandits keep arriving, more often the later it gets** (`mobArrivalChance`,
  `wanderIn`). The board used to be laid out once and then only ever empty out. Only
  bandits: an ogre appearing out of nowhere is a boss nobody could have planned for.
- **How hard a monster is, is how many cards it takes** (`EnemyProfile.cards`): mob 1,
  mid boss 2, thieves 2, dragon 3. One small number, and a child can be told "the dragon
  is three games" and hold it for a whole evening. It replaced a health band, an
  accumulating damage counter and a per-player scaling rule, none of which anybody at
  the table could ever see.
  - **It does not scale with the party**, and that is not an oversight. Dice damage did,
    because five people rolling is five times the dice. Five people *guessing* is not
    five times faster than two, it is louder. Bringing everybody helps because everybody
    is thinking, which is the entire point of the change.
  - **Nothing carries between fights.** Lose to the ogre and it is standing there
    tomorrow exactly as it was. A wounded-enemy number was what turned the dragon into a
    siege spread over a dozen goes, and a siege is the opposite of a moment.
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
- **Two clocks, and neither is part of the game.** The turn hourglass
  (`src/ui/Hourglass.tsx`, 90 seconds, calls the same `endTurn` the button does) and the
  mini-game countdown (`useCountdown` in `CombatModal`). Both live in the **view and
  never in `GameState`** — a wall clock in the state would make a saved game resume
  differently from the one that was put down. The hourglass **pauses behind a card and
  during a fight**, which now matters twice over: the mini-game has its own clock, and
  two clocks running at once on one screen is a thing nobody can play.
  - The mini-game clock's timeout is its **own effect**, not something the tick does
    inline. Calling the store from inside a `setState` updater is a side effect in the
    render phase, and React is entitled to run it twice — which would cost the team two
    health for one clock.
  - **But the clock is *reset* during render, never in an effect**, and so is the card's
    deal/look/run stage. An effect runs after the frame paints, which left a new card
    showing the previous one's number — a 25-second True or Poo opening on 60 because
    the puzzle before it had 60 — and, worse, left the interval ticking against a card
    that had already been answered. `lostTrial` fires on zero, so that was a lost fight
    waiting for a slow tap. The scout's mid-clock seconds are added as a *difference*
    for the same reason: a reset would make Keep looking a restart.
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
- **The board scales to the party** (`monsterCount`). Handing five players' worth of
  board to two children is a different game, not a harder one. Monster *counts* scale
  linearly; monster *difficulty* does not scale at all any more (see the cards bullet
  above), and the turn limit does the balancing instead (`turnLimitFor`).
- **Gear (`src/game/gear.ts`): two slots stay dead simple and one carries the whole
  decision.** After v0.31 all five weapons were the same object with a different
  drawing, and so were the coats and the boots — fifteen items, three behaviours, which
  is exactly the flatness the stones were invented to fix in v0.26 and which came back
  the moment the dice left.

  | slot | what it does | kinds |
  |---|---|---|
  | coat | **+1 health**, and health is skills | one; all five identical |
  | boots | **+`SECONDS_PER_BOOT`** on every clock, all fight | one; all five identical |
  | your thing | **one rule you may break**, once a fight | five, one per suit plus a wild |

  - **Some gear being just a coat is deliberate.** A game where every object is a
    special rule is a game nobody can hold in their head, and "a coat is a health" is a
    sentence a seven-year-old owns forever. The attention that buys is what pays for the
    third slot.
  - **The rules are things the table does, not things the app checks.** "Noises allowed"
    is not enforced anywhere and never will be — the app poses and times, the family
    judges. That is precisely what makes this the right home for depth: a rule card
    costs nothing to adjudicate and changes how the next ninety seconds actually go.
  - **Each rule names a suit**, and that is the point of the slot: an ogre deals a spade
    and the table asks *who has the sword?* The pip is drawn on the button
    (`SUIT_OF`), because a greyed button with the reason only in a tooltip teaches a
    child nothing on a tablet.
  - **The club item is a table rule, not a second go**, and that is deliberate. True or
    Poo is two buttons, so forgiving a wrong answer there is not a help, it is a
    guaranteed pass — a button that says "win this card" is exactly the kind of thing
    the stones were removed for. The Big Stick asks the *other team* instead.
  - **The fishing rod has a rule too.** It lives in this slot and `equip` refuses to
    swap it away, so without an entry the fisherman would be the one role locked out of
    the whole system. There is a test.
  - **A fine (+2) piece bends its rule twice** (`usesOf`). `FINE_VALUE` had to keep
    meaning "better" in a game with no numbers left to double.
  - **`gearBlurb` says what a piece is for, in one place**, because four screens draw
    gear — the shop, the find card, the party's kit and the art room — and a coat that
    said different things in two of them is a rule the table cannot settle by looking.
- **One hint a fight, for anybody** (`HINTS_A_FIGHT`). It used to come off boots, which
  meant a party that never found any never saw a hint at all — and the 52 hints were
  written on the promise that gear would not gate them. The rogue's Peek is a *second*
  one, which is what makes that role worth having during a fight rather than only after.
  - **Every one of the 52 has a hint, including the two games with no right answer.** A
    hint on a drawing is not a step towards an answer — there is no answer — it is a
    second thing to draw that makes the first guessable, which is what an older sibling
    would lean over and whisper.
- **§8's group fight is the team, and the invitation system is gone**
  (`inviteTargets`, `invite`, `Combat.support`, `pledgeSupport` — all removed). There is
  nobody left to shout for: everybody standing on the tile is about to be shouting
  guesses anyway. The starter is still named on `Combat.playerId` because §10 gives them
  the picks, and that outlives the fight.
- **Loot distribution (§10)**: `takeSpoil(state, itemId, toId?)`. The starter keeps a
  pick or hands it to **anybody who fought** — the rulebook's own words. Deliberately
  the starter's call and not a vote: five children negotiating a dragon's hoard is not
  a mechanic, it is an evening. The purse is paid to **each** participant rather than
  split, because splitting $2 two ways is one argument and two disappointments.
- **Combat (§7) is a run of mini-games.** `startCombat` deals the monster's cards from
  a **third poker deck** (`challengeDeck` — its own shuffle, like events and searches,
  because a fight and a search drawing off one deck would make the ground the party has
  turned over decide which games they get). Then `wonTrial` / `lostTrial`, and **only the
  table can call either**. The whole hand is dealt up front so the team can see what it
  has taken on before the first clock starts — three cards is the dragon telling you
  what the next five minutes are.
  - **There is more content than there are cards** (`DECK`, `poolSize`,
    `Trial.pick`). Fifty-two cards is fixed — there is one club of each rank — so a
    fourteenth True or Poo had nowhere to live until each rank held a **pool** and the
    deal picked from it. Clubs run two deep, the rest one, and the pools are allowed to
    be **ragged**: requiring thirteen at a time or none is exactly the friction that
    stops a good one getting added at the table.
    - The pick is **stored on the trial**, not re-rolled. A reload that handed the team
      a different question mid-clock would be the app cheating, and a seed has to replay
      the evening it played. `challengeFor` wraps an out-of-range pick, so a save
      written against a bigger pool than this build has still opens.
  - **Time is flat per game kind; only the content gets harder with rank** (`SECONDS`,
    `secondsFor`). Taking the clock away *and* making the thing harder is two
    punishments for one card, and the one a table actually feels is the content. This is
    a deliberate reading of "the number is the difficulty level".
  - **Quick Draw and Act It Out hide the prompt from everybody but the performer.** The
    device is on the table with four people round it, so the card goes face down, the
    person doing it taps to look, and taps again to hide it before the clock starts.
    Without that step those two games do not work at all — the sort of thing that is
    obvious at a table and invisible in a spec.
  - **The answer is always shown when the fight ends**, on the two games that have one.
    A puzzle nobody was ever told the answer to is the one thing at a table that
    genuinely annoys a child, and it is the difference between a hard question and an
    unfair one.
  - **True or Poo and Puzzle are tapped, not self-judged** (`answerTrial`,
    `Trial.options`). Two buttons and four. A wrong tap loses the card the same way the
    clock does — a confident wrong answer and a blank stare cost a table the same thing.
    The **Slingshot forgives exactly one** (`GearRule.secondGo`), which is what four
    buttons make room for and two do not.
    - The four are **shuffled onto the trial** when it is dealt, from the game's own
      generator — never in the view. Buttons that reshuffled on render would move under
      a child's finger on every tick of the clock, and the order has to come back off a
      save the way it went in.
    - Every puzzle's three wrong answers are **hand-written** beside the right one. A
      distractor borrowed from another puzzle ("A clock", offered for *seven apples
      minus three*) is not a distractor, it is a giveaway; these are the off-by-one, the
      subtraction done backwards, the pattern continued by the wrong rule.
- **Features (§9)**: every monster draws one, the dragon two, before the encounter — and
  **all five now bite the mini-game** rather than the dice (`FEATURE_BITE`). Water =
  slips away downriver once; railway = a health before the first card; forest = ten
  seconds off every clock; field = losing costs a second health; city = no hints, it
  knows these streets. §9 named five and specified only the water escape; the rest was
  always a guess, and re-pointing it is the same guess aimed at the game that exists.
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
- **There is nothing to escape from.** The escape roll is gone with the dice, because
  the decision moved to *before* the fight (`canTakeOn`). A choice up front beats a
  gamble after, and it is a better one: you know what you are taking on, and how many
  cards it is, when you make it.
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
- **The stones are gone, and they are on the backlog to be redesigned.** Nine powers
  hung off dice rolls, rounds and escape odds, and none of those exist any more. Better
  removed than reinterpreted: a stone that gave +15 seconds would be a stone in name
  only, and the redesign should start from what a mini-game needs rather than from what
  nine existing buttons could be bent into.
- **Loot (§10)**: items, **plus a small purse** — $1 mob, $2 mid boss, $5 dragon. This
  bends §10, which is items-only, on purpose. Keep the amounts under `GEAR_PRICE`:
  the moment a mob out-earns a sale, the shop stops mattering and so does the
  keep-it-or-sell-it decision the rule exists to protect. There is a test for it.
  Money reaches the party three ways and no others — a body, the ground, and selling
  what you do not need. `tools/sim.ts` reports the party's purse alongside the
  endings; run it after touching any of the three.
- **Winning (§14)**: beat the dragon. `GameState.ending` is `"victory"` or
  `"outOfTime"` — **`partyLost` is gone**, because a team never wipes. Health only ever
  costs a player their skill (`hasSkill`), a player with no skill still plays every
  mini-game, and the abyss is the one thing that removes anybody at all. There is
  nothing left that can end an evening early.
  - `Player.dead`, `fellAt`, `fellOn` and the whole get-up-after-a-turn subsystem went
    with it. Nothing could set them any more, and a field that can only ever be true
    alongside `gone` is a field the next reader has to puzzle out.

What is left is listed under "Still open" in the README.

- `teams.ts` — `teamSizes`, `createTeams`, `membersOf`, `activeMembers`. Who walks with
  whom, and nothing else.
- `turn.ts` — `legalMoves`, `movePlayer`, `endTurn`, `canTakeOn`/`takeOn`, `finalStand`.
  The whole team walks; walking onto an enemy finds it and offers the fight; the turn
  passes to the next *team*; the last turn is the dragon.
- `combat.ts` — `startCombat`, `nowPlaying`, `wonTrial`, `lostTrial`, `useHint`,
  `useSkill`, `endCombat`. A fight is a run of cards, and the table calls each one.
- `challenges.ts` — the mini-games. A **pool per rank**, so the contents can outgrow
  the deck: 65 today, of which 26 are True or Poo. Hand-written, and shaped like what an
  LLM would return so the backlog swap is a source change, not a redesign.
- `skills.ts` — a button and a passive per role, and what health is for.
- `gear.ts` — what each slot buys, and the five rules a "thing" lets the table break.
- `enemies.ts` — profiles (`cards`, not health), placement, `enemyAt`.
- `items.ts` — the gear list, the pile, `equip`, `consume`. One pile for the whole
  game; food is the only unlimited thing.
- `actions.ts` — `search`, `openShop`, `buy`, `eat`, `takeLoot`. One action a turn
  and a fight counts as it; `eat` deliberately ignores whose turn it is. `search`
  also leaves a `Find` in the state for the screen to show; see below.
- `cards.ts` — three poker decks, drawn down and reshuffled. Events, searches and
  mini-games never share a shuffle.
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
the board grew to 91 tiles and started carrying things worth remembering — a shop, a
chest, and eventually a mountain. At that size nobody takes notes; they simply forget,
and then the exploring is *wasted* rather than banked.

**The board came back to 37 in v0.31 and the memory stayed.** Not an oversight: what
the old rule protected — telling your sister where the shop is — is protected by memory
being **per player** (`Player.seen`), not by there being no memory. And a party that now
plays as one or two teams has fewer pairs of eyes on the map than five separate
walkers did, so forgetting costs more, not less.

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
- **Monsters are hidden until somebody walks into one** (`Enemy.found`). Walking on
  finds it and offers the fight rather than starting one, so there is no ambush to back
  out of any more — the decision is up front. Once found, a monster stays on the board:
  the party paid a step for that.
- **The dragon smokes** (`SMOKE_RADIUS`) and sits at the centre. Two bounds, and it
  needs both: **at least a ring past sight**, so the smell arrives before the sight of
  the tile does; and **never the whole board** (`RADIUS - 1`), because at radius 3 a
  reach of 3 touches all four corners and every player would be told "the dragon is
  close" from the moment it lands. A hint that is always on is wallpaper.
  - On the small board those two bounds make it **equal** to sight, and that is still a
    real clue: **eyesight never reveals an unfound monster at all** (`enemyVisible`).
    Seeing the middle tile tells you it is a mountain; smelling it tells you what is on
    it. The older note here said a clue no better than looking is no clue — that was
    written about *tiles* and does not hold for the one thing eyesight is forbidden to
    show. Both bounds are derived from constants rather than written down, because a
    hand-set number here has now gone stale twice: once when sight rose, and once when
    the board shrank.
- **There is no in-app notepad.** There was one; it was removed because players keep
  notes on paper or a phone, and a text box in the sidebar was a worse version of that.
  The point stands regardless: the app remembers nothing, so the map lives outside it.

Monsters are also **scattered at random** now rather than spaced out. Even spacing was
right when you could see them coming; hidden, it makes every tile equally likely to
hold something, so exploring tells you nothing. Clumps and empty runs are what the
notes are for.

## Pacing, and what the sim can and cannot tell you

**Read this before quoting a number out of `tools/sim.ts`.**

The sim can no longer measure whether this game is fun, and the honest reading is that
it never could. For fifteen versions the win rate it printed was the thing being tuned
— which meant the thing being optimised was a bot playing dice against itself, and
nobody ever measured whether a family laughed. In v0.31 a fight became a mini-game, and
**a bot cannot draw a dragon**. It tosses `CHILD_WINS_A_CARD` and that is the honest
most it can do. **The win rate it prints is an artefact of that constant. Do not tune
the game against it, and do not tune the constant.** The real number is a family at a
table and the only way to find it is to sit at one.

What it still measures, and what it is worth running for:

- **How long an evening is.** Turns played, and how many fights the table sits through.
  Every fight is a real several minutes of real people, so the fight count is the number
  that decides whether this fits in an evening.
- **Whether the board delivers the party to things.** A run where nobody meets a mid
  boss is a board problem, not a difficulty problem.
- **Whether the economy still moves** — money found, gear picked up.
- **That a whole game runs to an ending from any seed**, without stalling.

At v0.31, `npx vite-node tools/sim.ts 800 <size>`:

| players | teams | turns | fights | mini-games | met the dragon | lost to the abyss |
|---|---|---|---|---|---|---|
| 2 | 1 | 16 | 3.5 | 7.8 | 100% | 0.1 |
| 4 | 2 | 8 | 3.8 | 8.5 | 100% | 0.2 |
| 5 | 2 | 8 | 3.8 | 8.4 | 100% | 0.4 |

**About eight mini-games an evening, one of them the three-card dragon, at every party
size.** That is the shape the whole version is aiming at, and it is what the derived
turn limit (`turnLimitFor`) exists to hold flat — at a fixed eight turns the two-player
game got three.

Still true of the bot, and still worth knowing: it is **deliberately worse than a
family** (never buys gear, never sells anything), so treat every figure as a floor. And
**fixing the bot moves the numbers without the game changing** — when a jump follows a
change to `tools/sim.ts`, say so rather than banking it as balance.

Run it after any change to the turn limit, the board radius, sight, monster placement,
the collapse, or the economy.

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
- **`art/catalogue.ts` reads the slots off the game's own data**, so a new
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

- **Are eight mini-games an evening the right number?** The sim says that is what a
  game delivers at every party size. Whether that is a good night out is the one thing
  the sim cannot tell you, and the only way to find out is to play it. If it is thin,
  the dial is the turn limit (`GOES_IN_AN_EVENING`); if it drags, it is the same dial
  the other way.
- **Is a fight lost on one missed card too sharp?** It keeps a fight to a few minutes
  and keeps a monster worth thinking twice about, and losing costs a single health and
  never a player. But nobody has watched a seven-year-old miss the first card of a
  three-card dragon yet.
- **The mini-game content will repeat.** Fifty-two hand-written challenges is a few
  evenings before a family sees one twice. Generating them from an LLM is on the
  backlog, and `Challenge` is deliberately shaped like what a model would return.

Choices the rulebook leaves open (its §15), all marked in the code where they are made:

- **Nobody is ever knocked out.** §7's compromise (get up after a turn, or a doctor
  gets you up at once) is gone because there is nothing left to get up from: health at
  zero costs you your skill and nothing else, and you keep playing every mini-game. The
  failure that rule avoided — a child with nothing to do for the rest of the evening —
  is now avoided by there being no state in which that can happen.
- **Wrecked ground recovers as soon as the tornado moves on** — §15's own suggestion.
- **A beaten thief is gone for good.**
- **Three poker decks**: events, searches, and the one monsters deal mini-games from.
- **A city never runs out of food**, and sells gear only from the undrawn pile.
- **Hazards are placed before the party**, as §5.5 says; each **team** starts together
  on its own corner (`startingSpots`), which is this build's choice, not the rulebook's
  (its sample setup clusters them at the top edge). It went one-to-a-corner, then pairs,
  and now the whole team on one tile — because a team is the thing that moves. The old
  note said partners take the *rim* neighbours so nobody starts inside the
  smoke; a whole team on the corner does that by itself.
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
