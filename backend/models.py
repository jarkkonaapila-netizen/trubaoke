"""Pydantic models shared across the Trubaoke backend."""

from pydantic import BaseModel


class SearchResult(BaseModel):
    videoId: str
    title: str
    channelTitle: str
    thumbnail: str
    duration: str = ""


class LyricLine(BaseModel):
    time: float  # seconds from start
    text: str


class ChordEvent(BaseModel):
    time: float  # seconds from start
    chord: str   # e.g. "Am", "G", "C"


class SongData(BaseModel):
    videoId: str
    title: str
    artist: str
    lyrics: list[LyricLine]
    chords: list[ChordEvent]


class SearchResponse(BaseModel):
    results: list[SearchResult]
