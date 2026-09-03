# Dorfromantik Hex RPG — Rulebook

> **Note added in v0.31 — the app has departed from §7, §8 and §9.**
>
> This document is still the authoritative statement of the *tabletop* game and has not
> been edited. The web build no longer resolves a fight with dice: a monster deals a
> poker card (one for a mob, two for a mid boss, three for the dragon), the suit picks a
> mini-game the whole team plays against a clock, and the table says whether they did
> it. That replaced §7's rolling, §7's escape, §8's invitations, and the dice half of
> §9's features. §10's loot, §6's search, §5's movement and §5.5's hazards are
> unchanged and still built to this text.
>
> Every departure is written down, with its reason, in `CLAUDE.md` under
> "Current state" — read that before assuming the code is wrong and this is right.

A cooperative-ish tabletop RPG played on a hexagonal board of Dorfromantik tiles.
**Goal:** defeat the final boss within the turn limit.

---

## 1. The Board

A hexagon with **5 tiles per side** = **61 tiles**, laid out randomly from Dorfromantik tiles.

Terrain types: **city, forest, field, river, railroad.** A tile may carry more than one
(e.g. a city tile with a railroad running through it).

### Coordinate system

```
        A1  A2  A3  A4  A5
      B1  B2  B3  B4  B5  B6
    C1  C2  C3  C4  C5  C6  C7
  D1  D2  D3  D4  D5  D6  D7  D8
E1  E2  E3  E4  E5  E6  E7  E8  E9
  F1  F2  F3  F4  F5  F6  F7  F8
    G1  G2  G3  G4  G5  G6  G7
      H1  H2  H3  H4  H5  H6
        I1  I2  I3  I4  I5
```

Rows A–I, 5 tiles at the top edge widening to 9 across the middle. **E5 is dead center.**

---

## 2. Components

| Component | Count |
|---|---|
| Final boss | 1 |
| Mid bosses | 2 (suggest 4 on the 61-tile board) |
| Mobs | 7 (suggest 15 on the 61-tile board) |
| Boss feature cards | 5 (water, railway, city, forest, field) |
| Weapons | 2 |
| Armor | 2 |
| Boots | 2 |
| Food / supply | 10–20 |
| Poker deck | 1 (events + search checks) |
| Event cards | ~30–35 |
| Dice | 3 uneven dice |

### The dice

Each die has **3 faces showing 1, 2 faces showing 2, and 1 face showing 3.**
Average per die: 1.67. Three dice: range **3–9**, average **5.0**.

---

## 3. Roles

Each player picks one:

| Role | Bonus |
|---|---|
| **Knight** | +1 max health |
| **Rogue** | +1 attack |
| **Scout** | +1 movement |
| **Doctor** | May heal an adjacent friend or self for +1 health as their action; can revive dead players |

**Starting resources:** 3 health, $2. *(Started at 2 health; raised to 3 — at 2 health a single failed group roll puts the whole party one hit from death.)*

---

## 4. Turn Structure

1. **Start of round:** the starting player draws one poker card.
   - **J, Q, or K** → draw an event card and resolve it.
   - Anything else → no event.
2. **Each player, in order:** move, then take **one action.**
3. When every player has acted, the round ends and a new one begins.

**Supply may be consumed at any time**, including on another player's turn or mid-fight.

### Actions (choose one per turn)

1. **Search** — only if you moved to or are standing on **forest or field**
2. **Trade** — only if you moved to or are standing on **city**
3. **Fight** — a mob, mid boss, or final boss
4. **Heal** — Doctor only

---

## 5. Movement

- Default: **1 tile**, to an adjacent hex.
- +1 per movement bonus (Scout role, boots).
- You **cannot** move past or onto an enemy tile without fighting it.
- **Optional rule (recommended on the 61-tile board):** pay **$1** to travel along a
  connected river or railroad as far as it runs.

---

## 5.5 Roaming Hazards

Four hazards wander the board: **Tornado, Homeless Person, Robber, Pirates.**

**Placement:** all four are placed **before players place their characters.**

**Timing each round:**
1. **Hazards move** — each one steps 1 tile in a random direction
2. Resolve any collisions
3. Starting player draws the poker card (event check)
4. Players take their turns

