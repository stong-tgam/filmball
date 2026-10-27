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
    } | _map_art(f"characters/art/{ch['id']}/map.png")


def _map_art(rel):
    """{"map_art": rel} when that whole-arena PixelLab map exists (it replaces the tiled floor)."""
    return {"map_art": rel} if os.path.exists(os.path.join(ROOT, rel)) else {}


# neutral 1v1 arenas (PixelLab floor + two props in the corners); art in art/arenas/<id>/
ARENAS = {
    "colosseum": ("The Colosseum", [150, 100, 60], [60, 36, 20], [205, 175, 130]),
    "volcano": ("Volcano Core", [120, 40, 20], [40, 10, 6], [80, 60, 60]),
    "frozen_lake": ("Frozen Lake", [90, 150, 210], [30, 60, 110], [200, 225, 245]),
    "temple": ("Sun Temple", [170, 120, 50], [80, 50, 20], [215, 185, 130]),
    "night_forest": ("Night Forest", [30, 60, 50], [10, 22, 18], [70, 100, 70]),
    "rooftop": ("City Rooftop", [60, 60, 90], [20, 20, 34], [120, 120, 130]),
    "dojo": ("The Dojo", [140, 60, 40], [60, 24, 16], [215, 180, 120]),
    "desert": ("Desert Dunes", [220, 150, 70], [120, 70, 30], [230, 195, 130]),
    "crystal_cave": ("Crystal Cave", [60, 40, 110], [20, 12, 40], [90, 80, 120]),
    "beach": ("Sunny Beach", [70, 170, 220], [30, 90, 150], [240, 220, 170]),
}


def arena_theme(aid):
    stage, top, bottom, fill = ARENAS[aid]
    base = f"art/arenas/{aid}"
    return {"bg_top": top, "bg_bottom": bottom, "arena_fill": fill, "arena_border": [12, 12, 16],
            "pattern": "checker", "floor_art": f"{base}/floor.png", "stage": stage, "arena_id": aid,
            "props": [f"{base}/deco0.png", f"{base}/deco1.png"]} | (
        # a whole-arena PixelLab map replaces the tiled floor; its own edges replace the props
        {"map_art": f"{base}/map.png", "props": []} if os.path.exists(os.path.join(ROOT, base, "map.png")) else {})


def home_theme(ca, cb):
    """Half the matchups fight in a neutral arena, the rest on one fighter's home stage;
    both picked deterministically per matchup (so a re-render looks the same)."""
    h = zlib.crc32(f"arena|{ca['id']}|{cb['id']}".encode())
    if h % 2 == 0 and ARENAS:
        aid = sorted(ARENAS)[(h >> 1) % len(ARENAS)]
        if os.path.exists(os.path.join(ROOT, "art", "arenas", aid, "floor.png")):
            return arena_theme(aid)
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
        "theme": dict(m["theme"], floor="none") | _map_art(f"art/maps/royale_{map_name}.png"),
        "fighters": list(ids),
        "unit_scale": 0.9,
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


# Horde survival: one hero vs waves. Enemy templates are plain units (sprite = PixelLab art).
def _enemy(id_, name, hp, r, speed, color, sprite, seek=140, body=2.0, boss=False, **extra):
    t = {"id": id_, "name": name, "hp": hp, "radius": r * 1.4, "speed": speed, "color": color,
         "sprite": f"art/horde/{sprite}.png", "stats": {"seek": seek, "body_damage": body}}
    t["art_fit"] = {"scale": 1.15 if boss else 1.5}   # draw bigger than the hitbox so they read on a phone
    if boss:
        t["boss"] = True
    t.update(extra)
    return t


