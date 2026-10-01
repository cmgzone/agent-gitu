import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import type { GituApi } from './client';
import { mergeEvents } from './client';
import type { Run, RunEvent } from './types';

/** Serial polling catches up all pages and pauses while the phone is backgrounded. */
export function useRun(api: GituApi, id: string | undefined, revision: number) {
  const [state, setState] = useState<{ run?: Run; events: RunEvent[]; error: string }>({ events: [], error: '' });
  useEffect(() => {
    setState({ events: [], error: '' });
    if (!id) return;
    let disposed = false;
    let cursor = -1;
    let rows: RunEvent[] = [];
    let timer: ReturnType<typeof setTimeout>;
    let pending = false;
    const controller = new AbortController();
    const poll = async () => {
      if (disposed || pending || AppState.currentState === 'background') return;
      clearTimeout(timer);
      pending = true;
      try {
        let more: boolean;
        do {
          const page = await api.events(id, cursor, controller.signal);
          if (disposed) return;
          rows = mergeEvents(rows, page.events);
          cursor = page.cursor;
          more = page.more;
          setState({ run: page.session, events: rows, error: '' });
        } while (more);
      } catch (error) {
        if (!disposed) setState((value) => ({ ...value, error: error instanceof Error ? error.message : 'Connection lost. Reconnecting…' }));
      } finally {
        pending = false;
        if (!disposed) timer = setTimeout(() => void poll(), 2000);
      }
    };
    const listener = AppState.addEventListener('change', (next) => {
      if (next === 'active') void poll();
      else clearTimeout(timer);
    });
    void poll();
    return () => {
      disposed = true;
      clearTimeout(timer);
      controller.abort();
      listener.remove();
    };
  }, [api, id, revision]);
  return state;
}

/** A single in-flight request; stop on unmount and while the app is backgrounded. */
export function usePolling<T>(load: (signal: AbortSignal) => Promise<T>, interval = 2000) {
  const [value, setValue] = useState<T>();
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let pending = false;
    const poll = async () => {
      if (pending || controller.signal.aborted || AppState.currentState === 'background') return;
      clearTimeout(timer);
      pending = true;
      try {
        const next = await load(controller.signal);
        if (!controller.signal.aborted) {
          setValue(next);
          setError('');
        }
      } catch (error) {
        if (!controller.signal.aborted) setError(error instanceof Error ? error.message : 'Could not refresh Teams.');
      } finally {
        pending = false;
        if (!controller.signal.aborted) timer = setTimeout(() => void poll(), interval);
      }
    };
    const listener = AppState.addEventListener('change', (next) => {
      if (next === 'active') void poll();
      else clearTimeout(timer);
    });
    void poll();
    return () => {
      clearTimeout(timer);
      controller.abort();
      listener.remove();
    };
  }, [load, interval, revision]);
  return { value, error, refresh: () => setRevision((value) => value + 1) };
}
