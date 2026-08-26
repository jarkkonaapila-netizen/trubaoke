/**
 * LRCLIB — free, open-source synchronized lyrics database.
 * https://lrclib.net — CORS-enabled, no API key required.
 */

import type { LyricLine } from '../types';

const BASE = 'https://lrclib.net/api';
const LRC_RE = /\[(\d{1,3}):(\d{2}\.\d{1,3})\]\s*(.*)/;

function parseLrc(lrc: string): LyricLine[] {
  return lrc
    .split('\n')
    .flatMap((line) => {
      const m = LRC_RE.exec(line.trim());
      if (!m || !m[3].trim()) return [];
      return [{ time: parseInt(m[1]) * 60 + parseFloat(m[2]), text: m[3].trim() }];
    })
    .sort((a, b) => a.time - b.time);
}

export async function fetchLyrics(artist: string, title: string): Promise<LyricLine[]> {
  // 1. Exact match
  try {
    const r = await fetch(
      `${BASE}/get?artist_name=${encodeURIComponent(artist)}&track_name=${encodeURIComponent(title)}`,
    );
    if (r.ok) {
      const d = await r.json() as { syncedLyrics?: string };
      if (d.syncedLyrics) return parseLrc(d.syncedLyrics);
    }
  } catch { /* ignore, try search */ }

  // 2. Search fallback
  try {
    const r = await fetch(
      `${BASE}/search?track_name=${encodeURIComponent(title)}&artist_name=${encodeURIComponent(artist)}`,
    );
    if (r.ok) {
      const items = await r.json() as Array<{ syncedLyrics?: string }>;
      for (const item of items.slice(0, 5)) {
        if (item.syncedLyrics) return parseLrc(item.syncedLyrics);
      }
    }
  } catch { /* ignore */ }

  return [];
}
