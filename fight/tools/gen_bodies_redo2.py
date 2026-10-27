"""Full-body remakes of the remaining ball-shaped heroes, in the new King / Paladin style."""
import sys
sys.argv = sys.argv[:1]
import gen_art_wave2 as w  # noqa: E402
from gen_bodies_redo import STYLE  # noqa: E402
from pixellab_gen import _named_key  # noqa: E402

BODIES = {
    "wizard": "a powerful archmage wizard: a tall crooked purple wizard hat with a yellow star, a long flowing white beard, "
              "glowing blue eyes, royal blue robes with gold trim and star patterns, holding a gnarled staff with a burning orange orb",
    "samurai": "a fearsome samurai warrior: dark navy lacquered samurai armor with red cords, a red headband, a kabuto helmet "
               "with golden crescent crest, a menpo face mask with glowing eyes, a katana at the hip",
    "vampire": "a sinister vampire lord: pale grey skin, slicked black hair with a widow's peak, glowing red eyes, small fangs, "
               "a tall high-collared black cape with crimson lining, a dark red noble vest with a ruby brooch",
    "knight": "a brave armored knight: polished light-grey steel plate armor, a great helm with a dark visor slit and two "
              "glowing yellow eyes, a tall red feather plume on top, a red tabard, holding a longsword",
    "necromancer": "a creepy necromancer: a ragged dark purple hooded robe, a bone-white skull face with glowing green eye "
                   "sockets, bone necklaces, skeletal hands with green magic, holding a skull staff",
    "ninja": "a stealthy ninja assassin: a charcoal black ninja outfit and mask, only a narrow eye slit showing sharp white "
             "eyes, long black mask tails, a purple sash, shuriken on the belt, a short blade on the back",
    "archer": "a forest ranger archer: a deep green hood and cloak with a leaf clasp, a shadowed face with glowing eyes, "
              "brown leather armor, a quiver of green-fletched arrows, holding a longbow",
}

if __name__ == "__main__":
    w.KEY = _named_key("PIXELLAB_API_KEY_3")
    for cid, d in BODIES.items():
        for seed in (11, 29, 47):
            w.gen(f"{w.OUT}/bodies/{cid}_s{seed}.png", "/create-image-pixflux", dict(w.pix(f"{d}. {STYLE}", 64), seed=seed))
    print("done", flush=True)
