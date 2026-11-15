/**
 * Framework-agnostic pan & zoom for a single element (a rendered diagram image)
 * inside a clipping viewport. Zooming resizes the element instead of applying a
 * CSS scale, so SVG images stay crisp at every zoom level.
 */

export interface PanZoomState {
  scale: number;
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export const MIN_SCALE = 0.05;
export const MAX_SCALE = 16;
export const ZOOM_STEP = 1.25;

export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

export interface FitOptions {
  /** Upper bound for the fitted scale (1 = never enlarge beyond natural size). */
  maxScale?: number;
  padding?: number;
  /** Also fit (and vertically center) within the viewport height. */
  fitHeight?: boolean;
}

/** Scale and position that show the whole content centered in the viewport. */
export function fitContent(view: Size, content: Size, options: FitOptions = {}): PanZoomState {
  const { maxScale = 1, padding = 0, fitHeight = false } = options;
  if (content.width <= 0 || content.height <= 0) return { scale: 1, x: 0, y: 0 };
  const availW = Math.max(1, view.width - padding * 2);
  const availH = Math.max(1, view.height - padding * 2);
  let scale = Math.min(availW / content.width, maxScale);
  if (fitHeight) scale = Math.min(scale, availH / content.height);
  scale = clampScale(scale);
  return {
    scale,
    x: (view.width - content.width * scale) / 2,
    y: fitHeight ? (view.height - content.height * scale) / 2 : padding,
  };
}

/** Zooms by `factor` keeping the viewport point `point` fixed on screen. */
export function zoomAt(state: PanZoomState, factor: number, point: { x: number; y: number }): PanZoomState {
  const scale = clampScale(state.scale * factor);
  const ratio = scale / state.scale;
  return {
    scale,
    x: point.x - (point.x - state.x) * ratio,
    y: point.y - (point.y - state.y) * ratio,
  };
}

export function panBy(state: PanZoomState, dx: number, dy: number): PanZoomState {
  return { ...state, x: state.x + dx, y: state.y + dy };
}

export interface PanZoomOptions extends FitOptions {
  /** `always`: the wheel zooms. `modifier`: only Ctrl/Cmd + wheel zooms (plain wheel scrolls the page). */
  wheel: 'always' | 'modifier';
  /** Keep the viewport's height equal to the fitted content height (inline diagrams). */
  autoHeight?: boolean;
  /** Restores a previous user-adjusted view instead of fitting. */
  initial?: PanZoomState | null;
  /** Called after every change; `userAdjusted` is false right after a fit/reset. */
  onChange?: (state: PanZoomState, userAdjusted: boolean) => void;
}

export interface PanZoomController {
  zoomIn(): void;
  zoomOut(): void;
  /** Sets an absolute scale (1 = natural size) around the viewport center. */
  setScale(scale: number): void;
  /** Fits the content to the viewport and clears the user-adjusted flag. */
  reset(): void;
  /** New content size (e.g. a live-updated diagram); keeps the user's view if they adjusted it. */
  setContentSize(size: Size): void;
  getState(): PanZoomState;
  isUserAdjusted(): boolean;
  destroy(): void;
}

export function createPanZoom(
  viewport: HTMLElement,
  content: HTMLElement,
  contentSize: Size,
  options: PanZoomOptions,
): PanZoomController {
  let size = contentSize;
  let state: PanZoomState;
  let userAdjusted = false;
  let drag: { pointerId: number; x: number; y: number } | null = null;

  const viewSize = (): Size => ({ width: viewport.clientWidth, height: viewport.clientHeight });

  const apply = () => {
    content.style.position = 'absolute';
    content.style.left = '0';
    content.style.top = '0';
    content.style.maxWidth = 'none';
    content.style.width = `${size.width * state.scale}px`;
    content.style.height = `${size.height * state.scale}px`;
    content.style.transform = `translate(${state.x}px, ${state.y}px)`;
    options.onChange?.(state, userAdjusted);
  };

  const fit = () => {
    if (options.autoHeight) {
      const fitted = fitContent({ width: viewport.clientWidth, height: 0 }, size, options);
      viewport.style.height = `${Math.ceil(size.height * fitted.scale + (options.padding ?? 0) * 2)}px`;
    }
    state = fitContent(viewSize(), size, options);
    userAdjusted = false;
    apply();
  };

  const update = (next: PanZoomState) => {
    state = next;
    userAdjusted = true;
    apply();
  };

  const center = () => {
    const view = viewSize();
    return { x: view.width / 2, y: view.height / 2 };
  };

  if (options.initial) {
    fit();
    update(options.initial);
  } else {
    fit();
  }

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    if ((event.target as Element | null)?.closest?.('button')) return;
    drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY };
    viewport.setPointerCapture?.(event.pointerId);
    viewport.classList.add('is-panning');
    event.preventDefault();
  };
  const onPointerMove = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    drag.x = event.clientX;
    drag.y = event.clientY;
    if (dx !== 0 || dy !== 0) update(panBy(state, dx, dy));
  };
  const endDrag = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    drag = null;
    viewport.releasePointerCapture?.(event.pointerId);
    viewport.classList.remove('is-panning');
  };
  const onWheel = (event: WheelEvent) => {
    if (options.wheel === 'modifier' && !(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    const rect = viewport.getBoundingClientRect();
    const factor = Math.exp(-event.deltaY * 0.0015);
    update(zoomAt(state, factor, { x: event.clientX - rect.left, y: event.clientY - rect.top }));
  };
  const onDoubleClick = (event: MouseEvent) => {
    if ((event.target as Element | null)?.closest?.('button')) return;
    fit();
  };

  viewport.addEventListener('pointerdown', onPointerDown);
  viewport.addEventListener('pointermove', onPointerMove);
  viewport.addEventListener('pointerup', endDrag);
  viewport.addEventListener('pointercancel', endDrag);
  viewport.addEventListener('wheel', onWheel, { passive: false });
  viewport.addEventListener('dblclick', onDoubleClick);

  const resizeObserver =
    typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
          if (!userAdjusted) fit();
        })
      : null;
  resizeObserver?.observe(viewport);

  return {
    zoomIn: () => update(zoomAt(state, ZOOM_STEP, center())),
    zoomOut: () => update(zoomAt(state, 1 / ZOOM_STEP, center())),
    setScale: scale => update(zoomAt(state, scale / state.scale, center())),
    reset: fit,
    setContentSize(next) {
      size = next;
      if (userAdjusted) apply();
      else fit();
    },
    getState: () => state,
    isUserAdjusted: () => userAdjusted,
    destroy() {
      resizeObserver?.disconnect();
      viewport.removeEventListener('pointerdown', onPointerDown);
      viewport.removeEventListener('pointermove', onPointerMove);
      viewport.removeEventListener('pointerup', endDrag);
      viewport.removeEventListener('pointercancel', endDrag);
      viewport.removeEventListener('wheel', onWheel);
      viewport.removeEventListener('dblclick', onDoubleClick);
    },
  };
}

/** Resolves the natural size of a loaded (or loading) image; null if it fails or has no size. */
export function whenImageSized(img: HTMLImageElement): Promise<Size | null> {
  const read = () =>
    img.naturalWidth > 0 && img.naturalHeight > 0
      ? { width: img.naturalWidth, height: img.naturalHeight }
      : null;
  if (img.complete && img.naturalWidth > 0) return Promise.resolve(read());
  return new Promise(resolve => {
    img.addEventListener('load', () => resolve(read()), { once: true });
    img.addEventListener('error', () => resolve(null), { once: true });
  });
}
