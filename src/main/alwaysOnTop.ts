export interface AlwaysOnTopTarget {
  id: number;
  isAlwaysOnTop: () => boolean;
  setAlwaysOnTop: (flag: boolean) => void;
  isDestroyed?: () => boolean;
  webContents?: {
    send: (channel: string, ...args: unknown[]) => void;
  };
}

/**
 * Returns whether the given window is currently pinned Always on Top
 * (false for a missing or destroyed window).
 */
export function isWindowAlwaysOnTop(win: AlwaysOnTopTarget | null | undefined): boolean {
  if (!win || win.isDestroyed?.()) return false;
  return Boolean(win.isAlwaysOnTop());
}

/**
 * Sets the Always on Top state on `win` and notifies its renderer via
 * `'window:alwaysOnTopChanged'`.
 */
export function setWindowAlwaysOnTop(win: AlwaysOnTopTarget, flag: boolean): boolean {
  const next = Boolean(flag);
  win.setAlwaysOnTop(next);
  win.webContents?.send('window:alwaysOnTopChanged', next);
  return next;
}

/**
 * Toggles the Always on Top state on `win` and notifies its renderer.
 */
export function toggleWindowAlwaysOnTop(win: AlwaysOnTopTarget): boolean {
  const next = !win.isAlwaysOnTop();
  return setWindowAlwaysOnTop(win, next);
}

/** Id of the application menu's `View → Always on Top` checkbox. */
export const ALWAYS_ON_TOP_MENU_ID = 'view-always-on-top';

export interface CheckableMenu {
  getMenuItemById: (id: string) => { checked: boolean } | null;
}

/**
 * Updates the application menu's Always on Top checkbox to reflect `win`
 * (normally the focused window). On macOS the application menu is shared by
 * every window, so it must follow focus instead of always showing the main window.
 */
export function syncAlwaysOnTopMenuItem(
  menu: CheckableMenu | null | undefined,
  win: AlwaysOnTopTarget | null | undefined,
): void {
  const item = menu?.getMenuItemById(ALWAYS_ON_TOP_MENU_ID);
  if (item) item.checked = isWindowAlwaysOnTop(win);
}

/**
 * Picks the window whose state the application menu's Always on Top checkbox
 * shows. On macOS the application menu is shared, so it follows the focused
 * window. Elsewhere pop-outs have their own menu bar and the application menu
 * belongs to the main window.
 */
export function appMenuAlwaysOnTopWindow<T>(isMac: boolean, focused: T | null | undefined, main: T | null | undefined): T | null {
  return (isMac ? focused ?? main : main) ?? null;
}
