"""New body candidates for Paladin and King: tougher, cooler, closer to the Knight/Viking look."""
import sys
sys.argv = sys.argv[:1]
import gen_art_wave2 as w  # noqa: E402
from pixellab_gen import _named_key, b64_file  # noqa: E402

STYLE = ("A chibi round ball-shaped fighting game hero with a big round body and small stubby arms, front view, "
         "facing the viewer, the round body fills about 80% of the canvas, cool and heroic, fierce confident look, "
         "glowing eyes. 16-bit pixel art game sprite, crisp chunky pixels, bold black outline, vivid saturated colors, "
         "transparent background, no text")
BODIES = {
    "paladin": [
        "a heroic holy paladin: the round body is polished white and gold plate armor, a closed great helm with a "
        "glowing golden visor slit and bright gold eyes, a floating halo of golden light above the helm, a short blue "
        "cape, a gold cross emblem on the chest",
        "a fierce crusader paladin: a round silver-white armored body with gold trim, a winged gold helmet with a "
        "T-shaped visor glowing white, radiant holy light aura, a sky-blue tabard with a golden sun emblem",
    ],
    "king": [
        "a mighty warrior king: the round body is dark crimson and gold royal armor, a big golden spiked crown with "
        "red gems, a fierce face with a thick grey beard and glowing gold eyes, a white ermine fur mantle on the "
        "shoulders, a royal red cape",
        "a menacing tyrant king: a round body in black and gold armor with a purple royal cape, a tall jagged golden "
        "crown with a glowing ruby, a stern bearded face with angry glowing red eyes, a golden scepter in one hand",
    ],
}

if __name__ == "__main__":
    w.KEY = _named_key("PIXELLAB_API_KEY_3")
    for cid, descs in BODIES.items():
        for i, d in enumerate(descs):
            for seed in (11, 47):
                w.gen(f"{w.OUT}/bodies/{cid}_p{i}_s{seed}.png", "/create-image-pixflux",
                      dict(w.pix(f"{d}. {STYLE}", 64), seed=seed))
            body = dict(w.pix(f"{d}. {STYLE}", 64), seed=5)   # styled after the Knight so it fits the roster
            body["style_image"] = b64_file("characters/art/knight/body.png")
            body["style_strength"] = 30
            w.gen(f"{w.OUT}/bodies/{cid}_p{i}_knightstyle.png", "/create-image-bitforge", body)
    print("done", flush=True)
