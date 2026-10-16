import * as fs from 'fs';
import { type EncodingKind, decodeRawFileInput } from './encoding';
import { isRasterImagePath } from '../shared/images';

export type EolKind = 'LF' | 'CRLF';

export interface ExternalFileChangePayload {
  filePath: string;
  content: string;
  eol: EolKind;
  /** Encoding the new disk content was decoded with. */
  encoding: EncodingKind;
}

/** A file to watch, plus the encoding its open tab currently uses. */
export interface WatchedFileEntry {
  filePath: string;
  encoding?: EncodingKind;
}

export interface FileWatcherCallbacks {
  onFileChanged: (payload: ExternalFileChangePayload) => void;
  onFileDeleted: (filePath: string) => void;
}

const SELF_SAVE_SUPPRESSION_MS = 1000;
const DEBOUNCE_MS = 100;
/**
 * After a `rename` event the path may briefly not exist (atomic save: the old
 * file is unlinked before the temp file is renamed into place). Re-check once
 * after this delay before reporting the file as deleted.
 */
export const RENAME_RECHECK_MS = 300;

const watchers = new Map<string, fs.FSWatcher>();
const debounceTimers = new Map<string, ReturnType<typeof setTimeout>>();
const selfSaveTimestamps = new Map<string, number>();
/** Paths the renderer currently wants watched (open tabs). */
const desiredPaths = new Set<string>();
/** Encoding of the open tab for each watched path, used to decode changes consistently. */
const preferredEncodings = new Map<string, EncodingKind>();
/** Paths whose watcher reported a `rename` since the last processed event. */
const pendingRenames = new Set<string>();
let activeCallbacks: FileWatcherCallbacks | null = null;

function detectEol(content: string): EolKind {
  return content.includes('\r\n') ? 'CRLF' : 'LF';
}

