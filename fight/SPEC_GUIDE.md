# Character and fight guide (the "full prompt")

Use this when turning a short idea into content. Claude follows it when you give an idea in
chat, and you can also give the whole file to any LLM as its system prompt. There are two
kinds of request:

- **New character** ("a Pirate who throws bombs and summons a parrot") → write
  `characters/<id>.json`.
- **New fight** ("Pirate vs Ninja") → usually nothing to write. Run
  `make_fight.py pirate ninja`. Write a spec in `specs/` only to override the theme or
  YouTube text.

The output is a **15–25 second vertical short**: about 13–20 s of fight plus a 2 s "X WINS"
card. Viewers watch to find out **who wins**, so every design choice serves a close, swingy
fight that resolves fast.

---

## Design rules for characters

1. **One clear identity.** Each character has one gimmick a viewer gets in two seconds:
   - grows stronger every hit
   - heals
   - summons
   - shoots
   - poisons
   - tanky
2. **Visible scaling.** At least one stat grows during the fight (`DMG: 3 → 20`). Put it in
   the HUD so viewers can watch the snowball.
3. **An ultimate that fires early.** In a 15 s fight the meter must fill in about 6–9 s:
   `per_second` 11–14, or `per_hit` 14–25. Always give it a short `shout` ("MEGA SWORD!").
4. **Fast tempo.** Melee characters use `seek` 100–120 (they chase hard). Ranged characters
   use a negative `seek` (they kite).
5. **No turtling.** Heals, lifesteal, armor, thorns and shields slow fights down. Use at most
   two of them, and keep each modest (lifesteal ≤ 0.35, heal ≤ 10 per proc, thorns ≤ 0.2).
6. **Readable look.** Pick a distinct `color`, 1–2 `decor` pieces and a weapon style that
   says who the character is. Avoid two dark characters in the same palette.
7. **Fixed stats, tuned once.** Set sensible HP, then run
   `python tools/balance_roster.py --hero <id> --tune --write`. It sets the character's HP and
   `stats.dmg_mult` so it wins 40-60% against the roster with ~15 s fights. Those numbers are what the
   video and the game show: matchups are never rescaled, and the seed search draws the winner with the
   matchup's real odds (some matchups are lopsided, like a real roster). `python tools/balance_roster.py`
   alone prints the whole table.

## Numbers that work

| Thing | Value |
|---|---|
| Arena | 960 × 960 units |
| Main fighter radius | 56 (tiny) to 80 (big) |
| Summon radius | 24–40 |
| Speed | 560 (heavy) to 740 (very fast) |
| `seek` | melee 100–120, casters −15 to −25 |
| Raw HP | 70–110 (pace rescales) |
| Melee damage per hit | 3–14 (lower if it grows per hit) |
| Blade | length 80–145, width 16–30, spin 160–380 deg/s |
| Projectile | speed 700–1150, radius 9–17, every 0.8–1.6 s |
| Summons | HP 6–12; 1–4 per ultimate, or 1 every 4 s on a timer |

## Character file

```jsonc
{
  "id": "knight",                      // file name, lowercase
  "name": "Knight",                    // title, HUD, "Knight WINS"
  "emoji": "🗡️",                       // used in YouTube titles
  "blurb": "One sentence for the roster sheet and video description.",
  "color": [214, 214, 214],
  "hp": 90, "radius": 70, "speed": 600,
  "decor": "helmet",                   // or a list: ["horns", "beard"]
  "stats": { "dmg": 3, "armor": 0.15, "seek": 120 },
  "blades": [ BLADE, ... ],
  "abilities": [ ABILITY, ... ],
  "meter": METER,
  "hud": ["Awakens MEGA sword", "DMG: {dmg:.0f}{dmg_buffs}", "Armor: {armor_pct:.0f}%"],
  "summons": { "pawn": UNIT, ... },    // templates its summon effects use
  "sfx": { "blade_hit": "prompt", "ultimate": "prompt" },  // becomes "blade_hit:knight" etc.
  "music": "optional music prompt"
}
```

**Looks**

- **`decor`:**
  - headwear: `crown`, `helmet`, `hood`, `wizard_hat`, `halo`, `horns`
  - face: `eyes`, `fangs`, `mask`, `skull`, `headband`
  - other: `beard`
