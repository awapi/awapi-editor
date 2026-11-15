import { describe, it, expect } from 'vitest';
import {
  createMarkdownPreviewManager,
  normalizeMarkdownPreviewData,
  normalizePreviewTabId,
  getCascadedPosition,
  CASCADE_OFFSET_PX,
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

describe('normalizePreviewTabId', () => {
  it('returns the tab id or a shared fallback', () => {
    expect(normalizePreviewTabId({ tabId: 'tab-1' })).toBe('tab-1');
    expect(normalizePreviewTabId({ tabId: '  ' })).toBe('default');
    expect(normalizePreviewTabId(null)).toBe('default');
  });
});

describe('getCascadedPosition', () => {
  it('offsets down-right from the given window', () => {
    expect(getCascadedPosition({ x: 100, y: 50 })).toEqual({
      x: 100 + CASCADE_OFFSET_PX,
      y: 50 + CASCADE_OFFSET_PX,
    });
  });
});

describe('createMarkdownPreviewManager', () => {
  it('tracks a separate preview window and payload per owner tab', () => {
    const mgr = createMarkdownPreviewManager();
    expect(mgr.getWindowIds()).toEqual([]);
    expect(mgr.isPreviewWindow(42)).toBe(false);

    mgr.add(42, 1, 'tab-a', { title: 'a.md', filePath: '/a.md', content: '# A' });
    mgr.add(43, 1, 'tab-b', { title: 'b.md', filePath: '/b.md', content: '# B' });
    mgr.add(44, 2, 'tab-a', { title: 'popout.md', filePath: null, content: '# P' });

    expect(mgr.getWindowIds()).toEqual([42, 43, 44]);
    expect(mgr.findWindowId(1, 'tab-a')).toBe(42);
    expect(mgr.findWindowId(1, 'tab-b')).toBe(43);
    expect(mgr.findWindowId(2, 'tab-a')).toBe(44);
    expect(mgr.findWindowId(1, 'tab-c')).toBeNull();
    expect(mgr.getOpenTabIds(1)).toEqual(['tab-a', 'tab-b']);
    expect(mgr.getOpenTabIds(2)).toEqual(['tab-a']);

    // Updating one tab's preview leaves the others' content untouched
    const updated = mgr.updateData(1, 'tab-b', { title: 'b.md', filePath: '/b.md', content: '# B2' });
    expect(updated).toEqual({
      windowId: 43,
      data: { title: 'b.md', filePath: '/b.md', content: '# B2' },
    });
    expect(mgr.getData(42)?.content).toBe('# A');
    expect(mgr.getData(43)?.content).toBe('# B2');
    expect(mgr.updateData(1, 'tab-c', { title: 'c.md', content: '' })).toBeNull();

    expect(mgr.remove(42)).toMatchObject({ windowId: 42, ownerId: 1, tabId: 'tab-a' });
    expect(mgr.isPreviewWindow(42)).toBe(false);
    expect(mgr.getOpenTabIds(1)).toEqual(['tab-b']);
    expect(mgr.remove(42)).toBeNull();

    mgr.clear();
    expect(mgr.getWindowIds()).toEqual([]);
    expect(mgr.getData(43)).toBeNull();
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
    mgr.add(7, 1, 'tab-a', {});
    const mainRect = { x: 100, y: 100, width: 800, height: 600 }; // right edge = 900

    // Initially undocked: moving main does nothing
    expect(mgr.isDocked(7)).toBe(false);
    expect(mgr.hasDockedPreview()).toBe(false);
    expect(mgr.onMainBoundsChanged(mainRect)).toEqual([]);

    // User drags preview close to main's right edge (x = 910, y = 140)
    const snapResult = mgr.onPreviewMoved(7, mainRect, { x: 910, y: 140, width: 700, height: 600 });
    expect(snapResult.docked).toBe(true);
    expect(snapResult.snapPosition).toEqual({ x: 904, y: 140 });
    expect(mgr.isDocked(7)).toBe(true);
    expect(mgr.hasDockedPreview()).toBe(true);

    // Main window moves to (250, 180) -> preview follows maintaining +40px Y offset
    const followPos = mgr.onMainBoundsChanged({ x: 250, y: 180, width: 800, height: 600 });
    expect(followPos).toEqual([{ windowId: 7, x: 1054, y: 220 }]);

    // User drags preview independently far away (x = 1300, y = 220) -> undocks
    const detachResult = mgr.onPreviewMoved(
      7,
      { x: 250, y: 180, width: 800, height: 600 },
      { x: 1300, y: 220, width: 700, height: 600 },
    );
    expect(detachResult.docked).toBe(false);
    expect(detachResult.snapPosition).toBeNull();
    expect(mgr.isDocked(7)).toBe(false);

    // Moving main window no longer moves preview
    expect(mgr.onMainBoundsChanged({ x: 300, y: 200, width: 800, height: 600 })).toEqual([]);
  });

  it('keeps docking state per preview window and drops it when a preview is removed', () => {
    const mgr = createMarkdownPreviewManager('darwin');
    const mainRect = { x: 100, y: 100, width: 800, height: 600 };
    mgr.add(1, 9, 'tab-a', {});
    mgr.add(2, 9, 'tab-b', {});

    mgr.dockToMain(1, mainRect, { y: 100 });
    expect(mgr.isDocked(1)).toBe(true);
    expect(mgr.isDocked(2)).toBe(false);
    expect(mgr.onMainBoundsChanged({ x: 0, y: 0, width: 800, height: 600 })).toEqual([
      { windowId: 1, x: 804, y: 0 },
    ]);

    mgr.remove(1);
    expect(mgr.hasDockedPreview()).toBe(false);
    expect(mgr.onMainBoundsChanged(mainRect)).toEqual([]);
  });

  it('snaps preview Y to main top edge when within SNAP_THRESHOLD_PX vertically', () => {
    const mgr = createMarkdownPreviewManager('darwin');
    mgr.add(7, 1, 'tab-a', {});
    const mainRect = { x: 100, y: 100, width: 800, height: 600 };

    const res = mgr.onPreviewMoved(7, mainRect, { x: 905, y: 112, width: 700, height: 600 });
    expect(res.docked).toBe(true);
    expect(res.snapPosition).toEqual({ x: 904, y: 100 });
  });

  it('compensates for invisible Windows 10/11 resize frame borders on win32', () => {
    const mainRect = { x: 100, y: 100, width: 800, height: 600 }; // raw right = 900
    expect(getDockedPreviewX(mainRect, 'win32')).toBe(891);
    expect(getDockedPreviewX(mainRect, 'darwin')).toBe(904);

    const winMgr = createMarkdownPreviewManager('win32');
    expect(winMgr.dockToMain(7, mainRect)).toEqual({ x: 891, y: 100 });
  });
});