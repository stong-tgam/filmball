"""
Roster balance: every hero gets FIXED stats (HP + a damage multiplier) that hold in every video and in
the game. No more per-video HP rescaling.

    python tools/balance_roster.py                  # report: win rates + fight lengths with the current stats
    python tools/balance_roster.py --tune --write   # tune the whole roster, write hp / stats.dmg_mult
    python tools/balance_roster.py --hero frog --tune --write   # tune one (new) hero, the rest stay put

Each hero has two knobs. "Power" (HP x damage) moves its win rate toward 50%; "length" (HP / damage)
moves its fights toward TARGET seconds without changing who wins. The bands are loose on purpose:
40-60% overall and some lopsided matchups are fine; that's what makes a real roster.
"""

import argparse
import json
import math
import os
import statistics
import sys
from concurrent.futures import ProcessPoolExecutor

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, ROOT)

from fightsim.search import _one  # noqa: E402
from fightsim.spec import build_matchup, finalize, list_characters, load_character  # noqa: E402

TARGET = 15.0          # median 1v1 fight length, s (videos keep seeds that land in 12-21 s)
CAP = 40               # sim cap while measuring; a timeout counts as CAP seconds
WIN_BAND = (0.4, 0.6)
LEN_BAND = (12.0, 18.0)


def char_file(cid):
    return os.path.join(ROOT, "characters", f"{cid}.json")


