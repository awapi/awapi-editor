import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import App from './App';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ThemeProvider } from './theme/ThemeContext';

// Capture the latest onChange prop passed to the Monaco Editor component so
// tests can simulate user edits without a real DOM canvas.
let capturedEditorOnChange: ((value: string | undefined) => void) | undefined;
let mockEditorValue = '';
let mockCursorPosition = { lineNumber: 1, column: 1 };
let mockSelectionCharCount = 0;
let cursorPositionListener: ((event: { position: { lineNumber: number; column: number } }) => void) | undefined;
let cursorSelectionListener: (() => void) | undefined;
let mockSelection = {
  startLineNumber: 1,
  startColumn: 1,
  endLineNumber: 1,
  endColumn: 1,
  isEmpty: () => true,
};

const resetMonacoMockState = () => {
  capturedEditorOnChange = undefined;
  mockEditorValue = '';
  mockCursorPosition = { lineNumber: 1, column: 1 };
  mockSelectionCharCount = 0;
  cursorPositionListener = undefined;
  cursorSelectionListener = undefined;
  mockSelection = {
    startLineNumber: 1,
    startColumn: 1,
    endLineNumber: 1,
    endColumn: 1,
    isEmpty: () => true,
  };
};

const setMockCursorPosition = (lineNumber: number, column: number) => {
  mockCursorPosition = { lineNumber, column };
};

const setMockSelection = (
  selection: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number },
  chars: number,
  empty = false,
) => {
  mockSelection = {
    ...selection,
    isEmpty: () => empty,
  };
  mockSelectionCharCount = chars;
};

const emitCursorPositionChange = () => {
  cursorPositionListener?.({ position: mockCursorPosition });
};

const emitCursorSelectionChange = () => {
  cursorSelectionListener?.();
};

const mockEditorInstance = {
  getAction: vi.fn(() => ({ run: vi.fn() })),
  trigger: vi.fn(),
  getValue: vi.fn(() => mockEditorValue),
  getPosition: vi.fn(() => mockCursorPosition),
  getSelection: vi.fn(() => mockSelection),
  setPosition: vi.fn(),
  setSelection: vi.fn(),
  revealLineInCenter: vi.fn(),
  focus: vi.fn(),
  getModel: vi.fn(() => ({
    getValueLengthInRange: vi.fn(() => mockSelectionCharCount),
    getValueInRange: vi.fn(() => 'x'.repeat(mockSelectionCharCount)),
  })),
  onDidChangeCursorPosition: vi.fn((listener: (event: { position: { lineNumber: number; column: number } }) => void) => {
    cursorPositionListener = listener;
    return {
      dispose: () => {
        if (cursorPositionListener === listener) {
          cursorPositionListener = undefined;
        }
      },
    };
  }),
  onDidChangeCursorSelection: vi.fn((listener: () => void) => {
    cursorSelectionListener = listener;
    return {
      dispose: () => {
        if (cursorSelectionListener === listener) {
          cursorSelectionListener = undefined;
        }
      },
    };
  }),
};

let capturedDiffProps: any = undefined;

// xterm.js needs a real canvas/layout; App tests only need a stand-in.
vi.mock('@xterm/xterm', () => ({
  Terminal: vi.fn(function (this: any) {
    this.options = {};
    this.loadAddon = vi.fn();
    this.open = vi.fn();
    this.attachCustomKeyEventHandler = vi.fn();
    this.onData = vi.fn(() => ({ dispose: vi.fn() }));
    this.onResize = vi.fn(() => ({ dispose: vi.fn() }));
    this.write = vi.fn();
    this.focus = vi.fn();
    this.dispose = vi.fn();
    this.hasSelection = vi.fn(() => false);
  }),
}));
vi.mock('@xterm/addon-fit', () => ({
  FitAddon: vi.fn(function (this: any) {
    this.fit = vi.fn();
  }),
}));

vi.mock('@monaco-editor/react', () => ({
  default: vi.fn((props: any) => {
    capturedEditorOnChange = props.onChange;
    React.useEffect(() => {
      props.onMount?.(mockEditorInstance);
      // Run once per mounted mock editor instance to mirror Monaco behavior.
    }, []);
    return null;
  }),
  DiffEditor: vi.fn((props: any) => {
    capturedDiffProps = props;
    return <div data-testid="mock-monaco-diff-editor" />;
  }),
}));

