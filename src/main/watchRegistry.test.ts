import { describe, it, expect } from 'vitest';
import { WatchRegistry, parseWatchEntries } from './watchRegistry';

describe('parseWatchEntries', () => {
  it('accepts plain paths and { filePath, encoding } objects', () => {
    expect(
      parseWatchEntries(['/a.txt', { filePath: '/b.txt', encoding: 'iso-8859-1' }, { filePath: '/c.txt' }]),
    ).toEqual([
      { filePath: '/a.txt' },
      { filePath: '/b.txt', encoding: 'iso-8859-1' },
      { filePath: '/c.txt' },
    ]);
  });

  it('drops invalid items and unknown encodings', () => {
    expect(parseWatchEntries('nope')).toEqual([]);
    expect(parseWatchEntries(null)).toEqual([]);
    expect(
      parseWatchEntries(['', 42, null, { filePath: '' }, { filePath: 7 }, { filePath: '/d.txt', encoding: 'koi8-r' }]),
    ).toEqual([{ filePath: '/d.txt' }]);
  });
});

describe('WatchRegistry (CR-11)', () => {
  it('unions the files of every window and routes each path to its owners', () => {
    const registry = new WatchRegistry();
    registry.set(1, [{ filePath: '/main.txt' }, { filePath: '/shared.txt', encoding: 'utf-8' }]);
    registry.set(2, [{ filePath: '/popout.txt' }, { filePath: '/shared.txt', encoding: 'iso-8859-1' }]);

    expect(registry.entries()).toEqual([
      { filePath: '/main.txt' },
      { filePath: '/shared.txt', encoding: 'utf-8' },
      { filePath: '/popout.txt' },
    ]);
    expect(registry.ownersOf('/main.txt')).toEqual([1]);
    expect(registry.ownersOf('/popout.txt')).toEqual([2]);
    expect(registry.ownersOf('/shared.txt')).toEqual([1, 2]);
    expect(registry.ownersOf('/other.txt')).toEqual([]);
  });

  it('fills in a missing encoding from a later window', () => {
    const registry = new WatchRegistry();
    registry.set(1, [{ filePath: '/f.txt' }]);
    registry.set(2, [{ filePath: '/f.txt', encoding: 'utf-16le' }]);
    expect(registry.entries()).toEqual([{ filePath: '/f.txt', encoding: 'utf-16le' }]);
  });

  it('replaces a window entry on set and forgets it on remove', () => {
    const registry = new WatchRegistry();
    registry.set(1, [{ filePath: '/a.txt' }]);
    registry.set(2, [{ filePath: '/b.txt' }]);
    expect(registry.has(2)).toBe(true);

    registry.set(1, [{ filePath: '/c.txt' }]);
    expect(registry.entries().map(e => e.filePath)).toEqual(['/c.txt', '/b.txt']);

    registry.remove(2);
    expect(registry.has(2)).toBe(false);
    expect(registry.ownersOf('/b.txt')).toEqual([]);

    registry.clear();
    expect(registry.entries()).toEqual([]);
  });
});
