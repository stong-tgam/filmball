# Ball Fight

Two characters → a 15–25 second ball-battle short (1080×1920, 60 fps). This is separate from
the bouncing-ball code in the parent folder.

```
characters/*.json ──► matchup ──► auto-pace ──► auto-balance ──► seed search ──► render ──► out/<a>_vs_<b>/
 (10-character roster)            (~16 s fight) (HP → ~50/50)    (most dramatic, fits 15–25 s)
```

## Roster

`python make_fight.py --list` prints the roster; `out/roster.png` shows every character's look.

| | Character | Gimmick |
|---|---|---|
| 🤴 | King | Rams, crown heal grows every proc, summons 4 pawns |
| 🗡️ | Knight | +2 sword damage per hit, armor when hurt, MEGA sword |
| ⚔️ | Samurai | Katana spins faster every hit, lifesteal, Blade Dance |
| 🪓 | Viking | Big axe, BERSERK when low, Ground Slam, wolves on death |
| 🏹 | Archer | Kites; arrows grow per hit; Arrow Rain |
| 🧙 | Wizard | Kites; bouncing fireballs; Frost Nova slows everyone |
| 🧛 | Vampire | Twin daggers, heavy lifesteal, max HP on kill, bat swarm |
| 🛡️ | Paladin | Mace and shield, thorns, Divine Shield, Holy Light |
| 🥷 | Ninja | Tiny and fast, poison dagger, bouncing shurikens, Shadow Clones |
| 💀 | Necromancer | Skeleton every 4 s, minion deaths power a Soul Drain that hits everyone |

New characters and fights follow [SPEC_GUIDE.md](SPEC_GUIDE.md), which is the "full prompt"
for turning an idea into a character.

## Setup (Windows, this machine)

```bash
py -3.14 -m venv .venv
```

```bash
.venv/Scripts/python -m pip install pygame-ce numpy imageio-ffmpeg
```

ffmpeg comes bundled with `imageio-ffmpeg`.

## Usage (works from any folder)

```bash
.venv/Scripts/python make_fight.py king knight --preview
```

```bash
.venv/Scripts/python make_fight.py king knight
```

| Command / flag | Effect |
|---|---|
| `make_fight.py A B` | A (left) vs B (right) from the roster |
| `make_fight.py specs/x.json` | A spec file, for theme and YouTube text overrides |
| `--preview` | 540×960 @ 30 fps quick look (`video_preview.mp4`) |
| `--seed S` | Replay seed S using the tuned HP from the last full run |
| `--seeds N` | Search N seeds (default 400) |
| `--no-balance` | Use raw HP (no pace or balance) |
| `--list` | Print the roster |

## Output (`out/<a>_vs_<b>/`)

| File | What |
|---|---|
| `video.mp4` | The short, silent for now |
| `thumbnail.png` | Frame just before the climax |
| `youtube.json` | Title, description, tags, visibility `private`. Upload is manual for now |
| `audio_prompt.md` | Music and per-character SFX generation prompts plus mixing notes |
| `audio_prompts.json` / `audio_cues.json` | Machine-readable prompts and timestamped cues for a future audio step |
| `report.json` | Pace, balance, chosen seed, top 10 seeds |
| `events.json` | Full event log |
| `spec.resolved.json` | The exact tuned spec that was rendered |

## Look and feel

The video is drawn as an arcade fighting game at a native 540×960 pixel canvas, then scaled
×2 with hard edges and light scanlines. All UI colours come from the Arena-28 palette in
`fightsim/palette.py`, which is shared with the art prompts.

- **Top bar:** portraits, HP bars that drain toward the centre timer with a white "chip" for
  recent damage, and name plates.
- **Arena:** each character has a home stage (`"arena"` in its file: name, floor pattern, colours). A matchup is fought on one fighter's home, picked per matchup, or set one with `"stage": "<id>"` in a spec. The stage name shows under "ROUND 1". The floor sits inside a beveled pixel frame.
- **Bottom panels:** the ultimate icon and name, a segmented SUPER meter, and stat lines.
- **Fight flow:** a VS splash ("ROUND 1"), then "FIGHT!". The finishing blow plays in slow
  motion with a "K.O.!", followed by the winner card ("WITH 2 HP LEFT!").

Total length is about 17–22 s: a 1.2 s intro, a 12–18 s fight, a 1.1 s slow-motion K.O. and
a 2 s winner card.

## Sound

Every video gets a generated 8-bit soundtrack, free and deterministic, with no external tools.

- **The synth.** `fightsim/sfx.py` is a small sfxr-style synth (square, triangle and noise
  waves with pitch sweeps and bit-crush).
- **Sounds:**
  - **contact:** a thump when fighters bump
  - **hits:** blade, projectile, spell, poison tick, thorns
  - **combat:** clash, block, shoot, heal, poison, slow, summon, shockwave, named abilities
    (Berserk…)
  - **ultimates:** a rising power-up, pitched per character
  - **flow:** "ROUND 1 / FIGHT!" beeps, minion pop, a big K.O. boom, a victory fanfare, soft
    wall ticks for the main fighters
