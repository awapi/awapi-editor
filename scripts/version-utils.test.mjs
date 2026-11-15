import { describe, it, expect } from 'vitest';
import { bumpVersion, highestVersion, parseRemoteTags } from './version-utils.mjs';

describe('bumpVersion', () => {
  it('bumps the last digit and rolls each digit over after 9', () => {
    expect(bumpVersion('0.4.7')).toBe('0.4.8');
    expect(bumpVersion('0.4.9')).toBe('0.5.0');
    expect(bumpVersion('0.9.9')).toBe('1.0.0');
    expect(bumpVersion('v1.2.3')).toBe('1.2.4');
  });

  it('rejects invalid versions', () => {
    expect(() => bumpVersion('1.2')).toThrow('Invalid version');
  });
});

describe('highestVersion', () => {
  it('compares numerically, accepts v-prefixes, and ignores invalid entries', () => {
    expect(highestVersion(['0.4.7', 'v0.4.10', 'v0.4.9', 'nightly'])).toBe('0.4.10');
    expect(highestVersion(['garbage'])).toBeNull();
  });
});

describe('parseRemoteTags', () => {
  it('extracts release tags from git ls-remote output', () => {
    const output = [
      'abc\trefs/tags/v0.4.6',
      'def\trefs/tags/v0.4.7',
      'ghi\trefs/tags/v0.4.7^{}',
      'jkl\trefs/tags/experimental',
    ].join('\r\n');
    expect(parseRemoteTags(output)).toEqual(['v0.4.6', 'v0.4.7']);
  });
});
