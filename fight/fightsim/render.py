"""
Renderer: replays a World frame by frame in an arcade fighting-game style.

Everything is drawn on a small 540x960 pixel canvas and scaled up by a whole
number with hard edges, so circles, lines and text all come out as real
pixels. PixelLab sprites in characters/art/<id>/ replace the procedural
drawing where they exist. Frames are piped to the ffmpeg bundled with
imageio-ffmpeg. Visual randomness (shake, floor specks) uses its own RNG so
the simulation is never affected.
"""

import math
import os
import random
import subprocess

os.environ.setdefault("SDL_VIDEODRIVER", "dummy")
os.environ.setdefault("PYGAME_HIDE_SUPPORT_PROMPT", "1")

import imageio_ffmpeg  # noqa: E402
import pygame  # noqa: E402

from .palette import rgb  # noqa: E402
from . import cta  # noqa: E402
from .intro import INTRO_STYLES, intro_style  # noqa: E402
from .sim import FPS, ITEMS, World  # noqa: E402

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

IW, IH = 540, 960   # internal pixel canvas; the video is an integer multiple of it
# iPhones are ~9:19.5, so the Shorts player crops the sides of a 9:16 video. Everything
# important stays inside this centred safe width (about 9:19.5 of the full height).
SAFE = 46                     # internal px kept clear on the left and right
# Shorts overlays: search/camera icons over the top ~8% and the title/channel over the
# bottom ~20%. The HUD starts below the top overlay; panels end above the bottom one.
HUD_Y = 96
SAFE_W = IW - 2 * SAFE
BAR_W = IW // 2 - 32 - (SAFE + 60)   # HP bar: portrait edge to timer box

CUT_IN, CAST_FX = 0.85, 2.0   # ultimate cut-in banner / casting effects, seconds
# wave-2 PixelLab effects (each is optional: missing files fall back to the old drawing)
PROJ_FX = {   # style -> (launch flash, impact burst, impact size in world units)
    "fireball": ("fireball_launch", "fireball_impact", 120),
    "arrow": ("arrow_launch", "arrow_impact", 80),
    "puck": ("puck_launch", "puck_impact", 100),
    "shuriken": ("shuriken_launch", "shuriken_impact", 70),
    "bolt": (None, "bolt_impact", 60),
}
ULT_FX = {    # character -> [(art/fx/ult file, layer, size x radius, seconds)]
    "archer": [("archer_arrow_rain", "under", 4.2, 0.55)],
    "captain": [("captain_onetimer", "under", 3.6, 0.45)],
    "king": [("king_royal_portal", "under", 4.0, 0.6)],
    "knight": [("knight_mega_sword", "under", 4.8, 0.55)],
    "necromancer": [("necro_soul_drain", "under", 5.0, 0.6)],
    "ninja": [("ninja_shadow_smoke", "under", 4.0, 0.55)],
    "paladin": [("paladin_holy_ring", "under", 6.0, 0.55), ("paladin_holy_pillar", "under", 4.6, 0.55)],
    "samurai": [("samurai_blade_dance", "under", 4.4, 0.55)],
    "vampire": [("vampire_bat_swarm", "under", 4.6, 0.55)],
    "viking": [("viking_ground_slam", "under", 6.5, 0.55)],
    "wizard": [("wizard_frost_nova", "under", 6.5, 0.55)],
}
BOSS_IMPACT_FX = {   # boss skill name -> art/boss/fx2 file drawn when it lands
    "FIRE BREATH": "dragon_fire_breath_big", "TAIL SWEEP": "dragon_tail_sweep", "METEOR RAIN": "dragon_meteor_impact",
    "SOUL BEAM": "lich_soul_beam_big", "FROST NOVA": "lich_frost_nova_big", "SOUL RAIN": "lich_soul_impact",
    "BOULDER THROW": "golem_boulder_impact", "GROUND POUND": "golem_ground_pound", "ROCKSLIDE": "golem_boulder_impact",
    "TENTACLE SLAM": "kraken_tentacle_big", "TENTACLE STORM": "kraken_tentacle_big", "WHIRLPOOL": "kraken_whirlpool_big",
    "INK BLAST": "kraken_ink_impact", "MISSILE BARRAGE": "mech_missile_impact", "LASER SWEEP": "mech_laser_big",
    "OVERDRIVE SLAM": "mech_overdrive_slam",
}
BOSS_PREFIX = {"dragon": "dragon", "lich_king": "lich", "golem": "golem", "kraken": "kraken", "mech_titan": "mech",
               "werewolf": "werewolf", "spider_queen": "spider", "pharaoh": "pharaoh", "storm_titan": "storm",
               "grim_reaper": "reaper"}
SUMMON_FX = {"dragon": "dragon_summon_portal", "lich": "lich_grave_rise", "golem": "golem_rock_spike",
             "mech": "mech_deploy_pad", "werewolf": "werewolf_summon", "spider": "spider_summon",
             "pharaoh": "pharaoh_summon", "storm": "storm_summon", "reaper": "reaper_summon"}

LOOP_BLEND = 0.4   # the last this-many seconds dissolve into frame 1, so the Short loops seamlessly
def cutin_rule(spec, uid):
    """(min seconds between full ultimate cut-ins, who shares that clock). Survival: per hero
    (its ults chain). Team modes: the whole video, so banners and voice lines never stack."""
    mode = (spec or {}).get("mode")
    if spec.get("cutin_gap"):
        return float(spec["cutin_gap"]), uid
    if mode in ("royale", "soccer", "boss"):
        return 3.0, "all"
    return 0.0, uid


GOAL_PAUSE = 0.5   # soccer: the action freezes on every goal for this long (video seconds)
SLOWMO_BEFORE, SLOWMO_AFTER = 0.45, 0.1   # seconds of sim time around the K.O. played at 1/3 speed
SLOWMO_EXTRA = 2 * (SLOWMO_BEFORE + SLOWMO_AFTER)   # video seconds that adds
BASE_W = 1080       # drawing primitives size themselves relative to this (S = IW / BASE_W)

DEFAULT_THEME = {
    "bg_top": [52, 140, 205],
    "bg_bottom": [24, 70, 125],
    "arena_fill": [150, 185, 220],
    "arena_border": [12, 12, 16],
    "floor": "stone",
    "font": "verdana",
}

INK, NIGHT, PANEL, PANEL_HI = rgb("ink"), rgb("night"), rgb("panel"), rgb("panel_hi")
LAVENDER, CREAM, GOLD, YELLOW = rgb("lavender"), rgb("cream"), rgb("gold"), rgb("yellow")
RED_HI, LIME, ICE = rgb("red_hi"), rgb("lime"), rgb("ice")


def _shade(c, k):
    return tuple(max(0, min(255, int(v * k))) for v in c)


def _mix(a, b, t):
    return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))


def _readable(c):
    """Lighten genuinely dark team colours (not saturated ones) so text stays legible."""
    peak = max(c) / 255
    return _mix(c, (255, 255, 255), 0.75 - peak) if peak < 0.55 else tuple(c)


class PixelText:
    """Bitmap-style text: a small font rendered without antialiasing, with a 1px
    outline, scaled by whole numbers only so every glyph pixel stays square."""

    SIZES = {"s": 10, "m": 13}

    def __init__(self, outline, font_name="verdana"):
        ok = bool(font_name) and font_name.lower() in pygame.font.get_fonts()
        self.fonts = {k: (pygame.font.SysFont(font_name, v, bold=True) if ok
                          else pygame.font.Font(None, v + 5)) for k, v in self.SIZES.items()}
        self.outline = tuple(outline)
        self.cache = {}

    def render(self, text, scale=1, color=(255, 255, 255), size="m"):
        scale = max(1, int(scale))
        key = (text, scale, tuple(color), size)
        img = self.cache.get(key)
        if img is not None:
            return img
        font = self.fonts[size]
        core = font.render(text, False, color)
        edge = font.render(text, False, self.outline)
        w, h = core.get_size()
        small = pygame.Surface((w + 2, h + 2), pygame.SRCALPHA)
        for dx in (0, 1, 2):
            for dy in (0, 1, 2):
                if dx != 1 or dy != 1:
                    small.blit(edge, (dx, dy))
        small.blit(core, (1, 1))
        img = small if scale == 1 else pygame.transform.scale(small, ((w + 2) * scale, (h + 2) * scale))
        if len(self.cache) > 3000:
            self.cache.clear()
        self.cache[key] = img
        return img

    def fit(self, text, scale, color, max_w, size="m"):
        """Largest whole-number scale (then the small font) that fits in max_w."""
        for s in range(int(scale), 0, -1):
            img = self.render(text, s, color, size)
            if img.get_width() <= max_w:
                return img
        return self.render(text, 1, color, "s")


class Sprites:
    """PixelLab sprites, loaded lazily; missing files just return None."""

    def __init__(self):
        self.raw = {}
        self.cache = {}

    def load(self, rel, trim=False, straighten=False):
        key = (rel, trim, straighten)
        if key in self.raw:
            return self.raw[key]
        img = None
        path = os.path.join(ROOT, rel)
        if os.path.exists(path):
            try:
                img = pygame.image.load(path)
                if straighten:
                    img = self._straighten(img)
                if trim:
                    box = img.get_bounding_rect()
                    if box.w and box.h:
                        img = img.subsurface(box).copy()
            except pygame.error:
                img = None
        self.raw[key] = img
        return img

    @staticmethod
    def _straighten(img):
        """Rotate a weapon/projectile so its long axis is horizontal, tip pointing right.

        Generated art is often diagonal; the long axis comes from the opaque pixels'
        principal component, and the end toward the top-right is taken as the tip
        (PixelLab draws handles at the bottom-left)."""
        import numpy as np
        alpha = pygame.surfarray.array_alpha(img)            # shape (w, h)
        xs, ys = np.nonzero(alpha > 96)
        if len(xs) < 12:
            return img
        pts = np.stack([xs - xs.mean(), ys - ys.mean()])
        evals, evecs = np.linalg.eigh(np.cov(pts))
        vx, vy = evecs[:, np.argmax(evals)]
        if vx - vy < 0:              # point the axis right/up (screen y grows downward)
            vx, vy = -vx, -vy
        deg = math.degrees(math.atan2(-vy, vx))               # counter-clockwise screen angle
        if abs(deg) < 4:
            return img
        return pygame.transform.rotate(img, -deg)

    def scaled(self, rel, w, h, trim=False, flash=False, straighten=False):
        w, h = max(1, int(w)), max(1, int(h))
        key = (rel, trim, w, h, flash, straighten)
        img = self.cache.get(key)
        if img is None:
            src = self.load(rel, trim, straighten)
            if src is None:
                return None
            img = pygame.transform.scale(src, (w, h))
            if flash:
                img = img.copy()
                img.fill((110, 110, 110, 0), special_flags=pygame.BLEND_RGBA_ADD)
            if len(self.cache) > 2000:
                self.cache.clear()
            self.cache[key] = img
        return img


def _art_id(u):
    return u.tpl.get("art_owner") or u.kind


