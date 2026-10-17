import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import MarkdownPreviewWindow, { type MarkdownPreviewPayload } from './MarkdownPreviewWindow';
import { ThemeProvider } from './theme/ThemeContext';

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
});
