"""
Fan hero pipeline: turn an approved viewer idea into a posted Short (see FAN_HERO_LOOP.md).

Claude writes characters/<hero>.json from the idea first (SPEC_GUIDE.md). Then:

    python tools/fan_hero.py build <comment id> <hero>     # gate 1 passed: credit, art, map, voice,
                                                           # balance, opponent, render, checks
    python tools/fan_hero.py balance <hero>                # just the balance table (while tuning)
    python tools/fan_hero.py post <comment id>             # gate 2 passed: upload now, playlist, catalog
    python tools/fan_hero.py post <comment id> --dry-run   # show the upload without posting

build options: --opponent <id> (else the closest matchup), --seeds 8, --no-art (art already there),
--force-balance (render even outside the 30-70% band). It never uploads; post never re-renders.

Spends PixelLab key 3 generations (about 16 with 2 variants per sprite, +2 for the map) and a few
dozen ElevenLabs characters. Everything is logged to out/batch_logs/fan_hero_<date>.log.
"""

import argparse
import datetime
import json
import os
import shutil
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
PY = sys.executable
BAND = (0.3, 0.7)
LOG_DIR = os.path.join(ROOT, "out", "batch_logs")
_log_file = None


def log(msg):
    global _log_file
    if _log_file is None:
        os.makedirs(LOG_DIR, exist_ok=True)
        _log_file = open(os.path.join(LOG_DIR, f"fan_hero_{datetime.date.today()}.log"), "a", encoding="utf-8")
    line = f"[{datetime.datetime.now():%H:%M:%S}] {msg}"
    print(line, flush=True)
    _log_file.write(line + "\n")
    _log_file.flush()


def run(args, what):
    """Run a pipeline tool from the project folder; stop on failure."""
    log(f"{what}: {' '.join(args)}")
    r = subprocess.run([PY, *args], cwd=ROOT, capture_output=True, text=True, encoding="utf-8", errors="replace")
    tail = "\n".join((r.stdout + r.stderr).strip().splitlines()[-6:])
    if tail:
        log("  " + tail.replace("\n", "\n  "))
    if r.returncode != 0:
        raise SystemExit(f"{what} failed (exit {r.returncode})")
    return r.stdout


def char_path(hero):
    return os.path.join(ROOT, "characters", f"{hero}.json")


def load_hero(hero):
    p = char_path(hero)
    if not os.path.exists(p):
        raise SystemExit(f"write characters/{hero}.json first (SPEC_GUIDE.md), then run build")
    return json.load(open(p, encoding="utf-8"))


