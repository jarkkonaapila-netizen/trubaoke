/**
 * KaraokeDisplay
 *
 * Shows guitar chords above synchronized lyrics, karaoke-style.
 *
 * - Active (current) line: large, white, centred — scrolled into view
 * - Upcoming lines: dimmer, smaller
 * - Past lines: even dimmer, fade out above
 * - Chord labels float above the word where they land, colour-coded by type
 *   (major = sky blue, minor = amber, dominant 7th = violet, other = gray)
 */

import { useEffect, useRef, useMemo } from 'react';
import type { SongData } from '../types';
import {
  annotateLines,
  splitIntoSegments,
  getActiveLine,
  getChordType,
  type ChordType,
} from '../utils/chordAnnotation';

interface KaraokeDisplayProps {
  songData: SongData;
  currentTime: number;
}

// ── Chord colour map ────────────────────────────────────────────────────────

const chordColour: Record<ChordType, string> = {
  major: 'text-sky-400',
  minor: 'text-amber-400',
  seventh: 'text-violet-400',
  other: 'text-gray-400',
};

// ── Component ───────────────────────────────────────────────────────────────

export default function KaraokeDisplay({
  songData,
  currentTime,
}: KaraokeDisplayProps) {
  const { lyrics, chords } = songData;

  // Pre-compute all annotated lines once (lyrics/chords don't change)
  const annotated = useMemo(
    () => annotateLines(lyrics, chords),
    [lyrics, chords],
  );

  const activeIndex = getActiveLine(lyrics, currentTime);
  const activeLineRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Smooth-scroll the active line into view whenever it changes
  useEffect(() => {
    if (activeLineRef.current) {
      activeLineRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    }
  }, [activeIndex]);

  if (!lyrics.length) {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-gray-500 text-sm">No lyrics available for this track.</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="h-full overflow-y-auto py-20 px-4 select-none"
      style={{ scrollBehavior: 'smooth' }}
    >
      {/* Spacer so the first line can scroll to centre */}
      <div className="h-40" aria-hidden />

      {annotated.map((line, i) => {
        const isActive = i === activeIndex;
        const isPast = i < activeIndex;
        const isFuture = i > activeIndex;

        // Calculate proximity for subtle scaling
        const distance = Math.abs(i - activeIndex);
        const scale =
          isActive ? 1 : distance === 1 ? 0.88 : distance === 2 ? 0.8 : 0.72;

        return (
          <div
            key={i}
            ref={isActive ? activeLineRef : null}
            className={`
              mb-4 text-center leading-none transition-all duration-300 ease-in-out
              ${isActive ? 'opacity-100' : ''}
              ${isPast ? 'opacity-30' : ''}
              ${isFuture ? 'opacity-50' : ''}
            `}
            style={{ transform: `scale(${scale})`, transformOrigin: 'center' }}
          >
            <LyricLine
              segments={splitIntoSegments(line)}
              isActive={isActive}
            />
          </div>
        );
      })}

      {/* Bottom spacer */}
      <div className="h-40" aria-hidden />
    </div>
  );
}

// ── Inner LyricLine renderer ─────────────────────────────────────────────────

interface LyricLineProps {
  segments: ReturnType<typeof splitIntoSegments>;
  isActive: boolean;
}

function LyricLine({ segments, isActive }: LyricLineProps) {
  // Render the line as a series of inline-block spans.
  // Each span with a chord gets a top-padding to make room for the chord label.
  const hasChord = segments.some((s) => s.chord !== null);

  return (
    <span
      className={`
        inline leading-relaxed whitespace-pre-wrap
        ${isActive ? 'text-white font-bold text-2xl sm:text-3xl' : 'text-gray-300 text-xl sm:text-2xl font-medium'}
      `}
    >
      {segments.map((seg, i) => (
        <span
          key={i}
          className="inline-block relative"
          style={hasChord ? { paddingTop: '1.5rem' } : undefined}
        >
          {seg.chord && (
            <ChordLabel chord={seg.chord} isActive={isActive} />
          )}
          {seg.text}
        </span>
      ))}
    </span>
  );
}

// ── Chord label ──────────────────────────────────────────────────────────────

interface ChordLabelProps {
  chord: string;
  isActive: boolean;
}

function ChordLabel({ chord, isActive }: ChordLabelProps) {
  const type = getChordType(chord);
  const colour = chordColour[type];

  return (
    <span
      className={`
        absolute top-0 left-0 font-mono font-bold whitespace-nowrap
        ${colour}
        ${isActive ? 'text-base sm:text-lg' : 'text-sm sm:text-base opacity-70'}
        transition-opacity duration-200
      `}
      aria-label={`chord ${chord}`}
    >
      {chord}
    </span>
  );
}
