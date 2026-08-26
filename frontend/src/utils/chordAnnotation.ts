/**
 * chordAnnotation.ts
 *
 * Utilities for combining LRC lyric lines with timed chord events.
 *
 * The algorithm:
 *   1. For each lyric line, collect chords whose timestamps fall in
 *      [line.time, nextLine.time).
 *   2. Map each chord's timestamp to a character index within the line
 *      proportionally (chord offset within line / line duration → fraction
 *      of text length), then snap to the nearest word start so chords don't
 *      split mid-word.
 *   3. Deduplicate chords that land on the same word start.
 */

import type { LyricLine, ChordEvent, AnnotatedLine } from '../types';

// ── Chord-type detection ────────────────────────────────────────────────────

/** Classify a chord string for colour-coding purposes. */
export type ChordType = 'major' | 'minor' | 'seventh' | 'other';

export function getChordType(chord: string): ChordType {
  if (!chord || chord === 'N' || chord === 'N.C.') return 'other';
  // Minor: ends with 'm', 'min', but NOT 'maj' / 'dim' / 'aug'
  if (/m(in)?(\d|add|sus|\/|$)/.test(chord) && !/maj/i.test(chord)) return 'minor';
  if (/dim|°/.test(chord)) return 'other';
  if (/aug|\+/.test(chord)) return 'other';
  if (/7$|7\/|9$|11$|13$/.test(chord)) return 'seventh';
  return 'major';
}

// ── Word-boundary snapping ──────────────────────────────────────────────────

/**
 * Given a character index in `text`, return the index of the start of the
 * nearest word at or before `index`. If the index is already at a word start
 * (or the text has no spaces), return `index` unchanged.
 */
function snapToWordStart(text: string, index: number): number {
  if (index <= 0) return 0;
  // Walk left to find the start of the current word
  let i = Math.min(index, text.length - 1);
  while (i > 0 && text[i] === ' ') i--; // skip trailing spaces
  while (i > 0 && text[i - 1] !== ' ') i--;
  return i;
}

// ── Annotation builder ──────────────────────────────────────────────────────

/**
 * Annotate every lyric line with the guitar chords that belong to it.
 *
 * @param lyrics - Sorted array of LRC lyric lines.
 * @param chords - Sorted array of chord events (from chord detection).
 * @returns      - One AnnotatedLine per lyric line.
 */
export function annotateLines(
  lyrics: LyricLine[],
  chords: ChordEvent[],
): AnnotatedLine[] {
  return lyrics.map((line, i) => {
    const lineStart = line.time;
    // Use the next line's timestamp as the end boundary; last line gets +10s
    const lineEnd = lyrics[i + 1]?.time ?? lineStart + 10;
    const lineDuration = Math.max(lineEnd - lineStart, 0.01);

    // Chords in this line's time window
    const lineChords = chords.filter(
      (c) => c.time >= lineStart && c.time < lineEnd,
    );

    // Map timestamps → character indices (snapped to word start)
    const seen = new Set<number>();
    const chordAnnotations = lineChords
      .map((chord) => {
        const fraction = (chord.time - lineStart) / lineDuration;
        const rawIndex = Math.floor(fraction * line.text.length);
        const charIndex = snapToWordStart(line.text, rawIndex);
        return { charIndex, chord: chord.chord };
      })
      // Deduplicate: keep first chord per unique character index
      .filter(({ charIndex }) => {
        if (seen.has(charIndex)) return false;
        seen.add(charIndex);
        return true;
      })
      .sort((a, b) => a.charIndex - b.charIndex);

    return { lyric: line, chordAnnotations };
  });
}

// ── Line splitting ──────────────────────────────────────────────────────────

export interface TextSegment {
  text: string;
  chord: string | null; // chord to display above this segment, if any
}

/**
 * Split an annotated line into renderable segments.
 * Each segment optionally carries a chord label to show above its start.
 */
export function splitIntoSegments(line: AnnotatedLine): TextSegment[] {
  const { text } = line.lyric;
  const annotations = line.chordAnnotations;

  if (annotations.length === 0) {
    return [{ text, chord: null }];
  }

  const segments: TextSegment[] = [];
  let cursor = 0;

  for (const { charIndex, chord } of annotations) {
    // Text before this chord (no chord label)
    if (charIndex > cursor) {
      segments.push({ text: text.slice(cursor, charIndex), chord: null });
    }
    cursor = charIndex;
    // Find end of this segment (= start of next chord, or end of text)
    const nextAnnotation = annotations.find((a) => a.charIndex > charIndex);
    const segEnd = nextAnnotation?.charIndex ?? text.length;
    segments.push({ text: text.slice(cursor, segEnd), chord });
    cursor = segEnd;
  }

  // Any remaining text
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), chord: null });
  }

  return segments;
}

// ── Active-line lookup ──────────────────────────────────────────────────────

/**
 * Return the index of the lyric line that is currently active.
 * "Active" means its timestamp ≤ currentTime and the next line hasn't started.
 */
export function getActiveLine(
  lyrics: LyricLine[],
  currentTime: number,
): number {
  let active = 0;
  for (let i = 0; i < lyrics.length; i++) {
    if (lyrics[i].time <= currentTime) {
      active = i;
    } else {
      break;
    }
  }
  return active;
}
