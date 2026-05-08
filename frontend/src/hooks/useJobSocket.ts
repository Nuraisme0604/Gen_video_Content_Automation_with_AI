'use client';
import { useEffect, useCallback } from 'react';
import { getSocket, subscribeToVideo, unsubscribeFromVideo } from '@/lib/socket';

type JobEvent = {
  type: 'job:queued' | 'job:progress' | 'job:complete' | 'job:failed' | 'scene:rendered';
  data: any;
};

export function useJobSocket(videoId: string | null, onEvent: (e: JobEvent) => void) {
  const stableOnEvent = useCallback(onEvent, []);

  useEffect(() => {
    if (!videoId) return;
    const socket = getSocket();

    subscribeToVideo(videoId);

    const handlers: [string, (data: any) => void][] = [
      ['job:queued', (data) => stableOnEvent({ type: 'job:queued', data })],
      ['job:progress', (data) => stableOnEvent({ type: 'job:progress', data })],
      ['job:complete', (data) => stableOnEvent({ type: 'job:complete', data })],
      ['job:failed', (data) => stableOnEvent({ type: 'job:failed', data })],
      ['scene:rendered', (data) => stableOnEvent({ type: 'scene:rendered', data })],
    ];

    handlers.forEach(([event, handler]) => socket.on(event, handler));

    return () => {
      unsubscribeFromVideo(videoId);
      handlers.forEach(([event, handler]) => socket.off(event, handler));
    };
  }, [videoId, stableOnEvent]);
}
