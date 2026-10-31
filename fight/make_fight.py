"""
Make a ball-fight short (15-25 s) from two roster characters or a spec file.

    python make_fight.py king knight              # characters/king.json vs characters/knight.json
    python make_fight.py king knight --preview    # fast low-res render
    python make_fight.py specs/custom.json        # a hand-written spec
    python make_fight.py king knight --seed 42    # replay seed 42 of the last run
    python make_fight.py --list                   # show the roster

Writes everything to out/<a>_vs_<b>/ (or out/<spec name>/).
"""

import argparse
import copy
import json
import os
import sys
import time

from fightsim.audio import write_audio_plan
from fightsim.mixer import add_soundtrack
from fightsim.render import SLOWMO_EXTRA, render_video
from fightsim.search import balance, pace, search
from fightsim.spec import (SpecError, build_matchup, finalize, list_characters,
                            load_character, load_spec)

HERE = os.path.dirname(os.path.abspath(__file__))
GOAL_PAUSE = 0.5   # soccer: freeze-frame on every goal (fightsim/render.py)


TITLE_HOOKS = [
    "{A} {ea} VS {eb} {B} — who wins?",
    "Can {A} survive {B}'s {ULT_B}? {ea}{eb}",
    "{A} vs {B} in the {STAGE} {ea}{eb}",
    "{A} {ea} or {B} {eb}? Guess before the K.O.!",
    "{ULT_A} vs {ULT_B}! {A} VS {B}",
    "{A} {ea} VS {eb} {B}: this one goes down to the wire",
    "{LEADS} lead changes?! {A} vs {B} {ea}{eb}",
    "{B} {eb} challenges {A} {ea} at the {STAGE}",
]
HERO_CTA = ("🎨 CREATE A HERO: comment its NAME + POWER. Every Friday we build our favourite fan idea "
            "into a real fighter! #FanHeroFriday")


def fan_credit(spec, meta):
    """Fan heroes ("fan": {"by": "@viewer"} in the character file): credit in the title and
    description, plus the create-a-hero invite on every video."""
    fans = [f for f in spec.get("fighters", []) if isinstance(f, dict) and (f.get("fan") or {}).get("by")]
    lines = [f"⭐ {f['name']}: fan hero idea by {f['fan']['by']}" for f in fans]
    if fans:
        tag = f" (idea by {fans[0]['fan']['by']})"
        if len(meta["title"]) + len(tag) <= 100:
            meta["title"] += tag
    body = meta["description"].split("\n")
    tags = [body.pop()] if body and body[-1].startswith("#") else []     # hashtags stay last
    while body and not body[-1].strip():
        body.pop()
    meta["description"] = "\n".join([*lines, *([""] if lines else []), *body, "", HERO_CTA, "", *tags]).strip()
    return meta


DESC_CTAS = [
    "Comment who you picked before the K.O.!",
    "Who should fight next? Drop a matchup in the comments.",
    "Rematch or new challenger? You decide in the comments.",
    "Which ultimate was stronger? Tell us below.",
]


ROYALE_HOOKS = [
    "{N}-WAY BATTLE ROYALE: who survives? {EMOJIS}",
    "{N} fighters, 1 survivor. Pick yours! {EMOJIS}",
    "Last ball standing wins! {N}-way royale on {STAGE}",
    "Battle Royale on {STAGE}: {A}, {B}, {C} and more {EMOJIS}",
    "Everyone vs everyone! Who wins this {N}-way brawl? {EMOJIS}",
]
ROYALE_CTAS = [
    "Who did you pick to survive? Comment before the end!",
    "Which fighter should join the next royale? Tell us below.",
    "Was it skill or luck? Comment your take.",
]


SOCCER_HOOKS = [
    "{T0} vs {T1}: 2v2 soccer with SUPERPOWERS {EMOJIS}",
    "Soccer, but you can K.O. the other team {EMOJIS}",
    "First to 3 wins! {T0} vs {T1} {EMOJIS}",
    "{A} and {B} vs {C} and {D}: who scores first? {EMOJIS}",
    "When soccer players have ultimates {EMOJIS}",
]


