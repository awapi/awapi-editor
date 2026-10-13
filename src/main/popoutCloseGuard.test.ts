import { describe, it, expect } from 'vitest';
import { createPopoutCloseGuard } from './popoutCloseGuard';

describe('createPopoutCloseGuard', () => {
  it('allows closing clean windows', () => {
    const guard = createPopoutCloseGuard();
    expect(guard.shouldPreventClose(1, false)).toBe(false);
    guard.setDirty(1, false);
    expect(guard.shouldPreventClose(1, false)).toBe(false);
  });

  it('prevents closing dirty windows until the close is approved', () => {
    const guard = createPopoutCloseGuard();
    guard.setDirty(1, true);
    expect(guard.shouldPreventClose(1, false)).toBe(true);
    guard.approveClose(1);
    expect(guard.shouldPreventClose(1, false)).toBe(false);
  });

  it('stops guarding once the window is clean again', () => {
    const guard = createPopoutCloseGuard();
    guard.setDirty(1, true);
    guard.setDirty(1, false);
    expect(guard.shouldPreventClose(1, false)).toBe(false);
  });

  it('never blocks a window whose renderer is unavailable', () => {
    const guard = createPopoutCloseGuard();
    guard.setDirty(1, true);
    expect(guard.shouldPreventClose(1, true)).toBe(false);
  });

  it('tracks windows independently and forgets closed ones', () => {
    const guard = createPopoutCloseGuard();
    guard.setDirty(1, true);
    guard.setDirty(2, true);
    guard.approveClose(1);
    expect(guard.shouldPreventClose(1, false)).toBe(false);
    expect(guard.shouldPreventClose(2, false)).toBe(true);

    guard.forget(1);
    guard.setDirty(1, true);
    // Approval does not survive a forget (window ids may be reused).
    expect(guard.shouldPreventClose(1, false)).toBe(true);
  });
});
