import type { EncodingKind } from '../shared/encodings';
import type {
  PtyCreateOptions,
  PtyCreateResult,
  PtyDataEvent,
  PtyExitEvent,
  TerminalChoices,
  TerminalPreference,
} from '../shared/terminal';

export type { EncodingKind };

/** A file read from disk, with content normalized to LF line endings. */
export interface OpenedFile {
  filePath: string;
  content: string;
  eol: 'LF' | 'CRLF';
  encoding?: EncodingKind;
  byteSize?: number;
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
      /** null = home folder (e.g. for unsaved tabs). */
      openInTerminal: (filePath: string | null) => Promise<boolean>;
      getTerminalChoices: () => Promise<TerminalChoices>;
      ptyCreate: (options: PtyCreateOptions) => Promise<PtyCreateResult>;
      ptyWrite: (id: number, data: string) => void;
      ptyResize: (id: number, cols: number, rows: number) => void;
      ptyKill: (id: number) => Promise<void>;
      onPtyData: (callback: (event: PtyDataEvent) => void) => () => void;
      onPtyExit: (callback: (event: PtyExitEvent) => void) => () => void;
      copyToClipboard: (text: string) => Promise<void>;
      readClipboardText: () => Promise<string>;
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

      loadSettings: () => Promise<{
        sessionDir: string | null;
        theme?: string | null;
        externalTerminal?: TerminalPreference;
        integratedShell?: TerminalPreference;
        terminalFont?: string | null;
        explorerFolderPath?: string | null;
        explorerVisible?: boolean;
        favoriteFolders?: string[];
      }>;
      /** Merges the given fields into the stored settings. */
      saveSettings: (settings: {
        sessionDir?: string | null;
        theme?: string | null;
        externalTerminal?: TerminalPreference;
        integratedShell?: TerminalPreference;
        terminalFont?: string | null;
        explorerFolderPath?: string | null;
        explorerVisible?: boolean;
        favoriteFolders?: string[];
      }) => Promise<boolean>;
      applyNativeTheme: (theme: string) => Promise<void>;
      getDefaultSessionDir: () => Promise<string>;
      openDirDialog: () => Promise<string | null>;
      openInExplorer: (dirPath: string) => Promise<void>;
      openExplorerFolderDialog: () => Promise<string | null>;
      readDirectory: (
        dirPath: string
      ) => Promise<
        | { ok: true; dirPath: string; name: string; entries: Array<{ name: string; path: string; isDirectory: boolean }> }
        | { ok: false; error: string }
      >;
      deletePath: (targetPath: string) => Promise<{ ok: true } | { ok: false; error: string }>;
      createFile: (
        parentDirPath: string,
        name: string
      ) => Promise<{ ok: true; path: string } | { ok: false; error: string }>;
      createFolder: (
        parentDirPath: string,
        name: string
      ) => Promise<{ ok: true; path: string } | { ok: false; error: string }>;
      syncWatchedDirs: (dirPaths: string[]) => Promise<void>;
      onExplorerDirChanged: (callback: (dirPath: string) => void) => () => void;
      getContextMenuStatus: () => Promise<{ supported: boolean; enabled: boolean }>;
      setContextMenuEnabled: (
        enable: boolean
      ) => Promise<{ ok: true; enabled: boolean } | { ok: false; enabled: boolean; error: string }>;
      getCliCommandStatus: () => Promise<{
        supported: boolean;
        enabled: boolean;
        commandPath: string | null;
      }>;
      setCliCommandEnabled: (
        enable: boolean
      ) => Promise<
        | { ok: true; enabled: boolean; commandPath: string | null }
        | { ok: false; enabled: boolean; commandPath: string | null; error: string }
      >;

      onNewFile: (callback: () => void) => void;
      onOpenFile: (callback: () => void) => void;
      onOpenFolder: (callback: () => void) => void;
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
      onToggleExplorer: (callback: () => void) => void;
      onToggleSplitView: (callback: () => void) => void;
      onToggleTerminal: (callback: () => void) => void;
      onNewTerminal: (callback: () => void) => void;
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
      onOpenHelp: (callback: () => void) => void;
      onShowAllCommands: (callback: () => void) => void;
      onOpenFileFromArgs: (callback: (filePath: string) => void) => void;
      onOpenFolderFromArgs: (callback: (dirPath: string) => void) => void;
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

      openMarkdownPreview: (data: {
        title: string;
        filePath: string | null;
        content: string;
        theme?: 'light' | 'dark';
      }) => Promise<boolean | void>;
      updateMarkdownPreview: (data: {
        title: string;
        filePath: string | null;
        content: string;
        theme?: 'light' | 'dark';
      }) => Promise<void>;
      getMarkdownPreviewData: () => Promise<{
        title: string;
        filePath: string | null;
        content: string;
        theme?: 'light' | 'dark';
      } | null>;
      onMarkdownPreviewUpdate: (
        callback: (data: {
          title: string;
          filePath: string | null;
          content: string;
          theme?: 'light' | 'dark';
        }) => void
      ) => () => void;
      onMarkdownPreview: (callback: () => void) => void;
      getMarkdownPreviewOpen: () => Promise<boolean>;
      onMarkdownPreviewVisibilityChanged: (callback: (isOpen: boolean) => void) => void;

      removeListeners: () => void;
    };
  }
}

export {};