HORDES = {
    "skeletons": {
        "title": "SKELETONS", "theme": "graveyard", "death_fx": "fx_bones", "death_sound": "bones",
        "enemies": {
            "basic": _enemy("skeleton", "Skeleton", 6, 28, 330, [220, 220, 210], "skeleton"),
            # one new enemy joins per wave, in this order ("unlock" = first wave it appears)
            "elites": [
                _enemy("skeleton_archer", "Skeleton Archer", 5, 26, 300, [200, 200, 190], "skeleton_archer", seek=-25,
                       body=1.0, unlock=2, abilities=[{"on": "timer", "every": 1.7, "do": [
                           {"type": "shoot", "style": "arrow", "damage": 2, "speed": 800, "radius": 7,
                            "color": [230, 230, 230]}]}]),
                _enemy("skeleton_shield", "Shield Skeleton", 12, 30, 270, [190, 160, 110], "skeleton_shield",
                       unlock=3, stats_extra={"armor": 0.45}),
                _enemy("bone_hound", "Bone Hound", 4, 24, 560, [225, 220, 205], "bone_hound", body=1.5, unlock=4),
                _enemy("skeleton_mage", "Skeleton Mage", 6, 26, 260, [170, 110, 220], "skeleton_mage", seek=-35,
                       body=1.0, unlock=6, abilities=[{"on": "timer", "every": 2.2, "do": [
                           {"type": "shoot", "style": "orb", "damage": 3, "speed": 520, "radius": 11,
                            "color": [190, 110, 255]}]}]),
                _enemy("ghost", "Ghost", 5, 26, 430, [170, 235, 245], "ghost", body=1.5, unlock=7),
                _enemy("skeleton_knight", "Death Knight", 20, 36, 230, [90, 90, 110], "skeleton_knight", body=3.0,
                       unlock=8, stats_extra={"armor": 0.35}),
            ],
            "boss": _enemy("bone_giant", "BONE GIANT", 70, 66, 230, [210, 230, 200], "bone_giant", body=5, boss=True,
                           abilities=[{"on": "timer", "every": 3.0, "name": "Bone Slam", "do": [
                               {"type": "shockwave", "radius": 170, "damage": 5, "color": [200, 255, 200]}]}]),
        },
    },
    "zombies": {
        "title": "ZOMBIES", "theme": "city", "death_fx": "fx_splat", "death_sound": "splat",
        "enemies": {
            "basic": _enemy("zombie", "Zombie", 7, 28, 300, [120, 170, 90], "zombie", body=2.2),
            "elites": [
                _enemy("zombie_runner", "Runner", 4, 26, 520, [150, 180, 110], "zombie_runner", body=1.6, unlock=2),
                _enemy("zombie_exploder", "Exploder", 8, 32, 250, [140, 200, 80], "zombie_exploder", body=1.0,
                       unlock=3, abilities=[{"on": "death", "do": [
                           {"type": "shockwave", "radius": 150, "damage": 6, "color": [140, 255, 90]}]}]),
                _enemy("zombie_dog", "Zombie Dog", 4, 24, 600, [120, 150, 80], "zombie_dog", body=1.5, unlock=4),
                _enemy("zombie_spitter", "Spitter", 6, 28, 260, [150, 210, 70], "zombie_spitter", seek=-30, body=1.0,
                       unlock=6, abilities=[{"on": "timer", "every": 2.0, "do": [
                           {"type": "shoot", "style": "orb", "damage": 3, "speed": 560, "radius": 11,
                            "color": [150, 255, 60]}]}]),
                _enemy("zombie_riot", "Riot Zombie", 16, 34, 240, [90, 100, 120], "zombie_riot", body=2.5, unlock=7,
                       stats_extra={"armor": 0.5}),
                _enemy("zombie_bloater", "Bloater", 22, 42, 200, [150, 90, 170], "zombie_bloater", body=2.0, unlock=8,
                       abilities=[{"on": "death", "do": [
                           {"type": "shockwave", "radius": 210, "damage": 8, "color": [190, 110, 230]}]}]),
            ],
            "boss": _enemy("zombie_brute", "BRUTE", 80, 68, 240, [110, 150, 90], "zombie_brute", body=6, boss=True,
                           abilities=[{"on": "timer", "every": 3.4, "name": "Ground Pound", "do": [
                               {"type": "shockwave", "radius": 180, "damage": 5, "color": [180, 255, 140]}]}]),
        },
    },
}
for _h in HORDES.values():   # fold "stats_extra" into stats; enemies take two good hits
    for _e in [_h["enemies"]["basic"], _h["enemies"]["boss"], *_h["enemies"]["elites"]]:
        _e["stats"].update(_e.pop("stats_extra", {}))
        _e["hp"] *= 2


