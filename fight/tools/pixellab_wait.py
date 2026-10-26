"""
Keep retrying the PixelLab art queue until it is finished.

Every --every minutes it checks the free balance (free to check). When free
generations are available it runs tools/pixellab_gen.py, which spends only
free generations and skips sprites that already exist. Stops when nothing is
left to make or after --hours.

    python tools/pixellab_wait.py               # every 30 min, up to 24 h
    python tools/pixellab_wait.py --every 15 --hours 48
"""

import argparse
import datetime
import os
import subprocess
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from tools.pixellab_gen import Stop, api_key, call  # noqa: E402
from fightsim.spec import ROOT  # noqa: E402

GEN = os.path.join(ROOT, "tools", "pixellab_gen.py")


def say(msg):
    print(f"[{datetime.datetime.now():%Y-%m-%d %H:%M}] {msg}", flush=True)


def remaining():
    """How many sprites are still missing (dry run, no API calls)."""
    out = subprocess.run([sys.executable, GEN, "--dry-run"], capture_output=True, text=True,
                         encoding="utf-8", errors="replace").stdout
    first = out.splitlines()[0] if out else "0"
    return int(first.split()[0]) if first.split() and first.split()[0].isdigit() else 0


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--every", type=float, default=30, help="minutes between checks")
    ap.add_argument("--hours", type=float, default=24, help="give up after this long")
    args = ap.parse_args()

    deadline = time.time() + args.hours * 3600
    while True:
        left = remaining()
        if left == 0:
            say("all sprites exist; done")
            return
        try:
            free = (call(api_key(), "GET", "/balance").get("subscription") or {}).get("generations") or 0
        except Stop as e:
            say(f"balance check failed: {e}")
            free = 0
        if free >= 1:
            say(f"{free:g} free generations available, {left} sprites to make; generating")
            subprocess.run([sys.executable, GEN], cwd=ROOT)
            if remaining() < left:
                continue   # made progress: re-check right away
            # nothing made (e.g. PixelLab pausing free generations during long queues): wait
            say(f"no sprites made this run; next try in {args.every:g} min")
            if time.time() > deadline:
                say(f"gave up after {args.hours:g} h; {left} sprites still missing")
                sys.exit(1)
            time.sleep(args.every * 60)
            continue
        if time.time() > deadline:
            say(f"gave up after {args.hours:g} h; {left} sprites still missing")
            sys.exit(1)
        say(f"{free:g} free generations, {left} sprites waiting; next check in {args.every:g} min")
        time.sleep(args.every * 60)


if __name__ == "__main__":
    main()
