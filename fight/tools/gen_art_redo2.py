"""Third pass: busy floor tiles and weak projectile pieces."""
import sys
sys.argv = sys.argv[:1]
import gen_art_wave2 as w  # noqa: E402
from pixellab_gen import _named_key  # noqa: E402

TILE = ("seamless tileable flat floor texture viewed from directly above, 16-bit pixel art, very simple calm "
        "low-contrast pattern, flat top-down, no objects, no walls, no perspective, no text")
FLOORS = [
    ("colosseum", "packed sand arena ground with a few small pebbles and faint footprints"),
    ("crystal_cave", "dark purple stone cave floor with a few tiny glowing cyan crystal specks"),
    ("night_forest", "dark green mossy grass ground with tiny clover and a few fallen leaves"),
    ("rooftop", "dark grey gravel rooftop surface with tiny stones"),
]
PROJ = [
    ("fireball_cast", 96, "a round burst of orange fire sparks and flame flash exploding outward to the right, no torch, no stick"),
    ("scorch_mark", 96, "a flat black burnt scorch stain on the floor seen from directly above, round with ragged edges and a few glowing orange embers, flat, no smoke"),
    ("shuriken_launch", 64, "a curved purple shadow wind swoosh streak with small sparks, motion trail, no weapon"),
]

if __name__ == "__main__":
    w.KEY = _named_key("PIXELLAB_API_KEY_3")
    for name, d in FLOORS:
        w.gen(f"{w.OUT}/arenas/{name}_floor_v2.png", "/create-image-pixflux", dict(w.pix(f"{d}, {TILE}", 64), no_background=False))
    for name, size, d in PROJ:
        w.gen(f"{w.OUT}/projectiles/{name}_v2.png", "/create-image-pixflux", w.pix(f"{d}. {w.FX}", size))
    print("done", flush=True)
