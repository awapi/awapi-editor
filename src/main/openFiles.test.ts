import { describe, it, expect } from 'vitest';
import { readFilesForOpen, formatOpenFailures } from './openFiles';

describe('readFilesForOpen (CR-12)', () => {
  it('returns the readable files and collects failures instead of throwing', () => {
    const { files, failures } = readFilesForOpen(['/ok1.txt', '/locked.txt', '/ok2.txt', '/dir'], fp => {
      if (fp === '/locked.txt') throw new Error('EACCES: permission denied');
      if (fp === '/dir') throw 'EISDIR';
      return { filePath: fp };
    });

    expect(files).toEqual([{ filePath: '/ok1.txt' }, { filePath: '/ok2.txt' }]);
    expect(failures).toEqual([
      { filePath: '/locked.txt', error: 'EACCES: permission denied' },
      { filePath: '/dir', error: 'EISDIR' },
    ]);
  });

  it('returns no failures when every file is readable', () => {
    expect(readFilesForOpen(['/a'], fp => fp)).toEqual({ files: ['/a'], failures: [] });
  });
});

describe('formatOpenFailures', () => {
  it('names the file when a single file failed', () => {
    const { message, detail } = formatOpenFailures([{ filePath: '/tmp/secret.txt', error: 'EACCES' }]);
    expect(message).toBe('"secret.txt" could not be opened.');
    expect(detail).toBe('/tmp/secret.txt\n  EACCES');
    expect(formatOpenFailures([{ filePath: 'C:\\docs\\a.txt', error: 'E' }]).message).toBe('"a.txt" could not be opened.');
  });

  it('lists every failed file', () => {
    const { message, detail } = formatOpenFailures([
      { filePath: '/a.txt', error: 'E1' },
      { filePath: '/b.txt', error: 'E2' },
    ]);
    expect(message).toBe('2 files could not be opened.');
    expect(detail).toBe('/a.txt\n  E1\n\n/b.txt\n  E2');
  });
});