def build_horde(hero, kind="skeletons"):
    """One hero vs endless waves of a horde; the number of kills is the score."""
    h = HORDES[kind]
    ch = load_character(hero)
    theme = dict(ROYALE_THEMES[h["theme"]]["theme"], floor="none")
    if kind == "skeletons":   # clean dark crypt stones: the graveyard's bone speckles look like enemies
        theme.update(pattern="flagstone", arena_fill=[78, 76, 84], stage="Forgotten Crypt")
    theme.update(_map_art(f"art/maps/horde_{kind}.png"))
    return {
        "mode": "horde",
        "idea": f"How many {kind} can the {ch['name']} defeat?",
        "title": f"{ch['name'].upper()} VS THE {h['title']}",
        "theme": theme,
        "arena": {"width": 960, "height": 1160},
        "fighters": [hero],
        "unit_scale": 0.9,
        # hits/kills never stop here, so ultimates chain: only one full cut-in (banner, voice,
        # big cue) every few seconds; the casts in between just show the effect
        "cutin_gap": 5.0,
        "horde": {"kind": kind, "title": h["title"], "death_fx": h["death_fx"], "death_sound": h["death_sound"],
                  "enemies": copy.deepcopy(h["enemies"]), "first_wave": 0.2, "base": 6, "grow": 4, "gap": 3.6,
                  "boss_waves": [5, 10], "max_alive": 25, "dmg_grow": 0.1, "heal_fade": 0.12,
                  "drops": {"chance": 0.07, "max": 3,
                            "weights": {"potion": 3, "power": 2, "bomb": 1.5, "freeze": 0.6, "lightning": 0.7}}},
        "duration": {"target": [17, 25], "max": 40},
        "video_seconds": [20, 36],
        "search": {"seeds": 200},
        "balance": False,
        "pace": {"seeds": 60, "range": [0.3, 6.0]},
        "end_hold": 5.0,
        "youtube": {"tags": ["horde survival", "ball battle", "simulation", "shorts", kind, ch["name"].lower()]},
    }


def horde_board(kind, out_dir_root, current=None, exclude=None):
    """Top-10 leaderboard for a horde: every roster hero's best kills (None = no run yet).
    current: (hero id, kills) of the run being rendered; exclude: its folder (when re-rendering)."""
    best = {}
    if os.path.isdir(out_dir_root):
        for name in os.listdir(out_dir_root):
            if name == exclude or name.startswith("_"):
                continue
            try:
                spec = json.load(open(os.path.join(out_dir_root, name, "spec.resolved.json"), encoding="utf-8"))
                rep = json.load(open(os.path.join(out_dir_root, name, "report.json"), encoding="utf-8"))["chosen"]
            except (OSError, ValueError, KeyError):
                continue
            if spec.get("mode") != "horde" or spec.get("horde", {}).get("kind") != kind:
                continue
            hid = spec["fighters"][0]["id"]
            best[hid] = max(best.get(hid, 0), int(rep.get("kills", 0)))
    prev_record = max(best.values()) if best else 0
    if current:
        best[current[0]] = max(best.get(current[0], 0), current[1])
    ids = list_characters() + ([current[0]] if current and current[0] not in list_characters() else [])
    rows = [{"id": c, "name": load_character(c)["name"], "best": best.get(c)} for c in ids]
    rows.sort(key=lambda r: (r["best"] is None, -(r["best"] or 0), r["name"]))
    return {"rows": rows[:10], "new_record": bool(current and current[1] > prev_record), "prev_record": prev_record}


