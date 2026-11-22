import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { A2uiSurfaceCard } from './A2uiSurfaceCard';

export interface A2uiPortalTarget {
  key: string;
  el: HTMLElement;
  payload: string;
}

function sameTargets(a: A2uiPortalTarget[], b: A2uiPortalTarget[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i]?.key !== b[i]?.key || a[i]?.payload !== b[i]?.payload || a[i]?.el !== b[i]?.el) {
      return false;
    }
  }
  return true;
}

/**
 * Watches the DOM for server-emitted `[data-a2ui-surface="1"][data-a2ui-payload]`
 * placeholder nodes and tracks them as stable React Portal targets.
 */
export function useA2uiPortalTargets(): A2uiPortalTarget[] {
  const [targets, setTargets] = useState<A2uiPortalTarget[]>([]);
  const keysRef = useRef(new WeakMap<HTMLElement, string>());
  const nextIdRef = useRef(1);

  useEffect(() => {
    if (typeof document === 'undefined' || !document.body) {
      return;
    }

    let rafId: number | null = null;

    const scan = () => {
      rafId = null;
      const nodes = document.querySelectorAll<HTMLElement>(
        '[data-a2ui-surface="1"][data-a2ui-payload]',
      );
      const next: A2uiPortalTarget[] = [];
      for (const el of nodes) {
        if (!el.isConnected) {
          continue;
        }
        const payload = el.getAttribute('data-a2ui-payload') || '';
        if (!payload) {
          continue;
        }
        if (el.dataset.a2uiClaimed !== '1') {
          el.textContent = '';
          el.dataset.a2uiClaimed = '1';
        }
        let key = keysRef.current.get(el);
        if (!key) {
          key = `a2ui-${nextIdRef.current++}`;
          keysRef.current.set(el, key);
        }
        next.push({ key, el, payload });
      }
      setTargets((prev) => (sameTargets(prev, next) ? prev : next));
    };

    const scheduleScan = () => {
      if (rafId !== null) {
        return;
      }
      rafId = requestAnimationFrame(scan);
    };

    scan();

    const observer = new MutationObserver(() => {
      scheduleScan();
    });
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
    };
  }, []);

  return targets;
}

/**
 * Renders live Astryx A2UI surfaces into each claimed chat output placeholder via React Portals.
 */
export function A2uiPortalHost({ targets }: { targets: A2uiPortalTarget[] }) {
  return (
    <>
      {targets.map((target) =>
        createPortal(
          <A2uiSurfaceCard
            key={target.key}
            payload={target.payload}
            hostEl={target.el}
          />,
          target.el,
          target.key,
        ),
      )}
    </>
  );
}
