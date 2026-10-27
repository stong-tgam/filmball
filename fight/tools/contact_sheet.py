"""
Contact sheet of art candidates for review: every PNG in a folder, scaled up, labelled.

    python tools/contact_sheet.py art/_candidates/intro [out.png] [--cols 5] [--cell 220]
Floor tiles (*_floor.png) are shown tiled 2x2 so seams are visible.
"""

import argparse
import glob
import os

os.environ.setdefault("PYGAME_HIDE_SUPPORT_PROMPT", "1")
os.environ.setdefault("SDL_VIDEODRIVER", "dummy")
import pygame  # noqa: E402


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("folder")
    ap.add_argument("out", nargs="?")
    ap.add_argument("--cols", type=int, default=5)
    ap.add_argument("--cell", type=int, default=220)
    a = ap.parse_args()
    pygame.init()
    pygame.display.set_mode((1, 1))
    files = sorted(glob.glob(os.path.join(a.folder, "*.png")))
    if not files:
        raise SystemExit("no PNGs in " + a.folder)
    cell, lab = a.cell, 26
    rows = (len(files) + a.cols - 1) // a.cols
    sheet = pygame.Surface((a.cols * cell, rows * (cell + lab)))
    sheet.fill((34, 36, 48))
    font = pygame.font.SysFont("consolas,arial", 15)
    for i, f in enumerate(files):
        x, y = (i % a.cols) * cell, (i // a.cols) * (cell + lab)
        # checker backdrop shows transparency
        for cy in range(0, cell, 20):
            for cx in range(0, cell, 20):
                c = (58, 60, 74) if (cx // 20 + cy // 20) % 2 else (46, 48, 60)
                sheet.fill(c, (x + cx, y + cy, 20, 20))
        img = pygame.image.load(f).convert_alpha()
        if f.endswith("_floor.png"):
            w, h = img.get_size()
            t = pygame.Surface((w * 2, h * 2), pygame.SRCALPHA)
            for ty in range(2):
                for tx in range(2):
                    t.blit(img, (tx * w, ty * h))
            img = t
        w, h = img.get_size()
        k = min((cell - 12) / w, (cell - 12) / h)
        img = pygame.transform.scale(img, (max(1, int(w * k)), max(1, int(h * k))))
        sheet.blit(img, (x + (cell - img.get_width()) // 2, y + (cell - img.get_height()) // 2))
        name = os.path.splitext(os.path.basename(f))[0]
        sheet.blit(font.render(f"{i + 1}. {name}", True, (230, 230, 240)), (x + 6, y + cell + 4))
    out = a.out or os.path.join(os.path.dirname(os.path.normpath(a.folder)), "_sheets",
                                os.path.basename(os.path.normpath(a.folder)) + ".png")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    pygame.image.save(sheet, out)
    print(out)


if __name__ == "__main__":
    main()
