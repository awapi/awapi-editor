import { describe, it, expect, vi } from 'vitest';
import {
  isWindowAlwaysOnTop,
  setWindowAlwaysOnTop,
  toggleWindowAlwaysOnTop,
  syncAlwaysOnTopMenuItem,
  appMenuAlwaysOnTopWindow,
  ALWAYS_ON_TOP_MENU_ID,
  type AlwaysOnTopTarget,
} from './alwaysOnTop';

function createMockWindow(id = 1, initial = false): AlwaysOnTopTarget & { sendSpy: ReturnType<typeof vi.fn> } {
  let pinned = initial;
  const sendSpy = vi.fn();
  return {
    id,
    isAlwaysOnTop: vi.fn(() => pinned),
    setAlwaysOnTop: vi.fn((flag: boolean) => {
      pinned = flag;
    }),
    webContents: {
      send: sendSpy,
    },
    sendSpy,
  };
}

describe('alwaysOnTop', () => {
  it('returns false for null/undefined window and reads state from a valid window', () => {
    expect(isWindowAlwaysOnTop(null)).toBe(false);
    expect(isWindowAlwaysOnTop(undefined)).toBe(false);

    const win = createMockWindow(1, true);
    expect(isWindowAlwaysOnTop(win)).toBe(true);
  });

  it('sets always-on-top explicitly and notifies webContents', () => {
    const win = createMockWindow(1, false);

    expect(setWindowAlwaysOnTop(win, true)).toBe(true);
    expect(win.setAlwaysOnTop).toHaveBeenCalledWith(true);
    expect(win.sendSpy).toHaveBeenCalledWith('window:alwaysOnTopChanged', true);
    expect(isWindowAlwaysOnTop(win)).toBe(true);

    expect(setWindowAlwaysOnTop(win, false)).toBe(false);
    expect(win.setAlwaysOnTop).toHaveBeenCalledWith(false);
    expect(win.sendSpy).toHaveBeenCalledWith('window:alwaysOnTopChanged', false);
    expect(isWindowAlwaysOnTop(win)).toBe(false);
  });

  it('toggles always-on-top state and returns the new state', () => {
    const win = createMockWindow(1, false);

    expect(toggleWindowAlwaysOnTop(win)).toBe(true);
    expect(isWindowAlwaysOnTop(win)).toBe(true);
    expect(win.sendSpy).toHaveBeenLastCalledWith('window:alwaysOnTopChanged', true);

    expect(toggleWindowAlwaysOnTop(win)).toBe(false);
    expect(isWindowAlwaysOnTop(win)).toBe(false);
    expect(win.sendSpy).toHaveBeenLastCalledWith('window:alwaysOnTopChanged', false);
  });

  it('treats a destroyed window as not pinned', () => {
    const win = { ...createMockWindow(1, true), isDestroyed: () => true };
    expect(isWindowAlwaysOnTop(win)).toBe(false);
    expect(win.isAlwaysOnTop).not.toHaveBeenCalled();
  });

  describe('syncAlwaysOnTopMenuItem (CR-15)', () => {
    function createMenu() {
      const item = { checked: false };
      const getMenuItemById = vi.fn((id: string) => (id === ALWAYS_ON_TOP_MENU_ID ? item : null));
      return { item, menu: { getMenuItemById } };
    }

    it('follows the state of the given (focused) window', () => {
      const { item, menu } = createMenu();
      const main = createMockWindow(1, false);
      const popout = createMockWindow(2, true);

      syncAlwaysOnTopMenuItem(menu, popout);
      expect(item.checked).toBe(true);

      syncAlwaysOnTopMenuItem(menu, main);
      expect(item.checked).toBe(false);
      expect(menu.getMenuItemById).toHaveBeenCalledWith(ALWAYS_ON_TOP_MENU_ID);
    });

    it('unchecks the item when no window is given', () => {
      const { item, menu } = createMenu();
      item.checked = true;
      syncAlwaysOnTopMenuItem(menu, null);
      expect(item.checked).toBe(false);
    });

    it('ignores a missing menu or menu item', () => {
      expect(() => syncAlwaysOnTopMenuItem(null, createMockWindow())).not.toThrow();
      expect(() => syncAlwaysOnTopMenuItem({ getMenuItemById: () => null }, createMockWindow())).not.toThrow();
    });
  });

  describe('appMenuAlwaysOnTopWindow (CR-15)', () => {
    const main = createMockWindow(1);
    const popout = createMockWindow(2);

    it('follows the focused window on macOS, falling back to the main window', () => {
      expect(appMenuAlwaysOnTopWindow(true, popout, main)).toBe(popout);
      expect(appMenuAlwaysOnTopWindow(true, null, main)).toBe(main);
    });

    it('always uses the main window elsewhere (pop-outs have their own menu bar)', () => {
      expect(appMenuAlwaysOnTopWindow(false, popout, main)).toBe(main);
      expect(appMenuAlwaysOnTopWindow(false, null, null)).toBeNull();
    });
  });
});