**Movement:** 1 tile, random direction, each hazard independently.
Hazards **cannot leave the board** — a direction that would go off the edge is rerolled.

**Triggering:** works **both ways** — a hazard stepping onto a player triggers, and a
player moving onto a hazard triggers.

**Staying put:** once a hazard resolves on a tile it does **not** trigger again until
one of you moves away.

### Tornado 🌪

- The player loses **all supply plus one piece of equipment** (their choice which)
- The player relocates to **any tile within 3 tiles** of where they were, their choice
- The **6 adjacent tiles are destroyed** and cannot be entered *temporarily*

### Homeless Person 🧣

- **Donate** one supply or $1 → on your **next fight**, roll **one extra die** (4 dice
  instead of 3). Once only.
- **Nothing to give** → you lose a turn taking care of them

### Robber 🦝

Fought exactly like a **mid boss**: **10–16 health**, invite adjacent friends, damage
accumulates. **Does not draw a feature card.**

- **Fight and win** → he drops **everything he has collected** so far. The starting
  player picks **2 items, or all the money** — not both.
- **Pay him off** → give him **all your money**, then flee **1 tile**

### Pirates 🏴‍☠️

Same as the Robber in every way, with two differences:

- Can only occupy **river tiles**. If a random move would put them on land, they
  **jump to the closest river tile** instead.
- They steal **an item as well as money**. Paying them off also drifts you 1 tile
  downriver.

---

## 6. Search

Draw a poker card:

| Draw | Result |
|---|---|
| **Red card** | Success — draw a random item from the item pile |
| **Black card** | Failed — nothing |
| **Joker** | A thief! Lose $1, one item, or 1 health (your choice) |

---

## 7. Combat

### Rolling

Roll **3 dice** and add your **attack value**. Damage dealt = dice total + attack.

**Recommended: damage accumulates.** The enemy keeps damage taken across rolls and
across turns. It dies when total damage ≥ its health. This is what makes the original
health numbers work — see §7.4.

### Health values

| Enemy | Health |
|---|---|
| Mob | 4–8 (random) |
| Mid boss | 10–16 (random) |
| Final boss | 20–30 (random) |

### Resolving a fight

- **Damage ≥ remaining health** → enemy defeated, loot drops.
- **Damage < remaining health** → each participating player loses **1 health**.
  You may roll again, or escape.
- **Exact tie** → nothing happens; the player returns to their starting position.
- **Escaping** costs your turn.
- **Damage stays on a wounded enemy** even if everyone escapes.

### Death

