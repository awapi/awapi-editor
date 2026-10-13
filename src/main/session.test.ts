import { describe, it, expect, vi, beforeEach } from 'vitest';

const files = new Map<string, string>();
const dirs = new Set<string>(['/mock-userdata', '/mock-docs']);

vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name === 'userData') return '/mock-userdata';
      if (name === 'documents') return '/mock-docs';
      return '/mock-userdata';
    },
  },
}));

vi.mock('path', () => ({
  join: (...parts: string[]) => parts.join('/').replace(/\/+/g, '/'),
}));

vi.mock('fs', () => ({
  existsSync: (p: string) => files.has(p) || dirs.has(p),
  readFileSync: (p: string) => {
    const content = files.get(p);
    if (content === undefined) throw new Error(`ENOENT: ${p}`);
    return content;
  },
  writeFileSync: (p: string, data: string) => {
    files.set(p, data);
  },
  mkdirSync: (p: string) => {
    dirs.add(p);
  },
  readdirSync: () => [],
  unlinkSync: (p: string) => {
    files.delete(p);
  },
  renameSync: (oldP: string, newP: string) => {
    const val = files.get(oldP);
    if (val !== undefined) {
      files.set(newP, val);
      files.delete(oldP);
    }
  },
}));

import {
  MAX_RECENT_FILES,
  loadAppSettings,
  saveAppSettings,
  getRecentFiles,
  addRecentFile,
  removeRecentFile,
  clearRecentFiles,
} from './session';

describe('session settings and recent files', () => {
  beforeEach(() => {
    files.clear();
    dirs.clear();
    dirs.add('/mock-userdata');
    dirs.add('/mock-docs');
  });

  it('starts with empty recent files by default', () => {
    expect(getRecentFiles()).toEqual([]);
  });

  it('adds recent files in most-recent-first order and deduplicates existing entries', () => {
    addRecentFile('/tmp/a.txt');
    addRecentFile('/tmp/b.txt');
    addRecentFile('/tmp/c.txt');
    expect(getRecentFiles()).toEqual(['/tmp/c.txt', '/tmp/b.txt', '/tmp/a.txt']);

    // Re-adding /tmp/a.txt moves it to the top without duplicating
    addRecentFile('/tmp/a.txt');
    expect(getRecentFiles()).toEqual(['/tmp/a.txt', '/tmp/c.txt', '/tmp/b.txt']);
  });

  it('caps recent files at MAX_RECENT_FILES', () => {
    for (let i = 1; i <= MAX_RECENT_FILES + 5; i++) {
      addRecentFile(`/tmp/file-${i}.txt`);
    }
    const recent = getRecentFiles();
    expect(recent.length).toBe(MAX_RECENT_FILES);
    expect(recent[0]).toBe(`/tmp/file-${MAX_RECENT_FILES + 5}.txt`);
    expect(recent[recent.length - 1]).toBe('/tmp/file-6.txt');
  });

  it('removes a single file from recent files', () => {
    addRecentFile('/tmp/a.txt');
    addRecentFile('/tmp/b.txt');
    removeRecentFile('/tmp/a.txt');
    expect(getRecentFiles()).toEqual(['/tmp/b.txt']);
  });

  it('clears all recent files', () => {
    addRecentFile('/tmp/a.txt');
    addRecentFile('/tmp/b.txt');
    clearRecentFiles();
    expect(getRecentFiles()).toEqual([]);
  });

  it('preserves recentFiles when saving other settings like theme or sessionDir', () => {
    addRecentFile('/tmp/keep-me.txt');
    saveAppSettings({ sessionDir: '/custom/dir', theme: 'light' });

    const loaded = loadAppSettings();
    expect(loaded.sessionDir).toBe('/custom/dir');
    expect(loaded.theme).toBe('light');
    expect(loaded.recentFiles).toEqual(['/tmp/keep-me.txt']);
  });
});
