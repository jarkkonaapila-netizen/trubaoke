/**
 * SearchBar
 *
 * Full-width search input with a submit button. Supports keyboard (Enter)
 * and pointer submission. Shows a spinner while a search is in flight.
 */

import { useState, type FormEvent } from 'react';

interface SearchBarProps {
  onSearch: (query: string) => void;
  isLoading: boolean;
}

export default function SearchBar({ onSearch, isLoading }: SearchBarProps) {
  const [query, setQuery] = useState('');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = query.trim();
    if (trimmed) onSearch(trimmed);
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex gap-2 w-full max-w-2xl mx-auto"
    >
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search song or artist… (e.g. Happoradio Piirun verran)"
        className="
          flex-1 rounded-xl px-4 py-3
          bg-gray-800 border border-gray-700
          text-gray-100 placeholder-gray-500
          focus:outline-none focus:ring-2 focus:ring-indigo-500
          text-base
        "
        disabled={isLoading}
        autoFocus
      />
      <button
        type="submit"
        disabled={isLoading || !query.trim()}
        className="
          px-6 py-3 rounded-xl font-semibold
          bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700
          text-white disabled:text-gray-500
          transition-colors duration-150
          flex items-center gap-2 whitespace-nowrap
        "
      >
        {isLoading ? (
          <>
            <Spinner />
            Searching…
          </>
        ) : (
          '🔍 Search'
        )}
      </button>
    </form>
  );
}

function Spinner() {
  return (
    <svg
      className="animate-spin h-4 w-4"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8v8H4z"
      />
    </svg>
  );
}
