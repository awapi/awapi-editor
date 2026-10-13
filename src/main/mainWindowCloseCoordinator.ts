/**
 * Coordinates closing the main window while pop-out windows hold unsaved edits.
 *
 * Pop-out tabs are not part of the persisted session, so the main window must
 * not tear them down silently. Instead each dirty pop-out runs its own
 * Save / Don't Save / Cancel prompt, one at a time. Once every dirty pop-out
 * has closed the main window close is retried; if the user cancels any prompt
 * the main window stays open.
 */
export interface MainWindowCloseCoordinatorDeps {
  /** Ids of pop-out windows that currently have unsaved changes. */
  dirtyPopoutIds: () => number[];
  /**
   * Ask pop-out `id` to close (focus it and trigger its close guard prompt).
   * Return false if the window no longer exists.
   */
  promptPopoutClose: (id: number) => boolean;
  /**
   * Retry closing the main window (or quitting) after all prompts resolved.
   * May be called synchronously from `requestMainClose`, so implementations
   * should defer the actual close (e.g. `setImmediate`).
   */
  finishMainClose: () => void;
}

export interface MainWindowCloseCoordinator {
  /** Call from the main window's `close` event. Returns true if the close must be prevented. */
  requestMainClose(): boolean;
  /** Call when a pop-out window has closed. */
  popoutClosed(id: number): void;
  /** Call when the user cancelled a pop-out's close prompt; aborts the pending main close if that pop-out is part of it. */
  popoutCloseCancelled(id: number): void;
  /** True while dirty pop-outs are being prompted on behalf of the main window. */
  isClosing(): boolean;
}

export function createMainWindowCloseCoordinator(deps: MainWindowCloseCoordinatorDeps): MainWindowCloseCoordinator {
  let queue: number[] | null = null;
  let current: number | null = null;

  function promptNext(): void {
    while (queue && queue.length > 0) {
      const next = queue.shift()!;
      if (deps.promptPopoutClose(next)) {
        current = next;
        return;
      }
    }
    queue = null;
    current = null;
    deps.finishMainClose();
  }

  return {
    requestMainClose() {
      if (queue) return true;
      const dirty = deps.dirtyPopoutIds();
      if (dirty.length === 0) return false;
      queue = [...dirty];
      promptNext();
      // promptNext may have finished synchronously (no pop-out left to prompt).
      return true;
    },
    popoutClosed(id) {
      if (!queue) return;
      if (id === current) {
        current = null;
        promptNext();
      } else {
        queue = queue.filter((queued) => queued !== id);
      }
    },
    popoutCloseCancelled(id) {
      if (!queue) return;
      if (id === current || queue.includes(id)) {
        queue = null;
        current = null;
      }
    },
    isClosing() {
      return queue !== null;
    },
  };
}
