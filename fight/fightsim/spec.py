"""
Spec loading and validation, so typos fail fast instead of silently doing nothing.

A spec's fighters can be full fighter objects or character ids ("king"),
which are loaded from characters/<id>.json together with their summons
and sound prompts. build_matchup() makes a complete spec from two ids.
"""

import math
import copy
import json
import os
import string
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CHAR_DIR = os.path.join(ROOT, "characters")

TRIGGERS = {
    "start", "timer", "hit", "blade_hit", "body_hit", "projectile_hit", "shockwave_hit",
    "spell_hit", "thorns_hit", "poison_hit", "hurt", "wall", "clash", "block", "kill",
    "death", "ally_death", "hp_below", "ultimate",
}
EFFECTS = {"add_stat", "mul_stat", "heal", "add_max_hp", "buff", "add_meter", "launch",
           "summon", "shockwave", "shoot", "poison", "damage"}
TARGETS = {"self", "other", "nearest_enemy", "all_enemies", "allies", "team"}
BLADE_STYLES = {"sword", "dagger", "spear", "hammer", "axe", "staff", "scythe", "shield", "bow", "stick"}
PROJECTILE_STYLES = {"arrow", "orb", "fireball", "shuriken", "bolt", "puck"}
DECOR = {"crown", "halo", "horns", "eyes", "helmet", "hood", "wizard_hat", "fangs",
         "mask", "skull", "headband", "beard"}
METER_KEYS = ({"label", "shout", "max", "active_duration", "on_full", "per_second"}
              | {"per_" + t for t in TRIGGERS})
BUILTIN_STATS = {"speed", "armor", "body_damage", "size", "blade_scale", "lifesteal",
                 "thorns", "seek", "spin_mult"}

# Short-form defaults: the whole video (fight + end card) must be 15-25 s.
DEFAULTS = {
    "arena": {"width": 960, "height": 960},
    "duration": {"target": [12, 18], "max": 21},
    "end_hold": 3.5,
    "meter_rate": 1.6,   # ultimates charge this much faster than the character files say (pace)     # winner card; stretched further if the winner's voice line needs it
    "search": {"seeds": 400},
    "balance": {"side": 1, "seeds": 120, "iters": 7},
}

# Arena colour themes; a matchup picks one deterministically from its names.
THEMES = [
    {"bg_top": [52, 140, 205], "bg_bottom": [24, 70, 125], "arena_fill": [150, 185, 220],
     "arena_border": [12, 12, 16]},
    {"bg_top": [70, 40, 90], "bg_bottom": [30, 18, 45], "arena_fill": [225, 205, 175],
     "arena_border": [20, 12, 10]},
    {"bg_top": [40, 110, 70], "bg_bottom": [18, 52, 34], "arena_fill": [190, 215, 160],
     "arena_border": [16, 24, 12]},
    {"bg_top": [150, 70, 40], "bg_bottom": [70, 28, 18], "arena_fill": [240, 215, 180],
     "arena_border": [30, 14, 10]},
    {"bg_top": [40, 44, 60], "bg_bottom": [14, 16, 24], "arena_fill": [170, 175, 190],
     "arena_border": [8, 8, 12]},
]


class SpecError(ValueError):
    pass


def list_characters(include_drafts=False):
    """Roster ids. Characters marked "draft": true stay out of the roster (and so out of the
    daily batch) until approved; they can still be used by id, e.g. make_fight.py captain viking."""
    if not os.path.isdir(CHAR_DIR):
        return []
    ids = sorted(f[:-5] for f in os.listdir(CHAR_DIR) if f.endswith(".json"))
    if include_drafts:
        return ids
    return [c for c in ids if not load_character(c).get("draft")]


def load_character(cid):
    path = os.path.join(CHAR_DIR, f"{cid}.json")
    if not os.path.exists(path):
        raise SpecError(f"no character {cid!r}; available: {', '.join(list_characters())}")
    with open(path, encoding="utf-8") as f:
        ch = json.load(f)
    ch.setdefault("id", cid)
    return ch


