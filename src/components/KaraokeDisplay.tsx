/**
 * KaraokeDisplay — scrolling lyrics synced to the current playback time.
 * The active line is large and centred; past lines fade above, upcoming lines
 * appear dimmer below — classic karaoke look.
 */

import { useEffect, useRef } from 'react';
import type { LyricLine } from '../types';

interface Props {
  lyrics: LyricLine[];
  currentTime: number;
}

function getActiveLine(lyrics: LyricLine[], t: number): number {
  let idx = 0;
  for (let i = 0; i < lyrics.length; i++) {
    if (lyrics[i].time <= t) idx = i;
    else break;
  }
  return idx;
}

export default function KaraokeDisplay({ lyrics, currentTime }: Props) {
  const activeIdx = getActiveLine(lyrics, currentTime);
  const activeRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [activeIdx]);

  if (!lyrics.length) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 text-sm">
        No lyrics found for this song.
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto py-16 px-4 select-none">
      <div className="h-32" />
      {lyrics.map((line, i) => {
        const dist = i - activeIdx;
        const isActive = dist === 0;
        const isPast = dist < 0;

        return (
          <div
            key={i}
            ref={isActive ? activeRef : null}
            className="text-center mb-5 transition-all duration-300"
            style={{
              opacity: isPast ? 0.25 : isActive ? 1 : Math.max(0.4, 1 - dist * 0.15),
              transform: `scale(${isActive ? 1 : 0.82})`,
              transformOrigin: 'center',
            }}
          >
            <span
              className={
                isActive
                  ? 'text-white font-bold text-3xl sm:text-4xl leading-snug'
                  : 'text-gray-300 text-xl sm:text-2xl font-medium leading-snug'
              }
            >
              {line.text}
            </span>
          </div>
        );
      })}
      <div className="h-32" />
    </div>
  );
}
