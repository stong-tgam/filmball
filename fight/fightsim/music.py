"""
Procedural 8-bit battle music (NES-style), pure numpy.

Four channels like a real chiptune: square-wave lead melody, square arpeggio,
triangle bass and noise drums. Each matchup gets its own tune from a seed;
the stage sets the mood (dark minor vs heroic major) and tempo. The tune
builds: light during the intro, full band at "FIGHT!", denser drums near the
end, and a hard stop at the K.O.
"""

import zlib

import numpy as np

from .sfx import SR, crush, env, noise, square, triangle

DARK_STAGES = {"midnight graveyard", "haunted graveyard", "blood crypt", "midnight rooftops", "arcane tower", "frozen longship"}

# chord progressions as scale degrees (0-based) of a 7-note scale
PROGRESSIONS = {
    "dark": [[0, 5, 2, 6], [0, 3, 4, 0], [0, 6, 5, 4], [0, 5, 3, 4]],
    "bright": [[0, 4, 5, 3], [0, 3, 4, 4], [0, 5, 3, 4], [5, 3, 0, 4]],
}
SCALES = {
    "dark": [0, 3, 5, 7, 10, 12, 15],   # minor pentatonic (+octave): menacing but singable
    "bright": [0, 2, 4, 7, 9, 12, 14],  # major pentatonic: bright arcade hook
}


# Earworm hooks: 2 bars of 8th notes as scale degrees (None = rest). Short, repetitive and
# rhythmic on purpose: the same riff comes back every 2 bars so it sticks in your head.
HOOKS = [
    [4, None, 4, 5, 4, None, 2, None, 0, None, 2, 4, 2, None, None, None],
    [0, 0, 4, None, 4, 5, 4, 2, 0, None, 0, 2, 4, None, 2, None],
    [7, None, 4, None, 5, 4, 2, 4, 0, None, None, 2, 4, 5, 4, None],
    [4, 2, 4, None, 7, None, 5, 4, 2, None, 0, None, 2, 4, 2, None],
    [0, None, 0, 4, None, 4, 5, None, 4, 2, 0, None, 2, None, 0, None],
]
# answer phrase for bars 3-4 of every 4: the hook again, ending somewhere else (call and response)
ANSWER_ENDS = [[2, None, 0, None], [5, 4, 2, None], [4, None, 7, None]]


def _freq(semi):
    return 440.0 * 2 ** ((semi - 9) / 12)   # semitone 0 = C4


def _tone(kind, freq, dur, duty=0.5, decay=1.0, vol=1.0):
    n = max(1, int(SR * dur))
    f = np.full(n, freq)
    w = square(f, duty) if kind == "square" else triangle(f)
    return w * env(n, attack=0.003, decay_pow=decay) * vol


def _add(buf, start, x):
    i = int(start * SR)
    if i >= len(buf):
        return
    end = min(len(buf), i + len(x))
    buf[i:end] += x[: end - i]


def _drum(kind, rng):
    if kind == "kick":
        n = int(SR * 0.12)
        f = np.linspace(150, 45, n)
        return square(f, 0.5) * env(n, decay_pow=2.5) * 0.9
    if kind == "snare":
        n = int(SR * 0.10)
        return noise(n, rng, hold=2) * env(n, decay_pow=2.0) * 0.6
    n = int(SR * 0.03)                     # hat
    return noise(n, rng) * env(n, decay_pow=3.0) * 0.25


def compose(seconds, seed_text, stage="", fight_start=1.8, finale_at=None):
    """Mono float track of `seconds`. fight_start: when the full band comes in."""
    h = zlib.crc32(seed_text.encode())
    rng = np.random.default_rng(h)
    mood = "dark" if stage.lower() in DARK_STAGES else "bright"
    scale = SCALES[mood]
    prog = PROGRESSIONS[mood][h % len(PROGRESSIONS[mood])]
    key = [-3, -2, 0, 2, 3, 5][(h >> 3) % 6]                  # A..F around C
    bpm = (140 if mood == "dark" else 152) + (h >> 7) % 9
    beat = 60.0 / bpm
    step = beat / 4                                           # 16th note
    finale_at = finale_at if finale_at is not None else seconds * 0.7

    lead, arp, bass, drums = (np.zeros(int(SR * seconds) + SR) for _ in range(4))
    compose._crashed = False

    # a 2-bar melodic motif reused with variation, built from chord tones
    def degree_semi(deg, octave=0):
        return key + scale[deg % 7] + 12 * (deg // 7 + octave)

    hook = HOOKS[(h >> 11) % len(HOOKS)]
    answer = hook[:12] + ANSWER_ENDS[(h >> 13) % len(ANSWER_ENDS)]

    t, bar = 0.0, 0
    while t < seconds:
        chord = prog[bar % 4]
        full = t >= fight_start - 1e-6
        late = t >= finale_at
        for s in range(16):
            st = t + s * step
            if st >= seconds:
                break
            # drums: kick on 1/3, snare on 2/4, hats on 8ths (16ths late in the fight)
            if full:
                if s in (0, 8) or (late and s in (6, 14)):
                    _add(drums, st, _drum("kick", rng))
                if s in (4, 12):
                    _add(drums, st, _drum("snare", rng))
                if s % 2 == 0 or late:
                    _add(drums, st, _drum("hat", rng))
            elif s in (0, 8):
                _add(drums, st, _drum("kick", rng) * 0.5)
            # triangle bass: root 8ths, octave jump on the off-beats
            if s % 2 == 0:
                semi = degree_semi(chord, -2) + (12 if s % 4 == 2 else 0)
                _add(bass, st, _tone("tri", _freq(semi), step * 1.9, decay=0.6, vol=0.8))
            # square arpeggio: chord tones cycling fast
            if full and (s % 2 == 0 or late):
                deg = chord + [0, 2, 4, 7][(s // 2) % 4]
                _add(arp, st, _tone("square", _freq(degree_semi(deg, 0)), step * 0.9, duty=0.125,
                                    decay=1.5, vol=0.28))
            # lead: the hook on 8th notes (bars 1-2 call, 3-4 answer), echoed for that arcade sound
            if full and s % 2 == 0:
                phrase = hook if (bar % 4) < 2 else answer
                m = phrase[(bar % 2) * 8 + s // 2]
                if m is not None:
                    semi = key + scale[m % 7] + 12 * (m // 7) + 12 + (12 if late and (bar % 4) >= 2 else 0)
                    note_ = _tone("square", _freq(semi), step * 1.8, duty=0.5, decay=0.7, vol=0.55)
                    _add(lead, st, note_)
                    _add(lead, st + 3 * step, note_ * 0.28)     # echo
            # crash cymbal when the band kicks in
            if full and not getattr(compose, "_crashed", False) and s == 0:
                n = int(SR * 0.5)
                _add(drums, st, noise(n, rng) * env(n, decay_pow=1.8) * 0.45)
                compose._crashed = True
        t += 16 * step
        bar += 1

    mix = lead * 1.15 + arp * 0.8 + bass * 0.9 + drums * 0.9
    n = int(SR * seconds)
    mix = crush(mix[:n], bits=7, rate=22050)
    peak = np.max(np.abs(mix)) or 1.0
    return mix / peak, {"mood": mood, "bpm": bpm, "key": key}
