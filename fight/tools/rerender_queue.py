"""
Re-render every queued (not yet uploaded) video with the current look and sound,
replaying the exact same fight (same tuned HP and seed). Then refresh the catalog.

    python tools/rerender_queue.py
"""

import datetime
import json
import os
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)


def main():
    out = os.path.join(ROOT, "out")
    log_path = os.path.join(out, "batch_logs", f"rerender_{datetime.datetime.now():%Y-%m-%d_%H%M}.log")
    os.makedirs(os.path.dirname(log_path), exist_ok=True)
    log = open(log_path, "a", encoding="utf-8")
    names = [n for n in sorted(os.listdir(out))
             if "_vs_" in n and os.path.exists(os.path.join(out, n, "queued.json"))   # 1v1 folders only
             and not os.path.exists(os.path.join(out, n, "upload.json"))]
    log.write(f"{len(names)} queued videos to re-render\n")
    for n in names:
        a, b = n.split("_vs_")
        seed = json.load(open(os.path.join(out, n, "report.json"), encoding="utf-8"))["chosen"]["seed"]
        r = subprocess.run([sys.executable, "make_fight.py", a, b, "--seed", str(seed)], cwd=ROOT,
                           capture_output=True, text=True, encoding="utf-8", errors="replace")
        log.write(f"{n} seed {seed}: {'ok' if r.returncode == 0 else 'FAILED ' + r.stderr[-300:]}\n")
        log.flush()
    from tools.catalog import sync
    sync(log=lambda m: log.write(m + "\n"))
    log.write("done\n")


if __name__ == "__main__":
    main()