- **Blade `style`:**
  - melee weapons: `sword`, `dagger`, `spear`, `hammer`, `axe`, `scythe`, `stick` (hockey stick)
  - `shield`: damage 0; blocks blades and arrows and shoves enemies away
  - `staff` and `bow`: use `"solid": false` and `"aim": true`, so they're visual only and
    point at the enemy
- **Projectile `style`:** `arrow`, `fireball`, `shuriken`, `orb`, `bolt`, `puck`.

**Built-in stats** (set them in `stats`; custom names like `dmg`, `crown_heal` and
`arrow_dmg` are just numbers you reference as `"$name"`):

| Stat | Default | Meaning |
|---|---|---|
| `speed` | 380 | Movement speed (kept constant) |
| `seek` | 0 | Steering toward the nearest enemy, deg/s; negative = kite away |
| `armor` | 0 | Fraction of damage blocked (max 0.9) |
| `body_damage` | 0 | Damage on body contact |
| `lifesteal` | 0 | Fraction of damage dealt that heals |
| `thorns` | 0 | Fraction of damage taken reflected back |
| `size` | 1 | Radius multiplier |
| `blade_scale` | 1 | Blade size multiplier |
| `spin_mult` | 1 | Blade spin multiplier |

**BLADE:**
- `style`, `length`, `width`
- `spin` (deg/s)
- `damage` (number or `"$stat"`)
- `offset_deg` (place a second blade opposite)
- `gap`, `aim`, `solid`, `color`, `guard_color`

Enemy blades that touch **clash**: both reverse spin and neither deals damage.

**ABILITY:**
`{ "on": TRIGGER, "do": [EFFECT...], "every": s, "frac": 0.4, "cooldown": s, "chance": p, "max_uses": n, "name": "Berserk" }`.
A `name` shows as a big call-out ("BERSERK!") when it fires.

Triggers:

| Trigger | When |
|---|---|
| `start` | Unit spawns |
| `timer` | Every `every` seconds |
| `hit` | Dealt any damage (not poison) |
| `blade_hit` / `body_hit` / `projectile_hit` / `spell_hit` / `shockwave_hit` / `thorns_hit` / `poison_hit` | Dealt damage of that kind |
| `hurt` | Took damage and survived |
| `hp_below` | HP fell under `frac` (once) |
| `wall` | Bounced off a wall |
| `clash` | Blades clashed |
| `block` | Blocked a projectile |
| `kill` | Killed an enemy |
| `death` | This unit died (effects run at its position) |
| `ally_death` | A teammate died |
| `ultimate` | This unit's meter fired |

**EFFECT.** Each effect has an optional `target`:
- `self` (default)
- `other`: the unit just hit, the attacker for `hurt`, or the victim for `kill`
- `nearest_enemy`, `all_enemies`, `allies`, `team`

Values are numbers or `"$stat"`, read from the caster.

| `type` | Fields | Example |
|---|---|---|
| `add_stat` / `mul_stat` | `stat`, `amount` / `factor`, `max`, `min` | +2 dmg per hit |
| `heal` | `amount` | Crown heal |
| `add_max_hp` | `amount`, `heal` | Vampire kill bonus |
| `buff` | `stat`, `mul`/`add`, `duration`, `label` | MEGA sword; on `all_enemies` it's a slow |
| `poison` | `dps`, `duration` (use `target: other`) | Ninja dagger |
| `damage` | `amount`, `source` (default `spell`) | Soul Drain on `all_enemies` |
| `shoot` | `style`, `damage`, `speed`, `radius`, `count`, `spread`, `aim` (nearest/ring/forward/random), `bounces`, `pierce`, `life` | Arrows, Arrow Rain |
| `summon` | `unit`, `count` | 4 pawns |
| `shockwave` | `radius`, `damage`, `knockback`, `color` | Ground Slam |
| `add_meter` | `amount` | Charge the ultimate |
| `launch` | `mult` (x speed, default 2.5), `duration` (s, default 0.7); use `target: other` | Captain's body check sends the enemy flying |

A `shoot` effect can also carry `"launch": {"mult": 1.8, "duration": 0.35}`: every hit knocks
the target flying along the shot. Launched fighters don't steer until they slow down, so keep
launches short and on a cooldown, or fights drift apart and stall.

