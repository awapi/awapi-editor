/**
 * Renders Mermaid diagrams for the Markdown preview without ever running Mermaid
 * in the preview window's privileged document (which has `window.electronAPI`).
 *
 * Security model:
 * - Mermaid runs inside a hidden `<iframe sandbox="allow-scripts">`. The frame has an
 *   opaque origin, no preload bridge, no popups/top navigation, and a CSP that blocks
 *   every network request.
 * - Mermaid itself runs with `securityLevel: 'strict'` (labels are sanitized and
 *   click/script interactions are disabled; `%%{init}%%` directives cannot change it).
 * - Only an SVG string is sent back, and it is displayed through an `<img>` data URL.
 *   Images never execute scripts, handle events, or load external resources.
 * - Messages are accepted only from the expected window and with the expected shape.
 */

import { createPanZoom, whenImageSized, type PanZoomController, type PanZoomState } from './panZoom';

export type MermaidTheme = 'light' | 'dark';

export type MermaidRenderResult =
  | { ok: true; svg: string }
  | { ok: false; error: string; retryable?: boolean };

export interface MermaidRenderer {
  render(code: string, theme: MermaidTheme): Promise<MermaidRenderResult>;
  dispose(): void;
}

export const MERMAID_SANDBOX_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:";

export const MERMAID_MESSAGE = {
  init: 'awapi-mermaid-init',
  ready: 'awapi-mermaid-ready',
  render: 'awapi-mermaid-render',
  result: 'awapi-mermaid-result',
} as const;

const RENDER_TIMEOUT_MS = 15000;
const LOAD_TIMEOUT_MS = 20000;
const MAX_CACHE_ENTRIES = 64;

/**
 * Runs inside the sandbox. Mermaid's source arrives via postMessage and is injected
 * as a DOM-created script, so it is never parsed as part of an HTML document.
 * Renders are serialized because `mermaid.render` is not safe to run concurrently.
 */
const SANDBOX_SCRIPT = `(function(){
  var queue = Promise.resolve();
  function post(msg){ parent.postMessage(msg, '*'); }
  function normalizeSvg(svg){
    // <template> content is inert: nothing in the SVG is fetched or executed while parsing.
    var holder = document.createElement('template');
    holder.innerHTML = svg;
    var el = holder.content.querySelector('svg');
    if (!el) throw new Error('Mermaid produced no SVG output');
    var vb = (el.getAttribute('viewBox') || '').trim().split(/[\\s,]+/).map(Number);
    if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) {
      el.setAttribute('width', String(Math.ceil(vb[2])));
      el.setAttribute('height', String(Math.ceil(vb[3])));
      el.style.removeProperty('max-width');
    }
    return new XMLSerializer().serializeToString(el);
  }
  function render(id, code, theme){
    try {
      window.mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: theme, suppressErrorRendering: true });
    } catch (e) {}
    return Promise.resolve()
      .then(function(){ return window.mermaid.render('awapi-mermaid-' + id, code); })
      .then(function(out){ post({ type: '${MERMAID_MESSAGE.result}', id: id, svg: normalizeSvg(out.svg) }); })
      .catch(function(err){
        post({ type: '${MERMAID_MESSAGE.result}', id: id, error: String((err && err.message) || err || 'Unknown error') });
      });
  }
  window.addEventListener('message', function(e){
    if (e.source !== parent) return;
    var d = e.data;
    if (!d || typeof d !== 'object') return;
    if (d.type === '${MERMAID_MESSAGE.init}' && typeof d.source === 'string') {
      if (!window.mermaid) {
        var s = document.createElement('script');
        s.textContent = d.source;
        document.head.appendChild(s);
      }
      post({ type: '${MERMAID_MESSAGE.ready}', ok: !!(window.mermaid && window.mermaid.render) });
    } else if (d.type === '${MERMAID_MESSAGE.render}' && typeof d.id === 'number' && typeof d.code === 'string' && window.mermaid) {
      var theme = d.theme === 'dark' ? 'dark' : 'default';
      queue = queue.then(function(){ return render(d.id, d.code, theme); });
    }
  });
})();`;

export function buildMermaidSandboxHtml(): string {
  return (
    '<!DOCTYPE html><html><head><meta charset="utf-8">' +
    `<meta http-equiv="Content-Security-Policy" content="${MERMAID_SANDBOX_CSP}">` +
    `</head><body><script>${SANDBOX_SCRIPT}</script></body></html>`
  );
}

export function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Creates a renderer backed by a lazily created sandboxed iframe in `doc`.
 * `loadSource` supplies Mermaid's IIFE bundle source the first time it is needed.
 */
