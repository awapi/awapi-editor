import React from 'react';
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';

// Pop-out mode is decided at module load from the URL hash, so App is imported
// dynamically after the hash is set.
let App: React.FC;
let ThemeProvider: React.FC<{ children: React.ReactNode }>;
let capturedEditorOnChange: ((value: string | undefined) => void) | undefined;
let capturedEditorValue: string | undefined;

vi.mock('@monaco-editor/react', () => ({
  default: vi.fn((props: any) => {
    capturedEditorOnChange = props.onChange;
    capturedEditorValue = props.value;
    return null;
  }),
  DiffEditor: vi.fn(() => null),
}));

/** electronAPI mock: explicit overrides, and a no-op vi.fn for anything else. */
function createElectronApiMock(overrides: Record<string, unknown>) {
  const fns: Record<string | symbol, unknown> = { ...overrides };
  return new Proxy(fns, {
    get(target, prop) {
      if (!(prop in target)) target[prop] = vi.fn().mockResolvedValue(undefined);
      return target[prop];
    },
  });
}

describe('Pop-out window close protection (CR-05)', () => {
  let closeRequested: (() => Promise<void>) | undefined;
  let api: any;

  beforeAll(async () => {
    window.location.hash = '#popout';
    vi.resetModules();
    App = (await import('./App')).default;
    ThemeProvider = (await import('./theme/ThemeContext')).ThemeProvider as any;
  });

  beforeEach(() => {
    closeRequested = undefined;
    capturedEditorOnChange = undefined;
    api = createElectronApiMock({
      getPopoutData: vi.fn().mockResolvedValue({
        id: 'pop-1',
        title: 'notes.txt',
        filePath: '/tmp/notes.txt',
        content: 'hello',
        savedContent: 'hello',
        isDirty: false,
        eol: 'LF',
      }),
      onWindowCloseRequested: vi.fn((cb: () => Promise<void>) => {
        closeRequested = cb;
      }),
      setWindowDirty: vi.fn().mockResolvedValue(undefined),
      confirmWindowClose: vi.fn().mockResolvedValue(undefined),
      cancelWindowClose: vi.fn().mockResolvedValue(undefined),
      confirmUnsavedChanges: vi.fn().mockResolvedValue('cancel'),
      saveFileDialog: vi.fn().mockResolvedValue('/tmp/notes.txt'),
      loadSession: vi.fn().mockResolvedValue(null),
      getAlwaysOnTop: vi.fn().mockResolvedValue(false),
    });
    (window as any).electronAPI = api;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  const renderPopout = async () => {
    render(<ThemeProvider><App /></ThemeProvider>);
    await waitFor(() => expect(api.getPopoutData).toHaveBeenCalled());
    await waitFor(() => expect(capturedEditorOnChange).toBeDefined());
    expect(closeRequested).toBeDefined();
  };

  const editContent = async (value: string) => {
    act(() => {
      capturedEditorOnChange!(value);
    });
    await waitFor(() => expect(api.setWindowDirty).toHaveBeenLastCalledWith(true));
  };

  it('reports dirty state to main as the tab changes', async () => {
    await renderPopout();
    await waitFor(() => expect(api.setWindowDirty).toHaveBeenLastCalledWith(false));

    await editContent('hello world');

    act(() => {
      capturedEditorOnChange!('hello');
    });
    await waitFor(() => expect(api.setWindowDirty).toHaveBeenLastCalledWith(false));
  });

  it('keeps the window open when the user cancels', async () => {
    await renderPopout();
    await editContent('unsaved edit');
    api.confirmUnsavedChanges.mockResolvedValue('cancel');

    await act(async () => {
      await closeRequested!();
    });

    expect(api.confirmUnsavedChanges).toHaveBeenCalledWith('notes.txt');
    expect(api.confirmWindowClose).not.toHaveBeenCalled();
    // Lets main abort a main-window close that was waiting on this pop-out (CR-21).
    expect(api.cancelWindowClose).toHaveBeenCalledTimes(1);
  });

  it("closes without saving when the user chooses Don't Save", async () => {
    await renderPopout();
    await editContent('unsaved edit');
    api.confirmUnsavedChanges.mockResolvedValue('dont-save');

    await act(async () => {
      await closeRequested!();
    });

    expect(api.saveFileDialog).not.toHaveBeenCalled();
    expect(api.confirmWindowClose).toHaveBeenCalledTimes(1);
    expect(api.cancelWindowClose).not.toHaveBeenCalled();
  });

  it('saves before closing when the user chooses Save', async () => {
    await renderPopout();
    await editContent('saved edit');
    api.confirmUnsavedChanges.mockResolvedValue('save');

    await act(async () => {
      await closeRequested!();
    });

    expect(api.saveFileDialog).toHaveBeenCalledWith('/tmp/notes.txt', 'saved edit', 'LF');
    expect(api.confirmWindowClose).toHaveBeenCalledTimes(1);
  });

  it('does not close if saving is cancelled', async () => {
    await renderPopout();
    await editContent('saved edit');
    api.confirmUnsavedChanges.mockResolvedValue('save');
    api.saveFileDialog.mockResolvedValue(null);

    await act(async () => {
      await closeRequested!();
    });

    expect(api.confirmWindowClose).not.toHaveBeenCalled();
    expect(api.cancelWindowClose).toHaveBeenCalledTimes(1);
  });

  it('ignores repeated close requests while a prompt is already open', async () => {
    await renderPopout();
    await editContent('unsaved edit');
    let resolvePrompt: (choice: string) => void = () => {};
    api.confirmUnsavedChanges.mockImplementation(
      () => new Promise(resolve => { resolvePrompt = resolve; }),
    );

    let first: Promise<void> | undefined;
    await act(async () => {
      first = closeRequested!();
      await closeRequested!();
    });
    expect(api.confirmUnsavedChanges).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolvePrompt('dont-save');
      await first;
    });
    expect(api.confirmWindowClose).toHaveBeenCalledTimes(1);
  });
});