**METER:**
`{ "label": "Ground Slam", "shout": "GROUND SLAM!", "max": 100, "per_second": 12, "per_hit": 0, "per_hurt": 0, "active_duration": 3, "on_full": [EFFECT...] }`.
Any `per_<trigger>` works. During `active_duration` the bar drains and doesn't refill.

**HUD lines** are format strings over stats. For a stat `x` you can use:
- `{x}`
- `{x_pct}` (×100)
- `{x_base}` (ignoring buffs)
- `{x_buffs}` (shows " (x1.4 ULT)" while a labelled buff is active)
- `{hp}` and `{max_hp}`

Keep each line at 22 characters or fewer.

## Win condition

A side loses when **all** its units are dead, summons included. The Viking's wolves and the
King's pawns can still win after their master falls. That makes good endings.

## Fight spec (optional overrides)

```jsonc
{ "fighters": ["king", "knight"],       // roster ids (or full inline fighter objects)
  "theme": { "bg_top": [r,g,b], "bg_bottom": [r,g,b], "arena_fill": [r,g,b], "arena_border": [r,g,b] },
  "youtube": { "title": "King 🤴 VS 🗡️ Knight", "description": "...", "tags": ["..."] },
  "duration": { "target": [13, 20], "max": 22.5 },   // fight seconds; defaults shown
  "video_seconds": [15, 25], "end_hold": 2.0,
  "search": { "seeds": 400 }, "balance": { "side": 1 }, "pace": { "seeds": 80 } }
```

## Content variety and YouTube's "inauthentic content" policy

YouTube's monetisation rules (the YouTube Partner Program) reject channels whose videos look
**mass-produced from a template** or **repetitive**, meaning videos that differ only slightly
from each other. An automated fight channel is exactly the kind of channel reviewers look at
closely, so variety is a design requirement, not a nice-to-have.

**Already built in:**
- Every matchup has its own home stage (floor, colours, name) and its own procedural music
  (key, tempo, mood, melody).
- The seed search picks a fight with a real story arc: close finish, lead changes, comebacks.
- Titles and descriptions are written from each fight's own facts (stage, ultimates, lead
  changes, close finish) using varied hooks and calls to action. They never spoil the winner.
- Each pair is posted once; rematches swap sides (a different stage and a different fight).
- Characters have distinct mechanics, looks and voices.

**Rules for new content:**
- **Add new characters regularly.** Never post more than about 45 videos from one roster
  without new characters; the roster is the main source of novelty.
- **Don't flood rematches:** at most 1 in 3 uploads should be a rematch.
- **Every new character needs a new mechanic,** not just new numbers or colours.
- **Plan other formats.** The user will add more video types later; reserve room for them:
  - tournaments or brackets across several videos
  - "fan pick" matchups taken from comments
  - 3-way or team fights
  - themed weeks (Halloween, bosses)
  - long-form compilations
  - occasional human touches (commentary, pinned predictions)
- **Keep a human in the loop.** Review the weekly analytics report and adjust what's made.
  Don't let the batch run unchanged for months.

## Not supported yet

Gravity, obstacles, teleporting, image sprites, and more than 2 sides. If an idea needs one,
say so and propose the closest version with the effects above.

## Draft characters

Add `"draft": true` to a new character's file. It stays out of the roster and the daily batch,
but still works by id (`make_fight.py viking captain`), and its art and voice are generated.
Remove the flag once the test video is approved.

## Checklist for a new character

- [ ] One-sentence `blurb` and an `emoji`
- [ ] A distinct colour, decor and weapon (check `python tools/roster_sheet.py`)
- [ ] One growing stat shown in the HUD
- [ ] The meter fills in about 6–9 s and has a `shout`
- [ ] `seek` set (melee 100–120, ranged negative)
- [ ] `python tools/balance_roster.py --hero <id> --tune --write` puts it at 40-60% with 12-18 s fights
- [ ] `sfx` prompts for its signature sounds
- [ ] An `art` block: `body`, `weapons` (in blade order), `projectiles`, `summons`,
  `summon_weapons`, `ultimate_icon`. Each is a one-sentence visual description; the shared
  style is added by `tools/art_prompts.py`. Bodies must stay round, and weapons are described
  as lying horizontally and pointing right.
