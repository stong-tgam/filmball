"""
Draw every roster character (and its summon) on one sheet: out/roster.png.

    python tools/roster_sheet.py
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fightsim.render import Renderer, _readable, pygame  # noqa: E402
from fightsim.sim import Unit, World  # noqa: E402
from fightsim.spec import ROOT, build_matchup, finalize, list_characters, load_character  # noqa: E402

W, H = 1080, 2000
COLS, ROWS = 2, 5
CELL_W, CELL_H = W // COLS, (H - 120) // ROWS


def wrap(text, width):
    words, lines, cur = text.split(), [], ""
    for w in words:
        if len(cur) + len(w) + 1 > width:
            lines.append(cur)
            cur = w
        else:
            cur = f"{cur} {w}".strip()
    return lines + [cur] if cur else lines


def main():
    roster = list_characters()
    sheet = pygame.Surface((W, H))
    for y in range(H):
        c = int(40 - 25 * y / H)
        pygame.draw.line(sheet, (c, c + 10, c + 30), (0, y), (W, y))

    r = None
    for i, cid in enumerate(roster):
        other = roster[(i + 1) % len(roster)]
        spec = finalize(build_matchup(cid, other))
        world = World(spec, 7)
        if r is None:
            r = Renderer(spec, world, W, H)
            r.surface = sheet
            title = r.text.render("ROSTER", 5, (255, 255, 255))
            sheet.blit(title, ((W - title.get_width()) / 2, 20))
        r.world = world
        r.k = 1.0
        r.S = 1.0
        col, row = i % COLS, i // COLS
        r.ax, r.ay = col * CELL_W, 120 + row * CELL_H
        r._ox = r._oy = 0.0

        u = world.mains[0]
        u.x, u.y = 150, CELL_H * 0.42
        # pose: aimed weapons point right, others up-right, keeping multi-blade offsets
        for b, bspec in zip(u.blades, load_character(cid).get("blades", [])):
            b.angle = 0.0 if b.aim else -0.5 + math.radians(float(bspec.get("offset_deg", 0)))
        r._draw_body(u)
        for b in u.blades:
            r._draw_blade(b)
        r._draw_hp(u)

        ch = load_character(cid)
        summons = ch.get("summons", {})
        if summons:
            sid, stpl = next(iter(summons.items()))
            stpl = dict(stpl, id=sid)
            m = Unit(world, stpl, 0, 999, 330, CELL_H * 0.30, 0.0, is_main=False)
            for b in m.blades:
                b.angle = -0.6
            r._draw_body(m)
            for b in m.blades:
                r._draw_blade(b)
            r._draw_hp(m)
            lbl = r.text.render(stpl.get("name", sid), 2, (220, 220, 220), "s")
            sheet.blit(lbl, (r.ax + 330 - lbl.get_width() / 2, r.ay + CELL_H * 0.30 + 52))

        name = r.text.render(f"{u.name}", 3, _readable(u.color))
        sheet.blit(name, (r.ax + 270, r.ay + CELL_H * 0.52))
        y = r.ay + CELL_H * 0.70
        for line in wrap(ch.get("blurb", ""), 40):
            img = r.text.render(line, 2, (230, 230, 235), "s")
            sheet.blit(img, (r.ax + 24, y))
            y += 32

    out = os.path.join(ROOT, "out", "roster.png")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    pygame.image.save(sheet, out)
    print(out)


if __name__ == "__main__":
    main()