# Boss raid: 4 heroes vs one giant boss with telegraphed skills and an enraged second phase
BOSSES = {
    "dragon": {
        # boss HP is FIXED (no per-raid balancing): set from tools/boss_power.py so an average
        # 3-hero party wins about 45%; strong parties crush it, weak ones get wiped
        "boss": {"id": "dragon", "name": "Inferno Dragon", "hp": 320, "radius": 150, "speed": 170,
                 "color": [220, 70, 40], "sprite": "art/boss/dragon.png", "art_fit": {"scale": 1.25},
                 "stats": {"seek": 50, "body_damage": 8, "stability": 0.75}, "emoji": "🐉",
                 "voice_intro": "dragon_intro", "voice_enraged": "dragon_enraged",
                 "skills": [
                     {"name": "FIRE BREATH", "type": "cone", "every": 3.2, "phase": 1, "warn": 0.85, "dmg": 26,
                      "range": 620, "half": 30, "burn": 3, "fx": "fire_breath", "first": 1.0},
                     {"name": "TAIL SWEEP", "type": "nova", "every": 4.6, "phase": 1, "warn": 0.8, "dmg": 21,
                      "r": 330, "launch": 2.4},
                     {"name": "METEOR RAIN", "type": "meteors", "every": 4.2, "phase": 2, "warn": 1.0, "dmg": 32,
                      "r": 90, "count": 5, "fx": "meteor"},
                     {"name": "SUMMON IMPS", "type": "summon", "every": 6.0, "phase": 2, "count": 3, "minion": "fire_imp"},
                 ],
                 "minions": {"fire_imp": {"id": "fire_imp", "name": "Fire Imp", "hp": 10, "radius": 36, "speed": 380,
                                          "color": [230, 90, 50], "sprite": "art/boss/fire_imp.png",
                                          "art_fit": {"scale": 1.4}, "stats": {"seek": 150, "body_damage": 2}}}},
        "theme": {"stage": "Dragon's Lair", "bg_top": [110, 40, 20], "bg_bottom": [40, 12, 8],
                  "arena_fill": [96, 70, 64], "arena_border": [24, 8, 6], "pattern": "flagstone", "floor": "none"},
    },
    "lich": {
        "boss": {"id": "lich_king", "name": "Lich King", "hp": 450, "radius": 140, "speed": 160,
                 "color": [120, 80, 200], "sprite": "art/boss/lich_king.png", "art_fit": {"scale": 1.25},
                 "stats": {"seek": 45, "body_damage": 8, "stability": 0.75}, "emoji": "💀",
                 "voice_intro": "lich_intro", "voice_enraged": "lich_enraged",
                 "skills": [
                     {"name": "SOUL BEAM", "type": "beam", "every": 3.0, "phase": 1, "warn": 0.85, "dmg": 48,
                      "width": 150, "len": 1200, "fx": "soul_beam", "first": 1.0},
                     {"name": "RAISE DEAD", "type": "summon", "every": 5.0, "phase": 1, "count": 3, "minion": "skeleton"},
                     {"name": "FROST NOVA", "type": "nova", "every": 4.4, "phase": 1, "warn": 0.9, "dmg": 21,
                      "r": 360, "freeze": 0.5, "fx": "frost_ring"},
                     {"name": "SOUL RAIN", "type": "meteors", "every": 4.0, "phase": 2, "warn": 1.0, "dmg": 29,
                      "r": 85, "count": 6, "fx": "soul_orb"},
                 ],
                 "minions": {"skeleton": {"id": "skeleton", "name": "Skeleton", "hp": 12, "radius": 38, "speed": 320,
                                          "color": [220, 220, 210], "sprite": "art/horde/skeleton.png",
                                          "art_fit": {"scale": 1.5}, "stats": {"seek": 140, "body_damage": 2}}}},
        "theme": {"stage": "Frozen Throne", "bg_top": [50, 40, 90], "bg_bottom": [16, 12, 32],
                  "arena_fill": [80, 82, 100], "arena_border": [12, 10, 24], "pattern": "flagstone", "floor": "none"},
    },
}

