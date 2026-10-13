import { describe, it, expect } from 'vitest';
import { parseReadFileOptions } from './readFileOptions';

describe('parseReadFileOptions', () => {
  it('defaults to auto-detect and no recent-file tracking', () => {
    expect(parseReadFileOptions(undefined)).toEqual({ trackRecent: false });
    expect(parseReadFileOptions(null)).toEqual({ trackRecent: false });
    expect(parseReadFileOptions({})).toEqual({ encoding: undefined, trackRecent: false });
  });

  it('accepts a bare encoding string for backward compatibility', () => {
    expect(parseReadFileOptions('utf-16le')).toEqual({ encoding: 'utf-16le', trackRecent: false });
  });

  it('reads encoding and trackRecent from an options object', () => {
    expect(parseReadFileOptions({ encoding: 'iso-8859-1', trackRecent: true })).toEqual({
      encoding: 'iso-8859-1',
      trackRecent: true,
    });
  });

  it('ignores invalid values', () => {
    expect(parseReadFileOptions('latin-9')).toEqual({ trackRecent: false });
    expect(parseReadFileOptions({ encoding: 'bogus', trackRecent: 'yes' })).toEqual({
      encoding: undefined,
      trackRecent: false,
    });
    expect(parseReadFileOptions(42)).toEqual({ trackRecent: false });
  });
});
