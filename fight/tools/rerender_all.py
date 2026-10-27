"""
Rebuild every queued (rendered, not yet uploaded) video from scratch with the current look:
new maps, bodies, effects, focus rules, cover and loop. Unlike rerender_queue.py (which replays
the old tuned spec), this re-runs the full pipeline for the same matchup / format, so new
spec-level changes (maps, fighter counts) apply too. Royales keep their map and the first 4
fighters; soccer keeps its 4 players.

    python tools/rerender_all.py [--workers 3] [--dry-run]

While a folder re-renders it holds an uploading.json lock so the daily batch leaves it alone.
"""

import argparse
import datetime
import json
import os
import subprocess
import sys
from concurrent.futures import ThreadPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)
OUT = os.path.join(ROOT, "out")


def queued():
    return [n for n in sorted(os.listdir(OUT))
            if not n.startswith("_") and os.path.isdir(os.path.join(OUT, n))
            and os.path.exists(os.path.join(OUT, n, "queued.json"))
            and not os.path.exists(os.path.join(OUT, n, "upload.json"))
            and not os.path.exists(os.path.join(OUT, n, "uploading.json"))]


def args_for(name):
    """make_fight.py arguments that rebuild this folder's video."""
    try:
        spec = json.load(open(os.path.join(OUT, name, "spec.resolved.json"), encoding="utf-8"))
    except (OSError, ValueError):
        spec = {}
    ids = [f["id"] if isinstance(f, dict) else f for f in spec.get("fighters", [])]
    mode = spec.get("mode")
    if mode == "royale":
        return ["royale", *ids[:4], "--map", spec["map"]]
    if mode == "soccer":
        return ["soccer", *ids[:4]]
    if mode == "horde":
        return ["horde", ids[0], "--horde", spec["horde"]["kind"]]
    if mode == "boss":   # re-pick the party by its measured odds (slot from the folder's last digit)
        import random
        from tools.batch_publish import raid_party
        slot = int(name[-1]) if name[-1].isdigit() else 0
        party = raid_party(spec["boss_kind"], random.Random(name), slot)
        return ["boss", *party, "--boss", spec["boss_kind"]]
    if "_vs_" in name:
        return name.split("_vs_")
    return None


def rebuild(name, log):
    a = args_for(name)
    if not a:
        log(f"{name}: skipped (unknown format)")
        return
    lock = os.path.join(OUT, name, "uploading.json")
    with open(lock, "w", encoding="utf-8") as f:
        json.dump({"by": "rerender_all", "at": datetime.datetime.now().isoformat(timespec="seconds")}, f)
    try:
        r = subprocess.run([sys.executable, "make_fight.py", *a, "--out", os.path.join("out", name)], cwd=ROOT,
                           capture_output=True, text=True, encoding="utf-8", errors="replace")
        log(f"{name} ({' '.join(a)}): {'ok' if r.returncode == 0 else 'FAILED ' + r.stderr[-300:]}")
    finally:
        os.remove(lock)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--workers", type=int, default=3)
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    names = queued()
    log_path = os.path.join(OUT, "batch_logs", f"rerender_all_{datetime.datetime.now():%Y-%m-%d_%H%M}.log")
    os.makedirs(os.path.dirname(log_path), exist_ok=True)
    fh = open(log_path, "a", encoding="utf-8")

    def log(m):
        line = f"[{datetime.datetime.now():%H:%M:%S}] {m}"
        print(line, flush=True)
        fh.write(line + "\n")
        fh.flush()

    log(f"{len(names)} queued videos to rebuild")
    if a.dry_run:
        for n in names:
            log(f"  {n}: make_fight.py {' '.join(args_for(n) or ['?'])}")
        return
    with ThreadPoolExecutor(a.workers) as ex:
        list(ex.map(lambda n: rebuild(n, log), names))
    from tools.catalog import sync
    sync(log=log)
    log("done")


if __name__ == "__main__":
    main()