BOSSES.update({
    "golem": {
        "boss": {"id": "golem", "name": "Stone Golem", "hp": 250, "radius": 155, "speed": 140,
                 "color": [150, 130, 110], "sprite": "art/boss/golem.png", "art_fit": {"scale": 1.25},
                 "stats": {"seek": 45, "body_damage": 9, "stability": 0.9}, "emoji": "🗿",
                 "voice_intro": "golem_intro", "voice_enraged": "golem_enraged", "enrage": {"armor": 0.3},
                 "skills": [
                     {"name": "BOULDER THROW", "type": "meteors", "every": 3.0, "phase": 1, "warn": 1.0, "dmg": 34,
                      "r": 120, "count": 1, "fx": "boulder", "first": 1.0},
                     {"name": "GROUND POUND", "type": "nova", "every": 4.0, "phase": 1, "warn": 0.85, "dmg": 22,
                      "r": 340, "launch": 2.6, "fx": "boulder"},
                     {"name": "ROCKSLIDE", "type": "meteors", "every": 4.5, "phase": 2, "warn": 1.0, "dmg": 26,
                      "r": 80, "count": 6, "fx": "boulder"},
                     {"name": "GOLEMLINGS", "type": "summon", "every": 6.0, "phase": 2, "count": 3, "minion": "pebble"},
                 ],
                 "minions": {"pebble": {"id": "pebble", "name": "Golemling", "hp": 16, "radius": 38, "speed": 300,
                                        "color": [140, 120, 100], "sprite": "art/boss/pebble.png",
                                        "art_fit": {"scale": 1.4}, "stats": {"seek": 140, "body_damage": 3, "armor": 0.2}}}},
        "theme": {"stage": "Crystal Canyon", "bg_top": [150, 100, 60], "bg_bottom": [70, 40, 22],
                  "arena_fill": [196, 160, 112], "arena_border": [40, 24, 12], "pattern": "sand", "floor": "none"},
    },
    "kraken": {
        "boss": {"id": "kraken", "name": "Kraken", "hp": 410, "radius": 150, "speed": 150,
                 "color": [150, 70, 180], "sprite": "art/boss/kraken.png", "art_fit": {"scale": 1.25},
                 "stats": {"seek": 40, "body_damage": 7, "stability": 0.8}, "emoji": "🐙",
                 "voice_intro": "kraken_intro", "voice_enraged": "kraken_enraged",
                 "skills": [
                     {"name": "TENTACLE SLAM", "type": "beam", "origin": "edge", "every": 2.6, "phase": 1, "warn": 0.9,
                      "dmg": 30, "width": 120, "len": 1500, "fx": "tentacle", "first": 1.0},
                     {"name": "WHIRLPOOL", "type": "nova", "every": 5.0, "phase": 1, "warn": 0.9, "dmg": 14,
                      "r": 400, "pull": 2.2, "fx": "whirlpool"},
                     {"name": "INK BLAST", "type": "meteors", "every": 4.0, "phase": 2, "warn": 0.95, "dmg": 24,
                      "r": 100, "count": 4, "fx": "ink_splash"},
                     {"name": "TENTACLE STORM", "type": "beam", "origin": "edge", "count": 3, "every": 4.6, "phase": 2,
                      "warn": 1.0, "dmg": 28, "width": 110, "len": 1500, "fx": "tentacle"},
                 ],
                 "minions": {}},
        "theme": {"stage": "Sunken Dock", "bg_top": [30, 80, 130], "bg_bottom": [10, 30, 60],
                  "arena_fill": [120, 90, 64], "arena_border": [10, 20, 40], "pattern": "planks", "floor": "none"},
    },
    "mech": {
        "boss": {"id": "mech_titan", "name": "Mech Titan", "hp": 230, "radius": 150, "speed": 170,
                 "color": [190, 60, 50], "sprite": "art/boss/mech_titan.png", "art_fit": {"scale": 1.25},
                 "stats": {"seek": 50, "body_damage": 7, "stability": 0.85}, "emoji": "🤖",
                 "voice_intro": "mech_intro", "voice_enraged": "mech_enraged",
                 "skills": [
                     {"name": "MISSILE BARRAGE", "type": "meteors", "every": 3.8, "phase": 1, "warn": 1.0, "dmg": 25,
                      "r": 75, "count": 6, "fx": "missile", "first": 1.0},
                     {"name": "LASER SWEEP", "type": "beam", "count": 3, "spread": 32, "every": 4.2, "phase": 1,
                      "warn": 0.9, "dmg": 30, "width": 80, "len": 1300, "fx": "laser"},
                     {"name": "DEPLOY TURRETS", "type": "summon", "every": 6.0, "phase": 2, "count": 2, "minion": "turret"},
                     {"name": "OVERDRIVE SLAM", "type": "nova", "every": 4.4, "phase": 2, "warn": 0.8, "dmg": 20,
                      "r": 320, "launch": 2.4},
                 ],
                 "minions": {"turret": {"id": "turret", "name": "Turret", "hp": 18, "radius": 36, "speed": 1,
                                        "color": [160, 160, 170], "sprite": "art/boss/turret.png",
                                        "art_fit": {"scale": 1.4}, "stats": {"seek": 0, "body_damage": 0},
                                        "abilities": [{"on": "timer", "every": 1.2, "do": [
                                            {"type": "shoot", "style": "bolt", "damage": 4, "speed": 950, "radius": 8,
                                             "color": [255, 80, 60]}]}]}}},
        "theme": {"stage": "Titan Base", "bg_top": [80, 95, 60], "bg_bottom": [30, 38, 22],
                  "arena_fill": [150, 150, 140], "arena_border": [20, 22, 14], "pattern": "concrete", "floor": "none"},
    },
})