def measure(roster, focus=None, seeds=12, overrides=None, workers=None):
    """{(a, b): (a's win rate, median duration)} for every pair (or every pair with `focus`)."""
    overrides = overrides or {}
    pairs = [(a, b) for i, a in enumerate(roster) for b in roster[i + 1:] if focus in (None, a, b)]
    jobs, keys = [], []
    for a, b in pairs:
        spec = finalize(build_matchup(a, b))
        spec["duration"]["max"] = CAP
        for f in spec["fighters"][:2]:
            o = overrides.get(f["id"])
            if o:
                f["hp"] = o["hp"]
                f.setdefault("stats", {})["dmg_mult"] = o["dmg_mult"]
        for s in range(1, seeds + 1):
            jobs.append((spec, 300000 + s))
            keys.append((a, b))
    workers = workers or max(1, (os.cpu_count() or 2) - 1)
    with ProcessPoolExecutor(max_workers=workers) as ex:
        res = list(ex.map(_one, jobs, chunksize=max(1, len(jobs) // (workers * 4))))
    out = {}
    for k in pairs:
        rs = [r for kk, r in zip(keys, res) if kk == k]
        wins = sum(1 for r in rs if not r["timeout"] and r["winner"] == 0)
        decided = sum(1 for r in rs if not r["timeout"])
        out[k] = (wins / decided if decided else 0.5, statistics.median(CAP if r["timeout"] else r["duration"] for r in rs))
    return out


def per_hero(table, roster):
    """{hero: (overall win rate, median of its matchup lengths)}"""
    agg = {}
    for h in roster:
        ws, ds = [], []
        for (a, b), (w, d) in table.items():
            if h == a:
                ws.append(w), ds.append(d)
            elif h == b:
                ws.append(1 - w), ds.append(d)
        if ws:
            agg[h] = (sum(ws) / len(ws), statistics.median(ds))
    return agg


def current(cid):
    c = load_character(cid)
    return {"hp": float(c["hp"]), "dmg_mult": float((c.get("stats") or {}).get("dmg_mult", 1.0))}


def report(table, roster, log=print):
    agg = per_hero(table, roster)
    log(f"{'hero':<13}{'win':>6}{'median s':>10}  {'hp':>4} {'dmg x':>6}")
    for h, (w, d) in sorted(agg.items(), key=lambda kv: -kv[1][0]):
        c = current(h)
        flag = "" if WIN_BAND[0] <= w <= WIN_BAND[1] else ("  <-- strong" if w > WIN_BAND[1] else "  <-- weak")
        flag += "" if LEN_BAND[0] <= d <= LEN_BAND[1] else ("  <-- long" if d > LEN_BAND[1] else "  <-- short")
        log(f"{h:<13}{w:6.2f}{d:10.1f}  {c['hp']:4.0f} {c['dmg_mult']:6.2f}{flag}")
    lop = [(a, b, w) for (a, b), (w, _) in table.items() if w <= 0.1 or w >= 0.9]
    if lop:
        log(f"one-sided matchups (fine in moderation): {len(lop)} of {len(table)}")
    return agg


def tune(roster, focus=None, rounds=6, seeds=12, log=print):
    """Multiplicative updates on (power, length) per hero. Returns {hero: {hp, dmg_mult}}."""
    stats = {h: current(h) for h in roster}
    movable = [focus] if focus else roster
    for rnd in range(1, rounds + 1):
        table = measure(roster, focus, seeds, stats)
        agg = per_hero(table, roster)
        worst = max(abs(agg[h][0] - 0.5) for h in movable)
        longest = max(abs(math.log(agg[h][1] / TARGET)) for h in movable)
        log(f"round {rnd}: worst win-rate gap {worst:.2f}, worst length off by x{math.exp(longest):.2f}")
        done = all(WIN_BAND[0] <= agg[h][0] <= WIN_BAND[1] and LEN_BAND[0] <= agg[h][1] <= LEN_BAND[1]
                   for h in movable)
        if done:
            break
        for h in movable:
            w, d = agg[h]
            # power: a hero that wins 80% needs less; clamp so one round never swings too far
            p = min(1.35, max(0.74, ((0.5 + 1e-3) / max(w, 0.02)) ** 0.7)) if not 0.45 <= w <= 0.55 else 1.0
            # length: long fights -> less HP, more damage (same power)
            ln = min(1.4, max(0.7, (TARGET / d) ** 0.6)) if not LEN_BAND[0] <= d <= LEN_BAND[1] else 1.0
            s = stats[h]
            s["hp"] = s["hp"] * math.sqrt(p * ln)
            s["dmg_mult"] = s["dmg_mult"] * math.sqrt(p / ln)
    for h in movable:      # tidy numbers: HP to 5s, damage to 0.05
        stats[h]["hp"] = max(20, int(5 * round(stats[h]["hp"] / 5)))
        stats[h]["dmg_mult"] = round(round(stats[h]["dmg_mult"] / 0.05) * 0.05, 2)
    return {h: stats[h] for h in movable}


def write(stats, log=print):
    for h, s in stats.items():
        p = char_file(h)
        c = json.load(open(p, encoding="utf-8"))
        c["hp"] = s["hp"]
        c.setdefault("stats", {})
        if abs(s["dmg_mult"] - 1.0) < 1e-9:
            c["stats"].pop("dmg_mult", None)
        else:
            c["stats"]["dmg_mult"] = s["dmg_mult"]
        with open(p, "w", encoding="utf-8") as f:
            json.dump(c, f, indent=2, ensure_ascii=False)
        log(f"  {h}: hp {s['hp']}, dmg x{s['dmg_mult']}")


def main():
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--hero", help="only this hero moves (a new hero joining a balanced roster)")
    ap.add_argument("--tune", action="store_true")
    ap.add_argument("--write", action="store_true", help="with --tune: save the stats to characters/*.json")
    ap.add_argument("--rounds", type=int, default=6)
    ap.add_argument("--seeds", type=int, default=12)
    a = ap.parse_args()
    roster = list_characters(include_drafts=True)
    if a.hero and a.hero not in roster:
        raise SystemExit(f"no hero {a.hero}")
    if a.tune:
        stats = tune(roster, a.hero, a.rounds, a.seeds)
        if a.write:
            write(stats)
        else:
            print(json.dumps(stats, indent=1))
            return
    report(measure(roster, a.hero, a.seeds), roster)


if __name__ == "__main__":
    main()
