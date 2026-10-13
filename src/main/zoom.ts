import type { WebContents } from 'electron';

export const ZOOM_STEP = 0.5;
export const MIN_ZOOM_LEVEL = -9;
export const MAX_ZOOM_LEVEL = 9;

// Per-webContents zoom level (keyed by webContents.id) so each window zooms independently.
const zoomLevels = new Map<number, number>();

export function adjustZoom(wc: Pick<WebContents, 'id' | 'setZoomLevel'>, delta: number): number {
  const current = zoomLevels.get(wc.id) ?? 0;
  // Round to avoid floating-point drift across repeated fractional steps.
  const rawNext = Math.round((current + delta) * 100) / 100;
  const next = Math.max(MIN_ZOOM_LEVEL, Math.min(MAX_ZOOM_LEVEL, rawNext));
  zoomLevels.set(wc.id, next);
  wc.setZoomLevel(next);
  return next;
}

export function resetZoom(wc: Pick<WebContents, 'id' | 'setZoomLevel'>): void {
  zoomLevels.set(wc.id, 0);
  wc.setZoomLevel(0);
}

export function clearZoomState(wcId: number): void {
  zoomLevels.delete(wcId);
}

export function getZoomLevel(wcId: number): number {
  return zoomLevels.get(wcId) ?? 0;
}
