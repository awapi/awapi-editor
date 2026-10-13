/**
 * Tracks which pop-out windows have unsaved changes so their `close` event can
 * be intercepted and the renderer asked to confirm (Save / Don't Save / Cancel).
 *
 * Windows are only guarded while their renderer reports a dirty tab, so a
 * window whose renderer never loaded (or crashed) can always be closed.
 */
export interface PopoutCloseGuard {
  /** Record the dirty state reported by a pop-out's renderer. */
  setDirty(windowId: number, dirty: boolean): void;
  /** Allow the next close of `windowId` without prompting (user confirmed, or tab moved). */
  approveClose(windowId: number): void;
  /**
   * Returns true when the close must be prevented and the renderer asked to
   * confirm. `rendererUnavailable` should be true if its webContents is
   * destroyed or crashed.
   */
  shouldPreventClose(windowId: number, rendererUnavailable: boolean): boolean;
  /** Drop all state for a window once it has closed. */
  forget(windowId: number): void;
}

export function createPopoutCloseGuard(): PopoutCloseGuard {
  const dirtyWindows = new Set<number>();
  const approvedWindows = new Set<number>();

  return {
    setDirty(windowId, dirty) {
      if (dirty) dirtyWindows.add(windowId);
      else dirtyWindows.delete(windowId);
    },
    approveClose(windowId) {
      approvedWindows.add(windowId);
    },
    shouldPreventClose(windowId, rendererUnavailable) {
      if (rendererUnavailable) return false;
      if (approvedWindows.has(windowId)) return false;
      return dirtyWindows.has(windowId);
    },
    forget(windowId) {
      dirtyWindows.delete(windowId);
      approvedWindows.delete(windowId);
    },
  };
}
