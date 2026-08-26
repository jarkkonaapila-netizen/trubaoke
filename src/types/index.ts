/** Shared types for the Trubaoke browser app. */

export interface SearchResult {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
}

export interface LyricLine {
  time: number; // seconds from start
  text: string;
}

export type AppState = 'search' | 'loading' | 'playing' | 'error';
