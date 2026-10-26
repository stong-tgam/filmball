"""
Generate roster sprites with the PixelLab API, spending only free (subscription)
generations unless told otherwise.

    python tools/pixellab_gen.py                     # everything still missing, free generations only
    python tools/pixellab_gen.py --max 40            # use up to 40 generations today
    python tools/pixellab_gen.py --dry-run           # show what would run

API key: put  PIXELLAB_API_KEY=...  in fight/.env (git-ignored) or set the env var.

Safety:
  - checks /balance before every job and stops when free generations run out
  - stops immediately if any response was charged in USD (unless --allow-usd)
  - skips sprites that already exist (unless --force), so daily runs resume the queue
Every call is logged to art/pixellab_log.jsonl.
"""

import argparse
import base64
import datetime
import json
import os
import sys
import urllib.error
import urllib.request

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from tools.art_prompts import SETTINGS, build_jobs, write_palette  # noqa: E402
from fightsim.spec import ROOT  # noqa: E402

API = "https://api.pixellab.ai/v2"
LOG = os.path.join(ROOT, "art", "pixellab_log.jsonl")
BITFORGE_KEYS = {"description", "image_size", "text_guidance_scale", "outline", "shading", "detail",
                 "view", "direction", "no_background", "color_image", "seed"}


class Stop(Exception):
    pass


def _named_key(name):
    v = os.environ.get(name)
    env = os.path.join(ROOT, ".env")
    if not v and os.path.exists(env):
        for line in open(env, encoding="utf-8"):
            n, _, value = line.strip().partition("=")
            if n.strip() == name:
                v = value.strip().strip('"').strip("'")
    if not v:
        raise Stop(f"{name} is not set in fight/.env")
    return v


def api_keys():
    """Every PIXELLAB_API_KEY, PIXELLAB_API_KEY_2, ... from the environment and fight/.env."""
    keys = {n: v for n, v in os.environ.items() if n.startswith("PIXELLAB_API_KEY") and v}
    env = os.path.join(ROOT, ".env")
    if os.path.exists(env):
        for line in open(env, encoding="utf-8"):
            name, _, value = line.strip().partition("=")
            name, value = name.strip(), value.strip().strip('"').strip("'")
            if name.startswith("PIXELLAB_API_KEY") and value:
                keys.setdefault(name, value)
    return [keys[n] for n in sorted(keys)]


FORCE_KEY = os.environ.get("PIXELLAB_KEY_NAME")   # e.g. PIXELLAB_API_KEY_3: use only that key


def api_key():
    """The first key that still has free generations (keys rotate as each runs out);
    if none has any, the first key, so balance checks still work."""
    if FORCE_KEY:
        return _named_key(FORCE_KEY)
    keys = api_keys()
    if not keys:
        raise Stop("No API key: add PIXELLAB_API_KEY=... to fight/.env (or set the env var)")
    for k in keys:
        try:
            if free_left(call(k, "GET", "/balance")) >= 1:
                return k
        except Stop:
            continue
    return keys[0]


