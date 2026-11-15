import {
  formatDiagramWindowTitle,
  type DiagramOpenRequest,
  type DiagramRef,
  type DiagramSyncRequest,
  type DiagramWindowData,
} from '../shared/diagram';

/** One open diagram pop-out window, owned by the preview window it was opened from. */
export interface DiagramWindowEntry extends DiagramRef {
  /** webContents id of the owning Markdown preview window. */
  ownerId: number;
  data: DiagramWindowData;
}

export interface DiagramSyncResult {
  updates: Array<{ windowId: number; data: DiagramWindowData }>;
  /** Windows whose diagram no longer exists; already removed from the manager. */
  close: number[];
}

export function diagramWindowDataFromRequest(request: DiagramOpenRequest): DiagramWindowData {
  return {
    title: formatDiagramWindowTitle(request.title, request.index),
    theme: request.theme,
    svg: request.svg,
    error: request.error,
  };
}

/** Tracks diagram pop-out windows; contains no Electron calls so it is unit-testable. */
export function createDiagramWindowManager() {
  const entries = new Map<number, DiagramWindowEntry>();

  return {
    add(windowId: number, ownerId: number, request: DiagramOpenRequest): void {
      entries.set(windowId, {
        ownerId,
        docKey: request.docKey,
        index: request.index,
        data: diagramWindowDataFromRequest(request),
      });
    },

    remove(windowId: number): DiagramWindowEntry | undefined {
      const entry = entries.get(windowId);
      entries.delete(windowId);
      return entry;
    },

    getData(windowId: number): DiagramWindowData | null {
      return entries.get(windowId)?.data ?? null;
    },

    findWindowId(ownerId: number, docKey: string, index: number): number | null {
      for (const [id, entry] of entries) {
        if (entry.ownerId === ownerId && entry.docKey === docKey && entry.index === index) return id;
      }
      return null;
    },

    /** Replaces the content of an already-open pop-out (used when it is re-opened). */
    replace(windowId: number, request: DiagramOpenRequest): DiagramWindowData | null {
      const entry = entries.get(windowId);
      if (!entry) return null;
      entry.data = diagramWindowDataFromRequest(request);
      return entry.data;
    },

    getWindowIdsForOwner(ownerId: number): number[] {
      return [...entries].filter(([, e]) => e.ownerId === ownerId).map(([id]) => id);
    },

    getOpenRefs(ownerId: number): DiagramRef[] {
      return [...entries.values()]
        .filter(e => e.ownerId === ownerId)
        .map(({ docKey, index }) => ({ docKey, index }));
    },

    /** Applies a preview window's diagram sync to the pop-outs it owns. */
    applySync(ownerId: number, request: DiagramSyncRequest): DiagramSyncResult {
      const result: DiagramSyncResult = { updates: [], close: [] };
      for (const [windowId, entry] of entries) {
        if (entry.ownerId !== ownerId) continue;
        if (entry.docKey !== request.docKey || entry.index >= request.count) {
          entries.delete(windowId);
          result.close.push(windowId);
          continue;
        }
        const update = request.updates.find(u => u.index === entry.index);
        if (!update && entry.data.theme === request.theme) continue;
        entry.data = {
          ...entry.data,
          theme: request.theme,
          ...(update ? { svg: update.svg, error: update.error } : {}),
        };
        result.updates.push({ windowId, data: entry.data });
      }
      return result;
    },
  };
}

export type DiagramWindowManager = ReturnType<typeof createDiagramWindowManager>;
