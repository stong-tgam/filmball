# Pixel Hero Fights, the game: design doc (v1)

*Draft 2, 2026-10-27. v1 is the Arena: fights straight out of the Shorts. The exploration game
"Shattered Realms" (draft 1) becomes a later phase, built on top of v1.*

## The pitch

**Play the Shorts.** Pick a hero from the channel and fight in the same arenas, with the same skills,
cut-ins and bosses viewers already watch. Every hero, boss, skill and map made for the game can also be
used in new videos, and the other way round.

## The big rule: one set of content, two outputs

```
            fight/characters/*.json   (heroes: stats, blades, abilities, ult meter)
            fight/fightsim/spec.py    (bosses, arenas)  →  exported to  content/*.json
            fight/art, characters/art (sprites, maps, FX)
                     │                                   │
          Python video sim + renderer             Phaser game (TypeScript)
          → YouTube Shorts                        → playable in the browser
```

- **The content files are the single source of truth.** A new hero or boss is added once and shows up in
  both the videos and the game.
- The game reads the **same rules**: blade damage, `on: blade_hit / hurt / timer` abilities, ult meters,
  boss skills (cone, beam, nova, meteors, summon, leap, mark) with their warn times and telegraphs.
- Step 1 adds a small export script: `fight/tools/export_content.py` writes `bosses.json` and
  `arenas.json`, which `spec.py` currently keeps in Python code. Heroes are already JSON.
- **Test of success:** the same matchup played by two AIs in the game should look and feel like the
  Short.

## v1 modes

| Mode | What you do | Why first |
|---|---|---|
| **Duel (1v1)** | Your hero vs one other hero, in the hero's own arena | The core of the channel (32 of 61 queued videos) |
| **Boss Raid** | You + 2 AI heroes vs one of the 10 bosses, fixed HP | The boss skills and art are the most "epic" content |
| Later: Royale, Soccer | 4-hero free-for-all, 2v2 ball | Same engine, more fighters |

**Who's the opponent in a Duel?**
- **vs AI** (default). The AI uses the video sim's own movement: seek, bounce, stability.
- **Local 2-player**, on one keyboard. P1 uses WASD + Space, P2 uses the arrows + Enter.
- **Online PvP** is *not* in v1. It needs a server, netcode and anti-cheat, and it's a big step that
  can come after people enjoy the game.

## How it plays (close to the videos, but you're in control)

- **You steer, the weapon spins.** Fighters are the round "ball" heroes from the Shorts. You steer with
  WASD, and the momentum and bounces off the arena walls stay physical, like the sim. Blades still spin on
  their own (Knight's sword, Samurai's katana), and ranged heroes fire on their own timers (Wizard's
  fireballs, Archer's arrows).
- **Your skill = positioning and timing.** You choose when to close in or run, use walls to bounce, and
  dodge the red boss telegraphs.
- **Space fires the ult** once its meter is full, instead of it firing automatically. You choose the
  moment for MEGA SWORD or FROST NOVA. The cut-in banner plays, just like the Shorts.
- **Rounds:** a Duel is best of 3 rounds of about 20–30 s each, the same length as a Short. A raid is one
  attempt; the boss enrages at 50%.
- The **HUD looks like the videos**: the top HP bars, the boss bar with phase marker, the hero cards
  with X on death, damage numbers, shouts.

## Screens

1. **Title:** "PIXEL HERO FIGHTS", Duel / Boss Raid / Settings.
2. **Hero pick:** a grid of the 10 heroes with portrait, blurb and ult name (from the JSON).
3. **Opponent pick:** a hero (and AI or Player 2), or one of the 10 bosses plus 2 allies (random, or
   picked).
4. **Fight:** the arena map, an intro (landing cracks, "FIGHT!"), the fight, then the result (with MVP
   and damage).
5. **Result:** rematch / change hero / menu. Your **win record per hero and boss** is stored locally.

## What's reused vs. new

| Reused as-is | New |
|---|---|
| All 10 hero bodies, weapons, ult art, voice lines | Title screen and pick screens (UI) |
| 10 bosses, minions, all skill FX, cast sigils, telegraph art | Player-control tuning (steer force, top speed) |
| Whole-arena maps (1v1 arenas, boss maps) | Synth SFX exported to WAV once |
| Announcer lines ("FIGHT!", "K.O.") | `export_content.py` (bosses and arenas to JSON) |

**No new PixelLab art is needed for v1.**

## Tech

- **Phaser 3 + TypeScript + Vite**, in `game/`. It runs locally with `npm run dev`.
- `game/src/sim/` is a TypeScript port of `fightsim/sim.py`: same rules, driven by the content JSON.
  The renderer is Phaser instead of pygame.
- A script copies the art and audio from `fight/` into `game/public/assets/`, so the video pipeline
  is never touched.
- Later option: once the TypeScript sim matches the Python one, the game itself could record matches
  for videos (player-vs-AI "can you beat this?" Shorts).

## Build order (each step is playable)

1. **Content export + project setup:** one hero in its arena, steering with physics and wall bounces.
2. **Duel vs AI:** blades, hits, HP, the abilities system, the AI, a win screen. Knight vs Wizard first.
3. **Ults + juice:** the meter, Space to fire, the cut-in, shouts, damage numbers, hit sparks, sound.
4. **All 10 heroes + hero pick:** every hero's abilities working from its JSON; local 2-player.
5. **Boss Raid:** the boss engine (telegraphs, 7 skill types, enrage, summons), 2 AI allies. Werewolf
   first, then all 10.
6. **Polish:** title screen, best-of-3 rounds, the local win record, settings (volume, keys).

## Open questions

1. **Steering:** full control (WASD moves you directly), or "nudge" control (you push the ball and it
   keeps bouncing like the videos)? My pick is nudge: it keeps the Shorts' feel and is easier to make fun.
2. **The Captain** (draft character): include it, or only the 10 finished heroes?
3. **Phone controls later?** A virtual joystick + ult button would work with this design.
