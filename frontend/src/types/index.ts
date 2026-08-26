/** A song search result from YouTube. */
export interface SearchResult {
  videoId: string;
  title: string;
  channelTitle: string;
  thumbnail: string;
  duration?: string;
}

/** A single LRC lyric line with its timestamp in seconds. */
export interface LyricLine {
  time: number; // seconds from start
  text: string;
}

/** A chord event: chord name at a given timestamp. */
export interface ChordEvent {
  time: number; // seconds from start
  chord: string; // e.g. "Am", "G", "C", "F"
}

/** Full song data returned from the backend. */
export interface SongData {
  videoId: string;
  title: string;
  artist: string;
  lyrics: LyricLine[];
  chords: ChordEvent[];
}

/** A lyric line annotated with chords that land in its time range. */
export interface AnnotatedLine {
  lyric: LyricLine;
  /** Chords mapped to character index within lyric.text where they should appear. */
  chordAnnotations: Array<{ charIndex: number; chord: string }>;
}

/** Status of chord/lyric loading for a song. */
export type LoadingState = 'idle' | 'searching' | 'loading' | 'ready' | 'error';