export function createMermaidRenderer(
  loadSource: () => Promise<string>,
  doc: Document = document,
): MermaidRenderer {
  let frame: HTMLIFrameElement | null = null;
  let readyPromise: Promise<void> | null = null;
  let rejectReady: ((err: Error) => void) | null = null;
  let messageListener: ((event: MessageEvent) => void) | null = null;
  let loadTimer: ReturnType<typeof setTimeout> | undefined;
  let nextId = 1;
  const pending = new Map<number, (result: MermaidRenderResult) => void>();
  const view = doc.defaultView ?? window;

  const teardown = (reason: string) => {
    clearTimeout(loadTimer);
    if (messageListener) view.removeEventListener('message', messageListener);
    messageListener = null;
    frame?.remove();
    frame = null;
    readyPromise = null;
    rejectReady?.(new Error(reason));
    rejectReady = null;
    const waiting = [...pending.values()];
    pending.clear();
    waiting.forEach(resolve => resolve({ ok: false, error: reason, retryable: true }));
  };

  const ensureReady = (): Promise<void> => {
    if (readyPromise) return readyPromise;
    readyPromise = new Promise<void>((resolve, reject) => {
      rejectReady = reject;
      const iframe = doc.createElement('iframe');
      iframe.setAttribute('sandbox', 'allow-scripts');
      iframe.setAttribute('aria-hidden', 'true');
      iframe.setAttribute('data-testid', 'mermaid-sandbox');
      iframe.title = 'Mermaid renderer';
      iframe.tabIndex = -1;
      // Laid out off-screen (not display:none) so Mermaid can measure text.
      Object.assign(iframe.style, {
        position: 'fixed',
        left: '-10000px',
        top: '0',
        width: '1200px',
        height: '900px',
        border: '0',
        visibility: 'hidden',
        pointerEvents: 'none',
      });

      loadTimer = setTimeout(() => teardown('Timed out loading Mermaid'), LOAD_TIMEOUT_MS);
      let loads = 0;
      iframe.addEventListener('load', () => {
        loads += 1;
        if (loads > 1) {
          // The sandbox must never navigate; discard it so no further diagrams reach it.
          teardown('Mermaid sandbox navigated unexpectedly');
          return;
        }
        loadSource().then(
          source => {
            if (frame === iframe) {
              iframe.contentWindow?.postMessage({ type: MERMAID_MESSAGE.init, source }, '*');
            }
          },
          err => teardown(`Could not load Mermaid: ${errorMessage(err)}`),
        );
      });

      messageListener = (event: MessageEvent) => {
        if (!frame || event.source !== frame.contentWindow) return;
        const data = event.data as Record<string, unknown> | null;
        if (!data || typeof data !== 'object') return;
        if (data.type === MERMAID_MESSAGE.ready) {
          clearTimeout(loadTimer);
          if (data.ok === true) {
            rejectReady = null;
            resolve();
          } else {
            teardown('Mermaid failed to initialize');
          }
        } else if (data.type === MERMAID_MESSAGE.result && typeof data.id === 'number') {
          const settle = pending.get(data.id);
          if (!settle) return;
          pending.delete(data.id);
          if (typeof data.svg === 'string') {
            settle({ ok: true, svg: data.svg });
          } else {
            settle({
              ok: false,
              error: typeof data.error === 'string' ? data.error : 'Unknown Mermaid error',
            });
          }
        }
      };
      view.addEventListener('message', messageListener);

      iframe.srcdoc = buildMermaidSandboxHtml();
      frame = iframe;
      doc.body.appendChild(iframe);
    });
    // Avoid unhandled rejections when teardown happens with no caller awaiting.
    readyPromise.catch(() => {});
    return readyPromise;
  };

  return {
    async render(code, theme) {
      try {
        await ensureReady();
      } catch (err) {
        return { ok: false, error: errorMessage(err), retryable: true };
      }
      const target = frame?.contentWindow;
      if (!target) return { ok: false, error: 'Mermaid renderer is unavailable', retryable: true };
      const id = nextId++;
      return new Promise<MermaidRenderResult>(resolve => {
        const timer = setTimeout(() => {
          if (pending.delete(id)) {
            resolve({ ok: false, error: 'Timed out rendering diagram', retryable: true });
          }
        }, RENDER_TIMEOUT_MS);
        pending.set(id, result => {
          clearTimeout(timer);
          resolve(result);
        });
        target.postMessage({ type: MERMAID_MESSAGE.render, id, code, theme }, '*');
      });
    },
    dispose() {
      teardown('Mermaid renderer disposed');
    },
  };
}

let defaultRenderer: MermaidRenderer | null = null;
const resultCache = new Map<string, MermaidRenderResult>();
const inFlight = new Map<string, Promise<MermaidRenderResult>>();

const cacheKey = (code: string, theme: MermaidTheme) => `${theme}\u0000${code}`;

export function getCachedMermaidResult(
  code: string,
  theme: MermaidTheme,
): MermaidRenderResult | undefined {
  return resultCache.get(cacheKey(code, theme));
}

/** Renders a diagram with the shared sandbox, caching results per source and theme. */
export function renderMermaidDiagram(
  code: string,
  theme: MermaidTheme,
): Promise<MermaidRenderResult> {
  const key = cacheKey(code, theme);
  const cached = resultCache.get(key);
  if (cached) return Promise.resolve(cached);
  const running = inFlight.get(key);
  if (running) return running;

  defaultRenderer ??= createMermaidRenderer(() =>
    import('./mermaidSource').then(mod => mod.default),
  );
  const promise = defaultRenderer.render(code, theme).then(result => {
    inFlight.delete(key);
    if (result.ok || !result.retryable) {
      resultCache.set(key, result);
      if (resultCache.size > MAX_CACHE_ENTRIES) {
        const oldest = resultCache.keys().next().value;
        if (oldest !== undefined) resultCache.delete(oldest);
      }
    }
    return result;
  });
  inFlight.set(key, promise);
  return promise;
}

