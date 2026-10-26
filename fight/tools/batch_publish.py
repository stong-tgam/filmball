"""
Unattended batch: make N new fights between roster characters and upload them.

Picks matchups that were never uploaded (either side order), avoids reusing a
character within the batch, renders each with publish.py, checks the result
(15-25 s, has audio) and uploads it. Safe to run from Windows Task Scheduler:
everything is logged to out/batch_logs/.

    python tools/batch_publish.py --count 3
    python tools/batch_publish.py --count 3 --dry-run      # just show the picks
"""

import argparse
import datetime
import itertools
import json
import os
import random
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
os.chdir(ROOT)

from fightsim.spec import list_characters  # noqa: E402

LOG_DIR = os.path.join(ROOT, "out", "batch_logs")
log_file = None


def log(msg):
    line = f"[{datetime.datetime.now():%H:%M:%S}] {msg}"
    print(line, flush=True)
    if log_file:
        log_file.write(line + "\n")
        log_file.flush()


def _has(name, f):
    return os.path.exists(os.path.join(ROOT, "out", name, f))


def ready(name):
    """Rendered by a batch with the current pipeline and waiting to be posted.
    (Old test renders in out/ have no queued.json, so they get re-rendered, never posted.)"""
    return _has(name, "video.mp4") and _has(name, "queued.json") and not _has(name, "upload.json")


def uploaded(a, b):
    return _has(f"{a}_vs_{b}", "upload.json") or _has(f"{b}_vs_{a}", "upload.json")


def pick(count, seed, render_only=False):
    """Queue first (rendered, not uploaded), then never-used pairs, then rematches (sides swapped)."""
    rng = random.Random(seed)
    roster = list_characters()
    chosen, used = [], set()

    def add(a, b, unique=True):
        if len(chosen) >= count or (a, b) in chosen:
            return
        if unique and (a in used or b in used):
            return
        chosen.append((a, b))
        used.update((a, b))

    if not render_only:   # 1. ready-made videos waiting in the queue
        queue = [tuple(n.split("_vs_")) for n in sorted(os.listdir(os.path.join(ROOT, "out")))
                 if "_vs_" in n and ready(n)]
        rng.shuffle(queue)              # mix characters: no one fights twice in a batch if avoidable
        for a, b in queue:
            add(a, b)
        for a, b in queue:
            add(a, b, unique=False)
    # 2. pairs never uploaded in either order (when rendering ahead, skip ones already rendered)
    fresh = [p for p in itertools.combinations(roster, 2) if not uploaded(*p)]
    rng.shuffle(fresh)
    fresh = [p if rng.random() < 0.5 else (p[1], p[0]) for p in fresh]
    if render_only:
        fresh = [(a, b) for a, b in fresh
                 if not (ready(f"{a}_vs_{b}") or ready(f"{b}_vs_{a}"))]
    for a, b in fresh:
        add(a, b)
    for a, b in fresh:
        add(a, b, unique=False)
    # 3. rematches: the swapped side of an uploaded pair (other stage, new fight)
    rem = [(b, a) for a, b in itertools.permutations(roster, 2)
           if _has(f"{a}_vs_{b}", "upload.json") and not _has(f"{b}_vs_{a}", "upload.json")
           and not (render_only and ready(f"{b}_vs_{a}"))]
    rng.shuffle(rem)
    for a, b in rem:
        add(a, b, unique=False)
    return chosen


def check_video(path):
    """(ok, reason): duration 15-25 s and an audio stream."""
    import imageio_ffmpeg
    if not os.path.exists(path):
        return False, "no video.mp4"
    info = subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), "-i", path],
                          capture_output=True, text=True, errors="replace").stderr
    m = re.search(r"Duration: (\d+):(\d+):([\d.]+)", info)
    if not m:
        return False, "unreadable video"
    secs = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))
    if not 15 <= secs <= 25.5:
        return False, f"length {secs:.1f}s outside 15-25 s"
    if "Audio:" not in info:
        return False, "no audio track"
    return True, f"{secs:.1f}s with audio"


