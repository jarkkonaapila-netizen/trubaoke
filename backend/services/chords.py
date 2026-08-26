"""
Chord detection service.

Algorithm:
  1. Download audio from YouTube via yt-dlp (WAV extraction via ffmpeg).
  2. Load audio with librosa (mono, 22050 Hz).
  3. Separate the harmonic component (reduces drum/percussion noise).
  4. Compute a constant-Q chromagram (chroma_cqt).
  5. Aggregate into 0.5-second windows.
  6. Match each window against major/minor chord templates (cosine similarity).
  7. Run-length-encode to emit one event per chord *change*.

Quality note: template-matching on chroma is an approximation.  It works well
for songs with clear harmonic content (most pop/rock) but may struggle with
very dense arrangements.  Results are cached in DynamoDB so this only runs
once per video.
"""

import logging
import os
import tempfile
from typing import Any

import numpy as np
import yt_dlp

from models import ChordEvent

logger = logging.getLogger(__name__)

# ── Chord vocabulary ──────────────────────────────────────────────────────────

_NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"]

# Harmonic intervals relative to root (semitones)
_MAJOR_INTERVALS = [0, 4, 7]      # root, M3, P5
_MINOR_INTERVALS = [0, 3, 7]      # root, m3, P5
_DOM7_INTERVALS  = [0, 4, 7, 10]  # root, M3, P5, m7

_INTERVALS: list[tuple[list[int], str]] = [
    (_MAJOR_INTERVALS, ""),
    (_MINOR_INTERVALS, "m"),
    (_DOM7_INTERVALS,  "7"),
]


def _build_templates() -> tuple[np.ndarray, list[str]]:
    """Build normalised chord template matrix (n_chords × 12)."""
    templates: list[np.ndarray] = []
    names: list[str] = []

    for root in range(12):
        for intervals, suffix in _INTERVALS:
            vec = np.zeros(12, dtype=np.float32)
            for interval in intervals:
                vec[(root + interval) % 12] = 1.0
            norm = np.linalg.norm(vec)
            templates.append(vec / norm)
            names.append(_NOTE_NAMES[root] + suffix)

    return np.array(templates, dtype=np.float32), names


_TEMPLATES, _CHORD_NAMES = _build_templates()   # shape: (36, 12)


# ── Audio download ────────────────────────────────────────────────────────────


def _download_audio(video_id: str, output_dir: str) -> str:
    """
    Download audio for a YouTube video and return the local WAV path.

    Requires ffmpeg to be installed in PATH.
    """
    url = f"https://www.youtube.com/watch?v={video_id}"
    out_template = os.path.join(output_dir, "%(id)s.%(ext)s")

    ydl_opts: dict[str, Any] = {
        "format": "bestaudio/best",
        "outtmpl": out_template,
        "postprocessors": [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": "wav",
                "preferredquality": "0",
            }
        ],
        "quiet": True,
        "no_warnings": True,
        # Avoid re-downloading if already cached elsewhere
        "noplaylist": True,
    }

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:  # type: ignore[arg-type]
        ydl.download([url])

    wav_path = os.path.join(output_dir, f"{video_id}.wav")
    if not os.path.exists(wav_path):
        # Fallback: find whatever audio file was created
        for fname in os.listdir(output_dir):
            if fname.startswith(video_id):
                wav_path = os.path.join(output_dir, fname)
                break
        else:
            raise FileNotFoundError(
                f"Audio download produced no output file for {video_id}"
            )

    return wav_path


# ── Chromagram-based chord detection ─────────────────────────────────────────


def _chroma_to_chord(chroma_frame: np.ndarray) -> str:
    """
    Return the best-matching chord name for a 12-dim chroma vector.
    Returns 'N' (no chord) when the signal energy is negligible.
    """
    norm = float(np.linalg.norm(chroma_frame))
    if norm < 1e-4:
        return "N"
    frame_norm = (chroma_frame / norm).astype(np.float32)
    similarities = _TEMPLATES @ frame_norm  # shape: (36,)
    best = int(np.argmax(similarities))
    return _CHORD_NAMES[best]


def _analyse_audio(audio_path: str) -> list[ChordEvent]:
    """
    Load an audio file and return a run-length-encoded list of chord events.
    """
    # Lazy import so the module loads fast when chord detection is cached
    import librosa  # noqa: PLC0415

    sample_rate = 22_050
    hop_length = 2048   # ~0.093 s per chroma frame

    y, sr = librosa.load(audio_path, sr=sample_rate, mono=True)

    # Harmonic-percussive separation: use harmonic component for chroma
    y_harmonic, _ = librosa.effects.hpss(y, margin=4.0)

    # Constant-Q chromagram
    chroma = librosa.feature.chroma_cqt(y=y_harmonic, sr=sr, hop_length=hop_length)
    # shape: (12, n_frames)

    # Aggregate into 0.5-second windows for smoother detection
    frames_per_window = max(1, int(0.5 * sr / hop_length))  # ~5 frames
    n_frames = chroma.shape[1]

    chords: list[ChordEvent] = []
    last_chord: str | None = None

    for start in range(0, n_frames, frames_per_window):
        end = min(start + frames_per_window, n_frames)
        window_avg = chroma[:, start:end].mean(axis=1)
        chord_name = _chroma_to_chord(window_avg)

        # Only emit a new event on chord change (run-length encoding)
        if chord_name != last_chord and chord_name != "N":
            time_s = float(librosa.frames_to_time(start, sr=sr, hop_length=hop_length))
            chords.append(ChordEvent(time=time_s, chord=chord_name))
            last_chord = chord_name

    logger.info("Detected %d chord events from '%s'", len(chords), audio_path)
    return chords


# ── Public entry point ────────────────────────────────────────────────────────


def detect_chords(video_id: str) -> list[ChordEvent]:
    """
    Download audio from YouTube and return timestamped chord events.

    This function is blocking and CPU-intensive; expect 30–90 s for a typical
    song on first call.  main.py runs it via run_in_executor so it doesn't
    block the async event loop.  Cache results in DynamoDB to avoid repeating
    this work.
    """
    logger.info("Chord detection starting for videoId=%s", video_id)

    try:
        with tempfile.TemporaryDirectory(prefix="trubaoke_") as tmpdir:
            audio_path = _download_audio(video_id, tmpdir)
            chords = _analyse_audio(audio_path)
    except FileNotFoundError as exc:
        logger.error("Audio download failed for %s: %s", video_id, exc)
        return []
    except Exception as exc:  # noqa: BLE001
        logger.error("Chord detection failed for %s: %s", video_id, exc, exc_info=True)
        return []

    logger.info("Chord detection complete for %s: %d events", video_id, len(chords))
    return chords
