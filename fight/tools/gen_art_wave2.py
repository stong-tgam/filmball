"""
Wave-2 art candidates (PixelLab, paid key PIXELLAB_API_KEY_3): opening effects, hero poses
(hurt / KO / victory) and neutral 1v1 arenas. Everything lands in art/_candidates/<group>/
for review; nothing is used by the renderer until it's approved and moved.

    python tools/gen_art_wave2.py [intro|poses|arenas|hero_fx|boss_fx ...]   # default: all groups
Skips files that already exist, so it resumes after a network error.
"""

import base64
import datetime
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pixellab_gen import Stop, _named_key, b64_file, call, log  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(ROOT)
OUT = "art/_candidates"
FX = "16-bit pixel art game effect sprite, crisp chunky pixels, vivid saturated colors, bold black outline, transparent background, no text"
DECO = "16-bit pixel art game prop sprite, crisp chunky pixels, bold black outline, front view, transparent background, no text"
TILE = "seamless tileable floor texture viewed from directly above, 16-bit pixel art, calm low-contrast pattern, no objects, no text"

INTRO = [
    ("meteor", 128, "a huge flaming meteor fireball plunging diagonally downward with a long fiery trail and sparks"),
    ("lightning_strike", 128, "a tall jagged bright white and electric blue lightning bolt striking straight down, vertical, with a glowing impact flash at the bottom"),
    ("smoke_portal", 128, "a swirling dark purple magic portal vortex seen from directly above, glowing violet rim, sparkles"),
    ("shockwave_ring", 128, "a wide circular ground shockwave ring seen from directly above, white and pale blue energy ring with dust"),
    ("debris_burst", 128, "an explosion of flying rock chunks, pebbles and dust radiating outward from the center, seen from above"),
    ("clash_star", 128, "a giant comic-book clash starburst explosion, spiky yellow orange and white burst with black outline, impact frame"),
    ("dust_cloud", 96, "a big puffy cloud of tan landing dust spreading sideways along the ground"),
    ("fire_ring", 128, "a ring of roaring orange flames on the ground seen from directly above, empty center"),
    ("energy_pillar", 96, "a tall vertical pillar of glowing golden light beam shooting up from the ground with sparkles, vertical"),
    # signature entrances, one per hero
    ("enter_wizard", 96, "a magic teleport effect: a column of sparkling blue and purple stars and swirling arcane runes"),
    ("enter_vampire", 96, "a burst of a dozen small black bats with red eyes scattering outward from the center"),
    ("enter_ninja", 96, "a ninja smoke bomb: a thick puff of grey-white smoke with a few small black shuriken flying out"),
    ("enter_necromancer", 96, "an eerie burst of green ghost fire with small floating skulls rising from the ground"),
    ("enter_king", 96, "a royal entrance: a shower of gold coins and sparkles with a red carpet unrolling on the ground"),
    ("enter_knight", 96, "a giant steel sword stabbed point-first into the cracked ground, glinting, vertical"),
    ("enter_paladin", 96, "a holy beam of white and gold light from above with feathers and a glowing halo ring on the ground"),
    ("enter_samurai", 96, "a swirl of pink cherry blossom petals with a single sharp white sword slash streak"),
    ("enter_viking", 96, "a thunder impact: a Norse war hammer slamming the ground with blue lightning cracks spreading"),
    ("enter_archer", 96, "a volley of five green-fletched arrows stuck in the ground in a circle, leaves fluttering"),
    ("enter_captain", 96, "an ice spray: a big splash of white ice shavings and snow kicked up sideways like a hockey stop"),
]

POSES = {
    "hurt": "the same character but hurt and in pain: squinting pained eyes, gritted teeth, a few cracks and a bandage, sweat drops",
    "ko": "the same character knocked out: dizzy X-shaped eyes, mouth open, cracked and dented, little stars spinning above",
    "victory": "the same character victorious: big proud grin, eyes shining, glowing golden outline, small sparkles around",
}
HEROES = ["archer", "captain", "king", "knight", "necromancer", "ninja", "paladin", "samurai", "vampire", "viking", "wizard"]

