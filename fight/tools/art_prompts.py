"""
Build PixelLab art prompts for the whole roster.

Reads the "art" block of every characters/<id>.json and writes:
  art/palette.png          forced palette (Arena-28) for PixelLab's color_image / target_palette
  art/pixellab_jobs.json   one job per sprite: endpoint, params, output path (for a script/MCP)
  art/PIXELLAB_PROMPTS.md  the same as a copy-paste guide

    python tools/art_prompts.py
"""

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fightsim.palette import PALETTE, hex_list, rgb  # noqa: E402
from fightsim.spec import ROOT, list_characters, load_character  # noqa: E402

ART_DIR = os.path.join(ROOT, "art")

STYLE = ("16-bit pixel art game sprite, crisp chunky pixels, bold black outline, bright "
         "saturated colors, clean readable silhouette, centered on a transparent background, "
         "no text, no frame")
STYLE_DESC = ("chunky 16-bit fighting-game pixel art, bold 1px black outline, basic two-tone "
              "shading, bright saturated colors")

# Fixed settings for every sprite (values are PixelLab API enums)
SETTINGS = {
    "no_background": True,
    "outline": "single color black outline",
    "shading": "basic shading",
    "detail": "medium detail",
    "text_guidance_scale": 8,
    "color_image": "art/palette.png",
}

TEMPLATES = {
    "body": ("A head-only round ball character with no arms, no legs and no torso: {d}. "
             "Front view, facing the viewer. A cute but tough fighting-game character token: "
             "one big round ball shape fills about 80% of the canvas, and any hat, hood or "
             "headwear may stick out above it. {style}"),
    "summon": ("A head-only round ball minion with no arms and no legs: {d}. Front view, facing "
               "the viewer. One round ball shape fills about 85% of the canvas. {style}"),
    "weapon": ("{d}. A single weapon lying horizontally and pointing to the right: handle at "
               "the left edge, tip at the right edge, no hand, no character. {style}"),
    "projectile": "{d}. Flying to the right. A small game projectile sprite. {style}",
    "icon": ("{d}. A square ability icon: one bold simple symbol, centered, readable at tiny "
             "size. {style}"),
}

SIZES = {"body": 64, "summon": 32, "weapon": 64, "projectile": 32, "icon": 32}

UI_JOBS = [
    ("floor_stone", "seamless tileable floor tile of smooth blue-grey stone slabs, viewed from directly above, subtle cracks"),
    ("floor_sand", "seamless tileable floor tile of sandy desert arena ground with tiny pebbles, viewed from directly above"),
    ("floor_grass", "seamless tileable floor tile of short meadow grass with a few tiny flowers, viewed from directly above"),
    ("floor_clay", "seamless tileable floor tile of warm terracotta clay bricks, viewed from directly above"),
    ("floor_dungeon", "seamless tileable floor tile of dark cobblestone dungeon floor with moss in the gaps, viewed from directly above"),
]


def write_palette():
    from fightsim.render import pygame  # headless pygame, already initialised there
    cols = hex_list()
    sw = 8
    surf = pygame.Surface((sw * len(cols), sw))
    for i, name in enumerate(PALETTE):
        pygame.draw.rect(surf, rgb(name), (i * sw, 0, sw, sw))
    os.makedirs(ART_DIR, exist_ok=True)
    pygame.image.save(surf, os.path.join(ART_DIR, "palette.png"))


def job(jid, kind, desc, out, anchor=None, extra=None):
    """Anchors are generated from text; everything else copies an anchor's style."""
    size = SIZES[kind]
    prompt = TEMPLATES[kind].format(d=desc, style=STYLE)
    views = {"weapon": ("side", "east"), "projectile": ("side", "east")}
    view, direction = views.get(kind, ("side", "south"))
    if anchor is None:
        j = {"id": jid, "kind": kind, "step": 1, "endpoint": "create-image-pixflux", "out": out,
             "params": dict(SETTINGS, description=prompt,
                            image_size={"width": size, "height": size},
                            view=view, direction=direction)}
    else:
        j = {"id": jid, "kind": kind, "step": 2, "endpoint": "generate-with-style-v2", "out": out,
             "style_from": anchor,
             "params": {"description": prompt, "style_description": STYLE_DESC,
                        "style_images": [anchor], "no_background": True,
                        "target_palette": {"colors": hex_list()}},
             # same job without a Pro plan:
             "fallback": {"endpoint": "create-image-pixflux",
                          "params": dict(SETTINGS, description=prompt,
                                         image_size={"width": size, "height": size},
                                         view=view, direction=direction)}}
    if extra:
        j.update(extra)
    return j


