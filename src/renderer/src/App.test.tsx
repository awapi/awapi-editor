import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import App from './App';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider } from './theme/ThemeContext';

describe('Editor Core Tests', () => {
  beforeEach(() => {
    (window as any).electronAPI = {
      onNewFile: vi.fn(),
      onOpenFile: vi.fn(),
      onSaveFile: vi.fn(),
      onSaveAsFile: vi.fn(),
      onCloseTab: vi.fn(),
      onFind: vi.fn(),
      onReplace: vi.fn(),
      onFormat: vi.fn(),
      onThemeChange: vi.fn(),
      removeListeners: vi.fn(),
      readFile: vi.fn().mockResolvedValue({ filePath: '/mock/path/file.txt', content: 'mock content' }),
      saveSession: vi.fn().mockResolvedValue(true),
      loadSession: vi.fn().mockResolvedValue(null), // no previous session by default
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should pass a basic sanity check', () => {
    expect(true).toBe(true);
  });

  it('should format unsaved file titles', () => {
    const isDirty = true;
    const title = 'example.txt';
    const displayTitle = `${title} ${isDirty ? '*' : ''}`;
    expect(displayTitle).toBe('example.txt *');
  });

  it('should render the word wrap toggle button', () => {
    render(
      <ThemeProvider>
        <App />
      </ThemeProvider>
    );
    const btn = screen.getByTestId('word-wrap-toggle');
    expect(btn).toBeDefined();
    expect(btn.title).toBe('Disable Word Wrap');
  });

  it('should toggle word wrap title on click', () => {
    render(
      <ThemeProvider>
        <App />
      </ThemeProvider>
    );
    const btn = screen.getByTestId('word-wrap-toggle');
    expect(btn.title).toBe('Disable Word Wrap');
    fireEvent.click(btn);
    expect(btn.title).toBe('Enable Word Wrap');
    fireEvent.click(btn);
    expect(btn.title).toBe('Disable Word Wrap');
  });

  it('should register the onFormat listener on mount', () => {
    render(
      <ThemeProvider>
        <App />
      </ThemeProvider>
    );
    expect((window as any).electronAPI.onFormat).toHaveBeenCalledTimes(1);
  });

  it('should open a new tab when double-clicking the empty tab bar space', async () => {
    render(
      <ThemeProvider>
        <App />
      </ThemeProvider>
    );
    const spacer = screen.getByTestId('tab-bar-spacer');
    // Wait for the default "Untitled" tab created on startup
    await waitFor(() => screen.getAllByText('Untitled'));
    const tabsBefore = screen.getAllByText('Untitled').length;
    fireEvent.dblClick(spacer);
    await waitFor(() => expect(screen.getAllByText('Untitled').length).toBe(tabsBefore + 1));
  });
});