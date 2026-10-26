# Hex RPG — Web App Spec

> **Note added in v0.31.** This is the original build plan and has not been rewritten.
> Two parts of it are now historical rather than current: `combat.ts` is no longer
> "dice, damage, features" — a fight is a run of mini-games the table plays (see
> `src/game/challenges.ts`) — and the combat sub-machine in the phase diagram is a run
> of cards rather than a roll/reroll/escape loop. "Animate the dice" survives in
> spirit as the card turning over. Everything else here still describes the build.

A hotseat (one device, passed around) digital version of the tabletop game.
Companion to `hex-rpg-rulebook.md`, which is the authoritative rules document.

---

## 1. Stack

| Concern | Choice | Why |
|---|---|---|
| Build | **Vite** | Instant dev server, zero config |
| UI | **React + TypeScript** | Types matter here — the rules have a lot of state |
| State | **Zustand** | Small, no boilerplate, easy to snapshot for save/undo |
| Board | **Inline SVG** | Already proven in the tile renderer; crisp, scriptable, no assets |
| Styling | **CSS modules** or plain CSS | No framework needed |
| Persistence | **localStorage** | Autosave the game; no backend |
| Deploy | **Static** (Netlify / GitHub Pages / Vercel) | It's just files |

**No backend. No database. No auth.** If online multiplayer ever comes up, that's a
rewrite of the state layer, not of the game logic — keep game logic pure and
serializable so that stays possible.

---

## 2. Project structure

```
hex-rpg/
  src/
    game/            ← pure logic, no React, fully testable
      hex.ts         ← coordinates, neighbours, distance, pathing
      types.ts       ← all game types
      rng.ts         ← seeded random
      setup.ts       ← board generation, entity placement
      turn.ts        ← turn state machine
      combat.ts      ← dice, damage, features
      hazards.ts     ← tornado / homeless / robber / pirates
      events.ts      ← event deck
      items.ts       ← item + supply definitions
      store.ts       ← zustand store wrapping the above
    ui/
      Board.tsx      ← SVG map
      Tile.tsx       ← one hex (art ported from hex-rpg-tiles.html)
      TokenLayer.tsx ← players, enemies, hazards
      PlayerPanel.tsx
      ActionBar.tsx
      DiceRoller.tsx
      CombatModal.tsx
      EventCard.tsx
      Log.tsx
    App.tsx
  reference/         ← copy these in from the existing files
    hex-rpg-rulebook.md
    hex-rpg-cards.html
    hex-rpg-tiles.html
    hex-rpg-tokens.html
  tests/
```

**Hard rule: `src/game/` never imports React.** All rules live there as pure
functions taking state and returning new state. That makes the tricky parts (combat
math, hazard movement) unit-testable without rendering anything.

---

## 3. Hex coordinates

Don't use the A1–I5 row/column scheme for math — it makes neighbour lookup painful
(row widths change direction at the middle). Use **axial coordinates** internally and
convert to labels only for display.

```ts
type Hex = { q: number; r: number };

// The board is a hexagon of radius 4 (5 tiles per side, 61 tiles).
const RADIUS = 4;
const inBoard = (h: Hex) =>
  Math.abs(h.q) <= RADIUS &&
  Math.abs(h.r) <= RADIUS &&
  Math.abs(h.q + h.r) <= RADIUS;

const DIRS: Hex[] = [
  { q: 1, r: 0 }, { q: 1, r: -1 }, { q: 0, r: -1 },
  { q: -1, r: 0 }, { q: -1, r: 1 }, { q: 0, r: 1 },
];

const neighbours = (h: Hex) =>
  DIRS.map(d => ({ q: h.q + d.q, r: h.r + d.r })).filter(inBoard);

const distance = (a: Hex, b: Hex) =>
  (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
```

**Label mapping** (for the UI and for talking about tiles at the table):

```ts
const ROWS = "ABCDEFGHI";
function label(h: Hex): string {
  const row = ROWS[h.r + RADIUS];
  const qMin = Math.max(-RADIUS, -RADIUS - h.r);
  return `${row}${h.q - qMin + 1}`;
}
```

Rendering uses **pointy-top** hexes; the pixel conversion is in `hex-rpg-tiles.html`.

---

## 4. Core types

