/**
 * ChordifyPanel
 *
 * Shows guitar chords for the current YouTube video via Chordify.
 *
 * By default renders a "View chords" button. When clicked it expands
 * an iframe pointing at chordify.net. If Chordify blocks iframe embedding
 * (X-Frame-Options) the user can still click the external link to open it
 * in a new tab alongside the app.
 */

import { useState } from 'react';

interface Props {
  videoId: string;
}

const chordifyUrl = (id: string) =>
  `https://chordify.net/chords/youtube/${id}`;

export default function ChordifyPanel({ videoId }: Props) {
  const [expanded, setExpanded] = useState(false);
  const url = chordifyUrl(videoId);

  return (
    <div className="flex flex-col h-full">
      {/* Toggle bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-800 border-b border-gray-700 flex-shrink-0">
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center gap-2 text-sm font-semibold text-amber-400 hover:text-amber-300 transition-colors"
        >
          <span>🎸</span>
          <span>{expanded ? 'Hide chords' : 'Show chords (Chordify)'}</span>
        </button>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-gray-400 hover:text-gray-200 transition-colors"
          title="Open in Chordify (new tab)"
        >
          Open ↗
        </a>
      </div>

      {/* Iframe panel */}
      {expanded && (
        <div className="flex-1 relative min-h-0">
          <iframe
            key={videoId}
            src={url}
            title="Chordify chord view"
            className="w-full h-full border-0"
            allow="autoplay; encrypted-media"
            allowFullScreen
          />
          {/* Fallback note — shown underneath the iframe.
              If Chordify blocks embedding the iframe content is invisible
              and the user sees this message instead. */}
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gray-900 -z-10">
            <p className="text-gray-400 text-sm text-center px-4">
              Chordify can't be embedded here.
            </p>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-sm font-semibold transition-colors"
            >
              Open Chordify in new tab →
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
