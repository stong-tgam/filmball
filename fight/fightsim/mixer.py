"""
Mixer: turns a fight's audio cues into a soundtrack that lines up with the video.

The renderer records a time map (simulation time -> video time), which covers
the intro offset and the slow-motion K.O. stretch. Each cue is placed with a
synthesized 8-bit sound (fightsim/sfx.py), loud pile-ups are thinned out, the
result is soft-limited and muxed into the MP4 with ffmpeg.
"""

import bisect
import os
import subprocess
import wave

import imageio_ffmpeg
import numpy as np

from .audio import build_cues
from .audio_assets import announcer, voice
from .music import compose
from . import cta
from .intro import INTRO_STYLES, intro_style
from .sfx import SR, character_pitch, make

# per-sound volume; anything not listed is silent
GAIN = {
    "blade_hit": 0.55, "body_hit": 0.5, "bump": 0.45, "projectile_hit": 0.45, "spell_hit": 0.5,
    "shockwave_hit": 0.35, "thorns_hit": 0.3, "poison_hit": 0.15, "heal": 0.35, "clash": 0.42,
    "block": 0.4, "shoot": 0.3, "poison": 0.3, "debuff": 0.4, "ability": 0.5, "summon": 0.5,
    "slapshot": 0.6, "check": 0.85, "elim": 0.8, "pickup": 0.45, "freeze": 0.6, "lightning": 0.8, "goal": 0.9, "whistle": 0.6, "bones": 0.4, "splat": 0.4, "wave_horn": 0.6, "warn": 0.55, "enraged": 0.9, "ultimate": 0.7, "shockwave": 0.6, "death": 0.4, "death_main": 0.95, "victory": 0.6,
    "wall": 0.12, "round": 0.6, "fight": 0.7,
}
# never dropped by the pile-up limiter
PRIORITY = {"warn", "enraged", "wave_horn", "goal", "whistle", "freeze", "lightning", "elim", "pickup", "check", "ultimate", "death_main", "victory", "summon", "shockwave", "round", "fight", "ability"}
# these get a per-character pitch so each fighter sounds a bit different
PITCHED = {"blade_hit", "body_hit", "projectile_hit", "shoot", "ultimate", "summon", "ability", "spell_hit"}
MAX_STACK, STACK_WINDOW = 3, 0.05


def _to_video(timemap):
    """Function mapping simulation time to video time (piecewise, extrapolated at the ends)."""
    sims = [s for s, _ in timemap]
    vids = [v for _, v in timemap]

    def f(t):
        if not sims:
            return t
        if t <= sims[0]:
            return vids[0] + (t - sims[0])
        if t >= sims[-1]:
            return vids[-1] + (t - sims[-1])
        i = bisect.bisect_left(sims, t)
        s0, s1, v0, v1 = sims[i - 1], sims[i], vids[i - 1], vids[i]
        return v0 + (v1 - v0) * (t - s0) / max(1e-9, s1 - s0)

    return f


VOICE_GAIN, ANNOUNCER_GAIN, DUCK = 1.45, 1.35, 0.5
MUSIC_GAIN = 0.3   # chiptune bed under the effects
VICTORY_LINE_DELAY = 1.05   # after the K.O. clip, when the winner card is up


def _boss_line(name):
    """A boss voice / raid result line from audio/boss/ (None if missing)."""
    if not name:
        return None
    from .audio_assets import load_clip
    return load_clip(os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "audio", "boss", f"{name}.mp3"))


