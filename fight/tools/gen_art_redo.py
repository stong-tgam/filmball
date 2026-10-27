"""Second tries for weak wave-2 candidates: saved as <name>_v2.png next to the first try."""
import sys
sys.argv = sys.argv[:1]
import gen_art_wave2 as w  # noqa: E402
from pixellab_gen import _named_key  # noqa: E402

FX = w.FX
FLAT = ("flat 2D game effect, no ground, no rocks, no pedestal, no scenery, just the energy effect itself")
REDO = [
    ("intro", "enter_king", 96, "a golden royal fanfare burst: gold sparkles and a floating golden crown shining with light rays"),
    ("intro", "enter_samurai", 96, "a whirlwind of pink cherry blossom petals swirling in a spiral, a few white wind streaks"),
    ("intro", "enter_vampire", 96, "a cloud of small black bats with glowing red eyes and red mist bursting outward"),
    ("boss_fx", "kraken_tentacle_big", 192, "one long thick purple octopus tentacle stretched straight horizontally, pointing right, pale suction cups along the bottom, water drops, no head, no body"),
    ("boss_fx", "mech_missile_impact", 160, "a big fiery explosion fireball with orange flames, black smoke puffs and flying metal shrapnel"),
    ("boss_fx", "golem_ground_pound", 192, "an earthquake shockwave: a ring of brown dust and flying rock chunks bursting outward with orange glowing cracks radiating from the center"),
    ("hero_fx", "archer_arrow_hit", 64, "a small bright green impact star burst with spark lines and a broken arrow shaft"),
    ("hero_fx", "knight_mega_sword", 192, "a gigantic glowing greatsword pointing up, blazing white and gold aura of light around the blade, light rays, vertical"),
    ("hero_fx", "ninja_shadow_smoke", 128, "a swirling burst of purple-black shadow smoke wisps with three white ninja silhouettes inside"),
    ("hero_fx", "paladin_holy_pillar", 192, "a tall vertical column of holy golden-white light beam shining down from above, sparkles and small light crosses"),
    ("hero_fx", "samurai_slash", 96, "a single long sharp diagonal white crescent sword slash streak with a pale blue glow"),
    ("hero_fx", "viking_ground_slam", 192, "a huge blue lightning shockwave burst with radial electric cracks and flying sparks spreading outward"),
]

PROJ = [   # ranged attacks: launch flash, the projectile itself, landing impact, floor mark
    ("fireball", 64, "a blazing round fireball flying to the right with a swirling flame tail, bright yellow core"),
    ("fireball_cast", 96, "a burst of fire magic at a staff tip: orange flame flash with a small glowing rune circle"),
    ("fireball_impact", 128, "a fireball explosion on landing: round orange and yellow fire burst with embers and a smoke ring"),
    ("scorch_mark", 96, "a black burnt scorch mark on the ground seen from above with a few glowing orange embers"),
    ("arrow", 64, "a glowing green-fletched arrow flying to the right with a thin green light trail"),
    ("arrow_launch", 64, "a bow release burst: a green wind gust and small leaves shooting forward to the right"),
    ("arrow_impact", 96, "an arrow impact: a bright green star burst with wood splinters and leaves flying"),
    ("puck", 64, "a black hockey puck flying to the right with a long golden speed streak and ice sparkles"),
    ("puck_launch", 96, "a slapshot blast: a white ice spray and shockwave burst shooting to the right"),
    ("puck_impact", 96, "an ice shatter impact: white and pale blue ice shards and snow exploding outward"),
    ("shuriken", 48, "a spinning steel ninja shuriken star with motion blur and a purple glow"),
    ("shuriken_launch", 64, "a quick purple shadow wind slash burst shooting to the right"),
    ("shuriken_impact", 64, "a sharp metal impact spark burst: white and purple sparks with tiny steel flecks"),
    ("bolt_impact", 64, "a red laser bolt impact: a red energy spark burst with white hot center"),
]

if __name__ == "__main__":
    w.KEY = _named_key("PIXELLAB_API_KEY_3")
    for group, name, size, d in REDO:
        w.gen(f"{w.OUT}/{group}/{name}_v2.png", "/create-image-pixflux", w.pix(f"{d}. {FLAT}. {FX}", size))
    for name, size, d in PROJ:
        w.gen(f"{w.OUT}/projectiles/{name}.png", "/create-image-pixflux", w.pix(f"{d}. {FX}", size))
    print("done", flush=True)
