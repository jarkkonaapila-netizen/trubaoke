/**
 * useApiKey — persists the YouTube Data API v3 key in localStorage.
 * For a personal app there is no backend; the key lives only in the browser.
 */

import { useState, useCallback } from 'react';

const STORAGE_KEY = 'trubaoke_yt_api_key';

export function useApiKey() {
  const [apiKey, setApiKeyState] = useState<string>(
    () => localStorage.getItem(STORAGE_KEY) ?? '',
  );

  const saveApiKey = useCallback((key: string) => {
    const trimmed = key.trim();
    localStorage.setItem(STORAGE_KEY, trimmed);
    setApiKeyState(trimmed);
  }, []);

  const clearApiKey = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setApiKeyState('');
  }, []);

  return { apiKey, saveApiKey, clearApiKey };
}
