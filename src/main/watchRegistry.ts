import { isEncodingKind } from './encoding';
import type { WatchedFileEntry } from './fileWatcher';

/**
 * Validates the payload of the `file:watchSync` IPC. Accepts plain paths or
 * `{ filePath, encoding? }` objects; anything else is dropped.
 */
export function parseWatchEntries(raw: unknown): WatchedFileEntry[] {
  if (!Array.isArray(raw)) return [];
  const entries: WatchedFileEntry[] = [];
  for (const item of raw) {
    if (typeof item === 'string') {
      if (item) entries.push({ filePath: item });
      continue;
    }
    if (!item || typeof item !== 'object') continue;
    const { filePath, encoding } = item as { filePath?: unknown; encoding?: unknown };
    if (typeof filePath !== 'string' || !filePath) continue;
    entries.push(isEncodingKind(encoding) ? { filePath, encoding } : { filePath });
  }
  return entries;
}

/**
 * Tracks which windows (keyed by `webContents.id`) have which files open, so
 * external-change notifications reach every window that shows the file —
 * the main window as well as pop-outs.
 */
export class WatchRegistry {
  private readonly owners = new Map<number, WatchedFileEntry[]>();

  has(ownerId: number): boolean {
    return this.owners.has(ownerId);
  }

  /** Replaces the set of files watched on behalf of `ownerId`. */
  set(ownerId: number, entries: WatchedFileEntry[]): void {
    this.owners.set(ownerId, entries);
  }

  remove(ownerId: number): void {
    this.owners.delete(ownerId);
  }

  clear(): void {
    this.owners.clear();
  }

  /**
   * Union of all watched files. When several windows have the same file open,
   * the encoding of the window that registered first is used.
   */
  entries(): WatchedFileEntry[] {
    const byPath = new Map<string, WatchedFileEntry>();
    for (const list of this.owners.values()) {
      for (const entry of list) {
        const existing = byPath.get(entry.filePath);
        if (!existing) {
          byPath.set(entry.filePath, entry);
        } else if (!existing.encoding && entry.encoding) {
          byPath.set(entry.filePath, { ...existing, encoding: entry.encoding });
        }
      }
    }
    return Array.from(byPath.values());
  }

  /** Ids of the windows that have `filePath` open. */
  ownersOf(filePath: string): number[] {
    const ids: number[] = [];
    for (const [ownerId, list] of this.owners) {
      if (list.some(entry => entry.filePath === filePath)) ids.push(ownerId);
    }
    return ids;
  }
}