def main():
    global log_file
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--count", type=int, default=3)
    ap.add_argument("--privacy", choices=["private", "unlisted", "public"], default="public")
    ap.add_argument("--no-upload", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--max-total", type=int, help="stop once this many videos are uploaded in total")
    ap.add_argument("--render-only", action="store_true", help="render ahead into the queue, upload nothing")
    ap.add_argument("--stagger", help="local release times, e.g. 07:30,10:00,12:30,15:30,18:00,20:30 "
                                      "(uploads now, YouTube publishes each at its slot)")
    args = ap.parse_args()

    stamp = datetime.datetime.now()
    os.makedirs(LOG_DIR, exist_ok=True)
    log_file = open(os.path.join(LOG_DIR, f"{stamp:%Y-%m-%d_%H%M}.log"), "a", encoding="utf-8")
    count = args.count
    if args.max_total is not None:
        done_total = sum(1 for n in os.listdir(os.path.join(ROOT, "out"))
                         if os.path.exists(os.path.join(ROOT, "out", n, "upload.json")))
        count = max(0, min(count, args.max_total - done_total))
        log(f"{done_total} uploaded so far, target {args.max_total}: making {count} today")
    matchups = pick(count, stamp.strftime("%Y-%m-%d"), args.render_only)
    log(f"batch of {len(matchups)}: " + ", ".join(f"{a} vs {b}" for a, b in matchups))
    if args.dry_run:
        return

    slots = []
    if args.stagger:
        now = datetime.datetime.now().astimezone()
        for hhmm in args.stagger.split(","):
            h, m = (int(x) for x in hhmm.split(":"))
            t = now.replace(hour=h, minute=m, second=0, microsecond=0)
            if t <= now + datetime.timedelta(minutes=15):
                t += datetime.timedelta(days=1)          # slot already passed: same time tomorrow
            slots.append(t)
        slots.sort()
    results = []
    for a, b in matchups:
        name = f"{a}_vs_{b}"
        video = os.path.join(ROOT, "out", name, "video.mp4")
        if ready(name) and not args.render_only:
            log(f"--- {name}: already rendered (from the queue)")
            ok, why = check_video(video)
        else:
            log(f"--- {name}: rendering")
            res = subprocess.run([sys.executable, "publish.py", a, b, "--no-upload"], cwd=ROOT,
                                 capture_output=True, text=True, encoding="utf-8", errors="replace")
            for line in (res.stdout + res.stderr).splitlines():
                if line.strip() and "[render]" not in line:
                    log_file.write("    " + line + "\n")
            ok, why = check_video(video) if res.returncode == 0 else (False, f"render failed ({res.returncode})")
        log(f"    check: {why}")
        if ok and not _has(name, "queued.json"):
            with open(os.path.join(ROOT, "out", name, "queued.json"), "w", encoding="utf-8") as f:
                json.dump({"rendered_at": datetime.datetime.now().isoformat(timespec="seconds")}, f)
        entry = {"matchup": name, "ok": ok, "check": why}
        if ok and not (args.no_upload or args.render_only):
            try:
                from tools.youtube_upload import upload
                publish_at = None
                if slots:
                    t = slots.pop(0)
                    publish_at = t.astimezone(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
                r = upload(os.path.join(ROOT, "out", name), args.privacy, log=log, publish_at=publish_at)
                entry["url"] = r["url"]
            except SystemExit as e:          # the uploader exits with a message on errors
                entry["ok"], entry["error"] = False, str(e)
                log(f"    upload failed: {e}")
        results.append(entry)

    from tools.catalog import sync
    catalog_url = sync(log=log)
    try:                                   # daily analytics snapshot for the weekly report
        from tools.analytics import snapshot
        snapshot(log=log)
    except Exception as e:
        log(f"analytics: snapshot failed ({e})")
    with open(os.path.join(LOG_DIR, "latest.json"), "w", encoding="utf-8") as f:
        json.dump({"time": stamp.isoformat(timespec="seconds"), "catalog": catalog_url,
                   "results": results}, f, indent=2)
    done = [r for r in results if r.get("url")]
    log(f"finished: {len(done)}/{len(results)} uploaded")
    for r in results:
        log(f"  {r['matchup']}: {r.get('url') or r.get('error') or r['check']}")


if __name__ == "__main__":
    main()
