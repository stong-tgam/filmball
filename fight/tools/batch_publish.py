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
    return (_has(name, "video.mp4") and _has(name, "queued.json") and not _has(name, "upload.json")
            and not _has(name, "uploading.json"))   # being posted by hand / browser: hands off


def uploaded(a, b):
    return _has(f"{a}_vs_{b}", "upload.json") or _has(f"{b}_vs_{a}", "upload.json")


def casting():
    """casting.json: {"favor": {id: weight}, "rest": {id: "YYYY-MM-DD back"}} (both optional)."""
    try:
        return json.load(open(os.path.join(ROOT, "casting.json"), encoding="utf-8"))
    except (OSError, ValueError):
        return {}


def cast_roster(today=None):
    """The roster minus characters resting today."""
    today = today or datetime.date.today().isoformat()
    rest = casting().get("rest", {})
    return [c for c in list_characters() if not (c in rest and today < rest[c])]


def weight(c):
    return float(casting().get("favor", {}).get(c, 1.0))


def _weighted_order(items, rng, w):
    """Random order where heavier items tend to come first (weighted shuffle)."""
    return sorted(items, key=lambda it: -rng.random() ** (1.0 / max(0.05, w(it))))


RAID_SLOTS = [("coin", 0.35, 0.65), ("doomed", 0.0, 0.2), ("favourite", 0.7, 1.01)]


def raid_party(kind, rng, slot):
    """3 heroes for a boss raid, chosen by their measured odds (reports/boss_power.json):
    slot 0 a coin flip, 1 a doomed team, 2 a favourite, then repeat. Resting heroes are skipped;
    without the study, a random favoured cast."""
    cast = set(cast_roster())
    try:
        table = json.load(open(os.path.join(ROOT, "reports", "boss_power.json"), encoding="utf-8"))[kind]["parties"]
    except (OSError, ValueError, KeyError):
        table = []
    _, lo, hi = RAID_SLOTS[slot % len(RAID_SLOTS)]
    pool = [k.split("|") for k, wr, _ in table if lo <= wr < hi and set(k.split("|")) <= cast]
    if pool:
        return _weighted_order(pool, rng, lambda p: sum(weight(h) for h in p))[0]
    return _weighted_order(cast_roster(), rng, weight)[:3]


def pick(count, seed, render_only=False):
    """Queue first (rendered, not uploaded), then never-used pairs, then rematches (sides swapped)."""
    rng = random.Random(seed)
    roster = cast_roster()
    chosen, used = [], set()
    pair_w = lambda p: weight(p[0]) + weight(p[1])   # noqa: E731  (favoured cast fights more often)

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
        queue = [p for p in queue if p[0] in roster and p[1] in roster]   # resting characters wait
        queue = _weighted_order(queue, rng, pair_w)   # no one fights twice in a batch if avoidable
        for a, b in queue:
            add(a, b)
        for a, b in queue:
            add(a, b, unique=False)
    # 2. pairs never uploaded in either order (when rendering ahead, skip ones already rendered)
    fresh = [p for p in itertools.combinations(roster, 2) if not uploaded(*p)]
    fresh = _weighted_order(fresh, rng, pair_w)
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
    rem = _weighted_order(rem, rng, pair_w)
    for a, b in rem:
        add(a, b, unique=False)
    return chosen


# allowed video length per format (seconds): 1v1 stays inside the classic short window
LENGTHS = {"1v1": (15, 25.5), "soccer": (15, 38), "royale": (18, 40), "horde": (18, 38), "boss": (18, 38)}


def fmt_of(name):
    try:
        mode = json.load(open(os.path.join(ROOT, "out", name, "spec.resolved.json"), encoding="utf-8")).get("mode")
    except (OSError, ValueError):
        mode = None
    return mode if mode in ("royale", "soccer", "horde", "boss") else "1v1"


def queued(fmt):
    """Ready-to-post folders of one format, oldest render first."""
    names = [n for n in os.listdir(os.path.join(ROOT, "out")) if ready(n) and fmt_of(n) == fmt]

    def rendered(n):
        try:
            return json.load(open(os.path.join(ROOT, "out", n, "queued.json"), encoding="utf-8")).get("rendered_at", "")
        except (OSError, ValueError):
            return ""
    return sorted(names, key=rendered)


def _runs(mode, key):
    """How many rendered videos of a mode use each value of key(spec) (horde hero, boss kind)."""
    counts = {}
    for n in os.listdir(os.path.join(ROOT, "out")):
        try:
            spec = json.load(open(os.path.join(ROOT, "out", n, "spec.resolved.json"), encoding="utf-8"))
        except (OSError, ValueError):
            continue
        if spec.get("mode") == mode:
            k = key(spec)
            counts[k] = counts.get(k, 0) + 1
    return counts


