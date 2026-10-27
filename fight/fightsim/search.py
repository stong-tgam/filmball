"""
Seed search and auto-balance.

A fight's appeal is "who wins?", so instead of hoping a random seed is
exciting we simulate many seeds headless, score each one for drama and
render only the best. Balance tunes one fighter's HP until the matchup
is close to 50/50 before the search starts.
"""

import copy
import os
from concurrent.futures import ProcessPoolExecutor

from .sim import run_headless

LEAD_HYSTERESIS = 0.06


def summarize(world):
    tl = world.timeline
    winner = world.winner_side
    s = {
        "seed": world.seed,
        "winner": winner,
        "duration": round(world.t, 2),
        "timeout": winner is None,
    }
    if getattr(world, "horde", False):
        return _summarize_horde(world, s)
    if getattr(world, "boss_mode", False) and winner is not None:
        return _summarize_boss(world, s)
    if winner is None:
        return s
    if getattr(world, "royale", False):
        return _summarize_royale(world, s)
    if getattr(world, "soccer", False):
        return _summarize_soccer(world, s)
    loser = 1 - winner

    # lead changes, with hysteresis so jitter around a tie doesn't count
    leader = None
    changes = 0
    comeback = 0.0
    for _, f0, f1 in tl:
        diff = f0 - f1
        if diff > LEAD_HYSTERESIS:
            now = 0
        elif diff < -LEAD_HYSTERESIS:
            now = 1
        else:
            now = leader
        if leader is not None and now != leader:
            changes += 1
        leader = now
        fw, fl = (f0, f1) if winner == 0 else (f1, f0)
        comeback = max(comeback, fl - fw)

    ults = [0, 0]
    loser_main_death = None
    winner_low_t, winner_low = None, 2.0
    mains = {m.uid: m.side for m in world.mains}
    for ev in world.events:
        if ev["type"] == "ultimate":
            side = next(u.side for u in world.units if u.uid == ev["unit"])
            ults[side] += 1
        elif ev["type"] == "death" and mains.get(ev["unit"]) == loser:
            loser_main_death = ev["t"]
    for t, f0, f1 in tl:
        fw = f0 if winner == 0 else f1
        if 0 < fw < winner_low:
            winner_low, winner_low_t = fw, t

    s.update({
        "winner_name": world.mains[winner].name,
        "winner_frac": round(world.side_strength(winner), 4),
        "winner_hp": round(max(0.0, world.mains[winner].hp), 2),
        "lead_changes": changes,
        "comeback": round(comeback, 3),
        "ultimates": ults,
        "loser_main_death": loser_main_death,
        "climax_t": loser_main_death if loser_main_death is not None else winner_low_t,
    })
    return s


def _summarize_royale(world, s):
    winner = s["winner"]
    elims = [ev["t"] for ev in world.events if ev["type"] == "death" and ev.get("main")]
    killers = {ev.get("killer") for ev in world.events if ev["type"] == "death" and ev.get("main")}
    gaps = [b - a for a, b in zip([0.0] + elims, elims)]
    s.update({
        "winner_name": world.mains[winner].name,
        "winner_frac": round(world.side_strength(winner), 4),
        "winner_hp": round(max(0.0, world.mains[winner].hp), 2),
        "eliminations": [round(t, 2) for t in elims],
        "placements": list(world.placements),
        "kills": {str(k): v for k, v in world.kills.items()},
        "killer_count": len(killers - {None}),
        "final_by_fighter": bool([ev for ev in world.events if ev["type"] == "death" and ev.get("main")]
                                 and [ev for ev in world.events if ev["type"] == "death" and ev.get("main")][-1].get("killer")),
        "first_elim": elims[0] if elims else None,
        "min_gap": round(min(gaps[1:]) if len(gaps) > 1 else 0.0, 2),
        "pickups": sum(1 for ev in world.events if ev["type"] == "pickup"),
        "ultimates": [0, 0],
        "lead_changes": 0,
        "comeback": 0.0,
        "climax_t": elims[-1] if elims else None,
    })
    return s


