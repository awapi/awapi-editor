import { describe, it, expect, vi, afterEach } from 'vitest';
import { MAX_SCALE, MIN_SCALE, createPanZoom, fitContent, panBy, zoomAt, type PanZoomController } from './panZoom';

describe('fitContent', () => {
  it('shrinks wide content to the viewport width without enlarging past maxScale', () => {
    expect(fitContent({ width: 400, height: 0 }, { width: 800, height: 200 })).toEqual({ scale: 0.5, x: 0, y: 0 });
    expect(fitContent({ width: 400, height: 0 }, { width: 100, height: 50 })).toEqual({ scale: 1, x: 150, y: 0 });
  });

  it('fits both dimensions and centers when fitHeight is set', () => {
    expect(
      fitContent({ width: 1000, height: 500 }, { width: 100, height: 100 }, { fitHeight: true, maxScale: 4, padding: 50 }),
    ).toEqual({ scale: 4, x: 300, y: 50 });
  });
});

describe('zoomAt & panBy', () => {
  it('keeps the zoom point fixed on screen', () => {
    const next = zoomAt({ scale: 1, x: 10, y: 20 }, 2, { x: 110, y: 70 });
    expect(next).toEqual({ scale: 2, x: -90, y: -30 });
    // Content point under (110,70) was (100,50) before and after zooming.
    expect((110 - next.x) / next.scale).toBe(100);
  });

  it('clamps the scale and pans by deltas', () => {
    expect(zoomAt({ scale: 1, x: 0, y: 0 }, 1000, { x: 0, y: 0 }).scale).toBe(MAX_SCALE);
    expect(zoomAt({ scale: 1, x: 0, y: 0 }, 0.0001, { x: 0, y: 0 }).scale).toBe(MIN_SCALE);
    expect(panBy({ scale: 2, x: 1, y: 2 }, 5, -5)).toEqual({ scale: 2, x: 6, y: -3 });
  });
});

describe('createPanZoom', () => {
  let controller: PanZoomController | null = null;
  afterEach(() => controller?.destroy());

  function setup(wheel: 'always' | 'modifier', onChange = vi.fn()) {
    const viewport = document.createElement('div');
    Object.defineProperty(viewport, 'clientWidth', { value: 400 });
    Object.defineProperty(viewport, 'clientHeight', { value: 300 });
    viewport.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 300 }) as DOMRect;
    const img = document.createElement('img');
    viewport.appendChild(img);
    controller = createPanZoom(viewport, img, { width: 800, height: 600 }, { wheel, fitHeight: true, onChange });
    return { viewport, img, onChange };
  }

  it('sizes the image (not a CSS scale) and reports user adjustments', () => {
    const { img, onChange } = setup('always');
    expect(img.style.width).toBe('400px');
    expect(img.style.height).toBe('300px');
    expect(onChange).toHaveBeenLastCalledWith({ scale: 0.5, x: 0, y: 0 }, false);

    controller!.setScale(1);
    expect(img.style.width).toBe('800px');
    expect(img.style.transform).toBe('translate(-200px, -150px)');
    expect(controller!.isUserAdjusted()).toBe(true);

    controller!.reset();
    expect(controller!.getState()).toEqual({ scale: 0.5, x: 0, y: 0 });
    expect(controller!.isUserAdjusted()).toBe(false);
  });

  it('pans by dragging and only zooms with the wheel modifier when required', () => {
    const { viewport } = setup('modifier');
    viewport.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, cancelable: true }));
    expect(controller!.getState().scale).toBe(0.5);
    const zoomEvent = new WheelEvent('wheel', { deltaY: -100, ctrlKey: true, cancelable: true });
    viewport.dispatchEvent(zoomEvent);
    expect(zoomEvent.defaultPrevented).toBe(true);
    expect(controller!.getState().scale).toBeGreaterThan(0.5);

    controller!.reset();
    const pointer = (type: string, x: number, y: number) =>
      Object.assign(new MouseEvent(type, { clientX: x, clientY: y, button: 0, bubbles: true }), { pointerId: 1 });
    viewport.dispatchEvent(pointer('pointerdown', 10, 10));
    viewport.dispatchEvent(pointer('pointermove', 40, 30));
    viewport.dispatchEvent(pointer('pointerup', 40, 30));
    viewport.dispatchEvent(pointer('pointermove', 90, 90));
    expect(controller!.getState()).toEqual({ scale: 0.5, x: 30, y: 20 });
  });

  it('keeps an adjusted view when the content size changes, refits otherwise', () => {
    setup('always');
    controller!.setContentSize({ width: 400, height: 300 });
    expect(controller!.getState().scale).toBe(1);
    controller!.zoomIn();
    const adjusted = controller!.getState();
    controller!.setContentSize({ width: 1600, height: 1200 });
    expect(controller!.getState()).toEqual(adjusted);
  });
});