def youtube_meta_soccer(spec, world, summary):
    import random
    fs = spec["fighters"]
    teams = spec["soccer"]["teams"]
    rng = random.Random("soccer|" + "|".join(str(f.get("id")) for f in fs) + f"|{summary['seed']}")
    facts = {"T0": teams[0]["name"].title(), "T1": teams[1]["name"].title(),
             "EMOJIS": "".join(f.get("emoji", "") for f in fs) + "⚽",
             "A": fs[0]["name"], "B": fs[1]["name"], "C": fs[2]["name"], "D": fs[3]["name"]}
    title = " ".join(rng.choice(SOCCER_HOOKS).format(**facts).split())
    lines = [f"Team {facts['T0']}: {fs[0]['name']} + {fs[1]['name']}",
             f"Team {facts['T1']}: {fs[2]['name']} + {fs[3]['name']}",
             "2v2, first to 3 goals. Skills, ultimates and knockouts allowed.", "",
             rng.choice(["Who should play the next match? Comment 4 fighters!",
                         "Which team did you back? Tell us below.",
                         "Best goal or best knockout? Comment!"]), "",
             "#shorts #soccer #football #pixelart #ballbattle"]
    tags = (spec.get("youtube", {}).get("tags") or []) + ["pixel hero fights", "soccer", "football"]
    return {"title": title[:100], "description": "\n".join(lines), "tags": list(dict.fromkeys(tags))[:30],
            "category": "Gaming", "made_for_kids": False, "visibility": "public", "seed": summary["seed"],
            "winner": summary.get("winner_name"), "format": "soccer"}


HORDE_HOOKS = [
    "How many {HORDE} can the {HERO} defeat? Guess first! {E}",
    "{HERO} {E} vs ENDLESS {HORDE}. Guess the score!",
    "Can the {HERO} survive the {HORDE} horde? {E}",
    "{HERO} {E} vs wave after wave of {HORDE}",
]


BOSS_HOOKS = [
    "Can {N} heroes beat the {BOSS}? {E}",
    "BOSS RAID: {BOSS} vs {PARTY} {E}",
    "{N} heroes vs the {BOSS}. Who survives? {E}",
    "The {BOSS} has never lost... {E}",
]


def youtube_meta_boss(spec, world, summary):
    import random
    fs = spec["fighters"]
    boss, party = fs[-1], fs[:-1]
    rng = random.Random("boss|" + "|".join(str(f.get("id")) for f in fs) + f"|{summary['seed']}")
    names = [f["name"] for f in party]
    facts = {"BOSS": boss["name"], "E": boss.get("emoji", ""), "N": len(party),
             "PARTY": ", ".join(names[:-1]) + " and " + names[-1]}
    hooks = [h for h in BOSS_HOOKS if not ("never lost" in h and summary.get("winner") != 0)]
    odds = summary.get("hero_odds")          # this party's win rate across the searched fights
    if odds is not None:                     # the odds are the hook (they're known before the fight)
        pct = max(1, min(99, round(odds * 100)))
        facts["P"] = pct
        if odds <= 0.25:
            hooks = ["Only {P}% chance: can {PARTY} beat the {BOSS}? {E}",
                     "This team wins just {P}% of the time vs the {BOSS} {E}",
                     "The {BOSS} crushes this team {Q}% of the time {E}"]
        elif odds >= 0.7:
            hooks = ["{P}% favourites vs the {BOSS}... easy win? {E}",
                     "This team beats the {BOSS} {P}% of the time. Watch {E}"]
        else:
            hooks = ["Coin flip: {PARTY} vs the {BOSS} ({P}% win chance) {E}",
                     "{P}% chance: can these {N} beat the {BOSS}? {E}"]
        facts["Q"] = 100 - pct
    title = " ".join(rng.choice(hooks).format(**facts).split())
    lines = [f"Raid party: {', '.join(names)}",
             *([f"We simulated this exact team {200} times: they beat the {boss['name']} in {facts['P']}% of raids."]
               if odds is not None else []),
             f"Boss: {boss['name']}. Watch the red warning zones; it gets ENRAGED at half health.", "",
             rng.choice(["Did the heroes win? No spoilers in the comments!",
                         "Which boss should they fight next?",
                         "Who was the MVP? Comment!"]), "",
             "#shorts #bossfight #raid #pixelart #ballbattle"]
    tags = (spec.get("youtube", {}).get("tags") or []) + ["pixel hero fights", "boss raid"]
    return {"title": title[:100], "description": "\n".join(lines), "tags": list(dict.fromkeys(tags))[:30],
            "category": "Gaming", "made_for_kids": False, "visibility": "public", "seed": summary["seed"],
            "winner": summary.get("winner_name"), "format": "boss"}