def _minion(id_, name, hp, r, speed, color, sprite, seek=140, body=2.0, **extra):
    return {"id": id_, "name": name, "hp": hp, "radius": r, "speed": speed, "color": color,
            "sprite": f"art/boss/{sprite}.png", "art_fit": {"scale": 1.4},
            "stats": {"seek": seek, "body_damage": body}, **extra}


BOSSES.update({
    "werewolf": {
        "boss": {"id": "werewolf", "name": "Blood Moon Alpha", "hp": 380, "radius": 145, "speed": 210,
                 "color": [150, 140, 150], "sprite": "art/boss/werewolf.png", "art_fit": {"scale": 1.25},
                 "stats": {"seek": 60, "body_damage": 8, "stability": 0.75}, "emoji": "🐺",
                 "voice_intro": "werewolf_intro", "voice_enraged": "werewolf_enraged",
                 "skills": [
                     {"name": "POUNCE", "type": "leap", "every": 3.4, "phase": 1, "warn": 0.9, "dmg": 30,
                      "r": 150, "launch": 2.2, "count_enraged": 2, "fx": "pounce_impact", "first": 1.0,
                      "target": "farthest"},
                     {"name": "CLAW FRENZY", "type": "cone", "count": 3, "spread": 28, "every": 3.0, "phase": 1,
                      "warn": 0.7, "dmg": 16, "range": 420, "half": 22, "fx": "claw_slash"},
                     {"name": "HOWL", "type": "nova", "every": 4.8, "phase": 1, "warn": 0.85, "dmg": 14,
                      "r": 360, "launch": 2.6, "fx": "howl_wave"},
                     {"name": "CALL THE PACK", "type": "summon", "every": 6.0, "phase": 2, "count": 2, "minion": "dire_wolf"},
                 ],
                 "minions": {"dire_wolf": _minion("dire_wolf", "Dire Wolf", 10, 36, 460, [110, 110, 120], "dire_wolf",
                                                  seek=160, body=2.5)}},
        "theme": {"stage": "Blood Moon Forest", "bg_top": [90, 20, 30], "bg_bottom": [25, 6, 12],
                  "arena_fill": [60, 70, 50], "arena_border": [20, 6, 8], "pattern": "grass", "floor": "none"},
    },
    "spider": {
        "boss": {"id": "spider_queen", "name": "Spider Queen", "hp": 400, "radius": 150, "speed": 160,
                 "color": [120, 70, 150], "sprite": "art/boss/spider_queen.png", "art_fit": {"scale": 1.25},
                 "stats": {"seek": 40, "body_damage": 7, "stability": 0.8}, "emoji": "🕷️",
                 "voice_intro": "spider_intro", "voice_enraged": "spider_enraged",
                 "skills": [
                     {"name": "WEB SHOT", "type": "beam", "every": 3.0, "phase": 1, "warn": 0.85, "dmg": 18,
                      "width": 110, "len": 1200, "freeze": 0.5, "fx": "web_beam", "first": 1.0},
                     {"name": "VENOM RAIN", "type": "meteors", "every": 4.0, "phase": 1, "warn": 1.0, "dmg": 18,
                      "r": 90, "count": 5, "count_enraged": 7, "burn": 4, "fx": "venom_splash"},
                     {"name": "WEB PULL", "type": "nova", "every": 5.0, "phase": 1, "warn": 0.9, "dmg": 10,
                      "r": 700, "pull": 2.6, "fx": "web_pull"},   # reaches the backline: drags archers in
                     {"name": "HATCH", "type": "summon", "every": 6.0, "phase": 1, "count": 2, "count_enraged": 4,
                      "minion": "spiderling"},
                 ],
                 "minions": {"spiderling": _minion("spiderling", "Spiderling", 8, 32, 400, [60, 60, 60], "spiderling",
                                                   seek=150, body=2.0)}},
        "theme": {"stage": "Web Cavern", "bg_top": [50, 30, 70], "bg_bottom": [14, 8, 22],
                  "arena_fill": [70, 66, 78], "arena_border": [10, 8, 14], "pattern": "flagstone", "floor": "none"},
    },
    "pharaoh": {
        "boss": {"id": "pharaoh", "name": "Pharaoh Ra-Khet", "hp": 280, "radius": 150, "speed": 150,
                 "color": [220, 180, 80], "sprite": "art/boss/pharaoh.png", "art_fit": {"scale": 1.25},
                 "stats": {"seek": 40, "body_damage": 8, "stability": 0.85}, "emoji": "👑",
                 "voice_intro": "pharaoh_intro", "voice_enraged": "pharaoh_enraged",
                 "skills": [
                     {"name": "SANDSTORM", "type": "beam", "origin": "edge", "count": 2, "count_enraged": 3, "every": 3.2,
                      "phase": 1, "warn": 0.95, "dmg": 22, "width": 120, "len": 1500, "fx": "sand_beam", "first": 1.0},
                     {"name": "CURSE OF RA", "type": "meteors", "every": 4.2, "phase": 1, "warn": 1.0, "dmg": 26,
                      "r": 95, "count": 4, "count_enraged": 6, "fx": "sun_beam_impact"},
                     {"name": "SARCOPHAGUS SLAM", "type": "nova", "every": 4.6, "phase": 1, "warn": 0.85, "dmg": 20,
                      "r": 340, "launch": 2.5, "fx": "sarcophagus_slam"},
                     {"name": "RISE, MY SERVANTS", "type": "summon", "every": 6.0, "phase": 2, "count": 3, "minion": "mummy"},
                 ],
                 "minions": {"mummy": _minion("mummy", "Mummy", 14, 38, 260, [210, 200, 170], "mummy",
                                              seek=130, body=2.5)}},
        "theme": {"stage": "Tomb of Ra-Khet", "bg_top": [150, 110, 50], "bg_bottom": [60, 40, 18],
                  "arena_fill": [200, 170, 110], "arena_border": [40, 26, 10], "pattern": "sand", "floor": "none"},
    },
    "storm": {
        "boss": {"id": "storm_titan", "name": "Storm Titan", "hp": 250, "radius": 155, "speed": 150,
                 "color": [90, 110, 160], "sprite": "art/boss/storm_titan.png", "art_fit": {"scale": 1.25},
                 "stats": {"seek": 40, "body_damage": 8, "stability": 0.9}, "emoji": "⚡",
                 "voice_intro": "storm_intro", "voice_enraged": "storm_enraged",
                 "skills": [
                     {"name": "LIGHTNING STRIKES", "type": "meteors", "every": 3.2, "phase": 1, "warn": 0.9, "dmg": 24,
                      "r": 85, "count": 5, "count_enraged": 8, "fx": "lightning_impact", "first": 1.0},
                     {"name": "CHAIN LIGHTNING", "type": "beam", "count": 3, "spread": 30, "every": 4.0, "phase": 1,
                      "warn": 0.85, "dmg": 26, "width": 80, "len": 1300, "fx": "chain_lightning"},
                     {"name": "THUNDERCLAP", "type": "nova", "every": 4.6, "phase": 1, "warn": 0.85, "dmg": 18,
                      "r": 350, "launch": 2.8, "fx": "thunderclap"},
                     {"name": "STORM SPRITES", "type": "summon", "every": 6.0, "phase": 2, "count": 3, "minion": "storm_sprite"},
                 ],
                 "minions": {"storm_sprite": _minion("storm_sprite", "Storm Sprite", 8, 30, 480, [140, 200, 255],
                                                     "storm_sprite", seek=170, body=2.0)}},
        "theme": {"stage": "Thunder Peak", "bg_top": [50, 60, 90], "bg_bottom": [16, 20, 34],
                  "arena_fill": [110, 115, 125], "arena_border": [12, 14, 22], "pattern": "concrete", "floor": "none"},
    },
    "reaper": {
        "boss": {"id": "grim_reaper", "name": "The Grim Reaper", "hp": 350, "radius": 145, "speed": 170,
                 "color": [70, 50, 90], "sprite": "art/boss/grim_reaper.png", "art_fit": {"scale": 1.25},
                 "stats": {"seek": 50, "body_damage": 8, "stability": 0.75}, "emoji": "💀",
                 "voice_intro": "reaper_intro", "voice_enraged": "reaper_enraged",
                 "skills": [
                     {"name": "DEATH MARK", "type": "mark", "every": 3.6, "phase": 1, "warn": 2.0, "dmg": 40,
                      "r": 110, "count": 1, "count_enraged": 2, "fx": "death_mark_impact", "first": 1.0,
                      "target": "farthest"},
                     {"name": "SCYTHE SWEEP", "type": "nova", "every": 3.4, "phase": 1, "warn": 0.8, "dmg": 22,
                      "r": 330, "launch": 2.2, "fx": "scythe_sweep"},
                     {"name": "SOUL REAP", "type": "beam", "every": 4.2, "phase": 1, "warn": 0.9, "dmg": 28,
                      "width": 120, "len": 1300, "fx": "soul_reap"},
                     {"name": "SHADOWS RISE", "type": "summon", "every": 6.0, "phase": 2, "count": 3, "minion": "shadow_wisp"},
                 ],
                 "minions": {"shadow_wisp": _minion("shadow_wisp", "Shadow Wisp", 8, 30, 420, [60, 50, 80], "shadow_wisp",
                                                    seek=160, body=2.0)}},
        "theme": {"stage": "River of Souls", "bg_top": [40, 30, 70], "bg_bottom": [10, 8, 22],
                  "arena_fill": [60, 64, 80], "arena_border": [8, 6, 14], "pattern": "flagstone", "floor": "none"},
    },
})


