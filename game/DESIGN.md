# Pixel Hero Fights, the game: design doc

*Draft 3, 2026-10-27. Earlier drafts: Shattered Realms (exploration) and the Arena (player-steered duels and
raids). Playtest verdict on the Arena: steering a ball isn't fun, and the fun of the Shorts is
**watching**. The current code (sim port, Duel, Boss Raid, UI) becomes the "test arena" of this design.*

## The core

**You invent a hero. The AI builds it. You watch it fight.**

1. **Describe:** "a frog samurai who's always sleepy". Pick a **main ability** in your own words: "when hit,
   he wakes up angry and spins twice as fast".
2. **The AI builds the rest:** name, stats, weapon, the abilities around your idea, an ultimate, colours,
   a short blurb, and the pixel art (body, weapon, projectile, ult icon), all within the same rules as the
   official heroes.
3. **Test:** your hero is thrown into the arena against the roster and the bosses. You **watch**: no
   controls, the same fights as the Shorts.
4. **Result card:** win rate, best and worst matchups, "beat the Lich King in 31 s", MVP moments.
5. **Iterate:** "make the ult bigger", "he's too slow". The AI edits the hero, and you re-test.

**The play point** is creativity plus the "will my idea work?" suspense. Every test is a mini Short
starring *your* character.

## Why this fits

- It is **the video pipeline turned into a product.** `fight/SPEC_GUIDE.md` is already the guide for
  writing a hero, PixelLab already makes the art, and `fightsim/search.py` already balances.
- **It feeds the channel:** "Fan hero of the week vs the Lich King" Shorts, and the best creations join
  the official roster. Viewers make content, and content brings viewers.
- **No skill wall, works on phones:** typing an idea and watching suits casual Shorts viewers.

## Player loop

```
 idea ─► AI builds hero (≈30–60 s, shows art + card) ─► TEST: gauntlet vs roster ─► result card
   ▲                                                                                   │
   └──────────────── tweak in words ("faster", "ult freezes everyone") ◄───────────────┘
                                         │
                              save to "My Heroes" ─► challenge bosses / other creations
```

**Tests, from quick to deep**
- **Quick duel:** your hero vs a random roster hero (one fight, about 20 s, watched live).
- **Gauntlet:** vs all 10 heroes. Watch the first fight, then a sped-up sweep of the rest gives the win rate.
- **Boss trial:** your hero + 2 random heroes vs a chosen boss (the raid mode we have).

## Rules the AI must follow (so heroes stay fair and the sim can run them)

- Output is a hero JSON in the exact format of `fight/characters/*.json`, using only supported
  triggers, effects, targets, blade and projectile styles (the list in SPEC_GUIDE / `spec.py`).
- **Your main ability is kept as written**, translated into one or more ability entries. The AI fills in
  the rest around it.
- **Auto-balance:** after generation, a headless sim runs the hero vs the roster (as `search.py`
  balance does). HP and damage are scaled until it lands in a fair band (about 40–60% win rate).
  Broken ideas still work, they just get tuned. The card says so: "your hero was too strong: HP 140 → 95".
- Validation: anything the sim can't run is rejected and regenerated automatically, never shown to the
  player as an error.

## Tech

- **The browser game** (this folder) shows everything and runs the fights: the sim port in
  `src/sim/world.ts`, already working.
- **A small server is needed:** API keys can't live in the browser. For the local MVP: a Node server
  (or a Vite dev-server plugin) with two endpoints:
  - `POST /hero`: description + main ability → the **Claude API** writes the hero JSON (SPEC_GUIDE as
    the system prompt, the JSON schema enforced), then validation, then balance.
  - `POST /art`: hero → **PixelLab** body / weapon / projectile / ult icon (key 3), cleaned like the
    video art (trim, straighten).
- Created heroes are saved locally (`game/heroes/<id>.json` + art), in the same format, so a good one can
  be copied into `fight/characters/` and star in a Short with **no conversion**.

**Cost per hero, roughly:** 1–3 Claude calls (cents) + 4–5 PixelLab images. That's fine for you
locally. For a public version you'd need accounts, daily limits and a content filter, later.

## MVP scope

1. Creator screen: a text box for the idea + a text box for the main ability → "CREATE".
2. Server: Claude → hero JSON → validate → auto-balance; PixelLab → 4 images.
3. Hero card reveal: art, name, ult, stats, blurb.
4. Test: Quick duel (watched) + Gauntlet (win rate vs all 10).
5. Tweak in words → regenerate → re-test.
6. "My Heroes" list (local).

**Out of MVP:** online sharing, a leaderboard of creations, player-vs-player challenges, accounts.

## Open questions

1. **Balance:** auto-tune every hero to fair (recommended: it keeps tests meaningful), or allow
   overpowered "fun" heroes in a separate sandbox?
2. **Art:** always generate new PixelLab art (unique, costs ~5 images per hero), or offer "quick mode"
   reusing existing weapons and effects with only a new body?
3. **How much control over the build:** only the main ability, or also optional "weapon" and "ult" hints?
4. **Channel tie-in:** collect creations for a weekly "fan hero" Short from day one?
