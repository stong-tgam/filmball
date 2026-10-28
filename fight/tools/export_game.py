"""
Export the video pipeline's content for the browser game (../game/public/).

    python tools/export_game.py

Writes game/public/content/{heroes,arenas,rules}.json and copies the art (trimmed and, for
weapons and projectiles, straightened exactly like the video renderer does) plus the synth
SFX (as WAV), announcer and hero voice lines into game/public/assets/. The video pipeline
stays the source of truth: re-run this after adding or changing a hero.
"""

import glob
import json
import os
import shutil
import sys
import time
import wave

os.environ.setdefault("SDL_VIDEODRIVER", "dummy")
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
GAME = os.path.join(os.path.dirname(ROOT), "game", "public")

import numpy as np  # noqa: E402
import pygame  # noqa: E402

from fightsim import sfx  # noqa: E402
from fightsim.render import BOSS_IMPACT_FX, BOSS_PREFIX, SUMMON_FX, Sprites  # noqa: E402
from fightsim.spec import ARENAS, BOSSES, DEFAULTS, arena_theme, list_characters, load_character, stage_theme  # noqa: E402

SOUNDS = ["blade_hit", "bump", "clash", "block", "shoot", "projectile_hit", "spell_hit", "shockwave_hit",
          "poison_hit", "heal", "debuff", "summon", "ultimate", "ability", "shockwave", "death",
          "death_main", "victory", "round", "fight", "freeze", "wall"]
ANNOUNCER = ["round_fight", "ko"]
BOSS_SOUNDS = ["warn", "enraged"]

sprites = Sprites()


def _out(rel):
    path = os.path.join(GAME, "assets", rel)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    return path


def png(src_rel, dst_rel, trim=True, straighten=False):
    """Copy one sprite into the game; returns its path under assets/, or None when missing."""
    img = sprites.load(src_rel, trim=trim, straighten=straighten)
    if img is None:
        return None
    dst = _out(dst_rel)
    for attempt in range(5):           # the dev server can briefly hold the old file open on Windows
        try:
            pygame.image.save(img, dst + ".tmp.png")
            os.replace(dst + ".tmp.png", dst)
            break
        except (pygame.error, OSError):
            if attempt == 4:
                raise SystemExit(f"can't overwrite {dst}: stop the game's dev server (npm run dev) and re-run")
            time.sleep(0.5)
    return dst_rel


def copy(src_rel, dst_rel):
    src = os.path.join(ROOT, src_rel)
    if not os.path.exists(src):
        return None
    shutil.copyfile(src, _out(dst_rel))
    return dst_rel


def _styles(node, found):
    """Every projectile style a hero shoots, wherever it sits in the JSON."""
    if isinstance(node, dict):
        if node.get("type") == "shoot":
            found.add(node.get("style", "orb"))
        for v in node.values():
            _styles(v, found)
    elif isinstance(node, list):
        for v in node:
            _styles(v, found)
    return found


def export_hero(cid):
    ch = load_character(cid)
    art = f"characters/art/{cid}"
    assets = {"body": png(f"{art}/body.png", f"heroes/{cid}/body.png"), "weapons": [], "projectiles": {},
              "summons": {}, "voice": {}}
    for i, b in enumerate(ch.get("blades", [])):
        straight = b.get("style") not in ("shield", "bow")
        src = f"{art}/weapon_{i}.png" if os.path.exists(os.path.join(ROOT, art, f"weapon_{i}.png")) else f"{art}/weapon_0.png"
        assets["weapons"].append(png(src, f"heroes/{cid}/weapon_{i}.png", straighten=straight))
    for style in sorted(_styles(ch, set())):
        src = f"{art}/projectile_{style}.png"   # the renderer prefers the shared fx art for these
        if style in ("fireball", "puck", "shuriken") and os.path.exists(os.path.join(ROOT, "art", "fx", "proj", f"{style}.png")):
            src = f"art/fx/proj/{style}.png"
        p = png(src, f"heroes/{cid}/projectile_{style}.png", straighten=style not in ("shuriken", "puck"))
        if p:
            assets["projectiles"][style] = p
    for sid in ch.get("summons", {}):
        p = png(f"{art}/summon_{sid}.png", f"heroes/{cid}/summon_{sid}.png")
        if p:
            assets["summons"][sid] = p
    for k in ("ult_aura", "ult_circle", "ultimate_icon", "hit_fx"):
        p = png(f"{art}/{k}.png", f"heroes/{cid}/{k}.png")
        if p:
            assets[k] = p
    for f in glob.glob(os.path.join(ROOT, "characters", "voice", cid, "*.mp3")):
        name = os.path.splitext(os.path.basename(f))[0]
        assets["voice"][name] = copy(os.path.relpath(f, ROOT), f"heroes/{cid}/voice_{name}.mp3")
    for k in ("sfx", "art"):
        ch.pop(k, None)
    ch["assets"] = assets
    return ch


