/**
 * App — Trubaoke root component
 *
 * Layout:
 *   - Search screen: logo + search bar + results grid
 *   - Song screen:   YouTube player (compact top strip) + karaoke display
 *
 * Responsive: works on both tablet (portrait) and desktop (landscape).
 */

import { useState, useCallback } from 'react';
import SearchBar from './components/SearchBar';
import SearchResults from './components/SearchResults';
import YouTubePlayer from './components/YouTubePlayer';
import KaraokeDisplay from './components/KaraokeDisplay';
import { useYouTubePlayer } from './hooks/useYouTubePlayer';
import { searchSongs, getSongData } from './api';
import type { SearchResult, SongData, LoadingState } from './types';

export default function App() {
  // Search state
  const [searchLoading, setSearchLoading] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

  // Active song state
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null);
  const [songData, setSongData] = useState<SongData | null>(null);
  const [songLoadState, setSongLoadState] = useState<LoadingState>('idle');

  // YouTube player (videoId drives which video loads)
  const videoId = selectedResult?.videoId ?? null;
  const player = useYouTubePlayer(videoId);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleSearch = useCallback(async (query: string) => {
    setSearchLoading(true);
    setSearchError(null);
    setResults([]);
    setSelectedResult(null);
    setSongData(null);
    setSongLoadState('idle');

    try {
      const res = await searchSongs(query);
      setResults(res);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Search failed';
      setSearchError(msg);
    } finally {
      setSearchLoading(false);
    }
  }, []);

  const handleSelectSong = useCallback(async (result: SearchResult) => {
    setSelectedResult(result);
    setResults([]);
    setSongData(null);
    setSongLoadState('loading');

    // Parse artist / title from the YouTube video title heuristically.
    // Common formats: "Artist - Title", "Title - Artist", "Title (Official Video)"
    let artist = result.channelTitle;
    let title = result.title;

    const dashMatch = result.title.match(/^(.+?)\s[-–]\s(.+)$/);
    if (dashMatch) {
      artist = dashMatch[1].trim();
      title = dashMatch[2].replace(/\(.*?\)/g, '').trim();
    }

    try {
      const data = await getSongData(result.videoId, artist, title);
      setSongData(data);
      setSongLoadState('ready');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load song data';
      console.error('getSongData error:', msg);
      setSongLoadState('error');
    }
  }, []);

  const handleBack = useCallback(() => {
    setSelectedResult(null);
    setSongData(null);
    setSongLoadState('idle');
    setResults([]);
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────

  const isSongView = !!selectedResult;

  return (
    <div className="min-h-screen flex flex-col bg-gray-950">
      {/* ── Header ── */}
      <header className="flex items-center gap-4 px-4 py-3 border-b border-gray-800">
        {isSongView && (
          <button
            onClick={handleBack}
            className="text-gray-400 hover:text-white transition-colors text-sm flex items-center gap-1"
            aria-label="Back to search"
          >
            ← Back
          </button>
        )}
        <h1 className="text-2xl font-extrabold tracking-tight text-indigo-400 select-none">
          🎤 Trubaoke
        </h1>
        {!isSongView && (
          <div className="flex-1">
            <SearchBar onSearch={handleSearch} isLoading={searchLoading} />
          </div>
        )}
      </header>

      {/* ── Main content ── */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {!isSongView ? (
          /* Search / results view */
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {searchError && (
              <p className="text-red-400 text-center text-sm">{searchError}</p>
            )}
            {!searchLoading && results.length === 0 && !searchError && (
              <p className="text-gray-600 text-center mt-12 text-lg select-none">
                Search for a song to start singing 🎵
              </p>
            )}
            <SearchResults results={results} onSelect={handleSelectSong} />
          </div>
        ) : (
          /* Song view: player + karaoke */
          <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
            {/* Left / top panel: YouTube player */}
            <div className="lg:w-80 lg:flex-shrink-0 p-3 lg:border-r lg:border-gray-800 border-b border-gray-800 flex flex-col gap-3">
              <YouTubePlayer
                containerRef={player.containerRef}
                isReady={player.isReady}
                isPlaying={player.isPlaying}
                compact
              />
              <div className="flex flex-col gap-1 text-xs text-gray-400">
                <span className="font-semibold text-gray-200 text-sm truncate">
                  {selectedResult.title}
                </span>
                <span className="truncate">{selectedResult.channelTitle}</span>
              </div>

              {/* Song load status */}
              {songLoadState === 'loading' && (
                <div className="text-xs text-yellow-400 flex items-center gap-2">
                  <span className="animate-spin">⏳</span>
                  Detecting chords… (first load may take ~60 s)
                </div>
              )}
              {songLoadState === 'error' && (
                <p className="text-xs text-red-400">
                  Could not load lyrics/chords for this video.
                </p>
              )}
            </div>

            {/* Right / bottom panel: Karaoke display (TODO 2) */}
            <div className="flex-1 overflow-y-auto p-4">
              {songLoadState === 'ready' && songData ? (
                <KaraokeDisplay
                  songData={songData}
                  currentTime={player.currentTime}
                />
              ) : songLoadState === 'loading' ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-gray-500 text-sm animate-pulse">
                    Analysing audio…
                  </p>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