describe('Pop-out external change detection (CR-11)', () => {
  it('registers its file with the watcher and reloads it on external changes', async () => {
    let externalChange: ((data: unknown) => Promise<void>) | undefined;
    const api = createElectronApiMock({
      getPopoutData: vi.fn().mockResolvedValue({
        id: 'pop-2',
        title: 'watched.txt',
        filePath: '/tmp/watched.txt',
        content: 'v1',
        savedContent: 'v1',
        isDirty: false,
        eol: 'LF',
        encoding: 'iso-8859-1',
      }),
      onExternalFileChange: vi.fn((cb: (data: unknown) => Promise<void>) => {
        externalChange = cb;
      }),
      syncWatchedFiles: vi.fn().mockResolvedValue(undefined),
      loadSession: vi.fn().mockResolvedValue(null),
      getAlwaysOnTop: vi.fn().mockResolvedValue(false),
    }) as any;
    (window as any).electronAPI = api;

    render(<ThemeProvider><App /></ThemeProvider>);
    await waitFor(() =>
      expect(api.syncWatchedFiles).toHaveBeenLastCalledWith([
        { filePath: '/tmp/watched.txt', encoding: 'iso-8859-1' },
      ]),
    );
    expect(externalChange).toBeDefined();

    await act(async () => {
      await externalChange!({ filePath: '/tmp/watched.txt', content: 'v2 from disk', eol: 'LF', encoding: 'iso-8859-1' });
    });
    await waitFor(() => expect(capturedEditorValue).toBe('v2 from disk'));
  });
});

describe('popout test harness', () => {
  it('renders in pop-out mode (no tab bar)', async () => {
    (window as any).electronAPI = createElectronApiMock({
      getPopoutData: vi.fn().mockResolvedValue(null),
      getAlwaysOnTop: vi.fn().mockResolvedValue(false),
    });
    render(<ThemeProvider><App /></ThemeProvider>);
    await waitFor(() => expect((window as any).electronAPI.getPopoutData).toHaveBeenCalled());
    expect(screen.queryByTestId('add-tab-button')).toBeNull();
  });
});
