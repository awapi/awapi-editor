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
      onPopoutActiveTab: vi.fn(),
      removeListeners: vi.fn(),
      readFile: vi.fn().mockResolvedValue({ filePath: '/mock/path/file.txt', content: 'mock content' }),
      saveSession: vi.fn().mockResolvedValue(true),
      loadSession: vi.fn().mockResolvedValue(null), // no previous session by default
      getPopoutData: vi.fn().mockResolvedValue(null),
      moveToMain: vi.fn().mockResolvedValue(undefined),
      onMoveToMain: vi.fn(),
      onAddTab: vi.fn(),
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
});