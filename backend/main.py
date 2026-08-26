"""
Trubaoke — FastAPI backend

Endpoints:
  GET /api/search?q=<query>          → SearchResponse (YouTube search)
  GET /api/song?video_id=&artist=&title=  → SongData (lyrics + chords)
  GET /health                        → {"status": "ok"}

Song data is cached in DynamoDB so chord detection (which can take up to
60 s for an uncached track) only runs once per video.
"""

import json
import logging
import os

import boto3
from botocore.exceptions import BotoCoreError, ClientError
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from models import ChordEvent, SearchResponse, SongData
from services.lyrics import fetch_lyrics
from services.youtube import search_youtube

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── App setup ─────────────────────────────────────────────────────────────────

app = FastAPI(title="Trubaoke API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # fine for a personal single-user app
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── DynamoDB cache (optional — disabled when DYNAMODB_TABLE is unset) ─────────

_DYNAMODB_TABLE: str = os.getenv("DYNAMODB_TABLE", "")
_AWS_REGION: str = os.getenv("AWS_DEFAULT_REGION", "us-east-1")

_ddb_table = None

if _DYNAMODB_TABLE:
    try:
        _ddb = boto3.resource("dynamodb", region_name=_AWS_REGION)
        _ddb_table = _ddb.Table(_DYNAMODB_TABLE)
        logger.info("DynamoDB cache enabled → table '%s'", _DYNAMODB_TABLE)
    except Exception as exc:
        logger.warning("DynamoDB setup failed (caching disabled): %s", exc)


def _cache_get(video_id: str) -> SongData | None:
    if _ddb_table is None:
        return None
    try:
        resp = _ddb_table.get_item(Key={"videoId": video_id})
        item = resp.get("Item")
        if item:
            return SongData.model_validate_json(item["data"])
    except (BotoCoreError, ClientError) as exc:
        logger.warning("DynamoDB get_item error: %s", exc)
    return None


def _cache_put(song: SongData) -> None:
    if _ddb_table is None:
        return
    try:
        _ddb_table.put_item(
            Item={"videoId": song.videoId, "data": song.model_dump_json()}
        )
    except (BotoCoreError, ClientError) as exc:
        logger.warning("DynamoDB put_item error: %s", exc)


# ── Chord detection (imported lazily to avoid heavy libs at startup) ──────────

def _detect_chords(video_id: str) -> list[ChordEvent]:
    """
    Run chord detection for a YouTube video.
    Imported lazily so startup stays fast even without GPU/audio libs.
    This function is replaced with the real implementation in services/chords.py
    once that module is written (TODO 4).
    """
    try:
        from services.chords import detect_chords  # noqa: PLC0415
        return detect_chords(video_id)
    except ImportError:
        logger.info("services.chords not available yet — returning empty chords")
        return []
    except Exception as exc:
        logger.warning("Chord detection failed for %s: %s", video_id, exc)
        return []


# ── Routes ────────────────────────────────────────────────────────────────────


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/api/search", response_model=SearchResponse)
async def search(q: str = Query(..., min_length=1, description="Search query")):
    """Search YouTube for karaoke / lyric videos."""
    try:
        results = await search_youtube(q)
    except RuntimeError as exc:
        # e.g. missing YOUTUBE_API_KEY
        raise HTTPException(status_code=503, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("YouTube search error")
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return SearchResponse(results=results)


@app.get("/api/song", response_model=SongData)
async def get_song(
    video_id: str = Query(..., description="YouTube video ID"),
    artist: str = Query(default="", description="Artist name (for LRCLIB lookup)"),
    title: str = Query(default="", description="Song title (for LRCLIB lookup)"),
):
    """
    Return synchronized lyrics and guitar chords for a YouTube video.

    First call for an uncached song may take up to 60 s while chord
    detection processes the audio. Subsequent calls return instantly
    from the DynamoDB cache.
    """
    # 1. Cache hit
    cached = _cache_get(video_id)
    if cached is not None:
        logger.info("Cache hit for videoId=%s", video_id)
        return cached

    # 2. Fetch lyrics and chords concurrently where possible
    import asyncio  # noqa: PLC0415

    lyrics_task = asyncio.create_task(fetch_lyrics(artist, title))
    # Chord detection is CPU-bound/blocking — run in thread pool
    loop = asyncio.get_event_loop()
    chords_future = loop.run_in_executor(None, _detect_chords, video_id)

    lyrics = await lyrics_task
    chords = await chords_future

    song = SongData(
        videoId=video_id,
        title=title,
        artist=artist,
        lyrics=lyrics,
        chords=chords,
    )

    # 3. Store in cache for next time
    _cache_put(song)

    return song
