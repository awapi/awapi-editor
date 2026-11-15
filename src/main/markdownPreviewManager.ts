/**
 * State, lifecycle, and magnetic-docking coordinator for the live Markdown
 * Preview popup windows.
 *
 * Every editor tab can have its own preview window. The editor window pushes a
 * tab's `{ tabId, title, filePath, content, theme }` payload on open and on
 * edits; each preview window pulls its own snapshot on mount (`getData()`) and
 * receives subsequent live updates via `'markdown:previewUpdate'`.
 *
 * Magnetic / sticky docking:
 * - When the preview window's left edge comes within `SNAP_THRESHOLD_PX` of the
 *   main window's right edge (with vertical overlap), the preview docks to the
 *   right edge of the main window. Docking state is tracked per preview window.
 * - While docked, moving or resizing the main window moves the preview window
 *   along with it (maintaining its vertical offset relative to the main window).
 * - Moving the preview window independently never moves the main window; if the
 *   user drags the preview away from the main window's right edge, it undocks
 *   and moves freely.
 */

export interface WindowRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Distance in pixels within which the preview's left edge snaps/sticks to the main window's right edge. */
export const SNAP_THRESHOLD_PX = 24;

/**
 * Windows 10/11 includes an invisible ~7px resize border on both the left and
 * right outer bounds of standard framed windows, which creates a ~14px visual
 * gap when placing two windows at `x = mainRect.x + mainRect.width`.
 * Overlapping by `-9px` on `win32` leaves a comfortable ~5px visual gap between
 * the two windows' visible borders.
 */
export function getDockHorizontalOverlapPx(platform: NodeJS.Platform = process.platform): number {
  return platform === 'win32' ? -9 : 4;
}

/**
 * Computes the target X coordinate for the preview window when docked to the
 * right edge of `mainRect`.
 */
export function getDockedPreviewX(
  mainRect: WindowRect,
  platform: NodeJS.Platform = process.platform,
): number {
  return mainRect.x + mainRect.width + getDockHorizontalOverlapPx(platform);
}

/**
 * Returns true when `previewRect`'s left edge is within `threshold` pixels of
 * `mainRect`'s right edge (accounting for OS frame overlap) and the two windows
 * overlap vertically.
 */
export function isPreviewNearMainRightEdge(
  mainRect: WindowRect,
  previewRect: WindowRect,
  threshold = SNAP_THRESHOLD_PX,
  platform: NodeJS.Platform = process.platform,
): boolean {
  const targetX = getDockedPreviewX(mainRect, platform);
  const rawMainRight = mainRect.x + mainRect.width;
  const horizontalGap = Math.min(
    Math.abs(previewRect.x - targetX),
    Math.abs(previewRect.x - rawMainRight),
  );
  if (horizontalGap > threshold) return false;

  const mainBottom = mainRect.y + mainRect.height;
  const previewBottom = previewRect.y + previewRect.height;
  const verticalOverlap = Math.min(mainBottom, previewBottom) - Math.max(mainRect.y, previewRect.y);
  return verticalOverlap > -threshold;
}

export interface MarkdownPreviewData {
  title: string;
  filePath: string | null;
  content: string;
  theme?: 'light' | 'dark';
  mode?: 'markdown' | 'html' | 'unsupported';
}

export function normalizeMarkdownPreviewData(raw: unknown): MarkdownPreviewData {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const title = typeof obj.title === 'string' && obj.title.trim() ? obj.title : 'Untitled';
  const filePath = typeof obj.filePath === 'string' && obj.filePath.trim() ? obj.filePath : null;
  const content = typeof obj.content === 'string' ? obj.content : '';
  const theme = obj.theme === 'light' || obj.theme === 'dark' ? obj.theme : undefined;
  const mode =
    obj.mode === 'html' || obj.mode === 'markdown' || obj.mode === 'unsupported'
      ? obj.mode
      : undefined;
  return {
    title,
    filePath,
    content,
    ...(theme ? { theme } : {}),
    ...(mode ? { mode } : {}),
  };
}

/**
 * Extracts the editor tab id a preview payload belongs to. Each tab gets its
 * own preview window; payloads without a usable id share a single fallback key.
 */
export function normalizePreviewTabId(raw: unknown): string {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return typeof obj.tabId === 'string' && obj.tabId.trim() ? obj.tabId : 'default';
}

/** Offset in pixels applied to each additional preview window so they do not stack exactly. */
export const CASCADE_OFFSET_PX = 28;

/** Position for a new preview window cascaded down-right from `rect`. */
export function getCascadedPosition(rect: Pick<WindowRect, 'x' | 'y'>): { x: number; y: number } {
  return { x: rect.x + CASCADE_OFFSET_PX, y: rect.y + CASCADE_OFFSET_PX };
}

export interface MarkdownPreviewEntry {
  windowId: number;
  /** webContents id of the editor window (main or pop-out) that owns the previewed tab. */
  ownerId: number;
  tabId: string;
  data: MarkdownPreviewData;
}