def _summarize_boss(world, s):
    b = world.boss
    heroes = [m for m in world.mains if m.side == 0]
    alive = [m for m in heroes if m.alive]
    deaths = [ev["t"] for ev in world.events if ev["type"] == "death" and ev.get("main")]
    mvp = world.raid_mvp()
    s.update({
        "winner_name": "HEROES" if s["winner"] == 0 else b.name,
        "winner_frac": 0.0, "winner_hp": None, "lead_changes": 0, "ultimates": [0, 0],
        "heroes_alive": len(alive),
        "last_hero_frac": round(min((m.hp / m.max_hp for m in alive), default=0.0), 3),
        "boss_frac": round(max(0.0, b.hp) / b.max_hp, 3),
        "enraged": world.enraged,
        "kos": len([d for d in deaths if d < world.t - 1e-6]),
        "skills": sum(1 for ev in world.events if ev["type"] == "boss_skill"),
        "mvp": mvp.name if mvp else None, "mvp_index": world.mains.index(mvp) if mvp else None,
        "climax_t": deaths[-1] if deaths else None,
    })
    return s


def _drama_boss(s, spec):
    lo, hi = spec.get("duration", {}).get("target", [16, 24])
    d = s["duration"]
    dur_pen = 0.0 if lo <= d <= hi else min(abs(d - lo), abs(d - hi)) * 1.5
    if s["winner"] == 0:      # heroes won: best when it took everything they had
        close = {1: 3.0, 2: 1.8, 3: 0.6}.get(s["heroes_alive"], 0.0) + (1.0 - min(1.0, s["last_hero_frac"] * 3))
    else:                     # boss won: best when the boss was nearly dead
        close = 3.5 * (1.0 - min(1.0, s["boss_frac"] * 5))
    enraged = 1.5 if s["enraged"] else 0.0
    kos = min(1.0, s["kos"] / 2) * 1.0
    return close + enraged + kos - dur_pen


def _summarize_horde(world, s):
    """Survival: the hero always falls (a run that outlasts the cap is a timeout)."""
    hero = world.mains[0]
    s["timeout"] = hero.alive
    low = 0.0                      # seconds spent under 25% HP: the last stand
    prev = None
    for t, frac, _ in world.timeline:
        if prev is not None and frac < 0.25:
            low += t - prev
        prev = t
    s.update({
        "winner": 1, "winner_name": hero.name, "winner_frac": 0.0, "winner_hp": None,
        "kills": world.kill_count, "wave": world.wave, "max_combo": world.max_combo,
        "bosses_killed": world.bosses_killed, "last_stand": round(low, 2),
        "lead_changes": 0, "ultimates": [0, 0],
        "climax_t": hero.died_at,
    })
    return s


def _drama_horde(s, spec):
    lo, hi = spec.get("duration", {}).get("target", [17, 25])
    d = s["duration"]
    dur_pen = 0.0 if lo <= d <= hi else min(abs(d - lo), abs(d - hi)) * 1.5
    stand = min(1.0, s["last_stand"] / 3.0) * 2.5         # a long last stand on low HP
    boss = 1.5 if s["bosses_killed"] else 0.0               # took down the mini-boss
    waves = min(1.0, s["wave"] / 7) * 1.5
    combo = min(1.0, s["max_combo"] / 15) * 1.0
    return stand + boss + waves + combo - dur_pen


def _summarize_soccer(world, s):
    winner = s["winner"]
    score = [0, 0]
    leader, changes, deficit = None, 0, 0
    for _, team, _, _ in world.goals:
        score[team] += 1
        now = 0 if score[0] > score[1] else (1 if score[1] > score[0] else leader)
        if leader is not None and now is not None and now != leader:
            changes += 1
        leader = now
        deficit = max(deficit, score[1 - winner] - score[winner])
    goals = [round(g[0], 2) for g in world.goals]
    mvp = world.mvp()
    teams = world.spec["soccer"].get("teams", [{"name": "HOME"}, {"name": "AWAY"}])
    s.update({
        "winner_name": teams[winner]["name"],
        "winner_frac": 0.0, "winner_hp": None,
        "final_score": list(world.score),
        "goals": goals,
        "first_goal": goals[0] if goals else None,
        "lead_changes": changes,
        "comeback": deficit,
        "golden": world.golden,
        "kos": sum(1 for ev in world.events if ev["type"] == "death" and ev.get("main")),
        "mvp": mvp.name if mvp else None,
        "mvp_index": world.mains.index(mvp) if mvp else None,
        "ultimates": [0, 0],
        "climax_t": goals[-1] if goals else None,
    })
    return s