def stage_theme(ch):
    """A character's home stage as a render theme (colours, floor pattern, floor art, name)."""
    arena = ch.get("arena")
    if not arena:
        return None
    return {
        "bg_top": arena["bg_top"], "bg_bottom": arena["bg_bottom"],
        "arena_fill": arena["arena_fill"], "arena_border": [12, 12, 16],
        "pattern": arena.get("pattern", "checker"),
        "floor_art": f"characters/art/{ch['id']}/floor.png",
        "stage": arena.get("stage", ""),
    }


def home_theme(ca, cb):
    """The fight happens on one fighter's home stage, picked deterministically per matchup."""
    pick = [ca, cb][zlib.crc32(f"{ca['id']}|{cb['id']}".encode()) % 2]
    other = cb if pick is ca else ca
    theme = stage_theme(pick) or stage_theme(other)
    if theme is None:
        theme = dict(THEMES[zlib.crc32(f"{ca['id']}|{cb['id']}".encode()) % len(THEMES)])
    return theme


def build_matchup(a, b):
    """Complete spec for character a (left) vs character b (right)."""
    ca, cb = load_character(a), load_character(b)
    theme = home_theme(ca, cb)
    ea, eb = ca.get("emoji", ""), cb.get("emoji", "")
    return {
        "idea": f"{ca['name']} vs {cb['name']}",
        "title": f"{ca['name']} VS {cb['name']}",
        "theme": theme,
        "fighters": [a, b],
        "youtube": {
            "tags": ["ball battle", "simulation", f"{ca['name']} vs {cb['name']}".lower(),
                     "satisfying", "shorts"],
        },
    }


# Battle royale maps (world units, arena 960 x 960). Fighters spawn on a ring of radius ~345
# around the centre, so terrain sits inside it (and in the corners) to break lines of sight.
ROYALE_MAPS = {
    "rocky_canyon": {
        "theme": {"stage": "Rocky Canyon", "bg_top": [150, 90, 50], "bg_bottom": [70, 38, 20],
                  "arena_fill": [200, 160, 110], "arena_border": [30, 18, 10], "pattern": "sand"},
        "terrain": [{"shape": "circle", "x": 480, "y": 480, "r": 70},
                    {"shape": "circle", "x": 270, "y": 300, "r": 46}, {"shape": "circle", "x": 690, "y": 660, "r": 46},
                    {"shape": "circle", "x": 700, "y": 280, "r": 38}, {"shape": "circle", "x": 260, "y": 690, "r": 38}],
        "hazards": [],
    },
    "lava_ruins": {
        "theme": {"stage": "Lava Ruins", "bg_top": [90, 30, 30], "bg_bottom": [35, 10, 12],
                  "arena_fill": [110, 95, 95], "arena_border": [20, 8, 8], "pattern": "dungeon"},
        "terrain": [{"shape": "rect", "x": 300, "y": 455, "w": 120, "h": 50},
                    {"shape": "rect", "x": 540, "y": 455, "w": 120, "h": 50},
                    {"shape": "rect", "x": 455, "y": 250, "w": 50, "h": 110},
                    {"shape": "rect", "x": 455, "y": 600, "w": 50, "h": 110}],
        "hazards": [{"x": 300, "y": 300, "r": 60, "dps": 10}, {"x": 660, "y": 660, "r": 60, "dps": 10}],
    },
    "pillar_hall": {
        "theme": {"stage": "Pillar Hall", "bg_top": [60, 60, 110], "bg_bottom": [22, 22, 50],
                  "arena_fill": [170, 170, 200], "arena_border": [12, 12, 24], "pattern": "marble"},
        "terrain": [{"shape": "circle", "x": 480 + 200 * __import__("math").cos(a), "y": 480 + 200 * __import__("math").sin(a), "r": 36}
                    for a in [i * 3.14159265 / 3 + 0.5 for i in range(6)]],
        "hazards": [{"x": 480, "y": 480, "r": 55, "dps": 9}],
    },
}