function normalizeToLF(content: string): string {
  return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/**
 * Record that `filePath` was just saved by AwapiEditor itself so the file
 * watcher ignores the resulting filesystem event.
 */
export function markSelfSaved(filePath: string, now = Date.now()): void {
  if (!filePath) return;
  selfSaveTimestamps.set(filePath, now);
}

/**
 * Returns true if `filePath` was saved by the editor within the suppression window.
 */
export function isSelfSaved(filePath: string, now = Date.now()): boolean {
  const ts = selfSaveTimestamps.get(filePath);
  if (ts === undefined) return false;
  if (now - ts <= SELF_SAVE_SUPPRESSION_MS) return true;
  selfSaveTimestamps.delete(filePath);
  return false;
}

/**
 * Inspect `filePath` on disk and invoke the appropriate callback.
 * Exported for deterministic unit testing as well as internal watcher use.
 */
export function handleDiskEvent(filePath: string, callbacks: FileWatcherCallbacks, now = Date.now()): void {
  if (isSelfSaved(filePath, now)) return;

  try {
    if (!fs.existsSync(filePath)) {
      callbacks.onFileDeleted(filePath);
      return;
    }
    if (isRasterImagePath(filePath)) {
      callbacks.onFileChanged({
        filePath,
        content: '',
        eol: 'LF',
        encoding: 'utf-8',
      });
      return;
    }
    const raw = fs.readFileSync(filePath);
    const { content: decodedContent, encoding } = decodeRawFileInput(
      raw,
      undefined,
      preferredEncodings.get(filePath),
    );
    const eol = detectEol(decodedContent);
    const content = normalizeToLF(decodedContent);
    callbacks.onFileChanged({ filePath, content, eol, encoding });
  } catch {
    // Ignore transient read errors while another process is mid-write
  }
}

function clearDebounce(filePath: string): void {
  const timer = debounceTimers.get(filePath);
  if (timer) {
    clearTimeout(timer);
    debounceTimers.delete(filePath);
  }
}

function closeWatcher(filePath: string): void {
  const watcher = watchers.get(filePath);
  if (!watcher) return;
  try {
    watcher.close();
  } catch {
    // ignore close errors
  }
  watchers.delete(filePath);
}

function scheduleDiskEvent(filePath: string, delayMs: number): void {
  clearDebounce(filePath);
  const timer = setTimeout(() => {
    debounceTimers.delete(filePath);
    processWatcherEvent(filePath);
  }, delayMs);
  debounceTimers.set(filePath, timer);
}

/** Starts an `fs.watch` on the file currently at `filePath`. Returns false if it doesn't exist. */
function startWatcher(filePath: string): boolean {
  try {
    if (!fs.existsSync(filePath)) return false;
    const watcher = fs.watch(filePath, (eventType) => {
      if (eventType === 'rename') pendingRenames.add(filePath);
      scheduleDiskEvent(filePath, DEBOUNCE_MS);
    });
    // e.g. Windows raises EPERM when the watched file is deleted.
    watcher.on?.('error', () => closeWatcher(filePath));
    watchers.set(filePath, watcher);
    return true;
  } catch {
    // Ignore files on filesystems that don't support fs.watch
    return false;
  }
}

/**
 * Handles a debounced watcher event for `filePath`.
 *
 * `fs.watch` on a file is bound to its inode. Tools that save atomically
 * (write a temp file, then rename it over the original) emit `rename` and leave
 * the watcher attached to the old, now-unlinked inode. So on `rename` the
 * watcher is re-created for whatever file now lives at the path; if the path is
 * briefly missing it is re-checked once before being reported as deleted.
 */
function processWatcherEvent(filePath: string, isRecheck = false): void {
  const callbacks = activeCallbacks;
  if (!callbacks || !desiredPaths.has(filePath)) return;

  if (pendingRenames.has(filePath)) {
    closeWatcher(filePath);
    if (!fs.existsSync(filePath) && !isRecheck) {
      const timer = setTimeout(() => {
        debounceTimers.delete(filePath);
        processWatcherEvent(filePath, true);
      }, RENAME_RECHECK_MS);
      debounceTimers.set(filePath, timer);
      return;
    }
    pendingRenames.delete(filePath);
    startWatcher(filePath);
  }

  handleDiskEvent(filePath, callbacks);
}

/**
 * Synchronize active filesystem watchers with the list of currently open files.
 * Entries may be plain paths or `{ filePath, encoding }`; the encoding is the
 * open tab's encoding and is preferred when decoding external changes.
 */
export function syncWatchedFiles(
  files: Array<string | WatchedFileEntry>,
  callbacks: FileWatcherCallbacks,
): void {
  const desired = new Set<string>();
  preferredEncodings.clear();
  for (const item of files) {
    const entry = typeof item === 'string' ? { filePath: item } : item;
    if (!entry || typeof entry.filePath !== 'string' || entry.filePath.length === 0) continue;
    desired.add(entry.filePath);
    if (entry.encoding && !preferredEncodings.has(entry.filePath)) {
      preferredEncodings.set(entry.filePath, entry.encoding);
    }
  }
  activeCallbacks = callbacks;

  // Forget closed files
  for (const existingPath of Array.from(desiredPaths)) {
    if (!desired.has(existingPath)) {
      desiredPaths.delete(existingPath);
      closeWatcher(existingPath);
      clearDebounce(existingPath);
      pendingRenames.delete(existingPath);
    }
  }

  // Watch newly opened files (and retry any that previously couldn't be watched)
  for (const filePath of desired) {
    desiredPaths.add(filePath);
    if (!watchers.has(filePath)) startWatcher(filePath);
  }
}

/**
 * Re-creates the watcher for `filePath` if it is an open file. Call after the
 * editor writes the file so a file that was deleted (or replaced) on disk and
 * then saved again is watched once more.
 */
export function refreshWatchedFile(filePath: string): void {
  if (!desiredPaths.has(filePath)) return;
  closeWatcher(filePath);
  pendingRenames.delete(filePath);
  startWatcher(filePath);
}

/**
 * Close and clear all active watchers (used on shutdown and in tests).
 */
export function clearAllWatchedFiles(): void {
  for (const filePath of Array.from(watchers.keys())) {
    closeWatcher(filePath);
  }
  for (const timer of debounceTimers.values()) {
    clearTimeout(timer);
  }
  debounceTimers.clear();
  selfSaveTimestamps.clear();
  desiredPaths.clear();
  preferredEncodings.clear();
  pendingRenames.clear();
  activeCallbacks = null;
}

export function getWatchedFilePaths(): string[] {
  return Array.from(watchers.keys());
}
