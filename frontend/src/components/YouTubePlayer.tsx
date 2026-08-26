/**
 * YouTubePlayer
 *
 * Wrapper component that renders the YouTube IFrame player.
 * The actual player lifecycle is managed by the useYouTubePlayer hook in the
 * parent; this component just provides the container div.
 */

import type { RefObject } from 'react';

interface YouTubePlayerProps {
  containerRef: RefObject<HTMLDivElement | null>;
  isReady: boolean;
  isPlaying: boolean;
  /** If true, shrink the player to a compact strip at the top */
  compact?: boolean;
}

export default function YouTubePlayer({
  containerRef,
  isReady,
  compact = false,
}: YouTubePlayerProps) {
  return (
    <div
      className={`
        relative w-full overflow-hidden rounded-xl bg-gray-900
        ${compact ? 'aspect-video max-h-40' : 'aspect-video'}
        ${!isReady ? 'animate-pulse' : ''}
      `}
    >
      {/* The YouTube IFrame is injected into this div by the hook */}
      <div
        ref={containerRef}
        className="absolute inset-0 [&>div]:w-full [&>div]:h-full [&>iframe]:w-full [&>iframe]:h-full"
      />

      {/* Loading overlay before the player is ready */}
      {!isReady && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900">
          <span className="text-gray-500 text-sm">Loading player…</span>
        </div>
      )}
    </div>
  );
}
