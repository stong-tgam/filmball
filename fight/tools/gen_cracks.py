"""Ground fracture decals for intro landings (flat, seen from above, transparent)."""
import sys
sys.argv = sys.argv[:1]
import gen_art_wave2 as w  # noqa: E402
from pixellab_gen import _named_key  # noqa: E402

FLAT = ("a flat ground decal seen from directly above, no hole, no crater walls, no 3D depth, "
        "16-bit pixel art game effect, crisp chunky pixels, transparent background, no text")
CRACKS = [
    ("crack_glow", "jagged dark radial fracture cracks spreading out in a star pattern from a small impact point, glowing orange molten light inside the cracks, a few small rock chips"),
    ("crack_dark", "jagged black radial fracture lines splitting the stone floor outward from an impact point, chunky broken stone edges, small chips and dust"),
    ("crack_shock", "a cracked impact mark: short radial black cracks with a ring of grey dust and small rock fragments around the impact point"),
]

if __name__ == "__main__":
    w.KEY = _named_key("PIXELLAB_API_KEY_3")
    for name, d in CRACKS:
        for seed in (5, 17):
            w.gen(f"{w.OUT}/cracks/{name}_s{seed}.png", "/create-image-pixflux", dict(w.pix(f"{d}. {FLAT}", 160), seed=seed))
    print("done", flush=True)
