/**
 * SearchResults
 *
 * Responsive grid of YouTube search result cards. Tapping/clicking a card
 * fires onSelect with that result so the parent can load the song.
 */

import type { SearchResult } from '../types';

interface SearchResultsProps {
  results: SearchResult[];
  onSelect: (result: SearchResult) => void;
}

export default function SearchResults({ results, onSelect }: SearchResultsProps) {
  if (results.length === 0) return null;

  return (
    <div className="w-full max-w-5xl mx-auto">
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-widest mb-3">
        Results — tap a song to load chords &amp; lyrics
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {results.map((r) => (
          <button
            key={r.videoId}
            onClick={() => onSelect(r)}
            className="
              flex items-start gap-3 p-3 rounded-xl text-left
              bg-gray-800 border border-gray-700
              hover:border-indigo-500 hover:bg-gray-700
              active:scale-[0.98]
              transition-all duration-150
            "
          >
            <img
              src={r.thumbnail}
              alt={r.title}
              className="w-24 h-16 object-cover rounded-lg flex-shrink-0"
            />
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-medium text-gray-100 line-clamp-2 leading-snug">
                {r.title}
              </span>
              <span className="text-xs text-gray-400 mt-1 truncate">
                {r.channelTitle}
              </span>

            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
