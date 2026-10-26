"""
Recorded audio: announcer clips (audio/announcer/*.mp3) and character voice
lines (characters/voice/<id>/<line>.mp3). Decoded with the bundled ffmpeg to
mono float arrays at the synth's sample rate, cached per process.
"""

import os
import subprocess

import imageio_ffmpeg
import numpy as np

from .sfx import SR

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ANNOUNCER_DIR = os.path.join(ROOT, "audio", "announcer")
VOICE_DIR = os.path.join(ROOT, "characters", "voice")
_cache = {}


def load_clip(path, pitch=0.0):
    """Mono float32 samples, or None if the file is missing. pitch: semitones (resampled)."""
    key = (path, pitch)
    if key in _cache:
        return _cache[key]
    x = None
    if os.path.exists(path):
        raw = subprocess.run([imageio_ffmpeg.get_ffmpeg_exe(), "-loglevel", "error", "-i", path,
                              "-f", "s16le", "-ac", "1", "-ar", str(SR), "-"],
                             capture_output=True).stdout
        x = np.frombuffer(raw, "<i2").astype(np.float64) / 32768
        if pitch:   # lower pitch = slower and deeper (simple resample, good for monsters)
            r = 2 ** (pitch / 12)
            x = np.interp(np.arange(0, len(x) - 1, r), np.arange(len(x)), x)
    _cache[key] = x
    return x


def segments(x, gap=0.12, rel=0.12):
    """(start, end) seconds of the sounding parts, split by quiet gaps of at least `gap`."""
    win = int(0.02 * SR)
    env = np.convolve(np.abs(x), np.ones(win) / win, "same")
    on = env > rel * (env.max() or 1)
    segs, start, quiet, hop = [], None, 0, 441
    for i in range(0, len(on), hop):
        if on[i]:
            start = i if start is None else start
            quiet = 0
        elif start is not None:
            quiet += hop
            if quiet > gap * SR:
                segs.append((start / SR, (i - quiet) / SR))
                start, quiet = None, 0
    if start is not None:
        segs.append((start / SR, len(x) / SR))
    return segs


def trim_lead(x):
    """Drop leading silence so a voice line starts right on its cue."""
    segs = segments(x)
    if not segs:
        return x
    return x[max(0, int((segs[0][0] - 0.02) * SR)):]


def announcer(name):
    return load_clip(os.path.join(ANNOUNCER_DIR, f"{name}.mp3"))


def fight_word_at():
    """Seconds into round_fight.mp3 where "FIGHT!" starts (the last spoken segment)."""
    x = announcer("round_fight")
    if x is None:
        return None
    segs = segments(x)
    return segs[-1][0] if len(segs) >= 2 else None


def intro_length(default=1.2):
    """Intro duration so the on-screen "FIGHT!" (shown for the last 0.45 s) lands on the word."""
    t = fight_word_at()
    return round(t + 0.45, 3) if t is not None else default


def voice(kind, line, pitch=0.0):
    x = load_clip(os.path.join(VOICE_DIR, kind, f"{line}.mp3"), pitch)
    return None if x is None else trim_lead(x)
