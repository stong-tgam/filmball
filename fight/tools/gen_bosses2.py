"""Art for the 5 new bosses: sprite, minion, every skill effect, summon effect, enraged aura, lair map.
Writes straight into art/boss/ (sprites + skill fx), art/boss/fx2/ (auras, summon fx) and art/maps/."""
import sys
sys.argv = sys.argv[:1]
import gen_art_wave2 as w  # noqa: E402
from pixellab_gen import _named_key  # noqa: E402

BOSS = ("giant boss monster, full body, front view, menacing, compact powerful silhouette. 16-bit pixel art game boss "
        "sprite, crisp chunky pixels, bold black outline, vivid saturated colors, transparent background, no text")
MIN = "chibi monster enemy, full body, front view. 16-bit pixel art game sprite, crisp chunky pixels, bold black outline, transparent background, no text"
FX = w.FX
FLAT = "flat 2D game effect, just the effect itself, no ground, no pedestal, no scenery"
MAP = ("top-down view straight from above of a game boss arena floor, 16-bit pixel art, crisp chunky pixels, the whole "
       "middle of the floor is open and clear for fighting, decorative details only along the outer edges and corners, "
       "calm muted colors in the center, no characters, no text, no UI")

ART = [
    # Blood Moon Alpha
    ("art/boss/werewolf.png", 160, f"a huge snarling grey werewolf alpha with glowing red eyes, massive claws, torn fur and a red full moon glow behind, {BOSS}"),
    ("art/boss/dire_wolf.png", 48, f"a fierce dark grey dire wolf with glowing red eyes, running, side view, {MIN}"),
    ("art/boss/claw_slash.png", 160, f"three huge red claw slash marks tearing diagonally across, glowing red edges, {FLAT}. {FX}"),
    ("art/boss/howl_wave.png", 192, f"a ring-shaped red sound shockwave blast seen from above, concentric red and white rings, {FLAT}. {FX}"),
    ("art/boss/pounce_impact.png", 160, f"a heavy landing impact: a burst of dust, flying rocks and claw marks spreading outward seen from above, {FLAT}. {FX}"),
    ("art/boss/fx2/werewolf_enraged_aura.png", 192, f"a ring of blood red mist and red moonlight flames around an empty center, {FLAT}. {FX}"),
    ("art/boss/fx2/werewolf_summon.png", 96, f"a dark swirling shadow portal on the ground seen from above with two glowing red eyes, {FLAT}. {FX}"),
    # Spider Queen
    ("art/boss/spider_queen.png", 160, f"a giant black and purple spider queen with a glowing green abdomen pattern, many red eyes and a jeweled crown, {BOSS}"),
    ("art/boss/spiderling.png", 48, f"a small black spider with a green glowing back and red eyes, {MIN}"),
    ("art/boss/web_beam.png", 192, f"a thick strand of sticky white spider silk web shooting horizontally to the right, with web threads, {FLAT}. {FX}"),
    ("art/boss/venom_splash.png", 128, f"a splash of glowing toxic green venom on impact with droplets, seen from above, {FLAT}. {FX}"),
    ("art/boss/web_pull.png", 192, f"a huge round spider web seen from directly above, white silk threads radiating from the center, {FLAT}. {FX}"),
    ("art/boss/fx2/spider_enraged_aura.png", 192, f"a ring of toxic green mist and floating venom bubbles around an empty center, {FLAT}. {FX}"),
    ("art/boss/fx2/spider_summon.png", 96, f"a cracked open white spider egg sac oozing green slime, seen from above, {FLAT}. {FX}"),
    # Pharaoh Ra-Khet
    ("art/boss/pharaoh.png", 160, f"a towering undead mummy pharaoh king with a golden nemes headdress, glowing blue eyes, bandages, a golden ankh staff, {BOSS}"),
    ("art/boss/mummy.png", 48, f"a shambling bandaged mummy with glowing blue eyes, arms forward, {MIN}"),
    ("art/boss/sand_beam.png", 192, f"a roaring horizontal blast of swirling golden desert sand and wind pointing to the right, {FLAT}. {FX}"),
    ("art/boss/sun_beam_impact.png", 160, f"a pillar of blazing golden sunlight hitting the ground with an egyptian eye of ra symbol glowing, {FLAT}. {FX}"),
    ("art/boss/sarcophagus_slam.png", 192, f"a golden shockwave ring of sand and hieroglyph light bursting outward seen from above, {FLAT}. {FX}"),
    ("art/boss/fx2/pharaoh_enraged_aura.png", 192, f"a ring of swirling golden sand and floating hieroglyphs around an empty center, {FLAT}. {FX}"),
    ("art/boss/fx2/pharaoh_summon.png", 96, f"a swirling golden sand pit vortex on the ground seen from above, {FLAT}. {FX}"),
    # Storm Titan
    ("art/boss/storm_titan.png", 160, f"a colossal storm giant titan made of dark thunderclouds and stone armor with crackling blue lightning eyes and fists, {BOSS}"),
    ("art/boss/storm_sprite.png", 48, f"a small crackling blue electric spark spirit with angry eyes, {MIN}"),
    ("art/boss/lightning_impact.png", 160, f"a bright blue lightning bolt strike hitting the ground with an electric burst and sparks, {FLAT}. {FX}"),
    ("art/boss/chain_lightning.png", 192, f"a jagged horizontal bolt of bright blue and white chain lightning pointing to the right, {FLAT}. {FX}"),
    ("art/boss/thunderclap.png", 192, f"a huge electric blue thunder shockwave ring with lightning arcs seen from above, {FLAT}. {FX}"),
    ("art/boss/fx2/storm_enraged_aura.png", 192, f"a ring of dark storm clouds with crackling blue lightning around an empty center, {FLAT}. {FX}"),
    ("art/boss/fx2/storm_summon.png", 96, f"a small swirling dark storm cloud with a lightning spark, seen from above, {FLAT}. {FX}"),
    # Grim Reaper
    ("art/boss/grim_reaper.png", 160, f"a towering grim reaper in a tattered black hooded robe with a skull face, glowing cyan eyes and a huge scythe, {BOSS}"),
    ("art/boss/shadow_wisp.png", 48, f"a small floating black shadow ghost wisp with glowing cyan eyes, {MIN}"),
    ("art/boss/scythe_sweep.png", 192, f"a huge circular sweep of a scythe blade slash, a ring of dark purple and cyan energy seen from above, {FLAT}. {FX}"),
    ("art/boss/death_mark_impact.png", 160, f"a burst of dark purple soul energy with a glowing cyan skull symbol exploding upward, {FLAT}. {FX}"),
    ("art/boss/soul_reap.png", 192, f"a horizontal stream of ghostly cyan souls and dark purple energy pointing to the right, {FLAT}. {FX}"),
    ("art/boss/fx2/reaper_enraged_aura.png", 192, f"a ring of dark purple shadow smoke and ghostly cyan souls around an empty center, {FLAT}. {FX}"),
    ("art/boss/fx2/reaper_summon.png", 96, f"a dark purple shadow portal on the ground with cyan wisps, seen from above, {FLAT}. {FX}"),
    ("art/boss/fx2/death_mark.png", 128, f"a glowing cyan skull target sigil circle on the ground seen from above, {FLAT}. {FX}"),
]
MAPS = [
    ("werewolf", "a moonlit forest clearing at night: dark grass, big dark pine trees and rocks around the edges, red moonlight"),
    ("spider", "a spider cavern: dark stone floor, thick white spider webs and egg sacs in the corners and along the edges"),
    ("pharaoh", "a golden pharaoh tomb chamber: sandstone floor tiles, golden statues, sarcophagi and hieroglyph walls along the edges"),
    ("storm", "a mountain peak in a thunderstorm: grey rock plateau, cliff edges, puddles and rain around the edges"),
    ("reaper", "a misty river of souls: dark stone floor, a ghostly cyan river and dead trees along the edges, purple fog"),
]

if __name__ == "__main__":
    w.KEY = _named_key("PIXELLAB_API_KEY_3")
    for path, size, d in ART:
        w.gen(path, "/create-image-pixflux", w.pix(d, size))
    for key, d in MAPS:
        for seed in (3, 21):
            body = dict(w.pix(f"{d}. {MAP}", 320), no_background=False, seed=seed, outline="lineless")
            body["image_size"] = {"width": 320, "height": 384}
            w.gen(f"{w.OUT}/maps/boss_{key}_s{seed}.png", "/create-image-pixflux", body)
    print("done", flush=True)