# ── battle royale themes: random layouts ────────────────────────────────
# Each theme: look (colours, procedural floor), a kit of blockers (solid, shape + size in world
# units, pick weight) and its own hazard. build_royale() scatters 4-7 blockers around the middle
# (bell curve, inside the spawn ring, spaced apart, <=12% of the floor) - a new layout per video.
ROYALE_THEMES = {
    "graveyard": {
        "theme": {"stage": "Midnight Graveyard", "bg_top": [40, 30, 60], "bg_bottom": [14, 10, 24],
                  "arena_fill": [70, 80, 60], "arena_border": [10, 8, 14], "pattern": "dirt"},
        "blockers": [("tombstone", "rect", (44, 60), 3), ("crypt", "rect", (150, 110), 1),
                     ("dead_tree", "circle", 40, 2)],
        "hazards": [{"type": "fog", "count": 2, "r": 95, "dps": 3, "slow": 0.6}],
    },
    "city": {
        "theme": {"stage": "City Street", "bg_top": [70, 80, 110], "bg_bottom": [25, 28, 40],
                  "arena_fill": [70, 72, 78], "arena_border": [12, 12, 16], "pattern": "asphalt"},
        "blockers": [("car", "rect", (90, 170), 3), ("dumpster", "rect", (110, 70), 2),
                     ("hydrant", "circle", 20, 2)],
        "hazards": [{"type": "fire", "count": 1, "r": 75, "dps": 9}],
    },
    "military": {
        "theme": {"stage": "Military Base", "bg_top": [80, 95, 60], "bg_bottom": [30, 38, 22],
                  "arena_fill": [150, 150, 140], "arena_border": [20, 22, 14], "pattern": "concrete"},
        "blockers": [("sandbags", "rect", (160, 50), 3), ("crate", "rect", (72, 72), 3),
                     ("barrel", "circle", 30, 2)],
        "hazards": [{"type": "mine", "count": 5, "r": 20, "damage": 10, "blast": 150}],
    },
    "soccer": {
        "theme": {"stage": "Soccer Field", "bg_top": [60, 140, 220], "bg_bottom": [30, 80, 150],
                  "arena_fill": [70, 160, 70], "arena_border": [20, 40, 20], "pattern": "pitch"},
        "blockers": [("goal", "rect", (190, 50), 1), ("cone", "circle", 16, 4), ("bench", "rect", (150, 40), 1)],
        "hazards": [{"type": "ball", "count": 1, "r": 24}],
    },
    "ice": {
        "theme": {"stage": "Ice Rink", "bg_top": [40, 90, 160], "bg_bottom": [15, 35, 80],
                  "arena_fill": [215, 232, 245], "arena_border": [20, 40, 80], "pattern": "ice"},
        "blockers": [("net", "rect", (120, 70), 2), ("boards", "rect", (210, 30), 2)],
        "hazards": [{"type": "ice_hole", "count": 2, "r": 55, "freeze": 0.5, "damage": 4, "cooldown": 4}],
        "slippery": 0.45,
    },
}


