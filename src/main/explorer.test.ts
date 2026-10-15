import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

interface MockDirent {
  name: string;
  isDirectory: () => boolean;
  isSymbolicLink: () => boolean;
}

const mockDirs = new Map<string, MockDirent[]>();
const mockFiles = new Set<string>();
const symlinkTargetIsDir = new Map<string, boolean>();
const watchListeners = new Map<string, () => void>();
const closedWatchers: string[] = [];
const removedPaths: string[] = [];

vi.mock('path', () => ({
  basename: (p: string) => {
    const trimmed = p.replace(/[\\/]+$/, '');
    const parts = trimmed.split(/[\\/]/);
    return parts[parts.length - 1] || p;
  },
  join: (...parts: string[]) => parts.join('/').replace(/\/+/g, '/'),
}));

vi.mock('fs', () => ({
  existsSync: (p: string) => mockDirs.has(p) || mockFiles.has(p),
  readdirSync: (p: string) => {
    const entries = mockDirs.get(p);
    if (!entries) throw new Error(`ENOENT: no such directory '${p}'`);
    return entries;
  },
  statSync: (p: string) => {
    if (!symlinkTargetIsDir.has(p)) throw new Error(`ENOENT: '${p}'`);
    return { isDirectory: () => Boolean(symlinkTargetIsDir.get(p)) };
  },
  rmSync: vi.fn((p: string) => {
    removedPaths.push(p);
    mockDirs.delete(p);
    mockFiles.delete(p);
  }),
  writeFileSync: vi.fn((p: string) => {
    mockFiles.add(p);
  }),
  mkdirSync: vi.fn((p: string) => {
    mockDirs.set(p, []);
  }),
  watch: vi.fn((p: string, listener: () => void) => {
    watchListeners.set(p, listener);
    return {
      close: () => {
        closedWatchers.push(p);
      },
      on: vi.fn(),
    };
  }),
}));

import {
  DIR_WATCH_DEBOUNCE_MS,
  sortExplorerEntries,
  listDirectoryEntries,
  deleteExplorerPath,
  createExplorerFile,
  createExplorerFolder,
  syncWatchedDirs,
  clearAllWatchedDirs,
  getWatchedDirPaths,
} from './explorer';

function dirent(name: string, kind: 'file' | 'dir' | 'symlink' = 'file'): MockDirent {
  return {
    name,
    isDirectory: () => kind === 'dir',
    isSymbolicLink: () => kind === 'symlink',
  };
}

describe('explorer (main)', () => {
  beforeEach(() => {
    mockDirs.clear();
    mockFiles.clear();
    symlinkTargetIsDir.clear();
    watchListeners.clear();
    closedWatchers.length = 0;
    removedPaths.length = 0;
    clearAllWatchedDirs();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sorts directories before files and orders names case-insensitively', () => {
    const sorted = sortExplorerEntries([
      { name: 'zebra.ts', path: '/repo/zebra.ts', isDirectory: false },
      { name: 'src', path: '/repo/src', isDirectory: true },
      { name: 'README.md', path: '/repo/README.md', isDirectory: false },
      { name: '.github', path: '/repo/.github', isDirectory: true },
      { name: 'app.tsx', path: '/repo/app.tsx', isDirectory: false },
    ]);

    expect(sorted.map(e => e.name)).toEqual([
      '.github',
      'src',
      'app.tsx',
      'README.md',
      'zebra.ts',
    ]);
  });

  it('lists directory entries and resolves symlinks gracefully', () => {
    mockDirs.set('/workspace', [
      dirent('package.json', 'file'),
      dirent('src', 'dir'),
      dirent('linked-dir', 'symlink'),
      dirent('broken-link', 'symlink'),
    ]);
    symlinkTargetIsDir.set('/workspace/linked-dir', true);
    symlinkTargetIsDir.set('/workspace\\linked-dir', true);

    const res = listDirectoryEntries('/workspace');
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    expect(res.name).toBe('workspace');
    expect(res.entries.map(e => ({ name: e.name, isDirectory: e.isDirectory }))).toEqual([
      { name: 'linked-dir', isDirectory: true },
      { name: 'src', isDirectory: true },
      { name: 'broken-link', isDirectory: false },
      { name: 'package.json', isDirectory: false },
    ]);
  });

  it('returns an error result when the directory path is invalid or missing', () => {
    expect(listDirectoryEntries('')).toEqual({
      ok: false,
      error: 'Invalid directory path.',
    });

    const missing = listDirectoryEntries('/does-not-exist');
    expect(missing.ok).toBe(false);
  });

  it('watches expanded directories, debounces events, and closes removed watchers', () => {
    vi.useFakeTimers();
    mockDirs.set('/workspace', []);
    mockDirs.set('/workspace/src', []);
    const onDirChanged = vi.fn();

    syncWatchedDirs(['/workspace', '/workspace/src'], onDirChanged);
    expect(getWatchedDirPaths()).toEqual(['/workspace', '/workspace/src']);

    // Trigger rapid filesystem events in /workspace/src
    const trigger = watchListeners.get('/workspace/src');
    expect(trigger).toBeDefined();
    trigger!();
    trigger!();

    expect(onDirChanged).not.toHaveBeenCalled();
    vi.advanceTimersByTime(DIR_WATCH_DEBOUNCE_MS + 10);
    expect(onDirChanged).toHaveBeenCalledTimes(1);
    expect(onDirChanged).toHaveBeenCalledWith('/workspace/src');

    // Collapse /workspace/src so only /workspace remains watched
    syncWatchedDirs(['/workspace'], onDirChanged);
    expect(getWatchedDirPaths()).toEqual(['/workspace']);
    expect(closedWatchers).toContain('/workspace/src');
  });

  it('deletes existing files and directories or returns an error when missing', () => {
    expect(deleteExplorerPath('')).toEqual({ ok: false, error: 'Invalid path.' });
    expect(deleteExplorerPath('/missing')).toEqual({
      ok: false,
      error: 'File or folder no longer exists on disk.',
    });

    mockFiles.add('/workspace/old.txt');
    expect(deleteExplorerPath('/workspace/old.txt')).toEqual({ ok: true });
    expect(removedPaths).toContain('/workspace/old.txt');
    expect(mockFiles.has('/workspace/old.txt')).toBe(false);
  });

  it('creates new files and folders with validation and collision checks', () => {
    expect(createExplorerFile('', 'test.ts')).toEqual({
      ok: false,
      error: 'Invalid directory path.',
    });
    expect(createExplorerFile('/workspace', '   ')).toEqual({
      ok: false,
      error: 'Name cannot be empty.',
    });
    expect(createExplorerFile('/workspace', 'sub/file.ts')).toEqual({
      ok: false,
      error: 'Name cannot contain path separators.',
    });

    const createdFile = createExplorerFile('/workspace', 'notes.md');
    expect(createdFile).toEqual({ ok: true, path: '/workspace/notes.md' });
    expect(mockFiles.has('/workspace/notes.md')).toBe(true);

    // Duplicate file name is rejected
    expect(createExplorerFile('/workspace', 'notes.md')).toEqual({
      ok: false,
      error: 'A file or folder with that name already exists.',
    });

    const createdFolder = createExplorerFolder('/workspace', 'components');
    expect(createdFolder).toEqual({ ok: true, path: '/workspace/components' });
    expect(mockDirs.has('/workspace/components')).toBe(true);

    // Duplicate folder name is rejected
    expect(createExplorerFolder('/workspace', 'components')).toEqual({
      ok: false,
      error: 'A file or folder with that name already exists.',
    });
  });
});