def _drama_soccer(s, spec):
    lo, hi = spec.get("duration", {}).get("target", [10, 24])
    d = s["duration"]
    dur_pen = 0.0 if lo <= d <= hi else min(abs(d - lo), abs(d - hi)) * 1.5
    fg = s["first_goal"] if s["first_goal"] is not None else 99
    early = 3.0 if fg <= 5 else (1.5 if fg <= 8 else 0.0)            # hook: a goal right away
    margin = abs(s["final_score"][0] - s["final_score"][1])
    close = 2.0 if margin == 1 else 0.0
    leads = min(s["lead_changes"], 2) * 1.0
    comeback = 1.5 if s["comeback"] >= 1 else 0.0
    goals = len(s["goals"])
    to_win = spec.get("soccer", {}).get("to_win", 2)
    many = 1.0 if goals == 2 * to_win - 1 else 0.0              # went the distance: 2-1
    late = 0.5 if s["goals"] and s["goals"][-1] > 0.6 * d else 0.0
    golden = 1.0 if s["golden"] else 0.0
    kos = min(1.0, s["kos"] * 0.3)
    return early + close + leads + comeback + many + late + golden + kos - dur_pen


def _drama_royale(s, spec):
    lo, hi = spec.get("duration", {}).get("target", [20, 27])
    d = s["duration"]
    dur_pen = 0.0 if lo <= d <= hi else min(abs(d - lo), abs(d - hi)) * 1.5
    close = 1.0 - min(1.0, s["winner_frac"] * 4)                  # final duel won on a sliver
    spread = min(1.0, s["min_gap"] / 1.2)                          # eliminations one at a time
    early = 1.0 if (s["first_elim"] or 0) >= 4 else 0.0             # everyone gets screen time
    variety = min(1.0, s["killer_count"] / 3)                      # not one fighter stomping all
    items = min(1.0, s["pickups"] / 5)
    finale = 1.5 if s.get("final_by_fighter") else 0.0             # a real final blow, not the storm
    return 3.0 * close + 2.0 * spread + 1.5 * early + 1.5 * variety + 1.0 * items + finale - dur_pen


def drama_score(s, spec):
    if s["timeout"]:
        return -1e9
    if spec.get("mode") == "royale":
        return _drama_royale(s, spec)
    if spec.get("mode") == "soccer":
        return _drama_soccer(s, spec)
    if spec.get("mode") == "horde":
        return _drama_horde(s, spec)
    if spec.get("mode") == "boss":
        return _drama_boss(s, spec)
    lo, hi = spec.get("duration", {}).get("target", [13, 20])
    d = s["duration"]
    dur_pen = 0.0 if lo <= d <= hi else min(abs(d - lo), abs(d - hi)) * 1.5  # length matters a lot in shorts

    close = 1.0 - min(1.0, s["winner_frac"] * 4)          # 1.0 = won on a sliver
    leads = min(s["lead_changes"], 4) / 4.0
    comeback = min(1.0, s["comeback"] / 0.5)              # winner was way behind
    has_meter = [bool(f.get("meter")) for f in spec["fighters"][:2]]
    ult_ok = all(n > 0 for n, m in zip(s["ultimates"], has_meter) if m)
    return 3.0 * close + 2.0 * leads + 2.0 * comeback + (1.0 if ult_ok else 0.0) - dur_pen


def _one(args):
    spec, seed = args
    return summarize(run_headless(spec, seed))


