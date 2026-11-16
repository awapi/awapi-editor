import { useCallback, useEffect, useRef, useState } from 'react';
import { buildGitStatusIndex, type GitStatusIndex } from '../../shared/git';

/** Coalesces bursts of refresh requests (saves, dir events, focus) into one `git status`. */
export const GIT_REFRESH_DEBOUNCE_MS = 250;

/**
 * Tracks `git status` for the repository containing `rootFolderPath`.
 * Refreshes when the root changes, when the repo's `.git` folder changes, when
 * the window regains focus, and whenever `refresh()` is called.
 */
export function useGitStatus(rootFolderPath: string | null, enabled: boolean) {
  const [index, setIndex] = useState<GitStatusIndex | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rootRef = useRef<string | null>(null);
  rootRef.current = enabled ? rootFolderPath : null;

  const load = useCallback(async () => {
    const root = rootRef.current;
    const api = window.electronAPI;
    if (!root || !api?.getGitStatus) return;
    try {
      const res = await api.getGitStatus(root);
      if (rootRef.current !== root) return;
      setIndex(res && res.ok ? buildGitStatusIndex(res) : null);
    } catch {
      if (rootRef.current === root) setIndex(null);
    }
  }, []);

  const refresh = useCallback(() => {
    if (!rootRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void load();
    }, GIT_REFRESH_DEBOUNCE_MS);
  }, [load]);

  const activeRoot = enabled ? rootFolderPath : null;

  useEffect(() => {
    setIndex(null);
    const api = window.electronAPI;
    void api?.watchGitRepo?.(activeRoot);
    if (!activeRoot) return;
    void load();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = null;
      void window.electronAPI?.watchGitRepo?.(null);
    };
  }, [activeRoot, load]);

  useEffect(() => {
    if (!activeRoot) return;
    const unsubscribe = window.electronAPI?.onGitRepoChanged?.(() => refresh());
    window.addEventListener('focus', refresh);
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
      window.removeEventListener('focus', refresh);
    };
  }, [activeRoot, refresh]);

  return { index, refresh };
}