- **Variation.** Each character's hits get their own pitch, and repeats vary slightly.
- **The mixer.** `fightsim/mixer.py` places each cue from `audio_cues.json` at its exact video
  time, accounting for the intro and the slow-motion K.O. It caps pile-ups at 3 sounds per
  50 ms, soft-limits the mix and muxes it into `video.mp4`. The mix is also saved as
  `audio.wav`.
- **Options.** `--no-audio` skips it; `"audio": {"wall_sounds": false}` in a spec mutes the wall
  ticks.
- **Demo.** `out/sfx_demo.wav` plays every sound in a row.

## Art (PixelLab)

Sprites in `characters/art/<id>/` replace the procedural drawing automatically. Anything
missing falls back to the drawn version.

| File | What |
|---|---|
| `body.png` | 64×64 round character token. Fitted by its visible content; tune per character with `"art_fit": {"scale": 1.0, "dy": 0}` |
| `weapon_<i>.png` | Weapon pointing right, handle on the left. Rotated around the grip. Twin weapons reuse `weapon_0` |
| `summon_<sid>.png`, `summon_<sid>_weapon.png` | Minions and their weapons |
| `projectile_<style>.png` | Arrows, fireballs, shurikens |
| `ultimate_icon.png` | Icon in the fighter's panel (a drawn emblem otherwise) |
| `floor.png` | 64×64 floor texture for the character's **home stage**. It's mirror-tiled, so edges always match, and dimmed slightly; until it exists, the stage's drawn pattern is used |

The prompts come from the `art` block in each character file:

```bash
.venv/Scripts/python tools/art_prompts.py
```

That writes `art/PIXELLAB_PROMPTS.md` (copy-paste prompts and settings),
`art/pixellab_jobs.json` and `art/palette.png`.

To generate through the API using only free generations, put `PIXELLAB_API_KEY=...` in `.env`
(git-ignored):

```bash
.venv/Scripts/python tools/pixellab_gen.py --only knight,king --variants 2
```

It checks the free balance before every image, stops when the free generations run out or if
anything is charged in USD, and skips sprites that already exist.

## Publish to YouTube

`publish.py` runs the whole pipeline for one matchup: voices, art (free only), render, then
upload.

```bash
.venv/Scripts/python publish.py vampire necromancer --privacy private
```

Add `--no-upload` to stop after rendering. The upload result goes to `out/<matchup>/upload.json`.

**Video catalog:** [Pixel Hero Fights — Video Catalog](https://docs.google.com/spreadsheets/d/1TQB1GIRv8a-7fQ_23MjX9HJOfsQw4-p3plOsCNeZJQk) on Google Drive, one row per
video with status (queued/uploaded), YouTube link, fighters, stage, winner and fight stats.
It updates after every batch (`tools/catalog.py`); `out/catalog.csv` is only the local copy.
A folder that was already uploaded is never re-posted unless you pass `--force`.

### YouTube setup (one time)

1. In [Google Cloud Console](https://console.cloud.google.com/), create a project and enable
   **YouTube Data API v3**.
2. Set up the **OAuth consent screen**:
   - User type: External.
   - Add your Google account as a test user.
   - Set the app to **In production**. In testing mode the sign-in expires every 7 days.
3. Under **Credentials**, choose **Create credentials → OAuth client ID → Desktop app**.
   Download the JSON and save it as `fight/secrets/client_secret.json` (git-ignored).
4. Sign in once. This opens your browser; choose the channel to upload to:

   ```bash
   .venv/Scripts/python tools/youtube_upload.py --auth
   ```

**Limits to know:**
- Uploads from an *unverified* API project are locked to **private** until Google approves the
  project's API compliance audit. Until then, change visibility in YouTube Studio if it allows,
  or apply for the audit.
- The default API quota is 10,000 units a day, and each upload costs about 1,600, so roughly
  6 uploads a day.

## Tools

| Command | Purpose |
|---|---|
| `python tools/roster_sheet.py` | Draw all characters → `out/roster.png` |
| `python tools/roundrobin.py [N]` | Every matchup at raw HP: win rates, lengths, stalls |
| `python tools/quick_stats.py SPEC [N]` / `tools/flow.py SPEC SEED` | Per-seed results and damage/heal breakdown for a spec file |

## Code

| File | Role |
|---|---|
| `fightsim/sim.py` | Deterministic physics and combat: balls, blades, projectiles, poison, abilities, meters, summons |
| `fightsim/search.py` | Drama scoring, parallel seed search, auto-pace, auto-balance |
| `fightsim/render.py` | Procedural art, HUD, effects, ffmpeg pipe |
| `fightsim/spec.py` | Roster loading, matchup building, defaults, validation |
| `fightsim/audio.py` | Audio cue sheet and generation prompts |
