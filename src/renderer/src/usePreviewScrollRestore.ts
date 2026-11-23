import { useLayoutEffect, useRef } from 'react';

// Last preview scroll offset per tab id; survives the preview remounting on tab switches.
const scrollByTab = new Map<string, number>();

export const getPreviewScroll = (key: string): number => scrollByTab.get(key) ?? 0;
export const setPreviewScroll = (key: string, top: number): void => {
  scrollByTab.set(key, top);
};
export const clearPreviewScroll = (key: string): void => {
  scrollByTab.delete(key);
};

const RESTORE_TIMEOUT_MS = 3000;
const USER_INPUT_EVENTS = ['wheel', 'touchstart', 'pointerdown', 'keydown'] as const;

/**
 * Persists the scroll offset of `bodyRef` under `scrollKey` and restores it on mount.
 * Content may render or grow asynchronously (large documents, diagrams), so the restore is
 * retried as the content resizes until the target is reachable, the timeout passes, or the
 * user scrolls. Does nothing when `scrollKey` is undefined or `enabled` is false.
 */
export function usePreviewScrollRestore(
  scrollKey: string | undefined,
  bodyRef: React.RefObject<HTMLElement | null>,
  enabled: boolean,
): void {
  const restoring = useRef(false);

  useLayoutEffect(() => {
    const body = bodyRef.current;
    if (!scrollKey || !enabled || !body) return;

    const target = getPreviewScroll(scrollKey);
    let observer: ResizeObserver | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const stop = () => {
      restoring.current = false;
      observer?.disconnect();
      if (timer) clearTimeout(timer);
      USER_INPUT_EVENTS.forEach(evt => body.removeEventListener(evt, stop));
    };

    const apply = () => {
      body.scrollTop = target;
      return Math.abs(body.scrollTop - target) < 1;
    };

    const onScroll = () => {
      if (restoring.current) return;
      setPreviewScroll(scrollKey, body.scrollTop);
    };

    if (target > 0) {
      restoring.current = true;
      apply();
      USER_INPUT_EVENTS.forEach(evt => body.addEventListener(evt, stop, { passive: true }));
      if (typeof ResizeObserver !== 'undefined') {
        observer = new ResizeObserver(() => {
          if (restoring.current) apply();
        });
        observer.observe(body);
        Array.from(body.children).forEach(child => observer?.observe(child));
      }
      timer = setTimeout(stop, RESTORE_TIMEOUT_MS);
    }

    body.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      body.removeEventListener('scroll', onScroll);
      stop();
    };
  }, [scrollKey, enabled, bodyRef]);
}
