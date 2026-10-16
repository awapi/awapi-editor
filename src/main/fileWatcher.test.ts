import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const files = new Map<string, string | Buffer>();
const closedWatchers: string[] = [];
/** Most recent watch listener registered per path. */
const watchListeners = new Map<string, (eventType: string) => void>();

vi.mock('fs', () => ({
  existsSync: (p: string) => files.has(p),
  readFileSync: (p: string) => {
    const val = files.get(p);
    if (val === undefined) throw new Error(`ENOENT: ${p}`);
    // Real fs.readFileSync(path) returns a Buffer.
    return typeof val === 'string' ? Buffer.from(val, 'utf-8') : val;
  },
  watch: vi.fn((p: string, listener: (eventType: string) => void) => {
    watchListeners.set(p, listener);
    return {
      close: () => {
        closedWatchers.push(p);
      },
    };
  }),
}));

import * as fs from 'fs';

import {
  markSelfSaved,
  isSelfSaved,
  handleDiskEvent,
  syncWatchedFiles,
  clearAllWatchedFiles,
  getWatchedFilePaths,
  refreshWatchedFile,
  RENAME_RECHECK_MS,
} from './fileWatcher';

describe('fileWatcher', () => {
  beforeEach(() => {
    files.clear();
    closedWatchers.length = 0;
    watchListeners.clear();
    clearAllWatchedFiles();
    vi.mocked(fs.watch).mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('tracks and expires self-saved file suppression', () => {
    markSelfSaved('/tmp/a.txt', 1000);
    expect(isSelfSaved('/tmp/a.txt', 1500)).toBe(true);
    expect(isSelfSaved('/tmp/a.txt', 2500)).toBe(false);
  });

  it('emits onFileChanged with normalized LF content and detected EOL when file is modified externally', () => {
    files.set('/tmp/win.txt', 'line1\r\nline2\r\n');
    const onFileChanged = vi.fn();
    const onFileDeleted = vi.fn();

    handleDiskEvent('/tmp/win.txt', { onFileChanged, onFileDeleted });

    expect(onFileDeleted).not.toHaveBeenCalled();
    expect(onFileChanged).toHaveBeenCalledWith({
      filePath: '/tmp/win.txt',
      content: 'line1\nline2\n',
      eol: 'CRLF',
      encoding: 'utf-8',
    });
  });

  it('emits onFileDeleted when watched file no longer exists on disk', () => {
    const onFileChanged = vi.fn();
    const onFileDeleted = vi.fn();

    handleDiskEvent('/tmp/deleted.txt', { onFileChanged, onFileDeleted });

    expect(onFileChanged).not.toHaveBeenCalled();
    expect(onFileDeleted).toHaveBeenCalledWith('/tmp/deleted.txt');
  });

  it('suppresses disk event if the file was just saved by the editor itself', () => {
    files.set('/tmp/self.txt', 'updated');
    markSelfSaved('/tmp/self.txt', 5000);

    const onFileChanged = vi.fn();
    const onFileDeleted = vi.fn();

    handleDiskEvent('/tmp/self.txt', { onFileChanged, onFileDeleted }, 5200);

    expect(onFileChanged).not.toHaveBeenCalled();
    expect(onFileDeleted).not.toHaveBeenCalled();
  });

  it('synchronizes watched file paths and closes removed watchers', () => {
    files.set('/tmp/one.txt', '1');
    files.set('/tmp/two.txt', '2');
    const callbacks = { onFileChanged: vi.fn(), onFileDeleted: vi.fn() };

    syncWatchedFiles(['/tmp/one.txt', '/tmp/two.txt'], callbacks);
    expect(getWatchedFilePaths()).toEqual(['/tmp/one.txt', '/tmp/two.txt']);

    syncWatchedFiles(['/tmp/two.txt'], callbacks);
    expect(getWatchedFilePaths()).toEqual(['/tmp/two.txt']);
    expect(closedWatchers).toContain('/tmp/one.txt');
  });

  describe('encodings (CR-09)', () => {
    it('reports the encoding the changed file was decoded with', () => {
      files.set('/tmp/bom.txt', Buffer.from([0xef, 0xbb, 0xbf, 0x68, 0x69]));
      const onFileChanged = vi.fn();
      handleDiskEvent('/tmp/bom.txt', { onFileChanged, onFileDeleted: vi.fn() });
      expect(onFileChanged).toHaveBeenCalledWith({
        filePath: '/tmp/bom.txt',
        content: 'hi',
        eol: 'LF',
        encoding: 'utf-8-bom',
      });
    });

    it("decodes with the open tab's encoding while the bytes fit it", () => {
      vi.useFakeTimers();
      files.set('/tmp/latin.txt', Buffer.from('plain', 'latin1'));
      const callbacks = { onFileChanged: vi.fn(), onFileDeleted: vi.fn() };
      syncWatchedFiles([{ filePath: '/tmp/latin.txt', encoding: 'iso-8859-1' }], callbacks);

      files.set('/tmp/latin.txt', Buffer.from('still ascii', 'latin1'));
      watchListeners.get('/tmp/latin.txt')!('change');
      vi.advanceTimersByTime(100);
      expect(callbacks.onFileChanged).toHaveBeenLastCalledWith({
        filePath: '/tmp/latin.txt',
        content: 'still ascii',
        eol: 'LF',
        encoding: 'iso-8859-1',
      });

      // Without the tab's encoding the same ASCII bytes would be detected as UTF-8.
      syncWatchedFiles(['/tmp/latin.txt'], callbacks);
      watchListeners.get('/tmp/latin.txt')!('change');
      vi.advanceTimersByTime(100);
      expect(callbacks.onFileChanged).toHaveBeenLastCalledWith(
        expect.objectContaining({ encoding: 'utf-8' }),
      );
    });

    it('re-detects when the file on disk changed to a different encoding', () => {
      vi.useFakeTimers();
      files.set('/tmp/conv.txt', Buffer.from('x', 'utf-8'));
      const callbacks = { onFileChanged: vi.fn(), onFileDeleted: vi.fn() };
      syncWatchedFiles([{ filePath: '/tmp/conv.txt', encoding: 'utf-8' }], callbacks);

      files.set('/tmp/conv.txt', Buffer.from([0xff, 0xfe, 0x68, 0x00, 0x69, 0x00]));
      watchListeners.get('/tmp/conv.txt')!('change');
      vi.advanceTimersByTime(100);
      expect(callbacks.onFileChanged).toHaveBeenLastCalledWith({
        filePath: '/tmp/conv.txt',
        content: 'hi',
        eol: 'LF',
        encoding: 'utf-16le',
      });
    });
  });

  describe('atomic saves (CR-04)', () => {
    const watchCallsFor = (p: string) =>
      vi.mocked(fs.watch).mock.calls.filter(([watchedPath]) => watchedPath === p).length;

    it('re-creates the watcher after a rename so later changes are still detected', () => {
      vi.useFakeTimers();
      files.set('/tmp/atomic.txt', 'v1');
      const callbacks = { onFileChanged: vi.fn(), onFileDeleted: vi.fn() };
      syncWatchedFiles(['/tmp/atomic.txt'], callbacks);
      expect(watchCallsFor('/tmp/atomic.txt')).toBe(1);

      // Another tool writes a temp file and renames it over the original.
      files.set('/tmp/atomic.txt', 'v2');
      watchListeners.get('/tmp/atomic.txt')!('rename');
      vi.advanceTimersByTime(100);

      expect(closedWatchers).toContain('/tmp/atomic.txt');
      expect(watchCallsFor('/tmp/atomic.txt')).toBe(2);
      expect(getWatchedFilePaths()).toEqual(['/tmp/atomic.txt']);
      expect(callbacks.onFileChanged).toHaveBeenLastCalledWith({ filePath: '/tmp/atomic.txt', content: 'v2', eol: 'LF', encoding: 'utf-8' });

      // The new watcher keeps reporting changes.
      files.set('/tmp/atomic.txt', 'v3');
      watchListeners.get('/tmp/atomic.txt')!('change');
      vi.advanceTimersByTime(100);
      expect(callbacks.onFileChanged).toHaveBeenLastCalledWith({ filePath: '/tmp/atomic.txt', content: 'v3', eol: 'LF', encoding: 'utf-8' });
      expect(watchCallsFor('/tmp/atomic.txt')).toBe(2);
      expect(callbacks.onFileDeleted).not.toHaveBeenCalled();
    });

    it('does not report a deletion when the file reappears within the re-check window', () => {
      vi.useFakeTimers();
      files.set('/tmp/slow.txt', 'v1');
      const callbacks = { onFileChanged: vi.fn(), onFileDeleted: vi.fn() };
      syncWatchedFiles(['/tmp/slow.txt'], callbacks);

      files.delete('/tmp/slow.txt');
      watchListeners.get('/tmp/slow.txt')!('rename');
      vi.advanceTimersByTime(100);
      expect(callbacks.onFileDeleted).not.toHaveBeenCalled();

      files.set('/tmp/slow.txt', 'v2');
      vi.advanceTimersByTime(RENAME_RECHECK_MS);
      expect(callbacks.onFileDeleted).not.toHaveBeenCalled();
      expect(callbacks.onFileChanged).toHaveBeenCalledWith({ filePath: '/tmp/slow.txt', content: 'v2', eol: 'LF', encoding: 'utf-8' });
      expect(getWatchedFilePaths()).toEqual(['/tmp/slow.txt']);
    });

    it('reports deletion when the file stays missing, and refreshWatchedFile re-watches it after a save', () => {
      vi.useFakeTimers();
      files.set('/tmp/gone.txt', 'v1');
      const callbacks = { onFileChanged: vi.fn(), onFileDeleted: vi.fn() };
      syncWatchedFiles(['/tmp/gone.txt'], callbacks);

      files.delete('/tmp/gone.txt');
      watchListeners.get('/tmp/gone.txt')!('rename');
      vi.advanceTimersByTime(100 + RENAME_RECHECK_MS);
      expect(callbacks.onFileDeleted).toHaveBeenCalledWith('/tmp/gone.txt');
      expect(getWatchedFilePaths()).toEqual([]);

      // The user saves the tab again, recreating the file.
      files.set('/tmp/gone.txt', 'saved');
      refreshWatchedFile('/tmp/gone.txt');
      expect(getWatchedFilePaths()).toEqual(['/tmp/gone.txt']);
    });

    it('refreshWatchedFile ignores paths that are not open', () => {
      files.set('/tmp/other.txt', 'x');
      refreshWatchedFile('/tmp/other.txt');
      expect(getWatchedFilePaths()).toEqual([]);
    });

    it('ignores pending events for files closed before the debounce fires', () => {
      vi.useFakeTimers();
      files.set('/tmp/closed.txt', 'v1');
      const callbacks = { onFileChanged: vi.fn(), onFileDeleted: vi.fn() };
      syncWatchedFiles(['/tmp/closed.txt'], callbacks);

      files.set('/tmp/closed.txt', 'v2');
      watchListeners.get('/tmp/closed.txt')!('change');
      syncWatchedFiles([], callbacks);
      vi.advanceTimersByTime(1000);

      expect(callbacks.onFileChanged).not.toHaveBeenCalled();
    });

    it('emits onFileChanged with empty content for raster image files without decoding binary bytes', () => {
      files.set('/tmp/photo.png', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
      const onFileChanged = vi.fn();
      const onFileDeleted = vi.fn();

      handleDiskEvent('/tmp/photo.png', { onFileChanged, onFileDeleted });

      expect(onFileDeleted).not.toHaveBeenCalled();
      expect(onFileChanged).toHaveBeenCalledWith({
        filePath: '/tmp/photo.png',
        content: '',
        eol: 'LF',
        encoding: 'utf-8',
      });
    });
  });
});
