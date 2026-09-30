import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import EventSource from 'react-native-sse';
import type { AgentApi } from './api';

/** Token frames are batched; backgrounded screens release their connection. */
export function useStream<T>(api: AgentApi, path: string, receive: (frames: T[]) => void) {
  const handler = useRef(receive);
  handler.current = receive;
  const [connected, setConnected] = useState(false);
  const available = useRef(false);
  useEffect(() => {
    let source: EventSource | undefined, flush: ReturnType<typeof setTimeout> | undefined;
    let queue: T[] = [],
      live = true,
      bytes = 0;
    const close = () => {
      source?.removeAllEventListeners();
      source?.close();
      source = undefined;
      available.current = false;
      clearTimeout(flush);
      flush = undefined;
      queue = [];
      if (live) setConnected(false);
    };
    const open = () => {
      close();
      if (!live || AppState.currentState === 'background') return;
      bytes = 0;
      source = new EventSource(api.connection.url + path, { headers: { Authorization: `Bearer ${api.connection.key}` }, pollingInterval: 3000, timeoutBeforeConnection: 0 });
      source.addEventListener('message', (event) => {
        if (!event.data || !live) return;
        try {
          queue.push(JSON.parse(event.data) as T);
        } catch {
          return;
        }
        available.current = true;
        setConnected(true);
        bytes += event.data.length;
        if (!flush)
          flush = setTimeout(() => {
            const batch = queue;
            queue = [];
            flush = undefined;
            if (live && batch.length) handler.current(batch);
            // XHR retains responseText. Rotate before a long chat grows without bound.
            if (bytes > 2_000_000) open();
          }, 80);
      });
      source.addEventListener('error', () => {
        available.current = false;
        if (live) setConnected(false);
      });
      source.addEventListener('close', () => {
        available.current = false;
        if (live) setConnected(false);
      });
    };
    open();
    const lifecycle = AppState.addEventListener('change', (state) => (state === 'active' ? open() : close()));
    return () => {
      live = false;
      close();
      lifecycle.remove();
    };
  }, [api, path]);
  return { connected, available };
}