def build_jobs():
    roster = list_characters(include_drafts=True)
    chars = {cid: load_character(cid) for cid in roster}
    # anchors: the first sprite of each kind sets the style for the rest
    anchor_char = "knight" if "knight" in chars else roster[0]
    anchors = {}
    jobs = []

    def add(kind, jid, desc, out):
        a = anchors.get(kind)
        j = job(jid, kind, desc, out, anchor=a)
        if a is None:
            anchors[kind] = out
        jobs.append(j)

    order = [anchor_char] + [c for c in roster if c != anchor_char]
    for cid in order:
        art = chars[cid].get("art")
        if not art:
            print(f"  ! {cid} has no 'art' block, skipped")
            continue
        base = f"characters/art/{cid}"
        add("body", f"{cid}.body", art["body"], f"{base}/body.png")
        for i, w in enumerate(art.get("weapons", [])):
            add("weapon", f"{cid}.weapon_{i}", w, f"{base}/weapon_{i}.png")
    for cid in order:
        art = chars[cid].get("art", {})
        base = f"characters/art/{cid}"
        for sid, d in art.get("summons", {}).items():
            add("summon", f"{cid}.summon_{sid}", d, f"{base}/summon_{sid}.png")
        for sid, d in art.get("summon_weapons", {}).items():
            add("weapon", f"{cid}.summon_{sid}_weapon", d, f"{base}/summon_{sid}_weapon.png")
        for style, d in art.get("projectiles", {}).items():
            add("projectile", f"{cid}.projectile_{style}", d, f"{base}/projectile_{style}.png")
    for cid in order:
        art = chars[cid].get("art", {})
        if art.get("ultimate_icon"):
            add("icon", f"{cid}.ultimate_icon", art["ultimate_icon"],
                f"characters/art/{cid}/ultimate_icon.png")

    # each character's home-stage floor (mirror-tiled by the renderer, so edges always match)
    for cid in order:
        d = chars[cid].get("art", {}).get("floor")
        if not d:
            continue
        prompt = (f"{d}. A seamless tileable floor texture seen from directly above, flat and "
                  "evenly lit, no characters, no large objects, muted colors so characters stand "
                  "out. 16-bit pixel art, crisp chunky pixels, no text")
        jobs.append({"id": f"{cid}.floor", "kind": "tile", "step": 1, "endpoint": "create-image-pixflux",
                     "out": f"characters/art/{cid}/floor.png",
                     "params": {"description": prompt, "image_size": {"width": 64, "height": 64},
                                "no_background": False, "outline": "lineless",
                                "shading": "flat shading", "detail": "medium detail",
                                "view": "high top-down", "text_guidance_scale": 8}})
    # per-character effects, so every fighter's ultimate and hits look like their own
    fx_kinds = [("ult_circle", 128, "seen from directly above, a flat glowing magic circle on the ground"),
                ("ult_aura", 128, "a vertical power-up aura effect rising upward, empty in the middle where the character stands"),
                ("hit_fx", 64, "a small fighting-game hit impact effect")]
    for kind, size, how in fx_kinds:
        for cid in order:
            d = chars[cid].get("art", {}).get(kind)
            if not d:
                continue
            prompt = (f"{d}. {how}. 16-bit pixel art game effect sprite, crisp chunky pixels, bright "
                      "glowing saturated colors, centered on a transparent background, no character, no text, no frame")
            jobs.append({"id": f"{cid}.{kind}", "kind": "fx", "step": 1, "endpoint": "create-image-pixflux",
                         "out": f"characters/art/{cid}/{kind}.png",
                         "params": {"description": prompt, "image_size": {"width": size, "height": size},
                                    "no_background": True, "outline": "lineless", "shading": "basic shading",
                                    "detail": "medium detail", "text_guidance_scale": 8}})
    # battle royale: blockers (seen from directly above, in their natural orientation) and items
    TERRAIN = {
        "tombstone": ((48, 64), "a grey stone tombstone with a rounded top and a carved cross"),
        "crypt": ((128, 96), "a small gothic stone crypt mausoleum with a dark doorway and a sloped roof"),
        "dead_tree": ((64, 64), "a leafless dead tree with twisted dark branches spreading out"),
        "car": ((64, 128), "a red compact car seen from directly above, windshield and roof visible"),
        "dumpster": ((96, 64), "a green metal dumpster with a closed lid"),
        "hydrant": ((32, 32), "a red fire hydrant seen from above"),
        "sandbags": ((128, 48), "a low wall of stacked tan sandbags"),
        "crate": ((64, 64), "a wooden military supply crate with metal corners and a stencil mark"),
        "barrel": ((48, 48), "a red oil barrel seen from directly above, round lid with a hazard symbol"),
        "sky_rock": ((64, 64), "a floating rock island chunk with green grass on top"),
        "cloud": ((96, 64), "a fluffy white cumulus cloud puff"),
        "goal": ((128, 48), "a white soccer goal frame with a net, seen from directly above"),
        "cone": ((32, 32), "an orange training cone with a white stripe seen from above"),
        "bench": ((128, 40), "a blue team bench with white seats"),
        "net": ((96, 64), "a red hockey goal net frame seen from directly above"),
        "boards": ((128, 32), "a white hockey rink board wall section with a yellow kick plate stripe"),
        "rock": ((64, 64), "a large grey boulder"),
        "wall": ((128, 48), "a crumbling grey stone brick wall segment"),
    }
    for kind, ((w, h), d) in TERRAIN.items():
        prompt = (f"{d}. Top-down view seen from directly above, a solid obstacle for a fighting arena. "
                  "16-bit pixel art, crisp chunky pixels, bold black outline, transparent background, no text")
        jobs.append({"id": f"terrain.{kind}", "kind": "terrain", "step": 1, "endpoint": "create-image-pixflux",
                     "out": f"art/terrain/{kind}.png",
                     "params": {"description": prompt, "image_size": {"width": w, "height": h},
                                "no_background": True, "outline": "single color black outline",
                                "shading": "basic shading", "detail": "medium detail",
                                "view": "high top-down", "text_guidance_scale": 8}})
    ITEMS_ART = {
        "potion": "a red health potion bottle with a cork and a heart label",
        "power": "a glowing orange sword power-up with sparkles",
        "boots": "a pair of blue winged speed boots",
        "shield": "a blue knight shield with a silver rim, glowing",
        "bomb": "a round black cartoon bomb with a lit sparking fuse",
        "fire": "a magic wand with a blazing fireball at the tip",
        "freeze": "a glowing ice-blue snowflake crystal orb",
        "lightning": "a bright yellow lightning bolt emblem crackling with energy",
    }
    for kind, d in ITEMS_ART.items():
        prompt = (f"{d}. A game pickup item icon, one bold readable object, centered. 16-bit pixel art, "
                  "crisp chunky pixels, bold black outline, bright saturated colors, transparent background, no text")
        jobs.append({"id": f"item.{kind}", "kind": "item", "step": 1, "endpoint": "create-image-pixflux",
                     "out": f"art/items/{kind}.png",
                     "params": {"description": prompt, "image_size": {"width": 48, "height": 48},
                                "no_background": True, "outline": "single color black outline",
                                "shading": "basic shading", "detail": "medium detail", "text_guidance_scale": 8}})
    return jobs, anchors


