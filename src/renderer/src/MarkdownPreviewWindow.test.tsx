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
});
