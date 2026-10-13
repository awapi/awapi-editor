/** The parts of a `BrowserWindow` needed to deliver a message to its renderer. */
export interface DeliverableWindow {
  isDestroyed: () => boolean;
  webContents: {
    isLoading: () => boolean;
    once: (event: 'did-finish-load', listener: () => void) => unknown;
    send: (channel: string, ...args: unknown[]) => void;
  };
}

/**
 * Returns `current` if it is still open, otherwise a window from `create()`.
 * On macOS the app keeps running after its last window closes, so a file
 * opened from Finder (or Open Recent) must bring the main window back.
 */
export function ensureWindow<T extends DeliverableWindow>(current: T | null | undefined, create: () => T): T {
  return current && !current.isDestroyed() ? current : create();
}

/**
 * Sends `channel` to the window's renderer, waiting for the page to finish
 * loading first if needed. Dropped if the window is destroyed in the meantime.
 */
export function sendWhenLoaded(win: DeliverableWindow, channel: string, ...args: unknown[]): void {
  const send = () => {
    if (!win.isDestroyed()) win.webContents.send(channel, ...args);
  };
  if (win.webContents.isLoading()) {
    win.webContents.once('did-finish-load', send);
  } else {
    send();
  }
}