- At **0 health** a player dies and leaves a marker on the tile where they fell.
- A **Doctor** must travel to that tile and revive them → back at **1 health**.
- *(Open: the alternative rule was "consume supply to revive." Pick one, not both —
  if a dead player can eat their own food, death costs nothing. Suggested compromise:
  self-revive at 1 health after one full turn; the Doctor's revive is instant.)*

### Why 3 dice + accumulating damage

Solo player's chance to kill a mob **in one roll** with 3 dice:

| Mob health | Attack 0 | Attack 1 | Attack 2 |
|---|---|---|---|
| 4 | 63% | 88% | 100% |
| 5 | 33% | 63% | 88% |
| 6 | 13% | 33% | 63% |
| 7 | 3% | 13% | 33% |
| 8 | 0.5% | 3% | 13% |

With the original **2 dice**, a bare-handed player beat a health-4 mob only 14% of the
time, and health 6+ was mathematically impossible.

Bosses still can't be one-shot — 4 players max out at 27 damage against a 30-health
final boss — which is why damage must accumulate. With accumulation:

| Enemy | Typical party | Rounds to kill |
|---|---|---|
| Mob | 1 player | 1–2 |
| Mid boss | 2 players | 2 |
| Final boss | 4 players | 2 |

---

## 8. Group Fights

- The fight's starter may invite nearby players — **within their movement range.**
- Invited players **move onto the tile** and roll, but **do not spend their turn.**
- All dice from all participants are totalled together.
- **All participants lose 1 health** on a failed roll.

**Balance guards (recommended):**
- A player may join only **one** fight per round.
- Invitations only for **mid and final bosses** — mobs stay solo or duo.

Without these, all four players cluster and steamroll every fight, and turn order
stops mattering.

---

## 9. Boss Features

Features are drawn randomly from the feature pile **before the player encounters
the enemy.** Mobs and bosses each draw **1**. The **final boss draws 2** (no duplicates).

| Feature | Effect |
|---|---|
| **Water** | If fought on a river tile, the boss escapes on defeat to any connected river tile. **Once only.** Players cannot chase; the turn ends. It becomes a new boss encounter. |
| **Railway** | If fought on a railroad tile, **one player loses 1 health**, once, at the start of the fight. |
| **Forest** | If fought on a forest tile, **each player loses 1 attack** — that fight only. |
| **Field** | If fought on a field tile, boss gains **+1 attack × number of players** in the fight. |
| **City** | If fought on a city tile, **each player loses $1**; otherwise each loses 1 health. |

---

## 10. Loot

| Enemy | Items dropped | Starter picks | Rest |
|---|---|---|---|
| Mob | 2 | 1 | Discarded back to the pile |
| Mid boss | 4 | 2 | Discarded back to the pile |
| Final boss | 6 | 3 | Discarded back to the pile |

The starting player may **keep** their picks or **give** them to any player in the fight.

**Carry limit:** one weapon, one armor, one boot. Extra equipment can be sold.

---

## 11. Economy

| Item | Buy / Sell |
|---|---|
| Food | $1 |
| Weapon / Armor / Boots | $2 |

Trading happens on **city** tiles as your action.

⚠️ **Money is scarce.** Players start with $2; the city boss and the thief both drain
it. Selling surplus loot is the main income — worth stating explicitly. Decide whether
the city has unlimited stock or sells only from the undrawn item pile.

---

## 12. Items

### Equipment

| Type | Effect | Names |
|---|---|---|
| **Weapon** | +1 attack | Wooden Sword, Frying Pan, Slingshot, Big Stick, Broom |
| **Armor** | +1 max health | Pot Helmet, Turtle Shell, Winter Coat, Cardboard Box, Oven Mitts |
| **Boots** | +1 movement | Running Shoes, Rain Boots, Roller Skates, Bunny Slippers, Flippers |

Use 2 of each, or shuffle all 15 into the pile so each game differs.

**Optional tier 2 — final boss drops only:**
Golden Sword (+2 attack), Knight's Shield (+2 health), Jet Boots (+2 movement).

### Supply — kids' originals

Birthday cake, sunny side up egg, milk, lettuce, popsicle, orange, carrot,
strawberry, bone, candy.

- **Birthday cake** → +2 health, or heals every player on your tile by 1
- **Bone** → worthless as food, sells for $1, but if you hold it when a thief appears,
  the thief takes the bone and nothing else
- All other food → **+1 health** (capped at max)

### Supply — additions

Watermelon slice, banana, apple pie, hot dog, corn on the cob, pancakes,
grilled cheese, cherries, mushroom, honey jar, jam sandwich, pretzel, cookie.
All +1 health.

### Special supply (add once the base game plays smoothly)

| Item | Effect |
|---|---|
| Coffee | +1 movement, this turn only |
| Chili pepper | +1 attack, one fight only |
| Ice cream cone | +2 health, must be eaten the turn you get it |
| Lucky mushroom | Reroll one die in a fight |
| Water bottle | Cancels one railway boss damage |

---

## 13. Event Cards

Drawn when the starting player pulls a **J, Q, or K.**

**Targeting rule:** *terrain* events hit **every player on that terrain**; *encounter*
events hit **only the drawing player.** Write the target on each card.

### Negative (kids' originals)

1. **Poisoned frog** — players on forest take 1 damage *(cap at drawer + 1 — it's the harshest card in the deck)*
2. **Stepped on gum** — if on a city tile, miss a turn *(suggest: can't move but may still act — losing a whole turn is brutal on a 15-turn clock)*
3. **Lost kitty** — give it milk or it scratches you (−1 health)
4. **Christmas** — everyone gets an item *(positive)*
5. **Too much beer** — if on a river tile, you slip: lose one item or 1 health
6. **A dog appears** — give it a bone or lose 1 health
7. **Dropped your wallet** — lose $1
8. **Falling squirrel** — if on forest, −1 health
9. **Bird poop** — if on field, −1 health
10. **Your birthday** — gain an item or $1 *(positive)*

### Positive

- **Farmer's market** — everyone on a field takes 2 food
- **Lemonade stand** — everyone gains $1
- **Found a shortcut** — everyone gets +1 movement this turn
- **Campfire** — everyone on forest heals 1
- **Friendly ranger** — the player closest to the final boss draws an item
- **Fishing trip** — everyone on a river tile takes a food
- **Train delivery** — everyone on a railroad tile gains $1
- **Well rested** — everyone heals 1
- **Treasure map** — the drawer takes any item from the pile, their choice
- **Sale at the market** — food is free this round, equipment $1
- **Sharpening stone** — everyone gets +1 attack for their next fight
- **Helping hand** — the player with the fewest items draws one
- **Parade in town** — everyone on a city tile heals 1 and gains $1
- **Reinforcements** — one extra player may join a fight this round, from any distance

### Mixed / silly

- **Trade caravan** — sell at double price this round, but food costs $2
- **Foggy morning** — nobody moves this turn, but nothing can hurt you
- **Mud puddle** — field players lose 1 movement; river players heal 1
- **Wild goose chase** — every player moves one tile, direction chosen by the drawer
- **Bake sale** — pay $1 for 2 food, if you want
- **Sleepy mob** — one mob of the drawer's choice is defeated without rolling
- **Scarecrow** — bosses on field tiles lose 1 attack this round
- **Lost puppy follows you** — drawer gets +1 attack but loses 1 health each turn until
  they reach a city tile and return it
- **Everyone swaps hats** — every player passes one item to the left
- **Growth spurt** — the player with the least health gains +1 max health

**Target mix:** roughly half positive, a third negative, the rest mixed —
about **30–35 cards** total, so the same card rarely repeats in one game.

---

## 14. Winning

Defeat the **final boss** within **X turns.**

Suggested **X = 15** for four players on the 25-tile board; **25** on the 61-tile board,
or keep 15 and enable river/rail travel.

---

## 15. Open Decisions

- [ ] **Turn limit X** — not yet fixed
- [ ] **Must mid bosses die first?** Nothing currently stops a party rushing the final boss on turn one
- [ ] **Death rule** — Doctor revive *or* self-revive, not both
- [ ] **"Return to starting position"** on a tie — the tile you started that turn on, or your game start tile?
- [ ] **One deck or two?** Events and searches both draw from the poker deck; it runs out and the odds drift. Use two decks, or reshuffle every round
- [ ] **Enemy count on 61 tiles** — 10 enemies over 61 tiles is one per six tiles; suggest 15 mobs + 4 mid bosses
- [ ] **City stock** — unlimited, or only from the undrawn item pile?
- [ ] **Terrain map** — record which of the 61 tiles are city / forest / field / river / railroad
- [ ] **How long do tornado-destroyed tiles stay destroyed?** Suggest: they recover as soon as the tornado moves on, so it drags a 7-tile no-go zone around the board
- [ ] **What happens to whatever is standing on a destroyed tile** — players, mobs, bosses, other hazards?
- [ ] **Does being hit by a hazard cost your turn**, or do you still act?
- [ ] **Out-of-turn fights** — if the Robber steps onto you during the hazard phase, do you fight immediately or on your turn?
- [ ] **Are the Robber and Pirates gone for good once defeated**, or do they respawn?

---

## Appendix: Sample Setup (4 players, 61-tile board)

```
        .   P   P   .   .
      .   .   P   P   m   .
    .   .   m   .   .   .   .
  .   M   .   .   .   m   .   .
.   m   .   .   .   .   m   .   .
  .   .   .   m   .   .   .   M
    .   .   .   .   .  BOSS  .
      .   m   .   .   .   .
        .   .   .   .   .
```

- **Final boss** — G6
- **Mid bosses** — D2, F8
- **Mobs** — B5, C3, D6, E2, E7, F4, H2
- **Players** — A2, A3, B3, B4