ARENAS = [
    ("colosseum", "sandy colosseum arena floor with faint raked lines", ["a broken white marble column", "a bronze roman shield and spear leaning together"]),
    ("volcano", "dark basalt rock floor with thin glowing orange lava cracks", ["a small erupting lava rock with smoke", "a black obsidian crystal cluster"]),
    ("frozen_lake", "smooth pale blue ice floor with faint white scratch marks", ["a snowy pine tree", "a cracked chunk of blue ice"]),
    ("temple", "ancient golden-tan temple floor tiles with faint carved patterns", ["a stone guardian lion statue", "a lit golden brazier with fire"]),
    ("night_forest", "dark mossy forest ground with grass tufts and fallen leaves at night", ["a glowing blue mushroom cluster", "a mossy tree stump"]),
    ("rooftop", "dark grey city rooftop gravel floor with faint painted lines", ["a rooftop air conditioner unit", "a tall radio antenna with a red light"]),
    ("dojo", "warm tan tatami mat floor with dark seams", ["a wooden training dummy", "a paper lantern on a stand"]),
    ("desert", "golden desert sand floor with soft wind ripples", ["a green saguaro cactus", "a sun-bleached animal skull on a rock"]),
    ("crystal_cave", "dark purple cave floor with faint glowing crystal specks", ["a big glowing cyan crystal cluster", "a stalagmite rock"]),
    ("beach", "light beach sand floor with a few tiny shells", ["a palm tree", "a red and white beach umbrella"]),
]


HERO_FX = [   # (file, size, description): ultimate cast effects + signature hits, one set per hero
    ("archer_arrow_rain", 160, "a volley of a dozen glowing green arrows raining diagonally down from the sky with light trails"),
    ("archer_arrow_hit", 64, "a small burst of green leaves and wood splinters from an arrow impact"),
    ("captain_onetimer", 160, "a giant black hockey puck blazing forward to the right with a long golden fire streak and ice shards"),
    ("captain_ice_hit", 96, "an explosion of white ice shards and snow spray from a powerful impact"),
    ("king_royal_portal", 128, "a golden royal summoning circle on the ground seen from above with a crown emblem and red gem glow"),
    ("king_coin_burst", 64, "a burst of shiny gold coins and sparkles flying outward"),
    ("knight_mega_sword", 192, "a gigantic glowing holy steel greatsword pointing up, blade wrapped in white light and golden runes, vertical"),
    ("knight_slash", 128, "a huge curved white sword slash arc with a steel blue edge, crescent shape"),
    ("necro_soul_drain", 160, "streams of glowing green ghost souls with screaming faces swirling into a dark vortex"),
    ("necro_skull_burst", 96, "a burst of green spirit fire shaped like a big glowing skull"),
    ("ninja_shadow_smoke", 128, "a large swirl of dark purple-black shadow smoke with glowing white eyes peeking out"),
    ("ninja_poison_cloud", 96, "a toxic green poison gas cloud with bubbles, seen from above"),
    ("paladin_holy_pillar", 192, "a towering pillar of holy golden-white light shining down with angel feathers and a halo, vertical"),
    ("paladin_holy_ring", 160, "a wide golden holy shockwave ring seen from directly above with crosses of light and sparkles"),
    ("samurai_blade_dance", 160, "a storm of many crossing white katana slash streaks in a circle with pink cherry blossom petals"),
    ("samurai_slash", 96, "a single sharp diagonal white katana slash streak with a red edge"),
    ("vampire_bat_swarm", 160, "a dense swirling swarm of black bats with red eyes forming a ring"),
    ("vampire_crimson_drain", 96, "glowing crimson red magic orbs and wisps flowing in a spiral"),
    ("viking_ground_slam", 192, "a massive ground slam crater seen from above with radial cracks, flying rocks and blue lightning sparks"),
    ("viking_thunder", 96, "a crackling blue lightning burst with a small Norse rune in the middle"),
    ("wizard_frost_nova", 192, "a huge exploding ring of ice crystals and frost seen from directly above, pale blue and white"),
    ("wizard_fire_blast", 96, "a fiery orange explosion burst from a fireball impact with embers"),
]

