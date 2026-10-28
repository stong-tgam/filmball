"""
Render a fixed set of special-format videos into the upload queue (no upload).

    python tools/render_set.py --royale 5 --soccer 5 --boss-each 2 --horde 3 [--workers 3] [--after LOG]

Boss raids: N per boss. Horde: alternates hordes, favoured heroes first. Royale / soccer: random
casts from the casting rules (casting.json). Each good video gets queued.json like the daily batch.
--after LOG waits until that log file says "done" (e.g. a re-render that's still running).
"""

import argparse
import datetime
import json
import os
import random
import subprocess
import sys
import time
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from tools.batch_publish import _weighted_order, cast_roster, check_video, new_special, raid_party, weight  # noqa: E402
from fightsim.spec import BOSSES, HORDES  # noqa: E402


def jobs_for(a, rng, tag):
    jobs = []
    for fmt, n in (("royale", a.royale), ("soccer", a.soccer)):
        for k in range(n):
            name, fargs = new_special(fmt, rng, f"{tag}{fmt[0]}{k}")
            jobs.append((name, fmt, fargs))
    for kind in (a.bosses.split(",") if a.bosses else sorted(BOSSES)):
        for k in range(a.boss_each):
            heroes = raid_party(kind, rng, k)
            jobs.append((f"boss_{kind}_{tag}{k}", "boss", ["boss", *heroes, "--boss", kind]))
    heroes = _weighted_order(cast_roster(), rng, weight)
    kinds = sorted(HORDES)
    for k in range(a.horde):
        kind, hero = kinds[k % len(kinds)], heroes[k % len(heroes)]
        jobs.append((f"horde_{kind}_{hero}_{tag}", "horde", ["horde", hero, "--horde", kind]))
    return jobs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--royale", type=int, default=0)
    ap.add_argument("--soccer", type=int, default=0)
    ap.add_argument("--boss-each", type=int, default=0)
    ap.add_argument("--horde", type=int, default=0)
    ap.add_argument("--bosses", help="only these bosses for --boss-each, e.g. werewolf,spider")
    ap.add_argument("--workers", type=int, default=3)
    ap.add_argument("--after")
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    stamp = datetime.datetime.now()
    rng = random.Random(f"set|{stamp:%Y%m%d%H%M}")
    jobs = jobs_for(a, rng, f"{stamp:%Y%m%d}n")
    log_path = os.path.join(ROOT, "out", "batch_logs", f"render_set_{stamp:%Y-%m-%d_%H%M}.log")
    os.makedirs(os.path.dirname(log_path), exist_ok=True)
    fh = open(log_path, "a", encoding="utf-8")

    def log(m):
        line = f"[{datetime.datetime.now():%H:%M:%S}] {m}"
        print(line, flush=True)
        fh.write(line + "\n")
        fh.flush()

    for name, fmt, fargs in jobs:
        log(f"plan {name} ({fmt}): make_fight.py {' '.join(fargs)}")
    if a.dry_run:
        return
    if a.after:
        log(f"waiting for {a.after} to finish")
        while True:
            try:
                if open(a.after, encoding="utf-8").read().rstrip().endswith("done"):
                    break
            except OSError:
                pass
            time.sleep(30)

    def run(job):
        name, fmt, fargs = job
        out = os.path.join(ROOT, "out", name)
        r = subprocess.run([sys.executable, "make_fight.py", *fargs, "--out", os.path.join("out", name)], cwd=ROOT,
                           capture_output=True, text=True, encoding="utf-8", errors="replace")
        ok, why = check_video(os.path.join(out, "video.mp4"), fmt) if r.returncode == 0 else (False, r.stderr[-300:])
        if ok:
            with open(os.path.join(out, "queued.json"), "w", encoding="utf-8") as f:
                json.dump({"rendered_at": datetime.datetime.now().isoformat(timespec="seconds")}, f)
        log(f"{name}: {'queued' if ok else 'NOT queued'} ({why})")

    with ThreadPoolExecutor(a.workers) as ex:
        list(ex.map(run, jobs))
    from tools.catalog import sync
    sync(log=log)
    log("done")


if __name__ == "__main__":
    main()