def new_special(fmt, rng, tag):
    """(folder name, make_fight args) for a new battle royale, soccer, horde or boss video."""
    from fightsim.spec import SOCCER_TEAMS, ROYALE_THEMES, ROYALE_MAPS, HORDES, BOSSES
    if fmt == "horde":
        # alternate hordes, and give the hero with the fewest runs in that horde the next turn
        per_kind = _runs("horde", lambda s: s["horde"]["kind"])
        kind = min(sorted(HORDES), key=lambda k: (per_kind.get(k, 0), rng.random()))
        per_hero = _runs("horde", lambda s: (s["horde"]["kind"], s["fighters"][0]["id"]))
        hero = min(cast_roster(), key=lambda h: (per_hero.get((kind, h), 0) / weight(h), rng.random()))
        return f"horde_{kind}_{hero}_{tag}", ["horde", hero, "--horde", kind]
    if fmt == "boss":
        # rotate through the bosses (least-used first) with a random party of 4
        per_boss = _runs("boss", lambda s: s.get("boss_kind"))
        kind = min(sorted(BOSSES), key=lambda k: (per_boss.get(k, 0), rng.random()))
        heroes = raid_party(kind, rng, per_boss.get(kind, 0))
        return f"boss_{kind}_{tag}", ["boss", *heroes, "--boss", kind]
    if fmt == "royale":
        ids = _weighted_order(cast_roster(), rng, weight)[:4]
        maps = sorted(ROYALE_THEMES) + sorted(ROYALE_MAPS)
        m = rng.choice(maps)
        return f"royale_{tag}_{m}", ["royale", *ids, "--map", m]
    teams = ["light", "shadow"]
    cast = set(cast_roster())
    ids = []
    for t in teams:
        members = [m for m in SOCCER_TEAMS[t]["members"] if m in cast] or SOCCER_TEAMS[t]["members"]
        ids += _weighted_order(members, rng, weight)[:2]
    return "soccer_" + tag + "_" + "-".join(ids), ["soccer", *ids]


def check_video(path, fmt="1v1"):
    """(ok, reason): duration inside the format's window and an audio stream."""
    import imageio_ffmpeg
    if not os.path.exists(path):
        return False, "no video.mp4"
    info = subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), "-i", path],
                          capture_output=True, text=True, errors="replace").stderr
    m = re.search(r"Duration: (\d+):(\d+):([\d.]+)", info)
    if not m:
        return False, "unreadable video"
    secs = int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))
    lo, hi = LENGTHS.get(fmt, LENGTHS["1v1"])
    if not lo <= secs <= hi:
        return False, f"length {secs:.1f}s outside {lo:g}-{hi:g} s"
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
    ap.add_argument("--mix", help="per-format counts, e.g. 1v1=2,royale=2,soccer=2 (overrides --count); "
                                  "takes ready videos from the queue and renders new ones if short")
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
    # jobs: (folder, format, render command or None if already queued)
    jobs = []
    if args.mix:
        want = {k: int(v) for k, v in (x.split("=") for x in args.mix.split(","))}
        rng = random.Random(stamp.strftime("%Y-%m-%d"))
        per = {}
        for a, b in pick(want.get("1v1", 0), stamp.strftime("%Y-%m-%d"), args.render_only):
            per.setdefault("1v1", []).append((f"{a}_vs_{b}", "1v1", [sys.executable, "publish.py", a, b, "--no-upload"]))
        for fmt in ("royale", "soccer", "horde", "boss"):
            n = want.get(fmt, 0)
            have = [] if args.render_only else queued(fmt)[:n]
            lst = [(name, fmt, None) for name in have]
            k = 0
            while len(lst) < n:
                k += 1
                name, fargs = new_special(fmt, rng, f"{stamp:%Y%m%d}{k}")
                if _has(name, "video.mp4"):
                    continue
                lst.append((name, fmt, [sys.executable, "make_fight.py", *fargs, "--out", os.path.join("out", name)]))
            per[fmt] = lst
        # alternate formats across the release slots: 1v1, soccer, royale, 1v1, soccer, royale
        order = ["1v1", "soccer", "royale", "horde", "boss"]
        while any(per.get(f) for f in order):
            for f in order:
                if per.get(f):
                    jobs.append(per[f].pop(0))
    else:
        for a, b in pick(count, stamp.strftime("%Y-%m-%d"), args.render_only):
            jobs.append((f"{a}_vs_{b}", "1v1", [sys.executable, "publish.py", a, b, "--no-upload"]))
    log(f"batch of {len(jobs)}: " + ", ".join(f"{n} ({f})" for n, f, _ in jobs))
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
    for name, fmt, cmd in jobs:
        video = os.path.join(ROOT, "out", name, "video.mp4")
        if ready(name) and not args.render_only:
            log(f"--- {name}: already rendered (from the queue)")
            ok, why = check_video(video, fmt)
        else:
            log(f"--- {name}: rendering ({fmt})")
            res = subprocess.run(cmd, cwd=ROOT,
                                 capture_output=True, text=True, encoding="utf-8", errors="replace")
            for line in (res.stdout + res.stderr).splitlines():
                if line.strip() and "[render]" not in line:
                    log_file.write("    " + line + "\n")
            ok, why = check_video(video, fmt) if res.returncode == 0 else (False, f"render failed ({res.returncode})")
        log(f"    check: {why}")
        if ok and not _has(name, "queued.json"):
            with open(os.path.join(ROOT, "out", name, "queued.json"), "w", encoding="utf-8") as f:
                json.dump({"rendered_at": datetime.datetime.now().isoformat(timespec="seconds")}, f)
        entry = {"matchup": name, "format": fmt, "ok": ok, "check": why}
        if ok and not (args.no_upload or args.render_only):
            try:
                from tools.youtube_upload import upload
                publish_at = None
                if slots:
                    t = slots.pop(0)
                    publish_at = t.astimezone(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
                r = upload(os.path.join(ROOT, "out", name), args.privacy, log=log, publish_at=publish_at)
                entry["url"] = r["url"]
                from tools.youtube_upload import add_to_playlist
                add_to_playlist(os.path.join(ROOT, "out", name), log=log)
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