def build_track(cues, timemap, video_seconds, intro_len, spec=None, winner=None):
    n = int(SR * video_seconds) + 1
    out = np.zeros(n)
    vox = np.zeros(n)   # announcer + character voices, mixed on top with ducking
    cache = {}
    starts = []
    to_video = _to_video(timemap)
    wall_on = (spec or {}).get("audio", {}).get("wall_sounds", True)

    def place(vt, name, pitch=1.0, seed=0, gain=1.0):
        key = (name, round(pitch, 3), seed)
        snd = cache.get(key)
        if snd is None:
            snd = cache[key] = make(name, pitch, seed)
        i = int(vt * SR)
        if i >= n or i < 0:
            return
        end = min(n, i + len(snd))
        out[i:end] += snd[: end - i] * gain

    def say(vt, clip, gain):
        if clip is None:
            return False
        i = int(vt * SR)
        if 0 <= i < n:
            end = min(n, i + len(clip))
            vox[i:end] += clip[: end - i] * gain
        return True

    voices = {f.get("id"): f.get("voice") for f in (spec or {}).get("fighters", []) if f.get("voice")}

    def line(kind, name):
        v = voices.get(kind)
        return voice(kind, name, float(v.get("pitch", 0))) if v else None

    if (spec or {}).get("mode") == "soccer":
        say(0.85, announcer("kickoff"), ANNOUNCER_GAIN)
    elif (spec or {}).get("mode") == "horde":
        say(0.85, announcer("survive"), ANNOUNCER_GAIN)
    elif (spec or {}).get("mode") == "boss":   # the boss speaks first, in its own voice
        boss_tpl = spec["fighters"][-1]
        say(0.55, _boss_line(boss_tpl.get("voice_intro")), VOICE_GAIN)       # soccer: "Kick off!" with the whistle
    elif not say(0.0, announcer("round_fight"), ANNOUNCER_GAIN):
        place(0.05, "round", gain=GAIN["round"])
        place(max(0.0, intro_len - 0.45), "fight", gain=GAIN["fight"])
    ko_clip = announcer("ko")
    victory_vt = None
    first_ko_vt = None

    for idx, c in enumerate(cues):
        base, _, kind = c["cue"].partition(":")
        if base not in GAIN or (base == "wall" and not wall_on):
            continue
        vt = to_video(c["t"])
        if base not in PRIORITY:
            recent = [s for s in starts if vt - s < STACK_WINDOW]
            if len(recent) >= MAX_STACK:
                continue
            starts.append(vt)
            if len(starts) > 32:
                starts = starts[-16:]
        pitch = character_pitch(kind) if (kind and base in PITCHED) else 1.0
        if base not in PRIORITY:
            pitch *= 1 + 0.03 * ((idx * 7919) % 5 - 2)   # tiny variation between repeats
        gain = GAIN[base] * (0.55 + 0.45 * float(c.get("intensity", 0.5)))
        if base == "death_main" and first_ko_vt is None:
            first_ko_vt = vt
        if base == "death_main" and ko_clip is not None:
            say(vt, ko_clip, ANNOUNCER_GAIN)
            gain *= 0.7   # let the announcer lead
        elif base in ("ultimate", "ability") and kind and not c.get("quiet"):
            say(vt + 0.03, line(kind, base), VOICE_GAIN)
        elif base == "victory":
            victory_vt = vt
        elif base == "goal":
            say(vt + 0.05, announcer("goal"), ANNOUNCER_GAIN)
        elif base == "enraged":
            say(vt + 0.05, _boss_line((spec or {}).get("fighters", [{}])[-1].get("voice_enraged")), VOICE_GAIN)
        elif base == "victory" and (spec or {}).get("mode") == "boss":
            say(vt + 0.05, _boss_line("boss_defeated" if c.get("heroes") else "raid_failed"), ANNOUNCER_GAIN)
        elif base == "wave_horn" and c.get("boss"):
            say(vt + 0.1, announcer("wave"), ANNOUNCER_GAIN)
        if c.get("quiet"):
            gain *= 0.5
        place(vt, base, pitch, seed=idx % 4, gain=gain)
        if base == "ultimate" and not c.get("quiet"):   # the cut-in banner's whoosh + a deep boom under the power-up
            place(vt, "shoot", 0.5, gain=0.4)
            place(vt + 0.05, "shockwave", 1.3, gain=0.35)

    if winner and victory_vt is not None:
        say(victory_vt + VICTORY_LINE_DELAY, line(winner, "victory"), VOICE_GAIN)

    # background chiptune: from the first frame to a hard stop at the K.O.
    music_on = (spec or {}).get("audio", {}).get("music_track", True)
    stop = first_ko_vt if first_ko_vt is not None else victory_vt
    if music_on and stop:
        ids = "|".join(str(f.get("id")) for f in (spec or {}).get("fighters", []))
        stage = (spec or {}).get("theme", {}).get("stage", "")
        fight_vt = max(0.0, intro_len - 0.45)
        track, _ = compose(stop + 0.05, ids, stage, fight_start=fight_vt,
                           finale_at=fight_vt + 0.7 * (stop - fight_vt))
        fade = np.ones(len(track))
        k = min(len(track), int(0.06 * SR))
        fade[-k:] = np.linspace(1, 0, k)                 # quick cut at the K.O.
        intro_n = min(len(track), int(fight_vt * SR))
        fade[:intro_n] *= 0.55                           # quieter under ROUND 1
        out[: len(track)] += track * fade * MUSIC_GAIN

    # duck the effects under any voice so the words stay clear
    if vox.any():
        win = int(0.05 * SR)
        act = np.convolve((np.abs(vox) > 0.02).astype(float), np.ones(win) / win, "same")
        out = out * (1 - DUCK * np.clip(act * 3, 0, 1)) + vox

    # intro hook, added after ducking so the announcer never buries the smash:
    # each style has its own whooshes, crunches and booms (fightsim/intro.py)
    hook = np.zeros(n)
    hook_sounds = list(INTRO_STYLES[intro_style(spec)]["sounds"])
    if cta.enabled(spec) and victory_vt is not None:   # clicks for the end CTA's LIKE / SUBSCRIBE
        end_vt = victory_vt - 0.15                       # the victory cue sits 0.15 s after the fight ends
        shift = 2.0 if (spec or {}).get("mode") == "horde" else 0.0   # horde: leaderboard first
        hook_sounds += [(end_vt + shift + t, name, pitch, g) for t, name, pitch, g in cta.SOUNDS]
        if (spec or {}).get("horde", {}).get("board", {}).get("new_record"):
            say(end_vt + 0.9, announcer("new_record"), ANNOUNCER_GAIN)
    for vt, name, pitch, g in hook_sounds:
        snd = make(name, pitch, 0)
        i = int(vt * SR)
        if i < n:
            hook[i:i + len(snd)] += snd[: n - i]  * g
    out = out + hook

    # soft limiter, then normalise to a safe peak
    out = np.tanh(out * 1.3)
    peak = float(np.max(np.abs(out))) or 1.0
    return out * (0.89 / max(peak, 0.89))


