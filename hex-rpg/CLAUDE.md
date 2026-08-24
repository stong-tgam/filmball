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

## Current state: v0.7, aligned to the rulebook

Every system is in, and every earlier placeholder has been replaced with what the
rulebook says. The numbers are small on purpose: **3 health, $2, one tile a turn, and
a failed roll costs exactly one health.** Do not inflate them without a playtest —
the whole game is legible to a child because it runs on single digits.

Key rules, so nothing gets "improved" back to a guess:

- **Roles (§3)**: knight +1 health, **rogue +1 attack**, **scout +1 movement**, doctor
  heals and revives. Everyone starts on 3 health and $2.
- **Combat (§7)**: roll 3 dice + attack against the enemy's *remaining* health. Over
  it, beaten. Under it, the damage sticks and you lose **1 health, flat**. Exactly
  equal, **nothing happens and you go back where you started**.
- **Features (§9)**: every monster draws one, the dragon two, before the encounter.
  Water = escape once on a river; railway = a health at the start; forest = −1 attack
  for everyone; field = +1 to the toll per player; city = $1 on a city tile, else a
  health.
- **Search (§6)**: red finds gear, black finds nothing, the joker is a thief who takes
  the bone if you have one.
- **Loot (§10)**: items only, never money. Money comes from **selling**.
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
- **Group fights (§8)** are unbuilt, and the boss maths in §7.4 assumes them.

Choices the rulebook leaves open (its §15), all marked in the code where they are
made:

- **A downed player gets up on their own after a full turn, at 1 health**, and a
  doctor reaching them is instant — §7's suggested compromise, not both rules at once.
- **Wrecked ground recovers as soon as the tornado moves on** — §15's own suggestion.
- **A beaten thief is gone for good.**
- **Two poker decks**, one for events and one for searches.
- **A city never runs out of food**, and sells gear only from the undrawn pile.
- **Hazards are placed before the party**, as §5.5 says; the party starts on the six
  corners, which is this build's choice, not the rulebook's (its sample setup clusters
  them at the top edge).
- **The tornado picks which piece of gear it takes and where it drops you.** The
  rulebook makes both the player's choice; automating them keeps a turn moving, and
  it takes the least useful piece.
- **Pass-through**: you may move *through* another player, not stop on them. Enemies
  are the opposite: onto, never past (§5).
- **A tile can be searched once per game**, or standing still beats playing.

## Open questions

Still genuinely undecided, from the rulebook's §15:

- **Must mid bosses die before the dragon?** Nothing stops a party running at it on
  turn one. The dice punish that, but no rule forbids it.
- **Group fights (§8)** are unbuilt, and the boss maths in §7.4 assumes them.

Choices the rulebook leaves open (its §15), all marked in the code where they are
made:

- **A downed player is out** (`dead`), and the turn order skips them. This is what
  the spec models and it is the decision most likely to be wrong: a child knocked out
  on turn 8 of 25 has nothing to do for the rest of family night. Escape being always
  free is the mitigation. A "knocked out, revived by the doctor" variant is a small
  change to `combat.ts` and `turn.ts` — take it as soon as the rulebook, or a
  playtest, says so.
- **Enemy and player stats are placeholders** (`enemies.ts`, `players.ts`).
- **Pass-through**: you may move *through* another player, not stop on them
  (`legalMoves` in `turn.ts`). Enemies are the opposite: onto, never past.
- **Rivers do not cost movement.** No terrain does, yet.
- **Movement is one tile a turn, two for the rogue.** That one is a rule, not a
  placeholder: a turn should be a single decision.
- **Entry side is not a rule.** Sides are stored per direction, so "which element you
  are standing in depends on the side you entered from" remains available; nothing
  uses it, and `base` decides what a tile is for.
- **Fights are one player against one enemy.** `Player.joinedFightThisRound` exists
  in the types for the party-joins-a-fight rule and nothing sets it yet.
- **A tile can be searched once per game** (`Tile.searched`), or standing still beats
  playing.
- **Nothing can be sold back**, and swapped-out gear returns to the shared pile.
- **The hazard rules are the spec's §9 defaults**, taken as suggested (`hazards.ts`).
  A tornado costs the next turn; the traveller and the thieves do not. Wrecked ground
  recovers when the tornado moves on. Players are pushed clear, monsters stay. A
  beaten thief is gone for good.
- **A feature that matches the ground adds 1 to the monster's hit** (`combat.ts`).
  The spec names five features and specifies only the water escape; the rest is a
  guess, chosen because "the ogre is strong in the woods" explains itself at a table.
- **Every event resolves the moment it is read.** No lingering effects, no markers to
  remember — that is what keeps them playable by a child. The spec's *Foggy morning*
  needs a modifier system that does not exist yet.
