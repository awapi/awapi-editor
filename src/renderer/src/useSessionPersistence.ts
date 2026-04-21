import { useEffect, useRef, useCallback } from 'react';

export interface SessionTab {
  id: string;
  title: string;
  filePath: string | null;
  content: string;
  isDirty: boolean;
}

export interface SessionData {
  activeTabId: string | null;
  tabs: SessionTab[];
}

/** Debounce delay (ms) before writing session to disk. */
const SAVE_DEBOUNCE_MS = 800;

/**
 * Auto-saves the current editor session (open tabs + active tab ID) to disk
 * via IPC whenever the tab state changes. Debounced to limit disk writes.
 *
 * For clean saved files (not dirty, has a filePath) the content is omitted
 * from the session so it is always re-read fresh from disk on restore.
 * For unsaved / dirty files the full content is stored so nothing is lost.
 */
export function useSessionPersistence(
  tabs: Array<{ id: string; title: string; filePath: string | null; content: string; isDirty?: boolean }>,
  activeTabId: string | null
): void {
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const persist = useCallback(() => {
    const w = window as any;
    if (!w.electronAPI?.saveSession) return;

    const session: SessionData = {
      activeTabId,
      tabs: tabs.map(tab => ({
        id: tab.id,
        title: tab.title,
        filePath: tab.filePath,
        // Omit content for clean disk-backed files; restore will re-read from disk
        content: tab.isDirty || !tab.filePath ? tab.content : '',
        isDirty: tab.isDirty ?? false,
      })),
    };

    w.electronAPI.saveSession(session);
  }, [tabs, activeTabId]);

  useEffect(() => {
    if (saveTimerRef.current !== null) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(persist, SAVE_DEBOUNCE_MS);

    return () => {
      if (saveTimerRef.current !== null) clearTimeout(saveTimerRef.current);
    };
  }, [persist]);
}

/**
 * Loads the previous session from disk via IPC.
 * Returns null if no session exists or if electronAPI is unavailable.
 */
export async function loadSession(): Promise<SessionData | null> {
  const w = window as any;
  if (!w.electronAPI?.loadSession) return null;
  try {
    return await w.electronAPI.loadSession();
  } catch {
    return null;
  }
}
