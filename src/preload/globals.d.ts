import type { EncodingKind } from '../shared/encodings';

export type { EncodingKind };

/** A file read from disk, with content normalized to LF line endings. */
export interface OpenedFile {
  filePath: string;
  content: string;
  eol: 'LF' | 'CRLF';
  encoding?: EncodingKind;
}

declare global {
  interface Window {
    electronAPI: {
      /** Resolves with every file that could be read, or null if canceled / none could be read. */
      openFileDialog: () => Promise<OpenedFile[] | null>;
      saveFileDialog: (
        filePath: string | null,
        content: string,
        eol?: 'LF' | 'CRLF',
        encoding?: EncodingKind
      ) => Promise<string | null>;
      confirmUnsavedChanges: (tabTitle: string) => Promise<'save' | 'dont-save' | 'cancel'>;
      confirmReloadExternalChange: (tabTitle: string) => Promise<'reload' | 'keep'>;
      /** Warn that `count` characters can't be saved in `encodingLabel`; resolves true to save anyway. */
      confirmLossyEncoding: (tabTitle: string, encodingLabel: string, count: number) => Promise<boolean>;
      /** Confirm discarding unsaved changes to reopen a file with another encoding. */
      confirmReopenWithEncoding: (tabTitle: string, encodingLabel: string) => Promise<boolean>;
      readFile: (
        filePath: string,
        options?: { encoding?: EncodingKind; trackRecent?: boolean }
      ) => Promise<OpenedFile | null>;
      renameFile: (
        oldPath: string,
        newName: string
      ) => Promise<{ ok: true; newPath: string } | { ok: false; error: string }>;
      getPathForFile: (file: File) => string;
      showItemInFolder: (filePath: string) => Promise<void>;
      copyToClipboard: (text: string) => Promise<void>;
      /** Report this window's open files (and their encodings) for external-change detection. */
      syncWatchedFiles: (files: Array<{ filePath: string; encoding?: EncodingKind }>) => Promise<void>;
      onExternalFileChange: (
        callback: (data: OpenedFile) => void
      ) => void;
      onExternalFileDelete: (callback: (data: { filePath: string }) => void) => void;

      saveSession: (session: {
        activeTabId: string | null;
        tabs: Array<{
          id: string;
          title: string;
          filePath: string | null;
          content: string;
          isDirty: boolean;
          eol?: 'LF' | 'CRLF';
          encoding?: EncodingKind;
        }>;
      }) => Promise<boolean>;
      loadSession: () => Promise<{
        activeTabId: string | null;
        tabs: Array<{
          id: string;
          title: string;
          filePath: string | null;
          content: string;
          isDirty: boolean;
          eol?: 'LF' | 'CRLF';
          encoding?: EncodingKind;
        }>;
      } | null>;

      loadSettings: () => Promise<{ sessionDir: string | null; theme?: string | null }>;
      saveSettings: (settings: { sessionDir: string | null; theme?: string | null }) => Promise<boolean>;
      applyNativeTheme: (theme: string) => Promise<void>;
      getDefaultSessionDir: () => Promise<string>;
      openDirDialog: () => Promise<string | null>;
      openInExplorer: (dirPath: string) => Promise<void>;

      onNewFile: (callback: () => void) => void;
      onOpenFile: (callback: () => void) => void;
      onSaveFile: (callback: () => void) => void;
      onSaveAsFile: (callback: () => void) => void;
      onSaveAllFiles: (callback: () => void) => void;
      onCloseTab: (callback: () => void) => void;
      onReopenClosedTab: (callback: () => void) => void;
      onFind: (callback: () => void) => void;
      onReplace: (callback: () => void) => void;
      onFindInTabs: (callback: () => void) => void;
      onGoToLine: (callback: () => void) => void;
      onToggleWhitespace: (callback: () => void) => void;
      onToggleSplitView: (callback: () => void) => void;
      onToggleDiffView: (callback: () => void) => void;
      getAlwaysOnTop: () => Promise<boolean>;
      setAlwaysOnTop: (flag: boolean) => Promise<boolean>;
      toggleAlwaysOnTop: () => Promise<boolean>;
      onAlwaysOnTopChanged: (callback: (alwaysOnTop: boolean) => void) => void;
      /** Pop-out only: report whether the tab has unsaved changes (guards window close). */
      setWindowDirty: (dirty: boolean) => Promise<void>;
      /** Pop-out only: close the window after unsaved changes were resolved. */
      confirmWindowClose: () => Promise<void>;
      /** Pop-out only: the user cancelled the close prompt (also aborts a pending main-window close). */
      cancelWindowClose: () => Promise<void>;
      /** Pop-out only: main asks the renderer to confirm closing a dirty window. */
      onWindowCloseRequested: (callback: () => void) => void;
      onTextOperation: (callback: (operation: string) => void) => void;
      onFormat: (callback: () => void) => void;
      onThemeChange: (callback: (theme: string) => void) => void;
      onPrintPreview: (callback: () => void) => void;
      onOpenSettings: (callback: () => void) => void;
      onOpenShortcuts: (callback: () => void) => void;
      onShowAllCommands: (callback: () => void) => void;
      printPreview: (content: string, language: string, title: string) => Promise<void>;

      onPopoutActiveTab: (callback: () => void) => void;
      popoutTab: (tabData: {
        id: string;
        title: string;
        filePath: string | null;
        content: string;
        isDirty?: boolean;
        language?: string;
        eol?: 'LF' | 'CRLF';
        encoding?: EncodingKind;
      }) => Promise<void>;
      getPopoutData: () => Promise<{
        id: string;
        title: string;
        filePath: string | null;
        content: string;
        isDirty?: boolean;
        language?: string;
        eol?: 'LF' | 'CRLF';
        encoding?: EncodingKind;
      } | null>;
      moveToMain: (tabData: {
        id: string;
        title: string;
        filePath: string | null;
        content: string;
        isDirty?: boolean;
        language?: string;
        eol?: 'LF' | 'CRLF';
        encoding?: EncodingKind;
      }) => Promise<void>;
      onMoveToMain: (callback: () => void) => void;
      onAddTab: (callback: (tabData: {
        id: string;
        title: string;
        filePath: string | null;
        content: string;
        isDirty?: boolean;
        language?: string;
        eol?: 'LF' | 'CRLF';
        encoding?: EncodingKind;
      }) => void) => void;

      removeListeners: () => void;
    };
  }
}

export {};
