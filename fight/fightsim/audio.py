"""
Audio planning (no synthesis yet).

Turns the chosen fight's event log into
  - audio_cues.json   : every sound to place, with exact timestamps
  - audio_prompts.json: one generation prompt per sound type + a music prompt
  - audio_prompt.md   : the same, human readable, ready to paste into an
                        audio-generation tool
A later step can generate each sound once, then mix them at the cue times.
"""

import json

DEFAULT_MUSIC = ("upbeat looping chiptune battle theme, 140 bpm, steady driving beat, "
                 "builds intensity toward the end, no vocals")

DEFAULT_SFX = {
    "blade_hit": ("short crisp sword slash impact, retro 8-bit game style", 0.3),
    "body_hit": ("short soft punchy thud, cartoon game style", 0.25),
    "clash": ("bright metallic sword clang, short", 0.35),
    "heal": ("short sparkly rising chime", 0.5),
    "summon": ("magic poof with a small fanfare blip", 0.7),
    "ultimate": ("big power-up whoosh with rising synth, epic", 1.0),
    "shockwave": ("deep boom with an air whoosh", 0.8),
    "thorns_hit": ("small sharp prickly zap", 0.25),
    "projectile_hit": ("short arrow thunk impact", 0.25),
    "spell_hit": ("dark magic drain zap", 0.4),
    "shockwave_hit": ("heavy impact thump", 0.3),
    "poison_hit": ("tiny wet bubbling tick", 0.15),
    "poison": ("venomous hiss", 0.4),
    "shoot": ("quick bow twang or magic cast whoosh", 0.3),
    "block": ("solid shield block clank", 0.3),
    "ability": ("short dramatic power stinger", 0.6),
    "debuff": ("descending frosty slowdown whoosh", 0.5),
    "death": ("cartoon pop with a descending tone", 0.5),
    "death_main": ("dramatic heavy defeat hit with a long descending tone", 1.2),
    "victory": ("short triumphant fanfare", 2.0),
    "wall": ("very soft subtle tick", 0.1),
}

MERGE_WINDOW = 0.04  # same cue within 40 ms is one sound


def build_cues(world):
    by_uid = {u.uid: u for u in world.units}
    cues = []
    last = {}

    last_loud_ult = {}   # uid -> time of the last full (voiced) ultimate
    def add(t, cue, intensity=0.5, unit=None, **extra):
        if t - last.get(cue, -1) < MERGE_WINDOW:
            return
        last[cue] = t
        c = {"t": round(t, 3), "cue": cue, "intensity": round(min(1.0, intensity), 3)}
        if unit is not None:
            c["unit"] = unit.name
        c.update(extra)
        cues.append(c)

    def per_unit(base, u):
        return f"{base}:{u.kind}" if u is not None else base

    for ev in world.events:
        t, kind = ev["t"], ev["type"]
        if kind == "damage" and ev.get("src") is None:
            continue   # storm / lava ticks are silent
        if kind == "damage":
            src = by_uid.get(ev["src"])
            add(t, per_unit(f"{ev['source']}_hit", src), ev["amount"] / 15.0, src,
                amount=ev["amount"])
        elif kind == "heal" and ev["amount"] >= 0.5:
            add(t, "heal", ev["amount"] / 10.0, by_uid.get(ev["unit"]))
        elif kind == "clash":
            add(t, "clash", 0.7)
        elif kind == "block":
            add(t, "block", 0.6, by_uid.get(ev["unit"]))
        elif kind == "shoot":
            u = by_uid.get(ev["unit"])
            if ev.get("style") == "puck":
                add(t, "slapshot", 0.8, u)
            else:
                add(t, per_unit("shoot", u), 0.5, u)
        elif kind == "launch":
            add(t, "check", min(1.0, ev.get("mult", 2) / 3), by_uid.get(ev["unit"]))
        elif kind == "poisoned":
            add(t, "poison", 0.5, by_uid.get(ev["unit"]))
        elif kind == "debuff":
            add(t, "debuff", 0.6, by_uid.get(ev["unit"]))
        elif kind == "ability":
            u = by_uid.get(ev["unit"])
            add(t, per_unit("ability", u), 0.9, u, name=ev.get("name"))
        elif kind == "summon":
            u = by_uid.get(ev["unit"])
            add(t, per_unit("summon", u), 0.8, u)
        elif kind == "ultimate":
            u = by_uid.get(ev["unit"])
            gap = float(world.spec.get("cutin_gap", 0))
            if gap and t - last_loud_ult.get(ev["unit"], -99) < gap:
                add(t, per_unit("ultimate", u), 0.4, u, quiet=True)   # chained cast: no voice, softer
            else:
                last_loud_ult[ev["unit"]] = t
                add(t, per_unit("ultimate", u), 1.0, u)
        elif kind == "shockwave":
            u = by_uid.get(ev["unit"])
            add(t, per_unit("shockwave", u), 0.9, u)
        elif kind == "death" and getattr(world, "horde", False) and not ev.get("main"):
            add(t, world.spec["horde"].get("death_sound", "bones"), 0.6)
        elif kind == "boss_skill":
            add(t, "warn", 0.8)
        elif kind == "boss_impact":
            add(t, "shockwave", 1.0)
        elif kind == "enraged":
            add(t, "enraged", 1.0)
        elif kind == "wave":
            add(t, "wave_horn", 1.0, boss=bool(ev.get("boss")))
        elif kind == "death":
            multi = getattr(world, "royale", False) or getattr(world, "boss_mode", False)
            final = not (multi or getattr(world, "soccer", False)) or (multi and t >= world.t - 1e-6)
            name = ("death_main" if final else "elim") if ev.get("main") else "death"
            add(t, name, 1.0, by_uid.get(ev["unit"]))
        elif kind == "pickup":
            add(t, "pickup", 0.7, by_uid.get(ev["unit"]))
        elif kind in ("freeze_all", "frozen"):
            add(t, "freeze", 1.0 if kind == "freeze_all" else 0.5)
        elif kind == "lightning":
            add(t, "lightning", 1.0)
        elif kind == "goal":
            add(t, "goal", 1.0)
        elif kind in ("kickoff", "golden_goal"):
            add(t + (0.95 if kind == "kickoff" else 0.0), "whistle", 0.8)
        elif kind == "respawn":
            add(t, "summon", 0.6)
        elif kind == "mine":
            add(t, "shockwave", 1.0)
        elif kind in ("kick", "ball_hit"):
            add(t, "bump", 0.8 if kind == "ball_hit" else 0.5)
        elif kind == "victory":
            add(t + 0.15, "victory", 1.0, heroes=ev.get("side") == 0)
        elif kind == "bump":
            add(t, "bump", 0.6)
        elif kind == "wall":
            u = by_uid.get(ev["unit"])
            if u is not None and u.is_main:
                add(t, "wall", 0.15)
    return cues


