import * as fs from 'fs';
import { basename, join } from 'path';

export interface ExplorerEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

export type ReadDirectoryResult =
  | { ok: true; dirPath: string; name: string; entries: ExplorerEntry[] }
  | { ok: false; error: string };

export type DeletePathResult =
  | { ok: true }
  | { ok: false; error: string };

export type CreateItemResult =
  | { ok: true; path: string }
  | { ok: false; error: string };

export const DIR_WATCH_DEBOUNCE_MS = 120;

const dirWatchers = new Map<string, fs.FSWatcher>();
const dirDebounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
let activeDirChangeCallback: ((dirPath: string) => void) | null = null;

/**
 * Sorts directory entries VS Code style: folders first, then files, both
 * ordered case-insensitively with natural numeric ordering.
 */
export function sortExplorerEntries(entries: ExplorerEntry[]): ExplorerEntry[] {
  return [...entries].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) {
      return a.isDirectory ? -1 : 1;
    }
    const cmp = a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    return cmp !== 0 ? cmp : a.name.localeCompare(b.name);
  });
}

/**
 * Reads the immediate children of `dirPath` and returns sorted directory and
 * file entries suitable for rendering in the File Explorer tree.
 */
export function listDirectoryEntries(dirPath: string): ReadDirectoryResult {
  if (typeof dirPath !== 'string' || !dirPath.trim()) {
    return { ok: false, error: 'Invalid directory path.' };
  }

  try {
    const dirents = fs.readdirSync(dirPath, { withFileTypes: true });
    const entries: ExplorerEntry[] = [];

    for (const dirent of dirents) {
      const fullPath = join(dirPath, dirent.name);
      let isDirectory = dirent.isDirectory();
      if (!isDirectory && dirent.isSymbolicLink()) {
        try {
          isDirectory = fs.statSync(fullPath).isDirectory();
        } catch {
          // Broken symlink or inaccessible target; treat as file entry.
          isDirectory = false;
        }
      }
      entries.push({
        name: dirent.name,
        path: fullPath,
        isDirectory,
      });
    }

    const name = basename(dirPath) || dirPath;
    return {
      ok: true,
      dirPath,
      name,
      entries: sortExplorerEntries(entries),
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Deletes a file or directory (recursively) from disk.
 */
export function deleteExplorerPath(targetPath: string): DeletePathResult {
  if (typeof targetPath !== 'string' || !targetPath.trim()) {
    return { ok: false, error: 'Invalid path.' };
  }

  try {
    if (!fs.existsSync(targetPath)) {
      return { ok: false, error: 'File or folder no longer exists on disk.' };
    }
    fs.rmSync(targetPath, { recursive: true, force: false });
    return { ok: true };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function validateExplorerItemName(rawName: unknown): { ok: true; name: string } | { ok: false; error: string } {
  if (typeof rawName !== 'string') {
    return { ok: false, error: 'Name cannot be empty.' };
  }
  const name = rawName.trim();
  if (!name) {
    return { ok: false, error: 'Name cannot be empty.' };
  }
  if (/[\\/]/.test(name) || name === '.' || name === '..') {
    return { ok: false, error: 'Name cannot contain path separators.' };
  }
  return { ok: true, name };
}

/**
 * Creates a new empty file inside `parentDirPath`. Fails if an entry with the
 * same name already exists.
 */
export function createExplorerFile(parentDirPath: string, rawName: string): CreateItemResult {
  if (typeof parentDirPath !== 'string' || !parentDirPath.trim()) {
    return { ok: false, error: 'Invalid directory path.' };
  }
  const validated = validateExplorerItemName(rawName);
  if (!validated.ok) return validated;

  const targetPath = join(parentDirPath, validated.name);
  try {
    if (fs.existsSync(targetPath)) {
      return { ok: false, error: 'A file or folder with that name already exists.' };
    }
    fs.writeFileSync(targetPath, '', { encoding: 'utf8', flag: 'wx' });
    return { ok: true, path: targetPath };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * Creates a new directory inside `parentDirPath`. Fails if an entry with the
 * same name already exists.
 */
export function createExplorerFolder(parentDirPath: string, rawName: string): CreateItemResult {
  if (typeof parentDirPath !== 'string' || !parentDirPath.trim()) {
    return { ok: false, error: 'Invalid directory path.' };
  }
  const validated = validateExplorerItemName(rawName);
  if (!validated.ok) return validated;

  const targetPath = join(parentDirPath, validated.name);
  try {
    if (fs.existsSync(targetPath)) {
      return { ok: false, error: 'A file or folder with that name already exists.' };
    }
    fs.mkdirSync(targetPath, { recursive: false });
    return { ok: true, path: targetPath };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function clearDirDebounce(dirPath: string): void {
  const timer = dirDebounceTimers.get(dirPath);
  if (timer) {
    clearTimeout(timer);
    dirDebounceTimers.delete(dirPath);
  }
}

function closeDirWatcher(dirPath: string): void {
  const watcher = dirWatchers.get(dirPath);
  if (!watcher) return;
  try {
    watcher.close();
  } catch {
    // ignore close errors
  }
  dirWatchers.delete(dirPath);
}

function scheduleDirChange(dirPath: string): void {
  clearDirDebounce(dirPath);
  const timer = setTimeout(() => {
    dirDebounceTimers.delete(dirPath);
    activeDirChangeCallback?.(dirPath);
  }, DIR_WATCH_DEBOUNCE_MS);
  dirDebounceTimers.set(dirPath, timer);
}

function startDirWatcher(dirPath: string): boolean {
  try {
    if (!fs.existsSync(dirPath)) return false;
    const watcher = fs.watch(dirPath, () => {
      scheduleDirChange(dirPath);
    });
    watcher.on?.('error', () => closeDirWatcher(dirPath));
    dirWatchers.set(dirPath, watcher);
    return true;
  } catch {
    return false;
  }
}

/**
 * Synchronizes active directory watchers with the set of folders currently
 * expanded in the File Explorer so newly added, saved, renamed, or deleted
 * files automatically refresh their parent folder in the tree view.
 */
export function syncWatchedDirs(
  rawDirs: unknown,
  onDirChanged: (dirPath: string) => void,
): void {
  activeDirChangeCallback = onDirChanged;
  const desired = new Set<string>();
  if (Array.isArray(rawDirs)) {
    for (const item of rawDirs) {
      if (typeof item === 'string' && item.trim()) {
        desired.add(item);
      }
    }
  }

  for (const existing of Array.from(dirWatchers.keys())) {
    if (!desired.has(existing)) {
      closeDirWatcher(existing);
      clearDirDebounce(existing);
    }
  }

  for (const dirPath of desired) {
    if (!dirWatchers.has(dirPath)) {
      startDirWatcher(dirPath);
    }
  }
}

/**
 * Closes all active directory watchers and clears pending debounce timers.
 */
export function clearAllWatchedDirs(): void {
  for (const dirPath of Array.from(dirWatchers.keys())) {
    closeDirWatcher(dirPath);
  }
  for (const timer of dirDebounceTimers.values()) {
    clearTimeout(timer);
  }
  dirDebounceTimers.clear();
  activeDirChangeCallback = null;
}

export function getWatchedDirPaths(): string[] {
  return Array.from(dirWatchers.keys());
}