def write_wav(path, samples):
    data = (np.clip(samples, -1, 1) * 32767).astype("<i2").tobytes()
    with wave.open(path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(data)


def mux(video_in, wav_path, video_out):
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    res = subprocess.run([
        ffmpeg, "-y", "-loglevel", "error", "-i", video_in, "-i", wav_path,
        "-map", "0:v", "-map", "1:a", "-c:v", "copy", "-c:a", "aac", "-b:a", "160k",
        "-movflags", "+faststart", video_out,
    ], capture_output=True, text=True)
    if res.returncode != 0:
        raise RuntimeError(f"ffmpeg mux failed: {res.stderr[-400:]}")


def add_soundtrack(world, timemap, spec, silent_video, final_video, wav_path, video_seconds):
    cues = build_cues(world)
    winner = None
    if getattr(world, "horde", False):
        winner = None                    # the hero fell: no victory line
    elif getattr(world, "boss_mode", False):
        m = world.raid_mvp() if world.winner_side == 0 else None
        winner = m.kind if m is not None else None
    elif getattr(world, "soccer", False):
        m = world.mvp()
        winner = m.kind if m is not None else None
    elif world.winner_side is not None and world.mains[world.winner_side].alive:
        winner = world.mains[world.winner_side].kind
    track = build_track(cues, timemap, video_seconds, float(spec.get("intro", 1.2)), spec, winner)
    write_wav(wav_path, track)
    mux(silent_video, wav_path, final_video)
    os.remove(silent_video)
    return len(cues)
