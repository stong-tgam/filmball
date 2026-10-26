"""
Round robin over the roster with raw (untuned) HP: who beats whom, how long
fights last, and how often they stall. Use it to spot broken characters
before rendering.

    python tools/roundrobin.py [SEEDS_PER_PAIR]
"""

import itertools
import os
import statistics
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fightsim.search import run_many  # noqa: E402
from fightsim.spec import build_matchup, finalize, list_characters  # noqa: E402


def main():
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 30
    roster = list_characters(include_drafts=True)
    wins = {c: 0 for c in roster}
    games = {c: 0 for c in roster}
    rows = []
    for a, b in itertools.combinations(roster, 2):
        spec = finalize(build_matchup(a, b))
        spec["duration"]["max"] = 60  # raw HP: allow long fights so we see the real winner
        res = run_many(spec, range(1, n + 1))
        decided = [r for r in res if not r["timeout"]]
        wa = sum(1 for r in decided if r["winner"] == 0)
        wins[a] += wa
        wins[b] += len(decided) - wa
        games[a] += len(decided)
        games[b] += len(decided)
        med = statistics.median(r["duration"] for r in decided) if decided else float("nan")
        rows.append((a, b, wa / max(1, len(decided)), med, 1 - len(decided) / n))
    print(f"{'matchup':<26} {'A wins':>7} {'median s':>9} {'stall':>6}")
    for a, b, w, med, to in rows:
        flag = "  <-- lopsided" if w < 0.15 or w > 0.85 else ""
        flag += "  <-- stalls" if to > 0.2 else ""
        print(f"{a + ' vs ' + b:<26} {w:7.2f} {med:9.1f} {to:6.2f}{flag}")
    print("\noverall win rate (raw HP):")
    for c in sorted(roster, key=lambda c: -wins[c] / max(1, games[c])):
        print(f"  {c:<12} {wins[c] / max(1, games[c]):.2f}")


if __name__ == "__main__":
    main()
