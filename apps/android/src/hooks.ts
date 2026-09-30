import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import type { AgentApi } from './api';

export function useResource<T>(api: AgentApi, path: string, poll = 0) {
  const [data, setData] = useState<T>();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  useEffect(() => {
    setData(undefined);
  }, [api, path]);
  useEffect(() => {
    if (!path) {
      setLoading(false);
      return;
    }
    let live = true,
      pending = false;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    async function update() {
      if (pending || !live || AppState.currentState === 'background') return;
      pending = true;
      try {
        const next = await api.request<T>(path, 'GET', undefined, controller.signal);
        if (live) {
          setData(next);
          setError('');
        }
      } catch (e) {
        if (live) setError(e instanceof Error ? e.message : 'Your agent is unavailable.');
      } finally {
        pending = false;
        if (live) setLoading(false);
      }
    }
    void update();
    const timer = poll ? setInterval(() => void update(), poll) : undefined;
    const resume = AppState.addEventListener('change', (state) => {
      if (state === 'active') void update();
    });
    return () => {
      live = false;
      controller.abort();
      clearInterval(timer);
      resume.remove();
    };
  }, [api, path, poll, revision]);
  return { data, error, loading, refresh, update: setData };
}
