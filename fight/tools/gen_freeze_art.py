"""Freeze art candidates: the ice prison around a frozen fighter, the frost patch under it, and the shatter."""
import sys
sys.argv = sys.argv[:1]
import gen_art_wave2 as w  # noqa: E402
from pixellab_gen import _named_key  # noqa: E402

FREEZE = [
    ("ice_prison_a", 128, "a ring of jagged pale blue ice crystal shards and icicles forming a frame around an empty round center, frost sparkles, front view"),
    ("ice_prison_b", 128, "a big chunky ice block cage made of thick translucent light-blue ice crystals around an empty middle, white highlights, front view"),
    ("ice_crown", 96, "a cluster of sharp ice crystal spikes growing upward, pale cyan with white glints, front view"),
    ("frost_patch_a", 128, "a round frozen frost patch on the ground seen from directly above, white and pale blue ice with snowflake cracks spreading out"),
    ("frost_patch_b", 128, "a circular icy puddle of frost on the floor seen from above, jagged white frost edges and small ice shards"),
    ("ice_shatter_a", 128, "ice breaking apart: many pale blue and white ice shards and chunks exploding outward from the center, sparkles"),
    ("ice_shatter_b", 96, "a burst of glittering snow and small ice fragments flying outward"),
    ("snowflake", 32, "a single bright white and pale blue snowflake sparkle"),
]

if __name__ == "__main__":
    w.KEY = _named_key("PIXELLAB_API_KEY_3")
    for name, size, d in FREEZE:
        w.gen(f"{w.OUT}/freeze/{name}.png", "/create-image-pixflux", w.pix(f"{d}. {w.FX}", size))
    print("done", flush=True)
