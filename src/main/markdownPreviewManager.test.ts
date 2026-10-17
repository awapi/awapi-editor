import { describe, it, expect } from 'vitest';
import {
  createMarkdownPreviewManager,
  normalizeMarkdownPreviewData,
  isPreviewNearMainRightEdge,
  getDockedPreviewX,
  SNAP_THRESHOLD_PX,
} from './markdownPreviewManager';

describe('normalizeMarkdownPreviewData', () => {
  it('normalizes valid fields and preserves theme and mode', () => {
    expect(
      normalizeMarkdownPreviewData({
        title: 'README.md',
        filePath: '/repo/README.md',
        content: '# Hello',
        theme: 'light',
      }),
    ).toEqual({
      title: 'README.md',
      filePath: '/repo/README.md',
      content: '# Hello',
      theme: 'light',
    });

    expect(
      normalizeMarkdownPreviewData({
        title: 'index.htm',
        filePath: '/repo/index.htm',
        content: '<h1>Hello</h1>',
        theme: 'dark',
        mode: 'html',
      }),
    ).toEqual({
      title: 'index.htm',
      filePath: '/repo/index.htm',
      content: '<h1>Hello</h1>',
      theme: 'dark',
      mode: 'html',
    });

    expect(
      normalizeMarkdownPreviewData({
        title: 'sample.py',
        filePath: '/repo/sample.py',
        content: '',
        theme: 'dark',
        mode: 'unsupported',
      }),
    ).toEqual({
      title: 'sample.py',
      filePath: '/repo/sample.py',
      content: '',
      theme: 'dark',
      mode: 'unsupported',
    });
  });

  it('provides safe defaults for missing or invalid inputs', () => {
    expect(normalizeMarkdownPreviewData(null)).toEqual({
      title: 'Untitled',
      filePath: null,
      content: '',
    });
    expect(
      normalizeMarkdownPreviewData({
        title: '   ',
        filePath: '',
        content: 123,
        theme: 'invalid',
      }),
    ).toEqual({
      title: 'Untitled',
      filePath: null,
      content: '',
    });
  });
});

describe('createMarkdownPreviewManager', () => {
  it('stores and retrieves preview data and window id lifecycle', () => {
    const mgr = createMarkdownPreviewManager();
    expect(mgr.getData()).toBeNull();
    expect(mgr.getWindowId()).toBeNull();
    expect(mgr.isPreviewWindow(42)).toBe(false);

    const saved = mgr.setData({
      title: 'notes.md',
      filePath: '/tmp/notes.md',
      content: 'Hello **world**',
      theme: 'dark',
    });
    expect(saved.title).toBe('notes.md');
    expect(mgr.getData()).toEqual(saved);

    mgr.setWindowId(42);
    expect(mgr.getWindowId()).toBe(42);
    expect(mgr.isPreviewWindow(42)).toBe(true);
    expect(mgr.isPreviewWindow(99)).toBe(false);

    mgr.clear();
    expect(mgr.getWindowId()).toBeNull();
    expect(mgr.getData()).toBeNull();
  });

  it('detects when preview left edge is near main window right edge', () => {
    const mainRect = { x: 100, y: 100, width: 800, height: 600 }; // right edge = 900
    expect(
      isPreviewNearMainRightEdge(
        mainRect,
        { x: 900 + SNAP_THRESHOLD_PX - 2, y: 120, width: 600, height: 500 },
        SNAP_THRESHOLD_PX,
        'darwin',
      ),
    ).toBe(true);
    expect(
      isPreviewNearMainRightEdge(
        mainRect,
        { x: 900 - 10, y: 120, width: 600, height: 500 },
        SNAP_THRESHOLD_PX,
        'darwin',
      ),
    ).toBe(true);
    // Too far horizontally
    expect(
      isPreviewNearMainRightEdge(
        mainRect,
        { x: 900 + SNAP_THRESHOLD_PX + 15, y: 120, width: 600, height: 500 },
        SNAP_THRESHOLD_PX,
        'darwin',
      ),
    ).toBe(false);
    // No vertical overlap
    expect(
      isPreviewNearMainRightEdge(
        mainRect,
        { x: 900, y: 900, width: 600, height: 500 },
        SNAP_THRESHOLD_PX,
        'darwin',
      ),
    ).toBe(false);
  });

  it('sticks preview to main right edge, moves preview when main moves, and detaches when preview is dragged away', () => {
    const mgr = createMarkdownPreviewManager('darwin');
    const mainRect = { x: 100, y: 100, width: 800, height: 600 }; // right edge = 900

    // Initially undocked: moving main does nothing
    expect(mgr.isDocked()).toBe(false);
    expect(mgr.onMainBoundsChanged(mainRect)).toBeNull();

    // User drags preview close to main's right edge (x = 910, y = 140)
    const snapResult = mgr.onPreviewMoved(mainRect, { x: 910, y: 140, width: 700, height: 600 });
    expect(snapResult.docked).toBe(true);
    expect(snapResult.snapPosition).toEqual({ x: 904, y: 140 });
    expect(mgr.isDocked()).toBe(true);

    // Main window moves to (250, 180) -> preview follows maintaining +40px Y offset
    const followPos = mgr.onMainBoundsChanged({ x: 250, y: 180, width: 800, height: 600 });
    expect(followPos).toEqual({ x: 1054, y: 220 });

    // User drags preview independently far away (x = 1300, y = 220) -> undocks
    const detachResult = mgr.onPreviewMoved(
      { x: 250, y: 180, width: 800, height: 600 },
      { x: 1300, y: 220, width: 700, height: 600 },
    );
    expect(detachResult.docked).toBe(false);
    expect(detachResult.snapPosition).toBeNull();
    expect(mgr.isDocked()).toBe(false);

    // Moving main window no longer moves preview
    expect(mgr.onMainBoundsChanged({ x: 300, y: 200, width: 800, height: 600 })).toBeNull();
  });

  it('snaps preview Y to main top edge when within SNAP_THRESHOLD_PX vertically', () => {
    const mgr = createMarkdownPreviewManager('darwin');
    const mainRect = { x: 100, y: 100, width: 800, height: 600 };

    const res = mgr.onPreviewMoved(mainRect, { x: 905, y: 112, width: 700, height: 600 });
    expect(res.docked).toBe(true);
    expect(res.snapPosition).toEqual({ x: 904, y: 100 });
  });

  it('compensates for invisible Windows 10/11 resize frame borders on win32', () => {
    const mainRect = { x: 100, y: 100, width: 800, height: 600 }; // raw right = 900
    expect(getDockedPreviewX(mainRect, 'win32')).toBe(891);
    expect(getDockedPreviewX(mainRect, 'darwin')).toBe(904);

    const winMgr = createMarkdownPreviewManager('win32');
    expect(winMgr.dockToMain(mainRect)).toEqual({ x: 891, y: 100 });
  });
});
