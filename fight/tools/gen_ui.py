"""UI art for the game (and later the videos): panels, buttons, hero cards, bar frames, badges,
pips, cursors and the menu backdrop. Empty faces, no text: the game writes text on top.
Writes into art/ui/ (two seeds each for the key pieces, so the better one can be kept)."""
import sys
sys.argv = sys.argv[:1]
import gen_art_wave2 as w  # noqa: E402
from pixellab_gen import _named_key  # noqa: E402

UI = ("16-bit pixel art game UI element, fantasy arena fighting game style, crisp chunky pixels, bold black outline, "
      "flat front view, dark purple and gold color scheme, transparent background, absolutely no text, no letters, no numbers")

ART = [
    # (file, width, height, description, seeds)
    ("panel", 192, 128, "an empty rectangular UI panel window frame: dark purple stone face, ornate gold metal border with "
                        "rivets and small gems in the four corners, plain empty center", (5, 17)),
    ("button", 192, 64, "an empty wide rectangular game menu button: dark purple face, thick gold beveled frame, plain empty center", (5, 17)),
    ("button_hover", 192, 64, "an empty wide rectangular game menu button glowing bright: golden yellow face, shining white-gold "
                              "beveled frame with light sparkles, plain empty center", (5, 17)),
    ("card", 128, 160, "an empty tall rectangular character select card frame: dark purple inner area, gold metal border "
                       "with a small gem at the top and bottom, plain empty center", (5, 17)),
    ("card_selected", 128, 160, "an empty tall rectangular character select card frame glowing: bright gold glowing border with "
                                "light rays and sparkles, a shining gem on top, plain dark empty center", (5, 17)),
    ("hp_frame", 192, 32, "an empty long thin horizontal health bar frame: dark empty inside, gold metal border, a small red "
                          "heart gem on the left end", (5, 17)),
    ("meter_frame", 192, 24, "an empty long thin horizontal energy bar frame: dark empty inside, silver-blue metal border, a small "
                             "blue crystal on the left end", (5, 17)),
    ("portrait", 96, 96, "an empty square character portrait frame: thick ornate gold border with corner gems, plain dark empty center", (5, 17)),
    ("vs_badge", 96, 96, "a fiery versus clash emblem: two crossed swords over a burst of orange fire and lightning, no letters", (5, 17)),
    ("round_pip", 32, 32, "a small round empty gem socket in gold metal, dark and unlit", (5,)),
    ("round_pip_won", 32, 32, "a small round glowing golden yellow gem in gold metal, shining", (5,)),
    ("cursor_p1", 32, 32, "a small chunky golden yellow arrow pointer pointing down", (5,)),
    ("cursor_p2", 32, 32, "a small chunky bright cyan blue arrow pointer pointing down", (5,)),
    ("ribbon", 192, 48, "an empty horizontal red banner ribbon scroll with folded ends and gold trim, plain empty center", (5, 17)),
    ("emblem", 160, 96, "an epic fighting game title crest: crossed sword and magic staff behind a round shield with a glowing "
                        "orb, gold and purple, wings on the sides, no letters", (5, 17)),
]

BACKDROP = ("a dramatic fantasy colosseum arena at night seen from the stands: stone arches, torches, glowing banners, "
            "a big empty sandy arena floor in the middle, purple night sky with stars. 16-bit pixel art game title screen "
            "background, crisp chunky pixels, no characters, no text")

if __name__ == "__main__":
    w.KEY = _named_key("PIXELLAB_API_KEY_3")
    for name, wd, ht, d, seeds in ART:
        for seed in seeds:
            body = dict(w.pix(f"{d}. {UI}", wd), seed=seed)
            body["image_size"] = {"width": wd, "height": ht}
            w.gen(f"art/ui/_cand/{name}_s{seed}.png", "/create-image-pixflux", body)
    for seed in (3, 21):
        body = dict(w.pix(BACKDROP, 384), no_background=False, seed=seed, outline="lineless")
        body["image_size"] = {"width": 384, "height": 216}
        w.gen(f"art/ui/_cand/backdrop_s{seed}.png", "/create-image-pixflux", body)
    print("done", flush=True)
