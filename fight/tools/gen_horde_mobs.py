"""New horde mobs (one new enemy per wave): straight into art/horde/ (new files only)."""
import sys
sys.argv = sys.argv[:1]
import gen_art_wave2 as w  # noqa: E402
from pixellab_gen import _named_key  # noqa: E402

CH = ("chibi monster enemy, full body, front view, compact chunky round silhouette. 16-bit pixel art game sprite, "
      "crisp chunky pixels, bold black outline, transparent background, no text")
MOBS = [
    ("bone_hound", 48, "a fast skeletal dog made of bones with glowing red eyes, running, side view"),
    ("skeleton_mage", 48, "a skeleton sorcerer in a ragged purple robe holding a staff with a glowing purple orb"),
    ("ghost", 48, "a floating translucent pale cyan ghost with a wailing face and wispy tail"),
    ("skeleton_knight", 64, "a big armored skeleton knight in rusty dark iron armor with a horned helmet and a greatsword"),
    ("zombie_dog", 48, "a fast rotten green zombie dog with exposed ribs and glowing eyes, running, side view"),
    ("zombie_spitter", 48, "a hunched zombie with a swollen throat spitting glowing green acid"),
    ("zombie_riot", 64, "a big armored riot police zombie with a cracked helmet and a riot shield"),
    ("zombie_bloater", 64, "a huge round bloated purple zombie covered in pustules and poison gas, very fat"),
    ("orb_purple", 32, "a glowing purple magic orb projectile with sparkles"),
    ("orb_acid", 32, "a glob of glowing green acid spit projectile with droplets"),
]

if __name__ == "__main__":
    w.KEY = _named_key("PIXELLAB_API_KEY_3")
    for name, size, d in MOBS:
        style = CH if not name.startswith("orb") else w.FX
        w.gen(f"art/horde/{name}.png", "/create-image-pixflux", w.pix(f"{d}, {style}", size))
    print("done", flush=True)