def save_hero(hero, data):
    with open(char_path(hero), "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)


# ── balance ──────────────────────────────────────────────────────────────

def balance(hero, seeds=12, tune=False):
    """{opponent: win rate of hero} against the roster with its fixed stats, plus the overall rate.
    tune=True first sets the hero's own HP / dmg_mult with tools/balance_roster.py (the rest stay put)."""
    from tools import balance_roster as br
    from fightsim.spec import list_characters
    roster = list_characters(include_drafts=True)
    if hero not in roster:
        roster.append(hero)
    if tune:
        br.write(br.tune(roster, hero, rounds=8, seeds=seeds, log=log), log=log)
    raw = br.measure(roster, hero, seeds)
    table = {(b if a == hero else a): (w if a == hero else 1 - w) for (a, b), (w, _) in raw.items()}
    overall, length = br.per_hero(raw, roster)[hero]
    for o, w in sorted(table.items(), key=lambda kv: -kv[1]):
        log(f"  {hero} vs {o:<12} {w:.2f}")
    log(f"  overall {overall:.2f} (target {BAND[0]:.1f}-{BAND[1]:.1f}), median fight {length:.1f}s")
    return table, overall


def pick_opponent(table):
    """The roster hero with the closest raw matchup: the most suspense before auto-balance."""
    from fightsim.spec import list_characters
    live = [o for o in sorted(table) if o in list_characters()]      # never a draft (held) hero
    return min(live, key=lambda o: abs(table[o] - 0.5))


# ── art ──────────────────────────────────────────────────────────────────

def home_map(hero, data):
    """characters/art/<hero>/map.png: a whole-arena PixelLab map of the hero's home stage."""
    out = os.path.join(ROOT, "characters", "art", hero, "map.png")
    if os.path.exists(out):
        return
    sys.path.insert(0, os.path.join(ROOT, "tools"))
    import gen_art_wave2 as w
    from gen_maps import MAP
    from pixellab_gen import _named_key
    w.KEY = _named_key("PIXELLAB_API_KEY_3")
    stage = (data.get("arena") or {}).get("stage") or f"{data['name']}'s home"
    floor = (data.get("art") or {}).get("floor", "")
    desc = f"{stage}: {floor}, themed props along the edges"
    body = dict(w.pix(f"{desc}. {MAP}", 320), no_background=False, seed=21, outline="lineless")
    body["image_size"] = {"width": 384, "height": 384}
    cand = os.path.join(ROOT, "art", "_candidates", "maps", f"homes_{hero}_s21.png")
    w.gen(cand, "/create-image-pixflux", body)
    shutil.copyfile(cand, out)
    log(f"map: {os.path.relpath(out, ROOT)}")


# ── commands ─────────────────────────────────────────────────────────────

def cmd_build(a):
    from tools import fan_ideas
    db = fan_ideas._load()
    c = db["comments"].get(a.comment)
    if c is None:
        raise SystemExit(f"no comment {a.comment} in fan/ideas.json (run tools/fan_ideas.py first)")
    data = load_hero(a.hero)
    # 1. credit the viewer (title, description and on-screen strip come from this)
    data["fan"] = {"by": c["author"], "comment_id": c["id"], "idea": c["text"][:300]}
    data["draft"] = True          # out of the daily batch until its own Short is posted
    save_hero(a.hero, data)
    from fightsim.spec import build_matchup, finalize
    finalize(build_matchup(a.hero, "knight"))      # validates the file (raises with the problems)
    fan_ideas.set_status(c["id"], "building", log=log, hero=a.hero, note="")
    # 2. art, home map, voice
    if not a.no_art:
        run(["tools/pixellab_gen.py", "--only", a.hero, "--key", "PIXELLAB_API_KEY_3", "--variants", "2", "--max", "20"],
            "art")
        home_map(a.hero, data)
    run(["tools/voice_gen.py", "--only", a.hero], "voice")
    # 3. balance: fixed HP / damage against the roster (written into the hero file)
    table, overall = balance(a.hero, a.seeds, tune=True)
    if not BAND[0] <= overall <= BAND[1] and not a.force_balance:
        raise SystemExit(f"{a.hero} wins {overall:.0%} overall: tune characters/{a.hero}.json "
                         f"(SPEC_GUIDE 'Numbers that work') and run build again with --no-art")
    # 4. render
    opp = a.opponent or pick_opponent(table)
    folder = f"fan_{a.hero}_vs_{opp}"
    out = os.path.join("out", folder)
    # the debut is on the fan hero's own home stage
    from fightsim.spec import build_matchup
    spec = build_matchup(a.hero, opp)
    spec.pop("theme", None)
    spec["stage"] = a.hero
    os.makedirs(os.path.join(ROOT, out), exist_ok=True)
    spec_path = os.path.join(out, "spec_in.json")
    with open(os.path.join(ROOT, spec_path), "w", encoding="utf-8") as f:
        json.dump(spec, f, indent=1, ensure_ascii=False)
    run(["make_fight.py", spec_path, "--out", out], f"render {a.hero} vs {opp}")
    from tools.batch_publish import check_video
    ok, why = check_video(os.path.join(ROOT, out, "video.mp4"), "1v1")
    log(f"check: {why}")
    if not ok:
        raise SystemExit(f"video check failed: {why}")
    run(["tools/frame_strip.py", f"{out}/video.mp4", f"{out}/frames.png", "0.06", "0.3", "0.55", "0.8", "0.97"],
        "frames")
    fan_ideas.set_status(c["id"], "building", log=log, short=out, note="video ready: waiting for approval")
    meta = json.load(open(os.path.join(ROOT, out, "youtube.json"), encoding="utf-8"))
    log(f"READY FOR REVIEW: {out}/video.mp4 (frames: {out}/frames.png)")
    log(f"  title: {meta['title']}")
    log(f"  after approval: python tools/fan_hero.py post {c['id']}")


def cmd_post(a):
    from tools import fan_ideas
    c = fan_ideas._load()["comments"].get(a.comment)
    if c is None or not c.get("short"):
        raise SystemExit("nothing built for this comment yet (run: python tools/fan_hero.py build ...)")
    out = os.path.join(ROOT, c["short"])
    from tools.youtube_upload import add_to_playlist, upload
    if a.dry_run:
        upload(out, "public", dry_run=True, log=log)
        log("dry run: nothing uploaded")
        return
    r = upload(out, "public", log=log)          # right away, not through the daily queue
    add_to_playlist(out, log=log)
    from tools.catalog import sync
    sync(log=log)
    fan_ideas.set_status(c["id"], "posted", log=log, url=r["url"], note="")
    fan_ideas.invite(only=r["video_id"], log=log)          # the create-a-hero comment, like every video
    fan_ideas.tag_fan(r["video_id"], c["author"], c["text"], log=log)   # credit the viewer in the comments
    hero = c.get("hero")
    if hero and os.path.exists(char_path(hero)):      # joins the roster now that its debut is live
        data = load_hero(hero)
        data.pop("draft", None)
        save_hero(hero, data)
    log(f"POSTED: {r['url']}")
    log(f"  suggested reply (needs --auth-reply once, and your OK): Your hero is LIVE! 🎉 {r['url']} "
        f"Thanks for the idea!")


def cmd_balance(a):
    load_hero(a.hero)
    balance(a.hero, a.seeds, tune=a.tune)


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    b = sub.add_parser("build")
    b.add_argument("comment")
    b.add_argument("hero")
    b.add_argument("--opponent")
    b.add_argument("--seeds", type=int, default=12)
    b.add_argument("--no-art", action="store_true")
    b.add_argument("--force-balance", action="store_true")
    p = sub.add_parser("post")
    p.add_argument("comment")
    p.add_argument("--dry-run", action="store_true", help="show what would be uploaded")
    bl = sub.add_parser("balance")
    bl.add_argument("hero")
    bl.add_argument("--seeds", type=int, default=12)
    bl.add_argument("--tune", action="store_true", help="set the hero's HP / damage first")
    a = ap.parse_args()
    {"build": cmd_build, "post": cmd_post, "balance": cmd_balance}[a.cmd](a)


if __name__ == "__main__":
    main()