def export_arenas(heroes):
    arenas = []
    for aid in sorted(ARENAS):
        th = arena_theme(aid)
        if th.get("map_art"):
            arenas.append({"id": aid, "name": th["stage"], "map": copy(th["map_art"], f"arenas/{aid}.png"),
                           "bg": th["bg_bottom"]})
    for h in heroes:                       # each hero's home stage
        th = stage_theme(load_character(h["id"]))
        if th and th.get("map_art"):
            arenas.append({"id": f"home_{h['id']}", "name": th["stage"] or f"{h['name']}'s Home",
                           "map": copy(th["map_art"], f"arenas/home_{h['id']}.png"), "bg": th["bg_bottom"],
                           "home": h["id"]})
    return arenas


def export_bosses():
    """Every boss: its spec (as the raids use it), sprite, minions, skill art, auras, cast sigil,
    summon portal, lair map and voice lines. Asset paths replace the video art paths."""
    out = []
    for kind in sorted(BOSSES):
        b = json.loads(json.dumps(BOSSES[kind]["boss"]))
        pre = BOSS_PREFIX.get(b["id"], kind)
        b["sprite"] = png(b["sprite"], f"boss/{kind}/body.png")
        for mid, m in b.get("minions", {}).items():
            m["sprite"] = png(m["sprite"], f"boss/{kind}/minion_{mid}.png")
        fx = {}
        for sk in b["skills"]:
            if sk.get("fx"):
                fx[sk["fx"]] = png(f"art/boss/{sk['fx']}.png", f"boss/{kind}/fx_{sk['fx']}.png")
            big = BOSS_IMPACT_FX.get(sk["name"])
            if big:
                sk["impact"] = png(f"art/boss/fx2/{big}.png", f"boss/{kind}/impact_{big}.png")
        assets = {"fx": {k: v for k, v in fx.items() if v},
                  "aura": png(f"art/boss/fx2/{pre}_enraged_aura.png", f"boss/{kind}/aura.png"),
                  "cast": png(f"art/boss/fx2/{pre}_cast.png", f"boss/{kind}/cast.png"),
                  "summon": png(f"art/boss/fx2/{SUMMON_FX[pre]}.png", f"boss/{kind}/summon.png") if pre in SUMMON_FX else None,
                  "map": copy(f"art/maps/boss_{kind}.png", f"boss/{kind}/map.png"),
                  "voice": {k: copy(f"audio/boss/{b[f'voice_{k}']}.mp3", f"boss/{kind}/voice_{k}.mp3")
                            for k in ("intro", "enraged") if b.get(f"voice_{k}")}}
        th = BOSSES[kind]["theme"]
        out.append({"kind": kind, "stage": th["stage"], "bg": th["bg_bottom"], "boss": b, "assets": assets,
                    "arena": {"width": 960, "height": 1160}, "unit_scale": 0.95})
    for f in ("danger_marker", "death_mark"):
        png(f"art/boss/fx2/{f}.png", f"boss/{f}.png")
    for f in ("boss_defeated", "raid_failed"):
        copy(f"audio/boss/{f}.mp3", f"announcer/{f}.mp3")
    return out


def export_sounds():
    for name in SOUNDS + BOSS_SOUNDS:
        x = np.clip(sfx.make(name), -1, 1)
        with wave.open(_out(f"sfx/{name}.wav"), "wb") as w:
            w.setnchannels(1)
            w.setsampwidth(2)
            w.setframerate(sfx.SR)
            w.writeframes((x * 32000).astype("<i2").tobytes())
    for name in ANNOUNCER:
        copy(f"audio/announcer/{name}.mp3", f"announcer/{name}.mp3")


def export_ui():
    """The chosen PixelLab UI pieces (art/ui/<name>.png; candidates in art/ui/_cand/ are skipped)."""
    names = []
    for f in sorted(glob.glob(os.path.join(ROOT, "art", "ui", "*.png"))):
        name = os.path.splitext(os.path.basename(f))[0]
        if png(f"art/ui/{name}.png", f"ui/{name}.png", trim=name != "backdrop"):
            names.append(name)
    return names


def main():
    pygame.init()
    pygame.display.set_mode((1, 1))
    heroes = [export_hero(c) for c in list_characters()]
    arenas = export_arenas(heroes)
    export_sounds()
    ui = export_ui()
    bosses = export_bosses()
    os.makedirs(os.path.join(GAME, "content"), exist_ok=True)
    rules = {"arena": DEFAULTS["arena"], "meter_rate": DEFAULTS["meter_rate"], "sounds": SOUNDS + BOSS_SOUNDS, "ui": ui}
    for name, data in (("heroes", heroes), ("arenas", arenas), ("rules", rules), ("bosses", bosses)):
        with open(os.path.join(GAME, "content", f"{name}.json"), "w", encoding="utf-8") as f:
            json.dump(data, f, indent=1, ensure_ascii=False)
    print(f"exported {len(heroes)} heroes, {len(arenas)} arenas, {len(bosses)} bosses, {len(SOUNDS)} sounds, {len(ui)} UI pieces -> {GAME}")


if __name__ == "__main__":
    main()