def royale_layout(theme_key, rng, W=960, H=1160):
    """Random blockers + hazards for a theme: (terrain, hazards). Somewhat centered, spaced out."""
    kit = ROYALE_THEMES[theme_key]
    terrain, placed, area = [], [], 0.0
    want = rng.randint(4, 7)
    kinds = kit["blockers"]
    weights = [k[3] for k in kinds]
    used = {}
    tries = 0
    while len(terrain) < want and tries < 400:
        tries += 1
        kind, shape, size, _ = rng.choices(kinds, weights)[0]
        if kind in ("crypt", "goal", "bench") and used.get(kind):
            continue                                # one big centrepiece of each
        x = W / 2 + rng.gauss(0, 0.17 * W)
        y = H / 2 + rng.gauss(0, 0.17 * H)
        if ((x - W / 2) / W) ** 2 + ((y - H / 2) / H) ** 2 > 0.27 ** 2:
            continue                                # stay inside the spawn ring
        if shape == "circle":
            r = float(size)
            br, a = r, math.pi * r * r
        else:
            w, h = size
            if rng.random() < 0.5 and kind not in ("goal", "bench"):
                w, h = h, w                         # random orientation
            br, a = math.hypot(w, h) / 2, w * h
        if area + a > 0.12 * W * H:
            continue
        if any(math.hypot(x - px, y - py) < br + pr + 95 for px, py, pr in placed):
            continue                                # leave lanes between blockers
        placed.append((x, y, br))
        area += a
        used[kind] = used.get(kind, 0) + 1
        if shape == "circle":
            terrain.append({"shape": "circle", "kind": kind, "x": round(x), "y": round(y), "r": r})
        else:
            terrain.append({"shape": "rect", "kind": kind, "x": round(x - w / 2), "y": round(y - h / 2),
                            "w": w, "h": h})
    hazards = []
    for hz in kit["hazards"]:
        n, tries = 0, 0
        while n < hz["count"] and tries < 300:
            tries += 1
            x = W / 2 + rng.gauss(0, 0.22 * W)
            y = H / 2 + rng.gauss(0, 0.22 * H)
            if not (90 < x < W - 90 and 90 < y < H - 90):
                continue
            r = float(hz["r"])
            if any(math.hypot(x - px, y - py) < r + pr + 40 for px, py, pr in placed):
                continue
            placed.append((x, y, r))
            h = {k: v for k, v in hz.items() if k != "count"}
            h.update({"x": round(x), "y": round(y)})
            if hz["type"] == "wind":
                h["dir"] = round(rng.uniform(0, 2 * math.pi), 3)
            if hz["type"] == "mine":
                h["alive"] = True
            hazards.append(h)
            n += 1
    return terrain, hazards


def build_royale(ids, map_name=None, salt=""):
    """A free-for-all battle royale spec: 3-8 roster ids on a random themed map (new layout
    per salt) or one of the fixed ROYALE_MAPS."""
    import random as _random
    chars = [load_character(c) for c in ids]
    key = "|".join(ids) + "|" + salt
    names = sorted(ROYALE_THEMES) + sorted(ROYALE_MAPS)
    map_name = map_name or names[zlib.crc32(key.encode()) % len(names)]
    # a taller arena than the 1v1s (more room for 6), filling the space the compact cards free up
    H = 1160
    extra = {}
    if map_name in ROYALE_THEMES:
        kit = ROYALE_THEMES[map_name]
        terrain, hazards = royale_layout(map_name, _random.Random(key + map_name), 960, H)
        m = {"theme": kit["theme"]}
        if kit.get("slippery"):
            extra["slippery"] = kit["slippery"]
    else:   # fixed maps are drawn for 960 x 960: stretch them vertically
        m = ROYALE_MAPS[map_name]
        fy = H / 960
        terrain = copy.deepcopy(m["terrain"])
        for o in terrain:
            o["y"] = o["y"] * fy
            if o["shape"] == "rect":
                o["h"] = o["h"] * fy
        hazards = copy.deepcopy(m["hazards"])
        for h in hazards:
            h["y"] = h["y"] * fy
    return {**extra,
        "arena": {"width": 960, "height": H},
        "mode": "royale",
        "idea": f"{len(ids)}-fighter battle royale on {m['theme']['stage']}",
        "title": f"{len(ids)}-WAY BATTLE ROYALE",
        "map": map_name,
        "theme": dict(m["theme"], floor="none"),
        "fighters": list(ids),
        "unit_scale": 0.72,
        "terrain": terrain,
        "hazards": hazards,
        "items": {"first": 1.5, "every": 2.2, "max": 3,
                  "weights": {"potion": 3, "boots": 2, "shield": 2, "power": 1.5, "bomb": 1.2,
                              "fire": 1.3, "freeze": 0.55, "lightning": 0.55}},
        "storm": {"start": 7, "end": 22, "min_r": 200, "dps": 7},
        "duration": {"target": [20, 27], "max": 34},
        "video_seconds": [24, 36],
        "search": {"seeds": 200},
        "balance": False,
        "pace": {"seeds": 60, "range": [0.3, 3.0]},
        "end_hold": 3.5,
        "youtube": {"tags": ["battle royale", "ball battle", "simulation", "free for all", "shorts",
                             *[c["name"].lower() for c in chars]]},
    }


