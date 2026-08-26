/**
 * YouTube Data API v3 search — called directly from the browser.
 * The user's API key is stored in localStorage (personal app, no server needed).
 */

import type { SearchResult } from '../types';

export async function searchYouTube(query: string, apiKey: string): Promise<SearchResult[]> {
  const params = new URLSearchParams({
    part: 'snippet',
    q: `${query} lyrics`,
    type: 'video',
    videoEmbeddable: 'true',
    maxResults: '9',
    key: apiKey,
  });

  const r = await fetch(`https://www.googleapis.com/youtube/v3/search?${params}`);

  if (!r.ok) {
    const err = await r.json() as { error?: { message?: string } };
    throw new Error(err.error?.message ?? `YouTube API error ${r.status}`);
  }

  const data = await r.json() as {
    items: Array<{
      id: { videoId?: string };
      snippet: {
        title: string;
        channelTitle: string;
        thumbnails: { medium?: { url: string }; default?: { url: string } };
      };
    }>;
  };

  return data.items
    .filter((item) => !!item.id.videoId)
    .map((item) => ({
      videoId: item.id.videoId!,
      title: item.snippet.title,
      channelTitle: item.snippet.channelTitle,
      thumbnail:
        item.snippet.thumbnails.medium?.url ??
        item.snippet.thumbnails.default?.url ??
        '',
    }));
}
