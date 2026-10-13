import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ZOOM_STEP,
  MIN_ZOOM_LEVEL,
  MAX_ZOOM_LEVEL,
  adjustZoom,
  resetZoom,
  clearZoomState,
  getZoomLevel,
} from './zoom';

function createMockWebContents(id = 1) {
  return {
    id,
    setZoomLevel: vi.fn(),
  };
}

describe('zoom', () => {
  beforeEach(() => {
    clearZoomState(1);
    clearZoomState(2);
  });

  it('uses a 0.5 zoom step (~10% per press)', () => {
    expect(ZOOM_STEP).toBe(0.5);
  });

  it('increments and decrements zoom level by the given delta', () => {
    const wc = createMockWebContents(1);

    expect(adjustZoom(wc, ZOOM_STEP)).toBe(0.5);
    expect(wc.setZoomLevel).toHaveBeenLastCalledWith(0.5);

    expect(adjustZoom(wc, ZOOM_STEP)).toBe(1);
    expect(wc.setZoomLevel).toHaveBeenLastCalledWith(1);

    expect(adjustZoom(wc, -ZOOM_STEP)).toBe(0.5);
    expect(wc.setZoomLevel).toHaveBeenLastCalledWith(0.5);
  });

  it('clamps zoom level within [MIN_ZOOM_LEVEL, MAX_ZOOM_LEVEL]', () => {
    const wc = createMockWebContents(1);

    expect(adjustZoom(wc, 100)).toBe(MAX_ZOOM_LEVEL);
    expect(wc.setZoomLevel).toHaveBeenLastCalledWith(MAX_ZOOM_LEVEL);

    expect(adjustZoom(wc, -100)).toBe(MIN_ZOOM_LEVEL);
    expect(wc.setZoomLevel).toHaveBeenLastCalledWith(MIN_ZOOM_LEVEL);
  });

  it('tracks zoom levels independently per webContents id', () => {
    const wc1 = createMockWebContents(1);
    const wc2 = createMockWebContents(2);

    adjustZoom(wc1, ZOOM_STEP);
    adjustZoom(wc2, -ZOOM_STEP);

    expect(getZoomLevel(1)).toBe(0.5);
    expect(getZoomLevel(2)).toBe(-0.5);
  });

  it('resets zoom level to 0', () => {
    const wc = createMockWebContents(1);

    adjustZoom(wc, ZOOM_STEP * 3);
    expect(getZoomLevel(1)).toBe(1.5);

    resetZoom(wc);
    expect(getZoomLevel(1)).toBe(0);
    expect(wc.setZoomLevel).toHaveBeenLastCalledWith(0);
  });

  it('clears stored zoom state for a closed window', () => {
    const wc = createMockWebContents(1);

    adjustZoom(wc, ZOOM_STEP * 2);
    clearZoomState(1);

    expect(getZoomLevel(1)).toBe(0);
  });
});
