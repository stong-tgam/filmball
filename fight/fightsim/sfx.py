"""
Tiny 8-bit sound-effect synth (sfxr-style), pure numpy.

Every sound is built from square / triangle / noise oscillators with pitch
sweeps and fast envelopes, then lightly bit-crushed for a retro feel. Sounds
are deterministic: the same (name, pitch, seed) always gives the same samples.
"""

import math

import numpy as np

SR = 44100


def _t(dur):
    return np.arange(int(SR * dur)) / SR


def _phase(freq):
    """Integrate a per-sample frequency array into phase (cycles)."""
    return np.cumsum(freq) / SR


def square(freq, duty=0.5):
    ph = _phase(freq) % 1.0
    return np.where(ph < duty, 1.0, -1.0)


def triangle(freq):
    ph = _phase(freq) % 1.0
    return 4 * np.abs(ph - 0.5) - 1


def noise(n, rng, hold=1):
    """White noise; hold>1 repeats samples (lower, crunchier noise)."""
    base = rng.uniform(-1, 1, n // hold + 1)
    return np.repeat(base, hold)[:n]


def sweep(f0, f1, dur, curve=1.0):
    x = np.linspace(0, 1, int(SR * dur)) ** curve
    return f0 + (f1 - f0) * x


def env(n, attack=0.002, decay_pow=1.0, dur=None):
    """Instant-ish attack, power-curve decay to zero."""
    a = max(1, int(SR * attack))
    e = np.ones(n)
    e[:a] = np.linspace(0, 1, a)
    tail = np.linspace(1, 0, n - a) ** decay_pow
    e[a:] = tail
    return e


def crush(x, bits=6, rate=11025):
    """Bit-depth and sample-rate reduction for an 8-bit feel."""
    step = max(1, SR // rate)
    x = np.repeat(x[::step], step)[: len(x)]
    q = 2 ** (bits - 1)
    return np.round(x * q) / q


def seq(*parts):
    return np.concatenate([p for p in parts if len(p)])


def mixdown(*parts):
    n = max(len(p) for p in parts)
    out = np.zeros(n)
    for p in parts:
        out[: len(p)] += p
    return out


def note(semitones_from_a4):
    return 440.0 * 2 ** (semitones_from_a4 / 12)


# ── the sound bank ────────────────────────────────────────────────────────


def make(name, pitch=1.0, seed=0):
    """Return a float array in [-1, 1] for a named sound. pitch scales frequencies."""
    rng = np.random.default_rng(seed)
    p = pitch

    if name == "blade_hit":          # crisp slash: noise burst + falling square
        n1 = noise(int(SR * 0.06), rng) * env(int(SR * 0.06), decay_pow=2)
        s = square(sweep(900 * p, 260 * p, 0.09), 0.25) * env(int(SR * 0.09), decay_pow=1.5)
        return crush(mixdown(n1 * 0.6, s * 0.5))
    if name in ("bump", "body_hit"):  # contact thump: low falling square + click
        dur = 0.13 if name == "bump" else 0.16
        s = square(sweep(190 * p, 55 * p, dur, 0.6), 0.5) * env(int(SR * dur), decay_pow=2.2)
        c = noise(int(SR * 0.02), rng, hold=3) * env(int(SR * 0.02), decay_pow=2)
        return crush(mixdown(s * 0.8, c * 0.5), bits=5)
    if name == "clash":              # metallic ring: two detuned squares
        d = 0.22
        a = square(np.full(int(SR * d), 1250 * p), 0.3)
        b = square(np.full(int(SR * d), 1870 * p), 0.3)
        n1 = noise(int(SR * 0.03), rng) * env(int(SR * 0.03), decay_pow=2)
        return crush(mixdown((a + b) * 0.3 * env(int(SR * d), decay_pow=3), n1 * 0.5))
    if name == "block":
        s = square(sweep(420 * p, 300 * p, 0.07), 0.5) * env(int(SR * 0.07), decay_pow=2)
        n1 = noise(int(SR * 0.05), rng, hold=2) * env(int(SR * 0.05), decay_pow=2)
        return crush(mixdown(s * 0.6, n1 * 0.5))
    if name == "shoot":              # quick zip
        s = square(sweep(500 * p, 1100 * p, 0.08), 0.2) * env(int(SR * 0.08), decay_pow=1.5)
        n1 = noise(int(SR * 0.08), rng, hold=2) * env(int(SR * 0.08), decay_pow=2) * 0.3
        return crush(mixdown(s * 0.45, n1))
    if name in ("projectile_hit", "thorns_hit"):
        s = square(sweep(620 * p, 180 * p, 0.07), 0.5) * env(int(SR * 0.07), decay_pow=2)
        n1 = noise(int(SR * 0.04), rng) * env(int(SR * 0.04), decay_pow=2)
        return crush(mixdown(s * 0.55, n1 * 0.45))
    if name == "spell_hit":          # drain: falling triangle buzz
        s = triangle(sweep(900 * p, 180 * p, 0.22)) * env(int(SR * 0.22), decay_pow=1.2)
        return crush(s * 0.8)
    if name == "shockwave_hit":
        s = square(sweep(240 * p, 70 * p, 0.12), 0.5) * env(int(SR * 0.12), decay_pow=2)
        return crush(s * 0.7, bits=5)
    if name == "poison_hit":         # tiny tick
        s = square(np.full(int(SR * 0.025), 1500 * p), 0.5) * env(int(SR * 0.025), decay_pow=2)
        return crush(s * 0.35)
    if name == "poison":             # bubbly hiss
        n1 = noise(int(SR * 0.18), rng, hold=6) * env(int(SR * 0.18), decay_pow=1.5)
        s = square(220 + 60 * np.sin(_t(0.18) * 60), 0.5) * env(int(SR * 0.18), decay_pow=2)
        return crush(mixdown(n1 * 0.5, s * 0.3))
    if name == "heal":               # rising arpeggio
        notes = [note(3), note(7), note(10)]
        return crush(seq(*[triangle(np.full(int(SR * 0.05), f * p)) * env(int(SR * 0.05), decay_pow=1.2)
                           for f in notes]) * 0.6)
    if name == "debuff":             # slow: falling triangle
        s = triangle(sweep(800 * p, 260 * p, 0.25)) * env(int(SR * 0.25), decay_pow=1.0)
        return crush(s * 0.6)
    if name == "summon":             # poof + quick up-arpeggio
        n1 = noise(int(SR * 0.12), rng, hold=4) * env(int(SR * 0.12), decay_pow=1.5) * 0.4
        arp = seq(*[square(np.full(int(SR * 0.04), note(k) * p), 0.25) * env(int(SR * 0.04), decay_pow=1)
                    for k in (0, 4, 7, 12)]) * 0.4
        return crush(mixdown(n1, np.concatenate([np.zeros(int(SR * 0.03)), arp])))
    if name == "ultimate":           # power-up: vibrato sweep up, then a bright chord
        d = 0.42
        f = sweep(220 * p, 1150 * p, d, 1.4) * (1 + 0.04 * np.sin(_t(d) * 2 * math.pi * 18))
        rise = square(f, 0.35) * np.linspace(0.3, 1.0, int(SR * d))
        chord = mixdown(*[square(np.full(int(SR * 0.22), note(k) * p * 2), 0.5) for k in (0, 4, 7)])
        chord *= env(len(chord), decay_pow=1.5) / 3
        return crush(seq(rise * 0.5, chord * 1.2))
    if name == "ability":            # named ability (e.g. Berserk): three quick notes up
        return crush(seq(*[square(np.full(int(SR * 0.06), note(k) * p), 0.5) * env(int(SR * 0.06), decay_pow=1)
                           for k in (-5, 0, 7)]) * 0.5)
    if name == "shockwave":          # boom
        n1 = noise(int(SR * 0.4), rng, hold=8) * env(int(SR * 0.4), decay_pow=2.2)
        s = square(sweep(110 * p, 38 * p, 0.35, 0.5), 0.5) * env(int(SR * 0.35), decay_pow=1.8)
        return crush(mixdown(n1 * 0.6, s * 0.6), bits=5)
    if name == "death":              # minion pop
        s = square(sweep(700 * p, 90 * p, 0.15), 0.5) * env(int(SR * 0.15), decay_pow=1.5)
        return crush(s * 0.5)
    if name == "death_main":         # K.O.: big crunchy explosion + long fall
        n1 = noise(int(SR * 0.7), rng, hold=10) * env(int(SR * 0.7), decay_pow=2.5)
        s = square(sweep(320, 35, 0.6, 0.6), 0.5) * env(int(SR * 0.6), decay_pow=1.4)
        return crush(mixdown(n1 * 0.75, s * 0.6), bits=4, rate=8000)
    if name == "victory":            # fanfare: C E G C'---
        parts = [square(np.full(int(SR * 0.1), note(k)), 0.5) * env(int(SR * 0.1), decay_pow=0.6)
                 for k in (3, 7, 10)]
        last = mixdown(square(np.full(int(SR * 0.45), note(15)), 0.5),
                       square(np.full(int(SR * 0.45), note(10)), 0.25) * 0.6)
        last *= env(len(last), decay_pow=1.2)
        return crush(seq(*parts, last) * 0.45)
    if name == "round":              # "ROUND 1" beep
        return crush(square(np.full(int(SR * 0.12), note(3)), 0.5) * env(int(SR * 0.12), decay_pow=0.8) * 0.4)
    if name == "fight":              # "FIGHT!" two-tone stab
        a = square(np.full(int(SR * 0.09), note(10)), 0.5)
        b = mixdown(square(np.full(int(SR * 0.25), note(15)), 0.5),
                    square(np.full(int(SR * 0.25), note(22)), 0.25) * 0.5)
        return crush(seq(a * env(len(a), decay_pow=0.5), b * env(len(b), decay_pow=1.2)) * 0.45)
    if name == "whistle":            # referee whistle: high trill, two blasts
        n = int(SR * 0.22)
        tt = np.arange(n) / SR
        f = 2600 * p + 120 * np.sign(np.sin(2 * np.pi * 28 * tt))
        a = square(f, 0.5) * env(n, attack=0.005, decay_pow=0.4) * 0.35
        b = square(f[: int(n * 0.6)], 0.5) * env(int(n * 0.6), attack=0.005, decay_pow=0.6) * 0.35
        return crush(seq(a, np.zeros(int(SR * 0.06)), b))
    if name == "goal":               # crowd roar: noise swelling up then down + a horn blast
        n = int(SR * 1.6)
        x = noise(n, rng, hold=3)
        sw = np.minimum(1.0, np.arange(n) / (SR * 0.25)) * np.exp(-np.maximum(0, np.arange(n) - SR * 0.5) / (SR * 0.6))
        horn = square(np.full(int(SR * 0.5), 233 * p), 0.5) * env(int(SR * 0.5), decay_pow=0.5) * 0.25
        return crush(mixdown(x * sw * 0.55, horn), bits=6)
    if name == "freeze":             # ice: glassy shimmer down + crackle
        a = square(sweep(2400 * p, 900 * p, 0.35), 0.125) * env(int(SR * 0.35), decay_pow=1.3)
        c = noise(int(SR * 0.2), rng, hold=1) * env(int(SR * 0.2), decay_pow=3) * 0.4
        return crush(mixdown(a * 0.5, c))
    if name == "lightning":          # crack + rumble
        c = noise(int(SR * 0.08), rng) * env(int(SR * 0.08), decay_pow=1.2)
        r = noise(int(SR * 0.5), rng, hold=12) * env(int(SR * 0.5), decay_pow=1.8) * 0.7
        return crush(mixdown(c * 0.9, seq(np.zeros(int(SR * 0.03)), r)), bits=5)
    if name == "elim":               # royale elimination: shorter, brighter crunch than the K.O.
        n1 = noise(int(SR * 0.3), rng, hold=6) * env(int(SR * 0.3), decay_pow=2.5)
        s = square(sweep(520 * p, 70 * p, 0.3, 0.6), 0.5) * env(int(SR * 0.3), decay_pow=1.5)
        return crush(mixdown(n1 * 0.6, s * 0.55), bits=5)
    if name == "pickup":             # item grab: quick bright up-arpeggio
        parts = [square(np.full(int(SR * 0.05), note(k) * p), 0.25) * env(int(SR * 0.05), decay_pow=0.8)
                 for k in (12, 16, 19, 24)]
        return crush(seq(*parts) * 0.4)
    if name == "slapshot":           # stick on puck: sharp wooden CRACK + a quick zip
        c = noise(int(SR * 0.025), rng) * env(int(SR * 0.025), decay_pow=3)
        k = square(sweep(1400 * p, 600 * p, 0.03), 0.5) * env(int(SR * 0.03), decay_pow=2)
        z = square(sweep(1800 * p, 500 * p, 0.12), 0.125) * env(int(SR * 0.12), decay_pow=1.4)
        return crush(mixdown(c * 0.9, k * 0.5, seq(np.zeros(int(SR * 0.02)), z * 0.35)))
    if name == "check":              # body check: heavy crunch thud + boards rattle
        s = square(sweep(150 * p, 32 * p, 0.3, 0.5), 0.5) * env(int(SR * 0.3), decay_pow=1.6)
        n1 = noise(int(SR * 0.25), rng, hold=6) * env(int(SR * 0.25), decay_pow=2.4)
        r = noise(int(SR * 0.3), rng, hold=2) * env(int(SR * 0.3), decay_pow=1.2) * 0.25
        return crush(mixdown(s * 0.9, n1 * 0.7, seq(np.zeros(int(SR * 0.08)), r)), bits=5)
    if name == "wall":               # soft bounce tick
        s = triangle(sweep(520 * p, 300 * p, 0.035)) * env(int(SR * 0.035), decay_pow=2)
        return crush(s * 0.5)
    return np.zeros(1)


def character_pitch(kind):
    """Stable per-character pitch so each fighter's hits sound a bit different (0.85-1.2)."""
    h = 0
    for ch in kind or "":
        h = (h * 131 + ord(ch)) % 10007
    return 0.85 + (h % 36) / 100.0
