"""Casting sigils: the glowing circle each boss draws on the floor while it winds up a skill."""
import sys
sys.argv = sys.argv[:1]
import gen_art_wave2 as w  # noqa: E402
from pixellab_gen import _named_key  # noqa: E402

FLAT = ("a glowing magic summoning circle on the floor seen from directly above, intricate runes and rings, "
        "flat 2D, no ground, no pedestal")
SIGILS = {
    "dragon": "blazing orange and red fire runes with dragon scale patterns",
    "lich": "icy pale blue and purple necromantic runes with skulls",
    "golem": "glowing orange crystal runes carved in stone",
    "kraken": "deep blue and teal water runes with tentacle shapes",
    "mech": "red and cyan sci-fi hexagon targeting circle",
    "werewolf": "blood red moon runes with claw marks",
    "spider": "toxic green runes woven like a spider web",
    "pharaoh": "golden egyptian hieroglyph ring with an eye of ra",
    "storm": "electric blue lightning runes crackling",
    "reaper": "dark purple and cyan death runes with a skull",
}

if __name__ == "__main__":
    w.KEY = _named_key("PIXELLAB_API_KEY_3")
    for k, d in SIGILS.items():
        w.gen(f"art/boss/fx2/{k}_cast.png", "/create-image-pixflux", w.pix(f"{FLAT}, {d}. {w.FX}", 160))
    print("done", flush=True)
