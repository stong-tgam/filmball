"""
Project palette ("Arena-28"). Shared by the renderer's interface and the
PixelLab art prompts (as a forced palette) so the art and UI look like one game.
"""

PALETTE = {
    "ink": "#0E0B16",        # outlines, darkest
    "night": "#1F1A2E",
    "panel": "#2E2A47",
    "panel_hi": "#4A4470",
    "lavender": "#7C77A8",
    "mist": "#C9C6E0",
    "cream": "#FFF6E0",
    "red": "#C41E28",        # King
    "red_hi": "#FF5A4E",
    "crimson": "#7A1226",    # Vampire
    "orange": "#E07A2E",     # Viking
    "gold": "#FFB547",
    "yellow": "#FFE066",
    "green": "#3C9A4A",      # Archer
    "lime": "#8FD16A",       # poison, heal
    "forest": "#1F5E3A",
    "blue": "#3C64C8",       # Wizard
    "sky": "#6FA8FF",
    "ice": "#A8E6FF",
    "navy": "#2C3550",       # Samurai
    "purple": "#5E4A8C",     # Necromancer
    "violet": "#9B7BD1",
    "steel": "#D6D6D6",      # Knight
    "iron": "#8A8F9E",
    "wood": "#8B5A2B",
    "ivory": "#E8DCAA",      # Paladin
    "charcoal": "#2D2D3A",   # Ninja
    "soul": "#62F0A0",
}


def rgb(name):
    h = PALETTE[name].lstrip("#")
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def hex_list():
    return list(PALETTE.values())