def youtube_meta_horde(spec, world, summary):
    import random
    hero = spec["fighters"][0]
    hc = spec["horde"]
    rng = random.Random(f"horde|{hero.get('id')}|{hc['kind']}|{summary['seed']}")
    facts = {"HERO": hero["name"], "HORDE": hc["title"].title(), "E": hero.get("emoji", "")}
    title = " ".join(rng.choice(HORDE_HOOKS).format(**facts).split())
    lines = [f"{hero.get('emoji', '')} {hero['name']}: {hero.get('blurb', '')}".strip(),
             f"Endless waves of {facts['HORDE'].lower()} until the {hero['name']} falls. Every hero gets a run; "
             "the leaderboard is at the end.", "",
             rng.choice(["Guess the score before the end! Comment your number.",
                         "Which hero should face the horde next?",
                         "Who will top the leaderboard? Comment!"]), "",
             "#shorts #hordesurvival #pixelart #ballbattle #simulation"]
    tags = (spec.get("youtube", {}).get("tags") or []) + ["pixel hero fights", "survival"]
    return {"title": title[:100], "description": "\n".join(lines), "tags": list(dict.fromkeys(tags))[:30],
            "category": "Gaming", "made_for_kids": False, "visibility": "public", "seed": summary["seed"],
            "winner": None, "format": "horde"}


def youtube_meta_royale(spec, world, summary):
    import random
    yt = spec.get("youtube", {})
    fs = spec["fighters"]
    rng = random.Random("royale|" + "|".join(str(f.get("id")) for f in fs) + f"|{summary['seed']}")
    facts = {"N": len(fs), "STAGE": spec.get("theme", {}).get("stage", "the arena"),
             "EMOJIS": "".join(f.get("emoji", "") for f in fs),
             "A": fs[0]["name"], "B": fs[1]["name"], "C": fs[2]["name"]}
    title = " ".join((yt.get("title") or rng.choice(ROYALE_HOOKS).format(**facts)).split())
    lines = [f"{len(fs)} fighters drop in, the storm closes, items spawn. Last one standing wins.", ""]
    lines += [f"{f.get('emoji', '')} {f['name']}: {f.get('blurb', '')}".strip() for f in fs]
    lines += [f"Map: {facts['STAGE']}", "", rng.choice(ROYALE_CTAS), "",
              "#shorts #battleroyale #pixelart #ballbattle #simulation"]
    tags = (yt.get("tags") or []) + ["pixel hero fights", "battle royale", "ball battle", "pixel art"]
    return {"title": title[:100], "description": "\n".join(lines).strip(),
            "tags": list(dict.fromkeys(tags))[:30], "category": "Gaming", "made_for_kids": False,
            "visibility": "public", "seed": summary["seed"], "winner": summary.get("winner_name"),
            "format": "royale"}


def youtube_meta(spec, world, summary):
    """Title/description written from this fight's own story (never spoils the winner)."""
    return fan_credit(spec, _youtube_meta(spec, world, summary))


def _youtube_meta(spec, world, summary):
    import random
    if spec.get("mode") == "royale":
        return youtube_meta_royale(spec, world, summary)
    if spec.get("mode") == "soccer":
        return youtube_meta_soccer(spec, world, summary)
    if spec.get("mode") == "horde":
        return youtube_meta_horde(spec, world, summary)
    if spec.get("mode") == "boss":
        return youtube_meta_boss(spec, world, summary)
    yt = spec.get("youtube", {})
    a, b = world.mains
    fa, fb = spec["fighters"][0], spec["fighters"][1]
    rng = random.Random(f"{fa.get('id')}|{fb.get('id')}|{summary['seed']}")
    facts = {
        "A": a.name, "B": b.name, "ea": fa.get("emoji", ""), "eb": fb.get("emoji", ""),
        "STAGE": spec.get("theme", {}).get("stage", "Arena"),
        "ULT_A": ((fa.get("meter") or {}).get("label") or "ultimate").title(),
        "ULT_B": ((fb.get("meter") or {}).get("label") or "ultimate").title(),
        "LEADS": summary.get("lead_changes", 0),
    }
    hooks = [h for h in TITLE_HOOKS
             if not ("{LEADS}" in h and facts["LEADS"] < 3)                       # only when true
             and not ("down to the wire" in h and (summary.get("winner_hp") or 99) > 6)
             and not ("{STAGE}" in h and not spec.get("theme", {}).get("stage"))]
    title = yt.get("title") or rng.choice(hooks).format(**facts)
    title = " ".join(title.split())
    lines = [yt.get("description") or "", ""]
    for f, m in ((fa, a), (fb, b)):
        lines.append(f"{f.get('emoji', '')} {m.name}: {f.get('blurb', '')}".strip())
    if facts["STAGE"]:
        lines.append(f"Stage: {facts['STAGE']}")
    lines += ["", rng.choice(DESC_CTAS), "",
              "#shorts #pixelart #ballbattle #simulation #" + "".join(a.name.split()).lower()
              + " #" + "".join(b.name.split()).lower()]
    tags = (yt.get("tags") or []) + ["pixel hero fights", "ball battle", "pixel art", "simulation",
                                     a.name.lower(), b.name.lower(), f"{a.name} vs {b.name}".lower()]
    return {
        "title": title[:100],
        "description": "\n".join(lines).strip(),
        "tags": list(dict.fromkeys(tags))[:30],
        "category": "Gaming",
        "made_for_kids": False,
        "visibility": "public",
        "seed": summary["seed"],
        "winner": summary.get("winner_name"),
    }


