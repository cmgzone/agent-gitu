"""Synthesize a choreographed 48kHz stereo soundtrack for the Agent Gitu welcome video.

Everything is generated deterministically in Python + NumPy at exact timestamps
matching scripts/welcome-video.html (0.0s .. 14.0s).
"""

from __future__ import annotations

import pathlib
import wave

import numpy as np

SAMPLE_RATE = 48_000
DURATION = 14.0

# Musical pitch table (D Major / B Minor uplifting palette)
NOTES = {
    "D2": 73.42,
    "F#2": 92.50,
    "G2": 98.00,
    "A2": 110.00,
    "B2": 123.47,
    "C#3": 138.59,
    "D3": 146.83,
    "E3": 164.81,
    "F#3": 185.00,
    "G3": 196.00,
    "A3": 220.00,
    "B3": 246.94,
    "C#4": 277.18,
    "D4": 293.66,
    "E4": 329.63,
    "F#4": 369.99,
    "G4": 392.00,
    "A4": 440.00,
    "B4": 493.88,
    "C#5": 554.37,
    "D5": 587.33,
    "E5": 659.25,
    "F#5": 739.99,
    "A5": 880.00,
    "B5": 987.77,
    "C#6": 1108.73,
    "D6": 1174.66,
    "E6": 1318.51,
    "F#6": 1479.98,
}


def _place(buf_l: np.ndarray, buf_r: np.ndarray, start_s: float, mono: np.ndarray, gain: float = 1.0, pan: float = 0.0) -> None:
    """Mix a mono signal at start_s with equal-power stereo panning (-1..+1)."""
    idx = int(round(start_s * SAMPLE_RATE))
    if idx >= len(buf_l):
        return
    src_start = max(0, -idx)
    dst_start = max(0, idx)
    count = min(len(mono) - src_start, len(buf_l) - dst_start)
    if count <= 0:
        return
    theta = (np.clip(pan, -1.0, 1.0) + 1.0) * (np.pi / 4.0)
    gl = gain * np.cos(theta)
    gr = gain * np.sin(theta)
    seg = mono[src_start : src_start + count]
    buf_l[dst_start : dst_start + count] += seg * gl
    buf_r[dst_start : dst_start + count] += seg * gr


