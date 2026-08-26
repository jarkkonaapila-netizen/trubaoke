"""
LRCLIB synchronized lyrics service.

LRCLIB (https://lrclib.net) is a free, open-source LRC lyrics database
with no API key requirement. It has broad coverage including Finnish songs.

The returned LRC lines are in the format:
    [mm:ss.xx] lyric text

We try an exact lookup first (artist + track), then fall back to a fuzzy
search so we still get lyrics even when the YouTube title doesn't parse
cleanly.
"""

import logging
import re

import httpx

from models import LyricLine

logger = logging.getLogger(__name__)

_BASE = "https://lrclib.net/api"
_LRC_RE = re.compile(r"\[(\d+):(\d+\.\d+)\]\s*(.*)")


# ── LRC parser ────────────────────────────────────────────────────────────────


def parse_lrc(lrc_text: str) -> list[LyricLine]:
    """
    Parse LRC-format string into a list of LyricLine objects sorted by time.
    Empty/instrumental lines (text == '') are skipped.
    """
    lines: list[LyricLine] = []
    for raw in lrc_text.splitlines():
        m = _LRC_RE.match(raw.strip())
        if not m:
            continue
        minutes = int(m.group(1))
        seconds = float(m.group(2))
        text = m.group(3).strip()
        if text:
            lines.append(LyricLine(time=minutes * 60 + seconds, text=text))
    return sorted(lines, key=lambda ln: ln.time)


# ── LRCLIB API wrappers ───────────────────────────────────────────────────────


async def _exact_lookup(
    client: httpx.AsyncClient, artist: str, title: str
) -> list[LyricLine]:
    """Try LRCLIB /api/get for an exact artist + track match."""
    try:
        resp = await client.get(
            f"{_BASE}/get",
            params={"artist_name": artist, "track_name": title},
        )
        if resp.status_code == 200:
            data = resp.json()
            synced = data.get("syncedLyrics")
            if synced:
                logger.info("LRCLIB exact hit: %s – %s", artist, title)
                return parse_lrc(synced)
    except Exception as exc:
        logger.debug("LRCLIB exact lookup error: %s", exc)
    return []


async def _search_lookup(
    client: httpx.AsyncClient, artist: str, title: str
) -> list[LyricLine]:
    """Fuzzy search on LRCLIB /api/search; try the first synced result."""
    try:
        resp = await client.get(
            f"{_BASE}/search",
            params={"track_name": title, "artist_name": artist},
        )
        if resp.status_code == 200:
            for item in resp.json()[:5]:
                synced = item.get("syncedLyrics")
                if synced:
                    logger.info(
                        "LRCLIB search hit: %s – %s",
                        item.get("artistName"),
                        item.get("trackName"),
                    )
                    return parse_lrc(synced)
    except Exception as exc:
        logger.debug("LRCLIB search error: %s", exc)
    return []


# ── Public interface ──────────────────────────────────────────────────────────


async def fetch_lyrics(artist: str, title: str) -> list[LyricLine]:
    """
    Fetch synchronized lyrics for a song.

    Returns an empty list if no lyrics could be found (the caller should still
    return a valid SongData with chords but no lyrics).
    """
    if not artist or not title:
        logger.warning("fetch_lyrics called with empty artist/title")
        return []

    async with httpx.AsyncClient(timeout=12.0) as client:
        lines = await _exact_lookup(client, artist, title)
        if not lines:
            lines = await _search_lookup(client, artist, title)

    if not lines:
        logger.info("No lyrics found for %s – %s", artist, title)

    return lines