def winner_card_hold(spec, best):
    """Seconds to keep the winner card up: long enough for the winner's victory line."""
    hold = max(3.5, float(spec.get("end_hold", 3.5)))
    side = best.get("winner")
    if spec.get("mode") == "horde":
        return hold                      # the hero fell: no victory line, the leaderboard has the stage
    if spec.get("mode") == "boss":
        if best.get("winner") != 0:
            return hold                  # raid failed: no hero line
        side = best.get("mvp_index")       # the MVP says the victory line
    elif spec.get("mode") == "soccer":
        side = best.get("mvp_index")       # the MVP says the victory line
    elif side is None or not best.get("winner_hp"):
        return hold                      # draw, or the winner's minions finished it (no line)
    w = spec["fighters"][side]
    v = w.get("voice")
    if not v:
        return hold
    from fightsim.audio_assets import voice
    from fightsim.mixer import VICTORY_LINE_DELAY
    from fightsim.sfx import SR
    clip = voice(w.get("id"), "victory", float(v.get("pitch", 0)))
    if clip is None:
        return hold
    # the line starts ~VICTORY_LINE_DELAY after the fight ends; leave 0.9 s after it
    return max(hold, VICTORY_LINE_DELAY + 0.15 + len(clip) / SR + 0.9)


def main():
    if hasattr(sys.stdout, "reconfigure"):  # Windows consoles default to cp1252 (no emoji)
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("what", nargs="*", help="two character ids, one spec .json, or: royale [ids...]")
    ap.add_argument("--boss", choices=["dragon", "lich", "golem", "kraken", "mech", "werewolf", "spider", "pharaoh",
                                       "storm", "reaper"], help="boss raid: which boss")
    ap.add_argument("--horde", choices=["skeletons", "zombies"], help="horde survival: which horde")
    ap.add_argument("--map", help="battle royale map (rocky_canyon, lava_ruins, pillar_hall)")
    ap.add_argument("--list", action="store_true", help="list roster characters")
    ap.add_argument("--seeds", type=int, help="how many seeds to search (default: spec search.seeds or 300)")
    ap.add_argument("--seed", type=int, help="render this seed, skip search")
    ap.add_argument("--no-balance", action="store_true", help="skip auto-pace and auto-balance (use spec HP as written)")
    ap.add_argument("--preview", action="store_true", help="540x960 @30fps quick render")
    ap.add_argument("--no-audio", action="store_true", help="skip the 8-bit sound effects")
    ap.add_argument("--workers", type=int, help="processes for the search")
    ap.add_argument("--out", help="output folder (default out/<spec name>)")
    ap.add_argument("--intro", choices=["smash", "drop", "faceoff", "rally"],
                    help="force the intro hook style (default: picked per matchup)")
    ap.add_argument("--simple", action="store_true", help="plain floor, one visible rule per hero")
    args = ap.parse_args()
    if args.simple:
        os.environ["FIGHT_RULES"] = "simple"

    if args.list or not args.what:
        for cid in list_characters():
            ch = load_character(cid)
            print(f"  {cid:<12} {ch.get('emoji', ''):<3} {ch.get('blurb', '')}")
        return

    try:
        if args.what and args.what[0] == "boss":
            from fightsim.spec import build_boss
            kind = args.boss or "dragon"
            heroes = args.what[1:] or None
            spec = finalize(build_boss(kind, heroes, salt=time.strftime("%Y-%m-%d")))
            name = f"boss_{kind}_" + "-".join(f["id"] for f in spec["fighters"][:4])
        elif args.what and args.what[0] == "horde":
            from fightsim.spec import build_horde
            if len(args.what) < 2:
                print("usage: make_fight.py horde <hero> [--horde skeletons|zombies]")
                sys.exit(2)
            kind = args.horde or "skeletons"
            spec = finalize(build_horde(args.what[1], kind))
            name = f"horde_{kind}_{args.what[1]}"
        elif args.what and args.what[0] == "soccer":
            from fightsim.spec import build_soccer
            ids = args.what[1:] or None
            spec = finalize(build_soccer(ids, salt=time.strftime("%Y-%m-%d")))
            name = "soccer_" + "-".join(f if isinstance(f, str) else f.get("id") for f in [x["id"] for x in spec["fighters"]])
        elif args.what and args.what[0] == "royale":
            from fightsim.spec import build_royale
            ids = args.what[1:]
            if not ids:   # six random roster fighters
                import random
                ids = random.Random(time.strftime("%Y-%m-%d")).sample(list_characters(), 4)
            spec = finalize(build_royale(ids, args.map))
            name = f"royale_{spec['map']}_" + "-".join(ids)
        elif len(args.what) == 2:
            a, b = args.what
            spec = finalize(build_matchup(a, b))
            name = f"{a}_vs_{b}"
        elif len(args.what) == 1:
            # Work from any folder: specs may be relative to the cwd or to this script
            path = args.what[0]
            if not os.path.exists(path) and os.path.exists(os.path.join(HERE, path)):
                path = os.path.join(HERE, path)
            if not os.path.exists(path):
                print(f"Spec not found: {path}")
                sys.exit(2)
            spec = load_spec(path)
            name = os.path.splitext(os.path.basename(path))[0]
        else:
            print("Give two character ids (e.g. king knight) or one spec file.")
            sys.exit(2)
    except SpecError as e:
        print(e)
        sys.exit(2)

    out_dir = args.out or os.path.join(HERE, "out", name)

    # --seed replays a fight from an earlier run, which used the paced/balanced HP
    resolved_path = os.path.join(out_dir, "spec.resolved.json")
    if args.seed is not None and not args.no_balance and os.path.exists(resolved_path):
        fresh_youtube = spec.get("youtube", {})
        with open(resolved_path, encoding="utf-8") as f:
            spec = json.load(f)
        spec["youtube"] = fresh_youtube   # titles/descriptions always come from the current logic
        print(f"Using tuned HP from the last run ({resolved_path}); add --no-balance for the raw spec")
    if args.intro:
        spec["intro_style"] = args.intro
    os.makedirs(out_dir, exist_ok=True)
    t0 = time.time()
    report = {"matchup": name}

    # 1. pace + balance
    if not args.no_balance and args.seed is None:
        print("[1/4] Pacing (fight length)...")
        spec, info = pace(spec, args.workers)
        if info:
            report["pace"] = info
            print(f"      -> HP x{info['hp_mult']} {info['hp']}, median {info['median_duration']:.0f}s")
    if spec.get("balance") and not args.no_balance and args.seed is None:
        print("[1/4] Balancing (win rate)...")
        spec, info = balance(spec, args.workers)
        report["balance"] = info
        print(f"      -> {spec['fighters'][info['side']]['name']} hp {info['hp']}, "
              f"{spec['fighters'][0]['name']} win rate {info['win_rate_side0']:.2f}")
        # balancing shifts fight length; re-pace (scales both sides, keeps the ratio)
        print("[1/4] Re-pacing after balance...")
        spec, info = pace(spec, args.workers, log=lambda *_: None)
        if info:
            report["pace_after_balance"] = info
            print(f"      -> HP {info['hp']}, median {info['median_duration']:.0f}s")
    else:
        print("[1/4] Balance skipped")

    # 2. search
    if args.seed is not None:
        print(f"[2/4] Using seed {args.seed}")
        results = search(spec, 1, 1, start=args.seed)
    else:
        n = args.seeds or spec.get("search", {}).get("seeds", 300)
        print(f"[2/4] Searching {n} seeds for the most dramatic fight...")
        results = search(spec, n, args.workers)
        decided = [r for r in results if not r["timeout"]]
        print(f"      {len(decided)}/{n} decided; durations "
              f"{min(r['duration'] for r in decided):.0f}-{max(r['duration'] for r in decided):.0f}s"
              if decided else "      every fight timed out: the matchup needs more damage")
    def finish_t(r):  # the finishing blow, played in slow motion
        return r.get("climax_t") if spec.get("mode") in ("royale", "soccer", "horde", "boss") else r.get("loser_main_death")

    # the whole video (fight + end card) has to fit the shorts window
    hold = float(spec.get("end_hold", 3.5)) + float(spec.get("intro", 1.2))

    def video_len(r):  # intro + fight + slow-motion K.O. + winner card
        return (r["duration"] + hold + (SLOWMO_EXTRA if finish_t(r) is not None else 0)
                + GOAL_PAUSE * len(r.get("goals") or []))

    lo_v, hi_v = spec.get("video_seconds", [15, 25])
    fits = [r for r in results if not r["timeout"] and lo_v <= video_len(r) <= hi_v]
    if args.seed is None and fits:
        results = fits + [r for r in results if r not in fits]
    elif args.seed is None:
        print(f"      WARNING: no fight fits {lo_v}-{hi_v}s; using the best one anyway")
    best = results[0]
    if best["timeout"]:
        print("No decisive fight found. Raise damage or lower HP/heals in the spec.")
        sys.exit(1)
    report["chosen"] = best
    report["top"] = results[:10]
    print(f"      chosen seed {best['seed']}: {best['winner_name']} wins in {best['duration']}s "
          f"with {best['winner_hp']} HP, {best['lead_changes']} lead changes, score {best['score']} "
          f"(video {video_len(best):.1f}s)")

    # 3. render
    resolved = copy.deepcopy(spec)
    if resolved.get("mode") == "horde":
        from fightsim.spec import horde_board
        resolved["horde"]["board"] = horde_board(resolved["horde"]["kind"], os.path.join(HERE, "out"),
                                                 current=(resolved["fighters"][0]["id"], best["kills"]),
                                                 exclude=os.path.basename(os.path.normpath(out_dir)))
        resolved["horde"]["score"] = {"kills": best["kills"], "wave": best["wave"]}
    if args.seed is None:  # a --seed replay must not clobber the tuned spec it replays
        with open(resolved_path, "w", encoding="utf-8") as f:
            json.dump(resolved, f, indent=2, ensure_ascii=False)
    w, h, fps = (540, 960, 30) if args.preview else (1080, 1920, 60)
    video = os.path.join(out_dir, "video_preview.mp4" if args.preview else "video.mp4")
    end_hold = winner_card_hold(resolved, best)
    print(f"[3/4] Rendering {w}x{h}@{fps} -> {video}")
    silent = video.replace(".mp4", "_silent.mp4")
    world, frames, timemap = render_video(resolved, best["seed"], silent, w, h, fps,
                                 slowmo_at=finish_t(best), end_hold=end_hold,
                                 cover_path=os.path.join(out_dir, "cover.jpg"))
    stale = os.path.join(out_dir, "thumbnail.png")   # old covers were taken near the K.O.: spoilers
    if os.path.exists(stale):
        os.remove(stale)
    video_seconds = frames / fps
    if args.no_audio:
        os.replace(silent, video)
    else:
        n = add_soundtrack(world, timemap, resolved, silent, video,
                           os.path.join(out_dir, "audio.wav"), video_seconds)
        print(f"      mixed {n} sound cues -> {video}")

    # 4. side outputs
    print("[4/4] Writing audio plan, metadata, events")
    write_audio_plan(out_dir, resolved, world, video_seconds)
    with open(os.path.join(out_dir, "events.json"), "w", encoding="utf-8") as f:
        json.dump(world.events, f, indent=None)
    with open(os.path.join(out_dir, "youtube.json"), "w", encoding="utf-8") as f:
        json.dump(youtube_meta(resolved, world, best), f, indent=2, ensure_ascii=False)
    with open(os.path.join(out_dir, "report.json"), "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)

    print(f"\nDone in {time.time() - t0:.0f}s -> {os.path.abspath(out_dir)}")


if __name__ == "__main__":
    main()