def _pad_tone(freq: float, dur: float, attack: float = 0.35, release: float = 0.75) -> np.ndarray:
    n = int(round(dur * SAMPLE_RATE))
    t = np.arange(n, dtype=np.float64) / SAMPLE_RATE
    # Warm detuned sine pair + soft 2nd & 3rd overtone
    wave_sig = (
        0.65 * np.sin(2 * np.pi * freq * t)
        + 0.22 * np.sin(2 * np.pi * (freq * 1.003) * t + 0.4)
        + 0.13 * np.sin(2 * np.pi * (freq * 2.0) * t)
    )
    env = np.ones(n, dtype=np.float64)
    a_n = max(1, int(attack * SAMPLE_RATE))
    r_n = max(1, int(release * SAMPLE_RATE))
    a_n = min(a_n, n // 2)
    r_n = min(r_n, n - a_n)
    env[:a_n] = 0.5 - 0.5 * np.cos(np.pi * np.arange(a_n) / a_n)
    env[-r_n:] = 0.5 + 0.5 * np.cos(np.pi * np.arange(r_n) / r_n)
    return wave_sig * env


def _chime(freq: float, dur: float = 0.75, bright: float = 0.32) -> np.ndarray:
    """Clean glass/bell pluck with gentle harmonic decay."""
    n = int(round(dur * SAMPLE_RATE))
    t = np.arange(n, dtype=np.float64) / SAMPLE_RATE
    atk = np.minimum(1.0, t / 0.006)
    d1 = np.exp(-t / (dur * 0.34))
    d2 = np.exp(-t / (dur * 0.14))
    sig = (
        np.sin(2 * np.pi * freq * t) * d1
        + bright * np.sin(2 * np.pi * freq * 2.0 * t) * d2
        + (bright * 0.35) * np.sin(2 * np.pi * freq * 3.01 * t) * np.exp(-t / (dur * 0.07))
    )
    return sig * atk


def _hop_boop(f0: float = 340.0, f1: float = 540.0, dur: float = 0.18) -> np.ndarray:
    """Cute rounded pitch-bent pop for Orb's entrance hop."""
    n = int(round(dur * SAMPLE_RATE))
    t = np.arange(n, dtype=np.float64) / SAMPLE_RATE
    glide = 1.0 - np.exp(-t / 0.045)
    freq = f0 + (f1 - f0) * glide
    phase = 2 * np.pi * np.cumsum(freq) / SAMPLE_RATE
    env = np.minimum(1.0, t / 0.008) * np.exp(-t / 0.065)
    return (0.8 * np.sin(phase) + 0.2 * np.sin(2 * phase)) * env


def _packet_zip(f0: float = 720.0, f1: float = 1280.0, dur: float = 0.14) -> np.ndarray:
    """Soft futuristic telemetry chirp when an agent packet flies across a beam."""
    n = int(round(dur * SAMPLE_RATE))
    t = np.arange(n, dtype=np.float64) / SAMPLE_RATE
    u = t / dur
    freq = f0 + (f1 - f0) * np.sin(u * np.pi * 0.85)
    phase = 2 * np.pi * np.cumsum(freq) / SAMPLE_RATE
    env = np.sin(np.pi * u) ** 1.4 * np.exp(-t / 0.09)
    return (np.sin(phase) + 0.25 * np.sin(2 * phase)) * env


def _tick(dur: float = 0.06, freq: float = 160.0) -> np.ndarray:
    """Subtle warm felt-percussion pulse for teamwork rhythm."""
    n = int(round(dur * SAMPLE_RATE))
    t = np.arange(n, dtype=np.float64) / SAMPLE_RATE
    pitch = freq * (1.0 + 0.55 * np.exp(-t / 0.012))
    phase = 2 * np.pi * np.cumsum(pitch) / SAMPLE_RATE
    env = np.minimum(1.0, t / 0.003) * np.exp(-t / 0.018)
    return np.sin(phase) * env


def _soft_whoosh(rng: np.random.Generator, dur: float = 0.65) -> np.ndarray:
    """Airy filtered noise sweep for scene transitions."""
    n = int(round(dur * SAMPLE_RATE))
    noise = rng.standard_normal(n)
    # 2-stage exponential lowpass smoothing -> warm breeze instead of static hiss
    out = np.empty(n, dtype=np.float64)
    acc1 = 0.0
    acc2 = 0.0
    for i in range(n):
        u = i / n
        alpha = 0.04 + 0.16 * np.sin(np.pi * u)
        acc1 += alpha * (noise[i] - acc1)
        acc2 += (alpha * 0.7) * (acc1 - acc2)
        out[i] = acc2
    env = np.sin(np.pi * np.arange(n) / n) ** 1.8
    peak = np.max(np.abs(out)) or 1.0
    return (out / peak) * env


def _apply_ping_pong_delay(dry_l: np.ndarray, dry_r: np.ndarray, delay_s: float = 0.235, fb: float = 0.26, wet: float = 0.28) -> tuple[np.ndarray, np.ndarray]:
    n = len(dry_l)
    d = int(round(delay_s * SAMPLE_RATE))
    wet_l = np.zeros(n, dtype=np.float64)
    wet_r = np.zeros(n, dtype=np.float64)
    # Gentle multi-tap L/R ping-pong with mild damping (vectorized per tap)
    cur_l = dry_l.copy()
    cur_r = dry_r.copy()
    gain = 1.0
    for tap in range(1, 5):
        offset = tap * d
        if offset >= n:
            break
        gain *= fb
        # Subtle high-frequency damping via 3-sample moving average on feedback echoes
        cur_l = 0.25 * np.roll(cur_l, 1) + 0.5 * cur_l + 0.25 * np.roll(cur_l, -1)
        cur_r = 0.25 * np.roll(cur_r, 1) + 0.5 * cur_r + 0.25 * np.roll(cur_r, -1)
        if tap % 2 == 1:
            wet_l[offset:] += cur_r[:-offset] * gain
            wet_r[offset:] += cur_l[:-offset] * gain
        else:
            wet_l[offset:] += cur_l[:-offset] * gain
            wet_r[offset:] += cur_r[:-offset] * gain
    return dry_l + wet * wet_l, dry_r + wet * wet_r


def synthesize_soundtrack(out_wav: pathlib.Path, duration: float = DURATION) -> pathlib.Path:
    total = int(round(duration * SAMPLE_RATE))
    bed_l = np.zeros(total, dtype=np.float64)
    bed_r = np.zeros(total, dtype=np.float64)
    fx_l = np.zeros(total, dtype=np.float64)
    fx_r = np.zeros(total, dtype=np.float64)
    rng = np.random.default_rng(42)

    # 1. Warm Harmonic Chord Progression
    chords = [
        (0.0, 3.55, [("D3", 0.08, 0.0), ("A3", 0.06, -0.25), ("E4", 0.055, 0.25), ("F#4", 0.055, -0.1)]),
        (3.2, 2.25, [("B2", 0.085, 0.0), ("F#3", 0.06, 0.25), ("A3", 0.055, -0.25), ("D4", 0.055, 0.1)]),
        (5.15, 2.25, [("G2", 0.085, 0.0), ("D3", 0.06, -0.2), ("F#3", 0.055, 0.2), ("B3", 0.055, -0.15)]),
        (7.15, 2.15, [("A2", 0.085, 0.0), ("E3", 0.06, 0.22), ("F#3", 0.055, -0.22), ("C#4", 0.055, 0.15)]),
        (8.95, 2.05, [("F#2", 0.085, 0.0), ("C#3", 0.06, -0.2), ("E3", 0.055, 0.2), ("A3", 0.055, -0.1)]),
        (10.65, 3.35, [("D2", 0.075, 0.0), ("D3", 0.07, 0.0), ("A3", 0.06, -0.25), ("E4", 0.055, 0.25), ("F#4", 0.055, -0.12), ("C#5", 0.035, 0.18)]),
    ]
    for t0, dur, voices in chords:
        for note, amp, pan in voices:
            _place(bed_l, bed_r, t0, _pad_tone(NOTES[note], dur), gain=amp, pan=pan)

    # 2. Gentle 110 BPM felt groove pulse during Teamwork & Connections (3.27s .. 12.6s)
    beat = 60.0 / 110.0  # ~0.5454s
    t_tick = 3.27
    step = 0
    while t_tick < 12.55:
        accent = 1.0 if step % 2 == 0 else 0.55
        freq = 128.0 if step % 4 == 0 else 190.0
        _place(bed_l, bed_r, t_tick, _tick(0.065, freq), gain=0.11 * accent, pan=-0.12 if step % 2 == 0 else 0.12)
        if t_tick >= 7.2:
            # Subtle soft off-beat shimmer pluck
            arp_notes = ["E5", "F#5", "A5", "D5"]
            _place(fx_l, fx_r, t_tick + beat * 0.5, _chime(NOTES[arp_notes[step % 4]], 0.24, 0.18), gain=0.045, pan=0.25 if step % 2 else -0.25)
        t_tick += beat * 0.5
        step += 1

    # 3. Synchronized Scene Foley & Character SFX
    # Scene 1: Agent Gitu emblem reveal + Orb hop + Headline swipe
    _place(fx_l, fx_r, 0.08, _chime(NOTES["D4"], 0.9, 0.25), gain=0.14, pan=-0.2)
    _place(fx_l, fx_r, 0.20, _chime(NOTES["A4"], 0.9, 0.25), gain=0.15, pan=0.0)
    _place(fx_l, fx_r, 0.34, _chime(NOTES["D5"], 1.0, 0.28), gain=0.16, pan=0.2)
    _place(fx_l, fx_r, 0.42, _hop_boop(320.0, 560.0, 0.20), gain=0.22, pan=0.28)
    _place(fx_l, fx_r, 0.72, _soft_whoosh(rng, 0.55), gain=0.075, pan=0.0)

    # Scene 2 transition & 4 staggered teammate hops (3.45s + i*0.14s)
    _place(fx_l, fx_r, 3.15, _soft_whoosh(rng, 0.52), gain=0.085, pan=0.0)
    for i, note in enumerate(["D5", "F#5", "A5", "D6"]):
        pan = -0.6 + i * 0.4
        _place(fx_l, fx_r, 3.45 + i * 0.14, _chime(NOTES[note], 0.42, 0.25), gain=0.13, pan=pan)

    # Travelling cyan energy packets across team arcs
    for i, t_zip in enumerate([4.30, 4.85, 5.40]):
        _place(fx_l, fx_r, t_zip, _packet_zip(680.0 + i * 110.0, 1180.0 + i * 140.0, 0.16), gain=0.14, pan=-0.35 + i * 0.35)

    # All 4 synced & verified
    _place(fx_l, fx_r, 6.08, _chime(NOTES["A5"], 0.75, 0.28), gain=0.15, pan=-0.18)
    _place(fx_l, fx_r, 6.22, _chime(NOTES["D6"], 0.95, 0.32), gain=0.17, pan=0.18)

    # Scene 3 transition & 4 sequential connection confirmations (8.15s + idx*0.45s)
    _place(fx_l, fx_r, 7.15, _soft_whoosh(rng, 0.55), gain=0.085, pan=0.0)
    for idx, note in enumerate(["E5", "F#5", "A5", "D6"]):
        tc = 8.15 + idx * 0.45
        _place(fx_l, fx_r, tc - 0.18, _hop_boop(420.0 + idx * 40.0, 620.0 + idx * 50.0, 0.12), gain=0.11, pan=0.35)
        _place(fx_l, fx_r, tc, _chime(NOTES[note], 0.58, 0.30), gain=0.17, pan=0.45)

    # Scene 4 finale: 10-mascot staggered sparkle cascade (10.75s + i*0.06s) + ready resolve
    _place(fx_l, fx_r, 10.55, _soft_whoosh(rng, 0.65), gain=0.09, pan=0.0)
    cascade = ["D5", "E5", "F#5", "A5", "B5", "D6", "E6", "F#6", "E6", "D6"]
    for i, note in enumerate(cascade):
        pan = -0.8 + (i / 9.0) * 1.6
        _place(fx_l, fx_r, 10.75 + i * 0.06, _chime(NOTES[note], 0.52, 0.28), gain=0.11, pan=pan)

    _place(fx_l, fx_r, 11.60, _chime(NOTES["D5"], 1.4, 0.22), gain=0.17, pan=-0.25)
    _place(fx_l, fx_r, 11.62, _chime(NOTES["A5"], 1.5, 0.24), gain=0.16, pan=0.25)
    _place(fx_l, fx_r, 11.65, _chime(NOTES["F#6"], 1.6, 0.20), gain=0.13, pan=0.0)

    # Spatial ping-pong delay only on SFX/chimes so chords stay tight & warm
    fx_l, fx_r = _apply_ping_pong_delay(fx_l, fx_r, delay_s=0.24, fb=0.25, wet=0.30)

    mix_l = bed_l + fx_l
    mix_r = bed_r + fx_r

    # Gentle fade-in (50ms) and smooth tail fade-out (13.2s -> 14.0s)
    fade_in = int(0.05 * SAMPLE_RATE)
    fade_out = int(0.80 * SAMPLE_RATE)
    mix_l[:fade_in] *= np.linspace(0.0, 1.0, fade_in)
    mix_r[:fade_in] *= np.linspace(0.0, 1.0, fade_in)
    fade_curve = 0.5 + 0.5 * np.cos(np.pi * np.arange(fade_out) / fade_out)
    mix_l[-fade_out:] *= fade_curve
    mix_r[-fade_out:] *= fade_curve

    # Soft-knee mastering limiter & normalization to ~ -1.5 dBFS
    peak = max(float(np.max(np.abs(mix_l))), float(np.max(np.abs(mix_r))), 1e-6)
    mix_l = np.tanh((mix_l / peak) * 1.25) * 0.84
    mix_r = np.tanh((mix_r / peak) * 1.25) * 0.84

    stereo = np.stack([mix_l, mix_r], axis=1)
    pcm = np.clip(stereo * 32767.0, -32768, 32767).astype("<i2")

    out_wav.parent.mkdir(parents=True, exist_ok=True)
    with wave.open(str(out_wav), "wb") as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(SAMPLE_RATE)
        wf.writeframes(pcm.tobytes())
    return out_wav