BOSS_FX = [   # bigger, more epic boss skill art
    ("dragon_fire_breath_big", 256, "a massive cone of roaring dragon fire breath spreading to the right, orange yellow and white hot core, embers"),
    ("dragon_tail_sweep", 192, "a huge sweeping red scaled dragon tail swinging in an arc with a wind shockwave, seen from above"),
    ("dragon_meteor_impact", 160, "a giant fiery meteor impact explosion crater seen from above, lava splashes, fire burst"),
    ("dragon_summon_portal", 128, "a burning fire portal on the ground seen from above, ring of flames with a dark center"),
    ("dragon_enraged_aura", 192, "a roaring ring of red and orange fire aura flames around an empty center"),
    ("lich_soul_beam_big", 256, "a thick horizontal beam of purple and cyan soul energy with ghostly faces, pointing right, glowing white core"),
    ("lich_frost_nova_big", 256, "a gigantic frost nova of jagged ice spikes erupting outward in a ring seen from above"),
    ("lich_grave_rise", 128, "a cracked grave on the ground seen from above with a skeletal hand bursting out and green mist"),
    ("lich_soul_impact", 128, "a burst of purple ghost fire with spiralling souls from an impact, seen from above"),
    ("lich_enraged_aura", 192, "a swirling ring of icy blue and purple spectral flames and floating runes around an empty center"),
    ("golem_ground_pound", 256, "a massive earthquake ground pound seen from above: a crater with radial cracks, rock spikes and dust ring"),
    ("golem_boulder_impact", 160, "a big boulder smashing into the ground seen from above, rock shards and dust exploding outward"),
    ("golem_rock_spike", 96, "a sharp jagged stone spike bursting up out of the ground with glowing orange crystal tip"),
    ("golem_enraged_aura", 192, "a ring of floating rocks and glowing orange crystal shards orbiting an empty center"),
    ("kraken_tentacle_big", 256, "a giant thick purple kraken tentacle with suction cups slamming down horizontally pointing right, water splash"),
    ("kraken_whirlpool_big", 256, "a huge swirling ocean whirlpool vortex seen from directly above with foam and dark blue depths"),
    ("kraken_ink_impact", 128, "a big dark purple-black ink explosion splash seen from above with droplets"),
    ("kraken_enraged_aura", 192, "a ring of churning ocean waves and white foam around an empty center"),
    ("mech_laser_big", 256, "a thick horizontal red laser cannon beam pointing right with a white hot core, glow and sparks"),
    ("mech_missile_impact", 128, "a fiery missile explosion with smoke and metal shrapnel, seen from above"),
    ("mech_overdrive_slam", 256, "a sci-fi energy shockwave seen from above, cyan electric ring with hexagon grid pattern and sparks"),
    ("mech_deploy_pad", 96, "a sci-fi teleporter drop pad on the ground seen from above with a glowing cyan ring"),
    ("mech_enraged_aura", 192, "a ring of red warning electric arcs and sparks around an empty center"),
    ("danger_marker", 128, "a red danger warning target reticle on the ground seen from above, red circle with crosshair and exclamation mark"),
]


def gen(out, endpoint, body, retries=4):
    if os.path.exists(out):
        return False
    for i in range(retries):
        try:
            r = call(KEY, "POST", endpoint, body, timeout=240)
            break
        except Stop as e:
            if "network error" not in str(e) or i == retries - 1:
                raise
            time.sleep(20)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    with open(out, "wb") as f:
        f.write(base64.b64decode(r["image"]["base64"]))
    log({"time": datetime.datetime.now().isoformat(timespec="seconds"), "job": "wave2." + os.path.basename(out),
         "endpoint": endpoint, "usage": r.get("usage"), "out": out})
    print(out, flush=True)
    return True


def pix(desc, size):
    return {"no_background": True, "outline": "single color black outline", "shading": "basic shading",
            "detail": "medium detail", "text_guidance_scale": 8, "description": desc,
            "image_size": {"width": size, "height": size}}


def run_intro():
    for name, size, d in INTRO:
        gen(f"{OUT}/intro/{name}.png", "/create-image-pixflux", pix(f"{d}. {FX}", size))


def run_poses():
    for cid in HEROES:
        ch = json.load(open(f"characters/{cid}.json", encoding="utf-8"))
        base = f"characters/art/{cid}/body.png"
        body_desc = ch["art"]["body"]
        shape = ("a full body hockey player, front view" if cid == "captain"
                 else "a head-only round ball character with no arms and no legs, front view")
        for pose, mod in POSES.items():
            d = (f"{shape}: {body_desc}. {mod}. 16-bit pixel art game sprite, crisp chunky pixels, "
                 "bold black outline, transparent background, no text")
            body = pix(d, 64)
            body["style_image"] = b64_file(base)
            body["style_strength"] = 55
            gen(f"{OUT}/poses/{cid}_{pose}.png", "/create-image-bitforge", body)


def run_arenas():
    for name, floor, decos in ARENAS:
        gen(f"{OUT}/arenas/{name}_floor.png", "/create-image-pixflux",
            dict(pix(f"{floor}, {TILE}", 64), no_background=False))
        for i, d in enumerate(decos):
            gen(f"{OUT}/arenas/{name}_deco{i}.png", "/create-image-pixflux", pix(f"{d}. {DECO}", 64))


def run_hero_fx():
    for name, size, d in HERO_FX:
        gen(f"{OUT}/hero_fx/{name}.png", "/create-image-pixflux", pix(f"{d}. {FX}", size))


def run_boss_fx():
    for name, size, d in BOSS_FX:
        gen(f"{OUT}/boss_fx/{name}.png", "/create-image-pixflux", pix(f"{d}. {FX}", size))


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    KEY = _named_key("PIXELLAB_API_KEY_3")
    groups = sys.argv[1:] or ["intro", "poses", "arenas"]
    for g in groups:
        {"intro": run_intro, "poses": run_poses, "arenas": run_arenas,
         "hero_fx": run_hero_fx, "boss_fx": run_boss_fx}[g]()
    print("done", flush=True)
