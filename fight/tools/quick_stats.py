"""Print headless results for a handful of seeds: `python tools/quick_stats.py SPEC [N]`."""

import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from fightsim.search import drama_score, summarize  # noqa: E402
from fightsim.sim import run_headless  # noqa: E402
from fightsim.spec import load_spec  # noqa: E402

KEYS = ("seed", "winner_name", "duration", "winner_hp", "lead_changes",
        "comeback", "ultimates", "score")

spec = load_spec(sys.argv[1])
n = int(sys.argv[2]) if len(sys.argv) > 2 else 20
t0 = time.time()
results = []
for seed in range(1, n + 1):
    s = summarize(run_headless(spec, seed))
    s["score"] = round(drama_score(s, spec), 2)
    results.append(s)
print(f"{(time.time() - t0) / n * 1000:.0f} ms/fight")
for s in results:
    print({k: s.get(k) for k in KEYS})
wins = sum(1 for s in results if s.get("winner") == 0)
print(f"{spec['fighters'][0]['name']} wins {wins}/{n}, "
      f"timeouts {sum(1 for s in results if s['timeout'])}")
