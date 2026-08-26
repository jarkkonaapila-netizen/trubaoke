/**
 * useYouTubePlayer
 *
 * Custom hook that manages the YouTube IFrame Player API lifecycle.
 * Loads the YT script once, creates a player in a given div, and exposes
 * current-time (polled at ~10 Hz) for karaoke sync.
 */

import { useEffect, useRef, useState, useCallback } from 'react';

declare global {
  interface Window {
    YT: typeof YT;
    onYouTubeIframeAPIReady: () => void;
  }
}

export interface YouTubePlayerControls {
  /** ref to attach to the container div */
  containerRef: React.RefObject<HTMLDivElement | null>;
  /** current playback time in seconds (updated ~10 Hz) */
  currentTime: number;
  isPlaying: boolean;
  isReady: boolean;
  play: () => void;
  pause: () => void;
  seekTo: (seconds: number) => void;
}

/** Global promise that resolves once the YT SDK is ready. */
let ytReadyPromise: Promise<void> | null = null;

function loadYouTubeAPI(): Promise<void> {
  if (ytReadyPromise) return ytReadyPromise;

  ytReadyPromise = new Promise((resolve) => {
    if (window.YT && window.YT.Player) {
      resolve();
      return;
    }
    window.onYouTubeIframeAPIReady = resolve;
    const script = document.createElement('script');
    script.src = 'https://www.youtube.com/iframe_api';
    script.async = true;
    document.head.appendChild(script);
  });

  return ytReadyPromise;
}

export function useYouTubePlayer(videoId: string | null): YouTubePlayerControls {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const playerRef = useRef<YT.Player | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isReady, setIsReady] = useState(false);

  // Destroy player and clear poll timer
  const teardown = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (playerRef.current) {
      try {
        playerRef.current.destroy();
      } catch {
        // ignore errors during teardown
      }
      playerRef.current = null;
    }
    setIsReady(false);
    setIsPlaying(false);
    setCurrentTime(0);
  }, []);

  useEffect(() => {
    if (!videoId) {
      // eslint-disable-next-line react/set-state-in-effect -- intentional reset when video is deselected
      teardown();
      return;
    }

    let cancelled = false;

    loadYouTubeAPI().then(() => {
      if (cancelled || !containerRef.current) return;

      // Ensure a clean inner element for the player
      const div = document.createElement('div');
      containerRef.current.innerHTML = '';
      containerRef.current.appendChild(div);

      playerRef.current = new window.YT.Player(div, {
        videoId,
        playerVars: {
          autoplay: 1,
          controls: 1,
          rel: 0,
          modestbranding: 1,
        },
        events: {
          onReady: () => {
            if (cancelled) return;
            setIsReady(true);
          },
          onStateChange: (event: YT.PlayerEvent) => {
            if (cancelled) return;
            const playing = event.data === window.YT.PlayerState.PLAYING;
            setIsPlaying(playing);

            if (playing) {
              // Poll current time at ~10 Hz for karaoke sync
              pollRef.current = setInterval(() => {
                if (playerRef.current) {
                  setCurrentTime(playerRef.current.getCurrentTime());
                }
              }, 100);
            } else {
              if (pollRef.current) {
                clearInterval(pollRef.current);
                pollRef.current = null;
              }
            }
          },
        },
      });
    });

    return () => {
      cancelled = true;
      teardown();
    };
  }, [videoId, teardown]);

  const play = useCallback(() => playerRef.current?.playVideo(), []);
  const pause = useCallback(() => playerRef.current?.pauseVideo(), []);
  const seekTo = useCallback(
    (seconds: number) => playerRef.current?.seekTo(seconds, true),
    [],
  );

  return { containerRef, currentTime, isPlaying, isReady, play, pause, seekTo };
}
