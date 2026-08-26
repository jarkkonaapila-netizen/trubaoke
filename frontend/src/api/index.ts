import axios from 'axios';
import type { SearchResult, SongData } from '../types';

/** Base URL for the Trubaoke backend API. */
const api = axios.create({
  baseURL: '/api',
  timeout: 120_000, // chord detection can take up to 60s for uncached songs
});

/**
 * Search YouTube for karaoke / lyric videos.
 * @param query - artist + song name, e.g. "Happoradio Piirun verran"
 */
export async function searchSongs(query: string): Promise<SearchResult[]> {
  const { data } = await api.get<{ results: SearchResult[] }>('/search', {
    params: { q: query },
  });
  return data.results;
}

/**
 * Fetch synchronized lyrics and auto-detected chords for a YouTube video.
 * The backend caches results in DynamoDB so subsequent calls are instant.
 *
 * @param videoId - YouTube video ID
 * @param artist  - artist name (used for LRCLIB lookup)
 * @param title   - song title (used for LRCLIB lookup)
 */
export async function getSongData(
  videoId: string,
  artist: string,
  title: string,
): Promise<SongData> {
  const { data } = await api.get<SongData>('/song', {
    params: { video_id: videoId, artist, title },
  });
  return data;
}