def write_markdown(jobs, anchors):
    L = []
    L += [
        "# PixelLab art prompts",
        "",
        "Generated by `python tools/art_prompts.py` from the `art` block in each "
        "`characters/<id>.json`. Edit those blocks, not this file.",
        "",
        "## How to run it",
        "",
        "1. **Step 1, anchors.** Generate the jobs marked *anchor* with **Create image (pixflux)** "
        "and the settings below. Regenerate (change the seed) until you love them: they set the "
        "look of the whole game.",
        "2. **Step 2, everything else.** Use **Generate with style** (Pro) with the listed anchor "
        "as the style image, so every character matches. Without Pro, use pixflux with the same "
        "prompt and settings (the `fallback` in the JSON).",
        "3. **Save** each PNG to the path shown (`characters/art/<id>/...`). The renderer will "
        "pick sprites up from there and fall back to the procedural drawing for anything missing.",
        "4. Regenerate with **inpainting** for small fixes rather than rerolling a sprite you mostly like.",
        "",
        "## Settings for every sprite",
        "",
        "| Setting | Value |",
        "|---|---|",
        "| No background | on |",
        "| Outline | `single color black outline` |",
        "| Shading | `basic shading` |",
        "| Detail | `medium detail` |",
        "| View / direction | `side` + `south` (bodies, summons, icons); `side` + `east` (weapons, projectiles) |",
        "| Guidance | 8 |",
        "| Forced palette | `art/palette.png` (Arena-28, the same colours the interface uses) |",
        "",
        "Sizes: character bodies 64×64, weapons 64×64 (trimmed automatically), summons, "
        "projectiles and icons 32×32, floor tiles 32×32. The new interface draws at "
        "540×960 and scales ×2, so these map close to 1:1 onto the fighters.",
        "",
        "**Rules that matter for this game**",
        "",
        "- Bodies must stay **round**: the physics is a circle, so the art is a ball with a face, not a full figure.",
        "- The HP number is no longer drawn on the ball, so faces can sit in the middle.",
        "- Weapons point **right** with the handle on the **left edge**: the engine rotates them around the handle.",
        "",
        f"Shared style text (already inside every prompt): *{STYLE}*",
        "",
        "## Anchors (step 1)",
        "",
    ]
    for kind, out in anchors.items():
        L.append(f"- **{kind}**: `{out}`")
    L.append("")

    sections = [("Character bodies", "body"), ("Weapons", "weapon"), ("Summons", "summon"),
                ("Projectiles", "projectile"), ("Ultimate icons", "icon"), ("Home-stage floors", "tile")]
    for title, kind in sections:
        L += [f"## {title}", ""]
        for j in [j for j in jobs if j["kind"] == kind]:
            size = j["params"].get("image_size") or j.get("fallback", {}).get("params", {}).get("image_size")
            dims = f"{size['width']}×{size['height']}" if size else ""
            tag = "anchor, pixflux" if j["step"] == 1 else f"style from `{j['style_from']}`"
            L += [f"### `{j['id']}`: {dims}, {tag}", "", f"Save to `{j['out']}`", "",
                  "```text", j["params"]["description"], "```", ""]
    with open(os.path.join(ART_DIR, "PIXELLAB_PROMPTS.md"), "w", encoding="utf-8") as f:
        f.write("\n".join(L))


def main():
    write_palette()
    jobs, anchors = build_jobs()
    with open(os.path.join(ART_DIR, "pixellab_jobs.json"), "w", encoding="utf-8") as f:
        json.dump({"settings": SETTINGS, "palette": PALETTE, "anchors": anchors, "jobs": jobs},
                  f, indent=2, ensure_ascii=False)
    write_markdown(jobs, anchors)
    kinds = {}
    for j in jobs:
        kinds[j["kind"]] = kinds.get(j["kind"], 0) + 1
    print(f"{len(jobs)} jobs: " + ", ".join(f"{v} {k}" for k, v in kinds.items()))
    print(f"wrote {ART_DIR}\\PIXELLAB_PROMPTS.md, pixellab_jobs.json, palette.png")


if __name__ == "__main__":
    main()
