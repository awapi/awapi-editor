/**
 * State, lifecycle, and magnetic-docking coordinator for the live Markdown
 * Preview popup window.
 *
 * The editor window pushes the active Markdown tab's `{ title, filePath, content, theme }`
 * payload on open and on edits/tab switches. The preview window pulls the latest
 * snapshot on mount (`getData()`) and receives subsequent live updates via
 * `'markdown:previewUpdate'`.
 *
 * Magnetic / sticky docking:
 * - When the preview window's left edge comes within `SNAP_THRESHOLD_PX` of the
 *   main window's right edge (with vertical overlap), the preview docks to the
 *   right edge of the main window.
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

export interface MarkdownPreviewManager {
  /** Store the latest preview payload and return the normalized data. */
  setData: (raw: unknown) => MarkdownPreviewData;
  /** Return the latest stored preview payload (or null if none yet). */
  getData: () => MarkdownPreviewData | null;
  /** Record the currently open preview BrowserWindow id. */
  setWindowId: (winId: number | null) => void;
  /** Get the currently open preview BrowserWindow id (or null if closed). */
  getWindowId: () => number | null;
  /** True when `winId` is the active Markdown preview window. */
  isPreviewWindow: (winId: number) => boolean;
  /** Reset stored window id, docking state, and data when the preview window or app closes. */
  clear: () => void;

  /** True when the preview window is currently magnetically attached to the main window's right edge. */
  isDocked: () => boolean;
  /**
   * Explicitly dock the preview window to `mainRect`'s right edge, returning
   * the `{ x, y }` position where the preview should be placed.
   */
  dockToMain: (mainRect: WindowRect, previewRect?: Pick<WindowRect, 'y'>) => { x: number; y: number };
  /**
   * Called when the preview window is moved by the user. Evaluates whether the
   * preview is within `SNAP_THRESHOLD_PX` of `mainRect`'s right edge:
   * - If close enough, docks and returns `{ docked: true, snapPosition: { x, y } }`.
   * - If moved away, undocks and returns `{ docked: false, snapPosition: null }`.
   */
  onPreviewMoved: (
    mainRect: WindowRect,
    previewRect: WindowRect,
  ) => { docked: boolean; snapPosition: { x: number; y: number } | null };
  /**
   * Called when the main window moves or resizes. If the preview is currently
   * docked, returns the new `{ x, y }` for the preview window so it follows
   * the main window; otherwise returns `null`.
   */
  onMainBoundsChanged: (mainRect: WindowRect) => { x: number; y: number } | null;
}

export function createMarkdownPreviewManager(
  platform: NodeJS.Platform = process.platform,
): MarkdownPreviewManager {
  let latestData: MarkdownPreviewData | null = null;
  let previewWindowId: number | null = null;
  let docked = false;
  let offsetY = 0;

  return {
    setData(raw: unknown): MarkdownPreviewData {
      latestData = normalizeMarkdownPreviewData(raw);
      return latestData;
    },
    getData(): MarkdownPreviewData | null {
      return latestData;
    },
    setWindowId(winId: number | null): void {
      previewWindowId = winId;
      if (winId === null) {
        docked = false;
        offsetY = 0;
      }
    },
    getWindowId(): number | null {
      return previewWindowId;
    },
    isPreviewWindow(winId: number): boolean {
      return previewWindowId !== null && previewWindowId === winId;
    },
    clear(): void {
      previewWindowId = null;
      latestData = null;
      docked = false;
      offsetY = 0;
    },
    isDocked(): boolean {
      return docked;
    },
    dockToMain(mainRect: WindowRect, previewRect?: Pick<WindowRect, 'y'>): { x: number; y: number } {
      docked = true;
      offsetY = previewRect ? previewRect.y - mainRect.y : 0;
      return {
        x: getDockedPreviewX(mainRect, platform),
        y: mainRect.y + offsetY,
      };
    },
    onPreviewMoved(
      mainRect: WindowRect,
      previewRect: WindowRect,
    ): { docked: boolean; snapPosition: { x: number; y: number } | null } {
      if (isPreviewNearMainRightEdge(mainRect, previewRect, SNAP_THRESHOLD_PX, platform)) {
        docked = true;
        // Also snap Y to align top edges if within threshold
        const topDiff = Math.abs(previewRect.y - mainRect.y);
        const snappedY = topDiff <= SNAP_THRESHOLD_PX ? mainRect.y : previewRect.y;
        offsetY = snappedY - mainRect.y;
        return {
          docked: true,
          snapPosition: {
            x: getDockedPreviewX(mainRect, platform),
            y: snappedY,
          },
        };
      }
      docked = false;
      offsetY = 0;
      return { docked: false, snapPosition: null };
    },
    onMainBoundsChanged(mainRect: WindowRect): { x: number; y: number } | null {
      if (!docked) return null;
      return {
        x: getDockedPreviewX(mainRect, platform),
        y: mainRect.y + offsetY,
      };
    },
  };
}