# Soccer: themed teams; players wear their team's jersey colour (a ring around the ball)
SOCCER_TEAMS = {
    "light": {"name": "LIGHT", "color": [255, 205, 60],
              "members": ["king", "knight", "paladin", "archer", "wizard"]},
    "shadow": {"name": "SHADOW", "color": [170, 80, 245],
               "members": ["vampire", "necromancer", "ninja", "samurai", "viking"]},
}


def build_soccer(ids=None, teams=("light", "shadow"), salt=""):
    """A 2v2 soccer spec. ids: 4 roster ids (first two = home team), or picked from the teams."""
    import random as _random
    rng = _random.Random(f"soccer|{salt}|{teams}")
    t0, t1 = SOCCER_TEAMS[teams[0]], SOCCER_TEAMS[teams[1]]
    if not ids:
        ids = rng.sample(t0["members"], 2) + rng.sample(t1["members"], 2)
    chars = [load_character(c) for c in ids]
    return {
        "mode": "soccer",
        "idea": f"{t0['name']} vs {t1['name']} 2v2 soccer",
        "title": f"{t0['name']} VS {t1['name']}",
        "theme": {"stage": "Soccer Field", "bg_top": [60, 140, 220], "bg_bottom": [30, 80, 150],
                  "arena_fill": [70, 160, 70], "arena_border": [20, 40, 20], "pattern": "pitch", "floor": "none"},
        "arena": {"width": 960, "height": 1160},
        "fighters": list(ids),
        "unit_scale": 0.8,
        "soccer": {"to_win": 2, "regulation": 30, "goal_width": 320, "goal_line": 70, "respawn": 2.5,
                   "ball_r": 26, "teams": [{"name": t0["name"], "color": t0["color"]},
                                           {"name": t1["name"], "color": t1["color"]}]},
        "duration": {"target": [10, 18], "max": 45},
        "video_seconds": [18, 34],
        "search": {"seeds": 200},
        "balance": False,
        "pace": False,
        "end_hold": 3.5,
        "youtube": {"tags": ["soccer", "football", "ball battle", "simulation", "2v2", "shorts",
                             *[c["name"].lower() for c in chars]]},
    }


def resolve(spec):
    """Fill defaults and expand character ids into full fighters."""
    spec = copy.deepcopy(spec)
    for k, v in DEFAULTS.items():
        if k not in spec:
            spec[k] = copy.deepcopy(v)
    spec.setdefault("summons", {})
    if "intro" not in spec:   # "ROUND 1 / FIGHT!" card; timed to the announcer clip if there is one
        from .audio_assets import intro_length
        spec["intro"] = intro_length()
    # stage: "stage": "<character id>" picks that character's home; otherwise a home is picked
    ids = [f for f in spec.get("fighters", []) if isinstance(f, str)]
    if "theme" not in spec and spec.get("stage"):
        spec["theme"] = stage_theme(load_character(spec["stage"]))
    elif "theme" not in spec and len(ids) == 2:
        spec["theme"] = home_theme(load_character(ids[0]), load_character(ids[1]))
    audio = spec.setdefault("audio", {})
    sfx = audio.setdefault("sfx", {})
    fighters = []
    for f in spec.get("fighters", []):
        if isinstance(f, str):
            ch = load_character(f)
            for sid, s in ch.pop("summons", {}).items():
                # art_owner: summon sprites live in characters/art/<owner>/
                spec["summons"].setdefault(sid, dict(s, art_owner=ch["id"]))
            ch.pop("art", None)
            # a character's sound prompts are its own: "blade_hit" -> "blade_hit:knight"
            for key, prompt in ch.pop("sfx", {}).items():
                sfx.setdefault(key if ":" in key else f"{key}:{ch['id']}", prompt)
            if ch.get("music") and "music" not in audio:
                audio["music"] = ch["music"]
            fighters.append(ch)
        else:
            fighters.append(f)
    spec["fighters"] = fighters
    return spec


