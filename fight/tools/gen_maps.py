"""Whole-arena maps: one PixelLab image per arena instead of a repeated floor tile.
1v1 arenas are square (384x384); boss / horde arenas are 960x1160 world units (320x384).
Candidates go to art/_candidates/maps/<group>_<id>_s<seed>.png.

    python tools/gen_maps.py [arenas|homes|boss|horde ...]
"""
import sys
groups = sys.argv[1:] or ["arenas", "homes", "boss", "horde"]
sys.argv = sys.argv[:1]
import gen_art_wave2 as w  # noqa: E402
from pixellab_gen import _named_key  # noqa: E402

MAP = ("top-down view straight from above of a game battle arena floor, 16-bit pixel art, crisp chunky pixels, "
       "the whole middle of the floor is open and clear for fighting, decorative details only along the outer edges "
       "and corners, calm muted colors in the center, no characters, no text, no UI")
ARENAS = {
    "colosseum": "a roman colosseum arena: raked sand floor, a ring of worn stone tiles around the edge, broken marble column stumps and shields in the corners",
    "frozen_lake": "a frozen lake arena: smooth pale blue ice with faint scratch marks, snowy banks with small pine trees and rocks around the edges",
    "volcano": "a volcano arena: dark cracked basalt floor, glowing lava rivers running along the outer edges, smoking rocks in the corners",
    "temple": "an ancient sun temple courtyard: golden sandstone floor tiles with a faint carved sun circle, stone lion statues and lit braziers at the edges",
    "night_forest": "a forest clearing at night: dark mossy grass, big dark trees and glowing blue mushrooms around the edges, fireflies",
    "rooftop": "a city rooftop at night: dark grey gravel roof, air vents, pipes, antennas and a low parapet wall around the edges",
    "dojo": "a japanese dojo hall: wide tatami mat floor, dark wooden pillars, weapon racks and paper lanterns along the edges",
    "desert": "desert dunes: golden sand with soft wind ripples, cacti, bleached rocks and an animal skull along the edges",
    "crystal_cave": "a crystal cave: dark purple stone floor, big glowing cyan crystal clusters and stalagmites around the edges",
    "beach": "a sunny beach: light sand, shallow turquoise water and foam along one edge, palm trees and shells in the corners",
}
HOMES = {   # each hero's home stage (characters/art/<id>/map.png)
    "archer": "Whispering Woods: a sunny forest clearing of short green grass with autumn leaves, trees and bushes around the edges",
    "captain": "a hockey rink seen from above: smooth white ice with red and blue lines, boards around the edges",
    "king": "a royal throne room: polished cream marble floor with a long red carpet with gold trim, golden pillars and banners along the edges",
    "knight": "a castle courtyard: grey flagstones with mossy cracks, stone walls, a well and barrels along the edges",
    "necromancer": "a haunted graveyard: grey-brown dirt, tombstones, dead trees and green ghost fog along the edges",
    "ninja": "midnight japanese rooftops: dark grey clay roof tiles, a paper lantern and a full moon glow along the edges",
    "paladin": "a holy sun cathedral: white marble floor with thin gold inlay, stained glass light beams and stone pillars along the edges",
    "samurai": "a moonlit dojo: straw tatami mats with dark wooden borders, cherry blossom petals, bamboo along the edges",
    "vampire": "a blood crypt: black and dark crimson marble checkerboard floor, coffins and red candles along the edges",
    "viking": "a frozen viking longship deck: wooden planks dusted with snow, shields along the rails, a mast at one edge",
    "wizard": "an arcane tower floor: dark blue stone tiles with a faint glowing rune circle, bookshelves and floating candles along the edges",
}
BOSS = {    # boss lairs (art/maps/boss_<kind>.png)
    "dragon": "a dragon's lair: scorched rock floor with scattered gold coins, lava cracks and a treasure hoard along the edges",
    "lich": "the frozen throne: icy dark stone floor with frost, frozen pillars and a dark throne at the top edge",
    "golem": "a crystal canyon: dusty sandstone floor, cliff walls and glowing orange crystals along the edges",
    "kraken": "a sunken dock: wet wooden planks over dark sea water, broken pier posts, ropes and barrels along the edges",
    "mech": "a military titan base: concrete floor with yellow hazard stripes, crates, fences and searchlights along the edges",
}
ROYALE = {   # obstacles are placed on top at random, so these keep the whole floor plain
    "graveyard": "a midnight graveyard ground: dark grass and dirt, a low stone wall and dead bushes only at the very edges",
    "city": "a city street seen from above: grey asphalt with faded road markings and a sidewalk curb along the edges",
    "military": "a military base yard: dusty concrete with faded yellow hazard stripes and a chain fence at the very edges",
    "soccer": "a soccer pitch seen from above: striped green grass with white field lines",
    "ice": "an ice hockey rink seen from above: smooth white-blue ice with red and blue lines and circles, boards at the edges",
    "rocky_canyon": "a rocky canyon floor: flat sandy ground with small pebbles, cliff rocks only at the very edges",
    "lava_ruins": "ancient ruins over lava: cracked dark stone floor tiles, thin glowing lava cracks at the very edges",
    "pillar_hall": "a grand stone hall: blue-grey polished stone floor tiles, a carved border along the edges",
}
HORDE = {
    "skeletons": "a forgotten crypt: dark worn stone floor tiles, crumbling walls, bone piles and candles along the edges",
    "zombies": "an abandoned city street at night: cracked asphalt with faded road lines, wrecked cars, fences and trash bags along the edges",
}
PLAIN = ("top-down view straight from above of a game battle arena floor, 16-bit pixel art, crisp chunky pixels, "
         "a flat open floor with very few small details, no objects in the middle, no walls inside, low contrast, "
         "no characters, no text, no UI")


def make(group, key, desc, size):
    for seed in (3, 21):
        body = dict(w.pix(f"{desc}. {PLAIN if group == 'royale' else MAP}", 320), no_background=False, seed=seed, outline="lineless")
        body["image_size"] = {"width": size[0], "height": size[1]}
        w.gen(f"{w.OUT}/maps/{group}_{key}_s{seed}.png", "/create-image-pixflux", body)


if __name__ == "__main__":
    w.KEY = _named_key("PIXELLAB_API_KEY_3")
    table = {"arenas": (ARENAS, (384, 384)), "homes": (HOMES, (384, 384)),
             "boss": (BOSS, (320, 384)), "horde": (HORDE, (320, 384)), "royale": (ROYALE, (320, 384))}
    for g in groups:
        items, size = table[g]
        for key, desc in items.items():
            make(g, key, desc, size)
    print("done", flush=True)