class Renderer:
    def __init__(self, spec, world, width=IW, height=IH):
        pygame.init()
        self.spec = spec
        self.world = world
        self.width, self.height = IW, IH
        self.S = IW / BASE_W
        self.surface = pygame.Surface((IW, IH))
        self.theme = dict(DEFAULT_THEME)
        self.theme.update(spec.get("theme", {}))
        self.text = PixelText(INK, self.theme.get("font", "verdana"))
        self.sprites = Sprites()
        self.fx_rng = random.Random(12345)

        self.arena_w = SAFE_W - 24   # leave room for the frame inside the safe zone
        self.k = self.arena_w / world.W
        self.arena_h = world.H * self.k
        self.ax = (IW - self.arena_w) / 2
        self.ay = HUD_Y + 120
        self.bg = self._background()
        self.floor = self._floor()
        self.frame_img = self._frame()

        self.popups = []   # x, y, text, color, t0
        self.rings = []    # x, y, r0, r1, t0, dur, color, width
        self.sparks = []   # x, y, t0, attacker uid (or None)
        self.shouts = []   # x, y, text, color, t0  (big ability call-outs)
        self.casts = []    # uid, t0, shout: main fighters' ultimates (cut-in, circle, aura)
        self._tint_cache = {}
        self.shake_until = -1.0
        self.shake_amp = 0.0
        self.t = 0.0
        self._ox = self._oy = 0.0
        self._last_draw = 0.0

        self.ghost = [1.0, 1.0]       # white "chip" behind each HP bar
        self.shown = [1.0, 1.0]
        self.last_drop = [-9.0, -9.0]
        self.ko_t = None
        self.flash_t = -9.0
        self.phase = "fight"          # or "intro"
        self.intro_t = 0.0
        self.intro_len = float(spec.get("intro", 1.2))
        self.intro_style = intro_style(spec)
        self.cta_on = cta.enabled(spec)
        self.royale = bool(getattr(world, "royale", False))
        self.elims = []    # royale kill feed: (name, killer name, t, colour)
        self.env_acc = {}  # storm/lava damage summed per unit for the popups
        self.bolts = []    # lightning strikes: x, y, t0
        self.soccer = bool(getattr(world, "soccer", False))
        self.confetti = []
        self.goal_banner = None
        self.horde = bool(getattr(world, "horde", False))
        self.puffs = []            # horde kill bursts: x, y, t0, boss
        self.wave_banner = None
        self.last_kill_draw = -9.0
        self.cta_shift = 2.0 if self.horde else 0.0
        self.boss_mode = bool(getattr(world, "boss_mode", False))
        self.impacts = []          # boss attack hits: (event, t0)   # horde: leaderboard first, then the end card
        self.pause_p = None    # goal freeze-frame progress 0..1 (None = playing)
        self.pause_goal = None
        self._rims = {}            # sprite id -> light halo surface
        self.last_cutin = {}       # uid -> time of the last full ultimate cut-in
        self.boss_cast = None      # the boss's current wind-up: type, start, warn time, aim angle
        self.bursts = []           # one-shot PixelLab sprites: (path, wx, wy, size_world, t0, dur, deg, layer)
        self.proj_prev = {}        # id(projectile) -> (style, x, y): launches / impacts are spotted by diffing
        self.corpses = []          # knocked-out fighters: (unit, x, y, t0) drawn grey and tipped over
        self.freeze_t0 = {}        # uid -> video time the current freeze started (pop-in, shatter)
        self.shatters = []         # (x, y, r, t0): ice bursting off a fighter as a freeze ends
        self.t_off = 0.0       # video time added by freeze-frames (keeps effect clocks moving)
        self._done_t = None
        # both name plates use the same text size, whichever name is longest
        self.name_scale = 2 if all(self.text.render(m.name.upper(), 2, CREAM).get_width() <= BAR_W
                                   for m in world.mains) else 1

    # ── static layers ────────────────────────────────────────────────────

    def _background(self):
        g = pygame.Surface((IW, IH))
        a = tuple(self.theme["bg_bottom"])
        b = _mix(a, tuple(self.theme["bg_top"]), 0.22)
        tile = 16
        for ty in range(0, IH, tile):
            for tx in range(0, IW, tile):
                g.fill(a if (tx // tile + ty // tile) % 2 else b, (tx, ty, tile, tile))
        # HUD band
        g.fill(NIGHT, (0, HUD_Y - 36, IW, 118))
        g.fill(INK, (0, HUD_Y - 38, IW, 2))
        g.fill(INK, (0, HUD_Y + 82, IW, 2))
        g.fill(PANEL_HI, (0, HUD_Y + 84, IW, 1))
        return g

    def _floor(self):
        w, h = int(self.arena_w), int(self.arena_h)
        f = pygame.Surface((w, h))
        tile_img = None
        whole = self.sprites.load(self.theme["map_art"]) if self.theme.get("map_art") else None
        if whole is not None:         # one PixelLab image of the whole arena, scaled up (no tiling)
            f.blit(pygame.transform.scale(whole, (w, h)), (0, 0))
            veil = pygame.Surface((w, h), pygame.SRCALPHA)
            veil.fill((*NIGHT, 45))   # a touch darker so fighters stand out
            f.blit(veil, (0, 0))
            return f
        if self.theme.get("floor_art"):
            tile_img = self.sprites.load(self.theme["floor_art"])
        if tile_img is None:
            tile_img = self.sprites.load(f"art/ui/floor_{self.theme.get('floor', 'stone')}.png")
        if tile_img is not None:
            # calm the texture: 2x chunkier pixels (fewer repeats) and washed toward its own
            # average colour, so the floor reads as a backdrop instead of noise
            tw, th = tile_img.get_size()
            tile_img = pygame.transform.scale(tile_img, (tw * 2, th * 2))
            tw, th = tw * 2, th * 2
            wash = pygame.Surface((tw, th), pygame.SRCALPHA)
            wash.fill((*pygame.transform.average_color(tile_img)[:3], 115))
            tile_img = tile_img.copy()
            tile_img.blit(wash, (0, 0))
            # mirror tiling: neighbouring tiles are flipped copies, so edges always match
            fx = pygame.transform.flip(tile_img, True, False)
            fy = pygame.transform.flip(tile_img, False, True)
            fxy = pygame.transform.flip(tile_img, True, True)
            grid = [[tile_img, fx], [fy, fxy]]
            for y in range(0, h, th):
                for x in range(0, w, tw):
                    f.blit(grid[(y // th) % 2][(x // tw) % 2], (x, y))
            veil = pygame.Surface((w, h), pygame.SRCALPHA)
            veil.fill((*NIGHT, 60))          # mute the floor so fighters stand out
            f.blit(veil, (0, 0))
            return f
        self._pattern(f, self.theme.get("pattern", "checker"), tuple(self.theme["arena_fill"]))
        return f

    def _pattern(self, f, kind, fill):
        """Procedural floor per stage, used until PixelLab floor art exists."""
        w, h = f.get_size()
        rng = random.Random(7)
        dark, alt, light = _shade(fill, 0.72), _shade(fill, 0.88), _mix(fill, (255, 255, 255), 0.18)
        f.fill(fill)
        if kind in ("checker", "marble"):
            t = 24 if kind == "checker" else 32
            for y in range(0, h, t):
                for x in range(0, w, t):
                    if kind == "checker" and (x // t + y // t) % 2:
                        f.fill(_shade(fill, 0.55), (x, y, t, t))
                    if rng.random() < 0.25:   # hairline cracks / veins
                        x0, y0 = x + rng.randint(3, t - 6), y + rng.randint(3, t - 6)
                        pygame.draw.line(f, dark, (x0, y0), (x0 + rng.randint(-6, 6), y0 + rng.randint(3, 8)))
            if kind == "marble":
                gold = _mix(fill, GOLD, 0.6)
                for y in range(0, h, t):
                    f.fill(gold, (0, y, w, 1))
                for x in range(0, w, t):
                    f.fill(gold, (x, 0, 1, h))
        elif kind == "asphalt":
            for _ in range(w * h // 40):
                f.fill(_shade(fill, rng.uniform(0.85, 1.12)), (rng.randrange(w), rng.randrange(h), 2, 2))
            for x in range(w // 2 - 3, w // 2 + 3):           # dashed centre line
                for y in range(0, h, 60):
                    f.fill((235, 200, 60), (x, y, 1, 34))
            for i in range(7):                                # crosswalk
                f.fill((225, 225, 225), (int(w * 0.15) + i * 40, int(h * 0.12), 22, 60))
        elif kind == "concrete":
            for y in range(0, h, 80):
                pygame.draw.line(f, dark, (0, y), (w, y))
            for x in range(0, w, 80):
                pygame.draw.line(f, dark, (x, 0), (x, h))
            for _ in range(w * h // 60):
                f.fill(_shade(fill, rng.uniform(0.9, 1.08)), (rng.randrange(w), rng.randrange(h), 2, 2))
            cx_, cy_ = w // 2, h // 2                         # painted helipad
            pygame.draw.circle(f, (235, 210, 70), (cx_, cy_), min(w, h) // 5, 4)
            for dx in (-20, 20):
                f.fill((235, 235, 235), (cx_ + dx - 4, cy_ - 30, 8, 60))
            f.fill((235, 235, 235), (cx_ - 20, cy_ - 4, 40, 8))
        elif kind == "clouds":
            sky = pygame.Surface((w, h))
            sky.fill((120, 185, 245))
            for _ in range(28):
                x, y, r_ = rng.randrange(w), rng.randrange(h), rng.randint(20, 60)
                pygame.draw.circle(sky, (235, 245, 255), (x, y), r_)
            f.blit(sky, (0, 0))
            isl = pygame.Rect(int(w * 0.07), int(h * 0.07), int(w * 0.86), int(h * 0.86))  # the floating island
            pygame.draw.ellipse(f, (110, 90, 70), isl.move(0, 10))
            pygame.draw.ellipse(f, fill, isl)
            for _ in range(w * h // 300):
                x, y = rng.randrange(isl.x + 20, isl.right - 20), rng.randrange(isl.y + 20, isl.bottom - 20)
                f.fill(_shade(fill, 1.15), (x, y, 3, 2))
        elif kind == "pitch":
            for i, y in enumerate(range(0, h, 48)):           # mowing stripes
                f.fill(_shade(fill, 1.08 if i % 2 else 0.94), (0, y, w, 48))
            line = (240, 245, 240)
            pygame.draw.rect(f, line, (8, 8, w - 16, h - 16), 3)
            pygame.draw.line(f, line, (8, h // 2), (w - 8, h // 2), 3)
            pygame.draw.circle(f, line, (w // 2, h // 2), min(w, h) // 6, 3)
            pygame.draw.rect(f, line, (w // 2 - w // 5, 8, 2 * w // 5, h // 8), 3)
            pygame.draw.rect(f, line, (w // 2 - w // 5, h - 8 - h // 8, 2 * w // 5, h // 8), 3)
        elif kind == "ice":
            for _ in range(60):                               # skate scratches
                x, y = rng.randrange(w), rng.randrange(h)
                pygame.draw.line(f, _shade(fill, 0.93), (x, y), (x + rng.randint(-40, 40), y + rng.randint(-8, 8)))
            pygame.draw.line(f, (210, 50, 50), (0, h // 2), (w, h // 2), 4)
            for yy in (h // 3, 2 * h // 3):
                pygame.draw.line(f, (50, 90, 200), (0, yy), (w, yy), 4)
            pygame.draw.circle(f, (210, 50, 50), (w // 2, h // 2), min(w, h) // 7, 3)
            for cx_, cy_ in ((w // 4, h // 6), (3 * w // 4, h // 6), (w // 4, 5 * h // 6), (3 * w // 4, 5 * h // 6)):
                pygame.draw.circle(f, (210, 50, 50), (cx_, cy_), min(w, h) // 9, 2)
        elif kind == "carpet":
            cream = _mix((236, 226, 200), fill, 0.12)
            for y in range(0, h, 32):
                for x in range(0, w, 32):
                    f.fill(cream if (x // 32 + y // 32) % 2 else _shade(cream, 0.9), (x, y, 32, 32))
            cx0, cx1 = int(w * 0.32), int(w * 0.68)
            f.fill(fill, (cx0, 0, cx1 - cx0, h))
            for x in (cx0 + 4, cx1 - 6):
                f.fill(GOLD, (x, 0, 2, h))
            for y in range(12, h, 28):
                pygame.draw.polygon(f, _shade(fill, 0.75), [((cx0 + cx1) // 2, y - 6), ((cx0 + cx1) // 2 + 6, y),
                                                             ((cx0 + cx1) // 2, y + 6), ((cx0 + cx1) // 2 - 6, y)])
        elif kind in ("flagstone", "runes"):
            y = 0
            while y < h:
                rh = rng.randint(18, 26) if kind == "flagstone" else 32
                x = -rng.randint(0, 20)
                while x < w:
                    rw = rng.randint(20, 42) if kind == "flagstone" else 32
                    f.fill(_shade(fill, rng.uniform(0.86, 1.06)), (x + 1, y + 1, rw - 2, rh - 2))
                    if kind == "runes" and rng.random() < 0.18:
                        cx, cy = x + rw // 2, y + rh // 2
                        glow = (120, 210, 255)
                        for dx, dy in ((0, -4), (0, 4), (-3, 0), (3, 0), (0, 0), (-2, -2), (2, 2)):
                            f.fill(glow, (cx + dx, cy + dy, 2, 2))
                    x += rw
                f.fill(dark, (0, y, w, 1))
                y += rh
        elif kind == "planks":
            for y in range(0, h, 16):
                x = -rng.randint(0, 60)
                while x < w:
                    ln = rng.randint(50, 110)
                    f.fill(_shade(fill, rng.uniform(0.85, 1.08)), (x, y + 1, ln - 1, 14))
                    f.fill(dark, (x + 3, y + 7, 1, 1))
                    f.fill(dark, (x + ln - 5, y + 7, 1, 1))
                    x += ln
                f.fill(_shade(fill, 0.6), (0, y, w, 1))
            for _ in range(w * h // 260):     # snow specks
                f.fill((235, 240, 250), (rng.randrange(w), rng.randrange(h), 1, 1))
        elif kind == "tatami":
            for y in range(0, h, 40):
                for x in range(-(y // 40 % 2) * 40, w, 80):
                    r = pygame.Rect(x + 2, y + 2, 76, 36)
                    f.fill(_shade(fill, 1.03), r)
                    for yy in range(r.y + 3, r.bottom - 2, 3):
                        f.fill(alt, (r.x + 2, yy, r.w - 4, 1))
                    pygame.draw.rect(f, (70, 45, 30), r, 2)
        elif kind == "roof":
            for row, y in enumerate(range(-8, h + 8, 12)):
                for x in range(-((row % 2) * 9), w + 18, 18):
                    pygame.draw.circle(f, _shade(fill, 1.08 if row % 2 else 0.95), (x, y), 9)
                    pygame.draw.circle(f, dark, (x, y), 9, 1)
        else:  # grass / dirt
            for _ in range(w * h // 30):
                c = light if rng.random() < 0.5 else alt
                f.fill(c, (rng.randrange(w), rng.randrange(h), 2, 2))
            tuft = (150, 190, 90) if kind == "grass" else (130, 125, 70)
            for _ in range(w * h // 900):
                x, y = rng.randrange(w), rng.randrange(h)
                pygame.draw.lines(f, tuft, False, [(x - 2, y - 3), (x, y), (x + 2, y - 3)])
            extra = (200, 120, 40) if kind == "grass" else (225, 220, 205)   # leaves / bones
            for _ in range(w * h // 2500):
                x, y = rng.randrange(w), rng.randrange(h)
                if kind == "grass":
                    f.fill(extra, (x, y, 3, 2))
                else:
                    f.fill(extra, (x, y, 6, 1))
                    f.fill(extra, (x - 1, y - 1, 2, 3))
                    f.fill(extra, (x + 5, y - 1, 2, 3))

    def _frame(self):
        b = 8
        w, h = int(self.arena_w) + 2 * b, int(self.arena_h) + 2 * b
        fr = pygame.Surface((w, h), pygame.SRCALPHA)
        fr.fill(INK)
        fr.fill(PANEL_HI, (2, 2, w - 4, h - 4))
        fr.fill(LAVENDER, (2, 2, w - 4, 2))          # top highlight
        fr.fill(LAVENDER, (2, 2, 2, h - 4))          # left highlight
        fr.fill(PANEL, (2, h - 4, w - 4, 2))         # bottom shadow
        fr.fill(PANEL, (w - 4, 2, 2, h - 4))         # right shadow
        fr.fill(INK, (b - 2, b - 2, w - 2 * b + 4, h - 2 * b + 4))
        fr.fill((0, 0, 0, 0), (b, b, w - 2 * b, h - 2 * b))
        for cx, cy in ((0, 0), (w - 10, 0), (0, h - 10), (w - 10, h - 10)):
            fr.fill(INK, (cx, cy, 10, 10))
            fr.fill(GOLD, (cx + 2, cy + 2, 6, 6))
            fr.fill(YELLOW, (cx + 2, cy + 2, 2, 2))
        return fr

    # ── coordinate helpers ───────────────────────────────────────────────

    def sx(self, x):
        return self.ax + x * self.k + self._ox

    def sy(self, y):
        return self.ay + y * self.k + self._oy

    # ── event ingestion (visual effects) ─────────────────────────────────

    def ingest(self, events):
        w = self.world
        by_uid = {u.uid: u for u in w.units}
        for ev in events:
            t = ev["type"]
            if t == "damage" and ev.get("src") is None:
                # environment damage ticks every frame: sum it into one number every 0.6 s
                acc = self.env_acc.setdefault(ev["dst"], [0.0, self.t])
                acc[0] += ev["amount"]
                if self.t - acc[1] >= 0.6 and acc[0] >= 0.5:
                    col = {"storm": (200, 140, 255), "fog": (130, 230, 150), "ice": (170, 220, 255),
                           "mine": (255, 200, 80), "ball": (240, 240, 240)}.get(ev["source"], (255, 140, 60))
                    self.popups.append((ev["x"], ev["y"], f"-{acc[0]:.0f}", col, self.t))
                    acc[0], acc[1] = 0.0, self.t
                continue
            if t == "damage":
                amt = ev["amount"]
                txt = f"-{amt:.1f}" if amt < 1 else f"-{amt:.0f}"
                dst = by_uid.get(ev.get("dst"))
                # numbers only where they matter: hits on a main fighter (or a boss), big hits
                if (dst is not None and (dst.is_main or dst.tpl.get("boss")) and amt >= 1) or amt >= 15:
                    self.popups.append((ev["x"], ev["y"], txt, YELLOW, self.t))
                self.sparks.append((ev["hx"], ev["hy"], self.t, ev.get("src")))
                if amt >= 12:
                    self.shake_until = self.t + 0.18
                    self.shake_amp = min(14.0, 4 + amt * 0.25) * self.S
            elif t == "heal" and ev["amount"] >= 0.5:
                self.popups.append((ev["x"], ev["y"], f"+{ev['amount']:.0f}", LIME, self.t))
            elif t == "shockwave":
                col = tuple(ev.get("color", (255, 255, 255)))
                self.rings.append((ev["x"], ev["y"], 10, ev["radius"], self.t, 0.4, col, 8))
            elif t in ("block", "shove", "clash"):
                self.sparks.append((ev["x"], ev["y"], self.t, None))
            elif t == "poisoned":
                self.popups.append((ev["x"], ev["y"], "POISON", LIME, self.t))
            elif t == "debuff":
                self.rings.append((ev["x"], ev["y"], 20, 110, self.t, 0.3, ICE, 5))
                if ev.get("stat") == "speed":     # frost: ice shards burst off the target
                    du = by_uid.get(ev["unit"])
                    size = (du.radius if du else 40) * 3.0
                    self.bursts.append(("art/fx/freeze/ice_shatter.png", ev["x"], ev["y"], size, self.t, 0.35, 0.0, "over"))
            elif t == "ability":
                u = by_uid.get(ev["unit"])
                if u is not None and u.is_main:
                    self.shouts.append((ev["x"], ev["y"], ev["name"].upper() + "!",
                                        _readable(u.color), self.t))
            elif t == "boss_skill":
                self.shouts.append((ev["x"], ev["y"] - 200, ev["name"] + "!", (255, 120, 90), self.t))
                b = self.world.boss
                sk = next((k for k in b.skills if k["name"] == ev["name"]), {})
                tg = next((g for g in reversed(self.world.telegraphs) if g["name"] == ev["name"]), None)
                ang = tg.get("ang") if tg and tg.get("ang") is not None else (
                    math.atan2(tg["y"] - b.y, tg["x"] - b.x) if tg else math.pi / 2)
                self.boss_cast = {"type": ev["skill_type"], "t0": self.t, "warn": float(sk.get("warn", 0.85)),
                                  "ang": ang}
            elif t == "boss_impact":
                self.impacts.append((ev, self.t))
                self.shake_until = self.t + 0.22
                self.shake_amp = 10 * self.S
            elif t == "enraged":
                self.shouts.append((self.world.W / 2, self.world.H * 0.3, "ENRAGED!", RED_HI, self.t))
                self.flash_t = self.t
                self.shake_until = self.t + 0.4
                self.shake_amp = 16 * self.S
            elif t == "horde_kill":
                self.puffs.append((ev["x"], ev["y"], self.t, ev.get("boss", False)))
                self.last_kill_draw = self.t
                if ev.get("boss"):
                    self.shouts.append((ev["x"], ev["y"], "BOSS DOWN!", YELLOW, self.t))
                    self.shake_until = self.t + 0.3
                    self.shake_amp = 12 * self.S
                elif ev.get("combo", 0) in (10, 20, 30, 40, 50):
                    self.popups.append((ev["x"], ev["y"] - 30, f"x{ev['combo']} COMBO!", YELLOW, self.t))
            elif t == "wave":
                self.wave_banner = (self.t, ev["wave"], ev.get("boss"), ev.get("new"), ev.get("new_sprite"))
            elif t == "goal":
                self._celebrate_goal(ev)
                self.pause_goal = ev
            elif t == "respawn":
                self.rings.append((ev["x"], ev["y"], 10, 120, self.t, 0.35, (255, 255, 255), 6))
                self.popups.append((ev["x"], ev["y"] - 30, "BACK!", CREAM, self.t))
            elif t == "golden_goal":
                self.shouts.append((self.world.W / 2, self.world.H * 0.35, "GOLDEN GOAL!", (255, 210, 60), self.t))
            elif t == "lightning":
                self.bolts.append((ev["x"], ev["y"], self.t))
                self.shake_until = self.t + 0.2
                self.shake_amp = 9 * self.S
            elif t == "frozen":
                self.freeze_t0.setdefault(ev["unit"], self.t)
                self.rings.append((ev["x"], ev["y"], 10, 110, self.t, 0.3, (190, 230, 255), 6))
            elif t == "freeze_all":
                self.shouts.append((self.world.W / 2, self.world.H * 0.3, "FREEZE!", (170, 225, 255), self.t))
                self.flash_t = self.t
            elif t == "mine":
                self.rings.append((ev["x"], ev["y"], 10, 170, self.t, 0.35, (255, 180, 60), 10))
                self.sparks.append((ev["x"], ev["y"], self.t, None))
                self.popups.append((ev["x"], ev["y"] - 20, "BOOM!", (255, 200, 80), self.t))
                self.shake_until = self.t + 0.3
                self.shake_amp = 13 * self.S
            elif t == "item_spawn" and ev.get("tier") == "epic":
                self.popups.append((ev["x"], ev["y"] - 30, "EPIC ITEM!", (255, 210, 60), self.t))
            elif t == "ball_hit":
                self.sparks.append((ev["x"], ev["y"], self.t, None))
            elif t == "pickup":
                col = self.ITEM_COLORS.get(ev["kind"], (255, 255, 255))
                self.rings.append((ev["x"], ev["y"], 10, 120, self.t, 0.3, _mix(col, (255, 255, 255), 0.3), 6))
                self.popups.append((ev["x"], ev["y"] - 30, ev.get("label", "ITEM"), _mix(col, (255, 255, 255), 0.5), self.t))
            elif t == "launch":
                self.rings.append((ev["x"], ev["y"], 20, 190, self.t, 0.3, (255, 255, 255), 8))
                self.shake_until = self.t + 0.25
                self.shake_amp = 11 * self.S
            elif t == "summon":
                self.rings.append((ev["x"], ev["y"], 20, 160, self.t, 0.35, (255, 230, 150), 6))
            elif t == "death":
                u = by_uid.get(ev["unit"])
                col = u.color if u else (255, 255, 255)
                r = u.radius if u else 40
                self.rings.append((ev["x"], ev["y"], r, r * 2.4, self.t, 0.4, col, 10))
                if ev.get("main") and u is not None:
                    self.corpses.append((u, ev["x"], ev["y"], self.t))
                if ev.get("main") and (self.soccer or ((self.royale or self.boss_mode) and not self.world.done)):
                    killer = by_uid.get(ev.get("killer"))
                    self.elims.append((u.name if u else "?", killer.name if killer else None, self.t,
                                       _readable(u.color) if u else CREAM))
                    self.shouts.append((ev["x"], ev["y"], "K.O.!" if (self.soccer or self.boss_mode) else "ELIMINATED!", RED_HI, self.t))
                    self.shake_until = self.t + 0.25
                    self.shake_amp = 10 * self.S
                elif ev.get("main"):
                    self.shake_until = self.t + 0.35
                    self.shake_amp = 16 * self.S
                    self.ko_t = self.t
                    self.flash_t = self.t
            elif t == "ultimate":
                u = by_uid.get(ev["unit"])
                col = _mix(u.color, (255, 255, 255), 0.5) if u else (255, 255, 255)
                self.rings.append((ev["x"], ev["y"], 30, 260, self.t, 0.5, col, 10))
                if u is not None and u.is_main:
                    for name, layer, mult, dur in ULT_FX.get(_art_id(u), []):
                        self.bursts.append((f"art/fx/ult/{name}.png", ev["x"], ev["y"], u.radius * mult,
                                            self.t, dur, 0.0, layer))
                gap, key = cutin_rule(self.spec, u.uid if u is not None else None)
                if u is not None and u.is_main and gap and self.t - self.last_cutin.get(key, -99) < gap:
                    pass                          # another ult just had the stage: effect only, no banner
                elif u is not None and u.is_main:   # the full casting animation (shout goes in the cut-in)
                    self.last_cutin[key] = self.t
                    self.casts.append((u.uid, self.t, ev.get("shout") or (ev.get("label", "") + "!")))
                    self.shake_until = self.t + 0.25
                    self.shake_amp = 9 * self.S
                elif ev.get("shout") and u is not None:
                    self.shouts.append((ev["x"], ev["y"], ev["shout"], _readable(u.color), self.t))

    # ── frame ────────────────────────────────────────────────────────────

    def draw(self):
        surf = self.surface
        w = self.world
        dt = max(0.0, self.t - self._last_draw)
        self._last_draw = self.t
        intro_shake, intro_flash = 0.0, False
        if self.phase == "intro":   # the intro style's impacts: shake, and a white frame on big ones
            for h, inten in INTRO_STYLES[self.intro_style]["hits"]:
                s = self.intro_t - h
                if 0 <= s < 0.5:
                    intro_shake = max(intro_shake, 24 * self.S * inten * (1.0 if s < 0.12 else 1 - (s - 0.12) / 0.38))
                    intro_flash = intro_flash or (s < 0.034 and inten >= 0.6)
        if intro_shake:
            a = intro_shake
            self._ox = round(self.fx_rng.uniform(-a, a))
            self._oy = round(self.fx_rng.uniform(-a, a))
        elif self.t < self.shake_until:
            a = self.shake_amp * (self.shake_until - self.t) / 0.35
            self._ox = round(self.fx_rng.uniform(-a, a))
            self._oy = round(self.fx_rng.uniform(-a, a))
        else:
            self._ox = self._oy = 0

        surf.blit(self.bg, (0, 0))
        surf.blit(self.frame_img, (self.ax - 8 + self._ox, self.ay - 8 + self._oy))
        surf.blit(self.floor, (self.ax + self._ox, self.ay + self._oy))
        if self.theme.get("props"):
            self._draw_props()
        if self.soccer:
            self._draw_goals()
        if self.boss_mode and self.phase == "fight":
            self._draw_telegraphs()
        if self.royale or self.soccer or self.horde:
            self._draw_hazards()
            if self.phase == "fight":
                self._draw_storm()
            self._draw_terrain()
            if self.phase == "fight" or self.horde:
                self._draw_items()
            if not (self.soccer and self.phase == "intro"):
                self._draw_balls()

        alive = [u for u in w.units if u.alive]
        if self.phase == "intro" and self.intro_t < self.intro_len - 0.45:
            alive = []   # the VS splash owns the arena until "FIGHT!"
        alive.sort(key=lambda u: (u.is_main, u.uid))
        self.casts = [c for c in self.casts if self.t - c[1] < CAST_FX]
        casting = [(c, self._unit(c[0])) for c in self.casts]
        casting = [(c, u) for c, u in casting if u is not None and u.alive]
        for c, u in casting:
            self._draw_cast_under(u, self.t - c[1])
        self._track_projectiles()
        self._draw_bursts("under")
        if self.boss_mode and w.boss is not None and w.boss.alive and getattr(w, "enraged", False):
            self._draw_enraged_aura(w.boss)
        if self.corpses:
            self._draw_corpses()
        for u in alive:
            self._draw_frost_patch(u)
            if self.soccer:
                self._draw_team_spot(u)
            elif self.horde and u.is_main:
                self._draw_team_spot(u, color=(255, 205, 70), size=1.5)
        for u in alive:
            self._draw_body(u)
            self._draw_frozen(u)
            if self.soccer:
                self._draw_jersey(u)
        for u in alive:
            for b in u.blades:
                self._draw_blade(b)
        for p in w.projectiles:
            if p.alive:
                self._draw_projectile(p)
        for u in alive:
            if self.boss_mode and u.side == 0 and u.is_main:
                self._draw_mini_bar(u)
            elif self.boss_mode and not u.is_main:
                continue
            elif not u.is_main and self.horde:
                if u.tpl.get("boss"):
                    self._draw_mini_bar(u)
            elif not u.is_main:
                pass                      # minions: no HP numbers (too much text)
            elif self.royale or self.soccer:
                self._draw_mini_bar(u)
        self._draw_fx()
        self._draw_bursts("over")
        if self.shatters:
            self._draw_shatters()
        if self.impacts:          # boss hits stay inside the arena (a long fire breath can overshoot)
            clip = self.surface.get_clip()
            self.surface.set_clip(pygame.Rect(int(self.ax), int(self.ay), int(self.arena_w), int(self.arena_h)))
            self._draw_impacts()
            self.surface.set_clip(clip)
        if self.bolts:
            self._draw_bolts()
        for c, u in casting:
            self._draw_cast_over(u, self.t - c[1])
        if self.boss_mode:
            self._draw_boss_hud()
            self._draw_boss_panels()
        elif self.horde:
            self._draw_puffs()
            self._draw_horde_hud()
            self._draw_horde_panel()
            self._draw_wave_banner()
        elif self.soccer:
            self._draw_soccer_hud()
            self._draw_soccer_panels()
        elif self.royale:
            self._draw_royale_hud()
            self._draw_royale_panels()
        else:
            self._draw_top_hud(dt)
            self._draw_panels()
        if casting and self.ko_t is None and not w.done:   # newest cut-in only; never over the K.O.
            c, u = casting[-1]
            self._draw_cut_in(u, self.t - c[1], c[2])

        if self.soccer:
            if self.pause_p is not None:
                self._draw_goal_freeze()
            self._draw_confetti()
            self._draw_goal_banner()
            if self.phase == "fight" and not w.done and w.kickoff_until - 0.4 < w.t < w.kickoff_until and w.goals:
                self._draw_center_text("KICK OFF!", 4, YELLOW, pop=1.0, dy=60)
        if self.phase == "intro":
            self._draw_intro()
        elif self.cta_on and not self.soccer and not w.done and cta.PREDICT[0] <= w.t < cta.PREDICT[1]:
            self._draw_predict_strip(w.t)
        if self.cta_on and self.phase != "intro" and not w.done and cta.PREDICT[0] <= w.t < cta.PREDICT[1] + 1.0:
            self._draw_fan_credit(w.t)
        if self.ko_t is not None and self.t - self.ko_t < 0.9:
            self._draw_center_text("DEFEATED!" if self.horde else ("BOSS DOWN!" if self.boss_mode and self.world.winner_side == 0
                                   else ("WIPED OUT!" if self.boss_mode else "K.O.!")), 6 if not self.horde else 5, RED_HI,
                                   pop=self.t - self.ko_t)
        if w.done and (self.ko_t is None or self.t - self.ko_t >= 0.6):
            if self._done_t is None:
                self._done_t = self.t
            since = self.t - self._done_t   # seconds since the fight ended (the end hold advances self.t)
            if self.horde and since < self.cta_shift + cta.CTA_AT:
                if since >= 0.6:
                    self._draw_horde_board(since)
            elif self.horde:
                self._draw_horde_card(1.0)
                if self.cta_on:
                    self._draw_end_cta(since - self.cta_shift)
            else:
                self._draw_winner_card(lift=self._cta_lift(since))
                if self.cta_on and since >= cta.CTA_AT:
                    self._draw_end_cta(since)
        if intro_flash:   # one white frame on impact
            fl = pygame.Surface((IW, IH), pygame.SRCALPHA)
            fl.fill((255, 255, 255, 235))
            surf.blit(fl, (0, 0))
        if self.t - self.flash_t < 0.15:
            fl = pygame.Surface((IW, IH), pygame.SRCALPHA)
            fl.fill((255, 255, 255, int(170 * (1 - (self.t - self.flash_t) / 0.15))))
            surf.blit(fl, (0, 0))

    # ── arena drawing ────────────────────────────────────────────────────

    def _boss_cast_pose(self, u):
        """(dx, dy, sx, sy) for the boss's wind-up, by skill type; None when not casting.
        cone: rear back, then lunge into the breath. beam: tremble while charging. nova: crouch,
        then burst up. meteors: rise and stretch, calling them down. summon: rhythmic pulse.
        leap: crouch, launch into the air (shrinks away), slam down where it lands. mark: lean in."""
        c = self.boss_cast
        if not c:
            return None
        age = self.t - c["t0"]
        warn = max(0.2, c["warn"])
        if age > warn + 0.35:
            self.boss_cast = None
            return None
        r = u.radius * self.k
        p = min(1.0, age / warn)
        post = max(0.0, age - warn) / 0.35           # 0..1 after the hit lands
        ca, sa = math.cos(c["ang"]), math.sin(c["ang"])
        kind = c["type"]
        j = math.sin(age * 70) * r * 0.03
        if kind == "cone":
            if post == 0:
                return (-ca * r * 0.18 * p, -sa * r * 0.18 * p, 1 - 0.1 * p, 1 + 0.08 * p)
            k = 1 - post
            return (ca * r * 0.22 * k, sa * r * 0.22 * k, 1 + 0.12 * k, 1 - 0.08 * k)
        if kind == "beam":
            g = 1 + 0.07 * math.sin(age * 25) * (1 - post)
            return (j * (1 - post), j * 0.6 * (1 - post), g, g)
        if kind == "nova":
            if post == 0:
                return (0.0, r * 0.12 * p, 1 + 0.18 * p, 1 - 0.22 * p)
            k = 1 - post
            return (0.0, -r * 0.15 * k, 1 - 0.08 * k, 1 + 0.2 * k)
        if kind == "meteors":
            k = p if post == 0 else 1 - post
            return (j * k, -r * 0.3 * k, 1 - 0.06 * k, 1 + 0.14 * k)
        if kind == "summon":
            g = 1 + 0.08 * math.sin(age * 14)
            return (0.0, 0.0, g, 2 - g)
        if kind == "leap":
            if p < 0.35:                               # crouch
                q = p / 0.35
                return (0.0, r * 0.1 * q, 1 + 0.2 * q, 1 - 0.25 * q)
            if post == 0:                              # in the air: rises and shrinks away
                q = (p - 0.35) / 0.65
                return (0.0, -r * 1.6 * q, 1 - 0.55 * q, 1 - 0.45 * q)
            k = 1 - post                               # slam down on the new spot
            return (0.0, 0.0, 1 + 0.3 * k, 1 - 0.3 * k)
        if kind == "mark":
            k = p if post == 0 else 1 - post
            return (ca * r * 0.1 * k + j * k, sa * r * 0.1 * k, 1.0, 1.0)
        return None

    def _draw_cast_sigil(self, u):
        """A glowing magic circle under the boss while it winds up (its own art if it has one)."""
        c = self.boss_cast
        if not c:
            return
        age = self.t - c["t0"]
        if age > c["warn"] + 0.2:
            return
        k = min(1.0, age / 0.15) * (1.0 if age < c["warn"] else max(0.0, 1 - (age - c["warn"]) / 0.2))
        d = u.radius * self.k * 3.0 * (0.8 + 0.2 * k)
        cx, cy = self.sx(u.x), self.sy(u.y) + u.radius * self.k * 0.45
        pre = BOSS_PREFIX.get(u.kind, "")
        own = f"art/boss/fx2/{pre}_cast.png"
        if pre and self.sprites.load(own, trim=True) is not None:
            img = pygame.transform.rotate(self.sprites.scaled(own, d, d * 0.55, trim=True), 0)
        elif self.sprites.load("art/fx/magic_circle.png") is not None:
            img = self._tinted("art/fx/magic_circle.png", _readable(u.color), d, d * 0.55)
        else:
            return
        img = img.copy()
        img.set_alpha(int(230 * k))
        self.surface.blit(img, img.get_rect(center=(int(cx), int(cy))))

    def _draw_body(self, u):
        if self.boss_mode and u is self.world.boss and self.boss_cast:
            self._draw_cast_sigil(u)
            pose = self._boss_cast_pose(u)
            if pose is not None:
                dx, dy, sx_, sy_ = pose
                if self.boss_cast and self.boss_cast["type"] == "leap" and dy < -u.radius * self.k * 0.2:
                    sh = pygame.Rect(0, 0, int(u.radius * self.k * 1.6), int(u.radius * self.k * 0.5))
                    sh.center = (int(self.sx(u.x)), int(self.sy(u.y) + u.radius * self.k * 0.8))
                    shadow = pygame.Surface(sh.size, pygame.SRCALPHA)
                    pygame.draw.ellipse(shadow, (0, 0, 0, 110), shadow.get_rect())
                    self.surface.blit(shadow, sh)
                self._token_squash(u, self.sx(u.x) + dx, self.sy(u.y) + dy, u.radius * self.k, sx_, sy_)
                return
        if self.world.t < u.launch_until:        # sent flying: afterimages + speed lines
            sp = math.hypot(u.vx, u.vy) or 1.0
            dx, dy = u.vx / sp, u.vy / sp
            r = u.radius * self.k
            for i, a in ((3, 50), (2, 90), (1, 140)):
                gx, gy = self.sx(u.x - dx * i * u.radius * 0.7), self.sy(u.y - dy * i * u.radius * 0.7)
                self._token_squash(u, gx, gy, r, alpha=a)
            for side in (-0.7, 0, 0.7):
                x0 = self.sx(u.x) - dx * r * 1.1 - dy * r * side
                y0 = self.sy(u.y) - dy * r * 1.1 + dx * r * side
                pygame.draw.line(self.surface, CREAM, (x0, y0), (x0 - dx * r * 2.2, y0 - dy * r * 2.2),
                                 max(2, int(3 * self.S)))
        self._draw_token(u, self.sx(u.x), self.sy(u.y), u.radius * self.k)

    def _body_sprite_path(self, u):
        if u.tpl.get("sprite"):            # horde enemies: their own PixelLab art
            return u.tpl["sprite"]
        if u.is_main:
            return f"characters/art/{_art_id(u)}/body.png"
        return f"characters/art/{_art_id(u)}/summon_{u.kind}.png"

    def _pose(self, u, status):
        """'hurt' (main below 30% HP), 'victory' (the winner once it's over) or None."""
        if not u.is_main or not u.alive or u.tpl.get("sprite"):
            return None
        w = self.world
        if w.done and w.winner_side == u.side and not self.soccer:
            return "victory"
        if status and not w.done and u.hp < 0.3 * u.max_hp:
            return "hurt"
        return None

    def _draw_token(self, u, cx, cy, r, status=True, pose=None):
        """A unit's ball at screen position (cx, cy) with radius r: sprite or procedural."""
        surf = self.surface
        flash = self.world.t - u.last_hurt < 0.1 and status
        path = self._body_sprite_path(u)
        src = self.sprites.load(path, trim=True)
        pose = pose or self._pose(u, status)
        if pose == "hurt":          # shaky on its feet
            cx += math.sin(self.t * 31 + u.uid) * r * 0.05
        elif pose == "victory":     # proud hops + a golden glow behind
            cy -= abs(math.sin(self.t * 6.5)) * r * 0.14
            self._victory_glow(cx, cy, r)
        if src is not None:
            # fit the visible art (hood, cape, wings included) to ~2.1x the physics radius;
            # characters can fine-tune with "art_fit": {"scale": 1.0, "dy": 0.0}
            fit = u.tpl.get("art_fit", {})
            sw, sh = src.get_size()
            hero_boost = 1.4 if (self.horde and u.is_main) else 1.0   # survival: the hero must pop out of the crowd
            f = 2.1 * r * float(fit.get("scale", 1.0)) * hero_boost / max(sw, sh)
            img = self.sprites.scaled(path, sw * f, sh * f, trim=True, flash=flash)
            top = cy - img.get_height() / 2 - r * (0.08 - float(fit.get("dy", 0.0)))
            if u.is_main and not u.tpl.get("sprite") and status:
                self._ground_shadow(cx, top + img.get_height(), img.get_width())
            surf.blit(img, (int(cx - img.get_width() / 2), int(top)))
            if pose == "hurt":
                self._hurt_overlay(u, img, int(cx - img.get_width() / 2), int(top), r)
            if status and self._chilled(u):
                self._chill_overlay(u, img, int(cx - img.get_width() / 2), int(top), cx, cy, r)
        else:
            col = _mix(u.color, (255, 255, 255), 0.6) if flash else u.color
            pygame.draw.circle(surf, col, (cx, cy), r)
            pygame.draw.circle(surf, _shade(u.color, 0.45), (cx, cy), r, max(2, int(4 * self.S)))
            for d in u.decor:
                self._draw_decor(d, cx, cy, r, u.color)
        if status:
            if u.dots:
                pygame.draw.circle(surf, LIME, (cx, cy), r + 2, 2)
            elif self._chilled(u) and src is None:
                pygame.draw.circle(surf, ICE, (cx, cy), r + 2, 2)

    def _draw_props(self):
        """Neutral arenas: the two theme props sit in opposite corners (decor only, no collision)."""
        size = self.arena_w * 0.15
        spots = [(0.1, 0.08), (0.9, 0.92), (0.9, 0.08), (0.1, 0.92)]
        for i, path in enumerate(self.theme["props"] * 2):
            src = self.sprites.load(path, trim=True)
            if src is None:
                continue
            sw, sh = src.get_size()
            f = size / max(sw, sh)
            img = self.sprites.scaled(path, sw * f, sh * f, trim=True)
            if i >= 2:
                img = pygame.transform.flip(img, True, False)
            fx, fy = spots[i]
            x = self.ax + self._ox + fx * self.arena_w
            y = self.ay + self._oy + fy * self.arena_h
            self.surface.blit(img, img.get_rect(center=(int(x), int(y))))

    def _track_projectiles(self):
        """Launch flash when a projectile appears, impact burst (and a scorch mark for fireballs)
        where it disappears: spotted by diffing the projectile list frame to frame."""
        cur = {id(p): p for p in self.world.projectiles if p.alive}
        for pid, (style, x, y) in self.proj_prev.items():
            if pid in cur or style not in PROJ_FX:
                continue
            _, hit, size = PROJ_FX[style]
            if hit:
                self.bursts.append((f"art/fx/proj/{hit}.png", x, y, size, self.t, 0.28, 0.0, "over"))
            if style == "fireball":
                self.bursts.append(("art/fx/proj/scorch_mark.png", x, y, 90, self.t, 1.6, 0.0, "under"))
        for pid, p in cur.items():
            if pid in self.proj_prev or p.style not in PROJ_FX:
                continue
            launch = PROJ_FX[p.style][0]
            if launch:
                deg = -math.degrees(math.atan2(p.vy, p.vx))
                self.bursts.append((f"art/fx/proj/{launch}.png", p.x, p.y, 70, self.t, 0.16, deg, "over"))
        self.proj_prev = {pid: (p.style, p.x, p.y) for pid, p in cur.items()}

    def _draw_bursts(self, layer):
        """One-shot sprites: pop in, grow a little, fade out. Missing art is skipped."""
        keep = []
        for b in self.bursts:
            path, x, y, size, t0, dur, deg, lay = b
            age = self.t - t0
            if age > dur:
                continue
            keep.append(b)
            if lay != layer:
                continue
            src = self.sprites.load(path, trim=True)
            if src is None:
                continue
            k = age / dur
            grow = 0.75 + 0.35 * min(1.0, k * 3) if dur < 1.0 else 1.0
            d = size * self.k * grow
            sw, sh = src.get_size()
            f = d / max(sw, sh)
            img = self.sprites.scaled(path, sw * f, sh * f, trim=True)
            if deg:
                img = pygame.transform.rotate(img, deg)
            else:
                img = img.copy()
            img.set_alpha(int(255 * min(1.0, (1 - k) / 0.4)))
            self.surface.blit(img, img.get_rect(center=(int(self.sx(x)), int(self.sy(y)))))
        if layer == "over":
            self.bursts = keep

    def _draw_enraged_aura(self, b):
        pre = BOSS_PREFIX.get(b.kind, "")
        path = f"art/boss/fx2/{pre}_enraged_aura.png"
        if not pre or self.sprites.load(path, trim=True) is None:
            return
        d = b.radius * self.k * 2.9 * (1 + 0.04 * math.sin(self.t * 6))
        img = pygame.transform.rotate(self.sprites.scaled(path, d, d, trim=True), (self.t * 40) % 360)
        img.set_alpha(200)
        self.surface.blit(img, img.get_rect(center=(int(self.sx(b.x)), int(self.sy(b.y)))))

    def _fx_sprite(self, path, cx, cy, size, since, dur=0.4, grow=0.4):
        """Intro helper: a sprite burst at screen (cx, cy), `since` seconds after it started."""
        if since < 0 or since > dur:
            return
        src = self.sprites.load(path, trim=True)
        if src is None:
            return
        k = since / dur
        d = size * (1 - grow + grow * min(1.0, k * 3))
        sw, sh = src.get_size()
        f = d / max(sw, sh)
        img = self.sprites.scaled(path, sw * f, sh * f, trim=True).copy()
        img.set_alpha(int(255 * min(1.0, (1 - k) / 0.35)))
        self.surface.blit(img, img.get_rect(center=(int(cx), int(cy))))

    def _ground_shadow(self, cx, feet_y, w):
        """A soft dark oval on the floor under a hero: separates it from busy or dark maps
        without outlining the art (an outline made them look like stickers)."""
        sw, sh = int(w * 0.8), max(6, int(w * 0.22))
        key = (sw, sh)
        img = self._rims.get(key)
        if img is None:
            img = pygame.Surface((sw, sh), pygame.SRCALPHA)
            for i, a in ((1.0, 40), (0.75, 45), (0.5, 50)):
                r = pygame.Rect(0, 0, int(sw * i), int(sh * i))
                r.center = (sw // 2, sh // 2)
                pygame.draw.ellipse(img, (0, 0, 0, a), r)
            self._rims[key] = img
        self.surface.blit(img, (int(cx - sw / 2), int(feet_y - sh * 0.6)))

    def _rim(self, img, x, y, key):
        """A soft light halo hugging a hero's silhouette (drawn behind it), so dark heroes
        stay readable on dark maps. Cached per sprite image."""
        halo = self._rims.get(key)
        if halo is None:
            m = pygame.mask.from_surface(img)
            sil = m.to_surface(setcolor=(255, 248, 225, 120), unsetcolor=(0, 0, 0, 0))
            w, h = img.get_size()
            halo = pygame.Surface((w + 6, h + 6), pygame.SRCALPHA)
            for dx, dy in ((-3, 0), (3, 0), (0, -3), (0, 3), (-2, -2), (2, 2), (-2, 2), (2, -2)):
                halo.blit(sil, (3 + dx, 3 + dy))
            if len(self._rims) > 400:
                self._rims.clear()
            self._rims[key] = halo
        self.surface.blit(halo, (x - 3, y - 3))

    @staticmethod
    def _chilled(u):
        return any(b["stat"] == "speed" and b.get("mul", 1) < 1 for b in u.buffs)

    def _chill_overlay(self, u, img, x, y, cx, cy, r):
        """Slowed by frost: the body frosts over pale blue with a white rim, ice crystals grow
        at its feet and snowflakes circle it."""
        w, h = img.get_size()
        sil = pygame.mask.from_surface(img)
        if not (u.is_main or u.tpl.get("boss")):   # mobs: just a pale tint (a crowd of crystals is noise)
            self.surface.blit(sil.to_surface(setcolor=(150, 215, 255, 90), unsetcolor=(0, 0, 0, 0)), (x, y))
            return
        ice = sil.to_surface(setcolor=(150, 215, 255, 140), unsetcolor=(0, 0, 0, 0))
        self.surface.blit(ice, (x, y))
        rim = sil.outline()
        if len(rim) > 2:                       # frosty white outline
            pygame.draw.lines(self.surface, (235, 248, 255), True, [(x + px, y + py) for px, py in rim],
                              max(2, int(3 * self.S)))
        crys = "art/fx/freeze/chill.png"
        if self.sprites.load(crys, trim=True) is not None:
            d = r * 1.1
            c = self.sprites.scaled(crys, d, d, trim=True)
            self.surface.blit(c, c.get_rect(midbottom=(int(cx), int(cy + r * 1.15))))
        flake = "art/fx/freeze/snowflake.png"
        if self.sprites.load(flake, trim=True) is not None:
            fs = r * 0.4
            img2 = self.sprites.scaled(flake, fs, fs, trim=True)
            for i in range(3):
                a = self.t * 3 + i * 2.094 + u.uid
                self.surface.blit(img2, img2.get_rect(center=(int(cx + math.cos(a) * r * 1.2),
                                                              int(cy + math.sin(a) * r * 0.9))))

    def _hurt_overlay(self, u, img, x, y, r):
        """Low HP: cracks across the sprite, a red pulse and a bobbing sweat drop."""
        w, h = img.get_size()
        over = pygame.Surface((w, h), pygame.SRCALPHA)
        pulse = 0.5 + 0.5 * math.sin(self.t * 10)
        over.fill((255, 40, 40, int(40 + 50 * pulse)))
        rng = random.Random(u.uid * 7919)
        for _ in range(3):                      # jagged cracks
            px, py = rng.uniform(0.2, 0.8) * w, rng.uniform(0.15, 0.5) * h
            pts = [(px, py)]
            ang = rng.uniform(0, math.tau)
            for _ in range(4):
                ang += rng.uniform(-0.9, 0.9)
                px += math.cos(ang) * w * 0.09
                py += math.sin(ang) * h * 0.09
                pts.append((px, py))
            pygame.draw.lines(over, (25, 15, 20, 230), False, pts, max(2, int(w / 28)))
        # keep the overlay inside the sprite's own silhouette
        sil = pygame.mask.from_surface(img).to_surface(setcolor=(255, 255, 255, 255), unsetcolor=(0, 0, 0, 0))
        over.blit(sil, (0, 0), special_flags=pygame.BLEND_RGBA_MIN)
        self.surface.blit(over, (x, y))
        dx, dy = x + w * 0.85, y + h * 0.12 + math.sin(self.t * 5) * r * 0.06   # sweat drop
        d = max(4, r * 0.16)
        pygame.draw.polygon(self.surface, (150, 210, 255), [(dx, dy - d * 1.4), (dx - d * 0.7, dy), (dx + d * 0.7, dy)])
        pygame.draw.circle(self.surface, (150, 210, 255), (dx, dy), d * 0.7)
        pygame.draw.circle(self.surface, (255, 255, 255), (dx - d * 0.25, dy - d * 0.1), max(1, d * 0.22))

    def _victory_glow(self, cx, cy, r):
        """Winner: a pulsing golden halo behind the sprite with twinkling sparkles."""
        p = 0.5 + 0.5 * math.sin(self.t * 5)
        R = int(r * (1.35 + 0.1 * p))
        g = pygame.Surface((R * 2 + 4, R * 2 + 4), pygame.SRCALPHA)
        for i, a in ((1.0, 50), (0.82, 70), (0.64, 90)):
            pygame.draw.circle(g, (255, 215, 80, int(a * (0.7 + 0.3 * p))), (R + 2, R + 2), int(R * i))
        self.surface.blit(g, (int(cx - R - 2), int(cy - R - 2)))
        for i in range(5):                      # 4-point twinkles orbiting
            a = self.t * 1.6 + i * math.tau / 5
            tw = max(0.0, math.sin(self.t * 7 + i * 1.7))
            sx, sy = cx + math.cos(a) * r * 1.45, cy + math.sin(a) * r * 1.3
            L = r * 0.22 * tw
            if L < 1:
                continue
            pygame.draw.line(self.surface, (255, 250, 210), (sx - L, sy), (sx + L, sy), max(1, int(r * 0.05)))
            pygame.draw.line(self.surface, (255, 250, 210), (sx, sy - L), (sx, sy + L), max(1, int(r * 0.05)))

    def _draw_corpses(self):
        """K.O.'d fighters: the real sprite tips over and goes grey, with dizzy stars. Fades,
        unless it was the final K.O. (then it stays down while the winner celebrates)."""
        keep = []
        for u, x, y, t0 in self.corpses:
            age = self.t - t0
            final = self.world.done
            if age > 1.6 and not final:
                continue
            keep.append((u, x, y, t0))
            path = self._body_sprite_path(u)
            src = self.sprites.load(path, trim=True)
            if src is None:
                continue
            cx, cy, r = self.sx(x), self.sy(y), u.radius * self.k
            fit = u.tpl.get("art_fit", {})
            sw, sh = src.get_size()
            f = 2.1 * r * float(fit.get("scale", 1.0)) / max(sw, sh)
            img = pygame.transform.grayscale(self.sprites.scaled(path, sw * f, sh * f, trim=True))
            tip = min(1.0, age / 0.25)
            img = pygame.transform.rotate(img, -80 * tip * (1 if u.side == 0 else -1))
            alpha = 210 if final else int(210 * max(0.0, 1 - max(0.0, age - 1.1) / 0.5))
            img.set_alpha(alpha)
            self.surface.blit(img, img.get_rect(center=(int(cx), int(cy + r * 0.3 * tip))))
            for i in range(3):                  # dizzy stars circling above
                a = age * 5 + i * math.tau / 3
                self._star(cx + math.cos(a) * r * 0.7, cy - r * 0.9 + math.sin(a) * r * 0.25,
                           max(3, r * 0.17), (255, 230, 90, alpha))
        self.corpses = keep

    def _star(self, x, y, R, col):
        pts = []
        for i in range(10):
            rr = R if i % 2 == 0 else R * 0.45
            a = -math.pi / 2 + i * math.pi / 5
            pts.append((R + 2 + math.cos(a) * rr, R + 2 + math.sin(a) * rr))
        g = pygame.Surface((int(R * 2 + 4), int(R * 2 + 4)), pygame.SRCALPHA)
        pygame.draw.polygon(g, col, pts)
        pygame.draw.polygon(g, (60, 40, 10, col[3]), pts, 1)
        self.surface.blit(g, (int(x - R - 2), int(y - R - 2)))

    def _cap(self, cx, cy, R, y_cut, n=24):
        """Polygon of the part of a circle above the line y = cy - y_cut."""
        a = math.asin(max(-1.0, min(1.0, y_cut / R)))
        pts = []
        for i in range(n + 1):
            th = math.pi + a + (math.pi - 2 * a) * i / n
            pts.append((cx + R * math.cos(th), cy + R * math.sin(th)))
        return pts

    def _band(self, cx, cy, r, y, h, color, out_w):
        """Horizontal band across the ball face at height y (relative, -1 top .. 1 bottom)."""
        half = r * math.sqrt(max(0.0, 1 - (abs(y) + h / 2) ** 2)) + 2
        rect = pygame.Rect(int(cx - half), int(cy + y * r - h * r / 2), int(2 * half), int(h * r))
        pygame.draw.rect(self.surface, color, rect)
        return rect

    def _draw_decor(self, decor, cx, cy, r, body):
        surf = self.surface
        out_w = max(2, int(3 * self.S))
        if decor == "helmet":
            steel, dark = (175, 180, 192), (60, 62, 72)
            cap = self._cap(cx, cy, r * 1.05, r * 0.32)
            pygame.draw.polygon(surf, steel, cap)
            pygame.draw.polygon(surf, dark, cap, out_w)
            slit = pygame.Rect(int(cx - r * 0.55), int(cy - r * 0.52), int(r * 1.1), int(r * 0.1))
            pygame.draw.rect(surf, (25, 25, 30), slit)
            plume = pygame.Rect(0, 0, int(r * 0.3), int(r * 0.55))
            plume.midbottom = (int(cx), int(cy - r * 0.98))
            pygame.draw.ellipse(surf, (200, 40, 40), plume)
            pygame.draw.ellipse(surf, (90, 15, 15), plume, out_w)
        elif decor == "hood":
            cloth = _shade(body, 0.6)
            cap = self._cap(cx, cy, r * 1.1, r * 0.35)
            tip = [(cx - r * 0.35, cy - r * 0.95), (cx + r * 0.55, cy - r * 1.55), (cx + r * 0.3, cy - r * 0.9)]
            pygame.draw.polygon(surf, cloth, tip)
            pygame.draw.polygon(surf, _shade(body, 0.3), tip, out_w)
            pygame.draw.polygon(surf, cloth, cap)
            pygame.draw.polygon(surf, _shade(body, 0.3), cap, out_w)
        elif decor == "wizard_hat":
            hat, dark = (85, 55, 165), (35, 20, 70)
            brim = pygame.Rect(0, 0, int(r * 1.6), int(r * 0.32))
            brim.center = (int(cx), int(cy - r * 0.82))
            cone = [(cx - r * 0.55, cy - r * 0.85), (cx + r * 0.25, cy - r * 2.05), (cx + r * 0.55, cy - r * 0.85)]
            pygame.draw.polygon(surf, hat, cone)
            pygame.draw.polygon(surf, dark, cone, out_w)
            pygame.draw.ellipse(surf, hat, brim)
            pygame.draw.ellipse(surf, dark, brim, out_w)
            pygame.draw.circle(surf, (255, 220, 70), (cx + r * 0.05, cy - r * 1.3), max(3, r * 0.1))
        elif decor == "fangs":
            for sgn in (-1, 1):
                ex = cx + sgn * r * 0.30
                pygame.draw.circle(surf, (255, 40, 40), (ex, cy - r * 0.55), r * 0.11)
                fang = [(cx + sgn * r * 0.12, cy + r * 0.48), (cx + sgn * r * 0.30, cy + r * 0.48),
                        (cx + sgn * r * 0.21, cy + r * 0.75)]
                pygame.draw.polygon(surf, (250, 250, 250), fang)
                pygame.draw.polygon(surf, (60, 20, 20), fang, max(1, out_w - 1))
        elif decor == "mask":
            self._band(cx, cy, r, -0.55, 0.32, (25, 25, 30), out_w)
            for sgn in (-1, 1):
                eye = pygame.Rect(0, 0, int(r * 0.3), max(1, int(r * 0.1)))
                eye.center = (int(cx + sgn * r * 0.3), int(cy - r * 0.55))
                pygame.draw.rect(surf, (245, 245, 245), eye)
            for k in (0, 1):
                tail = [(cx + r * 0.9, cy - r * 0.6), (cx + r * 1.5, cy - r * (0.8 - 0.35 * k)),
                        (cx + r * 1.4, cy - r * (0.65 - 0.35 * k))]
                pygame.draw.polygon(surf, (25, 25, 30), tail)
        elif decor == "headband":
            red = (210, 35, 35)
            self._band(cx, cy, r, -0.62, 0.18, red, out_w)
            for k in (0, 1):
                tail = [(cx + r * 0.85, cy - r * 0.65), (cx + r * 1.45, cy - r * (0.85 - 0.4 * k)),
                        (cx + r * 1.35, cy - r * (0.68 - 0.4 * k))]
                pygame.draw.polygon(surf, red, tail)
        elif decor == "skull":
            bone = (235, 230, 215)
            for sgn in (-1, 1):
                sock = pygame.Rect(0, 0, int(r * 0.36), int(r * 0.3))
                sock.center = (int(cx + sgn * r * 0.3), int(cy - r * 0.55))
                pygame.draw.ellipse(surf, (20, 15, 25), sock)
                pygame.draw.circle(surf, (120, 255, 140), sock.center, max(1, r * 0.05))
            for i in range(-2, 3):
                tooth = pygame.Rect(0, 0, max(1, int(r * 0.12)), max(1, int(r * 0.16)))
                tooth.center = (int(cx + i * r * 0.14), int(cy + r * 0.6))
                pygame.draw.rect(surf, bone, tooth)
                pygame.draw.rect(surf, (40, 30, 40), tooth, 1)
        elif decor == "beard":
            hair = (205, 110, 40)
            pts = [(cx - r * 0.6, cy + r * 0.5), (cx + r * 0.6, cy + r * 0.5),
                   (cx + r * 0.38, cy + r * 0.9), (cx, cy + r * 1.08), (cx - r * 0.38, cy + r * 0.9)]
            pygame.draw.polygon(surf, hair, pts)
            pygame.draw.polygon(surf, _shade(hair, 0.45), pts, out_w)
        elif decor == "crown":
            w, h = 1.15 * r, 0.5 * r
            left, bottom = cx - w / 2, cy - 0.80 * r
            top = bottom - h
            spikes = 4
            pts = [(left, bottom)]
            for i in range(2 * spikes + 1):
                x = left + i * w / (2 * spikes)
                y = top if i % 2 == 0 else bottom - h * 0.42
                pts.append((x, y))
            pts.append((left + w, bottom))
            gold, dark = (238, 188, 40), (120, 78, 10)
            pygame.draw.polygon(surf, gold, pts)
            pygame.draw.polygon(surf, dark, pts, out_w)
            band = pygame.Rect(int(left), int(bottom - h * 0.28), int(w), max(1, int(h * 0.28)))
            pygame.draw.rect(surf, (210, 150, 25), band)
            pygame.draw.rect(surf, dark, band, out_w)
            for i in range(0, 2 * spikes + 1, 2):
                x = left + i * w / (2 * spikes)
                pygame.draw.circle(surf, (230, 40, 60), (x, top), max(1, r * 0.07))
        elif decor == "halo":
            rect = pygame.Rect(0, 0, int(r * 1.2), int(r * 0.35))
            rect.center = (int(cx), int(cy - r * 1.15))
            pygame.draw.ellipse(surf, (255, 225, 90), rect, max(2, int(r * 0.12)))
        elif decor == "horns":
            for sgn in (-1, 1):
                base1 = (cx + sgn * r * 0.30, cy - r * 0.85)
                base2 = (cx + sgn * r * 0.70, cy - r * 0.62)
                tip = (cx + sgn * r * 0.85, cy - r * 1.45)
                pygame.draw.polygon(surf, (240, 235, 220), [base1, tip, base2])
                pygame.draw.polygon(surf, (90, 80, 70), [base1, tip, base2], out_w)
        elif decor == "eyes":
            for sgn in (-1, 1):
                ex, ey = cx + sgn * r * 0.30, cy - r * 0.56
                pygame.draw.circle(surf, (255, 255, 255), (ex, ey), r * 0.16)
                pygame.draw.circle(surf, (20, 20, 20), (ex + sgn * r * 0.04, ey), r * 0.08)

    def _weapon_sprite_path(self, b):
        u = b.owner
        if not u.is_main:
            return f"characters/art/{_art_id(u)}/summon_{u.kind}_weapon.png"
        i = getattr(b, "index", 0)
        path = f"characters/art/{_art_id(u)}/weapon_{i}.png"
        # a second copy of the same weapon (e.g. twin daggers) reuses weapon_0's art
        if i > 0 and self.sprites.load(path, trim=True) is None and u.blades[0].style == b.style:
            path = f"characters/art/{_art_id(u)}/weapon_0.png"
        return path

    def _draw_blade(self, b):
        surf = self.surface
        bx, by, tx, ty, hw = b.segment()
        B = (self.sx(bx), self.sy(by))
        T = (self.sx(tx), self.sy(ty))
        L = math.hypot(T[0] - B[0], T[1] - B[1])
        if L < 1:
            return
        d = ((T[0] - B[0]) / L, (T[1] - B[1]) / L)
        n = (-d[1], d[0])
        w = 2 * hw * self.k

        # sprite: drawn pointing right with the handle on the left, rotated around the grip
        path = self._weapon_sprite_path(b)
        straight = b.style not in ("shield", "bow")   # upright art stays as drawn
        src = self.sprites.load(path, trim=True, straighten=straight)
        if src is not None:
            sw, sh = src.get_size()
            deg = math.degrees(math.atan2(d[1], d[0]))
            if b.style in ("shield", "bow"):   # upright art held across the swing direction
                f = w / sh
                img = self.sprites.scaled(path, sw * f, w, trim=True, straighten=straight)
                center = (B[0] + d[0] * L / 2, B[1] + d[1] * L / 2)
            else:                              # handle sits inside the ball edge
                total = 1.25 * L
                f = total / sw
                img = self.sprites.scaled(path, total, max(2, sh * f), trim=True, straighten=straight)
                center = (B[0] + d[0] * 0.375 * L, B[1] + d[1] * 0.375 * L)
            rot = pygame.transform.rotate(img, -deg)
            surf.blit(rot, rot.get_rect(center=(int(center[0]), int(center[1]))))
            return

        out_w = max(2, int(3 * self.S))
        dark = (50, 50, 60)

        def P(along, side):
            return (B[0] + d[0] * along + n[0] * side, B[1] + d[1] * along + n[1] * side)

        if b.style == "stick":           # hockey stick: taped shaft + a blade bent at the end
            shaft = [P(-0.15 * L, 0.13 * w), P(0.86 * L, 0.13 * w),
                     P(0.86 * L, -0.13 * w), P(-0.15 * L, -0.13 * w)]
            pygame.draw.polygon(surf, b.color, shaft)
            pygame.draw.polygon(surf, dark, shaft, out_w)
            blade = [P(0.8 * L, 0.2 * w), P(L, 0.2 * w), P(L, 1.25 * w), P(0.86 * L, 1.25 * w)]
            pygame.draw.polygon(surf, (30, 30, 34), blade)
            pygame.draw.polygon(surf, dark, blade, out_w)
            tape = [P(0.1 * L, 0.14 * w), P(0.22 * L, 0.14 * w), P(0.22 * L, -0.14 * w), P(0.1 * L, -0.14 * w)]
            pygame.draw.polygon(surf, (245, 245, 245), tape)
        elif b.style == "spear":
            shaft = [P(-0.15 * L, 0.16 * w), P(0.75 * L, 0.16 * w),
                     P(0.75 * L, -0.16 * w), P(-0.15 * L, -0.16 * w)]
            pygame.draw.polygon(surf, (120, 78, 40), shaft)
            pygame.draw.polygon(surf, dark, shaft, out_w)
            head = [P(0.68 * L, 0.55 * w), T, P(0.68 * L, -0.55 * w)]
            pygame.draw.polygon(surf, b.color, head)
            pygame.draw.polygon(surf, dark, head, out_w)
        elif b.style == "hammer":
            shaft = [P(-0.15 * L, 0.16 * w), P(0.8 * L, 0.16 * w),
                     P(0.8 * L, -0.16 * w), P(-0.15 * L, -0.16 * w)]
            pygame.draw.polygon(surf, (120, 78, 40), shaft)
            pygame.draw.polygon(surf, dark, shaft, out_w)
            head = [P(0.72 * L, 0.9 * w), P(L, 0.9 * w), P(L, -0.9 * w), P(0.72 * L, -0.9 * w)]
            pygame.draw.polygon(surf, b.color, head)
            pygame.draw.polygon(surf, dark, head, out_w)
        elif b.style == "axe":
            shaft = [P(-0.15 * L, 0.14 * w), P(L, 0.14 * w), P(L, -0.14 * w), P(-0.15 * L, -0.14 * w)]
            pygame.draw.polygon(surf, (120, 78, 40), shaft)
            pygame.draw.polygon(surf, dark, shaft, out_w)
            head = [P(0.62 * L, 0.1 * w), P(0.55 * L, 1.1 * w), P(0.78 * L, 1.35 * w),
                    P(0.98 * L, 1.1 * w), P(0.92 * L, 0.1 * w)]
            pygame.draw.polygon(surf, b.color, head)
            pygame.draw.polygon(surf, dark, head, out_w)
        elif b.style == "staff":
            shaft = [P(-0.1 * L, 0.18 * w), P(0.82 * L, 0.18 * w), P(0.82 * L, -0.18 * w), P(-0.1 * L, -0.18 * w)]
            pygame.draw.polygon(surf, (110, 72, 40), shaft)
            pygame.draw.polygon(surf, dark, shaft, out_w)
            orb = P(0.88 * L, 0)
            pygame.draw.circle(surf, _mix(b.color, (255, 255, 255), 0.4), orb, 0.75 * w)
            pygame.draw.circle(surf, b.color, orb, 0.55 * w)
            pygame.draw.circle(surf, dark, orb, 0.75 * w, out_w)
        elif b.style == "scythe":
            shaft = [P(-0.15 * L, 0.13 * w), P(L, 0.13 * w), P(L, -0.13 * w), P(-0.15 * L, -0.13 * w)]
            pygame.draw.polygon(surf, (70, 50, 60), shaft)
            pygame.draw.polygon(surf, dark, shaft, out_w)
            blade = [P(L, 0), P(0.92 * L, -1.4 * w), P(0.72 * L, -2.6 * w), P(0.55 * L, -2.9 * w),
                     P(0.78 * L, -2.0 * w), P(0.86 * L, -0.4 * w)]
            pygame.draw.polygon(surf, b.color, blade)
            pygame.draw.polygon(surf, dark, blade, out_w)
        elif b.style == "shield":
            rect = [P(0, 0.5 * w), P(L, 0.5 * w), P(L, -0.5 * w), P(0, -0.5 * w)]
            pygame.draw.polygon(surf, b.color, rect)
            pygame.draw.polygon(surf, b.guard_color, rect, max(2, int(0.12 * w)))
            pygame.draw.polygon(surf, dark, rect, out_w)
            pygame.draw.circle(surf, b.guard_color, P(0.5 * L, 0), max(2, 0.16 * w))
        elif b.style == "bow":
            pts = []
            for i in range(13):
                t = -1 + i / 6
                pts.append(P(0.9 * L * (1 - t * t), t * w / 2))
            pygame.draw.lines(surf, (120, 78, 40), False, pts, max(2, int(0.12 * w)))
            pygame.draw.line(surf, (235, 235, 220), pts[0], pts[-1], 1)
        else:  # sword / dagger
            grip = [P(-0.2 * L, 0.2 * w), P(0, 0.2 * w), P(0, -0.2 * w), P(-0.2 * L, -0.2 * w)]
            pygame.draw.polygon(surf, (110, 70, 40), grip)
            pygame.draw.polygon(surf, dark, grip, out_w)
            pygame.draw.circle(surf, b.guard_color, P(-0.22 * L, 0), max(2, 0.24 * w))
            blade = [P(0.04 * L, 0.5 * w), P(0.82 * L, 0.5 * w), T,
                     P(0.82 * L, -0.5 * w), P(0.04 * L, -0.5 * w)]
            pygame.draw.polygon(surf, b.color, blade)
            pygame.draw.line(surf, _mix(b.color, (255, 255, 255), 0.6),
                             P(0.1 * L, 0.15 * w), P(0.8 * L, 0.15 * w), max(1, int(0.14 * w)))
            pygame.draw.polygon(surf, dark, blade, out_w)
            guard = [P(-0.03 * L, 0.9 * w), P(0.06 * L, 0.9 * w),
                     P(0.06 * L, -0.9 * w), P(-0.03 * L, -0.9 * w)]
            pygame.draw.polygon(surf, b.guard_color, guard)
            pygame.draw.polygon(surf, _shade(b.guard_color, 0.45), guard, out_w)

    def _draw_projectile(self, p):
        surf = self.surface
        cx, cy = self.sx(p.x), self.sy(p.y)
        r = p.radius * self.k
        sp = math.hypot(p.vx, p.vy) or 1.0
        d = (p.vx / sp, p.vy / sp)
        n = (-d[1], d[0])

        if p.style == "puck":            # ice-spray streaks behind a flying puck
            for i, side in enumerate((-0.6, 0, 0.6)):
                ln = r * (3.5 + i % 2 * 1.5)
                a = (cx - d[0] * r * 0.8 + n[0] * r * side, cy - d[1] * r * 0.8 + n[1] * r * side)
                pygame.draw.line(surf, (225, 240, 255), a, (a[0] - d[0] * ln, a[1] - d[1] * ln),
                                 max(1, int(r * 0.25)))
        path = f"characters/art/{_art_id(p.owner)}/projectile_{p.style}.png"
        if p.style in ("fireball", "puck", "shuriken") and self.sprites.load(f"art/fx/proj/{p.style}.png", trim=True) is not None:
            path = f"art/fx/proj/{p.style}.png"
        straight = p.style not in ("shuriken", "puck")
        src = self.sprites.load(path, trim=True, straighten=straight)
        if src is not None:
            length = r * {"arrow": 5.5, "fireball": 3.6, "shuriken": 2.8, "puck": 2.4}.get(p.style, 2.6)
            sw, sh = src.get_size()
            img = self.sprites.scaled(path, length, max(2, sh * length / sw), trim=True, straighten=straight)
            deg = (p.age * 900 if p.style == "shuriken" else p.age * 400 if p.style == "puck"
                   else -math.degrees(math.atan2(d[1], d[0])))
            rot = pygame.transform.rotate(img, deg)
            # arrows/fireballs: the sprite's right end is the leading point
            off = 0 if p.style in ("shuriken", "puck") else length * 0.3
            surf.blit(rot, rot.get_rect(center=(int(cx - d[0] * off), int(cy - d[1] * off))))
            return

        dark = (40, 35, 40)
        out_w = 1
        if p.style == "arrow":
            tail = (cx - d[0] * r * 4, cy - d[1] * r * 4)
            pygame.draw.line(surf, (120, 78, 40), tail, (cx, cy), max(1, int(r * 0.45)))
            head = [(cx + d[0] * r * 1.4, cy + d[1] * r * 1.4),
                    (cx + n[0] * r * 0.8, cy + n[1] * r * 0.8),
                    (cx - n[0] * r * 0.8, cy - n[1] * r * 0.8)]
            pygame.draw.polygon(surf, (200, 205, 215), head)
            pygame.draw.polygon(surf, dark, head, out_w)
            for s in (1, -1):
                pygame.draw.line(surf, p.color, tail,
                                 (tail[0] - d[0] * r + n[0] * r * 0.8 * s,
                                  tail[1] - d[1] * r + n[1] * r * 0.8 * s), max(1, int(r * 0.35)))
        elif p.style == "fireball":
            for i in range(3, 0, -1):
                tx, ty = cx - d[0] * r * i * 0.9, cy - d[1] * r * i * 0.9
                pygame.draw.circle(surf, (255, 140 - i * 25, 30), (tx, ty), r * (1 - i * 0.2))
            pygame.draw.circle(surf, (255, 120, 30), (cx, cy), r * 1.1)
            pygame.draw.circle(surf, (255, 230, 120), (cx, cy), r * 0.6)
        elif p.style == "shuriken":
            a0 = p.age * 18
            pts = []
            for i in range(8):
                rr = r * 1.4 if i % 2 == 0 else r * 0.45
                a = a0 + i * math.pi / 4
                pts.append((cx + math.cos(a) * rr, cy + math.sin(a) * rr))
            pygame.draw.polygon(surf, (190, 195, 205), pts)
            pygame.draw.polygon(surf, dark, pts, out_w)
        elif p.style == "puck":
            pygame.draw.circle(surf, (20, 20, 24), (cx, cy), r * 1.15)
            pygame.draw.circle(surf, (70, 70, 80), (cx, cy), r * 1.15, max(1, int(r * 0.2)))
            pygame.draw.circle(surf, (120, 120, 135), (cx - r * 0.35, cy - r * 0.35), r * 0.25)
        elif p.style == "bolt":
            tail = (cx - d[0] * r * 5, cy - d[1] * r * 5)
            pygame.draw.line(surf, _mix(p.color, (255, 255, 255), 0.6), tail, (cx, cy), max(2, int(r * 0.9)))
            pygame.draw.circle(surf, (255, 255, 255), (cx, cy), r * 0.6)
        else:  # orb
            pygame.draw.circle(surf, _mix(p.color, (255, 255, 255), 0.3), (cx, cy), r * 1.25)
            pygame.draw.circle(surf, p.color, (cx, cy), r)
            pygame.draw.circle(surf, (255, 255, 255), (cx - r * 0.3, cy - r * 0.3), r * 0.3)

    def _draw_hp(self, u):
        """Small HP number on minions (main fighters show HP in the top bars)."""
        hp = max(0, math.ceil(u.hp - 1e-6))
        img = self.text.render(str(hp), 1, CREAM, "s")
        cy = self.sy(u.y) - img.get_height() / 2
        if self.sprites.load(self._body_sprite_path(u), trim=True) is not None:
            cy = self.sy(u.y) + u.radius * self.k + 1   # keep the art's face visible
        self.surface.blit(img, (int(self.sx(u.x) - img.get_width() / 2), int(cy)))

    def _draw_fx(self):
        surf = self.surface
        t = self.t
        keep = []
        for ring in self.rings:
            x, y, r0, r1, t0, dur, col, width = ring
            p = (t - t0) / dur
            if p >= 1:
                continue
            keep.append(ring)
            r = (r0 + (r1 - r0) * p) * self.k
            wpx = max(1, int(width * self.S * (1 - p)))
            pygame.draw.circle(surf, col, (self.sx(x), self.sy(y)), r, wpx)
        self.rings = keep

        keep = []
        for sp in self.sparks:
            x, y, t0, src = sp
            p = (t - t0) / (0.2 if src is not None else 0.15)
            if p >= 1:
                continue
            keep.append(sp)
            cx, cy = self.sx(x), self.sy(y)
            fx = self._char_fx(src, "hit_fx")      # the attacker's own hit effect (PixelLab)
            if fx is not None:
                size = (44 + 26 * min(1.0, p * 2.5)) * self.S
                img = self.sprites.scaled(fx, size, size)
                img = pygame.transform.rotate(img, (int(t0 * 997) % 8) * 45)
                if p > 0.55:
                    img = img.copy()
                    img.set_alpha(int(255 * (1 - p) / 0.45))
                surf.blit(img, (int(cx - img.get_width() / 2), int(cy - img.get_height() / 2)))
                continue
            ln = (14 + 26 * p) * self.S
            for i in range(6):
                a = i * math.pi / 3 + 0.3
                pygame.draw.line(surf, (255, 255, 230),
                                 (cx + math.cos(a) * ln * 0.4, cy + math.sin(a) * ln * 0.4),
                                 (cx + math.cos(a) * ln, cy + math.sin(a) * ln), 2)
        self.sparks = keep

        keep = []
        for pop in self.popups:
            x, y, txt, col, t0 = pop
            p = (t - t0) / 0.8
            if p >= 1:
                continue
            keep.append(pop)
            img = self.text.render(txt, 1, col).copy()
            img.set_alpha(int(255 * (1 - p * p)))
            px = self.sx(x) - img.get_width() / 2
            py = self.sy(y) - 35 - 35 * p
            surf.blit(img, (int(px), int(py)))
        self.popups = keep

        keep = []
        live = [sh for sh in self.shouts if (t - sh[4]) / 1.1 < 1]
        for sh in live[-1:]:              # one call-out at a time: the newest replaces the rest
            x, y, txt, col, t0 = sh
            p = (t - t0) / 1.1
            keep.append(sh)
            scale = 1 if p < 0.06 else 2
            img = self.text.fit(txt, scale, _mix(col, (255, 255, 255), 0.2), self.arena_w).copy()
            img.set_alpha(int(255 * (1 - max(0.0, p - 0.6) / 0.4)))
            px = self.sx(x) - img.get_width() / 2
            px = min(max(px, self.ax), self.ax + self.arena_w - img.get_width())
            py = max(self.ay + 4, self.sy(y) - 85 - 20 * p)
            surf.blit(img, (int(px), int(py)))
        self.shouts = keep

    # ── HUD ──────────────────────────────────────────────────────────────

    def _panel(self, rect, fill=NIGHT, trim=PANEL_HI):
        x, y, w, h = rect
        self.surface.fill(INK, (x, y, w, h))
        self.surface.fill(trim, (x + 2, y + 2, w - 4, h - 4))
        self.surface.fill(fill, (x + 3, y + 3, w - 6, h - 6))

    def _draw_top_hud(self, dt):
        surf = self.surface
        y = HUD_Y
        bw, bh = BAR_W, 16
        for side, u in enumerate(self.world.mains):
            frac = max(0.0, u.hp) / u.max_hp if u.alive else 0.0
            if frac < self.shown[side] - 1e-6:
                self.last_drop[side] = self.t
            self.shown[side] = frac
            if self.ghost[side] < frac:
                self.ghost[side] = frac
            elif self.t - self.last_drop[side] > 0.35:
                self.ghost[side] = max(frac, self.ghost[side] - 0.8 * dt)

            # portrait
            px = SAFE if side == 0 else IW - SAFE - 54
            self._panel((px, y - 4, 54, 54))
            self._draw_token(u, px + 27, y + 25, 17, status=False)
            if not u.alive:
                dim = pygame.Surface((48, 48), pygame.SRCALPHA)
                dim.fill((0, 0, 0, 150))
                surf.blit(dim, (px + 3, y - 1))
                pygame.draw.line(surf, RED_HI, (px + 10, y + 6), (px + 44, y + 40), 3)
                pygame.draw.line(surf, RED_HI, (px + 44, y + 6), (px + 10, y + 40), 3)

            # HP bar, anchored at the outer edge so lost HP shows near the timer
            bx = SAFE + 60 if side == 0 else IW - SAFE - 60 - bw
            surf.fill(INK, (bx - 2, y - 2, bw + 4, bh + 4))
            surf.fill(rgb("crimson"), (bx, y, bw, bh))
            g = int(bw * self.ghost[side])
            f = int(bw * frac)
            gx = bx if side == 0 else bx + bw - g
            fx = bx if side == 0 else bx + bw - f
            surf.fill(CREAM, (gx, y, g, bh))
            low = frac < 0.3
            col = RED_HI if low else GOLD
            if low and frac < 0.15 and int(self.t * 8) % 2 == 0:
                col = CREAM
            surf.fill(col, (fx, y, f, bh))
            surf.fill(_mix(col, (255, 255, 255), 0.45), (fx, y, f, 3))
            for i in range(1, 10):
                surf.fill(INK, (bx + bw * i // 10, y + bh - 4, 1, 4))
            hp = self.text.render(str(max(0, math.ceil(u.hp - 1e-6))), 1, CREAM)
            hx = bx + 3 if side == 0 else bx + bw - 3 - hp.get_width()
            surf.blit(hp, (hx, y + (bh - hp.get_height()) // 2 + 1))

            # name plate
            name = self.text.fit(u.name.upper(), self.name_scale, _readable(u.color), bw)
            nx = bx if side == 0 else bx + bw - name.get_width()
            surf.blit(name, (nx, y + bh + 6))

        # timer
        tx = IW // 2 - 28
        self._panel((tx, y - 6, 56, 44), trim=GOLD)
        secs = 0 if self.phase == "intro" else int(self.world.t)
        img = self.text.render(f"{secs:02d}", 2, YELLOW)
        surf.blit(img, (IW // 2 - img.get_width() // 2, y + 16 - img.get_height() // 2))
        vs = self.text.render("VS", 1, LAVENDER, "s")
        surf.blit(vs, (IW // 2 - vs.get_width() // 2, y + 46))

    def _ult_icon(self, u, x, y, size, label):
        """Ultimate icon box: PixelLab ultimate_icon.png, or a drawn emblem as fallback."""
        base = _readable(u.color)
        self._panel((x, y, size, size), fill=PANEL, trim=base)
        inner = size - 8
        path = f"characters/art/{_art_id(u)}/ultimate_icon.png"
        src = self.sprites.load(path, trim=True)
        if src is not None:
            sw, sh = src.get_size()
            f = inner / max(sw, sh)
            img = self.sprites.scaled(path, sw * f, sh * f, trim=True)
            self.surface.blit(img, (x + (size - img.get_width()) // 2, y + (size - img.get_height()) // 2))
            return
        c = (x + size // 2, y + size // 2)
        h = inner // 2
        diamond = [(c[0], c[1] - h), (c[0] + h, c[1]), (c[0], c[1] + h), (c[0] - h, c[1])]
        pygame.draw.polygon(self.surface, base, diamond)
        pygame.draw.polygon(self.surface, INK, diamond, 2)
        letter = self.text.render(label[:1].upper(), 1, CREAM)
        self.surface.blit(letter, (c[0] - letter.get_width() // 2, c[1] - letter.get_height() // 2))

    def _draw_panels(self):
        surf = self.surface
        top = int(self.ay + self.arena_h + 8 + 12)
        pw = (SAFE_W - 8) // 2
        rows = []
        for u in self.world.mains:
            label = (u.meter or {}).get("label") or (u.hud[0] if u.hud else u.name)
            lines = u.hud[1:] if u.hud and u.hud[0] == label else list(u.hud)
            rows.append((label, []))     # stat lines dropped: nobody reads them mid-fight
        ph = 58 + 20 * max(len(lines) for _, lines in rows) + 4
        for side, u in enumerate(self.world.mains):
            label, lines = rows[side]
            base = _readable(u.color)
            px = SAFE if side == 0 else SAFE + pw + 8
            self._panel((px, top, pw, ph))
            surf.fill(base, (px + 3, top + 3, pw - 6, 2))   # fighter accent line
            act = u.meter_active_fraction(self.world.t)
            self._ult_icon(u, px + 8, top + 10, 40, label)

            # ultimate name, blinking while it is active
            head_col = (CREAM if int(self.t * 8) % 2 else YELLOW) if act > 0 else GOLD
            head = self.text.fit(label.upper(), 1, head_col, pw - 64)
            surf.blit(head, (px + 56, top + 11))

            # segmented SUPER meter
            segs, gap = 8, 2
            mx, my = px + 56, top + 32
            seg_w = (pw - 64 - gap * (segs - 1)) // segs
            frac = act if act > 0 else u.meter_fraction()
            filled = frac * segs
            for i in range(segs):
                r = (mx + i * (seg_w + gap), my, seg_w, 12)
                surf.fill(INK, r)
                part = max(0.0, min(1.0, filled - i))
                if part > 0:
                    col = base
                    if act > 0:
                        col = YELLOW if int(self.t * 12 + i) % 2 else CREAM
                    surf.fill(col if part >= 1 else _shade(col, 0.55),
                              (r[0] + 1, r[1] + 1, seg_w - 2, 10))
                    surf.fill(_mix(col, (255, 255, 255), 0.4), (r[0] + 1, r[1] + 1, seg_w - 2, 2))

            # stat lines
            vals = u.hud_values()
            y = top + 58
            for line in lines:
                try:
                    txt = line.format_map(_Defaults(vals))
                except (ValueError, KeyError):
                    txt = line
                surf.fill(base if u.alive else LAVENDER, (px + 10, y + 5, 5, 5))
                img = self.text.fit(txt, 1, CREAM if u.alive else LAVENDER, pw - 30)
                surf.blit(img, (px + 20, y))
                y += 20

    # ── overlays ─────────────────────────────────────────────────────────

    def _draw_center_text(self, txt, scale, color, pop=1.0, dy=0):
        if pop < 0.08:
            scale = max(1, scale - 2)
        img = self.text.fit(txt, scale, color, self.arena_w - 16)
        cx = self.ax + self.arena_w / 2
        cy = self.ay + self.arena_h / 2 + dy
        self.surface.blit(img, (int(cx - img.get_width() / 2), int(cy - img.get_height() / 2)))

    # ── ultimate casting animation ───────────────────────────────────────

    def _unit(self, uid):
        for u in self.world.units:
            if u.uid == uid:
                return u
        return None

    def _tinted(self, rel, color, w, h, angle=0.0):
        """A white/pale PixelLab effect sprite recoloured to `color` (cached, sizes quantised)."""
        w, h = max(8, int(w) // 6 * 6), max(8, int(h) // 6 * 6)
        angle = int(angle) // 6 * 6 % 360
        key = (rel, tuple(color), w, h, angle)
        img = self._tint_cache.get(key)
        if img is None:
            base = self.sprites.scaled(rel, w, h)
            if base is None:
                return None
            img = pygame.transform.grayscale(base)
            img.fill(_mix(color, (255, 255, 255), 0.35), special_flags=pygame.BLEND_RGB_MULT)
            if angle:
                img = pygame.transform.rotate(img, angle)
            if len(self._tint_cache) > 600:
                self._tint_cache.clear()
            self._tint_cache[key] = img
        return img

    def _char_fx(self, uid_or_unit, kind):
        """characters/art/<id>/<kind>.png for a unit (summons use their owner's art), or None."""
        u = self._unit(uid_or_unit) if isinstance(uid_or_unit, int) else uid_or_unit
        if u is None:
            return None
        path = f"characters/art/{_art_id(u)}/{kind}.png"
        return path if self.sprites.load(path) is not None else None

    def _draw_cast_under(self, u, dt):
        """Behind the caster: a spinning rune circle opening up, and a flame aura while the ult lasts."""
        cx, cy, r = self.sx(u.x), self.sy(u.y), u.radius * self.k
        col = _readable(u.color)
        own_circle = self._char_fx(u, "ult_circle")
        if dt < 1.4 and (own_circle or self.sprites.load("art/fx/magic_circle.png") is not None):
            grow = 1 - (1 - min(1.0, dt / 0.25)) ** 3
            size = r * (1.4 + 1.6 * grow)
            if own_circle:
                img = pygame.transform.rotate(self.sprites.scaled(own_circle, int(size * 2) // 6 * 6,
                                                                  int(size * 2) // 6 * 6), int(dt * 140) // 6 * 6)
            else:
                img = self._tinted("art/fx/magic_circle.png", col, size * 2, size * 2, dt * 140)
            if img is not None:
                img = img.copy()
                img.set_alpha(int(230 * min(1.0, (1.4 - dt) / 0.4)))
                self.surface.blit(img, (int(cx - img.get_width() / 2), int(cy - img.get_height() / 2)))
        active = u.meter_active_fraction(self.world.t) > 0 or dt < 1.2
        own_aura = self._char_fx(u, "ult_aura")
        if active and (own_aura or self.sprites.load("art/fx/aura_flare.png") is not None):
            flick = 1 + 0.08 * math.sin(dt * 31) + 0.05 * math.sin(dt * 53)
            w_, h_ = r * 2.6 * flick, r * 3.4 * flick * min(1.0, dt / 0.15 + 0.3)
            if own_aura:
                img = self.sprites.scaled(own_aura, int(w_) // 6 * 6, int(h_) // 6 * 6)
            else:
                img = self._tinted("art/fx/aura_flare.png", col, w_, h_)
            if img is not None:
                img = img.copy()
                img.set_alpha(175)
                self.surface.blit(img, (int(cx - img.get_width() / 2), int(cy + r * 1.05 - img.get_height())))

    def _draw_cast_over(self, u, dt):
        """Over the caster: sparks rising, the ultimate icon popping above its head, a colour flash."""
        cx, cy, r = self.sx(u.x), self.sy(u.y), u.radius * self.k
        col = _readable(u.color)
        if dt < 1.6 and self.sprites.load("art/fx/energy_spark.png") is not None:
            for i in range(9):
                ph = (dt * 1.6 + i * 0.37) % 1.0
                ang = i * 2.4
                x = cx + math.cos(ang) * r * (0.9 + 0.5 * (i % 3) / 2)
                y = cy + r * 0.8 - ph * r * 3.2
                sz = (10 + 6 * (i % 3)) * self.S * (1 - ph * 0.5)
                img = self._tinted("art/fx/energy_spark.png", _mix(col, (255, 255, 255), 0.4), sz, sz)
                if img is not None:
                    self.surface.blit(img, (int(x - img.get_width() / 2), int(y - img.get_height() / 2)))
        if dt < 0.9:
            path = f"characters/art/{_art_id(u)}/ultimate_icon.png"
            if self.sprites.load(path, trim=True) is not None:
                pop = 1.35 if dt < 0.08 else (1.0 + 0.35 * max(0.0, (0.16 - dt) / 0.08) if dt < 0.16 else 1.0)
                size = 58 * self.S * pop
                img = self.sprites.scaled(path, size, size, trim=True)
                if dt > 0.7:
                    img = img.copy()
                    img.set_alpha(int(255 * (0.9 - dt) / 0.2))
                y = cy - r - 18 * self.S - img.get_height() - 10 * self.S * math.sin(min(1.0, dt / 0.9) * math.pi)
                self.surface.blit(img, (int(cx - img.get_width() / 2), int(y)))
        if dt < 0.12:
            fl = pygame.Surface((IW, IH), pygame.SRCALPHA)
            fl.fill((*col, int(110 * (1 - dt / 0.12))))
            self.surface.blit(fl, (0, 0))

    def _draw_cut_in(self, u, dt, shout):
        """Fighting-game super-move cut-in: a slanted banner slams in from the caster's side with
        a big portrait, the ultimate's name and icon, and racing speed lines. The fight keeps going."""
        if dt >= CUT_IN:
            return
        side = 0 if u.side == self.world.mains[0].side else 1
        sgn = 1 if side == 0 else -1                 # slides in from the caster's side
        if dt < 0.12:
            off = (1 - (dt / 0.12)) ** 2 * IW
            d = -sgn
        elif dt > CUT_IN - 0.15:
            off = ((dt - (CUT_IN - 0.15)) / 0.15) ** 2 * IW
            d = sgn
        else:
            off, d = 0.0, 1
        shift = int(off * d) if dt > CUT_IN - 0.15 else int(-off * sgn)
        bh = int(118 * self.S)
        y0 = int(self.ay + self.arena_h * 0.16)
        skew = int(36 * self.S)
        col = _readable(u.color)
        band = pygame.Surface((IW + 2 * skew, bh + 12), pygame.SRCALPHA)
        pts = [(skew, 6), (IW + 2 * skew, 6), (IW + skew, bh + 6), (0, bh + 6)]
        pygame.draw.polygon(band, (*_shade(u.color, 0.32), 225), pts)
        rng = random.Random(int(dt * 60) // 2)        # speed lines racing across
        for _ in range(14):
            ly = rng.randint(14, bh - 4)
            lx = (rng.randint(0, IW) + int(dt * 2600) * sgn) % (IW + 2 * skew)
            ln = rng.randint(40, 140)
            pygame.draw.line(band, (*_mix(col, (255, 255, 255), 0.5), 120), (lx, ly), (lx + ln * sgn, ly), 2)
        pygame.draw.line(band, (*col, 255), (skew, 6), (IW + 2 * skew, 6), 5)
        pygame.draw.line(band, (*col, 255), (0, bh + 6), (IW + skew, bh + 6), 5)
        self.surface.blit(band, (-skew + shift, y0 - 6))

        # big portrait on the caster's side, popping out of the band
        ph = int(bh * 1.35)
        path = self._body_sprite_path(u)
        src = self.sprites.load(path, trim=True)
        px = SAFE + 70 * self.S if side == 0 else IW - SAFE - 70 * self.S
        if src is not None:
            sw, sh = src.get_size()
            f = ph / max(sw, sh)
            img = self.sprites.scaled(path, sw * f, sh * f, trim=True)
            if side == 1:
                img = pygame.transform.flip(img, True, False)
            self.surface.blit(img, (int(px - img.get_width() / 2 + shift), int(y0 + bh - img.get_height() + 6)))
        else:                                     # no body art yet: the drawn token, big
            self._draw_token(u, px + shift, y0 + bh / 2, ph * 0.42, status=False)
        # the ultimate's name, big, plus its icon
        tx0, tx1 = (px + 80 * self.S, IW - SAFE - 8) if side == 0 else (SAFE + 8, px - 80 * self.S)
        icon_sz = int(40 * self.S)
        name = self.text.fit(shout.upper(), 4, YELLOW, tx1 - tx0)
        line2 = self.text.fit(u.name.upper() + " ULTIMATE", 1, CREAM, tx1 - tx0 - icon_sz - 6)
        tx = int(tx0 + (tx1 - tx0 - name.get_width()) / 2) + shift
        ty = int(y0 + bh / 2 - (name.get_height() + icon_sz) / 2)
        jitter = int(self.fx_rng.uniform(-2, 2)) if dt < 0.3 else 0
        self.surface.blit(name, (tx + jitter, ty + jitter))
        ipath = f"characters/art/{_art_id(u)}/ultimate_icon.png"
        ly = ty + name.get_height() + 2
        lx = int(tx0 + (tx1 - tx0 - icon_sz - 6 - line2.get_width()) / 2) + shift
        if self.sprites.load(ipath, trim=True) is not None:
            self.surface.blit(self.sprites.scaled(ipath, icon_sz, icon_sz, trim=True), (lx, ly))
        self.surface.blit(line2, (lx + icon_sz + 6, ly + (icon_sz - line2.get_height()) // 2))

    # ── battle royale: arena props, HUD, intro ──────────────────────────

    ITEM_COLORS = {"potion": (230, 60, 70), "power": (255, 150, 40), "boots": (80, 200, 255),
                   "shield": (110, 160, 255), "bomb": (40, 40, 48), "fire": (255, 110, 30),
                   "freeze": (150, 220, 255), "lightning": (255, 230, 60)}
    TIER_GLOW = {"common": (255, 255, 255), "rare": (90, 160, 255), "epic": (255, 200, 40)}

    def _draw_hazards(self):
        for hz in self.world.hazards:
            self._draw_hazard(hz)

    def _draw_hazards_old(self):
        t = self.t if self.phase != "intro" else self.intro_t
        for hz in self.world.hazards:
            cx, cy, r = self.sx(hz["x"]), self.sy(hz["y"]), hz["r"] * self.k
            pygame.draw.circle(self.surface, (90, 20, 10), (cx, cy), r + 4 * self.S)
            pygame.draw.circle(self.surface, (230, 80, 20), (cx, cy), r)
            pygame.draw.circle(self.surface, (255, 170, 40), (cx, cy), r * 0.62)
            rng = random.Random(int(hz["x"] * 7 + hz["y"]))
            for i in range(6):                     # bubbles popping
                ph = (t * 1.3 + rng.random()) % 1.0
                a = rng.uniform(0, 2 * math.pi)
                d = rng.uniform(0, r * 0.75)
                pygame.draw.circle(self.surface, (255, 230, 120),
                                   (cx + math.cos(a) * d, cy + math.sin(a) * d), max(1, (2 + 4 * ph) * self.S), 1)

    def _draw_terrain(self):
        for o in self.world.terrain:
            self._draw_blocker(o)

    def _draw_terrain_old(self):
        for o in self.world.terrain:
            if o["shape"] == "circle":
                cx, cy, r = self.sx(o["x"]), self.sy(o["y"]), o["r"] * self.k
                pygame.draw.circle(self.surface, (40, 34, 30), (cx + 3 * self.S, cy + 5 * self.S), r)  # shadow
                pygame.draw.circle(self.surface, (120, 110, 100), (cx, cy), r)
                pygame.draw.circle(self.surface, (160, 150, 138), (cx - r * 0.25, cy - r * 0.25), r * 0.55)
                pygame.draw.circle(self.surface, INK, (cx, cy), r, max(2, int(3 * self.S)))
                pygame.draw.line(self.surface, (80, 72, 66), (cx - r * 0.2, cy + r * 0.1),
                                 (cx + r * 0.35, cy + r * 0.45), max(1, int(2 * self.S)))
            else:
                x, y = self.sx(o["x"]), self.sy(o["y"])
                w, h = o["w"] * self.k, o["h"] * self.k
                pygame.draw.rect(self.surface, (40, 34, 30), (x + 3 * self.S, y + 5 * self.S, w, h))
                pygame.draw.rect(self.surface, (125, 115, 108), (x, y, w, h))
                brick = 14 * self.S
                for row in range(int(h // brick) + 1):   # stone blocks
                    yy = y + row * brick
                    pygame.draw.line(self.surface, (90, 82, 76), (x, yy), (x + w, yy), 1)
                    off = (row % 2) * brick
                    xx = x + off
                    while xx < x + w:
                        pygame.draw.line(self.surface, (90, 82, 76), (xx, yy), (xx, min(y + h, yy + brick)), 1)
                        xx += brick * 2
                pygame.draw.rect(self.surface, INK, (x, y, w, h), max(2, int(3 * self.S)))

    def _draw_item(self, kind, cx, cy, size):
        """Simple drawn pickup icons (PixelLab art can replace these later: art/items/<kind>.png)."""
        path = f"art/items/{kind}.png"
        if self.sprites.load(path) is not None:
            img = self.sprites.scaled(path, size * 2, size * 2)
            self.surface.blit(img, (int(cx - img.get_width() / 2), int(cy - img.get_height() / 2)))
            return
        s, surf, ow = size, self.surface, max(2, int(2 * self.S))
        if kind == "potion":
            pygame.draw.circle(surf, (230, 60, 70), (cx, cy + s * 0.2), s * 0.62)
            pygame.draw.rect(surf, (200, 200, 210), (cx - s * 0.18, cy - s * 0.75, s * 0.36, s * 0.45))
            pygame.draw.circle(surf, (255, 170, 170), (cx - s * 0.2, cy), s * 0.16)
            pygame.draw.circle(surf, INK, (cx, cy + s * 0.2), s * 0.62, ow)
        elif kind == "power":
            pts = [(cx, cy - s), (cx + s * 0.22, cy + s * 0.35), (cx - s * 0.22, cy + s * 0.35)]
            pygame.draw.polygon(surf, (255, 200, 80), pts)
            pygame.draw.polygon(surf, INK, pts, ow)
            pygame.draw.rect(surf, (255, 120, 30), (cx - s * 0.5, cy + s * 0.35, s, s * 0.18))
            pygame.draw.rect(surf, (120, 70, 30), (cx - s * 0.1, cy + s * 0.5, s * 0.2, s * 0.45))
        elif kind == "boots":
            pts = [(cx - s * 0.35, cy - s * 0.7), (cx + s * 0.1, cy - s * 0.7), (cx + s * 0.1, cy + s * 0.1),
                   (cx + s * 0.7, cy + s * 0.3), (cx + s * 0.7, cy + s * 0.6), (cx - s * 0.35, cy + s * 0.6)]
            pygame.draw.polygon(surf, (80, 200, 255), pts)
            pygame.draw.polygon(surf, INK, pts, ow)
            pygame.draw.line(surf, (255, 255, 255), (cx - s * 0.75, cy - s * 0.2), (cx - s * 0.45, cy - s * 0.2), ow)
        elif kind == "shield":
            pts = [(cx - s * 0.6, cy - s * 0.6), (cx + s * 0.6, cy - s * 0.6), (cx + s * 0.6, cy),
                   (cx, cy + s * 0.75), (cx - s * 0.6, cy)]
            pygame.draw.polygon(surf, (110, 160, 255), pts)
            pygame.draw.polygon(surf, INK, pts, ow)
            pygame.draw.line(surf, (230, 240, 255), (cx, cy - s * 0.45), (cx, cy + s * 0.5), ow)
        elif kind == "fire":
            pygame.draw.line(surf, (120, 70, 40), (cx - s * 0.5, cy + s * 0.7), (cx + s * 0.2, cy - s * 0.1), ow + 1)
            pygame.draw.circle(surf, (255, 110, 30), (cx + s * 0.3, cy - s * 0.3), s * 0.45)
            pygame.draw.circle(surf, (255, 220, 90), (cx + s * 0.3, cy - s * 0.3), s * 0.22)
        elif kind == "freeze":
            for k in range(3):
                a = k * math.pi / 3
                dx, dy = math.cos(a) * s * 0.85, math.sin(a) * s * 0.85
                pygame.draw.line(surf, (150, 220, 255), (cx - dx, cy - dy), (cx + dx, cy + dy), ow + 1)
            pygame.draw.circle(surf, (240, 250, 255), (cx, cy), s * 0.25)
        elif kind == "lightning":
            pts = [(cx + s * 0.1, cy - s * 0.9), (cx - s * 0.45, cy + s * 0.1), (cx, cy + s * 0.05),
                   (cx - s * 0.15, cy + s * 0.9), (cx + s * 0.5, cy - s * 0.15), (cx + s * 0.05, cy - s * 0.1)]
            pygame.draw.polygon(surf, (255, 230, 60), pts)
            pygame.draw.polygon(surf, INK, pts, ow)
        else:  # bomb
            pygame.draw.circle(surf, (40, 40, 48), (cx, cy + s * 0.1), s * 0.62)
            pygame.draw.circle(surf, (110, 110, 125), (cx - s * 0.2, cy - s * 0.1), s * 0.15)
            pygame.draw.line(surf, (160, 120, 70), (cx + s * 0.3, cy - s * 0.4), (cx + s * 0.55, cy - s * 0.75), ow)
            if int(self.t * 10) % 2 == 0:
                pygame.draw.circle(surf, (255, 220, 80), (cx + s * 0.58, cy - s * 0.8), s * 0.16)

    def _draw_items(self):
        for it in self.world.items:
            age = self.t - it["t"]
            pop = min(1.0, age / 0.2)
            cx, cy = self.sx(it["x"]), self.sy(it["y"]) - 4 * self.S * math.sin(self.t * 5 + it["x"])
            glow = 22 * self.S * (1 + 0.15 * math.sin(self.t * 8))
            tier = ITEMS[it["kind"]].get("tier", "common")
            col = self.TIER_GLOW[tier]
            if tier == "epic":
                glow *= 1.35
            g = pygame.Surface((int(glow * 2.4), int(glow * 2.4)), pygame.SRCALPHA)
            pygame.draw.circle(g, (*col, 110 if tier != "common" else 70), (g.get_width() // 2, g.get_height() // 2), glow)
            if tier == "epic":   # rotating sparkle rays
                for k in range(4):
                    a = self.t * 3 + k * math.pi / 2
                    c0 = g.get_width() / 2
                    pygame.draw.line(g, (*col, 200), (c0, c0), (c0 + math.cos(a) * glow * 1.15, c0 + math.sin(a) * glow * 1.15), 2)
            self.surface.blit(g, (int(cx - g.get_width() / 2), int(cy - g.get_height() / 2)))
            self._draw_item(it["kind"], cx, cy, 15 * self.S * pop)

    def _draw_storm(self):
        sr = self.world.storm_radius()
        if sr is None:
            return
        cx, cy = self.sx(self.world.W / 2), self.sy(self.world.H / 2)
        r = sr * self.k
        if r > self.arena_w * 0.75:
            return
        aw, ah = int(self.arena_w), int(self.arena_h)
        ov = pygame.Surface((aw, ah), pygame.SRCALPHA)
        ov.fill((120, 40, 200, 95))
        pygame.draw.circle(ov, (0, 0, 0, 0), (int(cx - self.ax), int(cy - self.ay)), int(r))
        self.surface.blit(ov, (self.ax, self.ay))
        edge = _mix((190, 120, 255), (255, 255, 255), 0.5 + 0.5 * math.sin(self.t * 9))
        clip = self.surface.get_clip()
        self.surface.set_clip(pygame.Rect(int(self.ax), int(self.ay), aw, ah))
        pygame.draw.circle(self.surface, edge, (cx, cy), r, max(2, int(4 * self.S)))
        self.surface.set_clip(clip)

    def _draw_mini_bar(self, u):
        r = u.radius * self.k
        w, h = max(26, r * 2.0), max(5, int(6 * self.S))
        x, y = self.sx(u.x) - w / 2, self.sy(u.y) - r - h - 9 * self.S
        frac = max(0.0, u.hp) / u.max_hp
        self.surface.fill(INK, (x - 1, y - 1, w + 2, h + 2))
        self.surface.fill((60, 20, 24), (x, y, w, h))
        col = (90, 220, 90) if frac > 0.5 else ((255, 200, 60) if frac > 0.25 else (240, 60, 60))
        if self.soccer and u.is_main:     # team-coloured bars: which side a player is on at a glance
            col = self.team_color(u.side)
            self.surface.fill(col, (x - 3, y - 3, w + 6, h + 6))
            self.surface.fill(INK, (x - 1, y - 1, w + 2, h + 2))
            self.surface.fill((60, 20, 24), (x, y, w, h))
            col = _mix(col, (255, 255, 255), 0.25)
        self.surface.fill(col, (x, y, w * frac, h))

    def _draw_royale_hud(self):
        surf = self.surface
        w = self.world
        alive = sum(1 for m in w.mains if m.alive or any(u.alive and u.side == m.side for u in w.units))
        title = self.text.render("BATTLE ROYALE", 2, YELLOW)
        surf.blit(title, (SAFE + 4, HUD_Y - 26))
        rem = self.text.render(f"{alive} LEFT", 2, CREAM if alive > 2 else RED_HI)
        surf.blit(rem, (IW - SAFE - rem.get_width() - 4, HUD_Y - 26))
        sr = w.storm_radius()
        if w.storm and self.phase == "fight" and not w.done:
            a = float(w.storm.get("start", 6))
            msg = (f"STORM IN {max(0, math.ceil(a - w.t))}" if w.t < a else "STORM CLOSING!")
            st = self.text.render(msg, 1, (200, 150, 255))
            surf.blit(st, (SAFE + 4, HUD_Y + 4))
        # kill feed: newest 3
        y = HUD_Y + 24
        for name, killer, t0, col in self.elims[-3:][::-1]:
            age = self.t - t0
            if age > 4:
                continue
            txt = f"{killer} > {name}" if killer else f"{name} fell"
            img = self.text.fit(txt.upper(), 1, CREAM, SAFE_W - 8)
            if age > 3.4:
                img = img.copy()
                img.set_alpha(int(255 * (4 - age) / 0.6))
            surf.fill((*NIGHT,), (SAFE, y - 2, img.get_width() + 12, img.get_height() + 4))
            pygame.draw.rect(surf, col, (SAFE, y - 2, 4, img.get_height() + 4))
            surf.blit(img, (SAFE + 8, y))
            y += img.get_height() + 6

    def _draw_royale_panels(self):
        surf = self.surface
        w = self.world
        n = len(w.mains)
        cols = min(n, 6)                         # one compact row (two rows only past 6 fighters)
        top = int(self.ay + self.arena_h + 12)
        gw = (SAFE_W - (cols - 1) * 4) // cols
        gh = 58
        place = {side: n - i for i, side in enumerate(w.placements)}   # first out = last place
        for i, m in enumerate(w.mains):
            x = SAFE + (i % cols) * (gw + 4)
            y = top + (i // cols) * (gh + 4)
            out = not m.alive and not any(u.alive and u.side == m.side for u in w.units)
            self._panel((x, y, gw, gh), trim=_readable(m.color) if not out else (70, 70, 80))
            self._draw_token(m, x + gw // 2, y + 22, 15, status=False)
            bw = gw - 12
            frac = max(0.0, m.hp) / m.max_hp if m.alive else 0.0
            surf.fill(INK, (x + 6, y + gh - 15, bw, 9))
            surf.fill((90, 220, 90) if frac > 0.5 else ((255, 200, 60) if frac > 0.25 else (240, 60, 60)),
                      (x + 7, y + gh - 14, (bw - 2) * frac, 7))
            k = w.kills.get(m.side, 0)
            if k:
                kt = self.text.render(f"{k}K", 1, YELLOW)
                surf.blit(kt, (x + gw - kt.get_width() - 4, y + 4))
            if out:
                cx_, cy_ = x + gw // 2, y + 22
                pygame.draw.line(surf, RED_HI, (cx_ - 14, cy_ - 14), (cx_ + 14, cy_ + 14), 4)
                pygame.draw.line(surf, RED_HI, (cx_ + 14, cy_ - 14), (cx_ - 14, cy_ + 14), 4)
                if m.side in place:
                    pt = self.text.render(f"#{place[m.side]}", 1, CREAM)
                    surf.blit(pt, (x + 4, y + 4))

    def _intro_royale(self, p, black):
        """Everyone crashes down from the sky one after another (BOOM BOOM BOOM...), then the
        title slams in: BATTLE ROYALE, N fighters, 1 survivor."""
        mains = self.world.mains
        hits = INTRO_STYLES["royale"]["hits"]
        for i, m in enumerate(mains):
            h = hits[min(i, len(hits) - 1)][0]
            x1, y1 = self.sx(m.x), self.sy(m.y)
            r = m.radius * self.k
            since = p - h
            if since < 0:                       # falling with a growing shadow
                e = max(0.0, 1 + since / 0.3)   # 0.3 s fall
                if e <= 0:
                    continue
                sh = pygame.Rect(0, 0, int(r * 2 * (0.3 + 0.7 * e)), int(r * 0.6 * (0.3 + 0.7 * e)))
                sh.center = (int(x1), int(y1 + r * 0.9))
                pygame.draw.ellipse(self.surface, (0, 0, 0), sh)
                y = y1 - (1 - e * e) * self.arena_h * 0.6
                pygame.draw.line(self.surface, CREAM, (x1, y - r * 1.2), (x1, y - r * 3), max(2, int(3 * self.S)))
                self._token_squash(m, x1, y, r, 0.8, 1.3)
                continue
            if since < 0.35:                    # dust ring
                k = since / 0.35
                ring = pygame.Rect(0, 0, int(r * (2 + 3 * k)), int(r * (0.7 + 1.0 * k)))
                ring.center = (int(x1), int(y1 + r * 0.8))
                pygame.draw.ellipse(self.surface, _mix((230, 210, 180), (90, 80, 70), k), ring,
                                    max(2, int(6 * (1 - k) * self.S)))
            sq = max(0.0, 1 - since / 0.12)
            self._token_squash(m, x1, y1 + r * 0.3 * sq, r, 1 + 0.45 * sq, 1 - 0.35 * sq)
            self._fx_word("BOOM!", x1, y1 - r * 2, since, 1, YELLOW, 0.25)
        last = hits[min(len(mains), len(hits)) - 1][0]
        dt = p - last - 0.08
        if dt >= 0:
            sc = 7 if dt < 0.04 else (6 if dt < 0.08 else 5)
            t1 = self.text.fit("BATTLE ROYALE", sc, YELLOW, self.arena_w - 16)
            self.surface.blit(t1, (int(self.ax + self.arena_w / 2 - t1.get_width() / 2), int(self.ay + self.arena_h * 0.3)))
            t2 = self.text.render(f"{len(mains)} FIGHTERS . 1 SURVIVOR", 2, CREAM)
            self.surface.blit(t2, (int(self.ax + self.arena_w / 2 - t2.get_width() / 2),
                                   int(self.ay + self.arena_h * 0.3 + t1.get_height() + 6)))
            if self.theme.get("stage"):
                st = self.text.fit(self.theme["stage"].upper(), 1, GOLD, self.arena_w - 20)
                self.surface.blit(st, (int(self.ax + self.arena_w / 2 - st.get_width() / 2), int(self.ay + self.arena_h - 30)))

    # ── royale themes: blockers, hazards, ball, freeze, lightning ────────

    def _draw_blocker(self, o):
        """Theme blockers drawn top-down in code (PixelLab sprites can replace them later:
        art/terrain/<kind>.png, stretched to the blocker's box)."""
        kind = o.get("kind", "rock")
        S, surf, ow = self.S, self.surface, max(2, int(3 * self.S))
        if o["shape"] == "circle":
            cx, cy, r = self.sx(o["x"]), self.sy(o["y"]), o["r"] * self.k
            box = pygame.Rect(int(cx - r), int(cy - r), int(2 * r), int(2 * r))
        else:
            box = pygame.Rect(int(self.sx(o["x"])), int(self.sy(o["y"])), int(o["w"] * self.k), int(o["h"] * self.k))
            cx, cy, r = box.centerx, box.centery, min(box.w, box.h) / 2
        art_kind = o.get("kind") or ("rock" if o["shape"] == "circle" else "wall")   # fixed maps: rocks / walls
        path = f"art/terrain/{art_kind}.png"
        src = self.sprites.load(path, trim=True)   # trimmed: the art fills the real collision box
        if src is not None:
            sw, sh = src.get_size()
            turn = (sw > sh * 1.2 and box.h > box.w * 1.2) or (sh > sw * 1.2 and box.w > box.h * 1.2)
            if turn:   # sprite drawn the other way round: rotate it to fit the box
                img = pygame.transform.rotate(self.sprites.scaled(path, box.h, box.w, trim=True), 90)
            else:
                img = self.sprites.scaled(path, box.w, box.h, trim=True)
            surf.blit(img, box.topleft)
            return
        pygame.draw.rect(surf, (0, 0, 0), box.move(int(3 * S), int(5 * S)), border_radius=int(r * 0.5)) \
            if o["shape"] == "rect" else pygame.draw.circle(surf, (30, 26, 24), (cx + 3 * S, cy + 5 * S), r)
        if kind == "post":
            pygame.draw.circle(surf, (250, 250, 250), (cx, cy), r)
            pygame.draw.circle(surf, INK, (cx, cy), r, max(1, int(2 * S)))
            return
        if kind == "tombstone":
            pygame.draw.rect(surf, (130, 130, 140), box, border_top_left_radius=box.w // 2, border_top_right_radius=box.w // 2)
            pygame.draw.rect(surf, INK, box, ow, border_top_left_radius=box.w // 2, border_top_right_radius=box.w // 2)
            pygame.draw.line(surf, (90, 90, 100), (cx, box.y + box.h * 0.3), (cx, box.y + box.h * 0.7), ow)
            pygame.draw.line(surf, (90, 90, 100), (cx - box.w * 0.2, box.y + box.h * 0.42), (cx + box.w * 0.2, box.y + box.h * 0.42), ow)
        elif kind == "crypt":
            pygame.draw.rect(surf, (95, 92, 105), box)
            pygame.draw.polygon(surf, (70, 66, 80), [box.topleft, box.topright, (box.right - box.w * 0.15, box.y + box.h * 0.3),
                                                      (box.x + box.w * 0.15, box.y + box.h * 0.3)])
            pygame.draw.rect(surf, (25, 20, 30), (cx - box.w * 0.15, box.y + box.h * 0.5, box.w * 0.3, box.h * 0.5))
            pygame.draw.rect(surf, INK, box, ow)
        elif kind == "dead_tree":
            pygame.draw.circle(surf, (70, 50, 40), (cx, cy), r * 0.45)
            for a in range(6):
                ang = a * 1.05 + 0.3
                pygame.draw.line(surf, (60, 42, 32), (cx, cy), (cx + math.cos(ang) * r, cy + math.sin(ang) * r), ow + 1)
            pygame.draw.circle(surf, INK, (cx, cy), r * 0.45, ow)
        elif kind == "car":
            col = [(200, 50, 50), (50, 110, 210), (230, 190, 40), (230, 230, 235)][int(o["x"] + o["y"]) % 4]
            pygame.draw.rect(surf, col, box, border_radius=int(r * 0.5))
            inner = box.inflate(-box.w * 0.25, -box.h * 0.45)
            pygame.draw.rect(surf, (40, 60, 80), inner, border_radius=int(r * 0.3))
            pygame.draw.rect(surf, INK, box, ow, border_radius=int(r * 0.5))
        elif kind == "dumpster":
            pygame.draw.rect(surf, (40, 120, 70), box)
            pygame.draw.line(surf, (25, 80, 45), (box.x, cy), (box.right, cy), ow)
            pygame.draw.rect(surf, INK, box, ow)
        elif kind == "hydrant":
            pygame.draw.circle(surf, (220, 40, 40), (cx, cy), r)
            pygame.draw.circle(surf, (250, 200, 200), (cx - r * 0.3, cy - r * 0.3), r * 0.3)
            pygame.draw.circle(surf, INK, (cx, cy), r, ow)
        elif kind == "sandbags":
            n = max(2, int(max(box.w, box.h) / (22 * S)))
            horiz = box.w >= box.h
            for i in range(n):
                seg = box.w / n if horiz else box.h / n
                bx = pygame.Rect(box.x + i * seg, box.y, seg, box.h) if horiz else pygame.Rect(box.x, box.y + i * seg, box.w, seg)
                pygame.draw.ellipse(surf, (185, 165, 115), bx)
                pygame.draw.ellipse(surf, INK, bx, max(1, ow - 1))
        elif kind == "crate":
            pygame.draw.rect(surf, (170, 120, 60), box)
            pygame.draw.line(surf, (110, 75, 35), box.topleft, box.bottomright, ow)
            pygame.draw.line(surf, (110, 75, 35), box.topright, box.bottomleft, ow)
            pygame.draw.rect(surf, INK, box, ow)
        elif kind == "barrel":
            pygame.draw.circle(surf, (190, 70, 40), (cx, cy), r)
            pygame.draw.circle(surf, (120, 40, 25), (cx, cy), r * 0.7, max(1, ow - 1))
            pygame.draw.circle(surf, INK, (cx, cy), r, ow)
        elif kind == "sky_rock":
            pygame.draw.circle(surf, (140, 120, 100), (cx, cy), r)
            pygame.draw.circle(surf, (90, 170, 80), (cx - r * 0.1, cy - r * 0.2), r * 0.75)
            pygame.draw.circle(surf, INK, (cx, cy), r, ow)
        elif kind == "cloud":
            for dx, dy, k in ((-0.45, 0.1, 0.6), (0.45, 0.1, 0.6), (0, -0.15, 0.75), (0, 0.25, 0.6)):
                pygame.draw.circle(surf, (250, 252, 255), (cx + dx * r, cy + dy * r), r * k)
            pygame.draw.circle(surf, (200, 215, 235), (cx, cy + r * 0.35), r * 0.45)
        elif kind == "goal":
            pygame.draw.rect(surf, (240, 240, 240), box, ow + 2)
            for i in range(1, 6):
                x = box.x + box.w * i / 6
                pygame.draw.line(surf, (200, 200, 210), (x, box.y), (x, box.bottom), 1)
            pygame.draw.line(surf, (200, 200, 210), (box.x, cy), (box.right, cy), 1)
        elif kind == "cone":
            pygame.draw.circle(surf, (255, 130, 30), (cx, cy), r)
            pygame.draw.circle(surf, (255, 255, 255), (cx, cy), r * 0.5, max(1, ow - 1))
            pygame.draw.circle(surf, INK, (cx, cy), r, max(1, ow - 1))
        elif kind == "bench":
            pygame.draw.rect(surf, (60, 90, 160), box)
            pygame.draw.rect(surf, (230, 230, 240), box.inflate(-6, -box.h * 0.6))
            pygame.draw.rect(surf, INK, box, ow)
        elif kind == "net":
            pygame.draw.rect(surf, (220, 40, 40), box, ow + 2)
            for i in range(1, 5):
                pygame.draw.line(surf, (235, 235, 240), (box.x + box.w * i / 5, box.y), (box.x + box.w * i / 5, box.bottom), 1)
                pygame.draw.line(surf, (235, 235, 240), (box.x, box.y + box.h * i / 5), (box.right, box.y + box.h * i / 5), 1)
        elif kind == "boards":
            pygame.draw.rect(surf, (245, 245, 250), box)
            stripe = box.inflate(0, -box.h * 0.6) if box.w > box.h else box.inflate(-box.w * 0.6, 0)
            pygame.draw.rect(surf, (230, 200, 40), stripe)
            pygame.draw.rect(surf, INK, box, ow)
        elif o["shape"] == "circle":   # rocky canyon / pillar hall rocks
            pygame.draw.circle(surf, (120, 110, 100), (cx, cy), r)
            pygame.draw.circle(surf, (160, 150, 138), (cx - r * 0.25, cy - r * 0.25), r * 0.55)
            pygame.draw.circle(surf, INK, (cx, cy), r, ow)
        else:                          # lava ruins stone walls
            pygame.draw.rect(surf, (125, 115, 108), box)
            brick = 14 * S
            for row in range(int(box.h // brick) + 1):
                yy = box.y + row * brick
                pygame.draw.line(surf, (90, 82, 76), (box.x, yy), (box.right, yy), 1)
            pygame.draw.rect(surf, INK, box, ow)

    def _hazard_sprite(self, name, size, alpha=255, angle=0.0, flip=False, sy=1.0):
        """Blit a PixelLab floor effect centred at the hazard; returns False if the art is missing."""
        path = f"art/hazards/{name}.png"
        if self.sprites.load(path) is None:
            return None
        img = self.sprites.scaled(path, int(size) // 4 * 4, int(size * sy) // 4 * 4)
        if flip:
            img = pygame.transform.flip(img, True, False)
        if angle:
            img = pygame.transform.rotate(img, int(angle) // 6 * 6)
        if alpha < 255:
            img = img.copy()
            img.set_alpha(alpha)
        return img

    def _draw_hazard(self, hz):
        t = self.t if self.phase != "intro" else self.intro_t
        kind = hz.get("type", "lava")
        cx, cy, r = self.sx(hz["x"]), self.sy(hz["y"]), hz["r"] * self.k
        surf, S = self.surface, self.S
        art = None
        if kind == "lava":        # slow molten pulse
            art = [self._hazard_sprite("lava", r * 2.3 * (1 + 0.03 * math.sin(t * 4)))]
        elif kind == "fire":      # flicker: flip + stretch
            art = [self._hazard_sprite("fire_b", r * 2.3, flip=int(t * 8) % 2 == 0, sy=1 + 0.08 * math.sin(t * 17))]
        elif kind == "fog":       # two see-through layers turning against each other
            art = [self._hazard_sprite("fog", r * 2.5 * (1 + 0.05 * math.sin(t * 2)), 140, t * 25),
                   self._hazard_sprite("fog", r * 2.1, 110, -t * 35 + 40)]
        elif kind == "ice_hole":
            art = [self._hazard_sprite("ice_hole", r * 2.3)]
        elif kind == "wind":
            art = [self._hazard_sprite("wind", r * 2.0, 150, -t * 220)]
        elif kind == "mine":
            alive = hz.get("alive", True)
            art = [self._hazard_sprite("mine", r * 2.6) if alive else self._hazard_sprite("crater", r * 3.4)]
        if art and all(a is not None for a in art):
            for img in art:
                surf.blit(img, (int(cx - img.get_width() / 2), int(cy - img.get_height() / 2)))
            if kind == "mine" and hz.get("alive", True) and int(t * 3 + hz["x"]) % 2 == 0:
                g = pygame.Surface((int(r * 3), int(r * 3)), pygame.SRCALPHA)
                pygame.draw.circle(g, (255, 40, 40, 110), (g.get_width() // 2, g.get_height() // 2), r * 1.3)
                surf.blit(g, (int(cx - g.get_width() / 2), int(cy - g.get_height() / 2)))
            return
        rng = random.Random(int(hz["x"] * 7 + hz["y"]))
        if kind == "lava":
            pygame.draw.circle(surf, (90, 20, 10), (cx, cy), r + 4 * S)
            pygame.draw.circle(surf, (230, 80, 20), (cx, cy), r)
            pygame.draw.circle(surf, (255, 170, 40), (cx, cy), r * 0.62)
            for i in range(6):
                ph = (t * 1.3 + rng.random()) % 1.0
                a, d = rng.uniform(0, 2 * math.pi), rng.uniform(0, r * 0.75)
                pygame.draw.circle(surf, (255, 230, 120), (cx + math.cos(a) * d, cy + math.sin(a) * d),
                                   max(1, (2 + 4 * ph) * S), 1)
        elif kind == "fire":   # a burning wreck
            pygame.draw.circle(surf, (60, 40, 30), (cx, cy), r)
            for i in range(9):
                a = rng.uniform(0, 2 * math.pi)
                d = rng.uniform(0, r * 0.8)
                fl = 0.6 + 0.4 * math.sin(t * 14 + i * 1.7)
                x, y = cx + math.cos(a) * d, cy + math.sin(a) * d
                h = r * 0.45 * fl
                pygame.draw.polygon(surf, (255, 120, 30), [(x - h * 0.4, y), (x + h * 0.4, y), (x, y - h)])
                pygame.draw.polygon(surf, (255, 220, 80), [(x - h * 0.2, y), (x + h * 0.2, y), (x, y - h * 0.55)])
        elif kind == "fog":
            g = pygame.Surface((int(r * 2.4), int(r * 2.4)), pygame.SRCALPHA)
            for i in range(7):
                a = rng.uniform(0, 2 * math.pi) + t * 0.6 * (1 if i % 2 else -1)
                d = rng.uniform(0, r * 0.55)
                pygame.draw.circle(g, (120, 230, 140, 55), (g.get_width() / 2 + math.cos(a) * d,
                                                            g.get_height() / 2 + math.sin(a) * d), r * 0.55)
            surf.blit(g, (int(cx - g.get_width() / 2), int(cy - g.get_height() / 2)))
        elif kind == "wind":
            g = pygame.Surface((int(r * 2), int(r * 2)), pygame.SRCALPHA)
            pygame.draw.circle(g, (255, 255, 255, 35), (r, r), r)
            surf.blit(g, (int(cx - r), int(cy - r)))
            dx, dy = math.cos(hz["dir"]), math.sin(hz["dir"])
            for i in range(6):
                ph = (t * 1.6 + i / 6) % 1.0
                off = (i - 2.5) * r * 0.3
                px = cx - dx * r * 0.8 + dx * ph * r * 1.6 - dy * off
                py = cy - dy * r * 0.8 + dy * ph * r * 1.6 + dx * off
                pygame.draw.line(surf, (240, 250, 255), (px, py), (px - dx * r * 0.35, py - dy * r * 0.35), max(2, int(3 * S)))
        elif kind == "ice_hole":
            pygame.draw.circle(surf, (20, 60, 120), (cx, cy), r)
            pygame.draw.circle(surf, (60, 120, 190), (cx, cy), r * 0.7)
            for i in range(7):
                a = rng.uniform(0, 2 * math.pi)
                pygame.draw.line(surf, (240, 250, 255), (cx + math.cos(a) * r, cy + math.sin(a) * r),
                                 (cx + math.cos(a) * r * 1.4, cy + math.sin(a) * r * 1.4), max(1, int(2 * S)))
            pygame.draw.circle(surf, (230, 245, 255), (cx, cy), r, max(2, int(3 * S)))
        elif kind == "mine":
            if hz.get("alive", True) or self._mine_alive(hz):
                pygame.draw.circle(surf, (70, 75, 60), (cx, cy), r)
                pygame.draw.circle(surf, INK, (cx, cy), r, max(1, int(2 * S)))
                if int(t * 3 + hz["x"]) % 2 == 0:
                    pygame.draw.circle(surf, (255, 40, 40), (cx, cy), r * 0.35)
            else:
                pygame.draw.circle(surf, (50, 40, 34), (cx, cy), r * 1.6)   # crater
                pygame.draw.circle(surf, (30, 24, 20), (cx, cy), r * 0.9)

    def _mine_alive(self, hz):
        """The world's copy of a mine (render reads the live world state)."""
        for h in self.world.hazards:
            if h is hz:
                return h.get("alive", True)
        return True

    def _draw_balls(self):
        for b in self.world.balls:
            cx, cy, r = self.sx(b["x"]), self.sy(b["y"]), b["r"] * self.k
            pygame.draw.ellipse(self.surface, (0, 0, 0), (cx - r, cy + r * 0.6, r * 2, r * 0.7))
            sp = math.hypot(b["vx"], b["vy"])
            if sp > 300:   # motion streak so a fast ball is easy to follow
                dx, dy = b["vx"] / sp, b["vy"] / sp
                for i, a in ((3, 50), (2, 90), (1, 140)):
                    g = pygame.Surface((int(r * 2.2), int(r * 2.2)), pygame.SRCALPHA)
                    pygame.draw.circle(g, (255, 255, 255, a), (g.get_width() // 2, g.get_height() // 2), r * (1 - i * 0.12))
                    self.surface.blit(g, (int(cx - dx * r * 0.9 * i - g.get_width() / 2), int(cy - dy * r * 0.9 * i - g.get_height() / 2)))
            glow = pygame.Surface((int(r * 3), int(r * 3)), pygame.SRCALPHA)   # soft halo: pops on grass
            pygame.draw.circle(glow, (255, 255, 230, 70), (glow.get_width() // 2, glow.get_height() // 2), r * 1.45)
            self.surface.blit(glow, (int(cx - glow.get_width() / 2), int(cy - glow.get_height() / 2)))
            if self.sprites.load("art/soccer/ball.png") is not None:
                self._draw_ball_at(cx, cy, r, spin=(b["x"] + b["y"]) * 1.5)
                continue
            pygame.draw.circle(self.surface, (250, 250, 250), (cx, cy), r)
            spin = (b["x"] + b["y"]) / 30
            for i in range(5):
                a = spin + i * 2 * math.pi / 5
                pygame.draw.circle(self.surface, (30, 30, 34), (cx + math.cos(a) * r * 0.55, cy + math.sin(a) * r * 0.55), r * 0.22)
            pygame.draw.circle(self.surface, (30, 30, 34), (cx, cy), r * 0.25)
            pygame.draw.circle(self.surface, INK, (cx, cy), r, max(1, int(2 * self.S)))

    FREEZE_ART = "art/fx/freeze"

    def _is_frozen(self, u):
        return self.world.t < u.frozen_until and not (self.soccer and self.world.t < self.world.kickoff_until)

    def _draw_frost_patch(self, u):
        """Frost spreading on the floor under a frozen fighter (drawn under the bodies)."""
        if not self._is_frozen(u):
            return
        path = f"{self.FREEZE_ART}/frost_patch.png"
        if self.sprites.load(path, trim=True) is None:
            return
        age = self.t - self.freeze_t0.get(u.uid, self.t)
        d = u.radius * self.k * 3.0 * min(1.0, 0.4 + age / 0.15)
        img = self.sprites.scaled(path, d, d, trim=True)
        self.surface.blit(img, img.get_rect(center=(int(self.sx(u.x)), int(self.sy(u.y) + u.radius * self.k * 0.35))))

    def _draw_frozen(self, u):
        """Ice prison over a frozen fighter: pops in, glints, shatters when the freeze ends."""
        if not self._is_frozen(u):
            if u.uid in self.freeze_t0:          # just thawed: burst the ice off
                del self.freeze_t0[u.uid]
                self.shatters.append((u.x, u.y, u.radius * self.k, self.t))
            return
        t0 = self.freeze_t0.setdefault(u.uid, self.t)
        age = self.t - t0
        cx, cy, r = self.sx(u.x), self.sy(u.y), u.radius * self.k
        # the fighter itself goes icy: a pale-blue wash over the body
        tint = pygame.Surface((int(r * 2.3), int(r * 2.3)), pygame.SRCALPHA)
        pygame.draw.circle(tint, (150, 210, 255, 110), (tint.get_width() // 2, tint.get_height() // 2), int(r * 1.05))
        self.surface.blit(tint, (int(cx - tint.get_width() / 2), int(cy - tint.get_height() / 2)))
        path = f"{self.FREEZE_ART}/ice_prison.png"
        if self.sprites.load(path, trim=True) is not None:
            pop = 1.0 + 0.35 * max(0.0, 1 - age / 0.12)          # slams shut slightly oversized
            d = r * 2.75 * pop
            img = self.sprites.scaled(path, d, d, trim=True)
            self.surface.blit(img, img.get_rect(center=(int(cx), int(cy))))
        else:
            rr = r * 1.25
            g = pygame.Surface((int(rr * 2.2), int(rr * 2.2)), pygame.SRCALPHA)
            c = g.get_width() / 2
            pts = [(c + math.cos(a) * rr, c + math.sin(a) * rr) for a in [i * math.pi / 3 + 0.5 for i in range(6)]]
            pygame.draw.polygon(g, (170, 220, 255, 150), pts)
            pygame.draw.polygon(g, (240, 250, 255, 230), pts, max(2, int(3 * self.S)))
            pygame.draw.line(g, (255, 255, 255, 200), (c - rr * 0.4, c - rr * 0.5), (c - rr * 0.1, c - rr * 0.1), 2)
            self.surface.blit(g, (int(cx - c), int(cy - c)))
        flake = f"{self.FREEZE_ART}/snowflake.png"
        if self.sprites.load(flake, trim=True) is not None:     # three glints orbiting the ice
            fs = r * 0.42
            img = self.sprites.scaled(flake, fs, fs, trim=True)
            for i in range(3):
                a = age * 2.4 + i * 2.094
                tw = 0.6 + 0.4 * math.sin(age * 9 + i * 2)
                sm = pygame.transform.scale(img, (max(1, int(fs * tw)), max(1, int(fs * tw))))
                self.surface.blit(sm, sm.get_rect(center=(int(cx + math.cos(a) * r * 1.25),
                                                          int(cy + math.sin(a) * r * 1.1))))

    def _draw_shatters(self):
        """Ice chunks bursting outward when a freeze ends (0.3 s)."""
        path = f"{self.FREEZE_ART}/ice_shatter.png"
        have = self.sprites.load(path, trim=True) is not None
        keep = []
        for x, y, r, t0 in self.shatters:
            age = self.t - t0
            if age > 0.3:
                continue
            keep.append((x, y, r, t0))
            p = age / 0.3
            cx, cy = self.sx(x), self.sy(y)
            if have:
                d = r * (2.4 + 1.6 * p)
                img = self.sprites.scaled(path, d, d, trim=True).copy()
                img.set_alpha(int(255 * (1 - p)))
                self.surface.blit(img, img.get_rect(center=(int(cx), int(cy))))
            else:
                for i in range(8):
                    a = i * math.pi / 4 + 0.3
                    pygame.draw.circle(self.surface, (220, 240, 255), (cx + math.cos(a) * r * (1 + p * 1.5),
                                       cy + math.sin(a) * r * (1 + p * 1.5)), max(2, r * 0.18 * (1 - p)))
        self.shatters = keep

    def _draw_bolts(self):
        keep = []
        for x, y, t0 in self.bolts:
            age = self.t - t0
            if age > 0.35:
                continue
            keep.append((x, y, t0))
            cx, cy = self.sx(x), self.sy(y)
            rng = random.Random(int(t0 * 1000) + int(age * 30))
            pts, yy = [], self.ay - 10
            while yy < cy:
                pts.append((cx + rng.uniform(-18, 18) * self.S, yy))
                yy += 40 * self.S
            pts.append((cx, cy))
            pygame.draw.lines(self.surface, (160, 200, 255), False, pts, max(6, int(10 * self.S)))
            pygame.draw.lines(self.surface, (255, 255, 255), False, pts, max(2, int(4 * self.S)))
            pygame.draw.circle(self.surface, (255, 255, 220), (cx, cy), 22 * self.S * (1 - age / 0.35))
        self.bolts = keep

    # ── soccer: goals, jerseys, scoreboard, celebrations ────────────────

    def team_color(self, side):
        teams = self.spec.get("soccer", {}).get("teams") or [{"color": [255, 205, 60]}, {"color": [170, 80, 245]}]
        return tuple(teams[side]["color"])

    def team_name(self, side):
        teams = self.spec.get("soccer", {}).get("teams") or [{"name": "HOME"}, {"name": "AWAY"}]
        return teams[side]["name"]

    def _draw_goals(self):
        """Goal mouths in the short walls: white posts + a net behind the goal line."""
        w = self.world
        for team, gy in ((1, w.goal_line), (0, w.H - w.goal_line)):   # top goal is team 1's
            x0 = self.sx(w.W / 2 - w.goal_w / 2)
            x1 = self.sx(w.W / 2 + w.goal_w / 2)
            y_line = self.sy(gy)
            y_back = self.sy(0 if gy < w.H / 2 else w.H)
            top, bot = min(y_line, y_back), max(y_line, y_back)
            net = pygame.Surface((int(x1 - x0), int(bot - top) + 1), pygame.SRCALPHA)
            net.fill((255, 255, 255, 40))
            for x in range(0, net.get_width(), int(10 * self.S)):
                pygame.draw.line(net, (255, 255, 255, 120), (x, 0), (x, net.get_height()))
            for y in range(0, net.get_height(), int(10 * self.S)):
                pygame.draw.line(net, (255, 255, 255, 120), (0, y), (net.get_width(), y))
            art = self.sprites.load("art/soccer/goal_net.png", trim=True)
            if art is not None:   # PixelLab goal, trimmed to its posts so they line up with the real posts
                pad = 12 * self.S
                img = self.sprites.scaled("art/soccer/goal_net.png", int(x1 - x0 + 2 * pad), int(bot - top) + 1, trim=True)
                x0_img = x0 - pad
                if gy > w.H / 2:
                    img = pygame.transform.flip(img, False, True)
                self.surface.blit(img, (int(x0_img), int(top)))
            else:
                self.surface.blit(net, (int(x0), int(top)))
            pygame.draw.line(self.surface, self.team_color(team), (x0, y_line), (x1, y_line), max(2, int(3 * self.S)))

    def _draw_team_spot(self, u, color=None, size=1.0):
        """Sports-game team marker on the ground: a glowing team-colour ellipse under the feet
        (drawn before the body, so it never covers the character)."""
        if not u.is_main:
            return
        cx, cy, r = self.sx(u.x), self.sy(u.y), u.radius * self.k * size
        col = color or self.team_color(u.side)
        pulse = 0.5 + 0.5 * math.sin(self.t * 4 + u.uid)
        w, h = int(r * 2.3), int(r * 0.85)
        g = pygame.Surface((w + 8, h + 8), pygame.SRCALPHA)
        rect = pygame.Rect(4, 4, w, h)
        pygame.draw.ellipse(g, (*col, int(120 + 50 * pulse)), rect)                       # team-colour fill
        pygame.draw.ellipse(g, (*_mix(col, (255, 255, 255), 0.45), 255), rect, max(3, int(5 * self.S)))  # bright rim
        inner = rect.inflate(-w * 0.35, -h * 0.35)
        pygame.draw.ellipse(g, (*col, 150), inner, max(1, int(2 * self.S)))
        self.surface.blit(g, (int(cx - w / 2 - 4), int(cy + r * 0.62 - h / 2 - 4)))

    def _draw_jersey(self, u):
        """(Team colour now lives on the ground spot and the HP bar.)"""
        return

    def _draw_soccer_hud(self):
        surf, w = self.surface, self.world
        c0, c1 = self.team_color(0), self.team_color(1)
        score = self.text.render(f"{w.score[0]} - {w.score[1]}", 4, CREAM)
        cx = IW // 2
        y = HUD_Y - 34
        surf.blit(score, (cx - score.get_width() // 2, y))
        n0 = self.text.fit(self.team_name(0), 2, c0, (SAFE_W - score.get_width()) // 2 - 16)
        n1 = self.text.fit(self.team_name(1), 2, c1, (SAFE_W - score.get_width()) // 2 - 16)
        surf.blit(n0, (cx - score.get_width() // 2 - 12 - n0.get_width(), y + 10))
        surf.blit(n1, (cx + score.get_width() // 2 + 12, y + 10))
        if self.phase == "fight":
            if w.golden:
                txt, col = "GOLDEN GOAL!", (255, 210, 60)
            else:
                left = max(0, math.ceil(w.regulation - w.t))
                txt, col = f"0:{left:02d}", CREAM if left > 5 else RED_HI
            img = self.text.render(txt, 2 if w.golden else 1, col)
            surf.blit(img, (cx - img.get_width() // 2, y + score.get_height() + 2))
        yk = HUD_Y + 30                                   # knockout feed
        for name, killer, t0, col in self.elims[-2:][::-1]:
            if self.t - t0 > 3:
                continue
            img = self.text.fit((f"{killer} K.O.'d {name}" if killer else f"{name} K.O.").upper(), 1, CREAM, SAFE_W - 8)
            surf.fill(NIGHT, (SAFE, yk - 2, img.get_width() + 12, img.get_height() + 4))
            pygame.draw.rect(surf, col, (SAFE, yk - 2, 4, img.get_height() + 4))
            surf.blit(img, (SAFE + 8, yk))
            yk += img.get_height() + 6

    def _draw_soccer_panels(self):
        surf, w = self.surface, self.world
        n = len(w.mains)
        gw = (SAFE_W - (n - 1) * 6 - 10) // n
        gh = 58
        top = int(self.ay + self.arena_h + 12)
        goals = {}
        for _, team, scorer, own in w.goals:
            if scorer is not None and not own:
                goals[scorer] = goals.get(scorer, 0) + 1
        for i, m in enumerate(w.mains):
            x = SAFE + i * (gw + 6) + (10 if i >= n // 2 else 0)   # gap between the two teams
            self._panel((x, top, gw, gh), trim=self.team_color(m.side))
            self._draw_token(m, x + gw // 2, top + 22, 15, status=False)
            if m.alive:
                frac = max(0.0, m.hp) / m.max_hp
                surf.fill(INK, (x + 6, top + gh - 15, gw - 12, 9))
                surf.fill((90, 220, 90) if frac > 0.5 else ((255, 200, 60) if frac > 0.25 else (240, 60, 60)),
                          (x + 7, top + gh - 14, (gw - 14) * frac, 7))
            else:   # knocked out: respawn countdown
                left = next((rt - w.t for rt, u in w.respawns if u is m), 0)
                img = self.text.render(f"{max(0, math.ceil(left))}", 2, RED_HI)
                surf.blit(img, (x + gw // 2 - img.get_width() // 2, top + 8))
            g = goals.get(m.uid, 0)
            if g:
                gt = self.text.render(f"{g}G", 1, YELLOW)
                surf.blit(gt, (x + gw - gt.get_width() - 4, top + 4))

    def _draw_goal_freeze(self):
        """The 0.5 s freeze on a goal: punch-in on the goal mouth, team-colour flash, burst rays
        from the ball and a rippling net. Drawn over the frozen field."""
        ev, p = self.pause_goal, self.pause_p
        if not ev:
            return
        w = self.world
        col = self.team_color(ev["team"])
        bx, by = self.sx(ev["x"]), self.sy(ev["y"])
        surf = self.surface
        clip = surf.get_clip()
        surf.set_clip(pygame.Rect(int(self.ax), int(self.ay), int(self.arena_w), int(self.arena_h)))
        # net ripple: rings spreading from where the ball hit
        for i in range(3):
            k = (p * 1.6 + i * 0.25) % 1.0
            pygame.draw.circle(surf, (255, 255, 255), (bx, by), 20 * self.S + k * 140 * self.S, max(1, int(4 * (1 - k) * self.S)))
        # burst rays in the team colour
        for i in range(16):
            a = i * math.pi / 8 + p * 0.6
            r0, r1 = (40 + 60 * p) * self.S, (120 + 260 * p) * self.S
            pygame.draw.line(surf, col if i % 2 else (255, 255, 255),
                             (bx + math.cos(a) * r0, by + math.sin(a) * r0),
                             (bx + math.cos(a) * r1, by + math.sin(a) * r1), max(2, int(6 * (1 - p * 0.6) * self.S)))
        surf.set_clip(clip)
        # punch-in on the goal (zoom the arena around the ball)
        z = 1 + 0.22 * min(1.0, p / 0.25)
        rect = pygame.Rect(int(self.ax), int(self.ay), int(self.arena_w), int(self.arena_h))
        area = surf.subsurface(rect).copy()
        zw, zh = int(rect.w * z), int(rect.h * z)
        zoomed = pygame.transform.scale(area, (zw, zh))
        fx_, fy_ = (bx - rect.x) * z - (bx - rect.x), (by - rect.y) * z - (by - rect.y)
        surf.blit(zoomed, rect.topleft, pygame.Rect(int(fx_), int(fy_), rect.w, rect.h))
        if p < 0.15:   # team-colour flash
            fl = pygame.Surface((IW, IH), pygame.SRCALPHA)
            fl.fill((*col, int(150 * (1 - p / 0.15))))
            surf.blit(fl, (0, 0))

    def _draw_confetti(self):
        keep = []
        for (x, y, vx, vy, col, t0) in self.confetti:
            age = self.t - t0
            if age > 1.6:
                continue
            keep.append((x, y, vx, vy, col, t0))
            px, py = x + vx * age, y + vy * age + 420 * age * age
            pygame.draw.rect(self.surface, col, (int(px), int(py), int(5 * self.S), int(8 * self.S)))
        self.confetti = keep

    def _celebrate_goal(self, ev):
        w = self.world
        col = self.team_color(ev["team"])
        scorer = next((u for u in w.units if u.uid == ev.get("scorer")), None)
        rng = random.Random(int(self.t * 1000))
        for _ in range(70):
            a = rng.uniform(math.pi * 1.1, math.pi * 1.9)
            sp = rng.uniform(200, 650)
            self.confetti.append((IW / 2 + rng.uniform(-60, 60), self.ay + self.arena_h * 0.45,
                                  math.cos(a) * sp, math.sin(a) * sp,
                                  rng.choice([col, (255, 255, 255), _mix(col, (255, 255, 255), 0.5)]), self.t))
        self.goal_banner = (self.t, col, "OWN GOAL!" if ev.get("own") else
                            (f"{scorer.name.upper()} SCORES!" if scorer else "GOAL!"))
        self.shake_until = self.t + 0.35
        self.shake_amp = 14 * self.S
        self.flash_t = self.t

    def _draw_goal_banner(self):
        if not self.goal_banner:
            return
        t0, col, sub_ = self.goal_banner
        age = self.t - t0
        if age > 1.0:
            return
        sc = 9 if age < 0.05 else (8 if age < 0.1 else 7)
        g = self.text.render("GOAL!!", sc, col)
        y = int(self.ay + self.arena_h * 0.38)
        jit = int(self.fx_rng.uniform(-3, 3)) if age < 0.3 else 0
        self.surface.blit(g, (IW // 2 - g.get_width() // 2 + jit, y + jit))
        s2 = self.text.fit(sub_, 2, CREAM, self.arena_w - 20)
        self.surface.blit(s2, (IW // 2 - s2.get_width() // 2, y + g.get_height() + 6))

    def _intro_soccer(self, p, black):
        """The ball slams down from the sky onto the centre spot (BOOM), the four players crash in
        on their halves, then: LIGHT vs SHADOW . FIRST TO 3!"""
        w = self.world
        b = w.balls[0]
        hits = INTRO_STYLES["soccer"]["hits"]
        bx, by, br = self.sx(b["x"]), self.sy(b["y"]), b["r"] * self.k
        h0 = hits[0][0]
        if p < h0:                                     # falling ball, growing shadow
            e = max(0.0, p / h0)
            sh = pygame.Rect(0, 0, int(br * 2 * (0.3 + 0.7 * e)), int(br * 0.7 * (0.3 + 0.7 * e)))
            sh.center = (int(bx), int(by + br * 0.8))
            pygame.draw.ellipse(self.surface, (0, 0, 0), sh)
            yb = by - (1 - e * e) * self.arena_h * 0.55
            scale = 2.4 - 1.4 * e                      # huge as it comes at the camera
            self._draw_ball_at(bx, yb, br * scale)
        else:
            since = p - h0
            if since < 0.4:
                k = since / 0.4
                pygame.draw.circle(self.surface, (255, 255, 255), (bx, by), br * (1.5 + 6 * k), max(2, int(8 * (1 - k) * self.S)))
                self._fx_cracks(bx, by, since, 0.5)
            hop = abs(math.sin(min(1.0, since / 0.5) * math.pi)) * br * 2.5 * max(0.0, 1 - since / 0.5)
            self._draw_ball_at(bx, by - hop, br)
            self._fx_word("BOOM!", bx, by - br * 4, since, 3, YELLOW, 0.3)
        for i, m in enumerate(w.mains):
            h = hits[min(i + 1, len(hits) - 1)][0]
            x1, y1, r = self.sx(m.x), self.sy(m.y), m.radius * self.k
            since = p - h
            if since < -0.3:
                continue
            if since < 0:
                e = 1 + since / 0.3
                self._token_squash(m, x1, y1 - (1 - e * e) * self.arena_h * 0.5, r, 0.8, 1.3)
                continue
            sq = max(0.0, 1 - since / 0.12)
            self._token_squash(m, x1, y1 + r * 0.3 * sq, r, 1 + 0.45 * sq, 1 - 0.35 * sq)
            pygame.draw.circle(self.surface, self.team_color(m.side), (x1, y1), r * 1.15, max(2, int(4 * self.S)))
        last = hits[-1][0]
        dt = p - last - 0.05
        if dt >= 0:
            sc = 6 if dt < 0.05 else 5
            t0 = self.text.render(self.team_name(0), sc, self.team_color(0))
            vs = self.text.render(" VS ", sc - 1, CREAM)
            t1 = self.text.render(self.team_name(1), sc, self.team_color(1))
            total = t0.get_width() + vs.get_width() + t1.get_width()
            if total > self.arena_w - 16:
                f = (self.arena_w - 16) / total
                t0, vs, t1 = (pygame.transform.scale(i, (int(i.get_width() * f), int(i.get_height() * f))) for i in (t0, vs, t1))
                total = t0.get_width() + vs.get_width() + t1.get_width()
            x = IW // 2 - total // 2
            y = int(self.ay + self.arena_h * 0.25)
            for img in (t0, vs, t1):
                self.surface.blit(img, (x, y + (t0.get_height() - img.get_height()) // 2))
                x += img.get_width()
            sub_ = self.text.render(f"2 V 2 . FIRST TO {w.to_win}!", 2, YELLOW)
            self.surface.blit(sub_, (IW // 2 - sub_.get_width() // 2, y + t0.get_height() + 8))

    def _draw_ball_at(self, cx, cy, r, spin=0.0):
        if self.sprites.load("art/soccer/ball.png") is not None:
            img = self.sprites.scaled("art/soccer/ball.png", int(r * 2) // 2 * 2, int(r * 2) // 2 * 2)
            img = pygame.transform.rotate(img, int(spin) // 15 * 15)
            self.surface.blit(img, (int(cx - img.get_width() / 2), int(cy - img.get_height() / 2)))
            return
        pygame.draw.circle(self.surface, (250, 250, 250), (cx, cy), r)
        for i in range(5):
            a = i * 2 * math.pi / 5 + 0.3
            pygame.draw.circle(self.surface, (30, 30, 34), (cx + math.cos(a) * r * 0.55, cy + math.sin(a) * r * 0.55), r * 0.22)
        pygame.draw.circle(self.surface, (30, 30, 34), (cx, cy), r * 0.25)
        pygame.draw.circle(self.surface, INK, (cx, cy), r, max(1, int(2 * self.S)))

    def _draw_soccer_winner(self, lift):
        w = self.world
        cw, ch = 400, 156
        x = int(self.ax + (self.arena_w - cw) / 2)
        y = int(self.ay + (self.arena_h - ch) / 2 + ((self.ay + 14) - (self.ay + (self.arena_h - ch) / 2)) * lift)
        side = w.winner_side
        col = self.team_color(side) if side is not None else CREAM
        self._panel((x, y, cw, ch), trim=col)
        t = self.text.fit(f"{self.team_name(side)} WINS!" if side is not None else "DRAW", 4, col, cw - 24)
        self.surface.blit(t, (x + (cw - t.get_width()) // 2, y + 12))
        sc = self.text.render(f"{w.score[0]} - {w.score[1]}", 3, CREAM)
        self.surface.blit(sc, (x + (cw - sc.get_width()) // 2, y + 18 + t.get_height()))
        m = w.mvp()
        if m is not None:
            self._draw_token(m, x + 40, y + ch - 30, 18, status=False)
            g = sum(1 for _, tm, sc_, own in w.goals if sc_ == m.uid and not own)
            img = self.text.fit(f"MVP: {m.name.upper()} . {g} GOAL{'S' if g != 1 else ''}", 1, YELLOW, cw - 90)
            self.surface.blit(img, (x + 68, y + ch - 30 - img.get_height() // 2))

    # ── horde survival: HUD, kill fx, waves, leaderboard ────────────────

    def _draw_horde_hud(self):
        surf, w = self.surface, self.world
        hero = w.mains[0]
        hc = self.spec["horde"]
        title = self.text.render(hc["title"], 2, (200, 210, 190))
        surf.blit(title, (SAFE + 4, HUD_Y - 30))
        wave = self.text.render(f"WAVE {max(1, w.wave)}", 2, YELLOW)
        surf.blit(wave, (IW - SAFE - wave.get_width() - 4, HUD_Y - 30))
        # the big number
        cnt = self.text.render(str(w.kill_count), 5, CREAM)
        icon = self.sprites.load("art/horde/skull_icon.png")
        total = cnt.get_width() + (44 if icon else 0)
        x = IW // 2 - total // 2
        if icon:
            img = self.sprites.scaled("art/horde/skull_icon.png", 38, 38)
            surf.blit(img, (x, HUD_Y - 10 + (cnt.get_height() - 38) // 2))
            x += 44
        pop = self.t - self.last_kill_draw < 0.08
        surf.blit(cnt, (x, HUD_Y - 10 - (3 if pop else 0)))
        lab = self.text.render("DEFEATED", 1, (200, 200, 210))
        surf.blit(lab, (IW // 2 - lab.get_width() // 2, HUD_Y - 10 + cnt.get_height() + 2))
        # hero HP bar
        y = HUD_Y + 58
        frac = max(0.0, hero.hp) / hero.max_hp if hero.alive else 0.0
        bw = SAFE_W - 70
        self._draw_token(hero, SAFE + 22, y + 7, 18, status=False)
        surf.fill(INK, (SAFE + 46, y, bw, 16))
        col = (90, 220, 90) if frac > 0.5 else ((255, 200, 60) if frac > 0.25 else (240, 60, 60))
        surf.fill(col, (SAFE + 48, y + 2, (bw - 4) * frac, 12))
        hp = self.text.render(f"{max(0, math.ceil(hero.hp))}", 1, CREAM)
        surf.blit(hp, (SAFE + 48 + bw - hp.get_width() - 6, y + 2))

    def _draw_horde_panel(self):
        surf, w = self.surface, self.world
        hero = w.mains[0]
        top = int(self.ay + self.arena_h + 12)
        ph = 64
        self._panel((SAFE, top, SAFE_W, ph), trim=_readable(hero.color))
        label = (hero.meter or {}).get("label") or hero.name
        self._ult_icon(hero, SAFE + 8, top + 8, 48, label)
        name = self.text.fit(label.upper(), 1, _readable(hero.color), SAFE_W // 2 - 70)
        surf.blit(name, (SAFE + 64, top + 10))
        segs = 8
        f = hero.meter_fraction() if hero.meter else 0
        for i in range(segs):
            on = (i + 1) / segs <= f + 1e-6
            surf.fill(_readable(hero.color) if on else (40, 40, 50), (SAFE + 64 + i * 22, top + 32, 18, 10))
        board = self.spec["horde"].get("board") or {}
        prev = board.get("prev_record") or 0
        rec = self.text.render(f"RECORD: {prev}" if prev else "RECORD: -", 2, YELLOW)
        surf.blit(rec, (SAFE + SAFE_W - rec.get_width() - 12, top + (ph - rec.get_height()) // 2))

    def _draw_puffs(self):
        keep = []
        fx = self.spec["horde"].get("death_fx", "fx_bones")
        path = f"art/horde/{fx}.png"
        for x, y, t0, big in self.puffs:
            age = self.t - t0
            if age > 0.35:
                continue
            keep.append((x, y, t0, big))
            size = (34 if not big else 110) * self.S * (0.7 + age * 1.6)
            if self.sprites.load(path) is not None:
                img = self.sprites.scaled(path, int(size) // 4 * 4, int(size) // 4 * 4)
                if age > 0.2:
                    img = img.copy()
                    img.set_alpha(int(255 * (0.35 - age) / 0.15))
                self.surface.blit(img, (int(self.sx(x) - img.get_width() / 2), int(self.sy(y) - img.get_height() / 2)))
        self.puffs = keep

    def _draw_wave_banner(self):
        if not self.wave_banner:
            return
        t0, wave, boss, new, new_sprite = self.wave_banner
        age = self.t - t0
        if new and not boss and age <= 1.1:
            self._draw_new_enemy_card(age, new, new_sprite)
        if age > (1.0 if boss else 0.6):
            return
        sc = 5 if age < 0.05 else 4
        img = self.text.render(f"WAVE {wave}!", sc, YELLOW)
        y = int(self.ay + self.arena_h * 0.3)
        self.surface.blit(img, (IW // 2 - img.get_width() // 2, y))
        if boss:
            b = self.text.fit(f"! {boss} INCOMING !", 2, RED_HI if int(age * 8) % 2 == 0 else CREAM, self.arena_w - 20)
            self.surface.blit(b, (IW // 2 - b.get_width() // 2, y + img.get_height() + 6))

    def _draw_new_enemy_card(self, age, name, sprite):
        """'NEW ENEMY!' card under the wave banner: the enemy type this wave brings in."""
        pop = min(1.0, age / 0.12)
        fade = 1.0 if age < 0.9 else max(0.0, 1 - (age - 0.9) / 0.2)
        S = self.S
        w = int(self.arena_w * 0.8)
        tx = int(104 * S)
        tag = self.text.fit("NEW ENEMY!", 2, RED_HI if int(age * 8) % 2 == 0 else YELLOW, w - tx - 8)
        nm = self.text.fit(name.upper(), 3, CREAM, w - tx - 8)
        h = max(int(96 * S), tag.get_height() + nm.get_height() + int(30 * S))
        x = IW // 2 - w // 2
        y = int(self.ay + self.arena_h * 0.5) + int((1 - pop) * 30 * S)   # below the wave banner / cut-ins
        card = pygame.Surface((w, h), pygame.SRCALPHA)
        card.fill((20, 18, 30, int(215 * fade)))
        pygame.draw.rect(card, (*RED_HI, int(255 * fade)), (0, 0, w, h), 3)
        if sprite and self.sprites.load(sprite, trim=True) is not None:
            src = self.sprites.load(sprite, trim=True)
            k = 80 * S / max(src.get_size())
            img = self.sprites.scaled(sprite, src.get_width() * k, src.get_height() * k, trim=True)
            card.blit(img, (12, (h - img.get_height()) // 2))
        ty = (h - tag.get_height() - nm.get_height() - 6) // 2
        card.blit(tag, (tx, ty))
        card.blit(nm, (tx, ty + tag.get_height() + 6))
        card.set_alpha(int(255 * fade))
        self.surface.blit(card, (x, y))

    def _draw_horde_board(self, since):
        """End screen: this run's score, then the top-10 leaderboard for this horde."""
        surf = self.surface
        hc = self.spec["horde"]
        board = hc.get("board") or {"rows": []}
        hero = self.world.mains[0]
        pop = min(1.0, (since - 0.6) / 0.2)
        x, y = int(self.ax + 8), int(self.ay + 10 + (1 - pop) * 40)
        w, h = int(self.arena_w - 16), int(self.arena_h - 20)
        self._panel((x, y, w, h), trim=GOLD)
        tro = self.sprites.load("art/horde/trophy.png")
        tt = self.text.fit(f"{hc['title']} LEADERBOARD", 2, YELLOW, w - 70)
        tx = x + (w - tt.get_width() - (36 if tro else 0)) // 2
        if tro:
            surf.blit(self.sprites.scaled("art/horde/trophy.png", 30, 30), (tx, y + 10))
            tx += 36
        surf.blit(tt, (tx, y + 14))
        sc = hc.get("score", {})
        line = self.text.fit(f"{hero.name.upper()}: {sc.get('kills', self.world.kill_count)} DEFEATED . WAVE {sc.get('wave', self.world.wave)}",
                             2, CREAM, w - 20)
        surf.blit(line, (x + (w - line.get_width()) // 2, y + 46))
        yy = y + 46 + line.get_height() + 6
        if board.get("new_record") and int(since * 6) % 2 == 0:
            nr = self.text.render("NEW RECORD!", 3, RED_HI)
            surf.blit(nr, (x + (w - nr.get_width()) // 2, yy))
        yy += 34
        rh = max(22, (y + h - yy - 8) // 10)
        for i, row in enumerate(board.get("rows", [])[:10]):
            ry = yy + i * rh
            me = row["id"] == hero.kind
            if me:
                surf.fill(_mix(GOLD, NIGHT, 0.6), (x + 8, ry - 2, w - 16, rh - 2))
            rank = self.text.render(f"{i + 1}.", 1, YELLOW if i < 3 else CREAM)
            surf.blit(rank, (x + 16, ry + (rh - rank.get_height()) // 2 - 1))
            path = f"characters/art/{row['id']}/body.png"
            if self.sprites.load(path, trim=True) is not None:
                img = self.sprites.scaled(path, rh - 4, rh - 4, trim=True)
                surf.blit(img, (x + 48, ry))
            nm = self.text.fit(row["name"].upper(), 1, CREAM if row["best"] is not None else (130, 130, 140), w // 2)
            surf.blit(nm, (x + 54 + rh, ry + (rh - nm.get_height()) // 2 - 1))
            val = self.text.render(str(row["best"]) if row["best"] is not None else "-", 1,
                                   YELLOW if me else (CREAM if row["best"] is not None else (130, 130, 140)))
            surf.blit(val, (x + w - val.get_width() - 18, ry + (rh - val.get_height()) // 2 - 1))

    def _draw_horde_card(self, lift):
        w = self.world
        hero = w.mains[0]
        cw, ch = 400, 156
        x = int(self.ax + (self.arena_w - cw) / 2)
        y = int(self.ay + 14)
        self._panel((x, y, cw, ch), trim=GOLD)
        self._draw_token(hero, x + 62, y + ch // 2 + 4, 36, status=False)
        n = self.text.render(str(w.kill_count), 5, YELLOW)
        self.surface.blit(n, (x + 120, y + 16))
        d = self.text.fit(f"{self.spec['horde']['title']} DEFEATED", 1, CREAM, cw - 140)
        self.surface.blit(d, (x + 120, y + 18 + n.get_height()))
        wv = self.text.render(f"WAVE {w.wave}", 2, CREAM)
        self.surface.blit(wv, (x + 120, y + ch - 36))

    def _intro_horde(self, p, black):
        """The hero crashes down in the middle; the horde creeps in from every edge; the question."""
        w = self.world
        hero = w.mains[0]
        hc = self.spec["horde"]
        basic = hc["enemies"]["basic"]["sprite"]
        # enemies creeping in from the edges
        if self.sprites.load(basic) is not None:
            for i in range(12):
                a = i * 2 * math.pi / 12 + 0.2
                d = 0.62 - 0.12 * min(1.0, p / 1.3)
                ex = self.ax + self.arena_w * (0.5 + d * math.cos(a) * 0.75)
                ey = self.ay + self.arena_h * (0.5 + d * math.sin(a) * 0.75)
                img = self.sprites.scaled(basic, int(30 * self.S), int(30 * self.S))
                self.surface.blit(img, (int(ex - img.get_width() / 2), int(ey - img.get_height() / 2 + math.sin(p * 12 + i) * 2)))
        h0 = INTRO_STYLES["horde"]["hits"][0][0]
        x1, y1, r = self.sx(hero.x), self.sy(hero.y), hero.radius * self.k
        if p < h0:
            e = max(0.0, p / h0)
            sh = pygame.Rect(0, 0, int(r * 2 * (0.3 + 0.7 * e)), int(r * 0.6 * (0.3 + 0.7 * e)))
            sh.center = (int(x1), int(y1 + r * 0.9))
            pygame.draw.ellipse(self.surface, (0, 0, 0), sh)
            self._token_squash(hero, x1, y1 - (1 - e * e) * self.arena_h * 0.5, r * 1.6, 0.8, 1.3)
        else:
            since = p - h0
            if since < 0.4:
                k = since / 0.4
                pygame.draw.circle(self.surface, (255, 255, 255), (x1, y1), r * (1.5 + 5 * k), max(2, int(8 * (1 - k) * self.S)))
                self._fx_cracks(x1, y1, since, 0.6)
            sq = max(0.0, 1 - since / 0.12)
            big = 1.6 - 0.6 * min(1.0, since / 0.5)
            self._token_squash(hero, x1, y1, r * big, 1 + 0.45 * sq, 1 - 0.35 * sq)
        if p >= h0 + 0.15:
            q1 = self.text.fit(f"HOW MANY {hc['title']}", 4, CREAM, self.arena_w - 16)
            q2 = self.text.fit(f"CAN THE {hero.name.upper()} DEFEAT?", 4, YELLOW, self.arena_w - 16)
            q3 = self.text.fit("GUESS IN THE COMMENTS!", 2, (255, 150, 150), self.arena_w - 16)
            y = int(self.ay + self.arena_h * 0.12)
            for img in (q1, q2):
                self.surface.blit(img, (IW // 2 - img.get_width() // 2, y))
                y += img.get_height() + 4
            self.surface.blit(q3, (IW // 2 - q3.get_width() // 2, int(self.ay + self.arena_h * 0.8)))

    # ── boss raid: warning zones, impacts, boss HUD, enraged ────────────

    def _tg_points(self, tg, grow=1.0):
        """Screen polygon for a cone / beam warning (grow 0..1 = how far the fill has crept)."""
        cx, cy = self.sx(tg["x"]), self.sy(tg["y"])
        if tg["kind"] == "cone":
            rng_ = tg["range"] * self.k * grow
            half = math.radians(tg["half"])
            pts = [(cx, cy)]
            for i in range(9):
                a = tg["ang"] - half + 2 * half * i / 8
                pts.append((cx + math.cos(a) * rng_, cy + math.sin(a) * rng_))
            return pts
        ln, wd = tg["len"] * self.k * grow, tg["width"] * self.k / 2
        ca, sa = math.cos(tg["ang"]), math.sin(tg["ang"])
        return [(cx - sa * wd, cy + ca * wd), (cx + ca * ln - sa * wd, cy + sa * ln + ca * wd),
                (cx + ca * ln + sa * wd, cy + sa * ln - ca * wd), (cx + sa * wd, cy - ca * wd)]

    def _draw_telegraphs(self):
        """Red danger zones: the outline flashes, the fill creeps in until the hit lands."""
        w = self.world
        aw, ah = int(self.arena_w), int(self.arena_h)
        layer = pygame.Surface((IW, IH), pygame.SRCALPHA)
        for tg in w.telegraphs:
            if tg["kind"] == "summon_spot":
                pygame.draw.circle(layer, (170, 90, 255, 120), (self.sx(tg["x"]), self.sy(tg["y"])), tg["r"] * self.k, 3)
                pre = BOSS_PREFIX.get(getattr(w.boss, "kind", ""), "")
                sp = f"art/boss/fx2/{SUMMON_FX.get(pre, '')}.png"
                if pre in SUMMON_FX and self.sprites.load(sp, trim=True) is not None:
                    d = tg["r"] * self.k * 2.6
                    img = self.sprites.scaled(sp, d, d, trim=True)
                    layer.blit(img, img.get_rect(center=(int(self.sx(tg["x"])), int(self.sy(tg["y"])))))
                continue
            p = min(1.0, max(0.0, (w.t - tg["t0"]) / max(0.05, tg["t_hit"] - tg["t0"])))
            blink = 150 if int(w.t * 10) % 2 == 0 else 90
            if tg["kind"] in ("circle", "nova"):
                c = (self.sx(tg["x"]), self.sy(tg["y"]))
                r = tg["r"] * self.k
                pygame.draw.circle(layer, (255, 40, 30, 55), c, r)
                pygame.draw.circle(layer, (255, 60, 40, 120), c, r * p)
                pygame.draw.circle(layer, (255, 230, 200, blink), c, r, max(2, int(3 * self.S)))
                mk = "art/boss/fx2/death_mark.png" if tg.get("mark") else "art/boss/fx2/danger_marker.png"
                if tg["kind"] == "circle" and self.sprites.load(mk, trim=True) is not None:
                    d = r * 1.1
                    img = self.sprites.scaled(mk, d, d, trim=True).copy()
                    img.set_alpha(blink + 60)
                    layer.blit(img, img.get_rect(center=(int(c[0]), int(c[1]))))
            else:
                pygame.draw.polygon(layer, (255, 40, 30, 55), self._tg_points(tg))
                pygame.draw.polygon(layer, (255, 60, 40, 120), self._tg_points(tg, p))
                pygame.draw.polygon(layer, (255, 230, 200, blink), self._tg_points(tg), max(2, int(3 * self.S)))
        clip = self.surface.get_clip()
        self.surface.set_clip(pygame.Rect(int(self.ax), int(self.ay), aw, ah))
        self.surface.blit(layer, (0, 0))
        self.surface.set_clip(clip)

    def _draw_impacts(self):
        keep = []
        for ev, t0 in self.impacts:
            age = self.t - t0
            if age > 0.45:
                continue
            keep.append((ev, t0))
            k = age / 0.45
            fx = ev.get("fx")
            path = f"art/boss/{fx}.png" if fx else None
            big = BOSS_IMPACT_FX.get(ev.get("name"))
            if big and self.sprites.load(f"art/boss/fx2/{big}.png", trim=True) is not None:
                path = f"art/boss/fx2/{big}.png"
            cx, cy = self.sx(ev["x"]), self.sy(ev["y"])
            alpha = int(255 * (1 - max(0.0, k - 0.5) / 0.5))
            if ev["kind"] in ("cone", "beam"):
                if path and self.sprites.load(path, trim=True) is not None:
                    length = (ev.get("range") or ev.get("len")) * self.k
                    thick = (math.tan(math.radians(ev["half"])) * 2 * length) if ev["kind"] == "cone" else ev["width"] * self.k * 1.6
                    img = self.sprites.scaled(path, int(length) // 4 * 4, max(8, int(thick) // 4 * 4), trim=True)
                    img = pygame.transform.rotate(img, -math.degrees(ev["ang"]))
                    img.set_alpha(alpha)
                    ca, sa = math.cos(ev["ang"]), math.sin(ev["ang"])
                    mx, my = cx + ca * length / 2, cy + sa * length / 2
                    self.surface.blit(img, (int(mx - img.get_width() / 2), int(my - img.get_height() / 2)))
            else:
                r = (ev.get("r") or 80) * self.k
                if path and self.sprites.load(path, trim=True) is not None:
                    size = r * (2.0 if ev["kind"] == "nova" else 1.6) * (0.8 + 0.4 * k)
                    img = self.sprites.scaled(path, int(size) // 4 * 4, int(size) // 4 * 4, trim=True)
                    img.set_alpha(alpha)
                    self.surface.blit(img, (int(cx - img.get_width() / 2), int(cy - img.get_height() / 2)))
                pygame.draw.circle(self.surface, (255, 220, 150), (cx, cy), r * (0.6 + 0.6 * k), max(2, int(6 * (1 - k) * self.S)))
        self.impacts = keep

    def _draw_boss_hud(self):
        surf, w = self.surface, self.world
        b = w.boss
        name = self.text.fit(b.name.upper(), 2, RED_HI if w.enraged else CREAM, SAFE_W - 90)
        surf.blit(name, (SAFE + 70, HUD_Y - 30))
        if w.enraged and int(self.t * 4) % 2 == 0:
            en = self.text.render("ENRAGED", 1, RED_HI)
            surf.blit(en, (IW - SAFE - en.get_width() - 4, HUD_Y - 26))
        self._draw_token(b, SAFE + 30, HUD_Y + 4, 30, status=False)
        bw, bh = SAFE_W - 70, 26
        x, y = SAFE + 66, HUD_Y + 2
        frac = max(0.0, b.hp) / b.max_hp if b.alive else 0.0
        surf.fill(INK, (x - 2, y - 2, bw + 4, bh + 4))
        surf.fill((60, 14, 18), (x, y, bw, bh))
        surf.fill((235, 50, 40) if w.enraged else (200, 40, 50), (x, y, bw * frac, bh))
        surf.fill((255, 140, 120), (x, y, bw * frac, 4))
        pygame.draw.line(surf, YELLOW, (x + bw * 0.5, y - 4), (x + bw * 0.5, y + bh + 4), 2)   # enrage mark
        pct = self.text.render(f"{math.ceil(frac * 100)}%", 2, CREAM)
        surf.blit(pct, (x + bw - pct.get_width() - 6, y + (bh - pct.get_height()) // 2))
        yk = HUD_Y + 42                                      # knockout feed
        for nm, killer, t0, col in self.elims[-2:][::-1]:
            if self.t - t0 > 3:
                continue
            img = self.text.fit(f"{nm} IS DOWN!".upper(), 1, CREAM, SAFE_W - 8)
            surf.fill(NIGHT, (SAFE, yk - 2, img.get_width() + 12, img.get_height() + 4))
            pygame.draw.rect(surf, col, (SAFE, yk - 2, 4, img.get_height() + 4))
            surf.blit(img, (SAFE + 8, yk))
            yk += img.get_height() + 6

    def _draw_boss_panels(self):
        surf, w = self.surface, self.world
        heroes = [m for m in w.mains if m.side == 0]
        n = len(heroes)
        gw = (SAFE_W - (n - 1) * 6) // n
        gh = 58
        top = int(self.ay + self.arena_h + 12)
        for i, m in enumerate(heroes):
            x = SAFE + i * (gw + 6)
            self._panel((x, top, gw, gh), trim=_readable(m.color) if m.alive else (70, 70, 80))
            self._draw_token(m, x + gw // 2, top + 22, 15, status=False)
            if m.alive:
                frac = max(0.0, m.hp) / m.max_hp
                surf.fill(INK, (x + 6, top + gh - 15, gw - 12, 9))
                surf.fill((90, 220, 90) if frac > 0.5 else ((255, 200, 60) if frac > 0.25 else (240, 60, 60)),
                          (x + 7, top + gh - 14, (gw - 14) * frac, 7))
            else:
                cx_, cy_ = x + gw // 2, top + 22
                pygame.draw.line(surf, RED_HI, (cx_ - 14, cy_ - 14), (cx_ + 14, cy_ + 14), 4)
                pygame.draw.line(surf, RED_HI, (cx_ + 14, cy_ - 14), (cx_ - 14, cy_ + 14), 4)

    def _draw_boss_card(self, lift):
        w = self.world
        cw, ch = 400, 156
        x = int(self.ax + (self.arena_w - cw) / 2)
        y = int(self.ay + (self.arena_h - ch) / 2 + ((self.ay + 14) - (self.ay + (self.arena_h - ch) / 2)) * lift)
        won = w.winner_side == 0
        col = YELLOW if won else RED_HI
        self._panel((x, y, cw, ch), trim=col)
        if won and self.sprites.load("art/boss/loot_chest.png") is not None:
            self.surface.blit(self.sprites.scaled("art/boss/loot_chest.png", 56, 56), (x + cw - 70, y + 12))
        t = self.text.fit("BOSS DEFEATED!" if won else "RAID FAILED", 4, col, cw - (90 if won else 24))
        self.surface.blit(t, (x + 14 if won else x + (cw - t.get_width()) // 2, y + 18))
        m = w.raid_mvp()
        if won and m is not None:
            self._draw_token(m, x + 40, y + ch - 40, 22, status=False)
            dmg = int(w.boss_dmg.get(m.uid, 0))
            img = self.text.fit(f"MVP: {m.name.upper()} . {dmg} DAMAGE", 2, CREAM, cw - 90)
            self.surface.blit(img, (x + 72, y + ch - 40 - img.get_height() // 2))
        elif not won:
            hp = max(1, math.ceil(w.boss.hp - 1e-6))
            img = self.text.fit(f"{w.boss.name.upper()} SURVIVED WITH {hp} HP", 2, CREAM, cw - 24)
            self.surface.blit(img, (x + (cw - img.get_width()) // 2, y + ch - 44))

    def _intro_boss(self, p, black):
        """Warning siren, the boss crashes down in the middle, the party drops into the corners."""
        w = self.world
        b = w.boss
        hits = INTRO_STYLES["boss"]["hits"]
        h0 = hits[0][0]
        if int(p * 6) % 2 == 0 and p < h0 + 0.6:       # flashing red warning bars
            for yy in (self.ay + 6, self.ay + self.arena_h - 30):
                self.surface.fill((200, 30, 30), (self.ax, yy, self.arena_w, 24))
                warn = self.text.render("! WARNING ! BOSS ! WARNING !", 1, CREAM)
                self.surface.blit(warn, (IW // 2 - warn.get_width() // 2, yy + 6))
        x1, y1, r = self.sx(b.x), self.sy(b.y), b.radius * self.k
        if p < h0:
            e = max(0.0, p / h0)
            sh = pygame.Rect(0, 0, int(r * 2 * (0.3 + 0.7 * e)), int(r * 0.6 * (0.3 + 0.7 * e)))
            sh.center = (int(x1), int(y1 + r * 0.9))
            pygame.draw.ellipse(self.surface, (0, 0, 0), sh)
            self._token_squash(b, x1, y1 - (1 - e * e) * self.arena_h * 0.6, r, 0.85, 1.2)
        else:
            since = p - h0
            if since < 0.5:
                k = since / 0.5
                pygame.draw.circle(self.surface, (255, 120, 80), (x1, y1), r * (1.2 + 2.5 * k), max(2, int(10 * (1 - k) * self.S)))
                self._fx_cracks(x1, y1, since, 1.0)
            sq = max(0.0, 1 - since / 0.15)
            self._token_squash(b, x1, y1 + r * 0.2 * sq, r, 1 + 0.3 * sq, 1 - 0.25 * sq)
        for i, m in enumerate([m for m in w.mains if m.side == 0]):
            h = hits[min(i + 1, len(hits) - 1)][0]
            mx, my, mr = self.sx(m.x), self.sy(m.y), m.radius * self.k
            since = p - h
            if since < -0.3:
                continue
            if since < 0:
                e = 1 + since / 0.3
                self._token_squash(m, mx, my - (1 - e * e) * self.arena_h * 0.4, mr, 0.8, 1.3)
            else:
                sq = max(0.0, 1 - since / 0.12)
                self._token_squash(m, mx, my, mr, 1 + 0.4 * sq, 1 - 0.3 * sq)
        if p >= h0 + 0.1:
            t1 = self.text.fit(b.name.upper(), 5, RED_HI, self.arena_w - 16)
            t2 = self.text.render(f"{len(self.world.mains) - 1} HEROES . 1 BOSS", 2, CREAM)
            y = int(self.ay + self.arena_h * 0.2)
            self.surface.blit(t1, (IW // 2 - t1.get_width() // 2, y))
            self.surface.blit(t2, (IW // 2 - t2.get_width() // 2, y + t1.get_height() + 6))

    def _token_squash(self, u, cx, cy, r, sx=1.0, sy=1.0, alpha=255, white=False):
        """A fighter's ball stretched by (sx, sy), for the intro's squash-and-stretch."""
        sx, sy = round(sx * 20) / 20, round(sy * 20) / 20   # quantise: keeps the sprite cache small
        path = self._body_sprite_path(u)
        src = self.sprites.load(path, trim=True)
        if src is None:
            rect = pygame.Rect(0, 0, int(2 * r * sx), int(2 * r * sy))
            rect.center = (int(cx), int(cy))
            pygame.draw.ellipse(self.surface, (255, 255, 255) if white else u.color, rect)
            return
        fit = u.tpl.get("art_fit", {})
        sw, sh = src.get_size()
        f = 2.1 * r * float(fit.get("scale", 1.0)) / max(sw, sh)
        img = self.sprites.scaled(path, sw * f * sx, sh * f * sy, trim=True, flash=white)
        if alpha < 255:
            img = img.copy()
            img.set_alpha(alpha)
        self.surface.blit(img, (int(cx - img.get_width() / 2), int(cy - img.get_height() / 2)))

    # ── intro hook (see fightsim/intro.py for the styles' timing and sounds) ──

    def _intro_props(self):
        """Random-but-repeatable cracks and debris shapes for the intro impacts."""
        if getattr(self, "_cracks", None) is None:
            rng = random.Random(7)
            self._cracks = []
            for i in range(10):
                ang = i * 2 * math.pi / 10 + rng.uniform(-0.25, 0.25)
                length = rng.uniform(0.22, 0.42)
                pts, x, y = [(0.0, 0.0)], 0.0, 0.0
                for _ in range(5):
                    a = ang + rng.uniform(-0.45, 0.45)
                    x += math.cos(a) * length / 5
                    y += math.sin(a) * length / 5
                    pts.append((x, y))
                self._cracks.append(pts)
            self._debris = [(rng.uniform(0, 2 * math.pi), rng.uniform(0.9, 2.2), rng.randint(3, 8),
                             rng.choice([(150, 140, 130), (95, 85, 80), (230, 200, 120), (255, 255, 255)]))
                            for _ in range(22)]
        return self._cracks, self._debris

    def _fx_cracks(self, cx, cy, since, scale=1.0):
        if since < 0:
            return
        crack = "art/fx/intro/crack_flash.png"
        if self.sprites.load(crack, trim=True) is not None:
            # PixelLab fracture: snaps open flat on the floor (perspective-squashed), glows molten
            # on impact, then cools to dark cracks that stay
            d = self.arena_w * 0.5 * scale * (0.6 + 0.4 * min(1.0, since / 0.07))
            img = self.sprites.scaled(crack, d, d * 0.5, trim=True).copy()
            cool = min(1.0, max(0.0, (since - 0.15) / 0.5))
            if cool > 0:
                c = int(255 - (255 - 90) * cool)
                img.fill((c, int(c * 0.85), int(c * 0.8)), special_flags=pygame.BLEND_RGB_MULT)
            self.surface.blit(img, img.get_rect(center=(int(cx), int(cy))))
            return
        grow = min(1.0, since / 0.08) * scale
        glow = _mix((90, 70, 60), (255, 200, 90), max(0.0, 1 - since / 0.6))
        for pts in self._intro_props()[0]:
            pp = [(cx + x * grow * self.arena_w, cy + y * grow * self.arena_w) for x, y in pts]
            pygame.draw.lines(self.surface, (15, 10, 8), False, pp, max(3, int(7 * self.S)))
            pygame.draw.lines(self.surface, glow, False, pp, max(1, int(2 * self.S)))

    def _fx_debris(self, cx, cy, since, scale=1.0, colors=None):
        if not 0 <= since < 0.8:
            return
        aw = self.arena_w
        for i, (ang, spd, size, col) in enumerate(self._intro_props()[1]):
            dx = math.cos(ang) * spd * aw * since * scale
            dy = math.sin(ang) * spd * aw * since * 0.8 * scale + 1.6 * aw * since * since
            x, y = cx + dx, cy + dy
            if self.ax < x < self.ax + aw and self.ay < y < self.ay + self.arena_h:
                sz = int(size * self.S * (1 + scale))
                c = colors[i % len(colors)] if colors else col
                pygame.draw.rect(self.surface, c, (int(x - sz / 2), int(y - sz / 2), sz, sz))

    def _fx_burst(self, cx, cy, since, size=0.95, white=False, dur=0.42):
        """The PixelLab comic impact burst: pops big, wobbles, fades."""
        if not 0 <= since < dur:
            return
        k = since / dur
        sc = 0.55 + 0.9 * min(1.0, since / 0.05) - 0.35 * k
        if self.sprites.load("art/fx/impact_burst.png") is None:
            pygame.draw.circle(self.surface, YELLOW, (int(cx), int(cy)), int(sc * size * self.arena_w / 2))
            return
        px = sc * size * self.arena_w
        img = self.sprites.scaled("art/fx/impact_burst.png", px, px)
        img = pygame.transform.rotate(img, 8 * math.sin(since * 40))
        if white:
            img = img.copy()
            img.fill((255, 255, 255, 0), special_flags=pygame.BLEND_RGBA_MAX)
        elif k > 0.6:
            img = img.copy()
            img.set_alpha(int(255 * (1 - k) / 0.4))
        self.surface.blit(img, (int(cx - img.get_width() / 2), int(cy - img.get_height() / 2)))

    def _fx_word(self, txt, cx, cy, since, scale, color=(25, 10, 10), dur=0.3):
        if 0 <= since < dur:
            img = self.text.render(txt, scale + (1 if since < 0.05 else 0), color)
            self.surface.blit(img, (int(cx - img.get_width() / 2), int(cy - img.get_height() / 2)))

    def _fx_vs(self, since, y_frac=0.27):
        if since < 0:
            return
        sc = 9 if since < 0.035 else (7 if since < 0.07 else (5 if since < 0.1 else 4))
        vs = self.text.render("VS", sc, YELLOW)
        self.surface.blit(vs, (int(self.ax + self.arena_w / 2 - vs.get_width() / 2),
                               int(self.ay + self.arena_h * y_frac - vs.get_height() / 2)))
        if self.theme.get("stage"):
            st = self.text.fit(self.theme["stage"].upper(), 1, GOLD, self.arena_w - 20)
            self.surface.blit(st, (int(self.ax + self.arena_w / 2 - st.get_width() / 2),
                                   int(self.ay + self.arena_h - 30)))

    def _fx_names(self):
        half = self.arena_w / 2
        for side, m in enumerate(self.world.mains):
            name = self.text.fit(m.name.upper(), 2, _readable(m.color), half - 16)
            nx = self.ax + half * (0.5 if side == 0 else 1.5)
            self.surface.blit(name, (int(nx - name.get_width() / 2), int(self.ay + 24)))

    def _fx_zoom(self, since, strength=0.2, dur=0.45):
        if not 0 <= since < dur:
            return
        z = 1 + strength * (1 - since / dur) ** 2
        rect = pygame.Rect(int(self.ax), int(self.ay), int(self.arena_w), int(self.arena_h))
        area = self.surface.subsurface(rect).copy()
        zw, zh = int(rect.w * z), int(rect.h * z)
        zoomed = pygame.transform.scale(area, (zw, zh))
        self.surface.blit(zoomed, rect.topleft,
                          pygame.Rect((zw - rect.w) // 2, (zh - rect.h) // 2, rect.w, rect.h))

    def _fly_home(self, m, x0, y0, r0, t, dur=0.45, arc=0.3):
        """From (x0, y0, r0) back to the fighter's real spawn and size, in a hop. t: seconds in."""
        e = 1 - (1 - min(1.0, max(0.0, t) / dur)) ** 3
        x1, y1 = self.sx(m.x), self.sy(m.y)
        r = r0 + (m.radius * self.k - r0) * e
        if e >= 1:                               # landed: little idle bounce
            b = 0.06 * math.sin((t - dur) * 22)
            return x1, y1, r, 1 + b, 1 - b
        hop = math.sin(e * math.pi) * arc * self.arena_h
        st = 1 + 0.3 * (1 - e)
        return x0 + (x1 - x0) * e, y0 + (y1 - y0) * e - hop, r, st, 2 - st

    def _draw_intro(self):
        p = self.intro_t
        fight_at = self.intro_len - 0.45
        if p >= fight_at:
            self._draw_center_text("FIGHT!", 5, YELLOW, pop=p - fight_at)
            return
        style = self.intro_style
        black = style in ("smash", "rally") and any(0.034 <= p - h < 0.09 for h, i in
                                                   INTRO_STYLES[style]["hits"] if i >= 1)
        dim = pygame.Surface((int(self.arena_w), int(self.arena_h)), pygame.SRCALPHA)
        dim.fill((0, 0, 0, 255 if black else 120))
        self.surface.blit(dim, (self.ax, self.ay))
        getattr(self, f"_intro_{style}")(p, black)
        if (style == "faceoff" and p < INTRO_STYLES["faceoff"]["hits"][1][0]) or (style == "drop" and p < 0.5) \
                or style in ("royale", "soccer", "horde", "boss"):
            pass   # these styles show the names elsewhere / keep the sky clear for the fall
        else:
            self._fx_names()
        last_hit = max(h for h, _ in INTRO_STYLES[style]["hits"])
        self._fx_zoom(p - last_hit)

    def _intro_smash(self, p, black):
        """Wind-up, rocket in, SMASH: impact frame, hit-stop, burst, cracks, debris; fly home."""
        aw, half = self.arena_w, self.arena_w / 2
        cx0, cy0 = self.ax + half + self._ox, self.ay + self.arena_h / 2 + self._oy
        big = 0.21 * aw
        hit = INTRO_STYLES["smash"]["hits"][0][0]
        stop = hit + INTRO_STYLES["smash"]["hitstop"]
        since = p - hit

        def state(side, m, t):
            sgn = -1 if side == 0 else 1
            d0 = half - big - 4
            if t < hit:
                q = max(0.0, t) / hit
                if q < 0.3:                      # wind-up: lean back, squash
                    e = q / 0.3
                    return cx0 + sgn * (d0 - 0.06 * aw * (1 - e)), cy0, big, 1 - 0.18 * e, 1 + 0.12 * e
                e = ((q - 0.3) / 0.7) ** 2       # rocket in, stretched along the motion
                return cx0 + sgn * (d0 + (big * 0.8 - d0) * e), cy0, big, 1 + 0.4 * e, 1 - 0.22 * e
            if t < stop:                         # hit-stop: pressed together, trembling
                j = self.fx_rng.uniform(-3, 3) * self.S
                return cx0 + sgn * big * 0.7 + j, cy0 + j, big, 0.62, 1.38
            return self._fly_home(m, cx0 + sgn * big * 0.7, cy0, big, t - stop, 0.5)

        if not black:
            self._fx_cracks(cx0, cy0, since)
        self._fx_burst(cx0, cy0, since, white=black)
        if not black:
            self._fx_sprite("art/fx/intro/shockwave_ring.png", cx0, cy0, aw * 0.95, since, 0.4, 0.7)
        self._draw_charge(state, p, hit, black)
        if not black:
            self._fx_sprite("art/fx/intro/clash_star.png", cx0, cy0, aw * 0.62, since - 0.02, 0.32)
            self._fx_debris(cx0, cy0, since)
            self._fx_word("SMASH!", cx0, cy0, since - 0.02, 3, dur=0.33)
        self._fx_vs(p - stop)

    def _draw_charge(self, state, p, hit, white):
        """Both fighters, with afterimages and speed lines while they rush in before `hit`."""
        aw = self.arena_w
        for side, m in enumerate(self.world.mains):
            if hit * 0.3 < p < hit:
                for lag, a in ((0.05, 70), (0.025, 130)):
                    x, y, r, sx_, sy_ = state(side, m, p - lag)
                    self._token_squash(m, x, y, r, sx_, sy_, alpha=a)
                x, y, r, _, _ = state(side, m, p)
                sgn = -1 if side == 0 else 1
                for i, dy in enumerate((-0.7, -0.35, 0, 0.35, 0.7)):
                    ln = (0.1 + 0.25 * p / hit) * aw * (1.0 if i % 2 == 0 else 0.6)
                    xa = x - sgn * r * 1.2
                    pygame.draw.line(self.surface, CREAM, (xa, y + dy * r), (xa - sgn * ln, y + dy * r),
                                     max(2, int(4 * self.S)))
            x, y, r, sx_, sy_ = state(side, m, p)
            self._token_squash(m, x, y, r, sx_, sy_, white=white)

    def _intro_drop(self, p, black):
        """Both fall out of the sky and crater the floor (BOOM-BOOM), flex, then hop home."""
        aw, ah, half = self.arena_w, self.arena_h, self.arena_w / 2
        cx0, cy0 = self.ax + half + self._ox, self.ay + ah / 2 + self._oy
        big = 0.2 * aw
        hits = [h for h, _ in INTRO_STYLES["drop"]["hits"]]
        land_y = cy0 + 0.06 * ah
        surf = self.surface
        for side in (0, 1):                      # craters, dust and burst under each landing
            sgn = -1 if side == 0 else 1
            lx, since = cx0 + sgn * 0.24 * aw, p - hits[side]
            self._fx_cracks(lx, land_y + big * 0.8, since, 0.55)
            if 0 <= since < 0.4:
                k = since / 0.4
                rect = pygame.Rect(0, 0, int(big * (2 + 3 * k)), int(big * (0.5 + 0.8 * k)))
                rect.center = (int(lx), int(land_y + big * 0.85))
                pygame.draw.ellipse(surf, _mix((220, 200, 170), (80, 70, 60), k), rect,
                                    max(2, int(8 * (1 - k) * self.S)))
            self._fx_burst(lx, land_y + big * 0.6, since, size=0.5 if side == 0 else 0.7, dur=0.3)
        for side, m in enumerate(self.world.mains):   # each hero's signature entrance on landing
            lx = cx0 + (-1 if side == 0 else 1) * 0.24 * aw
            self._fx_sprite(f"art/fx/intro/enter_{_art_id(m)}.png", lx, land_y + big * 0.2, big * 3.0,
                            p - hits[side], 0.55, 0.3)
        for side, m in enumerate(self.world.mains):
            sgn = -1 if side == 0 else 1
            h = hits[side]
            lx = cx0 + sgn * 0.24 * aw
            if p < h:                            # falling: shadow grows, body stretched
                e = (max(0.0, p) / h) ** 2
                y0 = self.ay + big * 0.9 - 0.15 * ah * (1 - side)   # left starts a bit higher
                y = y0 + (land_y - y0) * e
                sh = pygame.Rect(0, 0, int(big * 2 * (0.4 + 0.6 * e)), int(big * 0.45 * (0.4 + 0.6 * e)))
                sh.center = (int(lx), int(land_y + big * 0.9))
                pygame.draw.ellipse(surf, (0, 0, 0), sh)
                for dx in (-0.5, 0, 0.5):
                    pygame.draw.line(surf, CREAM, (lx + dx * big, y - big * 1.1),
                                     (lx + dx * big, y - big * (1.6 + 1.2 * e)), max(2, int(4 * self.S)))
                self._token_squash(m, lx, y, big, 0.8, 1.3)
                continue
            since = p - h
            home_at = 0.85
            if p < home_at:
                sq = max(0.0, 1 - since / 0.14)  # squash on landing, then flex toward the rival
                sx_, sy_ = 1 + 0.5 * sq, 1 - 0.38 * sq
                lean = 0.04 * aw * min(1.0, max(0.0, (p - 0.5) / 0.15)) if p > 0.5 else 0
                j = self.fx_rng.uniform(-2, 2) * self.S if p > 0.5 else 0
                self._token_squash(m, lx - sgn * lean + j, land_y + big * (1 - sy_), big, sx_, sy_)
            else:
                x, y, r, sx_, sy_ = self._fly_home(m, lx - sgn * 0.04 * aw, land_y, big, p - home_at, 0.4, 0.15)
                self._token_squash(m, x, y, r, sx_, sy_)
        self._fx_debris(cx0 + 0.24 * aw, land_y + big * 0.8, p - hits[1], 0.7)
        self._fx_word("BOOM!", cx0 - 0.24 * aw, land_y + big * 1.45, p - hits[0], 3, YELLOW, 0.28)
        self._fx_word("BOOM!", cx0 + 0.24 * aw, land_y + big * 1.45, p - hits[1], 3, YELLOW, 0.28)
        self._fx_vs(p - 0.5)

    def _intro_faceoff(self, p, black):
        """Fighting-game split screen: giant portraits on their colours, lightning down the
        split, VS slam; then the screen shatters and they drop into the arena."""
        aw, ah, half = self.arena_w, self.arena_h, self.arena_w / 2
        ax, ay = self.ax + self._ox, self.ay + self._oy
        surf = self.surface
        vs_at, shatter = (h for h, _ in INTRO_STYLES["faceoff"]["hits"])
        mains = self.world.mains
        R = 0.3 * aw
        slide = 1 - (1 - min(1.0, (p + 0.06) / 0.16)) ** 3
        centers = [(ax + 0.26 * aw - (1 - slide) * 0.6 * aw, ay + 0.47 * ah),
                   (ax + 0.74 * aw + (1 - slide) * 0.6 * aw, ay + 0.55 * ah)]
        if p < shatter:
            top, bot = (ax + half + 0.12 * aw, ay), (ax + half - 0.12 * aw, ay + ah)
            pygame.draw.polygon(surf, _shade(mains[0].color, 0.5), [(ax, ay), top, bot, (ax, ay + ah)])
            pygame.draw.polygon(surf, _shade(mains[1].color, 0.5), [top, (ax + aw, ay), (ax + aw, ay + ah), bot])
            # speed-line rays behind each portrait
            for side, (cx, cy) in enumerate(centers):
                for i in range(10):
                    a = i * math.pi / 5 + p * (2 if side == 0 else -2)
                    pygame.draw.line(surf, _mix(mains[side].color, (255, 255, 255), 0.3),
                                     (cx + math.cos(a) * R * 1.15, cy + math.sin(a) * R * 1.15),
                                     (cx + math.cos(a) * R * 1.7, cy + math.sin(a) * R * 1.7),
                                     max(2, int(5 * self.S)))
            push = 1 + 0.1 * p                   # slow push-in: the tension builds
            for side, m in enumerate(mains):
                cx, cy = centers[side]
                j = self.fx_rng.uniform(-1.5, 1.5) * self.S * (1 + 3 * p)
                self._token_squash(m, cx + j, cy + j, R * push)
                name = self.text.fit(m.name.upper(), 3, _readable(m.color), half - 8)
                surf.blit(name, (int(cx - name.get_width() / 2),
                                 int(cy + R * push * 1.05 if side == 0 else cy - R * push * 1.05 - name.get_height())))
            # lightning crackling down the split (re-jagged every frame)
            if p > 0.05:
                pts = []
                for i in range(11):
                    k = i / 10
                    x = top[0] + (bot[0] - top[0]) * k + (self.fx_rng.uniform(-1, 1) * 0.035 * aw if 0 < i < 10 else 0)
                    pts.append((x, top[1] + (bot[1] - top[1]) * k))
                bright = 0.6 + 0.4 * self.fx_rng.random()
                pygame.draw.lines(surf, _mix((90, 200, 255), (255, 255, 255), bright), False, pts,
                                  max(4, int(12 * self.S)))
                pygame.draw.lines(surf, (255, 255, 255), False, pts, max(2, int(4 * self.S)))
            if p >= vs_at:
                dt = p - vs_at
                sc = 10 if dt < 0.035 else (8 if dt < 0.07 else 6)
                vs = self.text.render("VS", sc, YELLOW)
                surf.blit(vs, (int(ax + half - vs.get_width() / 2), int(ay + ah / 2 - vs.get_height() / 2)))
            return
        since = p - shatter                      # shatter: shards of both colours, fly home
        cx0, cy0 = ax + half, ay + ah / 2
        self._fx_sprite("art/fx/intro/shockwave_ring.png", cx0, cy0, aw * 1.0, since, 0.4, 0.7)
        self._fx_sprite("art/fx/intro/debris_burst.png", cx0, cy0, aw * 0.7, since, 0.35)
        self._fx_burst(cx0, cy0, since, 1.0)
        self._fx_debris(cx0, cy0, since, 1.2, colors=[mains[0].color, mains[1].color, (255, 255, 255)])
        for side, m in enumerate(mains):
            x, y, r, sx_, sy_ = self._fly_home(m, *centers[side], R * 1.1, since, 0.35, 0.1)
            self._token_squash(m, x, y, r, sx_, sy_)
        self._fx_vs(since + 1, y_frac=0.27)

    def _intro_rally(self, p, black):
        """Three collisions that escalate: BAM! BAM!! then a full SMASH!!!; fly home."""
        aw, half = self.arena_w, self.arena_w / 2
        cx0, cy0 = self.ax + half + self._ox, self.ay + self.arena_h / 2 + self._oy
        big = 0.19 * aw
        cfg = INTRO_STYLES["rally"]
        (h1, _), (h2, _), (h3, _) = cfg["hits"]
        stop = h3 + cfg["hitstop"]
        d0 = half - big - 4
        c = big * 0.8
        keys = [(0.0, d0), (h1, c), ((h1 + h2) / 2, 0.5 * d0), (h2, c), ((h2 + h3) / 2, 0.85 * d0), (h3, c)]

        def state(side, m, t):
            sgn = -1 if side == 0 else 1
            t = max(0.0, t)
            if t < h3:
                for (ta, da), (tb, db) in zip(keys, keys[1:]):
                    if ta <= t < tb:
                        k = (t - ta) / (tb - ta)
                        inward = db < da
                        e = k * k if inward else 1 - (1 - k) ** 2
                        d = da + (db - da) * e
                        st = 1 + (0.35 * e if inward else 0.2 * (1 - k))
                        sq = (1 + 0.3 * (1 - k)) if not inward else 1   # squashed just after a hit
                        return cx0 + sgn * d, cy0, big, st / sq, (2 - st) * sq
            if t < stop:
                j = self.fx_rng.uniform(-3, 3) * self.S
                return cx0 + sgn * big * 0.7 + j, cy0 + j, big, 0.62, 1.38
            return self._fly_home(m, cx0 + sgn * big * 0.7, cy0, big, t - stop, 0.45)

        self._fx_cracks(cx0, cy0, -1 if black else p - h3)
        self._fx_burst(cx0, cy0, p - h1, 0.35, dur=0.2)
        self._fx_burst(cx0, cy0, p - h2, 0.6, dur=0.25)
        self._fx_burst(cx0, cy0, p - h3, 1.0, white=black)
        for side, m in enumerate(self.world.mains):
            x, y, r, sx_, sy_ = state(side, m, p)
            self._token_squash(m, x, y, r, sx_, sy_, white=black)
        if not black:
            self._fx_debris(cx0, cy0, p - h2, 0.4)
            self._fx_debris(cx0, cy0, p - h3, 1.0)
            ty = cy0 - 0.3 * self.arena_h
            self._fx_word("BAM!", cx0, ty, p - h1, 2, YELLOW, 0.22)
            self._fx_word("BAM!!", cx0, ty, p - h2, 3, YELLOW, 0.26)
            self._fx_word("SMASH!!!", cx0, cy0, p - h3 - 0.02, 3, dur=0.3)
        self._fx_vs(p - stop)

    def _cta_lift(self, since):
        """0 -> 1 as the winner card slides up to make room for the end CTA."""
        if not self.cta_on:
            return 0.0
        k = min(1.0, max(0.0, (since - cta.CTA_AT) / 0.2))
        return 1 - (1 - k) ** 3

    def _draw_fan_credit(self, t):
        """Fan heroes: a card that pops up in the lower arena with the prediction strip:
        "<HERO> . HERO IDEA BY" over a big "@viewer" (the viewer's moment)."""
        fans = [f for f in self.spec.get("fighters", []) if isinstance(f, dict) and (f.get("fan") or {}).get("by")]
        if not fans:
            return
        a, b = cta.PREDICT
        b += 1.0
        if not a <= t < b:
            return
        age, left = t - a, b - t
        fade = max(0.0, min(1.0, left / 0.25))
        # pop: 0.55 -> 1.15 -> 1.0 in the first 0.4 s, then a slow pulse
        if age < 0.22:
            sc = 0.55 + 0.6 * age / 0.22
        elif age < 0.4:
            sc = 1.15 - 0.15 * (age - 0.22) / 0.18
        else:
            sc = 1.0 + 0.03 * math.sin((age - 0.4) * 6)
        f = fans[0]
        maxw = self.arena_w - 40
        top = self.text.fit(f"{f['name'].upper()} . HERO IDEA BY", 2, CREAM, maxw)
        handle = self.text.fit(f["fan"]["by"].upper(), 4, YELLOW, maxw)
        w = max(top.get_width(), handle.get_width()) + 36
        h = top.get_height() + handle.get_height() + 30
        card = pygame.Surface((w, h), pygame.SRCALPHA)
        card.fill((*NIGHT, 225))
        pygame.draw.rect(card, YELLOW, card.get_rect(), 4)
        pygame.draw.rect(card, (*NIGHT, 255), card.get_rect().inflate(-8, -8), 2)
        card.blit(top, ((w - top.get_width()) // 2, 10))
        card.blit(handle, ((w - handle.get_width()) // 2, 18 + top.get_height()))
        if abs(sc - 1.0) > 1e-3:
            card = pygame.transform.scale_by(card, sc)
        if fade < 1:
            card.set_alpha(int(255 * fade))
        cx = self.ax + self.arena_w / 2
        cy = self.ay + self.arena_h * 0.74
        self.surface.blit(card, (int(cx - card.get_width() / 2), int(cy - card.get_height() / 2)))

    def _draw_predict_strip(self, t):
        """Prediction prompt: a see-through banner across the top of the arena."""
        a, b = cta.PREDICT
        k = max(0.0, min(1.0, (t - a) / 0.15, (b - t) / 0.2))
        col = YELLOW if int(t * 4) % 2 == 0 else CREAM
        img = self.text.fit("GUESS THE SCORE! COMMENT!" if self.horde else "WHO WINS? COMMENT!", 2, col, self.arena_w - 16)
        band = pygame.Surface((int(self.arena_w), img.get_height() + 10), pygame.SRCALPHA)
        band.fill((*NIGHT, int(170 * k)))
        y = int(self.ay + 6)
        self.surface.blit(band, (int(self.ax), y))
        if k < 1:
            img = img.copy()
            img.set_alpha(int(255 * k))
        self.surface.blit(img, (int(self.ax + self.arena_w / 2 - img.get_width() / 2), y + 5))

    def _draw_end_cta(self, since):
        """Under the winner card: ask for the next matchup, then a hand clicks LIKE and SUBSCRIBE."""
        surf = self.surface
        cw, ch = int(min(self.arena_w - 8, 416)), 214
        pop = min(1.0, (since - cta.CTA_AT) / 0.18)
        x = int(self.ax + (self.arena_w - cw) / 2)
        y = int(self.ay + 14 + 156 + 14 + (1 - pop) * 60)
        self._panel((x, y, cw, ch), trim=GOLD)
        t1 = self.text.fit("WHICH BOSS NEXT?" if self.boss_mode else "CREATE A HERO!", 3, YELLOW, cw - 24)
        surf.blit(t1, (x + (cw - t1.get_width()) // 2, y + 14))
        t2 = self.text.fit("COMMENT A BOSS!" if self.boss_mode else "COMMENT: NAME + POWER", 3, CREAM, cw - 50)
        ty = y + 22 + t1.get_height()
        surf.blit(t2, (x + (cw - t2.get_width()) // 2, ty))
        bob = int(3 * math.sin(since * 12))      # little arrows pointing down at the comments
        for ax_ in (x + 8, x + cw - 22):
            pygame.draw.polygon(surf, YELLOW, [(ax_, ty + bob), (ax_ + 14, ty + bob), (ax_ + 7, ty + 12 + bob)])

        by, bh = y + ch - 76, 56
        liked, subbed = since >= cta.LIKE_CLICK, since >= cta.SUB_CLICK
        like = pygame.Rect(x + 12, by, 134, bh)
        subr = pygame.Rect(x + 154, by, cw - 166, bh)
        for rect, clicked_at in ((like, cta.LIKE_CLICK), (subr, cta.SUB_CLICK)):
            if 0 <= since - clicked_at < 0.12:
                rect.move_ip(0, 3)               # pressed
        # LIKE
        surf.fill(INK, like)
        surf.fill((60, 120, 230) if liked else PANEL_HI, like.inflate(-4, -4))
        th = self.sprites.load("art/fx/thumbs_up.png")
        isz = 40 + (10 if 0 <= since - cta.LIKE_CLICK < 0.15 else 0)
        if th is not None:
            img = self.sprites.scaled("art/fx/thumbs_up.png", isz, isz)
            surf.blit(img, (like.x + 30 - img.get_width() // 2, like.centery - img.get_height() // 2))
        lt = self.text.render("LIKE", 2, CREAM)
        surf.blit(lt, (like.x + 58, like.centery - lt.get_height() // 2))
        # SUBSCRIBE -> SUBSCRIBED + ringing bell
        surf.fill(INK, subr)
        surf.fill((95, 95, 105) if subbed else (205, 30, 35), subr.inflate(-4, -4))
        st = self.text.fit("SUBSCRIBED" if subbed else "SUBSCRIBE", 2, CREAM, subr.w - (48 if subbed else 12))
        sx_ = subr.x + (subr.w - st.get_width() - (40 if subbed else 0)) // 2
        surf.blit(st, (sx_, subr.centery - st.get_height() // 2))
        if subbed and self.sprites.load("art/fx/bell.png") is not None:
            bell = self.sprites.scaled("art/fx/bell.png", 34, 34)
            ring = since - cta.SUB_CLICK
            bell = pygame.transform.rotate(bell, 18 * math.sin(ring * 30) * max(0.0, 1 - ring / 0.8))
            surf.blit(bell, (sx_ + st.get_width() + 22 - bell.get_width() // 2, subr.centery - bell.get_height() // 2))

        # the pointer hand: enters from the lower right, clicks LIKE, then SUBSCRIBE
        hand = self.sprites.load("art/fx/pointer_hand.png")
        if hand is None:
            return
        def ease(a, b, t0, t1):
            k = min(1.0, max(0.0, (since - t0) / (t1 - t0)))
            k = 1 - (1 - k) ** 3
            return a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k
        start = (x + cw + 40, y + ch + 120)
        on_like, on_sub = (like.x + 34, like.centery + 6), (subr.centerx, subr.centery + 6)
        if since < cta.LIKE_CLICK:
            hx, hy = ease(start, on_like, cta.CTA_AT + 0.15, cta.LIKE_CLICK - 0.08)
        else:
            hx, hy = ease(on_like, on_sub, cta.LIKE_CLICK + 0.15, cta.SUB_CLICK - 0.08)
        press = any(0 <= since - c < 0.12 for c in (cta.LIKE_CLICK, cta.SUB_CLICK))
        hs = 52 if press else 60
        img = self.sprites.scaled("art/fx/pointer_hand.png", hs, hs)
        surf.blit(img, (int(hx - img.get_width() * 0.45), int(hy)))

    def _draw_winner_card(self, lift=0.0):
        if self.soccer:
            return self._draw_soccer_winner(lift)
        if self.boss_mode:
            return self._draw_boss_card(lift)
        side = self.world.winner_side
        cw, ch = 400, 156
        x = int(self.ax + (self.arena_w - cw) / 2)
        y = int(self.ay + (self.arena_h - ch) / 2 + ((self.ay + 14) - (self.ay + (self.arena_h - ch) / 2)) * lift)
        self._panel((x, y, cw, ch), trim=GOLD)
        if side is None:
            img = self.text.render("DRAW", 4, CREAM)
            self.surface.blit(img, (x + (cw - img.get_width()) // 2, y + (ch - img.get_height()) // 2))
            return
        m = self.world.mains[side]
        self._draw_token(m, x + 62, y + ch // 2 + 4, 36, status=False, pose="victory" if m.alive else None)
        name = self.text.fit(m.name.upper(), 3, _readable(m.color), cw - 140)
        self.surface.blit(name, (x + 120, y + 18))
        wins = self.text.render("WINS!", 3, YELLOW)
        self.surface.blit(wins, (x + 120, y + 18 + name.get_height()))
        if self.royale:
            k = self.world.kills.get(side, 0)
            note = f"LAST ONE STANDING . {k} KILL{'S' if k != 1 else ''}"
        elif m.alive:
            hp = max(1, math.ceil(m.hp - 1e-6))
            note = f"WITH {hp} HP LEFT!" if hp <= 0.15 * m.max_hp else f"{hp} HP LEFT"
        else:
            note = "MINIONS FINISHED IT!"
        img = self.text.fit(note, 1, CREAM, cw - 140)
        self.surface.blit(img, (x + 120, y + ch - 30))


class _Defaults(dict):
    def __missing__(self, key):
        return 0.0


COVER_HOOK = {"royale": "WHO SURVIVES?", "horde": "HOW MANY?", "boss": "CAN THEY WIN?"}


def _save_cover(r, size, path):
    """The video's cover: the intro's VS moment (full HP, nothing decided yet) with a big
    question banner. Never a frame from the fight, so it can't give the result away."""
    if r.spec.get("mode") in (None, "1v1") and len(r.world.mains) == 2:
        _vs_poster(r)
    snap = r.surface.copy()
    hook = COVER_HOOK.get(r.spec.get("mode"), "WHO WINS?")
    img = r.text.fit(hook, 6, YELLOW, IW - 40)
    band_h = img.get_height() + 36
    y = int(r.ay + r.arena_h * 0.04)
    band = pygame.Surface((IW, band_h), pygame.SRCALPHA)
    band.fill((10, 8, 20, 200))
    snap.blit(band, (0, y))
    snap.fill(YELLOW, (0, y, IW, 4))
    snap.fill(YELLOW, (0, y + band_h - 4, IW, 4))
    snap.blit(img, (IW // 2 - img.get_width() // 2, y + 18))
    pygame.image.save(pygame.transform.scale(snap, size), path)


def _vs_poster(r):
    """Draw a fighting-game VS poster over the arena: two big heroes facing off."""
    surf = r.surface
    surf.blit(r.floor, (r.ax, r.ay))
    shade = pygame.Surface((int(r.arena_w), int(r.arena_h)), pygame.SRCALPHA)
    shade.fill((0, 0, 0, 90))
    surf.blit(shade, (r.ax, r.ay))
    aw, ah = r.arena_w, r.arena_h
    big = aw * 0.27
    for side, m in enumerate(r.world.mains):
        cx = r.ax + aw * (0.27 if side == 0 else 0.73)
        cy = r.ay + ah * (0.58 if side == 0 else 0.62)
        glow = pygame.Surface((int(big * 2.8), int(big * 2.8)), pygame.SRCALPHA)
        for i, a in ((1.0, 40), (0.75, 60), (0.5, 80)):
            pygame.draw.circle(glow, (*_readable(m.color), a), (glow.get_width() // 2,) * 2, int(big * 1.35 * i))
        surf.blit(glow, glow.get_rect(center=(int(cx), int(cy))))
        r._token_squash(m, cx, cy, big)
        name = r.text.fit(m.name.upper(), 4, _readable(m.color), aw * 0.48)
        surf.blit(name, (int(cx - name.get_width() / 2), int(cy + big * 1.15)))
    vs = r.text.render("VS", 9, YELLOW)
    surf.blit(vs, (int(r.ax + aw / 2 - vs.get_width() / 2), int(r.ay + ah * 0.6 - vs.get_height() / 2)))


def render_video(spec, seed, out_path, width=IW * 2, height=IH * 2, fps=60,
                 end_hold=None, thumb_time=None, thumb_path=None, slowmo_at=None, log=print,
                 cover_path=None):
    """slowmo_at: sim time of the finishing blow; the moments around it play at 1/3 speed.
    cover_path: save a spoiler-free cover image (.jpg) taken from the intro."""
    if end_hold is None:
        end_hold = float(spec.get("end_hold", 2.0))
    scale = max(1, width // IW)
    out_size = (IW * scale, IH * scale)
    world = World(spec, seed)
    r = Renderer(spec, world)
    stride = max(1, round(FPS / fps))
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    proc = subprocess.Popen([
        ffmpeg, "-y", "-loglevel", "error",
        "-f", "rawvideo", "-pix_fmt", "rgb24", "-s", f"{out_size[0]}x{out_size[1]}",
        "-r", str(FPS / stride), "-i", "-",
        "-c:v", "libx264", "-preset", "medium", "-crf", "20",
        "-pix_fmt", "yuv420p", "-movflags", "+faststart", out_path,
    ], stdin=subprocess.PIPE)

    scan = None
    if scale >= 2:   # light CRT scanlines on the last output row of every pixel row
        scan = pygame.Surface(out_size, pygame.SRCALPHA)
        for yy in range(scale - 1, out_size[1], scale):
            scan.fill((0, 0, 0, 34), (0, yy, out_size[0], 1))

    thumb_saved = False
    frames = 0
    first = None        # the opening frame: the ending dissolves back into it (seamless loop)
    blend = None        # 0..1 while dissolving
    out_fps = FPS / stride
    timemap = []   # (sim time, video time) after every sim step, for the audio mixer

    def emit_frame():
        nonlocal frames, thumb_saved, first
        r.draw()
        out = r.surface if scale == 1 else pygame.transform.scale(r.surface, out_size)
        if scan is not None:
            out.blit(scan, (0, 0))
        if first is None:
            first = out.copy()
        elif blend is not None:
            out = out.copy() if scale == 1 else out
            first.set_alpha(int(255 * blend))
            out.blit(first, (0, 0))
        proc.stdin.write(pygame.image.tobytes(out, "RGB"))
        frames += 1
        if thumb_path and not thumb_saved and thumb_time is not None and world.t >= thumb_time:
            pygame.image.save(out, thumb_path)
            thumb_saved = True

    try:
        r.phase = "intro"
        cover_at = max(0.0, r.intro_len - 0.6)    # VS is up, "FIGHT!" not yet
        for i in range(int(r.intro_len * FPS / stride)):
            r.intro_t = i * stride / FPS
            emit_frame()
            if cover_path and cover_at is not None and r.intro_t >= cover_at:
                _save_cover(r, out_size, cover_path)
                cover_at = None
        r.phase = "fight"
        while not world.done:
            world.step()
            r.t = world.t + r.t_off
            r.ingest(world.frame_events)
            slow = (slowmo_at is not None
                    and slowmo_at - SLOWMO_BEFORE <= world.t <= slowmo_at + SLOWMO_AFTER)
            if slow:
                # 3 output frames per sim frame at 60 fps (1.5 on average at 30 fps)
                copies = 3 if stride == 1 else (2 if world.frame % 2 else 1)
                for _ in range(copies):
                    emit_frame()
            elif world.frame % stride == 0 or world.done:
                emit_frame()
            timemap.append((world.t, max(0, frames - 1) / out_fps))
            if r.pause_goal is not None:   # soccer goal: freeze the action for GOAL_PAUSE
                n = max(1, int(GOAL_PAUSE * FPS / stride))
                for i in range(n):
                    r.pause_p = i / n
                    r.t += stride / FPS
                    emit_frame()
                r.t_off += n * stride / FPS
                r.pause_p, r.pause_goal = None, None
            if world.frame % (FPS * 10) == 0:
                log(f"  [render] {world.t:5.1f}s")
        n_hold = int(end_hold * FPS / stride)
        n_blend = min(n_hold, int(LOOP_BLEND * FPS / stride))
        for i in range(n_hold):
            r.t += stride / FPS
            k = i - (n_hold - n_blend)
            blend = (k + 1) / n_blend if k >= 0 else None   # ease into the first frame
            if blend is not None:
                blend = blend * blend * (3 - 2 * blend)
            emit_frame()
        if thumb_path and not thumb_saved:
            out = pygame.transform.scale(r.surface, out_size) if scale > 1 else r.surface
            pygame.image.save(out, thumb_path)
    finally:
        proc.stdin.close()
        proc.wait()
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg exited with {proc.returncode}")
    return world, frames, timemap