def build_boss(kind="dragon", heroes=None, salt=""):
    """3 heroes vs a boss (fewer heroes = clearer video). heroes: roster ids, or picked at
    random (seeded by salt)."""
    import random as _random
    b = BOSSES[kind]
    if not heroes:
        heroes = _random.Random(f"boss|{kind}|{salt}").sample(list_characters(), 3)
    chars = [load_character(c) for c in heroes]
    # fixed boss HP: the party decides the odds (tools/boss_power.py measured every party);
    # search.py picks the ending with those odds
    return {
        "mode": "boss",
        "salt": salt,
        "idea": f"{', '.join(c['name'] for c in chars)} vs the {b['boss']['name']}",
        "title": f"RAID: {b['boss']['name'].upper()}",
        "boss_kind": kind,
        "theme": dict(b["theme"]) | _map_art(f"art/maps/boss_{kind}.png"),
        "arena": {"width": 960, "height": 1160},
        "fighters": list(heroes) + [copy.deepcopy(b["boss"])],
        "unit_scale": 0.95,
        "duration": {"target": [16, 24], "max": 40},
        "video_seconds": [20, 34],
        "search": {"seeds": 200},
        "balance": False,
        "pace": {"seeds": 60, "range": [0.3, 5.0]},
        "end_hold": 4.0,
        "youtube": {"tags": ["boss raid", "boss fight", "ball battle", "simulation", "shorts",
                             b["boss"]["name"].lower(), *[c["name"].lower() for c in chars]]},
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
    if spec.get("mode") == "boss":
        if not 3 <= len(fighters) <= 5:
            errors.append("a boss raid needs 2-4 heroes + the boss")
    elif spec.get("mode") == "horde":
        if len(fighters) != 1:
            errors.append("horde survival needs exactly 1 hero")
    elif spec.get("mode") == "soccer":
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