def _sfx_prompt(cue, spec):
    overrides = spec.get("audio", {}).get("sfx", {})
    if cue in overrides:
        base = cue.split(":")[0]
        return overrides[cue], DEFAULT_SFX.get(base, ("", 0.5))[1]
    base = cue.split(":")[0]
    if base in overrides:
        return overrides[base], DEFAULT_SFX.get(base, ("", 0.5))[1]
    return DEFAULT_SFX.get(base, (f"short game sound effect for {cue}", 0.5))


def build_prompts(spec, world, cues, video_seconds):
    counts = {}
    for c in cues:
        counts[c["cue"]] = counts.get(c["cue"], 0) + 1
    names = " vs ".join(m.name for m in world.mains)
    sfx = []
    for cue in sorted(counts):
        prompt, dur = _sfx_prompt(cue, spec)
        sfx.append({
            "cue": cue,
            "prompt": prompt,
            "duration_s": dur,
            "uses": counts[cue],
            # frequent sounds need variations so repetition isn't grating
            "variations": 3 if counts[cue] >= 10 else 1,
            "optional": cue == "wall",
        })
    music = spec.get("audio", {}).get("music", DEFAULT_MUSIC)
    return {
        "fight": names,
        "video_seconds": round(video_seconds, 2),
        "music": {"prompt": music, "duration_s": round(video_seconds, 1), "loopable": True},
        "sfx": sfx,
        "mix": [
            "Music bed at about -18 LUFS; duck it 4 dB for 0.5 s under each ultimate and death_main.",
            "Scale each hit's volume by its cue 'intensity' (0..1): quiet early hits, loud late ones.",
            "Pitch blade_hit up slightly as the fight goes on (+0 to +3 semitones) to build tension.",
            "Never stack more than 3 hit sounds within 50 ms.",
            "Cut the music on the final death_main, then play victory.",
        ],
    }


def write_audio_plan(out_dir, spec, world, video_seconds):
    cues = build_cues(world)
    plan = build_prompts(spec, world, cues, video_seconds)
    with open(f"{out_dir}/audio_cues.json", "w", encoding="utf-8") as f:
        json.dump(cues, f, indent=1)
    with open(f"{out_dir}/audio_prompts.json", "w", encoding="utf-8") as f:
        json.dump(plan, f, indent=2, ensure_ascii=False)

    lines = [
        f"# Audio plan: {plan['fight']}",
        "",
        f"Video length: **{plan['video_seconds']} s**. Exact timestamps for every sound are in "
        "`audio_cues.json` (`t` in seconds, `cue` names the sound below, `intensity` 0–1).",
        "",
        "## Music",
        "",
        f"> {plan['music']['prompt']}. Length {plan['music']['duration_s']} s, loopable.",
        "",
        "## Sound effects",
        "",
        "| Cue | Uses | Length | Variations | Prompt |",
        "|---|---|---|---|---|",
    ]
    for s in plan["sfx"]:
        opt = " (optional)" if s["optional"] else ""
        lines.append(f"| `{s['cue']}`{opt} | {s['uses']} | {s['duration_s']} s | "
                     f"{s['variations']} | {s['prompt']} |")
    lines += ["", "## Mixing", ""] + [f"- {m}" for m in plan["mix"]] + [""]
    with open(f"{out_dir}/audio_prompt.md", "w", encoding="utf-8") as f:
        f.write("\n".join(lines))
    return plan
