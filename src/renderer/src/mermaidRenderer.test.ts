import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  MERMAID_MESSAGE,
  MERMAID_SANDBOX_CSP,
  applyMermaidResult,
  buildMermaidSandboxHtml,
  createMermaidRenderer,
  svgToDataUrl,
  type MermaidRenderer,
} from './mermaidRenderer';

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

function getSandbox(): HTMLIFrameElement {
  const frame = document.querySelector<HTMLIFrameElement>('[data-testid="mermaid-sandbox"]');
  if (!frame) throw new Error('sandbox iframe not created');
  return frame;
}

function postFrom(source: Window | null, data: unknown) {
  window.dispatchEvent(new MessageEvent('message', { data, source }));
}

describe('buildMermaidSandboxHtml', () => {
  it('locks the sandbox down with a no-network CSP and strict Mermaid config', () => {
    const html = buildMermaidSandboxHtml();
    expect(MERMAID_SANDBOX_CSP).toContain("default-src 'none'");
    expect(MERMAID_SANDBOX_CSP).not.toContain('unsafe-eval');
    expect(html).toContain(`content="${MERMAID_SANDBOX_CSP}"`);
    expect(html).toContain("securityLevel: 'strict'");
    expect(html).toContain('e.source !== parent');
  });
});

describe('svgToDataUrl', () => {
  it('encodes SVG markup into an image data URL', () => {
    expect(svgToDataUrl('<svg a="1"/>')).toBe('data:image/svg+xml;charset=utf-8,%3Csvg%20a%3D%221%22%2F%3E');
  });
});

describe('applyMermaidResult', () => {
  function makeBlock(): HTMLElement {
    const block = document.createElement('div');
    block.innerHTML = '<pre><code>graph TD; A--&gt;B</code></pre>';
    return block;
  }

  it('shows a successful render as an inert image and hides the source', () => {
    const block = makeBlock();
    applyMermaidResult(block, { ok: true, svg: '<svg><script>alert(1)</script></svg>' });
    const img = block.querySelector('.awapi-mermaid-output img') as HTMLImageElement;
    expect(img.getAttribute('src')).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
    expect(block.querySelector('script')).toBeNull();
    expect(block.querySelector('pre')!.hidden).toBe(true);
    expect(block.getAttribute('data-mermaid-state')).toBe('rendered');
  });

  it('shows errors as text, keeps the source visible, and restores on null', () => {
    const block = makeBlock();
    applyMermaidResult(block, { ok: true, svg: '<svg/>' });
    applyMermaidResult(block, { ok: false, error: '<b>Parse error</b>' });
    const outputs = block.querySelectorAll('.awapi-mermaid-output');
    expect(outputs).toHaveLength(1);
    expect(outputs[0].textContent).toBe('Mermaid error: <b>Parse error</b>');
    expect(outputs[0].querySelector('b')).toBeNull();
    expect(block.querySelector('pre')!.hidden).toBe(false);

    applyMermaidResult(block, null);
    expect(block.querySelector('.awapi-mermaid-output')).toBeNull();
    expect(block.hasAttribute('data-mermaid-state')).toBe(false);
  });

  it('adds a diagram toolbar whose pop-out button calls back without bubbling', () => {
    const block = makeBlock();
    const onPopout = vi.fn();
    const outerClick = vi.fn();
    block.addEventListener('click', outerClick);
    applyMermaidResult(block, { ok: true, svg: '<svg/>' }, { onPopout });

    const actions = Array.from(block.querySelectorAll('[data-mermaid-action]')).map(b =>
      b.getAttribute('data-mermaid-action'),
    );
    expect(actions).toEqual(['zoomOut', 'zoomIn', 'reset', 'popout']);
    (block.querySelector('[data-mermaid-action="popout"]') as HTMLButtonElement).click();
    expect(onPopout).toHaveBeenCalledTimes(1);
    expect(outerClick).not.toHaveBeenCalled();

    applyMermaidResult(block, { ok: true, svg: '<svg/>' });
    expect(block.querySelector('[data-mermaid-action="popout"]')).toBeNull();
  });
});

describe('createMermaidRenderer', () => {
  let renderer: MermaidRenderer | null = null;

  afterEach(() => {
    renderer?.dispose();
    renderer = null;
  });

  async function startRenderer(loadSource = vi.fn().mockResolvedValue('/* mermaid */')) {
    renderer = createMermaidRenderer(loadSource);
    const pending = renderer.render('graph TD; A-->B', 'dark');
    const frame = getSandbox();
    const posted = vi.spyOn(frame.contentWindow!, 'postMessage');
    // jsdom fires the iframe's initial load event itself.
    await vi.waitFor(() => expect(loadSource).toHaveBeenCalled());
    await flush();
    return { frame, posted, pending, loadSource };
  }

  it('creates a scripts-only sandbox iframe and renders through postMessage', async () => {
    const { frame, posted, pending } = await startRenderer();
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts');
    expect(posted).toHaveBeenCalledWith({ type: MERMAID_MESSAGE.init, source: '/* mermaid */' }, '*');

    postFrom(frame.contentWindow, { type: MERMAID_MESSAGE.ready, ok: true });
    await flush();
    expect(posted).toHaveBeenLastCalledWith(
      { type: MERMAID_MESSAGE.render, id: 1, code: 'graph TD; A-->B', theme: 'dark' },
      '*',
    );

    postFrom(frame.contentWindow, { type: MERMAID_MESSAGE.result, id: 1, svg: '<svg/>' });
    await expect(pending).resolves.toEqual({ ok: true, svg: '<svg/>' });
  });

  it('ignores messages that do not come from the sandbox window', async () => {
    const { frame, pending } = await startRenderer();
    postFrom(frame.contentWindow, { type: MERMAID_MESSAGE.ready, ok: true });
    await flush();

    postFrom(window, { type: MERMAID_MESSAGE.result, id: 1, svg: '<svg id="forged"/>' });
    postFrom(frame.contentWindow, { type: MERMAID_MESSAGE.result, id: 1, error: 'Parse error' });
    await expect(pending).resolves.toEqual({ ok: false, error: 'Parse error' });
  });

  it('discards the sandbox if it navigates and reports a retryable failure', async () => {
    const { frame, pending } = await startRenderer();
    frame.dispatchEvent(new Event('load'));
    await expect(pending).resolves.toMatchObject({ ok: false, retryable: true });
    expect(frame.isConnected).toBe(false);
  });

  it('reports a retryable failure when Mermaid cannot be loaded', async () => {
    const { pending } = await startRenderer(vi.fn().mockRejectedValue(new Error('chunk missing')));
    await expect(pending).resolves.toEqual({
      ok: false,
      error: 'Could not load Mermaid: chunk missing',
      retryable: true,
    });
  });
});