/** Test hook: drops the shared renderer and cached results. */
export function resetMermaidRendererForTests(): void {
  defaultRenderer?.dispose();
  defaultRenderer = null;
  resultCache.clear();
  inFlight.clear();
}

/** Reads the diagram source of a `[data-mermaid-block]` element. */
export function getMermaidBlockSource(block: HTMLElement): string {
  return block.querySelector('code')?.textContent ?? '';
}

export interface MermaidBlockControls {
  /** Shows a "pop out" button that calls this. */
  onPopout?: () => void;
  /** Restores a previously adjusted zoom/pan (e.g. after the preview re-rendered). */
  initialView?: PanZoomState | null;
  /** Reports the user-adjusted view, or null once it is reset to fit. */
  onViewChange?: (view: PanZoomState | null) => void;
}

export interface MermaidBlockHandle {
  destroy(): void;
}

// Static, trusted icon markup (lucide-style strokes).
const ICON_PATHS = {
  zoomIn: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M11 8v6M8 11h6"/>',
  zoomOut: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5M8 11h6"/>',
  reset: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  popout: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
} as const;

function createToolbarButton(
  doc: Document,
  action: keyof typeof ICON_PATHS,
  label: string,
  onClick: () => void,
): HTMLButtonElement {
  const button = doc.createElement('button');
  button.type = 'button';
  button.className = 'awapi-mermaid-tool';
  button.title = label;
  button.setAttribute('aria-label', label);
  button.setAttribute('data-mermaid-action', action);
  button.innerHTML =
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
    `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON_PATHS[action]}</svg>`;
  button.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    onClick();
  });
  return button;
}

/**
 * Shows a render result inside a `[data-mermaid-block]` element. Successful renders
 * replace the source listing with an inert `<img>` that can be zoomed (Ctrl/Cmd +
 * wheel or toolbar), panned by dragging, and popped out; errors keep the source
 * visible. Passing `null` restores the plain source listing.
 */
export function applyMermaidResult(
  block: HTMLElement,
  result: MermaidRenderResult | null,
  controls: MermaidBlockControls = {},
): MermaidBlockHandle {
  const doc = block.ownerDocument;
  let pre: HTMLElement | null = null;
  for (const child of Array.from(block.children)) {
    if (child.classList.contains('awapi-mermaid-output')) child.remove();
    else if (child.tagName === 'PRE') pre = child as HTMLElement;
  }
  const noop: MermaidBlockHandle = { destroy() {} };

  if (!result) {
    if (pre) pre.hidden = false;
    block.removeAttribute('data-mermaid-state');
    return noop;
  }

  const output = doc.createElement('div');
  output.className = 'awapi-mermaid-output';
  if (!result.ok) {
    output.setAttribute('role', 'alert');
    output.textContent = `Mermaid error: ${result.error}`;
    if (pre) pre.hidden = false;
    block.setAttribute('data-mermaid-state', 'error');
    block.appendChild(output);
    return noop;
  }

  const viewport = doc.createElement('div');
  viewport.className = 'awapi-mermaid-viewport';
  const img = doc.createElement('img');
  img.src = svgToDataUrl(result.svg);
  img.alt = 'Mermaid diagram';
  img.draggable = false;
  viewport.appendChild(img);

  let controller: PanZoomController | null = null;
  let destroyed = false;
  const toolbar = doc.createElement('div');
  toolbar.className = 'awapi-mermaid-toolbar';
  toolbar.setAttribute('role', 'toolbar');
  toolbar.setAttribute('aria-label', 'Diagram controls');
  toolbar.append(
    createToolbarButton(doc, 'zoomOut', 'Zoom out', () => controller?.zoomOut()),
    createToolbarButton(doc, 'zoomIn', 'Zoom in', () => controller?.zoomIn()),
    createToolbarButton(doc, 'reset', 'Reset view', () => controller?.reset()),
  );
  if (controls.onPopout) {
    toolbar.append(createToolbarButton(doc, 'popout', 'Open diagram in a new window', controls.onPopout));
  }

  output.append(viewport, toolbar);
  if (pre) pre.hidden = true;
  block.setAttribute('data-mermaid-state', 'rendered');
  block.appendChild(output);

  void whenImageSized(img).then(size => {
    if (destroyed || !size) return;
    controller = createPanZoom(viewport, img, size, {
      wheel: 'modifier',
      autoHeight: true,
      maxScale: 1,
      initial: controls.initialView ?? null,
      onChange: (state, userAdjusted) => controls.onViewChange?.(userAdjusted ? state : null),
    });
  });

  return {
    destroy() {
      destroyed = true;
      controller?.destroy();
      controller = null;
    },
  };
}
