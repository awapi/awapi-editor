import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ThemeProvider } from './theme/ThemeContext';
import FileExplorer, {
  OPEN_EDITORS_MAX_HEIGHT,
  normalizePathForCompare,
  getPathBasename,
  getParentDirPath,
  formatOpenEditorSubpath,
  type ExplorerEntry,
} from './FileExplorer';

describe('FileExplorer utility functions', () => {
  it('normalizes paths and extracts basenames and parent directories across OS separators', () => {
    expect(normalizePathForCompare('C:\\Projects\\awapi\\')).toBe('C:/Projects/awapi');
    expect(getPathBasename('C:\\Projects\\awapi\\awapi-editor')).toBe('awapi-editor');
    expect(getPathBasename('/Users/dev/project/')).toBe('project');
    expect(getParentDirPath('C:\\Projects\\awapi\\src\\App.tsx')).toBe('C:\\Projects\\awapi\\src');
    expect(getParentDirPath('/Users/dev/project/App.tsx')).toBe('/Users/dev/project');
  });

  it('formats Open Editors subpath relative to rootFolderPath when inside root, or full parent path when outside', () => {
    expect(
      formatOpenEditorSubpath(
        'C:\\Projects\\awapi\\src\\renderer\\src\\languages.test.ts',
        'C:\\Projects\\awapi',
      ),
    ).toBe('src\\renderer\\src');

    expect(
      formatOpenEditorSubpath('C:\\Projects\\awapi\\package.json', 'C:\\Projects\\awapi'),
    ).toBe('');

    expect(
      formatOpenEditorSubpath('/other/folder/notes.md', 'C:\\Projects\\awapi'),
    ).toBe('/other/folder');

    expect(formatOpenEditorSubpath(null, 'C:\\Projects\\awapi')).toBe('');
  });
});