```ts
type Terrain = "field" | "forest" | "city";

type Tile = {
  hex: Hex;
  base: Terrain;
  river: boolean;
  rail: boolean;
  destroyedUntil: number | null;   // turn number, for tornado damage
};

type Role = "knight" | "rogue" | "scout" | "doctor";

type Player = {
  id: string;
  name: string;
  role: Role;
  hex: Hex;
  health: number;
  maxHealth: number;
  money: number;
  weapon: Item | null;
  armor: Item | null;
  boots: Item | null;
  supply: Item[];
  dead: boolean;
  bonusDiceNextFight: number;      // homeless-person donation
  joinedFightThisRound: boolean;
};

type EnemyKind = "mob" | "midboss" | "finalboss" | "robber" | "pirates";
type Feature = "water" | "railway" | "city" | "forest" | "field";

type Enemy = {
  id: string;
  kind: EnemyKind;
  hex: Hex;
  maxHealth: number;
  damageTaken: number;             // accumulating-damage rule
  features: Feature[];             // drawn on first encounter, [] until then
  featuresRevealed: boolean;
  escapedOnce: boolean;            // water feature
  loot: Item[];                    // robber/pirates carry what they've stolen
  defeated: boolean;
};

type HazardKind = "tornado" | "homeless" | "robber" | "pirates";
type Hazard = { kind: HazardKind; hex: Hex; resolvedWith: string[] };
// resolvedWith = player ids already triggered on this tile; cleared when either moves

type Phase =
  | "setup"
  | "hazardMove"
  | "eventDraw"
  | "playerMove"
  | "playerAction"
  | "combat"
  | "gameOver";

type GameState = {
  seed: number;
  turn: number;
  turnLimit: number;
  phase: Phase;
  activePlayerIndex: number;
  tiles: Record<string, Tile>;      // keyed by label
  players: Player[];
  enemies: Enemy[];
  hazards: Hazard[];
  itemPile: Item[];
  eventDeck: EventCard[];
  pokerDeck: Card[];
  log: LogEntry[];
};
```

---

## 5. Turn state machine

```
turnStart
  → hazardMove      ← all 4 hazards step 1 random tile; resolve collisions
  → eventDraw       ← poker card; J/Q/K draws an event card
  → for each player:
       playerMove    ← highlight legal tiles, player clicks one (or stays)
       playerAction  ← search / trade / fight / heal, whichever are legal
       (combat)      ← sub-machine, may loop: roll → hit or miss → reroll or escape
  → turnEnd         ← turn++, check win/loss
```

**Hazards move before the event draw** — this is settled and matters, because events
like *Foggy morning* would otherwise be ambiguous.

Supply may be consumed **at any time**, including during another player's turn and
mid-fight. That means the "eat food" button is always live, outside the phase machine.

---

## 6. Randomness

One seeded PRNG for the whole game (mulberry32 is fine). Everything random — board
generation, dice, direction rolls, card draws, feature draws — pulls from it.

Benefits: a game is reproducible from its seed, bugs are reportable ("seed 4471, turn
6"), and an undo button becomes possible by replaying actions.

**Dice:** each die has faces `[1,1,1,2,2,3]`. Roll 3 by default, plus
`bonusDiceNextFight`. Damage = dice total + attack value.

---

## 7. Build order

Ship each phase working before starting the next.

**v0.1 — the board**
Generate 61 tiles, render the SVG map, show labels. No players yet. Port the tile art
from `hex-rpg-tiles.html`.

**v0.2 — players and movement**
Place 4 players, click to move, enforce movement range and the pass-through rule.
Turn order and turn counter.

**v0.3 — combat**
Enemies on the map, the dice roller, accumulating damage, escape, death.
*This is the core loop — playtest here before going further.*

**v0.4 — items and economy**
Item pile, search on forest/field, trade in cities, equipment slots and caps,
loot drops and the picker UI.

**v0.5 — features and events**
Boss feature draws, the event deck, poker draws.

**v0.6 — hazards**
All four, movement, collisions, tornado tile destruction.

**v0.7 — polish**
Autosave, new game with a seed, action log, win/lose screens, undo.

---

## 8. UI notes for hotseat

- **Big active-player banner.** With one device passed around, whose turn it is must be
  unmissable — name, colour, health, money, always on screen.
- **Legal moves highlighted.** Don't make a 7-year-old work out hex adjacency; grey out
  what they can't reach.
- **Confirm before ending a turn.** Accidental taps will happen.
- **Animate the dice.** The roll is the exciting moment; don't just print a number.
- **A visible log.** "Robber moved to F4. Player 2 lost $3." Settles arguments.
- **Touch targets ≥ 44px.** This will be played on a tablet.

---

## 9. Rules still unresolved

These need answers before v0.6. Defaults given are my suggestions — override freely,
but pick something, because the code needs a branch either way.

| Question | Suggested default |
|---|---|
| Turn limit X | 25 on the 61-tile board |
| Tornado-destroyed tiles: how long? | Recover when the tornado moves on |
| What happens to units on a destroyed tile? | Players pushed 1 tile out; enemies stay |
| Does a hazard hit cost your turn? | Tornado yes; homeless and payoffs no |
| Robber steps on you off-turn — fight when? | On your turn, your choice |
| Robber/pirates defeated — gone for good? | Gone for good |
| Must mid bosses die before the final boss? | No, but the final boss is unbeatable without gear anyway |
| City stock | Unlimited food; equipment only from the undrawn pile |
| One poker deck or two? | Two — one for events, one for searches |

---

## 10. Kickoff prompt for Claude Code

Put this spec, the rulebook, and the three HTML files in an empty folder, then:

> Read `webapp-spec.md` and `hex-rpg-rulebook.md`. Scaffold the Vite + React +
> TypeScript project described in the spec, then build **v0.1 only**: hex coordinate
> system with tests, board generation for the 61-tile hexagon, and the SVG board
> renderer with tile labels. Port the tile artwork from `hex-rpg-tiles.html`.
> Stop when v0.1 runs and I can see the board — don't start v0.2.

Keeping it to one phase at a time is the difference between a project that works at
every step and one that half-works everywhere.
