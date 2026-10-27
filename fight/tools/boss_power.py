"""
Fixed-HP boss study: pick one HP per boss so an average 3-hero party wins about TARGET of the time,
then simulate every 3-hero party against it. Shows which teams crush the boss and which get wiped.

    python tools/boss_power.py [--target 0.45] [--seeds 6] [--bosses lich,dragon]
Writes reports/boss_power.json (raw) and prints a summary.
"""

import argparse
import itertools
import json
import os
import random
import sys
from concurrent.futures import ProcessPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from fightsim.sim import run_headless  # noqa: E402
from fightsim.spec import BOSSES, build_boss, finalize, list_characters  # noqa: E402


def _raid(job):
    kind, party, hp, seed = job
    spec = finalize(build_boss(kind, list(party)))
    spec["fighters"][-1]["hp"] = hp
    w = run_headless(spec, seed)
    return kind, party, hp, seed, (w.winner_side == 0), w.t


def win_rate(ex, kind, parties, hp, seeds):
    jobs = [(kind, p, hp, s) for p in parties for s in range(1, seeds + 1)]
    res = list(ex.map(_raid, jobs, chunksize=8))
    return sum(r[4] for r in res) / len(res), res


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--target", type=float, default=0.45)
    ap.add_argument("--seeds", type=int, default=6)
    ap.add_argument("--bosses")
    a = ap.parse_args()
    roster = list_characters()
    parties = list(itertools.combinations(roster, 3))
    kinds = a.bosses.split(",") if a.bosses else sorted(BOSSES)
    rng = random.Random(7)
    out = {}
    with ProcessPoolExecutor() as ex:
        for kind in kinds:
            sample = rng.sample(parties, 40)
            lo, hi = 100.0, 2500.0                # bisect boss HP on a sample of parties
            for _ in range(8):
                mid = (lo + hi) / 2
                wr, _ = win_rate(ex, kind, sample, mid, 3)
                lo, hi = (mid, hi) if wr > a.target else (lo, mid)
            hp = round((lo + hi) / 2 / 10) * 10
            overall, res = win_rate(ex, kind, parties, hp, a.seeds)
            per = {}
            for _, party, _, _, won, t in res:
                d = per.setdefault("|".join(party), [0, 0, 0.0])
                d[0] += won
                d[1] += 1
                d[2] += t
            table = sorted(((k, v[0] / v[1], v[2] / v[1]) for k, v in per.items()), key=lambda r: -r[1])
            hero = {h: [] for h in roster}
            for k, wr, _ in table:
                for h in k.split("|"):
                    hero[h].append(wr)
            hero_avg = sorted(((h, sum(v) / len(v)) for h, v in hero.items()), key=lambda r: -r[1])
            out[kind] = {"hp": hp, "overall": overall, "parties": table, "heroes": hero_avg}
            name = BOSSES[kind]["boss"]["name"]
            buckets = [sum(1 for _, wr, _ in table if lo_ <= wr < hi_) for lo_, hi_ in
                       ((0, 0.2), (0.2, 0.45), (0.45, 0.7), (0.7, 1.01))]
            print(f"\n== {name}: fixed HP {hp}  (average party wins {overall:.0%})")
            print(f"   parties: crushed {buckets[0]}, usually lose {buckets[1]}, coin-flip {buckets[2]}, usually win {buckets[3]}")
            print("   best:  " + "; ".join(f"{k.replace('|', '+')} {wr:.0%}" for k, wr, _ in table[:3]))
            print("   worst: " + "; ".join(f"{k.replace('|', '+')} {wr:.0%}" for k, wr, _ in table[-3:]))
            print("   heroes: " + ", ".join(f"{h} {v:.0%}" for h, v in hero_avg))
    os.makedirs(os.path.join(ROOT, "reports"), exist_ok=True)
    json.dump(out, open(os.path.join(ROOT, "reports", "boss_power.json"), "w"), indent=1)


if __name__ == "__main__":
    main()