def load_spec(path):
    with open(path, encoding="utf-8") as f:
        spec = json.load(f)
    return finalize(spec)


def finalize(spec):
    spec = resolve(spec)
    errors = validate(spec)
    if errors:
        raise SpecError("spec problems:\n  - " + "\n  - ".join(errors))
    return spec


def _check_effects(effs, where, spec, errors):
    for e in effs:
        kind = e.get("type")
        if kind not in EFFECTS:
            errors.append(f"{where}: unknown effect type {kind!r} (valid: {sorted(EFFECTS)})")
        if kind in ("add_stat", "mul_stat", "buff") and "stat" not in e:
            errors.append(f"{where}: {kind} needs 'stat'")
        if kind == "summon" and e.get("unit") not in spec.get("summons", {}):
            errors.append(f"{where}: summon unit {e.get('unit')!r} is not in 'summons'")
        if e.get("target", "self") not in TARGETS:
            errors.append(f"{where}: unknown target {e.get('target')!r} (valid: {sorted(TARGETS)})")
        if kind == "shoot" and e.get("style", "orb") not in PROJECTILE_STYLES:
            errors.append(f"{where}: unknown projectile style {e.get('style')!r}")


def _check_unit(u, where, spec, errors):
    for key in ("name", "hp", "radius"):
        if key not in u:
            errors.append(f"{where}: missing {key!r}")
    decor = u.get("decor") or []
    for d in [decor] if isinstance(decor, str) else decor:
        if d not in DECOR:
            errors.append(f"{where}: unknown decor {d!r} (valid: {sorted(DECOR)})")
    for i, b in enumerate(u.get("blades", [])):
        if b.get("style", "sword") not in BLADE_STYLES:
            errors.append(f"{where}.blades[{i}]: unknown style {b.get('style')!r}")
    for i, a in enumerate(u.get("abilities", [])):
        w = f"{where}.abilities[{i}]"
        if a.get("on") not in TRIGGERS:
            errors.append(f"{w}: unknown trigger {a.get('on')!r} (valid: {sorted(TRIGGERS)})")
        if a.get("on") == "timer" and not a.get("every"):
            errors.append(f"{w}: timer needs 'every' (seconds)")
        _check_effects(a.get("do", []), w, spec, errors)
    m = u.get("meter")
    if m:
        for k in m:
            if k not in METER_KEYS:
                errors.append(f"{where}.meter: unknown key {k!r}")
        _check_effects(m.get("on_full", []), f"{where}.meter.on_full", spec, errors)
    stats = set(u.get("stats", {})) | BUILTIN_STATS
    for line in u.get("hud", []):
        for _, field, _, _ in string.Formatter().parse(line):
            if field is None:
                continue
            base = field
            for suf in ("_pct", "_base", "_buffs"):
                if base.endswith(suf):
                    base = base[: -len(suf)]
            if base not in stats and base not in ("hp", "max_hp"):
                errors.append(f"{where}.hud: {{{field}}} is not a stat of this fighter")


def validate(spec):
    errors = []
    fighters = spec.get("fighters", [])
    if spec.get("mode") == "soccer":
        if len(fighters) != 4:
            errors.append("2v2 soccer needs exactly 4 fighters")
    elif spec.get("mode") == "royale":
        if not 3 <= len(fighters) <= 8:
            errors.append("a battle royale needs 3-8 fighters")
    elif len(fighters) != 2:
        errors.append("'fighters' must have exactly 2 entries")
    for i, f in enumerate(fighters):
        _check_unit(f, f"fighters[{i}]({f.get('name', '?')})", spec, errors)
    for k, u in spec.get("summons", {}).items():
        _check_unit(u, f"summons.{k}", spec, errors)
    return errors