export interface MarkdownPreviewManager {
  /** Register a newly created preview window for `ownerId`'s tab and store its initial payload. */
  add: (windowId: number, ownerId: number, tabId: string, raw: unknown) => MarkdownPreviewData;
  /** Preview window id showing `ownerId`'s tab `tabId`, or null. */
  findWindowId: (ownerId: number, tabId: string) => number | null;
  /** Store a new payload for an open preview; returns null when that tab has no preview. */
  updateData: (ownerId: number, tabId: string, raw: unknown) => { windowId: number; data: MarkdownPreviewData } | null;
  /** Latest payload for the given preview window. */
  getData: (windowId: number) => MarkdownPreviewData | null;
  /** Registered entry for the given preview window. */
  getEntry: (windowId: number) => MarkdownPreviewEntry | null;
  /** True when `winId` is one of the open preview windows. */
  isPreviewWindow: (winId: number) => boolean;
  /** Ids of all open preview windows, in creation order. */
  getWindowIds: () => number[];
  /** Tab ids of `ownerId` that currently have a preview open. */
  getOpenTabIds: (ownerId: number) => string[];
  /** Forget a preview window (after it closes); returns the removed entry. */
  remove: (winId: number) => MarkdownPreviewEntry | null;
  /** Forget all preview windows. */
  clear: () => void;

  /** True when the preview window is magnetically attached to the main window's right edge. */
  isDocked: (winId: number) => boolean;
  /** True when any preview window is docked. */
  hasDockedPreview: () => boolean;
  /**
   * Explicitly dock the preview window to `mainRect`'s right edge, returning
   * the `{ x, y }` position where the preview should be placed.
   */
  dockToMain: (
    winId: number,
    mainRect: WindowRect,
    previewRect?: Pick<WindowRect, 'y'>,
  ) => { x: number; y: number };
  /**
   * Called when a preview window is moved by the user. Docks it when within
   * `SNAP_THRESHOLD_PX` of `mainRect`'s right edge, otherwise undocks it.
   */
  onPreviewMoved: (
    winId: number,
    mainRect: WindowRect,
    previewRect: WindowRect,
  ) => { docked: boolean; snapPosition: { x: number; y: number } | null };
  /**
   * Called when the main window moves or resizes. Returns the new positions
   * for every docked preview so they follow the main window.
   */
  onMainBoundsChanged: (mainRect: WindowRect) => Array<{ windowId: number; x: number; y: number }>;
}

interface DockState {
  docked: boolean;
  offsetY: number;
}

export function createMarkdownPreviewManager(
  platform: NodeJS.Platform = process.platform,
): MarkdownPreviewManager {
  const entries = new Map<number, MarkdownPreviewEntry>();
  const dockStates = new Map<number, DockState>();

  const getDock = (winId: number): DockState => {
    let state = dockStates.get(winId);
    if (!state) {
      state = { docked: false, offsetY: 0 };
      dockStates.set(winId, state);
    }
    return state;
  };

  const findEntry = (ownerId: number, tabId: string): MarkdownPreviewEntry | null => {
    for (const entry of entries.values()) {
      if (entry.ownerId === ownerId && entry.tabId === tabId) return entry;
    }
    return null;
  };

  return {
    add(windowId, ownerId, tabId, raw) {
      const data = normalizeMarkdownPreviewData(raw);
      entries.set(windowId, { windowId, ownerId, tabId, data });
      return data;
    },
    findWindowId(ownerId, tabId) {
      return findEntry(ownerId, tabId)?.windowId ?? null;
    },
    updateData(ownerId, tabId, raw) {
      const entry = findEntry(ownerId, tabId);
      if (!entry) return null;
      entry.data = normalizeMarkdownPreviewData(raw);
      return { windowId: entry.windowId, data: entry.data };
    },
    getData(windowId) {
      return entries.get(windowId)?.data ?? null;
    },
    getEntry(windowId) {
      return entries.get(windowId) ?? null;
    },
    isPreviewWindow(winId) {
      return entries.has(winId);
    },
    getWindowIds() {
      return [...entries.keys()];
    },
    getOpenTabIds(ownerId) {
      return [...entries.values()].filter(e => e.ownerId === ownerId).map(e => e.tabId);
    },
    remove(winId) {
      const entry = entries.get(winId) ?? null;
      entries.delete(winId);
      dockStates.delete(winId);
      return entry;
    },
    clear() {
      entries.clear();
      dockStates.clear();
    },
    isDocked(winId) {
      return dockStates.get(winId)?.docked ?? false;
    },
    hasDockedPreview() {
      for (const [winId, state] of dockStates) {
        if (state.docked && entries.has(winId)) return true;
      }
      return false;
    },
    dockToMain(winId, mainRect, previewRect) {
      const state = getDock(winId);
      state.docked = true;
      state.offsetY = previewRect ? previewRect.y - mainRect.y : 0;
      return {
        x: getDockedPreviewX(mainRect, platform),
        y: mainRect.y + state.offsetY,
      };
    },
    onPreviewMoved(winId, mainRect, previewRect) {
      const state = getDock(winId);
      if (isPreviewNearMainRightEdge(mainRect, previewRect, SNAP_THRESHOLD_PX, platform)) {
        state.docked = true;
        // Also snap Y to align top edges if within threshold
        const topDiff = Math.abs(previewRect.y - mainRect.y);
        const snappedY = topDiff <= SNAP_THRESHOLD_PX ? mainRect.y : previewRect.y;
        state.offsetY = snappedY - mainRect.y;
        return {
          docked: true,
          snapPosition: { x: getDockedPreviewX(mainRect, platform), y: snappedY },
        };
      }
      state.docked = false;
      state.offsetY = 0;
      return { docked: false, snapPosition: null };
    },
    onMainBoundsChanged(mainRect) {
      const positions: Array<{ windowId: number; x: number; y: number }> = [];
      for (const [windowId, state] of dockStates) {
        if (!state.docked || !entries.has(windowId)) continue;
        positions.push({
          windowId,
          x: getDockedPreviewX(mainRect, platform),
          y: mainRect.y + state.offsetY,
        });
      }
      return positions;
    },
  };
}