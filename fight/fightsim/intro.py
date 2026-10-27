"""
Intro hook styles: the first ~1.4 s before "FIGHT!", built to stop the swipe.

Each style lists its impact moments (video seconds, intensity 0-1), which drive screen shake
and the white flash in the renderer, and its sound cues, which the mixer adds on top of the
announcer. A matchup gets a style from its fighter order (so a rematch with swapped sides
usually gets a different one); a spec can force one with "intro_style".
"""

import zlib

INTRO_STYLES = {
    # both charge in from the walls and SMASH in the middle (impact frame, hit-stop, burst)
    "smash": {
        "hits": [(0.30, 1.0)],
        "hitstop": 0.16,
        "sounds": [(0.03, "shoot", 0.45, 0.5), (0.12, "shoot", 0.6, 0.45),
                   (0.30, "death_main", 1.25, 0.8), (0.30, "shockwave", 0.8, 1.0), (0.30, "clash", 0.7, 0.55)],
    },
    # both fall out of the sky and crater the floor, one after the other: BOOM-BOOM
    "drop": {
        "hits": [(0.22, 0.75), (0.34, 1.0)],
        "sounds": [(0.0, "debuff", 1.6, 0.6),
                   (0.22, "shockwave", 0.9, 0.9), (0.22, "body_hit", 0.6, 0.6),
                   (0.34, "shockwave", 0.7, 1.0), (0.34, "death_main", 1.4, 0.6),
                   (0.47, "clash", 0.9, 0.45)],
    },
    # fighting-game split screen: giant portraits, lightning on the split, then it shatters
    "faceoff": {
        "hits": [(0.15, 0.6), (0.95, 1.0)],
        "sounds": [(0.15, "clash", 0.8, 0.7), (0.15, "shockwave", 1.2, 0.6),
                   (0.35, "spell_hit", 1.5, 0.45), (0.58, "spell_hit", 1.7, 0.45), (0.78, "spell_hit", 1.9, 0.5),
                   (0.95, "death_main", 1.2, 0.8), (0.95, "shockwave", 0.8, 1.0)],
    },
    # three collisions that escalate: BAM! BAM!! SMASH!!!
    "rally": {
        "hits": [(0.18, 0.35), (0.42, 0.6), (0.72, 1.0)],
        "hitstop": 0.12,
        "sounds": [(0.18, "body_hit", 1.0, 0.7), (0.18, "clash", 1.3, 0.4),
                   (0.42, "body_hit", 0.8, 0.85), (0.42, "clash", 1.0, 0.55), (0.42, "shockwave", 1.3, 0.5),
                   (0.72, "death_main", 1.25, 0.8), (0.72, "shockwave", 0.8, 1.0), (0.72, "clash", 0.7, 0.55)],
    },
}
# battle royale: everyone crashes down one after another, then the title slams in
INTRO_STYLES["royale"] = {
    "hits": [(0.12 + 0.12 * i, 0.4 if i < 5 else 0.6) for i in range(8)],
    "sounds": [(0.12 + 0.12 * i, "body_hit", 0.8 + 0.06 * i, 0.55) for i in range(6)]
              + [(0.86, "shockwave", 0.9, 0.9), (0.86, "clash", 0.8, 0.5)],
}
# soccer: the ball slams down on the centre spot, the four players crash in, team banner
INTRO_STYLES["soccer"] = {
    "hits": [(0.3, 1.0), (0.48, 0.35), (0.58, 0.35), (0.68, 0.35), (0.78, 0.35)],
    "sounds": [(0.0, "debuff", 1.4, 0.55), (0.3, "shockwave", 0.9, 1.0), (0.3, "clash", 0.9, 0.5),
               (0.48, "body_hit", 0.9, 0.5), (0.58, "body_hit", 1.0, 0.5), (0.68, "body_hit", 1.1, 0.5),
               (0.78, "body_hit", 1.2, 0.5), (0.95, "whistle", 1.0, 0.9)],
}
# horde: the hero crashes down, the horde creeps in from the edges, the question appears
INTRO_STYLES["horde"] = {
    "hits": [(0.3, 0.9)],
    "sounds": [(0.0, "debuff", 1.5, 0.55), (0.3, "shockwave", 0.9, 1.0), (0.3, "clash", 0.9, 0.5),
               (0.55, "wave_horn", 1.0, 0.7)],
}
# boss raid: warning siren, the boss crashes down, the party drops into the corners
INTRO_STYLES["boss"] = {
    "hits": [(0.35, 1.0), (0.62, 0.3), (0.72, 0.3), (0.82, 0.3), (0.92, 0.3)],
    "sounds": [(0.0, "warn", 1.0, 0.7), (0.35, "death_main", 0.7, 0.9), (0.35, "shockwave", 0.6, 1.0),
               (0.62, "body_hit", 0.9, 0.5), (0.72, "body_hit", 1.0, 0.5), (0.82, "body_hit", 1.1, 0.5),
               (0.92, "body_hit", 1.2, 0.5)],
}
STYLE_ORDER = ["smash", "drop", "faceoff", "rally"]


def intro_style(spec):
    if (spec or {}).get("mode") in ("royale", "soccer", "horde", "boss"):
        return spec["mode"]
    forced = (spec or {}).get("intro_style")
    if forced in INTRO_STYLES:
        return forced
    ids = "|".join(str(f.get("id", f.get("name", "?"))) for f in (spec or {}).get("fighters", []))
    return STYLE_ORDER[zlib.crc32(ids.encode()) % len(STYLE_ORDER)]