describe('FileExplorer component', () => {
  const dirData = new Map<string, ExplorerEntry[]>();
  let dirChangeListener: ((dirPath: string) => void) | null = null;

  beforeEach(() => {
    dirData.clear();
    dirChangeListener = null;

    dirData.set('/workspace/awapi-editor', [
      { name: 'samples', path: '/workspace/awapi-editor/samples', isDirectory: true },
      { name: 'src', path: '/workspace/awapi-editor/src', isDirectory: true },
      { name: 'package.json', path: '/workspace/awapi-editor/package.json', isDirectory: false },
      { name: 'README.md', path: '/workspace/awapi-editor/README.md', isDirectory: false },
    ]);

    dirData.set('/workspace/awapi-editor/samples', [
      { name: 'sample.cs', path: '/workspace/awapi-editor/samples/sample.cs', isDirectory: false },
      { name: 'sample.py', path: '/workspace/awapi-editor/samples/sample.py', isDirectory: false },
    ]);

    (window as any).electronAPI = {
      readDirectory: vi.fn(async (dirPath: string) => {
        const entries = dirData.get(dirPath);
        if (!entries) return { ok: false, error: 'Directory not found' };
        return { ok: true, dirPath, name: getPathBasename(dirPath), entries };
      }),
      syncWatchedDirs: vi.fn(async () => {}),
      onExplorerDirChanged: vi.fn((cb: (dirPath: string) => void) => {
        dirChangeListener = cb;
        return () => {
          dirChangeListener = null;
        };
      }),
    };
  });

  it('renders nothing when isOpen is false', () => {
    render(
      <ThemeProvider>
        <FileExplorer
          isOpen={false}
          rootFolderPath="/workspace/awapi-editor"
          tabs={[]}
          activeTabId={null}
          onSelectTab={vi.fn()}
          onCloseTab={vi.fn()}
          onOpenFileFromTree={vi.fn()}
          onPickFolder={vi.fn()}
          onCloseExplorer={vi.fn()}
        />
      </ThemeProvider>,
    );
    expect(screen.queryByTestId('file-explorer-sidebar')).toBeNull();
  });

  it('shows Open Editors and an empty-folder prompt when no folder is selected', () => {
    const onSelectTab = vi.fn();
    const onCloseTab = vi.fn();
    const onPickFolder = vi.fn();

    render(
      <ThemeProvider>
        <FileExplorer
          isOpen={true}
          rootFolderPath={null}
          tabs={[
            {
              id: 'tab-1',
              title: 'languages.test.ts',
              filePath: '/workspace/awapi-editor/src/renderer/src/languages.test.ts',
              isDirty: true,
            },
          ]}
          activeTabId="tab-1"
          onSelectTab={onSelectTab}
          onCloseTab={onCloseTab}
          onOpenFileFromTree={vi.fn()}
          onPickFolder={onPickFolder}
          onCloseExplorer={vi.fn()}
        />
      </ThemeProvider>,
    );

    expect(screen.getByTestId('file-explorer-sidebar')).toBeTruthy();
    const openEditorsList = screen.getByTestId('explorer-open-editors-list');
    expect(openEditorsList.style.maxHeight).toBe(`${OPEN_EDITORS_MAX_HEIGHT}px`);
    expect(openEditorsList.style.overflowY).toBe('auto');

    // Drag the horizontal splitter between Open Editors and Folder Tree to resize
    const splitter = screen.getByTestId('explorer-sections-splitter');
    fireEvent.mouseDown(splitter, { clientY: 100 });
    fireEvent.mouseMove(window, { clientY: 160 });
    fireEvent.mouseUp(window);
    expect(openEditorsList.style.height).toBe(`${OPEN_EDITORS_MAX_HEIGHT + 60}px`);

    // Double-clicking the splitter resets back to auto-fit capped at OPEN_EDITORS_MAX_HEIGHT
    fireEvent.doubleClick(splitter);
    expect(openEditorsList.style.height).toBe('');
    expect(openEditorsList.style.maxHeight).toBe(`${OPEN_EDITORS_MAX_HEIGHT}px`);

    expect(screen.getByTestId('explorer-open-editor-tab-1')).toBeTruthy();
    expect(screen.getByTestId('explorer-open-editor-dirty-tab-1')).toBeTruthy();
    expect(screen.getByTestId('explorer-no-folder')).toBeTruthy();

    fireEvent.click(screen.getByTestId('explorer-open-editor-tab-1'));
    expect(onSelectTab).toHaveBeenCalledWith('tab-1');

    fireEvent.click(screen.getByTestId('explorer-close-editor-tab-1'));
    expect(onCloseTab).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('explorer-empty-open-folder-btn'));
    expect(onPickFolder).toHaveBeenCalledTimes(1);
  });

  it('loads root folder entries, expands subfolders on click, and opens files on click', async () => {
    const onOpenFileFromTree = vi.fn();

    render(
      <ThemeProvider>
        <FileExplorer
          isOpen={true}
          rootFolderPath="/workspace/awapi-editor"
          tabs={[
            {
              id: 'tab-1',
              title: 'languages.test.ts',
              filePath: '/workspace/awapi-editor/src/renderer/src/languages.test.ts',
              isDirty: true,
            },
          ]}
          activeTabId="tab-1"
          onSelectTab={vi.fn()}
          onCloseTab={vi.fn()}
          onOpenFileFromTree={onOpenFileFromTree}
          onPickFolder={vi.fn()}
          onCloseExplorer={vi.fn()}
        />
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('explorer-folder-samples')).toBeTruthy();
      expect(screen.getByTestId('explorer-file-package.json')).toBeTruthy();
    });

    // Relative subpath in Open Editors should be "src/renderer/src"
    expect(screen.getByTestId('explorer-open-editor-subpath-tab-1').textContent).toBe('src/renderer/src');
    // "src" folder has a dirty dot because tab-1 inside it is dirty
    expect(screen.getByTestId('explorer-folder-dirty-src')).toBeTruthy();

    // Click "samples" folder to expand it
    fireEvent.click(screen.getByTestId('explorer-folder-samples'));
    await waitFor(() => {
      expect(screen.getByTestId('explorer-file-sample.cs')).toBeTruthy();
      expect(screen.getByTestId('explorer-file-sample.py')).toBeTruthy();
    });

    // Single-click "sample.py" to open as preview; double-click to pin
    fireEvent.click(screen.getByTestId('explorer-file-sample.py'));
    expect(onOpenFileFromTree).toHaveBeenCalledWith('/workspace/awapi-editor/samples/sample.py', {
      preview: true,
    });

    fireEvent.doubleClick(screen.getByTestId('explorer-file-sample.py'));
    expect(onOpenFileFromTree).toHaveBeenCalledWith('/workspace/awapi-editor/samples/sample.py', {
      preview: false,
    });
  });

  it('automatically refreshes an expanded folder when a new file is saved or added to it', async () => {
    render(
      <ThemeProvider>
        <FileExplorer
          isOpen={true}
          rootFolderPath="/workspace/awapi-editor"
          tabs={[]}
          activeTabId={null}
          onSelectTab={vi.fn()}
          onCloseTab={vi.fn()}
          onOpenFileFromTree={vi.fn()}
          onPickFolder={vi.fn()}
          onCloseExplorer={vi.fn()}
        />
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('explorer-folder-samples')).toBeTruthy();
    });

    // Expand "samples"
    fireEvent.click(screen.getByTestId('explorer-folder-samples'));
    await waitFor(() => {
      expect(screen.getByTestId('explorer-file-sample.cs')).toBeTruthy();
    });
    expect(screen.queryByTestId('explorer-file-new-saved.sql')).toBeNull();

    // Simulate saving a new file into /workspace/awapi-editor/samples
    dirData.set('/workspace/awapi-editor/samples', [
      { name: 'new-saved.sql', path: '/workspace/awapi-editor/samples/new-saved.sql', isDirectory: false },
      { name: 'sample.cs', path: '/workspace/awapi-editor/samples/sample.cs', isDirectory: false },
      { name: 'sample.py', path: '/workspace/awapi-editor/samples/sample.py', isDirectory: false },
    ]);

    expect(dirChangeListener).not.toBeNull();
    dirChangeListener!('/workspace/awapi-editor/samples');

    await waitFor(() => {
      expect(screen.getByTestId('explorer-file-new-saved.sql')).toBeTruthy();
    });
  });

  it('supports right-click context menu: Open Folder (folders only), Rename, and Delete', async () => {
    const onChangeRootFolder = vi.fn();
    const onItemRenamed = vi.fn();
    const onItemDeleted = vi.fn();

    (window as any).electronAPI.renameFile = vi.fn(async (oldPath: string, newName: string) => {
      const parent = getParentDirPath(oldPath);
      const newPath = `${parent}/${newName}`;
      const list = dirData.get(parent) ?? [];
      dirData.set(
        parent,
        list.map(item => (item.path === oldPath ? { ...item, name: newName, path: newPath } : item)),
      );
      return { ok: true, newPath };
    });

    (window as any).electronAPI.deletePath = vi.fn(async (targetPath: string) => {
      const parent = getParentDirPath(targetPath);
      const list = dirData.get(parent) ?? [];
      dirData.set(
        parent,
        list.filter(item => item.path !== targetPath),
      );
      return { ok: true };
    });

    render(
      <ThemeProvider>
        <FileExplorer
          isOpen={true}
          rootFolderPath="/workspace/awapi-editor"
          tabs={[]}
          activeTabId={null}
          onSelectTab={vi.fn()}
          onCloseTab={vi.fn()}
          onOpenFileFromTree={vi.fn()}
          onPickFolder={vi.fn()}
          onCloseExplorer={vi.fn()}
          onChangeRootFolder={onChangeRootFolder}
          onItemRenamed={onItemRenamed}
          onItemDeleted={onItemDeleted}
        />
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('explorer-folder-samples')).toBeTruthy();
      expect(screen.getByTestId('explorer-file-package.json')).toBeTruthy();
    });

    // 1. Right-clicking a folder shows "Open Folder", "Rename…", and "Delete"
    fireEvent.contextMenu(screen.getByTestId('explorer-folder-samples'));
    expect(screen.getByTestId('explorer-context-open-folder')).toBeTruthy();
    expect(screen.getByTestId('explorer-context-rename')).toBeTruthy();
    expect(screen.getByTestId('explorer-context-delete')).toBeTruthy();

    fireEvent.click(screen.getByTestId('explorer-context-open-folder'));
    expect(onChangeRootFolder).toHaveBeenCalledWith('/workspace/awapi-editor/samples');

    // 2. Right-clicking a file does NOT show "Open Folder", only "Rename…" and "Delete"
    fireEvent.contextMenu(screen.getByTestId('explorer-file-package.json'));
    expect(screen.queryByTestId('explorer-context-open-folder')).toBeNull();
    expect(screen.getByTestId('explorer-context-rename')).toBeTruthy();
    expect(screen.getByTestId('explorer-context-delete')).toBeTruthy();

    // Rename package.json -> package.backup.json
    fireEvent.click(screen.getByTestId('explorer-context-rename'));
    const renameInput = screen.getByTestId('explorer-rename-input') as HTMLInputElement;
    expect(renameInput.value).toBe('package.json');
    fireEvent.change(renameInput, { target: { value: 'package.backup.json' } });
    fireEvent.click(screen.getByTestId('explorer-rename-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('explorer-file-package.backup.json')).toBeTruthy();
    });
    expect(onItemRenamed).toHaveBeenCalledWith(
      '/workspace/awapi-editor/package.json',
      '/workspace/awapi-editor/package.backup.json',
      'package.backup.json',
      false,
    );

    // 3. Delete README.md via context menu + confirmation modal
    fireEvent.contextMenu(screen.getByTestId('explorer-file-README.md'));
    fireEvent.click(screen.getByTestId('explorer-context-delete'));
    expect(screen.getByTestId('explorer-delete-modal')).toBeTruthy();
    fireEvent.click(screen.getByTestId('explorer-delete-confirm'));

    await waitFor(() => {
      expect(screen.queryByTestId('explorer-file-README.md')).toBeNull();
    });
    expect(onItemDeleted).toHaveBeenCalledWith('/workspace/awapi-editor/README.md', false);
  });

  it('creates a new file or folder via right-click on a folder or empty tree space', async () => {
    const onOpenFileFromTree = vi.fn();

    (window as any).electronAPI.createFile = vi.fn(async (parentDirPath: string, name: string) => {
      const newPath = `${parentDirPath}/${name}`;
      const list = dirData.get(parentDirPath) ?? [];
      dirData.set(parentDirPath, [...list, { name, path: newPath, isDirectory: false }]);
      return { ok: true, path: newPath };
    });

    (window as any).electronAPI.createFolder = vi.fn(async (parentDirPath: string, name: string) => {
      const newPath = `${parentDirPath}/${name}`;
      const list = dirData.get(parentDirPath) ?? [];
      dirData.set(parentDirPath, [{ name, path: newPath, isDirectory: true }, ...list]);
      dirData.set(newPath, []);
      return { ok: true, path: newPath };
    });

    render(
      <ThemeProvider>
        <FileExplorer
          isOpen={true}
          rootFolderPath="/workspace/awapi-editor"
          tabs={[]}
          activeTabId={null}
          onSelectTab={vi.fn()}
          onCloseTab={vi.fn()}
          onOpenFileFromTree={onOpenFileFromTree}
          onPickFolder={vi.fn()}
          onCloseExplorer={vi.fn()}
        />
      </ThemeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('explorer-folder-samples')).toBeTruthy();
    });

    // 1. Right-click on empty space in the tree -> New Folder in root folder
    fireEvent.contextMenu(screen.getByTestId('explorer-tree'));
    expect(screen.getByTestId('explorer-context-new-file')).toBeTruthy();
    expect(screen.getByTestId('explorer-context-new-folder')).toBeTruthy();
    expect(screen.queryByTestId('explorer-context-rename')).toBeNull();
    expect(screen.queryByTestId('explorer-context-delete')).toBeNull();

    fireEvent.click(screen.getByTestId('explorer-context-new-folder'));
    expect(screen.getByTestId('explorer-create-modal')).toBeTruthy();
    expect(screen.getByTestId('explorer-create-parent-hint').textContent).toContain('awapi-editor');

    fireEvent.change(screen.getByTestId('explorer-create-input'), { target: { value: 'docs' } });
    fireEvent.click(screen.getByTestId('explorer-create-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('explorer-folder-docs')).toBeTruthy();
    });

    // 2. Right-click on the "samples" folder -> New File inside "samples" (auto-expands "samples" and opens the new file)
    fireEvent.contextMenu(screen.getByTestId('explorer-folder-samples'));
    fireEvent.click(screen.getByTestId('explorer-context-new-file'));
    expect(screen.getByTestId('explorer-create-parent-hint').textContent).toContain('samples');

    fireEvent.change(screen.getByTestId('explorer-create-input'), { target: { value: 'hello.ts' } });
    fireEvent.click(screen.getByTestId('explorer-create-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('explorer-file-hello.ts')).toBeTruthy();
    });
    expect(onOpenFileFromTree).toHaveBeenCalledWith('/workspace/awapi-editor/samples/hello.ts', {
      preview: false,
    });
  });
});