def run_many(spec, seeds, workers=None):
    workers = workers or max(1, (os.cpu_count() or 2) - 1)
    jobs = [(spec, s) for s in seeds]
    if workers == 1:
        return [_one(j) for j in jobs]
    with ProcessPoolExecutor(max_workers=workers) as ex:
        return list(ex.map(_one, jobs, chunksize=max(1, len(jobs) // (workers * 4))))


def win_rate(results):
    decided = [r for r in results if not r["timeout"]]
    if not decided:
        return 0.5, 1.0
    w0 = sum(1 for r in decided if r["winner"] == 0) / len(decided)
    timeouts = 1 - len(decided) / len(results)
    return w0, timeouts


def pace(spec, workers=None, log=print):
    """Scale both fighters' HP so the median fight lands mid-target.

    Specs written by hand (or by an LLM) can't predict fight length, so this
    is done by simulation. HP is scaled rather than damage so the numbers on
    screen stay truthful. Timeouts count as max duration.
    """
    cfg = spec.get("pace", {})
    if cfg is False or cfg.get("enabled") is False:
        return spec, None
    n = int(cfg.get("seeds", 80))
    iters = int(cfg.get("iters", 7))
    lo, hi = cfg.get("range", [0.25, 2.5])
    t_lo, t_hi = spec.get("duration", {}).get("target", [13, 20])
    goal = (t_lo + t_hi) / 2
    max_d = spec.get("duration", {}).get("max", 90)
    nf = len(spec["fighters"]) if spec.get("mode") in ("royale", "boss") else (1 if spec.get("mode") == "horde" else 2)
    base = [float(f["hp"]) for f in spec["fighters"][:nf]]
    seeds = list(range(200000, 200000 + n))

    def with_mult(m):
        s = copy.deepcopy(spec)
        for i in range(nf):
            s["fighters"][i]["hp"] = max(1, round(base[i] * m))
        return s

    def median_duration(results):
        ds = sorted(max_d if r["timeout"] else r["duration"] for r in results)
        return ds[len(ds) // 2]

    best = None
    for i in range(iters):
        mid = (lo + hi) / 2
        res = run_many(with_mult(mid), seeds, workers)
        med = median_duration(res)
        _, to = win_rate(res)
        log(f"  [pace] iter {i + 1}: hp x{mid:.2f}  median {med:.0f}s  timeouts={to:.2f}")
        # closest to goal wins; on ties (e.g. everything hit the time cap) prefer less HP
        key = (abs(med - goal), mid if med > goal else -mid)
        if best is None or key < best[2]:
            best = (mid, med, key)
        if med > goal:
            hi = mid
        else:
            lo = mid
    mult, med, _ = best
    out = with_mult(mult)
    info = {"hp_mult": round(mult, 3), "median_duration": med,
            "hp": [f["hp"] for f in out["fighters"][:nf]]}
    if abs(med - goal) > (t_hi - t_lo) / 2:
        info["warning"] = (f"can't reach {goal:.0f}s by HP alone (median {med:.0f}s); "
                           "the fighters rarely hit each other: raise damage, seek or "
                           "reduce heals/shields/summons")
        log(f"  [pace] WARNING: {info['warning']}")
    return out, info


def balance(spec, workers=None, log=print):
    """Bisect one fighter's HP so side 0 wins about `target` of fights."""
    cfg = spec.get("balance")
    if not cfg:
        return spec, None
    side = int(cfg.get("side", 1))
    n = int(cfg.get("seeds", 120))
    iters = int(cfg.get("iters", 6))
    target = float(cfg.get("target", 0.5))
    lo, hi = cfg.get("range", [0.3, 3.0])
    base_hp = float(spec["fighters"][side]["hp"])
    seeds = list(range(100000, 100000 + n))

    def with_mult(m):
        s = copy.deepcopy(spec)
        s["fighters"][side]["hp"] = max(1, round(base_hp * m))
        return s

    best = None
    for i in range(iters):
        mid = (lo + hi) / 2
        trial = with_mult(mid)
        w0, to = win_rate(run_many(trial, seeds, workers))
        hp = trial["fighters"][side]["hp"]
        log(f"  [balance] iter {i + 1}: {spec['fighters'][side]['name']} hp={hp}  "
            f"{spec['fighters'][0]['name']} win rate={w0:.2f}  timeouts={to:.2f}")
        if best is None or abs(w0 - target) < abs(best[1] - target):
            best = (mid, w0, hp)
        # more HP for `side` lowers side 0's win rate
        side_wins_too_much = (w0 < target) if side != 0 else (w0 > target)
        if side_wins_too_much:
            hi = mid
        else:
            lo = mid
    mult, w0, hp = best
    info = {"side": side, "hp": hp, "win_rate_side0": round(w0, 3), "seeds": n}
    if abs(w0 - target) > 0.1:
        info["warning"] = ("HP alone can't balance this matchup; "
                           "weaken the stronger fighter's mechanics in the spec")
        log(f"  [balance] WARNING: {info['warning']}")
    return with_mult(mult), info


def search(spec, n_seeds, workers=None, start=1):
    results = run_many(spec, range(start, start + n_seeds), workers)
    for r in results:
        r["score"] = round(drama_score(r, spec), 3)
    if spec.get("mode") == "boss" and results:
        # fixed-HP raids: the party's real odds decide the ending. Draw heroes-win with the
        # probability seen across all searched seeds, then keep the most dramatic seed of that kind.
        import random as _random
        odds = sum(1 for r in results if r["winner"] == 0) / len(results)
        party = "|".join(str(f.get("id")) for f in spec["fighters"])
        want = 0 if _random.Random(f"odds|{party}|{spec.get('salt', '')}").random() < odds else 1
        for r in results:
            r["hero_odds"] = round(odds, 3)
            if r["winner"] == want:
                r["score"] = round(r["score"] + 6.0, 3)
    results.sort(key=lambda r: r["score"], reverse=True)
    return results
