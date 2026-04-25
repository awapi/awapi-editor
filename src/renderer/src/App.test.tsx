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
      onPrintPreview: vi.fn(),
      onOpenSettings: vi.fn(),
      onShowAllCommands: vi.fn(),
      onOpenFileFromArgs: vi.fn(),
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

  it('should register the onOpenFileFromArgs listener on mount', () => {
    render(
      <ThemeProvider>
        <App />
      </ThemeProvider>
    );
    expect((window as any).electronAPI.onOpenFileFromArgs).toHaveBeenCalledTimes(1);
  });

  it('should open a new tab when onOpenFileFromArgs fires', async () => {
    let capturedCallback: ((filePath: string) => void) | null = null;
    (window as any).electronAPI.onOpenFileFromArgs = vi.fn((cb: (filePath: string) => void) => {
      capturedCallback = cb;
    });
    (window as any).electronAPI.readFile = vi.fn().mockResolvedValue({
      filePath: '/tmp/arg-file.txt',
      content: 'hello from args',
      eol: 'LF',
    });
    render(
      <ThemeProvider>
        <App />
      </ThemeProvider>
    );
    // Wait for component to mount and register the listener
    await waitFor(() => expect(capturedCallback).not.toBeNull());
    capturedCallback!('/tmp/arg-file.txt');
    await waitFor(() => expect(screen.getByText('arg-file.txt')).toBeTruthy());
  });

  it('should switch to existing tab if onOpenFileFromArgs fires with already-open file', async () => {
    const existingSession = {
      activeTabId: 'tab-existing',
      tabs: [{
        id: 'tab-existing',
        title: 'existing.txt',
        filePath: '/tmp/existing.txt',
        content: 'old content',
        isDirty: false,
        eol: 'LF',
      }],
    };
    (window as any).electronAPI.loadSession.mockResolvedValueOnce(existingSession);
    (window as any).electronAPI.readFile = vi.fn().mockResolvedValue({
      filePath: '/tmp/existing.txt', content: 'old content', eol: 'LF',
    });
    let capturedCallback: ((filePath: string) => void) | null = null;
    (window as any).electronAPI.onOpenFileFromArgs = vi.fn((cb: (filePath: string) => void) => {
      capturedCallback = cb;
    });
    render(
      <ThemeProvider>
        <App />
      </ThemeProvider>
    );
    await waitFor(() => screen.getByText('existing.txt'));
    await waitFor(() => expect(capturedCallback).not.toBeNull());
    const callsBefore = (window as any).electronAPI.readFile.mock.calls.length;
    capturedCallback!('/tmp/existing.txt');
    // readFile should NOT have been called again for an already-open file
    await waitFor(() => expect((window as any).electronAPI.readFile.mock.calls.length).toBe(callsBefore));
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

  describe('closeTab unsaved confirmation', () => {
    const makeDirtySession = () => ({
      activeTabId: 'dirty-1',
      tabs: [
        {
          id: 'dirty-1',
          title: 'dirty.txt',
          filePath: '/tmp/dirty.txt',
          content: 'edited content',
          isDirty: true,
        },
      ],
    });

    const renderWithDirtyTab = async () => {
      (window as any).electronAPI.loadSession.mockResolvedValueOnce(makeDirtySession());
      render(
        <ThemeProvider>
          <App />
        </ThemeProvider>
      );
      await waitFor(() => screen.getByText(/dirty\.txt/));
    };

    const getCloseButton = () => {
      const tab = screen.getByText(/dirty\.txt/).closest('div') as HTMLElement;
      // The close icon <X/> is rendered as an SVG sibling of the title span.
      const svg = tab.querySelector('svg');
      if (!svg) throw new Error('Close icon not found');
      return svg;
    };

    it('closes a clean tab without asking for confirmation', async () => {
      const confirmMock = vi.fn();
      (window as any).electronAPI.confirmUnsavedChanges = confirmMock;
      render(
        <ThemeProvider>
          <App />
        </ThemeProvider>
      );
      await waitFor(() => screen.getByText('Untitled'));
      const tab = screen.getByText('Untitled').closest('div') as HTMLElement;
      const svg = tab.querySelector('svg') as SVGElement;
      fireEvent.click(svg);
      await waitFor(() => expect(screen.queryByText('Untitled')).toBeNull());
      expect(confirmMock).not.toHaveBeenCalled();
    });

    it('cancels close when user chooses Cancel on dirty tab', async () => {
      (window as any).electronAPI.confirmUnsavedChanges = vi.fn().mockResolvedValue('cancel');
      (window as any).electronAPI.saveFileDialog = vi.fn();
      await renderWithDirtyTab();
      fireEvent.click(getCloseButton());
      await waitFor(() => expect((window as any).electronAPI.confirmUnsavedChanges).toHaveBeenCalledWith('dirty.txt'));
      expect(screen.getByText(/dirty\.txt/)).toBeTruthy();
      expect((window as any).electronAPI.saveFileDialog).not.toHaveBeenCalled();
    });

    it("discards changes and closes when user chooses Don't Save", async () => {
      (window as any).electronAPI.confirmUnsavedChanges = vi.fn().mockResolvedValue('dont-save');
      (window as any).electronAPI.saveFileDialog = vi.fn();
      await renderWithDirtyTab();
      fireEvent.click(getCloseButton());
      await waitFor(() => expect(screen.queryByText(/dirty\.txt/)).toBeNull());
      expect((window as any).electronAPI.saveFileDialog).not.toHaveBeenCalled();
    });

    it('saves and closes when user chooses Save', async () => {
      (window as any).electronAPI.confirmUnsavedChanges = vi.fn().mockResolvedValue('save');
      (window as any).electronAPI.saveFileDialog = vi.fn().mockResolvedValue('/tmp/dirty.txt');
      await renderWithDirtyTab();
      fireEvent.click(getCloseButton());
      await waitFor(() => expect((window as any).electronAPI.saveFileDialog).toHaveBeenCalledWith('/tmp/dirty.txt', 'edited content', 'LF'));
      await waitFor(() => expect(screen.queryByText(/dirty\.txt/)).toBeNull());
    });

    it('aborts close when save dialog is cancelled', async () => {
      (window as any).electronAPI.confirmUnsavedChanges = vi.fn().mockResolvedValue('save');
      (window as any).electronAPI.saveFileDialog = vi.fn().mockResolvedValue(null);
      await renderWithDirtyTab();
      fireEvent.click(getCloseButton());
      await waitFor(() => expect((window as any).electronAPI.saveFileDialog).toHaveBeenCalled());
      expect(screen.getByText(/dirty\.txt/)).toBeTruthy();
    });
  });
});