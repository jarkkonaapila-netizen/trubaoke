"""
YouTube Data API v3 search service.

Returns video search results (title, channel, thumbnail) for a given query.
Appends "lyrics karaoke" to the query to bias results toward singable content.
"""

import logging
import os

import httpx

from models import SearchResult

logger = logging.getLogger(__name__)

_SEARCH_URL = "https://www.googleapis.com/youtube/v3/search"
_VIDEOS_URL = "https://www.googleapis.com/youtube/v3/videos"


def _get_api_key() -> str:
    key = os.getenv("YOUTUBE_API_KEY", "").strip()
    if not key:
        raise RuntimeError(
            "YOUTUBE_API_KEY environment variable is not set. "
            "Get a free key at https://console.cloud.google.com/"
        )
    return key


def _iso_duration_to_human(iso: str) -> str:
    """Convert ISO 8601 duration (PT3M45S) to a human string (3:45)."""
    import re

    m = re.match(r"PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?", iso)
    if not m:
        return ""
    hours = int(m.group(1) or 0)
    minutes = int(m.group(2) or 0)
    seconds = int(m.group(3) or 0)
    if hours:
        return f"{hours}:{minutes:02d}:{seconds:02d}"
    return f"{minutes}:{seconds:02d}"


async def search_youtube(query: str, max_results: int = 9) -> list[SearchResult]:
    """Search YouTube and return matching video metadata."""
    api_key = _get_api_key()
    biased_query = f"{query} lyrics"

    async with httpx.AsyncClient(timeout=12.0) as client:
        # Step 1: search for videos
        search_resp = await client.get(
            _SEARCH_URL,
            params={
                "part": "snippet",
                "q": biased_query,
                "type": "video",
                "videoEmbeddable": "true",
                "maxResults": max_results,
                "key": api_key,
            },
        )
        search_resp.raise_for_status()
        search_data = search_resp.json()

        video_ids = [
            item["id"]["videoId"]
            for item in search_data.get("items", [])
            if item.get("id", {}).get("videoId")
        ]

        if not video_ids:
            return []

        # Step 2: fetch video durations
        videos_resp = await client.get(
            _VIDEOS_URL,
            params={
                "part": "contentDetails",
                "id": ",".join(video_ids),
                "key": api_key,
            },
        )
        videos_resp.raise_for_status()
        videos_data = videos_resp.json()

        duration_map: dict[str, str] = {
            item["id"]: _iso_duration_to_human(
                item.get("contentDetails", {}).get("duration", "")
            )
            for item in videos_data.get("items", [])
        }

    results: list[SearchResult] = []
    for item in search_data.get("items", []):
        vid = item.get("id", {}).get("videoId", "")
        if not vid:
            continue
        snippet = item.get("snippet", {})
        thumbnails = snippet.get("thumbnails", {})
        # Prefer medium thumbnail (320×180); fall back to default
        thumb = (
            thumbnails.get("medium", {}).get("url")
            or thumbnails.get("default", {}).get("url", "")
        )
        results.append(
            SearchResult(
                videoId=vid,
                title=snippet.get("title", ""),
                channelTitle=snippet.get("channelTitle", ""),
                thumbnail=thumb,
                duration=duration_map.get(vid, ""),
            )
        )

    logger.info("YouTube search '%s' → %d results", query, len(results))
    return results