def call(key, method, path, body=None, timeout=180):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API + path, data=data, method=method, headers={
        "Authorization": f"Bearer {key}", "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return json.loads(resp.read().decode())
    except urllib.error.HTTPError as e:
        detail = e.read().decode(errors="replace")[:400]
        raise Stop(f"{method} {path} -> HTTP {e.code}: {detail}")
    except (urllib.error.URLError, TimeoutError, ConnectionError, OSError) as e:
        raise Stop(f"{method} {path} -> network error: {e}")   # the watcher just retries later


def b64_file(rel):
    with open(os.path.join(ROOT, rel), "rb") as f:
        return {"type": "base64", "base64": base64.b64encode(f.read()).decode(), "format": "png"}


def request_for(job, seed=None, style_override=None, palette=True):
    """(endpoint, body). Anchors: pixflux. Followers: bitforge with the anchor as style image.
    style_override: use this existing sprite as the style reference for every job."""
    params = dict(job["params"] if job["step"] == 1 else job["fallback"]["params"])
    if seed is not None:
        params["seed"] = seed
    if not palette:
        params.pop("color_image", None)
    if isinstance(params.get("color_image"), str):
        params["color_image"] = b64_file(params["color_image"])
    # style_override "none": plain pixflux (bitforge style transfer also copies the reference's colours)
    style = None if style_override == "none" else (style_override or job.get("style_from"))
    if style and os.path.exists(os.path.join(ROOT, style)):
        body = {k: v for k, v in params.items() if k in BITFORGE_KEYS}
        body["style_image"] = b64_file(style)
        body["style_strength"] = 40
        return "/create-image-bitforge", body
    return "/create-image-pixflux", params


def free_left(bal):
    sub = bal.get("subscription") or {}
    return sub.get("generations") or 0


def log(entry):
    os.makedirs(os.path.dirname(LOG), exist_ok=True)
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry) + "\n")


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--only", help="comma list of character ids (default: all)")
    ap.add_argument("--kinds", help="comma list of kinds: body,weapon,summon,projectile,icon,tile")
    ap.add_argument("--max", type=int, default=40, help="max generations this run (default 40)")
    ap.add_argument("--variants", type=int, default=1, help="candidates per sprite (extra ones go to candidates/)")
    ap.add_argument("--force", action="store_true", help="regenerate sprites that already exist")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--allow-usd", action="store_true", help="allow spending paid credits")
    ap.add_argument("--key", help="use only this .env key name, e.g. PIXELLAB_API_KEY_3 (the paid plan)")
    ap.add_argument("--style", default="none", help="sprite to copy the style from (bitforge; it also copies colours). Default: none = plain pixflux")
    ap.add_argument("--palette", action="store_true", help="force the Arena-28 palette (muddies colours; off by default)")
    args = ap.parse_args()

    global FORCE_KEY
    if args.key:
        FORCE_KEY = args.key
    write_palette()
    jobs, _ = build_jobs()
    only = set(args.only.split(",")) if args.only else None
    kinds = set(args.kinds.split(",")) if args.kinds else None
    todo = []
    for j in jobs:
        owner = j["id"].split(".")[0]
        if only and owner not in only and not (owner == "ui" and "ui" in only):
            continue
        if kinds and j["kind"] not in kinds:
            continue
        if os.path.exists(os.path.join(ROOT, j["out"])) and not args.force:
            continue
        todo.append(j)
    # anchors first so followers can copy their style
    todo.sort(key=lambda j: j["step"])

    print(f"{len(todo)} sprite(s) to make, {args.variants} variant(s) each")
    if args.dry_run:
        for j in todo:
            ep, _ = request_for(j, None, args.style, args.palette)
            print(f"  {j['id']:<28} {ep:<24} -> {j['out']}")
        return

    try:
        key = api_key()
        bal = call(key, "GET", "/balance")
        print(f"balance: free generations {free_left(bal)}, credits ${bal.get('credits', {}).get('usd', 0)}")
        used = 0
        for j in todo:
            for v in range(args.variants):
                if used >= args.max:
                    raise Stop(f"reached --max {args.max} for this run")
                if not args.allow_usd:
                    bal = call(key, "GET", "/balance")
                    if free_left(bal) < 1:
                        key = api_key()          # rotate to another key with free generations
                        if free_left(call(key, "GET", "/balance")) < 1:
                            raise Stop("no free generations left on any key; run again tomorrow (or pass --allow-usd)")
                seed = None if v == 0 else 1000 + v
                ep, body = request_for(j, seed, args.style, args.palette)
                print(f"  {j['id']}{'' if v == 0 else f' (variant {v + 1})'} via {ep} ...", flush=True)
                resp = call(key, "POST", ep, body)
                usage = resp.get("usage") or {}
                img = (resp.get("image") or {}).get("base64")
                if not img:
                    raise Stop(f"no image in response for {j['id']}: {str(resp)[:200]}")
                out = os.path.join(ROOT, j["out"])
                if v > 0:
                    d, f = os.path.split(out)
                    out = os.path.join(d, "candidates", f.replace(".png", f"_v{v + 1}.png"))
                os.makedirs(os.path.dirname(out), exist_ok=True)
                with open(out, "wb") as f:
                    f.write(base64.b64decode(img))
                used += 1
                log({"time": datetime.datetime.now().isoformat(timespec="seconds"), "job": j["id"],
                     "endpoint": ep, "usage": usage, "out": os.path.relpath(out, ROOT)})
                print(f"    saved {os.path.relpath(out, ROOT)}  (charged: {usage or 'n/a'})")
                if usage.get("type") == "usd" and not args.allow_usd:
                    raise Stop("that call was charged in USD, stopping (pass --allow-usd to permit)")
        print(f"done: {used} generation(s) used")
    except Stop as e:
        print(f"stopped: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
