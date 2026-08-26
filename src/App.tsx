/**
 * Trubaoke — browser-only karaoke app with guitar chords.
 *
 * No backend, no Docker, no cloud setup needed.
 * Everything runs in the browser; the YouTube API key lives in localStorage.
 *
 * Flow:
 *   1. User enters their YouTube API key once (stored in localStorage)
 *   2. Search for a song → pick a result
 *   3. YouTube plays the video; LRCLIB lyrics scroll in sync
 *   4. "🎸 Show chords" expands a Chordify panel
 */

import { useState, useCallback } from 'react';
import { searchYouTube } from './api/youtube';
import { fetchLyrics } from './api/lrclib';
import { useApiKey } from './hooks/useApiKey';
import { useYouTubePlayer } from './hooks/useYouTubePlayer';
import SearchBar from './components/SearchBar';
import SearchResults from './components/SearchResults';
import YouTubePlayer from './components/YouTubePlayer';
import KaraokeDisplay from './components/KaraokeDisplay';
import ChordifyPanel from './components/ChordifyPanel';
import type { SearchResult, LyricLine, AppState } from './types';

// ── API-key setup screen ───────────────────────────────────────────────────────

function ApiKeySetup({ onSave }: { onSave: (k: string) => void }) {
  const [draft, setDraft] = useState('');
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 p-6 bg-gray-950">
      <h1 className="text-3xl font-extrabold text-indigo-400">🎤 Trubaoke</h1>
      <div className="w-full max-w-md bg-gray-800 rounded-2xl p-6 flex flex-col gap-4">
        <h2 className="text-lg font-semibold text-white">Enter your YouTube API key</h2>
        <p className="text-sm text-gray-400">
          Required once for song search. Get a free key at{' '}
          <a
            href="https://console.cloud.google.com/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-400 underline"
          >
            Google Cloud Console
          </a>{' '}
          → APIs &amp; Services → YouTube Data API v3.
        </p>
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="AIza…"
          className="rounded-lg px-4 py-3 bg-gray-700 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          onKeyDown={(e) => e.key === 'Enter' && draft.trim() && onSave(draft)}
          autoFocus
        />
        <button
          onClick={() => draft.trim() && onSave(draft)}
          disabled={!draft.trim()}
          className="py-3 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 text-white font-semibold transition-colors"
        >
          Save &amp; continue
        </button>
      </div>
    </div>
  );
}

// ── Main app ───────────────────────────────────────────────────────────────────

export default function App() {
  const { apiKey, saveApiKey, clearApiKey } = useApiKey();

  const [appState, setAppState] = useState<AppState>('search');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [selected, setSelected] = useState<SearchResult | null>(null);
  const [lyrics, setLyrics] = useState<LyricLine[]>([]);

  const player = useYouTubePlayer(selected?.videoId ?? null);

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleSearch = useCallback(async (q: string) => {
    setSearchLoading(true);
    setSearchError(null);
    setResults([]);
    try {
      const res = await searchYouTube(q, apiKey);
      setResults(res);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setSearchLoading(false);
    }
  }, [apiKey]);

  const handleSelect = useCallback(async (result: SearchResult) => {
    setSelected(result);
    setResults([]);
    setLyrics([]);
    setAppState('loading');

    // Parse artist / title from video title (format: "Artist - Title …")
    let artist = result.channelTitle;
    let title = result.title;
    const m = result.title.match(/^(.+?)\s[-–]\s(.+?)(?:\s[[(]|$)/);
    if (m) { artist = m[1].trim(); title = m[2].trim(); }

    const lines = await fetchLyrics(artist, title);
    setLyrics(lines);
    setAppState('playing');
  }, []);

  const handleBack = useCallback(() => {
    setSelected(null);
    setLyrics([]);
    setAppState('search');
  }, []);

  // ── Render ───────────────────────────────────────────────────────────────────

  if (!apiKey) return <ApiKeySetup onSave={saveApiKey} />;

  const isSongView = appState === 'loading' || appState === 'playing';

  return (
    <div className="h-screen flex flex-col bg-gray-950 overflow-hidden">
      {/* ── Header ── */}
      <header className="flex items-center gap-3 px-4 py-2 border-b border-gray-800 flex-shrink-0">
        {isSongView ? (
          <button
            onClick={handleBack}
            className="text-gray-400 hover:text-white text-sm transition-colors"
          >
            ← Back
          </button>
        ) : (
          <span className="text-xl font-extrabold text-indigo-400 select-none shrink-0">
            🎤 Trubaoke
          </span>
        )}

        {!isSongView && (
          <div className="flex-1">
            <SearchBar onSearch={handleSearch} isLoading={searchLoading} />
          </div>
        )}

        {isSongView && selected && (
          <span className="flex-1 text-sm text-gray-300 truncate font-medium">
            {selected.title}
          </span>
        )}

        <button
          onClick={clearApiKey}
          title="Change API key"
          className="text-gray-600 hover:text-gray-400 text-xs shrink-0 transition-colors"
        >
          ⚙️
        </button>
      </header>

      {/* ── Body ── */}
      {!isSongView ? (
        /* Search / results */
        <main className="flex-1 overflow-y-auto p-4 space-y-4">
          {searchError && (
            <p className="text-red-400 text-sm text-center">{searchError}</p>
          )}
          {!searchLoading && results.length === 0 && !searchError && (
            <p className="text-gray-600 text-center mt-16 text-lg select-none">
              Search for a song to start 🎵
            </p>
          )}
          <SearchResults results={results} onSelect={handleSelect} />
        </main>
      ) : (
        /* Song view */
        <main className="flex-1 flex flex-col lg:flex-row min-h-0">

          {/* Left / top: player + Chordify */}
          <div className="flex flex-col lg:w-[420px] lg:flex-shrink-0 border-b lg:border-b-0 lg:border-r border-gray-800">
            {/* YouTube player */}
            <div className="p-2">
              <YouTubePlayer
                containerRef={player.containerRef}
                isReady={player.isReady}
                isPlaying={player.isPlaying}
              />
            </div>

            {/* Chordify panel */}
            {selected && (
              <div className="flex-1 min-h-0 flex flex-col border-t border-gray-800">
                <ChordifyPanel videoId={selected.videoId} />
              </div>
            )}
          </div>

          {/* Right / bottom: karaoke lyrics */}
          <div className="flex-1 min-h-0 relative">
            {appState === 'loading' ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-gray-500 animate-pulse text-sm">Loading lyrics…</p>
              </div>
            ) : (
              <KaraokeDisplay lyrics={lyrics} currentTime={player.currentTime} />
            )}
          </div>

        </main>
      )}
    </div>
  );
}
