import { describe, it, expect, vi } from 'vitest';

// `updater.ts` imports from 'electron' at the top level. When running under
// vitest (plain Node) that module has no usable exports, so stub it out.
vi.mock('electron', () => ({
  app: { getVersion: () => '0.0.0' },
  dialog: { showMessageBox: vi.fn() },
  shell: { openExternal: vi.fn() },
  BrowserWindow: class {},
}));

import { isNewerVersion } from './updater';

describe('isNewerVersion', () => {
  it('returns true when latest patch is higher', () => {
    expect(isNewerVersion('0.2.4', '0.2.3')).toBe(true);
  });

  it('returns true when latest minor is higher', () => {
    expect(isNewerVersion('0.3.0', '0.2.9')).toBe(true);
  });

  it('returns true when latest major is higher', () => {
    expect(isNewerVersion('1.0.0', '0.99.99')).toBe(true);
  });

  it('strips a leading "v" from the tag', () => {
    expect(isNewerVersion('v0.2.4', '0.2.3')).toBe(true);
    expect(isNewerVersion('V1.0.0', '0.9.0')).toBe(true);
  });

  it('returns false when versions are equal', () => {
    expect(isNewerVersion('0.2.3', '0.2.3')).toBe(false);
    expect(isNewerVersion('v0.2.3', '0.2.3')).toBe(false);
  });

  it('returns false when current is newer', () => {
    expect(isNewerVersion('0.2.2', '0.2.3')).toBe(false);
    expect(isNewerVersion('0.1.9', '0.2.0')).toBe(false);
  });

  it('treats missing segments as 0', () => {
    expect(isNewerVersion('1', '0.9.9')).toBe(true);
    expect(isNewerVersion('0.2', '0.2.0')).toBe(false);
    expect(isNewerVersion('0.2.0.1', '0.2.0')).toBe(true);
  });

  it('ignores pre-release suffixes in the tag', () => {
    expect(isNewerVersion('0.3.0-beta.1', '0.2.9')).toBe(true);
    expect(isNewerVersion('0.2.3-rc.1', '0.2.3')).toBe(false);
  });

  it('handles malformed input without throwing', () => {
    expect(() => isNewerVersion('abc', '0.2.3')).not.toThrow();
    expect(isNewerVersion('abc', '0.2.3')).toBe(false);
    expect(isNewerVersion('0.2.3', 'abc')).toBe(true);
  });
});
