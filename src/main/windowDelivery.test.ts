import { describe, it, expect, vi } from 'vitest';
import { ensureWindow, sendWhenLoaded, type DeliverableWindow } from './windowDelivery';

function createWindow({ loading = false, destroyed = false } = {}) {
  let finishLoad: (() => void) | undefined;
  const state = { loading, destroyed };
  const win = {
    isDestroyed: vi.fn(() => state.destroyed),
    webContents: {
      isLoading: vi.fn(() => state.loading),
      once: vi.fn((_event: 'did-finish-load', listener: () => void) => {
        finishLoad = listener;
      }),
      send: vi.fn(),
    },
  } satisfies DeliverableWindow;
  return {
    win,
    state,
    finishLoad: () => {
      state.loading = false;
      finishLoad?.();
    },
  };
}

describe('windowDelivery', () => {
  describe('ensureWindow', () => {
    it('reuses an open window', () => {
      const { win } = createWindow();
      const create = vi.fn();
      expect(ensureWindow(win, create)).toBe(win);
      expect(create).not.toHaveBeenCalled();
    });

    it('creates a window when there is none or it was destroyed (macOS, app still running)', () => {
      const fresh = createWindow().win;
      const create = vi.fn(() => fresh);
      expect(ensureWindow(null, create)).toBe(fresh);
      expect(ensureWindow(createWindow({ destroyed: true }).win, create)).toBe(fresh);
      expect(create).toHaveBeenCalledTimes(2);
    });
  });

  describe('sendWhenLoaded', () => {
    it('sends immediately when the page is loaded', () => {
      const { win } = createWindow();
      sendWhenLoaded(win, 'file:openFromArgs', '/tmp/a.txt');
      expect(win.webContents.send).toHaveBeenCalledWith('file:openFromArgs', '/tmp/a.txt');
      expect(win.webContents.once).not.toHaveBeenCalled();
    });

    it('waits for did-finish-load while a (new) window is still loading', () => {
      const { win, finishLoad } = createWindow({ loading: true });
      sendWhenLoaded(win, 'file:openFromArgs', '/tmp/a.txt');
      expect(win.webContents.send).not.toHaveBeenCalled();
      expect(win.webContents.once).toHaveBeenCalledWith('did-finish-load', expect.any(Function));

      finishLoad();
      expect(win.webContents.send).toHaveBeenCalledWith('file:openFromArgs', '/tmp/a.txt');
    });

    it('drops the message if the window is destroyed before it loads', () => {
      const { win, state, finishLoad } = createWindow({ loading: true });
      sendWhenLoaded(win, 'file:openFromArgs', '/tmp/a.txt');
      state.destroyed = true;
      finishLoad();
      expect(win.webContents.send).not.toHaveBeenCalled();
    });
  });
});
