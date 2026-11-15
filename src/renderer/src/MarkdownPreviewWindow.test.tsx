import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import MarkdownPreviewWindow, { type MarkdownPreviewPayload } from './MarkdownPreviewWindow';
import { ThemeProvider } from './theme/ThemeContext';
import { renderMermaidDiagram } from './mermaidRenderer';

vi.mock('./mermaidRenderer', async importOriginal => ({
  ...(await importOriginal<typeof import('./mermaidRenderer')>()),
  renderMermaidDiagram: vi.fn(),
  getCachedMermaidResult: vi.fn(() => undefined),
}));

describe('MarkdownPreviewWindow', () => {
  let updateCallback: ((payload: MarkdownPreviewPayload) => void) | undefined;
  let api: any;

  beforeEach(() => {
    updateCallback = undefined;
    api = {
      getMarkdownPreviewData: vi.fn().mockResolvedValue({
        title: 'README.md',
        filePath: '/project/README.md',
        content: '# Welcome\n\nThis is **Awapi**.',
        theme: 'dark',
      }),
      onMarkdownPreviewUpdate: vi.fn((cb: (payload: MarkdownPreviewPayload) => void) => {
        updateCallback = cb;
        return () => {};
      }),
      getAlwaysOnTop: vi.fn().mockResolvedValue(false),
      toggleAlwaysOnTop: vi.fn().mockResolvedValue(true),
      onAlwaysOnTopChanged: vi.fn(),
      loadSettings: vi.fn().mockResolvedValue({}),
      onThemeChange: vi.fn(),
      applyNativeTheme: vi.fn(),
    };
    (window as any).electronAPI = api;
  });

  it('fetches initial markdown data on mount and renders formatted HTML', async () => {
    render(
      <ThemeProvider>
        <MarkdownPreviewWindow />
      </ThemeProvider>,
    );

    await waitFor(() => expect(api.getMarkdownPreviewData).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('markdown-preview-title').textContent).toBe('README.md');
    expect(screen.getByTestId('markdown-preview-filepath').textContent).toBe('/project/README.md');

    const contentEl = screen.getByTestId('markdown-preview-content');
    expect(contentEl.innerHTML).toContain('<h1 id="welcome">Welcome</h1>');
    expect(contentEl.innerHTML).toContain('<strong>Awapi</strong>');
  });

  it('refreshes live when onMarkdownPreviewUpdate fires', async () => {
    render(
      <ThemeProvider>
        <MarkdownPreviewWindow />
      </ThemeProvider>,
    );

    await waitFor(() => expect(api.getMarkdownPreviewData).toHaveBeenCalled());
    expect(updateCallback).toBeDefined();

    act(() => {
      updateCallback!({
        title: 'CHANGELOG.md',
        filePath: '/project/CHANGELOG.md',
        content: '## v1.0.0\n\n- Added live markdown preview',
        theme: 'light',
      });
    });

    expect(screen.getByTestId('markdown-preview-title').textContent).toBe('CHANGELOG.md');
    const contentEl = screen.getByTestId('markdown-preview-content');
    expect(contentEl.innerHTML).toContain('<h2 id="v100">v1.0.0</h2>');
    expect(contentEl.innerHTML).toContain('<li>Added live markdown preview</li>');
    expect(document.title).toBe('Preview — CHANGELOG.md');
  });

  it('shows empty state when markdown content is blank', async () => {
    api.getMarkdownPreviewData.mockResolvedValueOnce({
      title: 'Untitled.md',
      filePath: null,
      content: '   ',
    });

    render(
      <ThemeProvider>
        <MarkdownPreviewWindow />
      </ThemeProvider>,
    );

    await waitFor(() => expect(screen.getByTestId('markdown-preview-empty')).toBeDefined());
  });

  it('renders mermaid blocks as sandbox-produced images and shows diagram errors', async () => {
    vi.mocked(renderMermaidDiagram).mockImplementation(async code =>
      code.includes('bad')
        ? { ok: false, error: 'Parse error on line 1' }
        : { ok: true, svg: '<svg xmlns="http://www.w3.org/2000/svg"/>' },
    );
    api.getMarkdownPreviewData.mockResolvedValueOnce({
      title: 'diagram.md',
      filePath: '/project/diagram.md',
      content: '```mermaid\ngraph TD; A-->B\n```\n\n```mermaid\nbad syntax\n```',
      theme: 'light',
    });

    render(
      <ThemeProvider>
        <MarkdownPreviewWindow />
      </ThemeProvider>,
    );

    await waitFor(() =>
      expect(screen.getByTestId('markdown-preview-content').querySelector('img')).not.toBeNull(),
    );
    expect(renderMermaidDiagram).toHaveBeenCalledWith('graph TD; A-->B', 'light');
    const [ok, failed] = Array.from(
      screen.getByTestId('markdown-preview-content').querySelectorAll<HTMLElement>('[data-mermaid-block]'),
    );
    expect(ok.querySelector('img')!.getAttribute('src')).toMatch(/^data:image\/svg\+xml/);
    expect(ok.querySelector('pre')!.hidden).toBe(true);
    await waitFor(() => expect(failed.getAttribute('data-mermaid-state')).toBe('error'));
    expect(failed.textContent).toContain('Mermaid error: Parse error on line 1');
    expect(failed.querySelector('pre')!.hidden).toBe(false);
  });

  it('pops out a diagram and keeps open pop-outs in sync with edits', async () => {
    vi.mocked(renderMermaidDiagram).mockImplementation(async code => ({
      ok: true,
      svg: `<svg data-src="${code}"/>`,
    }));
    let popoutsChanged: ((refs: Array<{ docKey: string; index: number }>) => void) | undefined;
    api.getOpenDiagramPopouts = vi.fn().mockResolvedValue([]);
    api.onDiagramPopoutsChanged = vi.fn(cb => {
      popoutsChanged = cb;
      return () => {};
    });
    api.openDiagramPopout = vi.fn().mockResolvedValue(true);
    api.syncDiagramPopouts = vi.fn().mockResolvedValue(undefined);
    const doc = (content: string) => ({
      title: 'diagram.md',
      filePath: '/project/diagram.md',
      content,
      theme: 'dark' as const,
    });
    api.getMarkdownPreviewData.mockResolvedValueOnce(doc('```mermaid\ngraph TD; A-->B\n```'));

    render(
      <ThemeProvider>
        <MarkdownPreviewWindow />
      </ThemeProvider>,
    );

    await waitFor(() =>
      expect(document.querySelector('[data-mermaid-action="popout"]')).not.toBeNull(),
    );
    fireEvent.click(document.querySelector('[data-mermaid-action="popout"]')!);
    expect(api.openDiagramPopout).toHaveBeenCalledWith({
      docKey: '/project/diagram.md',
      index: 0,
      title: 'diagram.md',
      theme: 'dark',
      svg: '<svg data-src="graph TD; A-->B"/>',
      error: null,
    });
    expect(api.syncDiagramPopouts).not.toHaveBeenCalled();

    act(() => popoutsChanged!([{ docKey: '/project/diagram.md', index: 0 }]));
    act(() => updateCallback!(doc('```mermaid\ngraph TD; A-->C\n```')));
    await waitFor(() =>
      expect(api.syncDiagramPopouts).toHaveBeenCalledWith({
        docKey: '/project/diagram.md',
        count: 1,
        theme: 'dark',
        updates: [{ index: 0, svg: '<svg data-src="graph TD; A-->C"/>', error: null }],
      }),
    );

    act(() => updateCallback!(doc('No diagrams any more.')));
    expect(api.syncDiagramPopouts).toHaveBeenLastCalledWith({
      docKey: '/project/diagram.md',
      count: 0,
      theme: 'dark',
      updates: [],
    });
  });

  it('toggles Always on Top when the pin button is clicked', async () => {
    render(
      <ThemeProvider>
        <MarkdownPreviewWindow />
      </ThemeProvider>,
    );

    await waitFor(() => expect(api.getMarkdownPreviewData).toHaveBeenCalled());
    const pinBtn = screen.getByTestId('markdown-preview-pin-toggle');
    expect(pinBtn.getAttribute('aria-pressed')).toBe('false');

    fireEvent.click(pinBtn);
    await waitFor(() => expect(api.toggleAlwaysOnTop).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(pinBtn.getAttribute('aria-pressed')).toBe('true'));
  });

  it('renders .htm and .html files in a sandboxed iframe with base URL injection', async () => {
    api.getMarkdownPreviewData.mockResolvedValueOnce({
      title: 'landing.htm',
      filePath: '/project/site/landing.htm',
      content: '<html><head><title>Landing</title></head><body><h1>Hello HTML</h1></body></html>',
      theme: 'dark',
      mode: 'html',
    });

    render(
      <ThemeProvider>
        <MarkdownPreviewWindow />
      </ThemeProvider>,
    );

    await waitFor(() => expect(api.getMarkdownPreviewData).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId('markdown-preview-title').textContent).toBe('landing.htm');

    const iframe = screen.getByTestId('html-preview-iframe') as HTMLIFrameElement;
    expect(iframe).toBeDefined();
    expect(iframe.getAttribute('sandbox')).toBe('allow-scripts');
    expect(iframe.getAttribute('srcdoc')).toContain(
      '<base href="awapi-asset://local/project/site/">',
    );
    expect(iframe.getAttribute('srcdoc')).toContain('<h1>Hello HTML</h1>');
  });

  it('renders N/A — Preview Not Supported card when active tab is not previewable', async () => {
    render(
      <ThemeProvider>
        <MarkdownPreviewWindow />
      </ThemeProvider>,
    );

    await waitFor(() => expect(api.getMarkdownPreviewData).toHaveBeenCalledTimes(1));

    act(() => {
      updateCallback!({
        title: 'sample.py',
        filePath: '/project/samples/sample.py',
        content: '',
        theme: 'dark',
        mode: 'unsupported',
      });
    });

    expect(screen.getByTestId('markdown-preview-title').textContent).toBe('sample.py');
    expect(screen.getByTestId('markdown-preview-badge').textContent).toBe('N/A');
    expect(screen.getByTestId('markdown-preview-filepath').textContent).toBe(
      '/project/samples/sample.py',
    );
    const unsupportedEl = screen.getByTestId('markdown-preview-unsupported');
    expect(unsupportedEl.textContent).toContain('N/A — Preview Not Supported');
    expect(unsupportedEl.textContent).toContain('sample.py');
  });

  describe('link navigation', () => {
    const renderWith = async (initial: MarkdownPreviewPayload) => {
      api.getMarkdownPreviewData.mockResolvedValueOnce(initial);
      render(
        <ThemeProvider>
          <MarkdownPreviewWindow />
        </ThemeProvider>,
      );
      await waitFor(() => expect(screen.getByTestId('markdown-preview-title').textContent).toBe(initial.title));
    };

    it('opens a linked Markdown file in the preview and goes back to the live tab', async () => {
      api.readFile = vi.fn().mockResolvedValue({ filePath: '/project/docs/guide.md', content: '# Guide' });
      await renderWith({ title: 'README.md', filePath: '/project/README.md', content: '[Guide](docs/guide.md)' });

      fireEvent.click(screen.getByText('Guide'));

      await waitFor(() => expect(screen.getByTestId('markdown-preview-title').textContent).toBe('guide.md'));
      expect(api.readFile).toHaveBeenCalledWith('/project/docs/guide.md');
      expect(screen.getByTestId('markdown-preview-content').innerHTML).toContain('<h1 id="guide">Guide</h1>');
      expect(screen.getByTestId('markdown-preview-badge').textContent).toBe('Linked File');

      // Live edits to the source tab do not replace the linked file, but are shown after Back.
      act(() => {
        updateCallback!({ title: 'README.md', filePath: '/project/README.md', content: '# Edited' });
      });
      expect(screen.getByTestId('markdown-preview-title').textContent).toBe('guide.md');

      fireEvent.click(screen.getByTestId('markdown-preview-back'));
      expect(screen.getByTestId('markdown-preview-title').textContent).toBe('README.md');
      expect(screen.getByTestId('markdown-preview-content').innerHTML).toContain('Edited');
      expect(screen.queryByTestId('markdown-preview-back')).toBeNull();
    });

    it('opens non-previewable linked files in the editor and reports failures', async () => {
      api.openPreviewLinkInEditor = vi.fn().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
      api.readFile = vi.fn();
      await renderWith({
        title: 'README.md',
        filePath: '/project/README.md',
        content: '[Code](src/app.ts) and [Gone](missing.py)',
      });

      fireEvent.click(screen.getByText('Code'));
      await waitFor(() => expect(api.openPreviewLinkInEditor).toHaveBeenCalledWith('/project/src/app.ts'));
      expect(screen.queryByTestId('markdown-preview-nav-error')).toBeNull();

      fireEvent.click(screen.getByText('Gone'));
      await waitFor(() =>
        expect(screen.getByTestId('markdown-preview-nav-error').textContent).toBe(
          'Could not open /project/missing.py',
        ),
      );
      expect(api.readFile).not.toHaveBeenCalled();
      expect(screen.getByTestId('markdown-preview-title').textContent).toBe('README.md');
    });

    it('opens external links via window.open instead of navigating the preview', async () => {
      const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null);
      await renderWith({ title: 'README.md', filePath: '/project/README.md', content: '[Site](https://awapi.dev)' });

      fireEvent.click(screen.getByText('Site'));

      expect(openSpy).toHaveBeenCalledWith('https://awapi.dev', '_blank');
      openSpy.mockRestore();
    });

    it('follows links forwarded from the HTML preview iframe', async () => {
      api.readFile = vi.fn().mockResolvedValue({
        filePath: 'C:\\site\\about.html',
        content: '<html><head></head><body>About</body></html>',
      });
      await renderWith({
        title: 'index.html',
        filePath: 'C:\\site\\index.html',
        content: '<html><head></head><body><a href="about.html">About</a></body></html>',
        mode: 'html',
      });

      const iframe = screen.getByTestId('html-preview-iframe') as HTMLIFrameElement;
      expect(iframe.getAttribute('srcdoc')).toContain('data-awapi-preview-links');

      // Messages from other sources are ignored.
      act(() => {
        window.dispatchEvent(
          new MessageEvent('message', {
            data: { type: 'awapi-preview-link', href: 'awapi-asset://local/C:/site/about.html' },
          }),
        );
      });
      expect(api.readFile).not.toHaveBeenCalled();

      act(() => {
        window.dispatchEvent(
          new MessageEvent('message', {
            data: { type: 'awapi-preview-link', href: 'awapi-asset://local/C:/site/about.html' },
            source: iframe.contentWindow,
          }),
        );
      });

      await waitFor(() => expect(screen.getByTestId('markdown-preview-title').textContent).toBe('about.html'));
      expect(api.readFile).toHaveBeenCalledWith('C:\\site\\about.html');
      expect(screen.getByTestId('html-preview-iframe').getAttribute('srcdoc')).toContain('About</body>');
    });
  });

  describe('find in preview', () => {
    const renderPreview = async (payload: MarkdownPreviewPayload) => {
      api.getMarkdownPreviewData = vi.fn().mockResolvedValue(payload);
      render(
        <ThemeProvider>
          <MarkdownPreviewWindow />
        </ThemeProvider>,
      );
      await waitFor(() => expect(screen.getByTestId('markdown-preview-title').textContent).toBe(payload.title));
    };
    const markdown: MarkdownPreviewPayload = {
      title: 'notes.md',
      filePath: '/notes.md',
      content: '# Apple notes\n\nAn apple a day.\n\n- green **apple**',
    };
    const marks = () =>
      Array.from(screen.getByTestId('markdown-preview-content').querySelectorAll('mark.awapi-find-match'));
    const activeText = () =>
      screen.getByTestId('markdown-preview-content').querySelector('mark.awapi-find-active')?.textContent;

    it('opens with Ctrl+F, highlights matches, and steps through them', async () => {
      await renderPreview(markdown);
      expect(screen.queryByTestId('preview-find-bar')).toBeNull();

      fireEvent.keyDown(window, { key: 'f', ctrlKey: true });
      const input = screen.getByTestId('preview-find-input');
      expect(document.activeElement).toBe(input);

      fireEvent.change(input, { target: { value: 'apple' } });
      expect(marks()).toHaveLength(3);
      expect(screen.getByTestId('preview-find-count').textContent).toBe('1 of 3');
      expect(activeText()).toBe('Apple');

      fireEvent.keyDown(input, { key: 'Enter' });
      expect(screen.getByTestId('preview-find-count').textContent).toBe('2 of 3');
      expect(activeText()).toBe('apple');

      fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
      fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
      expect(screen.getByTestId('preview-find-count').textContent).toBe('3 of 3');

      fireEvent.click(screen.getByTestId('preview-find-option-matchCase'));
      expect(marks()).toHaveLength(2);
      expect(screen.getByTestId('preview-find-count').textContent).toBe('1 of 2');
      expect(activeText()).toBe('apple');

      fireEvent.keyDown(window, { key: 'Escape' });
      expect(screen.queryByTestId('preview-find-bar')).toBeNull();
      expect(marks()).toHaveLength(0);
    });

    it('lists every match in the Find All popup and jumps to a clicked one', async () => {
      await renderPreview(markdown);
      fireEvent.click(screen.getByTestId('markdown-preview-find-toggle'));
      fireEvent.change(screen.getByTestId('preview-find-input'), { target: { value: 'apple' } });

      fireEvent.click(screen.getByTestId('preview-find-all'));
      const items = screen.getAllByTestId('preview-find-all-item');
      expect(items).toHaveLength(3);
      expect(screen.getByTestId('preview-find-all-summary').textContent).toBe('3 matches for "apple"');
      expect(items[1].textContent).toContain('An apple a day.');

      fireEvent.click(items[2]);
      expect(screen.getByTestId('preview-find-count').textContent).toBe('3 of 3');
      expect(items[2].getAttribute('aria-selected')).toBe('true');

      // Escape closes the popup first, then the find bar.
      fireEvent.keyDown(window, { key: 'Escape' });
      expect(screen.queryByTestId('preview-find-all-popup')).toBeNull();
      expect(screen.getByTestId('preview-find-bar')).toBeTruthy();
    });

    it('re-applies highlights when the live content changes', async () => {
      await renderPreview(markdown);
      fireEvent.keyDown(window, { key: 'f', metaKey: true });
      fireEvent.change(screen.getByTestId('preview-find-input'), { target: { value: 'apple' } });
      expect(marks()).toHaveLength(3);

      act(() => {
        updateCallback!({ ...markdown, content: 'apple apple' });
      });
      expect(marks()).toHaveLength(2);
      expect(screen.getByTestId('preview-find-count').textContent).toBe('1 of 2');
    });

    it('opens from the Find menu command and shows regex errors', async () => {
      let onFind: (() => void) | undefined;
      api.onFind = vi.fn((cb: () => void) => {
        onFind = cb;
        return () => {};
      });
      await renderPreview(markdown);

      act(() => onFind!());
      expect(screen.getByTestId('preview-find-bar')).toBeTruthy();

      fireEvent.click(screen.getByTestId('preview-find-option-regex'));
      fireEvent.change(screen.getByTestId('preview-find-input'), { target: { value: '(' } });
      expect(screen.getByTestId('preview-find-count').textContent).toBe('Invalid regex');
      expect(marks()).toHaveLength(0);
    });

    it('searches HTML previews through the iframe find agent', async () => {
      await renderPreview({
        title: 'index.html',
        filePath: '/site/index.html',
        content: '<html><head></head><body>hello hello</body></html>',
        mode: 'html',
      });
      const iframe = screen.getByTestId('html-preview-iframe') as HTMLIFrameElement;
      expect(iframe.getAttribute('srcdoc')).toContain('data-awapi-preview-find');
      const post = vi.spyOn(iframe.contentWindow!, 'postMessage');

      fireEvent.keyDown(window, { key: 'f', ctrlKey: true });
      fireEvent.change(screen.getByTestId('preview-find-input'), { target: { value: 'hello' } });
      const search = post.mock.calls.map(c => c[0] as any).find(m => m.action === 'search' && m.query === 'hello');
      expect(search).toMatchObject({ type: 'awapi-preview-find', options: { matchCase: false } });

      const reply = (requestId: number) =>
        act(() => {
          window.dispatchEvent(
            new MessageEvent('message', {
              data: {
                type: 'awapi-preview-find-result',
                requestId,
                result: {
                  matches: [
                    { before: '', text: 'hello', after: ' hello' },
                    { before: 'hello ', text: 'hello', after: '' },
                  ],
                  truncated: false,
                  error: null,
                },
              },
              source: iframe.contentWindow,
            }),
          );
        });
      reply(search.requestId - 1); // stale replies are ignored
      expect(screen.getByTestId('preview-find-count').textContent).toBe('No results');
      reply(search.requestId);
      expect(screen.getByTestId('preview-find-count').textContent).toBe('1 of 2');
      expect(post).toHaveBeenCalledWith(
        { type: 'awapi-preview-find', action: 'activate', index: 0, scroll: true },
        '*',
      );

      // Shortcuts pressed inside the iframe are forwarded to the find bar.
      act(() => {
        window.dispatchEvent(
          new MessageEvent('message', {
            data: { type: 'awapi-preview-find-key', key: 'F3', shiftKey: false, altKey: false, ctrlKey: false, metaKey: false },
            source: iframe.contentWindow,
          }),
        );
      });
      expect(screen.getByTestId('preview-find-count').textContent).toBe('2 of 2');
    });
  });
});