describe('Editor Core Tests', () => {
  beforeEach(() => {
    resetMonacoMockState();
    capturedDiffProps = undefined;
    (window as any).electronAPI = {
      onNewFile: vi.fn(),
      onOpenFile: vi.fn(),
      onSaveFile: vi.fn(),
      onSaveAsFile: vi.fn(),
      onSaveAllFiles: vi.fn(),
      onCloseTab: vi.fn(),
      onReopenClosedTab: vi.fn(),
      onFind: vi.fn(),
      onReplace: vi.fn(),
      onFindInTabs: vi.fn(),
      onGoToLine: vi.fn(),
      onToggleWhitespace: vi.fn(),
      onToggleSplitView: vi.fn(),
      onToggleDiffView: vi.fn(),
      getAlwaysOnTop: vi.fn().mockResolvedValue(false),
      setAlwaysOnTop: vi.fn().mockResolvedValue(true),
      toggleAlwaysOnTop: vi.fn().mockResolvedValue(true),
      onAlwaysOnTopChanged: vi.fn(),
      onTextOperation: vi.fn(),
      onFormat: vi.fn(),
      onThemeChange: vi.fn(),
      onPrintPreview: vi.fn(),
      onOpenSettings: vi.fn(),
      onOpenShortcuts: vi.fn(),
      onOpenHelp: vi.fn(),
      onShowAllCommands: vi.fn(),
      onOpenFileFromArgs: vi.fn(),
      onPopoutActiveTab: vi.fn(),
      onExternalFileChange: vi.fn(),
      onExternalFileDelete: vi.fn(),
      syncWatchedFiles: vi.fn().mockResolvedValue(undefined),
      confirmReloadExternalChange: vi.fn().mockResolvedValue('reload'),
      showItemInFolder: vi.fn().mockResolvedValue(undefined),
      openInTerminal: vi.fn().mockResolvedValue(true),
      onToggleTerminal: vi.fn(),
      onNewTerminal: vi.fn(),
      ptyCreate: vi.fn().mockResolvedValue({ ok: true, id: 1, cwd: '/tmp', shell: 'zsh' }),
      ptyKill: vi.fn().mockResolvedValue(undefined),
      ptyWrite: vi.fn(),
      ptyResize: vi.fn(),
      onPtyData: vi.fn(() => () => {}),
      onPtyExit: vi.fn(() => () => {}),
      readClipboardText: vi.fn().mockResolvedValue(''),
      copyToClipboard: vi.fn().mockResolvedValue(undefined),
      removeListeners: vi.fn(),
      readFile: vi.fn().mockResolvedValue({ filePath: '/mock/path/file.txt', content: 'mock content' }),
      saveSession: vi.fn().mockResolvedValue(true),
      loadSession: vi.fn().mockResolvedValue(null), // no previous session by default
      applyNativeTheme: vi.fn().mockResolvedValue(undefined),
      getPopoutData: vi.fn().mockResolvedValue(null),
      moveToMain: vi.fn().mockResolvedValue(undefined),
      onMoveToMain: vi.fn(),
      onAddTab: vi.fn(),
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Integrated terminal', () => {
    let now = 0;
    beforeEach(() => {
      // Space out toggles beyond the 150ms double-trigger guard.
      now = 10_000;
      vi.spyOn(Date, 'now').mockImplementation(() => (now += 1000));
      (window as any).electronAPI.loadSession.mockResolvedValue({
        activeTabId: 'tab-1',
        tabs: [{ id: 'tab-1', title: 'alpha.txt', filePath: '/proj/alpha.txt', content: 'a', isDirty: false, eol: 'LF' }],
      });
      (window as any).electronAPI.readFile = vi.fn().mockResolvedValue({ filePath: '/proj/alpha.txt', content: 'a', eol: 'LF' });
      (window as any).electronAPI.ptyCreate.mockResolvedValue({ ok: true, id: 7, cwd: '/proj', shell: 'zsh' });
    });
    afterEach(() => {
      vi.restoreAllMocks();
    });

    const renderApp = async () => {
      render(<ThemeProvider><App /></ThemeProvider>);
      await waitFor(() => screen.getByTestId('tab-title-tab-1'));
    };

    it('toggles the panel with Ctrl+`, starting a shell in the active file folder', async () => {
      await renderApp();
      expect(screen.queryByTestId('terminal-panel')).toBeNull();

      fireEvent.keyDown(window, { key: '`', code: 'Backquote', ctrlKey: true });
      await waitFor(() => expect(screen.getByTestId('terminal-tab-7').textContent).toContain('zsh — proj'));
      expect((window as any).electronAPI.ptyCreate).toHaveBeenCalledWith({ cwd: '/proj/alpha.txt', cols: 80, rows: 24 });
      expect(screen.getByTestId('terminal-panel').style.display).toBe('flex');

      fireEvent.keyDown(window, { key: '`', code: 'Backquote', ctrlKey: true });
      expect(screen.getByTestId('terminal-panel').style.display).toBe('none');

      // Re-opening shows the existing session instead of starting another shell.
      fireEvent.keyDown(window, { key: '`', code: 'Backquote', ctrlKey: true });
      expect(screen.getByTestId('terminal-panel').style.display).toBe('flex');
      expect((window as any).electronAPI.ptyCreate).toHaveBeenCalledTimes(1);
    });

    it('opens an additional terminal with Ctrl+Shift+` and View -> New Terminal', async () => {
      (window as any).electronAPI.ptyCreate
        .mockResolvedValueOnce({ ok: true, id: 7, cwd: '/proj', shell: 'zsh' })
        .mockResolvedValueOnce({ ok: true, id: 8, cwd: '/proj', shell: 'zsh' })
        .mockResolvedValueOnce({ ok: true, id: 9, cwd: '/proj', shell: 'zsh' });
      await renderApp();

      fireEvent.keyDown(window, { key: '~', code: 'Backquote', ctrlKey: true, shiftKey: true });
      await waitFor(() => screen.getByTestId('terminal-tab-7'));
      fireEvent.keyDown(window, { key: '~', code: 'Backquote', ctrlKey: true, shiftKey: true });
      await waitFor(() => screen.getByTestId('terminal-tab-8'));
      expect(screen.getByTestId('terminal-tab-8').getAttribute('aria-selected')).toBe('true');
      expect(screen.getByTestId('terminal-panel').style.display).toBe('flex');

      const menuNew = (window as any).electronAPI.onNewTerminal.mock.calls[0][0];
      act(() => menuNew());
      await waitFor(() => screen.getByTestId('terminal-tab-9'));
      expect((window as any).electronAPI.ptyCreate).toHaveBeenCalledTimes(3);
      expect((window as any).electronAPI.ptyCreate).toHaveBeenCalledWith({ cwd: '/proj/alpha.txt', cols: 80, rows: 24 });
    });

    it('opens new terminals in the selected File Explorer folder when a folder is selected', async () => {
      (window as any).electronAPI.loadSettings = vi.fn().mockResolvedValue({
        explorerFolderPath: '/workspace/my-folder',
        explorerVisible: true,
      });
      (window as any).electronAPI.readDirectory = vi.fn().mockResolvedValue({ ok: true, entries: [] });
      (window as any).electronAPI.ptyCreate
        .mockResolvedValueOnce({ ok: true, id: 7, cwd: '/workspace/my-folder', shell: 'zsh' })
        .mockResolvedValueOnce({ ok: true, id: 8, cwd: '/workspace/my-folder', shell: 'zsh' });
      await renderApp();

      fireEvent.keyDown(window, { key: '`', code: 'Backquote', ctrlKey: true });
      await waitFor(() => screen.getByTestId('terminal-tab-7'));
      expect((window as any).electronAPI.ptyCreate).toHaveBeenCalledWith({
        cwd: '/workspace/my-folder',
        cols: 80,
        rows: 24,
      });

      fireEvent.click(screen.getByTestId('terminal-new'));
      await waitFor(() => screen.getByTestId('terminal-tab-8'));
      expect((window as any).electronAPI.ptyCreate).toHaveBeenLastCalledWith({
        cwd: '/workspace/my-folder',
        cols: 80,
        rows: 24,
      });
    });

    it('opens an integrated terminal from the Explorer context menu in the selected folder', async () => {
      const folderPath = '/workspace/my-folder/subfolder';
      (window as any).electronAPI.loadSettings = vi.fn().mockResolvedValue({
        explorerFolderPath: '/workspace/my-folder',
        explorerVisible: true,
      });
      (window as any).electronAPI.readDirectory = vi.fn().mockImplementation(async (dirPath: string) => ({
        ok: true,
        dirPath,
        name: dirPath.split('/').pop(),
        entries: dirPath === '/workspace/my-folder'
          ? [{ name: 'subfolder', path: folderPath, isDirectory: true }]
          : [],
      }));
      (window as any).electronAPI.ptyCreate.mockResolvedValue({
        ok: true,
        id: 13,
        cwd: folderPath,
        shell: 'zsh',
      });
      await renderApp();

      await waitFor(() => screen.getByTestId('explorer-folder-subfolder'));
      fireEvent.contextMenu(screen.getByTestId('explorer-folder-subfolder'));
      fireEvent.click(screen.getByTestId('explorer-context-open-terminal'));

      await waitFor(() => screen.getByTestId('terminal-tab-13'));
      expect((window as any).electronAPI.ptyCreate).toHaveBeenCalledWith({
        cwd: folderPath,
        cols: 80,
        rows: 24,
      });
    });

    it('collapses a double trigger (menu accelerator + keydown) into one toggle', async () => {
      await renderApp();
      now = 50_000;
      (Date.now as any).mockImplementation(() => now);
      fireEvent.keyDown(window, { key: '`', code: 'Backquote', ctrlKey: true });
      const menuToggle = (window as any).electronAPI.onToggleTerminal.mock.calls[0][0];
      act(() => menuToggle());
      await waitFor(() => screen.getByTestId('terminal-panel'));
      expect(screen.getByTestId('terminal-panel').style.display).toBe('flex');
    });

    it('toggles from the status bar button and the View menu', async () => {
      await renderApp();
      fireEvent.click(screen.getByTestId('status-bar-terminal-toggle'));
      await waitFor(() => screen.getByTestId('terminal-panel'));
      expect(screen.getByTestId('status-bar-terminal-toggle').getAttribute('aria-pressed')).toBe('true');

      const menuToggle = (window as any).electronAPI.onToggleTerminal.mock.calls[0][0];
      act(() => menuToggle());
      expect(screen.getByTestId('terminal-panel').style.display).toBe('none');
      expect(screen.getByTestId('status-bar-terminal-toggle').getAttribute('aria-pressed')).toBe('false');
    });

    it('kills the shell and hides the panel when the last terminal is closed', async () => {
      await renderApp();
      fireEvent.click(screen.getByTestId('status-bar-terminal-toggle'));
      await waitFor(() => screen.getByTestId('terminal-close-7'));
      fireEvent.click(screen.getByTestId('terminal-close-7'));

      expect((window as any).electronAPI.ptyKill).toHaveBeenCalledWith(7);
      expect(screen.queryByTestId('terminal-panel')).toBeNull();
    });

    it('is unavailable when the pty bridge is missing', async () => {
      delete (window as any).electronAPI.ptyCreate;
      await renderApp();
      expect(screen.queryByTestId('status-bar-terminal-toggle')).toBeNull();
      fireEvent.keyDown(window, { key: '`', code: 'Backquote', ctrlKey: true });
      expect(screen.queryByTestId('terminal-panel')).toBeNull();
    });
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

  it('should render the word wrap toggle button in the status bar', () => {
    render(
      <ThemeProvider>
        <App />
      </ThemeProvider>
    );
    const statusBar = screen.getByTestId('status-bar');
    const btn = screen.getByTestId('word-wrap-toggle');
    expect(btn).toBeDefined();
    expect(statusBar.contains(btn)).toBe(true);
    expect(btn.title).toBe('Disable Word Wrap');
  });

  it('shows cursor, selection, and total character summaries in the status bar', async () => {
    render(
      <ThemeProvider>
        <App />
      </ThemeProvider>
    );

    await waitFor(() => screen.getByTestId('status-cursor-position'));
    expect(screen.getByTestId('status-cursor-position').textContent).toBe('Ln 1, Col 1');
    expect(screen.getByTestId('status-selection-summary').textContent).toBe('Sel 0L, 0C');
    expect(screen.getByTestId('status-total-characters').textContent).toBe('Chars 0');
  });

  it('updates total characters when editor content changes', async () => {
    render(
      <ThemeProvider>
        <App />
      </ThemeProvider>
    );

    await waitFor(() => screen.getByTestId('status-total-characters'));

    act(() => {
      mockEditorValue = 'hello world';
      capturedEditorOnChange?.('hello world');
    });

    await waitFor(() => expect(screen.getByTestId('status-total-characters').textContent).toBe('Chars 11'));
  });

  it('updates cursor and selection summaries from Monaco cursor events', async () => {
    render(
      <ThemeProvider>
        <App />
      </ThemeProvider>
    );

    await waitFor(() => screen.getByTestId('status-cursor-position'));

    act(() => {
      setMockCursorPosition(3, 7);
      setMockSelection(
        {
          startLineNumber: 2,
          startColumn: 1,
          endLineNumber: 4,
          endColumn: 2,
        },
        18,
        false,
      );
      emitCursorPositionChange();
      emitCursorSelectionChange();
    });

    await waitFor(() => expect(screen.getByTestId('status-cursor-position').textContent).toBe('Ln 3, Col 7'));
    expect(screen.getByTestId('status-selection-summary').textContent).toBe('Sel 3L, 18C');
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
    // Main records OS/CLI opens itself; the renderer must not request tracking again.
    expect((window as any).electronAPI.readFile).toHaveBeenCalledWith('/tmp/arg-file.txt');
  });

  it('only asks main to track recent files for user-initiated drops, not session restore (CR-03)', async () => {
    (window as any).electronAPI.loadSession.mockResolvedValueOnce({
      activeTabId: 'tab-restored',
      tabs: [{
        id: 'tab-restored',
        title: 'restored.txt',
        filePath: '/tmp/restored.txt',
        content: 'restored',
        isDirty: false,
        eol: 'LF',
      }],
    });
    (window as any).electronAPI.readFile = vi.fn().mockImplementation(async (fp: string) => ({
      filePath: fp, content: `content of ${fp}`, eol: 'LF',
    }));
    (window as any).electronAPI.getPathForFile = vi.fn(() => '/tmp/dropped.txt');

    render(<ThemeProvider><App /></ThemeProvider>);
    await waitFor(() => screen.getByText('restored.txt'));

    expect((window as any).electronAPI.readFile).toHaveBeenCalledWith('/tmp/restored.txt');
    expect((window as any).electronAPI.readFile).not.toHaveBeenCalledWith(
      '/tmp/restored.txt',
      expect.objectContaining({ trackRecent: true }),
    );

    const file = new File(['x'], 'dropped.txt', { type: 'text/plain' });
    const dropEvent = new Event('drop', { bubbles: true, cancelable: true }) as any;
    dropEvent.dataTransfer = { types: ['Files'], files: [file] };
    await act(async () => {
      window.dispatchEvent(dropEvent);
    });

    await waitFor(() => screen.getByText('dropped.txt'));
    expect((window as any).electronAPI.readFile).toHaveBeenCalledWith('/tmp/dropped.txt', { trackRecent: true });
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

  it('opens the File Explorer sidebar rooted at the given folder when onOpenFolderFromArgs fires', async () => {
    let capturedFolderCb: ((dirPath: string) => void) | null = null;
    (window as any).electronAPI.onOpenFolderFromArgs = vi.fn((cb: (dirPath: string) => void) => {
      capturedFolderCb = cb;
    });
    (window as any).electronAPI.readDirectory = vi.fn().mockResolvedValue({
      ok: true,
      dirPath: 'C:\\Projects\\MyFolder',
      name: 'MyFolder',
      entries: [],
    });

    render(
      <ThemeProvider>
        <App />
      </ThemeProvider>
    );

    await waitFor(() => expect(capturedFolderCb).not.toBeNull());
    await act(async () => {
      capturedFolderCb!('C:\\Projects\\MyFolder');
    });

    await waitFor(() => {
      expect(screen.getByTestId('file-explorer-sidebar')).toBeTruthy();
      expect((window as any).electronAPI.readDirectory).toHaveBeenCalledWith('C:\\Projects\\MyFolder');
    });
  });

  it('closes a tab on middle-click (auxclick button=1)', async () => {
    (window as any).electronAPI.loadSession.mockResolvedValue({
      activeTabId: 'tab-1',
      tabs: [
        { id: 'tab-1', title: 'alpha.txt', filePath: '/tmp/alpha.txt', content: 'aaa', isDirty: false, eol: 'LF' },
        { id: 'tab-2', title: 'beta.txt',  filePath: '/tmp/beta.txt',  content: 'bbb', isDirty: false, eol: 'LF' },
      ],
    });
    render(<ThemeProvider><App /></ThemeProvider>);
    await waitFor(() => screen.getByText('alpha.txt'));
    await waitFor(() => screen.getByText('beta.txt'));

    const tab = screen.getByText('alpha.txt').closest('div[draggable]') as HTMLElement;
    fireEvent(tab, new MouseEvent('auxclick', { button: 1, bubbles: true }));

    await waitFor(() => expect(screen.queryByText('alpha.txt')).toBeNull());
    expect(screen.getByText('beta.txt')).toBeTruthy();
  });

  it('does not close a tab on other auxclick buttons', async () => {
    (window as any).electronAPI.loadSession.mockResolvedValue({
      activeTabId: 'tab-1',
      tabs: [
        { id: 'tab-1', title: 'alpha.txt', filePath: '/tmp/alpha.txt', content: 'aaa', isDirty: false, eol: 'LF' },
      ],
    });
    render(<ThemeProvider><App /></ThemeProvider>);
    await waitFor(() => screen.getByText('alpha.txt'));

    const tab = screen.getByText('alpha.txt').closest('div[draggable]') as HTMLElement;
    fireEvent(tab, new MouseEvent('auxclick', { button: 2, bubbles: true }));

    expect(screen.getByText('alpha.txt')).toBeTruthy();
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

  describe('dirty flag / undo-to-clean behaviour', () => {
    const makeCleanSession = () => ({
      activeTabId: 'tab-1',
      tabs: [{
        id: 'tab-1',
        title: 'notes.txt',
        filePath: '/tmp/notes.txt',
        content: 'original',
        isDirty: false,
        eol: 'LF',
      }],
    });

    beforeEach(() => {
      (window as any).electronAPI.loadSession.mockResolvedValue(makeCleanSession());
      (window as any).electronAPI.readFile = vi.fn().mockResolvedValue({
        filePath: '/tmp/notes.txt',
        content: 'original',
        eol: 'LF',
      });
    });

    it('tab starts clean (no * in title) after opening a saved file', async () => {
      render(<ThemeProvider><App /></ThemeProvider>);
      await waitFor(() => screen.getByText('notes.txt'));
      expect(screen.queryByText(/\*/)).toBeNull();
    });

    it('shows dirty indicator (*) when editor fires a changed value', async () => {
      render(<ThemeProvider><App /></ThemeProvider>);
      await waitFor(() => screen.getByText('notes.txt'));

      act(() => { capturedEditorOnChange?.('modified'); });
      await waitFor(() => screen.getByText(/notes\.txt.*\*/));
    });

    it('clears dirty indicator when editor content is reverted to the saved content', async () => {
      render(<ThemeProvider><App /></ThemeProvider>);
      await waitFor(() => screen.getByText('notes.txt'));

      // Make it dirty
      act(() => { capturedEditorOnChange?.('modified'); });
      await waitFor(() => screen.getByText(/notes\.txt.*\*/));

      // Undo back to original — dirty should clear
      act(() => { capturedEditorOnChange?.('original'); });
      await waitFor(() => expect(screen.queryByText(/notes\.txt.*\*/)).toBeNull());
      expect(screen.getByText('notes.txt')).toBeTruthy();
    });
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

  describe('tab tooltip (title attribute)', () => {
    it('shows the full file path as a tooltip on a saved tab', async () => {
      const session = {
        activeTabId: 'tab-1',
        tabs: [{
          id: 'tab-1',
          title: 'notes.txt',
          filePath: '/home/user/documents/notes.txt',
          content: '',
          isDirty: false,
          eol: 'LF',
        }],
      };
      (window as any).electronAPI.loadSession.mockResolvedValueOnce(session);
      (window as any).electronAPI.readFile = vi.fn().mockResolvedValue({
        filePath: '/home/user/documents/notes.txt',
        content: '',
        eol: 'LF',
      });
      render(
        <ThemeProvider>
          <App />
        </ThemeProvider>
      );
      await waitFor(() => screen.getByText('notes.txt'));
      const tab = screen.getByText('notes.txt').closest('div[draggable]') as HTMLElement;
      expect(tab).toBeTruthy();
      expect(tab.title).toBe('/home/user/documents/notes.txt');
    });

    it('does not set a tooltip on an Untitled tab', async () => {
      render(
        <ThemeProvider>
          <App />
        </ThemeProvider>
      );
      await waitFor(() => screen.getByText('Untitled'));
      const tab = screen.getByText('Untitled').closest('div[draggable]') as HTMLElement;
      expect(tab).toBeTruthy();
      expect(tab.title).toBeFalsy();
    });
  });

  describe('pop-out to new window', () => {
    const makeSession = () => ({
      activeTabId: 'tab-1',
      tabs: [
        { id: 'tab-1', title: 'alpha.txt', filePath: '/tmp/alpha.txt', content: 'aaa', isDirty: false, eol: 'LF' },
        { id: 'tab-2', title: 'beta.txt',  filePath: '/tmp/beta.txt',  content: 'bbb', isDirty: false, eol: 'LF' },
      ],
    });

    beforeEach(() => {
      (window as any).electronAPI.popoutTab = vi.fn().mockResolvedValue(undefined);
      (window as any).electronAPI.loadSession.mockResolvedValue(makeSession());
      (window as any).electronAPI.readFile = vi.fn().mockImplementation(async (fp: string) => ({
        filePath: fp,
        content: fp.includes('alpha') ? 'aaa' : 'bbb',
        eol: 'LF',
      }));
    });

    it('shows context menu on tab right-click', async () => {
      render(<ThemeProvider><App /></ThemeProvider>);
      await waitFor(() => screen.getByText('alpha.txt'));

      const tab = screen.getByText('alpha.txt').closest('div[draggable]') as HTMLElement;
      fireEvent.contextMenu(tab);

      expect(screen.getByTestId('tab-context-menu')).toBeTruthy();
      expect(screen.getByTestId('tab-context-popout')).toBeTruthy();
    });

    it('dismisses context menu when clicking the backdrop', async () => {
      render(<ThemeProvider><App /></ThemeProvider>);
      await waitFor(() => screen.getByText('alpha.txt'));

      const tab = screen.getByText('alpha.txt').closest('div[draggable]') as HTMLElement;
      fireEvent.contextMenu(tab);
      expect(screen.getByTestId('tab-context-menu')).toBeTruthy();

      fireEvent.click(screen.getByTestId('tab-context-menu-backdrop'));
      expect(screen.queryByTestId('tab-context-menu')).toBeNull();
    });

    it('calls popoutTab with tab data and removes tab from list', async () => {
      render(<ThemeProvider><App /></ThemeProvider>);
      await waitFor(() => screen.getByText('alpha.txt'));
      await waitFor(() => screen.getByText('beta.txt'));

      const tab = screen.getByText('alpha.txt').closest('div[draggable]') as HTMLElement;
      fireEvent.contextMenu(tab);
      fireEvent.click(screen.getByTestId('tab-context-popout'));

      await waitFor(() => expect(screen.queryByText('alpha.txt')).toBeNull());
      expect(screen.getByText('beta.txt')).toBeTruthy();
      expect((window as any).electronAPI.popoutTab).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'tab-1', title: 'alpha.txt' })
      );
    });

    it('hides context menu after pop-out action', async () => {
      render(<ThemeProvider><App /></ThemeProvider>);
      await waitFor(() => screen.getByText('alpha.txt'));

      const tab = screen.getByText('alpha.txt').closest('div[draggable]') as HTMLElement;
      fireEvent.contextMenu(tab);
      fireEvent.click(screen.getByTestId('tab-context-popout'));

      await waitFor(() => expect(screen.queryByTestId('tab-context-menu')).toBeNull());
    });
  });

  describe('tab context menu close actions', () => {
    const makeSession = () => ({
      activeTabId: 'tab-1',
      tabs: [
        { id: 'tab-1', title: 'alpha.txt', filePath: '/tmp/alpha.txt', content: 'aaa', isDirty: false, eol: 'LF' },
        { id: 'tab-2', title: 'beta.txt',  filePath: '/tmp/beta.txt',  content: 'bbb', isDirty: false, eol: 'LF' },
        { id: 'tab-3', title: 'gamma.txt', filePath: '/tmp/gamma.txt', content: 'ccc', isDirty: false, eol: 'LF' },
      ],
    });

    beforeEach(() => {
      (window as any).electronAPI.loadSession.mockResolvedValue(makeSession());
      (window as any).electronAPI.readFile = vi.fn().mockImplementation(async (fp: string) => ({
        filePath: fp,
        content: fp.includes('alpha') ? 'aaa' : fp.includes('beta') ? 'bbb' : 'ccc',
        eol: 'LF',
      }));
    });

    const openContextOn = async (label: string) => {
      await waitFor(() => screen.getByText(label));
      const tab = screen.getByText(label).closest('div[draggable]') as HTMLElement;
      fireEvent.contextMenu(tab);
    };

    it('renders Close Tab, Close Other Tabs, and Close All Tabs items', async () => {
      render(<ThemeProvider><App /></ThemeProvider>);
      await openContextOn('beta.txt');

      expect(screen.getByTestId('tab-context-close')).toBeTruthy();
      expect(screen.getByTestId('tab-context-close-others')).toBeTruthy();
      expect(screen.getByTestId('tab-context-close-all')).toBeTruthy();
    });

    it('Close Tab removes only the right-clicked tab', async () => {
      render(<ThemeProvider><App /></ThemeProvider>);
      await waitFor(() => screen.getByText('alpha.txt'));
      await waitFor(() => screen.getByText('beta.txt'));
      await waitFor(() => screen.getByText('gamma.txt'));

      await openContextOn('beta.txt');
      fireEvent.click(screen.getByTestId('tab-context-close'));

      await waitFor(() => expect(screen.queryByText('beta.txt')).toBeNull());
      expect(screen.getByText('alpha.txt')).toBeTruthy();
      expect(screen.getByText('gamma.txt')).toBeTruthy();
    });

    it('Close Other Tabs keeps the right-clicked tab and closes the rest', async () => {
      render(<ThemeProvider><App /></ThemeProvider>);
      await waitFor(() => screen.getByText('alpha.txt'));
      await waitFor(() => screen.getByText('beta.txt'));
      await waitFor(() => screen.getByText('gamma.txt'));

      await openContextOn('beta.txt');
      fireEvent.click(screen.getByTestId('tab-context-close-others'));

      await waitFor(() => expect(screen.queryByText('alpha.txt')).toBeNull());
      await waitFor(() => expect(screen.queryByText('gamma.txt')).toBeNull());
      expect(screen.getByText('beta.txt')).toBeTruthy();
    });

    it('Close All Tabs closes every tab', async () => {
      render(<ThemeProvider><App /></ThemeProvider>);
      await waitFor(() => screen.getByText('alpha.txt'));

      await openContextOn('alpha.txt');
      fireEvent.click(screen.getByTestId('tab-context-close-all'));

      await waitFor(() => expect(screen.queryByText('alpha.txt')).toBeNull());
      expect(screen.queryByText('beta.txt')).toBeNull();
      expect(screen.queryByText('gamma.txt')).toBeNull();
    });

    it('hides Close Other Tabs when only one tab is open', async () => {
      (window as any).electronAPI.loadSession.mockResolvedValue({
        activeTabId: 'tab-1',
        tabs: [{ id: 'tab-1', title: 'alpha.txt', filePath: '/tmp/alpha.txt', content: 'aaa', isDirty: false, eol: 'LF' }],
      });

      render(<ThemeProvider><App /></ThemeProvider>);
      await openContextOn('alpha.txt');

      expect(screen.queryByTestId('tab-context-close-others')).toBeNull();
      expect(screen.getByTestId('tab-context-close')).toBeTruthy();
      expect(screen.getByTestId('tab-context-close-all')).toBeTruthy();
    });

    it('skips dirty tabs when user cancels unsaved-changes prompt during Close All', async () => {
      (window as any).electronAPI.loadSession.mockResolvedValue({
        activeTabId: 'tab-1',
        tabs: [
          { id: 'tab-1', title: 'alpha.txt', filePath: '/tmp/alpha.txt', content: 'aaa', isDirty: false, eol: 'LF' },
          { id: 'tab-2', title: 'beta.txt',  filePath: '/tmp/beta.txt',  content: 'BBB', isDirty: true,  eol: 'LF' },
        ],
      });
      (window as any).electronAPI.confirmUnsavedChanges = vi.fn().mockResolvedValue('cancel');

      render(<ThemeProvider><App /></ThemeProvider>);
      await waitFor(() => screen.getByText('alpha.txt'));
      await waitFor(() => screen.getByText(/beta\.txt/));

      await openContextOn('alpha.txt');
      fireEvent.click(screen.getByTestId('tab-context-close-all'));

      // alpha (clean) should close; beta (dirty + cancelled) should remain.
      await waitFor(() => expect(screen.queryByText('alpha.txt')).toBeNull());
      expect(screen.getByText(/beta\.txt/)).toBeTruthy();
      expect((window as any).electronAPI.confirmUnsavedChanges).toHaveBeenCalledTimes(1);
    });

    it('hides the context menu after a close action', async () => {
      render(<ThemeProvider><App /></ThemeProvider>);
      await openContextOn('alpha.txt');
      fireEvent.click(screen.getByTestId('tab-context-close'));

      await waitFor(() => expect(screen.queryByTestId('tab-context-menu')).toBeNull());
    });
  });

  describe('tab context menu — rename', () => {
    const makeSession = () => ({
      activeTabId: 'tab-1',
      tabs: [
        { id: 'tab-1', title: 'alpha.txt',  filePath: '/tmp/alpha.txt', content: 'aaa', isDirty: false, eol: 'LF' },
        { id: 'tab-2', title: 'Untitled',   filePath: null,             content: '',    isDirty: false, eol: 'LF' },
      ],
    });

    beforeEach(() => {
      (window as any).electronAPI.loadSession.mockResolvedValue(makeSession());
      (window as any).electronAPI.readFile = vi.fn().mockImplementation(async (fp: string) => ({
        filePath: fp, content: 'aaa', eol: 'LF',
      }));
      (window as any).electronAPI.renameFile = vi.fn();
    });

    const openContextOn = async (label: string) => {
      await waitFor(() => screen.getByText(label));
      const tab = screen.getByText(label).closest('div[draggable]') as HTMLElement;
      fireEvent.contextMenu(tab);
    };

    it('shows the Rename… menu item', async () => {
      render(<ThemeProvider><App /></ThemeProvider>);
      await openContextOn('alpha.txt');
      expect(screen.getByTestId('tab-context-rename')).toBeTruthy();
    });

    it('disables Rename for tabs without a filePath', async () => {
      render(<ThemeProvider><App /></ThemeProvider>);
      await openContextOn('Untitled');
      const item = screen.getByTestId('tab-context-rename');
      expect(item.getAttribute('aria-disabled')).toBe('true');

      fireEvent.click(item);
      expect(screen.queryByTestId('rename-modal')).toBeNull();
      expect((window as any).electronAPI.renameFile).not.toHaveBeenCalled();
    });

    it('opens the rename modal pre-filled with the current name', async () => {
      render(<ThemeProvider><App /></ThemeProvider>);
      await openContextOn('alpha.txt');
      fireEvent.click(screen.getByTestId('tab-context-rename'));

      const input = screen.getByTestId('rename-modal-input') as HTMLInputElement;
      expect(input).toBeTruthy();
      expect(input.value).toBe('alpha.txt');
    });

    it('closes the modal on Cancel without calling renameFile', async () => {
      render(<ThemeProvider><App /></ThemeProvider>);
      await openContextOn('alpha.txt');
      fireEvent.click(screen.getByTestId('tab-context-rename'));

      fireEvent.click(screen.getByTestId('rename-modal-cancel'));

      await waitFor(() => expect(screen.queryByTestId('rename-modal')).toBeNull());
      expect((window as any).electronAPI.renameFile).not.toHaveBeenCalled();
    });

    it('renames the file, updates the tab title and filePath on success', async () => {
      (window as any).electronAPI.renameFile = vi.fn().mockResolvedValue({ ok: true, newPath: '/tmp/renamed.txt' });

      render(<ThemeProvider><App /></ThemeProvider>);
      await openContextOn('alpha.txt');
      fireEvent.click(screen.getByTestId('tab-context-rename'));

      const input = screen.getByTestId('rename-modal-input') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'renamed.txt' } });
      fireEvent.click(screen.getByTestId('rename-modal-submit'));

      await waitFor(() => expect(screen.queryByTestId('rename-modal')).toBeNull());
      expect((window as any).electronAPI.renameFile).toHaveBeenCalledWith('/tmp/alpha.txt', 'renamed.txt');
      expect(screen.getByText('renamed.txt')).toBeTruthy();
      expect(screen.queryByText('alpha.txt')).toBeNull();
    });

    it('shows an inline error and keeps the modal open when renameFile fails', async () => {
      (window as any).electronAPI.renameFile = vi.fn().mockResolvedValue({ ok: false, error: 'A file with that name already exists.' });

      render(<ThemeProvider><App /></ThemeProvider>);
      await openContextOn('alpha.txt');
      fireEvent.click(screen.getByTestId('tab-context-rename'));

      const input = screen.getByTestId('rename-modal-input') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'beta.txt' } });
      fireEvent.click(screen.getByTestId('rename-modal-submit'));

      await waitFor(() =>
        expect(screen.getByTestId('rename-modal-error').textContent).toContain('already exists'),
      );
      expect(screen.getByTestId('rename-modal')).toBeTruthy();
      expect(screen.getByText('alpha.txt')).toBeTruthy();
    });

    it('rejects empty names client-side without calling the IPC', async () => {
      render(<ThemeProvider><App /></ThemeProvider>);
      await openContextOn('alpha.txt');
      fireEvent.click(screen.getByTestId('tab-context-rename'));

      const input = screen.getByTestId('rename-modal-input') as HTMLInputElement;
      fireEvent.change(input, { target: { value: '   ' } });
      fireEvent.click(screen.getByTestId('rename-modal-submit'));

      expect(screen.getByTestId('rename-modal-error').textContent).toContain('empty');
      expect((window as any).electronAPI.renameFile).not.toHaveBeenCalled();
    });

    it('rejects names containing path separators client-side', async () => {
      render(<ThemeProvider><App /></ThemeProvider>);
      await openContextOn('alpha.txt');
      fireEvent.click(screen.getByTestId('tab-context-rename'));

      const input = screen.getByTestId('rename-modal-input') as HTMLInputElement;
      fireEvent.change(input, { target: { value: '../evil.txt' } });
      fireEvent.click(screen.getByTestId('rename-modal-submit'));

      expect(screen.getByTestId('rename-modal-error').textContent).toContain('path separators');
      expect((window as any).electronAPI.renameFile).not.toHaveBeenCalled();
    });

    it('submits via Enter key', async () => {
      (window as any).electronAPI.renameFile = vi.fn().mockResolvedValue({ ok: true, newPath: '/tmp/notes.md' });

      render(<ThemeProvider><App /></ThemeProvider>);
      await openContextOn('alpha.txt');
      fireEvent.click(screen.getByTestId('tab-context-rename'));

      const input = screen.getByTestId('rename-modal-input') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'notes.md' } });
      fireEvent.keyDown(input, { key: 'Enter' });

      await waitFor(() => expect((window as any).electronAPI.renameFile).toHaveBeenCalledWith('/tmp/alpha.txt', 'notes.md'));
    });

    it('cancels via Escape key', async () => {
      render(<ThemeProvider><App /></ThemeProvider>);
      await openContextOn('alpha.txt');
      fireEvent.click(screen.getByTestId('tab-context-rename'));

      const input = screen.getByTestId('rename-modal-input') as HTMLInputElement;
      fireEvent.keyDown(input, { key: 'Escape' });

      await waitFor(() => expect(screen.queryByTestId('rename-modal')).toBeNull());
      expect((window as any).electronAPI.renameFile).not.toHaveBeenCalled();
    });
  });

  describe('move to main window (onAddTab)', () => {
    it('adds a new tab when onAddTab fires', async () => {
      let addTabCallback: ((tabData: unknown) => void) | null = null;
      (window as any).electronAPI.onAddTab = vi.fn((cb: (tabData: unknown) => void) => {
        addTabCallback = cb;
      });
      (window as any).electronAPI.loadSession.mockResolvedValue(null);

      render(<ThemeProvider><App /></ThemeProvider>);
      await waitFor(() => screen.getByTestId('status-bar'));

      const incomingTab = {
        id: 'popout-tab-1',
        title: 'popped.txt',
        filePath: '/tmp/popped.txt',
        content: 'hello',
        isDirty: false,
        eol: 'LF' as const,
      };
      await waitFor(() => expect(addTabCallback).not.toBeNull());
      addTabCallback!(incomingTab);

      await waitFor(() => expect(screen.getByText('popped.txt')).toBeTruthy());
    });

    it('does not duplicate a tab already present when onAddTab fires', async () => {
      let addTabCallback: ((tabData: unknown) => void) | null = null;
      (window as any).electronAPI.onAddTab = vi.fn((cb: (tabData: unknown) => void) => {
        addTabCallback = cb;
      });
      (window as any).electronAPI.loadSession.mockResolvedValue({
        activeTabId: 'tab-1',
        tabs: [{ id: 'tab-1', title: 'existing.txt', filePath: '/tmp/existing.txt', content: 'x', isDirty: false, eol: 'LF' }],
      });
      (window as any).electronAPI.readFile = vi.fn().mockResolvedValue({
        filePath: '/tmp/existing.txt', content: 'x', eol: 'LF',
      });

      render(<ThemeProvider><App /></ThemeProvider>);
      await waitFor(() => screen.getByText('existing.txt'));

      await waitFor(() => expect(addTabCallback).not.toBeNull());
      addTabCallback!({ id: 'tab-1', title: 'existing.txt', filePath: '/tmp/existing.txt', content: 'x', isDirty: false, eol: 'LF' });

      // Only one tab with this title
      expect(screen.getAllByText('existing.txt').length).toBe(1);
    });
  });

  describe('per-tab theme override (context menu)', () => {
    beforeEach(() => {
      (window as any).electronAPI.loadSession.mockResolvedValue({
        activeTabId: 'tab-1',
        tabs: [
          { id: 'tab-1', title: 'alpha.txt', filePath: '/tmp/alpha.txt', content: 'aaa', isDirty: false, eol: 'LF' },
        ],
      });
      (window as any).electronAPI.readFile = vi.fn().mockResolvedValue({
        filePath: '/tmp/alpha.txt', content: 'aaa', eol: 'LF',
      });
    });

    it('renders Light, Dark, and Use Default items with "Use Default" checked initially', async () => {
      render(<ThemeProvider><App /></ThemeProvider>);
      await waitFor(() => screen.getByText('alpha.txt'));

      const tab = screen.getByText('alpha.txt').closest('div[draggable]') as HTMLElement;
      fireEvent.contextMenu(tab);

      const lightItem = screen.getByTestId('tab-context-theme-light');
      const darkItem = screen.getByTestId('tab-context-theme-dark');
      const defaultItem = screen.getByTestId('tab-context-theme-default');

      expect(lightItem).toBeTruthy();
      expect(darkItem).toBeTruthy();
      expect(defaultItem).toBeTruthy();

      expect(lightItem.getAttribute('aria-checked')).toBe('false');
      expect(darkItem.getAttribute('aria-checked')).toBe('false');
      expect(defaultItem.getAttribute('aria-checked')).toBe('true');
    });

    it('checkmark moves to Light after selecting it', async () => {
      render(<ThemeProvider><App /></ThemeProvider>);
      await waitFor(() => screen.getByText('alpha.txt'));

      const tab = screen.getByText('alpha.txt').closest('div[draggable]') as HTMLElement;
      fireEvent.contextMenu(tab);
      fireEvent.click(screen.getByTestId('tab-context-theme-light'));

      // Menu closes after selection
      await waitFor(() => expect(screen.queryByTestId('tab-context-menu')).toBeNull());

      // Re-open and verify state
      fireEvent.contextMenu(tab);
      expect(screen.getByTestId('tab-context-theme-light').getAttribute('aria-checked')).toBe('true');
      expect(screen.getByTestId('tab-context-theme-dark').getAttribute('aria-checked')).toBe('false');
      expect(screen.getByTestId('tab-context-theme-default').getAttribute('aria-checked')).toBe('false');
    });

    it('"Use Default" clears a previously set override', async () => {
      render(<ThemeProvider><App /></ThemeProvider>);
      await waitFor(() => screen.getByText('alpha.txt'));

      const tab = screen.getByText('alpha.txt').closest('div[draggable]') as HTMLElement;

      fireEvent.contextMenu(tab);
      fireEvent.click(screen.getByTestId('tab-context-theme-dark'));

      fireEvent.contextMenu(tab);
      expect(screen.getByTestId('tab-context-theme-dark').getAttribute('aria-checked')).toBe('true');

      fireEvent.click(screen.getByTestId('tab-context-theme-default'));

      fireEvent.contextMenu(tab);
      expect(screen.getByTestId('tab-context-theme-default').getAttribute('aria-checked')).toBe('true');
      expect(screen.getByTestId('tab-context-theme-dark').getAttribute('aria-checked')).toBe('false');
    });
  });

  describe('close active tab (Cmd/Ctrl+W) & reopen closed tab (Cmd/Ctrl+Shift+T)', () => {
    const makeSession = () => ({
      activeTabId: 'tab-2',
      tabs: [
        { id: 'tab-1', title: 'alpha.txt', filePath: '/tmp/alpha.txt', content: 'aaa', isDirty: false, eol: 'LF' },
        { id: 'tab-2', title: 'beta.txt',  filePath: '/tmp/beta.txt',  content: 'bbb', isDirty: false, eol: 'LF' },
        { id: 'tab-3', title: 'gamma.txt', filePath: '/tmp/gamma.txt', content: 'ccc', isDirty: false, eol: 'LF' },
      ],
    });

    beforeEach(() => {
      (window as any).electronAPI.loadSession.mockResolvedValue(makeSession());
      (window as any).electronAPI.readFile = vi.fn().mockImplementation(async (fp: string) => ({
        filePath: fp,
        content: fp.includes('alpha') ? 'aaa' : fp.includes('beta') ? 'bbb' : 'ccc',
        eol: 'LF',
      }));
    });

    it('closes the active tab when onCloseTab fires', async () => {
      let closeTabCb: (() => void) | null = null;
      (window as any).electronAPI.onCloseTab = vi.fn((cb: () => void) => {
        closeTabCb = cb;
      });

      render(<ThemeProvider><App /></ThemeProvider>);
      await waitFor(() => screen.getByText('beta.txt'));
      await waitFor(() => expect(closeTabCb).not.toBeNull());

      act(() => {
        closeTabCb!();
      });

      await waitFor(() => expect(screen.queryByText('beta.txt')).toBeNull());
      expect(screen.getByText('alpha.txt')).toBeTruthy();
      expect(screen.getByText('gamma.txt')).toBeTruthy();
    });

    it('reopens recently closed tabs in LIFO order when onReopenClosedTab fires', async () => {
      let closeTabCb: (() => void) | null = null;
      let reopenTabCb: (() => void) | null = null;
      (window as any).electronAPI.onCloseTab = vi.fn((cb: () => void) => {
        closeTabCb = cb;
      });
      (window as any).electronAPI.onReopenClosedTab = vi.fn((cb: () => void) => {
        reopenTabCb = cb;
      });

      render(<ThemeProvider><App /></ThemeProvider>);
      await waitFor(() => screen.getByText('beta.txt'));
      await waitFor(() => screen.getByText('gamma.txt'));
      await waitFor(() => expect(closeTabCb).not.toBeNull());
      await waitFor(() => expect(reopenTabCb).not.toBeNull());

      // Close active tab (beta.txt), then close new active tab (gamma.txt)
      act(() => { closeTabCb!(); });
      await waitFor(() => expect(screen.queryByText('beta.txt')).toBeNull());

      act(() => { closeTabCb!(); });
      await waitFor(() => expect(screen.queryByText('gamma.txt')).toBeNull());

      // First reopen should restore gamma.txt (last closed)
      act(() => { reopenTabCb!(); });
      await waitFor(() => expect(screen.getByText('gamma.txt')).toBeTruthy());
      expect(screen.queryByText('beta.txt')).toBeNull();

      // Second reopen should restore beta.txt
      act(() => { reopenTabCb!(); });
      await waitFor(() => expect(screen.getByText('beta.txt')).toBeTruthy());
    });

    it('enables Reopen Closed Tab in the tab context menu after closing a tab and restores it on click', async () => {
      render(<ThemeProvider><App /></ThemeProvider>);
      await waitFor(() => screen.getByText('alpha.txt'));
      await waitFor(() => screen.getByText('beta.txt'));

      const alphaTab = screen.getByText('alpha.txt').closest('div[draggable]') as HTMLElement;
      fireEvent.contextMenu(alphaTab);

      // Initially no closed tabs -> disabled
      const reopenItemInitial = screen.getByTestId('tab-context-reopen-closed');
      expect(reopenItemInitial.getAttribute('aria-disabled')).toBe('true');

      // Close beta.txt via context menu
      const betaTab = screen.getByText('beta.txt').closest('div[draggable]') as HTMLElement;
      fireEvent.contextMenu(betaTab);
      fireEvent.click(screen.getByTestId('tab-context-close'));
      await waitFor(() => expect(screen.queryByText('beta.txt')).toBeNull());

      // Open context menu on alpha.txt -> Reopen Closed Tab is now enabled
      fireEvent.contextMenu(alphaTab);
      const reopenItemAfter = screen.getByTestId('tab-context-reopen-closed');
      expect(reopenItemAfter.getAttribute('aria-disabled')).toBe('false');

      fireEvent.click(reopenItemAfter);
      await waitFor(() => expect(screen.getByText('beta.txt')).toBeTruthy());
    });

    it('shows shortcut tooltips on tab bar buttons and opens Keyboard Shortcuts modal on onOpenShortcuts', async () => {
      let openShortcutsCb: (() => void) | null = null;
      (window as any).electronAPI.onOpenShortcuts = vi.fn((cb: () => void) => {
        openShortcutsCb = cb;
      });

      render(<ThemeProvider><App /></ThemeProvider>);
      await waitFor(() => screen.getByText('alpha.txt'));

      expect(screen.getByTestId('add-tab-button').title).toBe('New Tab (Ctrl+N)');
      expect(screen.getByTestId('close-tab-btn-tab-1').title).toBe('Close Tab (Ctrl+W)');

      await waitFor(() => expect(openShortcutsCb).not.toBeNull());
      act(() => {
        openShortcutsCb!();
      });

      await waitFor(() => expect(screen.getByTestId('shortcuts-modal')).toBeTruthy());
    });

    it('opens Getting Started & Help modal via onOpenHelp IPC and does not render the tab-bar ? button', async () => {
      let openHelpCb: (() => void) | null = null;
      (window as any).electronAPI.onOpenHelp = vi.fn((cb: () => void) => {
        openHelpCb = cb;
      });

      render(<ThemeProvider><App /></ThemeProvider>);
      await waitFor(() => screen.getByText('alpha.txt'));

      expect(screen.queryByTestId('help-toggle')).toBeNull();

      await waitFor(() => expect(openHelpCb).not.toBeNull());
      act(() => {
        openHelpCb!();
      });
      await waitFor(() => expect(screen.getByTestId('help-modal')).toBeTruthy());

      fireEvent.click(screen.getByTestId('help-close-btn'));
      await waitFor(() => expect(screen.queryByTestId('help-modal')).toBeNull());
    });
  });

  describe('Phase 1 — File & Tab Workflow (Multi-file Open, Save All, Path Utilities, External Watch)', () => {
    it('opens multiple files at once when openFileDialog returns multiple files', async () => {
      let openFileCb: (() => void) | null = null;
      (window as any).electronAPI.onOpenFile = vi.fn((cb: () => void) => {
        openFileCb = cb;
      });
      (window as any).electronAPI.openFileDialog = vi.fn().mockResolvedValue([
        { filePath: '/tmp/one.txt', content: 'one', eol: 'LF' },
        { filePath: '/tmp/two.txt', content: 'two', eol: 'CRLF' },
      ]);

      render(<ThemeProvider><App /></ThemeProvider>);
      await waitFor(() => expect(openFileCb).not.toBeNull());

      await act(async () => {
        await openFileCb!();
      });

      await waitFor(() => expect(screen.getByText('one.txt')).toBeTruthy());
      expect(screen.getByText('two.txt')).toBeTruthy();
    });

    it('opens each file in a new tab when multiple files are dragged and dropped, even when dataTransfer.files is cleared after the synchronous drop handler', async () => {
      (window as any).electronAPI.getPathForFile = vi.fn((file: File) => `/tmp/${file.name}`);
      (window as any).electronAPI.readFile = vi.fn().mockImplementation(async (fp: string) => {
        // Yield a macrotask to simulate async IPC and ensure dataTransfer.files
        // has already been cleared by the browser after synchronous dispatch.
        await new Promise(resolve => setTimeout(resolve, 0));
        return {
          filePath: fp,
          content: `content of ${fp}`,
          eol: 'LF',
        };
      });

      render(<ThemeProvider><App /></ThemeProvider>);
      await waitFor(() => screen.getByText(/Untitled/));

      const file1 = new File(['a'], 'drop-one.txt', { type: 'text/plain' });
      const file2 = new File(['b'], 'drop-two.txt', { type: 'text/plain' });
      const file3 = new File(['c'], 'drop-three.txt', { type: 'text/plain' });

      const liveFiles = [file1, file2, file3];
      const dropEvent = new Event('drop', { bubbles: true, cancelable: true }) as any;
      dropEvent.dataTransfer = {
        types: ['Files'],
        files: liveFiles,
      };

      await act(async () => {
        window.dispatchEvent(dropEvent);
        // Simulate Chromium clearing DataTransfer.files once the drop event finishes dispatching
        liveFiles.length = 0;
      });

      await waitFor(() => expect(screen.getByText('drop-one.txt')).toBeTruthy());
      await waitFor(() => expect(screen.getByText('drop-two.txt')).toBeTruthy());
      await waitFor(() => expect(screen.getByText('drop-three.txt')).toBeTruthy());

      expect((window as any).electronAPI.readFile).toHaveBeenCalledTimes(3);
      expect((window as any).electronAPI.readFile).toHaveBeenCalledWith('/tmp/drop-one.txt', { trackRecent: true });
      expect((window as any).electronAPI.readFile).toHaveBeenCalledWith('/tmp/drop-two.txt', { trackRecent: true });
      expect((window as any).electronAPI.readFile).toHaveBeenCalledWith('/tmp/drop-three.txt', { trackRecent: true });
    });

    it('deduplicates already-open or duplicate files when dropping multiple files', async () => {
      (window as any).electronAPI.loadSession.mockResolvedValueOnce({
        activeTabId: 'tab-existing',
        tabs: [
          {
            id: 'tab-existing',
            title: 'existing.txt',
            filePath: '/tmp/existing.txt',
            content: 'existing content',
            isDirty: false,
            eol: 'LF',
          },
        ],
      });
      (window as any).electronAPI.getPathForFile = vi.fn((file: File) => `/tmp/${file.name}`);
      (window as any).electronAPI.readFile = vi.fn().mockImplementation(async (fp: string) => ({
        filePath: fp,
        content: `content of ${fp}`,
        eol: 'LF',
      }));

      render(<ThemeProvider><App /></ThemeProvider>);
      await waitFor(() => screen.getByText('existing.txt'));
      (window as any).electronAPI.readFile.mockClear();

      const existingFile = new File(['e'], 'existing.txt', { type: 'text/plain' });
      const newFile = new File(['n'], 'fresh.txt', { type: 'text/plain' });
      const dupNewFile = new File(['n'], 'fresh.txt', { type: 'text/plain' });

      const dropEvent = new Event('drop', { bubbles: true, cancelable: true }) as any;
      dropEvent.dataTransfer = {
        types: ['Files'],
        files: [existingFile, newFile, dupNewFile],
      };

      await act(async () => {
        window.dispatchEvent(dropEvent);
      });

      await waitFor(() => expect(screen.getByText('fresh.txt')).toBeTruthy());
      expect(screen.getAllByText('existing.txt')).toHaveLength(1);
      expect(screen.getAllByText('fresh.txt')).toHaveLength(1);
      expect((window as any).electronAPI.readFile).toHaveBeenCalledTimes(1);
      expect((window as any).electronAPI.readFile).toHaveBeenCalledWith('/tmp/fresh.txt', { trackRecent: true });
    });

    it('does nothing when openFileDialog resolves null or an empty list (CR-13)', async () => {
      let openFileCb: (() => void) | null = null;
      (window as any).electronAPI.onOpenFile = vi.fn((cb: () => void) => {
        openFileCb = cb;
      });
      (window as any).electronAPI.openFileDialog = vi.fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce([]);

      render(<ThemeProvider><App /></ThemeProvider>);
      await waitFor(() => expect(openFileCb).not.toBeNull());
      await waitFor(() => screen.getByText(/Untitled/));
      const tabCount = screen.getAllByTestId(/^close-tab-btn-/).length;

      await act(async () => {
        await openFileCb!();
        await openFileCb!();
      });

      expect((window as any).electronAPI.openFileDialog).toHaveBeenCalledTimes(2);
      expect(screen.getAllByTestId(/^close-tab-btn-/).length).toBe(tabCount);
    });

    it('Save All saves all dirty tabs and leaves clean tabs untouched', async () => {
      let saveAllCb: (() => void) | null = null;
      (window as any).electronAPI.onSaveAllFiles = vi.fn((cb: () => void) => {
        saveAllCb = cb;
      });
      (window as any).electronAPI.loadSession.mockResolvedValue({
        activeTabId: 'tab-1',
        tabs: [
          { id: 'tab-1', title: 'dirty1.txt', filePath: '/tmp/dirty1.txt', content: 'new1', isDirty: true, eol: 'LF' },
          { id: 'tab-2', title: 'clean.txt',  filePath: '/tmp/clean.txt',  content: 'clean', isDirty: false, eol: 'LF' },
          { id: 'tab-3', title: 'dirty2.txt', filePath: '/tmp/dirty2.txt', content: 'new2', isDirty: true, eol: 'CRLF' },
        ],
      });
      (window as any).electronAPI.readFile = vi.fn().mockResolvedValue({
        filePath: '/tmp/clean.txt',
        content: 'clean',
        eol: 'LF',
      });
      (window as any).electronAPI.saveFileDialog = vi.fn().mockImplementation(async (fp: string) => fp);

      render(<ThemeProvider><App /></ThemeProvider>);
      await waitFor(() => screen.getByText(/dirty1\.txt.*\*/));
      await waitFor(() => screen.getByText(/dirty2\.txt.*\*/));
      await waitFor(() => expect(saveAllCb).not.toBeNull());

      await act(async () => {
        await saveAllCb!();
      });

      expect((window as any).electronAPI.saveFileDialog).toHaveBeenCalledTimes(2);
      expect((window as any).electronAPI.saveFileDialog).toHaveBeenCalledWith('/tmp/dirty1.txt', 'new1', 'LF');
      expect((window as any).electronAPI.saveFileDialog).toHaveBeenCalledWith('/tmp/dirty2.txt', 'new2', 'CRLF');
      await waitFor(() => expect(screen.queryByText(/\*/)).toBeNull());
    });

    it('supports Copy Full Path, Copy Filename, Reveal in Finder / Explorer, and Open in Integrated / External Terminal in tab context menu', async () => {
      (window as any).electronAPI.ptyCreate
        .mockResolvedValueOnce({ ok: true, id: 1, cwd: '/tmp', shell: 'zsh' })
        .mockResolvedValueOnce({ ok: true, id: 2, cwd: '/Users/me', shell: 'zsh' });
      (window as any).electronAPI.loadSession.mockResolvedValue({
        activeTabId: 'tab-1',
        tabs: [
          { id: 'tab-1', title: 'alpha.txt', filePath: '/tmp/alpha.txt', content: 'aaa', isDirty: false, eol: 'LF' },
          { id: 'tab-2', title: 'Untitled',  filePath: null,             content: '',    isDirty: false, eol: 'LF' },
        ],
      });
      (window as any).electronAPI.readFile = vi.fn().mockResolvedValue({
        filePath: '/tmp/alpha.txt',
        content: 'aaa',
        eol: 'LF',
      });

      render(<ThemeProvider><App /></ThemeProvider>);
      await waitFor(() => screen.getByText('alpha.txt'));

      const alphaTab = screen.getByText('alpha.txt').closest('div[draggable]') as HTMLElement;

      fireEvent.contextMenu(alphaTab);
      fireEvent.click(screen.getByTestId('tab-context-copy-path'));
      await waitFor(() => expect((window as any).electronAPI.copyToClipboard).toHaveBeenCalledWith('/tmp/alpha.txt'));

      fireEvent.contextMenu(alphaTab);
      fireEvent.click(screen.getByTestId('tab-context-copy-filename'));
      await waitFor(() => expect((window as any).electronAPI.copyToClipboard).toHaveBeenCalledWith('alpha.txt'));

      fireEvent.contextMenu(alphaTab);
      fireEvent.click(screen.getByTestId('tab-context-reveal-in-folder'));
      await waitFor(() => expect((window as any).electronAPI.showItemInFolder).toHaveBeenCalledWith('/tmp/alpha.txt'));

      fireEvent.contextMenu(alphaTab);
      fireEvent.click(screen.getByTestId('tab-context-open-in-external-terminal'));
      await waitFor(() => expect((window as any).electronAPI.openInTerminal).toHaveBeenCalledWith('/tmp/alpha.txt'));
      expect(screen.queryByTestId('tab-context-open-in-external-terminal')).toBeNull();

      fireEvent.contextMenu(alphaTab);
      fireEvent.click(screen.getByTestId('tab-context-open-in-integrated-terminal'));
      await waitFor(() => expect((window as any).electronAPI.ptyCreate).toHaveBeenCalledWith({ cwd: '/tmp/alpha.txt', cols: 80, rows: 24 }));
      await waitFor(() => expect(screen.getByTestId('terminal-panel')).toBeTruthy());

      // For Untitled tab, Copy Full Path and Reveal in Folder are disabled, but both
      // terminal items stay enabled and open in the home folder (null path).
      const untitledTab = screen.getByText('Untitled').closest('div[draggable]') as HTMLElement;
      fireEvent.contextMenu(untitledTab);
      expect(screen.getByTestId('tab-context-copy-path').getAttribute('aria-disabled')).toBe('true');
      expect(screen.getByTestId('tab-context-reveal-in-folder').getAttribute('aria-disabled')).toBe('true');
      expect(screen.getByTestId('tab-context-copy-filename').getAttribute('aria-disabled')).toBeNull();
      expect(screen.getByTestId('tab-context-open-in-external-terminal').getAttribute('aria-disabled')).toBeNull();
      expect(screen.getByTestId('tab-context-open-in-integrated-terminal').getAttribute('aria-disabled')).toBeNull();
      fireEvent.click(screen.getByTestId('tab-context-open-in-external-terminal'));
      await waitFor(() => expect((window as any).electronAPI.openInTerminal).toHaveBeenLastCalledWith(null));

      fireEvent.contextMenu(untitledTab);
      fireEvent.click(screen.getByTestId('tab-context-open-in-integrated-terminal'));
      await waitFor(() => expect((window as any).electronAPI.ptyCreate).toHaveBeenLastCalledWith({ cwd: null, cols: 80, rows: 24 }));
      expect((window as any).electronAPI.openInTerminal).toHaveBeenCalledTimes(2);
      expect((window as any).electronAPI.ptyCreate).toHaveBeenCalledTimes(2);
    });

    it('auto-reloads clean tabs on external change, prompts on dirty tabs, and marks deleted files dirty', async () => {
      let extChangeCb: ((data: { filePath: string; content: string; eol: 'LF' | 'CRLF' }) => void) | null = null;
      let extDeleteCb: ((data: { filePath: string }) => void) | null = null;
      (window as any).electronAPI.onExternalFileChange = vi.fn((cb) => { extChangeCb = cb; });
      (window as any).electronAPI.onExternalFileDelete = vi.fn((cb) => { extDeleteCb = cb; });
      (window as any).electronAPI.loadSession.mockResolvedValue({
        activeTabId: 'tab-1',
        tabs: [
          { id: 'tab-1', title: 'clean.txt', filePath: '/tmp/clean.txt', content: 'old', isDirty: false, eol: 'LF' },
          { id: 'tab-2', title: 'dirty.txt', filePath: '/tmp/dirty.txt', content: 'my edits', isDirty: true, eol: 'LF' },
        ],
      });
      (window as any).electronAPI.readFile = vi.fn().mockResolvedValue({
        filePath: '/tmp/clean.txt',
        content: 'old',
        eol: 'LF',
      });

      render(<ThemeProvider><App /></ThemeProvider>);
      await waitFor(() => screen.getByText('clean.txt'));
      await waitFor(() => expect(extChangeCb).not.toBeNull());
      await waitFor(() => expect(extDeleteCb).not.toBeNull());

      // Sync watched files should have been called with both file paths
      expect((window as any).electronAPI.syncWatchedFiles).toHaveBeenCalledWith([
        { filePath: '/tmp/clean.txt', encoding: 'utf-8' },
        { filePath: '/tmp/dirty.txt', encoding: 'utf-8' },
      ]);

      // 1. Clean tab auto-reloads without prompting
      await act(async () => {
        await extChangeCb!({ filePath: '/tmp/clean.txt', content: 'externally updated!', eol: 'LF' });
      });
      expect((window as any).electronAPI.confirmReloadExternalChange).not.toHaveBeenCalled();
      await waitFor(() => expect(screen.getByTestId('status-total-characters').textContent).toBe('Chars 19'));

      // 2. Dirty tab prompts user; when user chooses 'reload', dirty flag clears
      (window as any).electronAPI.confirmReloadExternalChange = vi.fn().mockResolvedValue('reload');
      await act(async () => {
        await extChangeCb!({ filePath: '/tmp/dirty.txt', content: 'disk version', eol: 'LF' });
      });
      expect((window as any).electronAPI.confirmReloadExternalChange).toHaveBeenCalledWith('dirty.txt');
      await waitFor(() => expect(screen.queryByText(/dirty\.txt.*\*/)).toBeNull());

      // 3. External file deletion marks clean.txt as dirty
      act(() => {
        extDeleteCb!({ filePath: '/tmp/clean.txt' });
      });
      await waitFor(() => expect(screen.getByText(/clean\.txt.*\*/)).toBeTruthy());
    });

    it('shows one reload prompt per dirty file and applies the latest disk content (CR-16)', async () => {
      let extChangeCb: ((data: { filePath: string; content: string; eol: 'LF' | 'CRLF' }) => Promise<void>) | null = null;
      (window as any).electronAPI.onExternalFileChange = vi.fn((cb) => { extChangeCb = cb; });
      (window as any).electronAPI.loadSession.mockResolvedValue({
        activeTabId: 'tab-1',
        tabs: [
          { id: 'tab-1', title: 'dirty.txt', filePath: '/tmp/dirty.txt', content: 'my edits', isDirty: true, eol: 'LF' },
        ],
      });
      let resolvePrompt: (decision: 'reload' | 'keep') => void = () => {};
      const confirmReload = vi.fn(
        () => new Promise<'reload' | 'keep'>(resolve => { resolvePrompt = resolve; }),
      );
      (window as any).electronAPI.confirmReloadExternalChange = confirmReload;

      render(<ThemeProvider><App /></ThemeProvider>);
      await waitFor(() => screen.getByText(/dirty\.txt/));
      await waitFor(() => expect(extChangeCb).not.toBeNull());

      let first: Promise<void> | undefined;
      await act(async () => {
        first = extChangeCb!({ filePath: '/tmp/dirty.txt', content: 'disk v1', eol: 'LF' });
        await extChangeCb!({ filePath: '/tmp/dirty.txt', content: 'disk v2', eol: 'LF' });
        await extChangeCb!({ filePath: '/tmp/dirty.txt', content: 'disk version 3', eol: 'LF' });
      });
      expect(confirmReload).toHaveBeenCalledTimes(1);

      await act(async () => {
        resolvePrompt('reload');
        await first;
      });
      await waitFor(() => expect(screen.getByTestId('status-total-characters').textContent).toBe('Chars 14'));
      expect(screen.queryByText(/dirty\.txt.*\*/)).toBeNull();

      // Once the prompt is resolved, a later change on a dirty tab prompts again.
      act(() => {
        capturedEditorOnChange!('new local edits');
      });
      await waitFor(() => expect(screen.getByText(/dirty\.txt.*\*/)).toBeTruthy());
      let second: Promise<void> | undefined;
      await act(async () => {
        second = extChangeCb!({ filePath: '/tmp/dirty.txt', content: 'disk v4', eol: 'LF' });
      });
      expect(confirmReload).toHaveBeenCalledTimes(2);
      await act(async () => {
        resolvePrompt('keep');
        await second;
      });
      expect(screen.getByTestId('status-total-characters').textContent).toBe('Chars 15');
      expect(screen.getByText(/dirty\.txt.*\*/)).toBeTruthy();
    });
  });

  describe('Phase 2 — Search, Navigation & Text Manipulation', () => {
    it('opens Go to Line modal when clicking status bar cursor position or via menu IPC and jumps to line', async () => {
      let goToLineCb: (() => void) | null = null;
      (window as any).electronAPI.onGoToLine = vi.fn((cb) => { goToLineCb = cb; });
      (window as any).electronAPI.loadSession.mockResolvedValue({
        activeTabId: 'tab-1',
        tabs: [
          {
            id: 'tab-1',
            title: 'lines.txt',
            filePath: null,
            content: 'l1\nl2\nl3\nl4\nl5',
            isDirty: true,
            eol: 'LF',
          },
        ],
      });

      render(<ThemeProvider><App /></ThemeProvider>);
      await waitFor(() => screen.getByTestId('status-cursor-position'));

      // Click status bar Ln X, Col Y
      fireEvent.click(screen.getByTestId('status-cursor-position'));
      expect(screen.getByTestId('goto-line-modal')).toBeTruthy();

      const input = screen.getByTestId('goto-line-input');
      fireEvent.change(input, { target: { value: '4:2' } });
      fireEvent.click(screen.getByTestId('goto-line-submit'));

      expect(mockEditorInstance.setPosition).toHaveBeenCalledWith({ lineNumber: 4, column: 2 });
      expect(mockEditorInstance.revealLineInCenter).toHaveBeenCalledWith(4);
      expect(screen.getByTestId('status-cursor-position').textContent).toBe('Ln 4, Col 2');

      // Also opens via menu:goToLine IPC
      act(() => {
        goToLineCb?.();
      });
      expect(screen.getByTestId('goto-line-modal')).toBeTruthy();
    });

    it('toggles Show Whitespace & EOL from status bar button and menu IPC', async () => {
      let toggleWsCb: (() => void) | null = null;
      (window as any).electronAPI.onToggleWhitespace = vi.fn((cb) => { toggleWsCb = cb; });

      render(<ThemeProvider><App /></ThemeProvider>);
      await waitFor(() => screen.getByTestId('whitespace-toggle'));

      const statusBar = screen.getByTestId('status-bar');
      const wsBtn = screen.getByTestId('whitespace-toggle');
      expect(statusBar.contains(wsBtn)).toBe(true);
      expect(wsBtn.getAttribute('aria-pressed')).toBe('false');
      expect(screen.queryByTestId('status-whitespace-indicator')).toBeNull();

      fireEvent.click(wsBtn);
      expect(wsBtn.getAttribute('aria-pressed')).toBe('true');
      expect(screen.getByTestId('status-whitespace-indicator').textContent).toContain('WS+EOL (LF)');

      act(() => {
        toggleWsCb?.();
      });
      expect(wsBtn.getAttribute('aria-pressed')).toBe('false');
    });

    it('runs Line & Text Operations via menu:textOperation IPC', async () => {
      let textOpCb: ((op: string) => void) | null = null;
      (window as any).electronAPI.onTextOperation = vi.fn((cb) => { textOpCb = cb; });
      (window as any).electronAPI.loadSession.mockResolvedValue({
        activeTabId: 'tab-1',
        tabs: [
          {
            id: 'tab-1',
            title: 'ops.txt',
            filePath: '/tmp/ops.txt',
            content: 'c  \na\nb\na',
            isDirty: false,
            eol: 'LF',
          },
        ],
      });
      (window as any).electronAPI.readFile = vi.fn().mockResolvedValue({
        filePath: '/tmp/ops.txt',
        content: 'c  \na\nb\na',
        eol: 'LF',
      });

      render(<ThemeProvider><App /></ThemeProvider>);
      await waitFor(() => screen.getByText('ops.txt'));

      act(() => {
        textOpCb?.('trimTrailingWhitespace');
      });
      await waitFor(() => expect(screen.getByTestId('status-total-characters').textContent).toBe('Chars 7'));

      act(() => {
        textOpCb?.('removeDuplicateLines');
      });
      await waitFor(() => expect(screen.getByTestId('status-total-characters').textContent).toBe('Chars 5'));
    });

    it('searches and replaces across all open tabs using FindInTabsPanel via onFindInTabs IPC and does not render the tab-bar search button', async () => {
      let findInTabsCb: (() => void) | null = null;
      (window as any).electronAPI.onFindInTabs = vi.fn((cb: () => void) => {
        findInTabsCb = cb;
      });
      (window as any).electronAPI.loadSession.mockResolvedValue({
        activeTabId: 'tab-1',
        tabs: [
          { id: 'tab-1', title: 'first.txt',  filePath: null, content: 'apple pie',  isDirty: true, eol: 'LF' },
          { id: 'tab-2', title: 'second.txt', filePath: null, content: 'apple tart', isDirty: true, eol: 'LF' },
        ],
      });

      render(<ThemeProvider><App /></ThemeProvider>);
      await waitFor(() => screen.getByText(/first\.txt/));

      expect(screen.queryByTestId('find-in-tabs-toggle')).toBeNull();

      // Open panel via Edit -> Find in Open Tabs menu IPC
      await waitFor(() => expect(findInTabsCb).not.toBeNull());
      act(() => {
        findInTabsCb!();
      });
      expect(screen.getByTestId('find-in-tabs-panel')).toBeTruthy();

      fireEvent.change(screen.getByTestId('find-in-tabs-query'), { target: { value: 'apple' } });
      await waitFor(() =>
        expect(screen.getByTestId('find-in-tabs-summary').textContent).toContain('2 matches in 2 tabs'),
      );

      // Click match in second.txt to switch active tab and jump to match
      fireEvent.click(screen.getByTestId('find-in-tabs-match-tab-2-0'));
      await waitFor(() => expect(screen.getByTestId('status-total-characters').textContent).toBe('Chars 10'));

      // Replace all across tabs
      fireEvent.change(screen.getByTestId('find-in-tabs-replace'), { target: { value: 'pear' } });
      fireEvent.click(screen.getByTestId('find-in-tabs-replace-all-btn'));

      await waitFor(() => expect(screen.getByTestId('status-total-characters').textContent).toBe('Chars 9'));
    });
  });

  describe('Phase 3: View & Encoding', () => {
    it('responds to Always on Top menu IPC updates and does not render the tab-bar pin button', async () => {
      let alwaysOnTopChangedCb: ((flag: boolean) => void) | undefined;
      (window as any).electronAPI.onAlwaysOnTopChanged = vi.fn((cb: (flag: boolean) => void) => {
        alwaysOnTopChangedCb = cb;
      });

      render(<ThemeProvider><App /></ThemeProvider>);
      await waitFor(() => screen.getByTestId('split-view-toggle'));

      expect(screen.queryByTestId('always-on-top-toggle')).toBeNull();
      expect(screen.queryByTestId('status-always-on-top')).toBeNull();

      // Menu event enables Always on Top
      act(() => {
        alwaysOnTopChangedCb?.(true);
      });
      await waitFor(() => expect(screen.getByTestId('status-always-on-top').textContent).toContain('Pinned'));

      // Menu event disables Always on Top
      act(() => {
        alwaysOnTopChangedCb?.(false);
      });
      await waitFor(() => expect(screen.queryByTestId('status-always-on-top')).toBeNull());
    });

    it('toggles Side-by-Side Split View and Diff View across two open tabs', async () => {
      let toggleSplitCb: (() => void) | undefined;
      let toggleDiffCb: (() => void) | undefined;
      (window as any).electronAPI.onToggleSplitView = vi.fn((cb: () => void) => {
        toggleSplitCb = cb;
      });
      (window as any).electronAPI.onToggleDiffView = vi.fn((cb: () => void) => {
        toggleDiffCb = cb;
      });
      (window as any).electronAPI.loadSession.mockResolvedValue({
        activeTabId: 'tab-1',
        tabs: [
          { id: 'tab-1', title: 'left.ts',  filePath: null, content: 'const a = 1;', isDirty: true, eol: 'LF' },
          { id: 'tab-2', title: 'right.ts', filePath: null, content: 'const a = 2;', isDirty: true, eol: 'LF' },
        ],
      });

      render(<ThemeProvider><App /></ThemeProvider>);
      await waitFor(() => screen.getByText(/left\.ts/));

      // Top-right toolbar has split-view-toggle only (no separate diff-view-toggle)
      expect(screen.queryByTestId('diff-view-toggle')).toBeNull();

      // Enter Split View via toolbar toggle
      fireEvent.click(screen.getByTestId('split-view-toggle'));
      expect(screen.getByTestId('split-view-toggle').getAttribute('aria-pressed')).toBe('true');
      expect(screen.getByTestId('split-diff-toolbar')).toBeTruthy();
      expect(screen.getByTestId('split-view-container')).toBeTruthy();
      expect(screen.getByTestId('split-left-pane')).toBeTruthy();
      expect(screen.getByTestId('split-right-pane')).toBeTruthy();
      expect((screen.getByTestId('secondary-tab-select') as HTMLSelectElement).value).toBe('tab-2');

      // Swap left and right tabs
      fireEvent.click(screen.getByTestId('swap-split-tabs-button'));
      expect(screen.getByTestId('split-primary-tab-label').textContent).toBe('right.ts');
      expect((screen.getByTestId('secondary-tab-select') as HTMLSelectElement).value).toBe('tab-1');

      // Switch to Diff View via Diff mode button; split-view-toggle stays active
      fireEvent.click(screen.getByTestId('diff-mode-button'));
      expect(screen.getByTestId('split-view-toggle').getAttribute('aria-pressed')).toBe('true');
      expect(screen.getByTestId('diff-view-container')).toBeTruthy();
      expect(screen.getByTestId('mock-monaco-diff-editor')).toBeTruthy();
      expect(capturedDiffProps?.original).toBe('const a = 2;');
      expect(capturedDiffProps?.modified).toBe('const a = 1;');

      // Toggle Diff View off via menu IPC callback
      act(() => {
        toggleDiffCb?.();
      });
      expect(screen.queryByTestId('diff-view-container')).toBeNull();
      expect(screen.queryByTestId('split-diff-toolbar')).toBeNull();

      // Re-open Split View via menu IPC and close via Close button
      act(() => {
        toggleSplitCb?.();
      });
      expect(screen.getByTestId('split-view-container')).toBeTruthy();
      fireEvent.click(screen.getByTestId('close-split-diff-button'));
      expect(screen.queryByTestId('split-view-container')).toBeNull();
    });

    it('opens Split View and Diff View from the tab context menu', async () => {
      (window as any).electronAPI.loadSession.mockResolvedValue({
        activeTabId: 'tab-1',
        tabs: [
          { id: 'tab-1', title: 'one.txt', filePath: null, content: 'one', isDirty: true, eol: 'LF' },
          { id: 'tab-2', title: 'two.txt', filePath: null, content: 'two', isDirty: true, eol: 'LF' },
        ],
      });

      render(<ThemeProvider><App /></ThemeProvider>);
      await waitFor(() => screen.getByText(/two\.txt/));

      // Right-click two.txt -> Open in Split View
      fireEvent.contextMenu(screen.getByText(/two\.txt/));
      fireEvent.click(screen.getByTestId('tab-context-split-view'));
      expect(screen.getByTestId('split-view-container')).toBeTruthy();

      // Right-click two.txt -> Compare with Active Tab
      fireEvent.contextMenu(screen.getAllByText(/two\.txt/)[0]);
      fireEvent.click(screen.getByTestId('tab-context-compare-active'));
      expect(screen.getByTestId('diff-view-container')).toBeTruthy();
    });

    it('syncs edits from the Diff View modified side back to the compared tab (CR-01)', async () => {
      (window as any).electronAPI.loadSession.mockResolvedValue({
        activeTabId: 'tab-1',
        tabs: [
          { id: 'tab-1', title: 'one.txt', filePath: null, content: 'one', isDirty: true, eol: 'LF' },
          { id: 'tab-2', title: 'two.txt', filePath: '/tmp/two.txt', content: 'two', isDirty: false, eol: 'LF' },
        ],
      });
      (window as any).electronAPI.readFile = vi.fn().mockResolvedValue({
        filePath: '/tmp/two.txt',
        content: 'two',
        eol: 'LF',
      });

      render(<ThemeProvider><App /></ThemeProvider>);
      await waitFor(() => screen.getByText(/two\.txt/));

      fireEvent.click(screen.getByTestId('split-view-toggle'));
      fireEvent.click(screen.getByTestId('diff-mode-button'));
      expect(screen.getByTestId('diff-readonly-hint')).toBeTruthy();
      expect(capturedDiffProps?.options?.originalEditable).toBe(false);
      expect(typeof capturedDiffProps?.onMount).toBe('function');

      let contentListener: (() => void) | undefined;
      let modifiedValue = 'two';
      const dispose = vi.fn();
      const mockDiffEditor = {
        getModifiedEditor: () => ({
          getValue: () => modifiedValue,
          onDidChangeModelContent: (cb: () => void) => {
            contentListener = cb;
            return { dispose };
          },
        }),
      };

      act(() => {
        capturedDiffProps.onMount(mockDiffEditor);
      });
      expect(contentListener).toBeDefined();

      modifiedValue = 'two edited';
      act(() => {
        contentListener?.();
      });

      await waitFor(() => expect(capturedDiffProps?.modified).toBe('two edited'));
      // The compared tab is now dirty; the primary tab is untouched.
      expect(screen.getAllByText(/two\.txt \*/).length).toBeGreaterThan(0);
      expect(capturedDiffProps?.original).toBe('one');

      // Remounting disposes the previous listener.
      act(() => {
        capturedDiffProps.onMount(mockDiffEditor);
      });
      expect(dispose).toHaveBeenCalledTimes(1);
    });

    it('keeps the status bar cursor in sync with the split view left editor (CR-17)', async () => {
      (window as any).electronAPI.loadSession.mockResolvedValue({
        activeTabId: 'tab-1',
        tabs: [
          { id: 'tab-1', title: 'one.txt', filePath: null, content: 'a\nb\nc\nd', isDirty: true, eol: 'LF' },
          { id: 'tab-2', title: 'two.txt', filePath: null, content: 'two', isDirty: true, eol: 'LF' },
        ],
      });

      render(<ThemeProvider><App /></ThemeProvider>);
      await waitFor(() => screen.getByText(/two\.txt/));

      fireEvent.click(screen.getByTestId('split-view-toggle'));
      expect(screen.getByTestId('split-left-pane')).toBeTruthy();
      expect(cursorPositionListener).toBeDefined();
      expect(cursorSelectionListener).toBeDefined();

      setMockCursorPosition(3, 2);
      act(() => {
        emitCursorPositionChange();
      });
      expect(screen.getByTestId('status-cursor-position').textContent).toBe('Ln 3, Col 2');
    });

    it('points Find, Go to Line and the status bar at the diff view original editor (CR-17)', async () => {
      let findCb: (() => void) | null = null;
      let goToLineCb: (() => void) | null = null;
      (window as any).electronAPI.onFind = vi.fn((cb: () => void) => { findCb = cb; });
      (window as any).electronAPI.onGoToLine = vi.fn((cb: () => void) => { goToLineCb = cb; });
      (window as any).electronAPI.loadSession.mockResolvedValue({
        activeTabId: 'tab-1',
        tabs: [
          { id: 'tab-1', title: 'one.txt', filePath: null, content: 'a\nb\nc\nd', isDirty: true, eol: 'LF' },
          { id: 'tab-2', title: 'two.txt', filePath: null, content: 'two', isDirty: true, eol: 'LF' },
        ],
      });

      render(<ThemeProvider><App /></ThemeProvider>);
      await waitFor(() => screen.getByText(/two\.txt/));
      fireEvent.click(screen.getByTestId('split-view-toggle'));
      fireEvent.click(screen.getByTestId('diff-mode-button'));
      expect(screen.getByTestId('diff-view-container')).toBeTruthy();

      let originalCursorListener: ((e: { position: { lineNumber: number; column: number } }) => void) | undefined;
      const findRun = vi.fn();
      const originalEditor = {
        getAction: vi.fn(() => ({ run: findRun })),
        getPosition: vi.fn(() => ({ lineNumber: 1, column: 1 })),
        getSelection: vi.fn(() => null),
        getModel: vi.fn(() => null),
        setPosition: vi.fn(),
        revealLineInCenter: vi.fn(),
        focus: vi.fn(),
        onDidChangeCursorPosition: vi.fn((cb: typeof originalCursorListener) => {
          originalCursorListener = cb;
          return { dispose: vi.fn() };
        }),
        onDidChangeCursorSelection: vi.fn(() => ({ dispose: vi.fn() })),
      };
      const mockDiffEditor = {
        getOriginalEditor: () => originalEditor,
        getModifiedEditor: () => ({
          getValue: () => 'two',
          onDidChangeModelContent: () => ({ dispose: vi.fn() }),
        }),
      };
      act(() => {
        capturedDiffProps.onMount(mockDiffEditor);
      });

      // Find targets the mounted diff editor, not the disposed single-view editor.
      mockEditorInstance.getAction.mockClear();
      act(() => {
        findCb!();
      });
      expect(originalEditor.getAction).toHaveBeenCalledWith('actions.find');
      expect(findRun).toHaveBeenCalled();
      expect(mockEditorInstance.getAction).not.toHaveBeenCalled();

      // Go to Line jumps in the original editor.
      act(() => {
        goToLineCb!();
      });
      fireEvent.change(screen.getByTestId('goto-line-input'), { target: { value: '3' } });
      fireEvent.click(screen.getByTestId('goto-line-submit'));
      expect(originalEditor.setPosition).toHaveBeenCalledWith({ lineNumber: 3, column: 1 });

      // Cursor moves in the original editor update the status bar.
      act(() => {
        originalCursorListener!({ position: { lineNumber: 2, column: 5 } });
      });
      expect(screen.getByTestId('status-cursor-position').textContent).toBe('Ln 2, Col 5');
    });

    const latinSession = (overrides: Record<string, unknown> = {}) => ({
      activeTabId: 'tab-1',
      tabs: [
        {
          id: 'tab-1',
          title: 'latin.txt',
          filePath: '/tmp/latin.txt',
          content: 'Price €100',
          isDirty: false,
          eol: 'LF',
          encoding: 'utf-8-bom',
          ...overrides,
        },
      ],
    });

    const chooseEncoding = async (action: 'reopen' | 'save', encoding: string) => {
      fireEvent.click(screen.getByTestId('encoding-selector-button'));
      fireEvent.click(screen.getByTestId(`encoding-action-${action}`));
      // The handlers are async (dialogs, IPC); let them settle.
      await act(async () => {
        fireEvent.click(screen.getByTestId(`encoding-option-${encoding}`));
      });
    };

    it('Save with Encoding does not touch the buffer until the save succeeds (CR-08)', async () => {
      const api = (window as any).electronAPI;
      api.loadSession.mockResolvedValue(latinSession({ content: 'Price 100' }));
      api.readFile = vi.fn().mockResolvedValue({
        filePath: '/tmp/latin.txt',
        content: 'Price 100',
        eol: 'LF',
        encoding: 'utf-8-bom',
      });
      api.saveFileDialog = vi.fn().mockResolvedValue(null);
      api.confirmLossyEncoding = vi.fn();

      render(<ThemeProvider><App /></ThemeProvider>);
      await waitFor(() => expect(screen.getByTestId('encoding-selector-button').textContent).toBe('UTF-8 with BOM'));

      // Cancelled save: encoding unchanged.
      await chooseEncoding('save', 'iso-8859-1');
      expect(api.saveFileDialog).toHaveBeenCalledWith('/tmp/latin.txt', 'Price 100', 'LF', 'iso-8859-1');
      expect(screen.getByTestId('encoding-selector-button').textContent).toBe('UTF-8 with BOM');
      // Nothing to lose, so no warning.
      expect(api.confirmLossyEncoding).not.toHaveBeenCalled();

      // Successful save: encoding switches, tab stays clean.
      api.saveFileDialog.mockResolvedValue('/tmp/latin.txt');
      await chooseEncoding('save', 'iso-8859-1');
      await waitFor(() => expect(screen.getByTestId('encoding-selector-button').textContent).toBe('ISO-8859-1'));
      expect(screen.queryByText(/latin\.txt \*/)).toBeNull();
    });

    it('warns before saving characters the encoding cannot represent (CR-08)', async () => {
      let saveFileCb: (() => Promise<void>) | undefined;
      const api = (window as any).electronAPI;
      api.onSaveFile = vi.fn((cb: () => Promise<void>) => {
        saveFileCb = cb;
      });
      api.loadSession.mockResolvedValue(latinSession());
      api.readFile = vi.fn().mockResolvedValue({
        filePath: '/tmp/latin.txt',
        content: 'Price €100',
        eol: 'LF',
        encoding: 'utf-8-bom',
      });
      api.saveFileDialog = vi.fn().mockResolvedValue('/tmp/latin.txt');
      api.confirmLossyEncoding = vi.fn().mockResolvedValue(false);

      render(<ThemeProvider><App /></ThemeProvider>);
      await waitFor(() => screen.getByTestId('encoding-selector-button'));

      // User cancels the warning: nothing is written, buffer and encoding unchanged.
      await chooseEncoding('save', 'iso-8859-1');
      expect(api.confirmLossyEncoding).toHaveBeenCalledWith('latin.txt', 'ISO-8859-1', 1);
      expect(api.saveFileDialog).not.toHaveBeenCalled();
      expect(screen.getByTestId('encoding-selector-button').textContent).toBe('UTF-8 with BOM');
      expect(screen.getByTestId('status-total-characters').textContent).toBe('Chars 10');

      // User accepts: the file is saved and the buffer reflects what was written.
      api.confirmLossyEncoding.mockResolvedValue(true);
      await chooseEncoding('save', 'iso-8859-1');
      expect(api.saveFileDialog).toHaveBeenCalledWith('/tmp/latin.txt', 'Price €100', 'LF', 'iso-8859-1');
      await waitFor(() => expect(screen.getByTestId('encoding-selector-button').textContent).toBe('ISO-8859-1'));
      expect(screen.queryByText(/latin\.txt \*/)).toBeNull();

      // A later plain save of new unrepresentable text also warns.
      api.confirmLossyEncoding.mockClear().mockResolvedValue(false);
      api.saveFileDialog.mockClear();
      act(() => {
        capturedEditorOnChange?.('Price ?100 ✓');
      });
      await act(async () => {
        await saveFileCb?.();
      });
      expect(api.confirmLossyEncoding).toHaveBeenCalledWith('latin.txt', 'ISO-8859-1', 1);
      expect(api.saveFileDialog).not.toHaveBeenCalled();
      expect(screen.getByText(/latin\.txt \*/)).toBeTruthy();
    });

    it('Reopen with Encoding re-reads the file with the chosen encoding (CR-08)', async () => {
      const api = (window as any).electronAPI;
      api.loadSession.mockResolvedValue(latinSession({ content: 'cafÃ©', encoding: 'iso-8859-1' }));
      api.readFile = vi.fn().mockResolvedValue({
        filePath: '/tmp/latin.txt',
        content: 'cafÃ©',
        eol: 'LF',
        encoding: 'iso-8859-1',
      });
      api.saveFileDialog = vi.fn();

      render(<ThemeProvider><App /></ThemeProvider>);
      await waitFor(() => expect(screen.getByTestId('encoding-selector-button').textContent).toBe('ISO-8859-1'));

      api.readFile.mockResolvedValue({ filePath: '/tmp/latin.txt', content: 'café', eol: 'LF', encoding: 'utf-8' });
      await chooseEncoding('reopen', 'utf-8');

      expect(api.readFile).toHaveBeenLastCalledWith('/tmp/latin.txt', { encoding: 'utf-8' });
      await waitFor(() => expect(screen.getByTestId('encoding-selector-button').textContent).toBe('UTF-8'));
      expect(screen.getByTestId('status-total-characters').textContent).toBe('Chars 4');
      expect(screen.queryByText(/latin\.txt \*/)).toBeNull();
      expect(api.saveFileDialog).not.toHaveBeenCalled();
    });

    it('Reopen with Encoding asks before discarding unsaved changes (CR-08)', async () => {
      const api = (window as any).electronAPI;
      api.loadSession.mockResolvedValue(latinSession({ content: 'my edits', isDirty: true, encoding: 'utf-8' }));
      api.readFile = vi.fn().mockResolvedValue({ filePath: '/tmp/latin.txt', content: 'disk', eol: 'LF', encoding: 'utf-16le' });
      api.confirmReopenWithEncoding = vi.fn().mockResolvedValue(false);

      render(<ThemeProvider><App /></ThemeProvider>);
      await waitFor(() => screen.getByTestId('encoding-selector-button'));

      await chooseEncoding('reopen', 'utf-16le');
      expect(api.confirmReopenWithEncoding).toHaveBeenCalledWith('latin.txt', 'UTF-16 LE');
      expect(api.readFile).not.toHaveBeenCalled();
      expect(screen.getByTestId('encoding-selector-button').textContent).toBe('UTF-8');

      api.confirmReopenWithEncoding.mockResolvedValue(true);
      await chooseEncoding('reopen', 'utf-16le');
      expect(api.readFile).toHaveBeenCalledWith('/tmp/latin.txt', { encoding: 'utf-16le' });
      await waitFor(() => expect(screen.getByTestId('encoding-selector-button').textContent).toBe('UTF-16 LE'));
      expect(screen.queryByText(/latin\.txt \*/)).toBeNull();
    });

    it('applies the encoding reported with an external change and re-syncs the watcher (CR-09)', async () => {
      let extChangeCb: ((data: unknown) => Promise<void>) | null = null;
      const api = (window as any).electronAPI;
      api.onExternalFileChange = vi.fn((cb) => { extChangeCb = cb; });
      api.loadSession.mockResolvedValue(latinSession({ content: 'same', encoding: 'utf-8' }));
      api.readFile = vi.fn().mockResolvedValue({ filePath: '/tmp/latin.txt', content: 'same', eol: 'LF', encoding: 'utf-8' });

      render(<ThemeProvider><App /></ThemeProvider>);
      await waitFor(() => expect(screen.getByTestId('encoding-selector-button').textContent).toBe('UTF-8'));
      await waitFor(() => expect(extChangeCb).not.toBeNull());
      expect(api.syncWatchedFiles).toHaveBeenLastCalledWith([{ filePath: '/tmp/latin.txt', encoding: 'utf-8' }]);

      // Same text, but the file was re-saved as UTF-16 LE by another program.
      await act(async () => {
        await extChangeCb!({ filePath: '/tmp/latin.txt', content: 'same', eol: 'LF', encoding: 'utf-16le' });
      });
      await waitFor(() => expect(screen.getByTestId('encoding-selector-button').textContent).toBe('UTF-16 LE'));
      expect(api.confirmReloadExternalChange).not.toHaveBeenCalled();
      expect(screen.queryByText(/latin\.txt \*/)).toBeNull();
      await waitFor(() =>
        expect(api.syncWatchedFiles).toHaveBeenLastCalledWith([{ filePath: '/tmp/latin.txt', encoding: 'utf-16le' }]),
      );
    });
  });

  describe('close active tab from the menu in split view (CR-10)', () => {
    it('reassigns the secondary pane when Cmd/Ctrl+W closes it', async () => {
      let closeTabCb: (() => void) | undefined;
      let reopenCb: (() => void) | undefined;
      const api = (window as any).electronAPI;
      api.onCloseTab = vi.fn((cb: () => void) => { closeTabCb = cb; });
      api.onReopenClosedTab = vi.fn((cb: () => void) => { reopenCb = cb; });
      api.loadSession.mockResolvedValue({
        activeTabId: 'tab-1',
        tabs: [
          { id: 'tab-1', title: 'one.txt', filePath: null, content: 'one', isDirty: false, eol: 'LF' },
          { id: 'tab-2', title: 'two.txt', filePath: null, content: 'two', isDirty: false, eol: 'LF' },
          { id: 'tab-3', title: 'three.txt', filePath: null, content: 'three', isDirty: false, eol: 'LF' },
        ],
      });

      render(<ThemeProvider><App /></ThemeProvider>);
      await waitFor(() => screen.getByText(/three\.txt/));

      fireEvent.click(screen.getByTestId('split-view-toggle'));
      const select = () => screen.getByTestId('secondary-tab-select') as HTMLSelectElement;
      fireEvent.change(select(), { target: { value: 'tab-3' } });
      expect(select().value).toBe('tab-3');

      // Activate the secondary tab, then close it with the menu shortcut.
      const tabThree = screen.getAllByText(/three\.txt/)
        .map(el => el.closest('div[draggable]'))
        .find(Boolean) as HTMLElement;
      fireEvent.click(tabThree);
      await act(async () => {
        closeTabCb?.();
      });
      await waitFor(() => expect(screen.queryAllByText(/three\.txt/).length).toBe(0));
      expect(select().value).toBe('tab-1');

      // Reopening the closed tab must not pull it back into the secondary pane.
      await act(async () => {
        reopenCb?.();
      });
      await waitFor(() => expect(screen.getAllByText(/three\.txt/).length).toBeGreaterThan(0));
      expect(select().value).toBe('tab-1');
    });
  });

  describe('CSV Grid Editor integration', () => {
    it('opens .csv tabs in the interactive grid editor and toggles between Grid View and Raw Text', async () => {
      const api = (window as any).electronAPI;
      api.loadSession.mockResolvedValue({
        activeTabId: 'csv-1',
        tabs: [
          {
            id: 'csv-1',
            title: 'users.csv',
            filePath: '/tmp/users.csv',
            content: 'Name,Role\nAlice,Admin\nBob,User',
            isDirty: false,
            eol: 'LF',
          },
        ],
      });
      api.readFile = vi.fn().mockResolvedValue({
        filePath: '/tmp/users.csv',
        content: 'Name,Role\nAlice,Admin\nBob,User',
        eol: 'LF',
        encoding: 'utf-8',
      });

      render(<ThemeProvider><App /></ThemeProvider>);
      await waitFor(() => expect(screen.getByTestId('csv-grid-editor')).toBeTruthy());

      // Edit cell in grid and verify tab becomes dirty
      fireEvent.change(screen.getByTestId('csv-cell-1-1'), { target: { value: 'Owner' } });
      expect(screen.getByText(/users\.csv \*/)).toBeTruthy();

      // Switch to Raw Text view and back to Grid View
      fireEvent.click(screen.getByTestId('csv-switch-to-text-button'));
      expect(screen.getByTestId('csv-raw-text-banner')).toBeTruthy();

      fireEvent.click(screen.getByTestId('csv-switch-to-grid-button'));
      expect(screen.getByTestId('csv-grid-editor')).toBeTruthy();
      expect((screen.getByTestId('csv-cell-1-1') as HTMLInputElement).value).toBe('Owner');
    });
  });

  describe('File Explorer Sidebar integration', () => {
    it('toggles File Explorer from the toolbar and View menu, opens a tab folder from the tab context menu, and opens files on click', async () => {
      let toggleExplorerCb: (() => void) | undefined;
      const api = (window as any).electronAPI;
      api.onToggleExplorer = vi.fn((cb: () => void) => {
        toggleExplorerCb = cb;
      });
      api.readDirectory = vi.fn(async (dirPath: string) => ({
        ok: true,
        dirPath,
        name: 'samples',
        entries: [
          { name: 'sample.cs', path: '/workspace/samples/sample.cs', isDirectory: false },
          { name: 'sample.py', path: '/workspace/samples/sample.py', isDirectory: false },
          { name: 'sample.sql', path: '/workspace/samples/sample.sql', isDirectory: false },
        ],
      }));
      api.readFile = vi.fn(async (filePath: string) => ({
        filePath,
        content: filePath.endsWith('.py')
          ? 'print("hi")'
          : filePath.endsWith('.sql')
          ? 'SELECT 1;'
          : 'class Program {}',
        eol: 'LF',
        encoding: 'utf-8',
      }));
      api.loadSession.mockResolvedValue({
        activeTabId: 'tab-1',
        tabs: [
          {
            id: 'tab-1',
            title: 'sample.cs',
            filePath: '/workspace/samples/sample.cs',
            content: 'class Program {}',
            isDirty: false,
            eol: 'LF',
          },
        ],
      });

      render(<ThemeProvider><App /></ThemeProvider>);
      await waitFor(() => screen.getByText(/sample\.cs/));

      // Initially hidden
      expect(screen.queryByTestId('file-explorer-sidebar')).toBeNull();

      // Toggle on via View -> Toggle File Explorer menu IPC
      act(() => {
        toggleExplorerCb?.();
      });
      const explorerSidebar = screen.getByTestId('file-explorer-sidebar');
      const workspaceRow = screen.getByTestId('workspace-row');
      const editorColumn = screen.getByTestId('editor-column');
      const tabBar = screen.getByTestId('tab-bar');
      expect(explorerSidebar).toBeTruthy();
      // VS Code layout: Explorer sidebar is a sibling of the editor column (not below the tab bar),
      // and the tab bar lives inside the editor column to the right of the Explorer.
      expect(workspaceRow.firstElementChild).toBe(explorerSidebar);
      expect(workspaceRow.contains(editorColumn)).toBe(true);
      expect(editorColumn.contains(tabBar)).toBe(true);
      expect(explorerSidebar.contains(tabBar)).toBe(false);

      // Toggle off via toolbar button
      fireEvent.click(screen.getByTestId('explorer-toggle'));
      expect(screen.queryByTestId('file-explorer-sidebar')).toBeNull();

      // Right-click tab -> "Open Folder in File Explorer"
      fireEvent.contextMenu(screen.getByText(/sample\.cs/));
      fireEvent.click(screen.getByTestId('tab-context-open-folder-in-explorer'));

      await waitFor(() => {
        expect(screen.getByTestId('file-explorer-sidebar')).toBeTruthy();
        expect(screen.getByTestId('explorer-file-sample.py')).toBeTruthy();
      });

      // Single-clicking sample.py opens it as an italic preview tab
      fireEvent.click(screen.getByTestId('explorer-file-sample.py'));
      await waitFor(() => {
        expect(screen.getAllByText(/sample\.py/).length).toBeGreaterThan(0);
      });
      const previewTitle = screen.getAllByText(/sample\.py/).find(
        el => el.getAttribute('data-testid')?.startsWith('tab-title-'),
      ) as HTMLElement;
      expect(previewTitle.style.fontStyle).toBe('italic');

      // Single-clicking sample.sql replaces the unpinned sample.py preview tab
      fireEvent.click(screen.getByTestId('explorer-file-sample.sql'));
      await waitFor(() => {
        const sqlTitle = screen.getAllByText(/sample\.sql/).find(
          el => el.getAttribute('data-testid')?.startsWith('tab-title-'),
        ) as HTMLElement;
        expect(sqlTitle).toBeTruthy();
        expect(sqlTitle.style.fontStyle).toBe('italic');
      });
      expect(
        screen.queryAllByText(/sample\.py/).filter(el => el.getAttribute('data-testid')?.startsWith('tab-title-')).length,
      ).toBe(0);

      // Double-clicking the preview tab pins it (title becomes non-italic)
      const sqlTabTitle = screen.getAllByText(/sample\.sql/).find(
        el => el.getAttribute('data-testid')?.startsWith('tab-title-'),
      ) as HTMLElement;
      fireEvent.doubleClick(sqlTabTitle);
      expect(sqlTabTitle.style.fontStyle).toBe('normal');

      // Now single-clicking sample.py keeps sample.sql open and adds sample.py as a new preview tab
      fireEvent.click(screen.getByTestId('explorer-file-sample.py'));
      await waitFor(() => {
        expect(
          screen.getAllByText(/sample\.py/).some(el => el.getAttribute('data-testid')?.startsWith('tab-title-')),
        ).toBe(true);
      });
      expect(
        screen.getAllByText(/sample\.sql/).some(el => el.getAttribute('data-testid')?.startsWith('tab-title-')),
      ).toBe(true);
    });
  });

  describe('Markdown Preview popup integration', () => {
    it('shows the Preview button and context menu option for Markdown tabs and syncs live updates', async () => {
      const api = (window as any).electronAPI;
      let markdownMenuCb: (() => void) | undefined;
      let previewVisibilityCb: ((isOpen: boolean) => void) | undefined;
      api.onMarkdownPreview = vi.fn((cb: () => void) => {
        markdownMenuCb = cb;
      });
      api.onMarkdownPreviewVisibilityChanged = vi.fn((cb: (isOpen: boolean) => void) => {
        previewVisibilityCb = cb;
      });
      let previewOpenState = false;
      api.openMarkdownPreview = vi.fn().mockImplementation(async () => {
        previewOpenState = !previewOpenState;
        return previewOpenState;
      });
      api.updateMarkdownPreview = vi.fn().mockResolvedValue(undefined);
      api.readFile = vi.fn(async (filePath: string) => ({
        filePath,
        content: filePath.endsWith('.md') ? '# Initial Doc' : 'console.log(1);',
        eol: 'LF',
        encoding: 'utf-8',
      }));
      api.loadSession.mockResolvedValue({
        activeTabId: 'tab-md',
        tabs: [
          {
            id: 'tab-md',
            title: 'README.md',
            filePath: '/workspace/README.md',
            content: '# Initial Doc',
            isDirty: false,
            eol: 'LF',
          },
          {
            id: 'tab-js',
            title: 'index.js',
            filePath: '/workspace/index.js',
            content: 'console.log(1);',
            isDirty: false,
            eol: 'LF',
          },
        ],
      });

      render(<ThemeProvider><App /></ThemeProvider>);
      await waitFor(() => screen.getByText(/README\.md/));

      // Preview button is visible when README.md is active and starts unpressed
      const previewBtn = screen.getByTestId('markdown-preview-button');
      expect(previewBtn).toBeTruthy();
      expect(previewBtn.getAttribute('aria-pressed')).toBe('false');

      // First click opens the preview and marks the toggle button active
      fireEvent.click(previewBtn);
      expect(api.openMarkdownPreview).toHaveBeenCalledWith({
        title: 'README.md',
        filePath: '/workspace/README.md',
        content: '# Initial Doc',
        theme: 'dark',
      });
      await waitFor(() => expect(previewBtn.getAttribute('aria-pressed')).toBe('true'));

      // Second click toggles the preview closed
      fireEvent.click(previewBtn);
      await waitFor(() => expect(previewBtn.getAttribute('aria-pressed')).toBe('false'));

      // External close/open broadcast from main updates the button state
      act(() => {
        previewVisibilityCb?.(true);
      });
      expect(previewBtn.getAttribute('aria-pressed')).toBe('true');

      // Editing the markdown content sends a live update to the preview popup
      act(() => {
        capturedEditorOnChange?.('# Updated Live Content');
      });
      await waitFor(() => {
        expect(api.updateMarkdownPreview).toHaveBeenCalledWith({
          title: 'README.md',
          filePath: '/workspace/README.md',
          content: '# Updated Live Content',
          theme: 'dark',
        });
      });

      // Right-clicking README.md shows "Open Markdown Preview" in the tab context menu
      fireEvent.contextMenu(screen.getByText(/README\.md/));
      const contextItem = screen.getByTestId('tab-context-markdown-preview');
      expect(contextItem).toBeTruthy();
      fireEvent.click(contextItem);
      expect(api.openMarkdownPreview).toHaveBeenLastCalledWith({
        title: 'README.md',
        filePath: '/workspace/README.md',
        content: '# Updated Live Content',
        theme: 'dark',
      });

      // Triggering via View -> Open Markdown Preview menu IPC also toggles preview
      act(() => {
        markdownMenuCb?.();
      });
      expect(api.openMarkdownPreview).toHaveBeenCalledTimes(4);

      // Switching to a non-Markdown tab hides the toolbar Preview button and updates preview to unsupported
      fireEvent.click(screen.getByText(/index\.js/));
      expect(screen.queryByTestId('markdown-preview-button')).toBeNull();
      await waitFor(() => {
        expect(api.updateMarkdownPreview).toHaveBeenCalledWith({
          title: 'index.js',
          filePath: '/workspace/index.js',
          content: '',
          theme: 'dark',
          mode: 'unsupported',
        });
      });
    });

    it('shows the Preview button and context menu option for .html and .htm tabs and syncs live updates', async () => {
      const api = (window as any).electronAPI;
      api.openMarkdownPreview = vi.fn().mockResolvedValue(true);
      api.updateMarkdownPreview = vi.fn().mockResolvedValue(undefined);
      api.readFile = vi.fn(async (filePath: string) => ({
        filePath,
        content: '<h1>Hello HTM</h1>',
        eol: 'LF',
        encoding: 'utf-8',
      }));
      api.loadSession.mockResolvedValue({
        activeTabId: 'tab-htm',
        tabs: [
          {
            id: 'tab-htm',
            title: 'page.htm',
            filePath: '/workspace/page.htm',
            content: '<h1>Hello HTM</h1>',
            isDirty: false,
            eol: 'LF',
          },
        ],
      });

      render(<ThemeProvider><App /></ThemeProvider>);
      await waitFor(() => screen.getByText(/page\.htm/));

      const previewBtn = screen.getByTestId('markdown-preview-button');
      expect(previewBtn.getAttribute('aria-label')).toBe('Open HTML Preview');

      fireEvent.click(previewBtn);
      expect(api.openMarkdownPreview).toHaveBeenCalledWith({
        title: 'page.htm',
        filePath: '/workspace/page.htm',
        content: '<h1>Hello HTM</h1>',
        theme: 'dark',
        mode: 'html',
      });

      // Editing the HTML content sends a live update with mode: 'html'
      act(() => {
        capturedEditorOnChange?.('<h1>Updated HTM</h1>');
      });
      await waitFor(() => {
        expect(api.updateMarkdownPreview).toHaveBeenCalledWith({
          title: 'page.htm',
          filePath: '/workspace/page.htm',
          content: '<h1>Updated HTM</h1>',
          theme: 'dark',
          mode: 'html',
        });
      });

      // Right-clicking page.htm shows "Open HTML Preview" in the tab context menu
      fireEvent.contextMenu(screen.getByText(/page\.htm/));
      const contextItem = screen.getByTestId('tab-context-markdown-preview');
      expect(contextItem.textContent).toContain('Open HTML Preview');
    });
  });

  describe('Image Viewer and SVG Preview / Code View', () => {
    it('renders raster images in ImageViewer with zoom controls and status bar metadata', async () => {
      const api = (window as any).electronAPI;
      let externalChangeCb: ((data: any) => void) | null = null;
      api.onExternalFileChange = vi.fn((cb: (data: any) => void) => {
        externalChangeCb = cb;
      });
      api.readFile = vi.fn(async (filePath: string) => ({
        filePath,
        content: '',
        eol: 'LF',
        encoding: 'utf-8',
        byteSize: 4096,
      }));
      api.loadSession.mockResolvedValue({
        activeTabId: 'tab-png',
        tabs: [
          {
            id: 'tab-png',
            title: 'screenshot.png',
            filePath: '/workspace/screenshot.png',
            content: '',
            isDirty: false,
            eol: 'LF',
          },
        ],
      });

      render(<ThemeProvider><App /></ThemeProvider>);
      await waitFor(() => expect(screen.getByTestId('image-viewer')).toBeTruthy());

      expect(screen.getByTestId('image-format-badge').textContent).toBe('PNG');
      expect(screen.getByTestId('status-image-format').textContent).toBe('PNG Image');
      expect(screen.getByTestId('status-image-zoom').textContent).toBe('Zoom: Fit');
      expect(screen.queryByTestId('monaco-editor-mock')).toBeNull();

      // Zoom in updates both toolbar and status bar zoom indicator
      fireEvent.click(screen.getByTestId('image-zoom-in'));
      expect(screen.getByTestId('image-zoom-level').textContent).toBe('125%');
      await waitFor(() => {
        expect(screen.getByTestId('status-image-zoom').textContent).toBe('Zoom: 125%');
      });

      // External file change increments reloadToken (appends ?v=1 to asset URL)
      const img = screen.getByTestId('image-viewer-img') as HTMLImageElement;
      expect(img.getAttribute('src')).toBe('awapi-asset://local/workspace/screenshot.png');
      act(() => {
        externalChangeCb?.({
          filePath: '/workspace/screenshot.png',
          content: '',
          eol: 'LF',
          encoding: 'utf-8',
        });
      });
      expect(img.getAttribute('src')).toBe('awapi-asset://local/workspace/screenshot.png?v=1');
    });

    it('opens SVG files in Image Preview by default and toggles to XML Code View and back', async () => {
      const api = (window as any).electronAPI;
      const svgMarkup = '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><circle cx="32" cy="32" r="24"/></svg>';
      api.readFile = vi.fn(async (filePath: string) => ({
        filePath,
        content: svgMarkup,
        eol: 'LF',
        encoding: 'utf-8',
        byteSize: svgMarkup.length,
      }));
      api.loadSession.mockResolvedValue({
        activeTabId: 'tab-svg',
        tabs: [
          {
            id: 'tab-svg',
            title: 'logo.svg',
            filePath: '/workspace/logo.svg',
            content: svgMarkup,
            isDirty: false,
            eol: 'LF',
          },
        ],
      });

      render(<ThemeProvider><App /></ThemeProvider>);
      await waitFor(() => expect(screen.getByTestId('image-viewer')).toBeTruthy());
      expect(screen.getByTestId('image-format-badge').textContent).toBe('SVG');

      // Switch to XML Code View
      fireEvent.click(screen.getByTestId('svg-switch-to-code-button'));
      expect(screen.getByTestId('svg-code-view-banner')).toBeTruthy();
      expect(screen.queryByTestId('image-viewer')).toBeNull();
      expect(typeof capturedEditorOnChange).toBe('function');

      // Edit SVG XML in Code View and switch back to Image Preview
      const updatedSvg = '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128"/></svg>';
      act(() => {
        capturedEditorOnChange?.(updatedSvg);
      });
      fireEvent.click(screen.getByTestId('svg-switch-to-preview-button'));
      expect(screen.getByTestId('image-viewer')).toBeTruthy();
      const img = screen.getByTestId('image-viewer-img') as HTMLImageElement;
      expect(decodeURIComponent(img.getAttribute('src')!.replace('data:image/svg+xml;utf8,', ''))).toBe(updatedSvg);
    });
  });
});