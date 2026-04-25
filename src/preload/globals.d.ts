declare global {
  interface Window {
    electronAPI: {
      openFileDialog: () => Promise<{ filePath: string; content: string; eol: 'LF' | 'CRLF' } | null>;
      saveFileDialog: (
        filePath: string | null,
        content: string,
        eol?: 'LF' | 'CRLF'
      ) => Promise<string | null>;
      confirmUnsavedChanges: (tabTitle: string) => Promise<'save' | 'dont-save' | 'cancel'>;
      readFile: (filePath: string) => Promise<{ filePath: string; content: string; eol: 'LF' | 'CRLF' } | null>;
      getPathForFile: (file: File) => string;

      saveSession: (session: {
        activeTabId: string | null;
        tabs: Array<{
          id: string;
          title: string;
          filePath: string | null;
          content: string;
          isDirty: boolean;
          eol?: 'LF' | 'CRLF';
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
        }>;
      } | null>;

      loadSettings: () => Promise<{ sessionDir: string | null; theme?: string | null }>;
      saveSettings: (settings: { sessionDir: string | null; theme?: string | null }) => Promise<boolean>;
      getDefaultSessionDir: () => Promise<string>;
      openDirDialog: () => Promise<string | null>;
      openInExplorer: (dirPath: string) => Promise<void>;

      onNewFile: (callback: () => void) => void;
      onOpenFile: (callback: () => void) => void;
      onSaveFile: (callback: () => void) => void;
      onSaveAsFile: (callback: () => void) => void;
      onCloseTab: (callback: () => void) => void;
      onThemeChange: (callback: (theme: string) => void) => void;
      onPrintPreview: (callback: () => void) => void;
      onOpenSettings: (callback: () => void) => void;
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
      }) => Promise<void>;
      getPopoutData: () => Promise<{
        id: string;
        title: string;
        filePath: string | null;
        content: string;
        isDirty?: boolean;
        language?: string;
        eol?: 'LF' | 'CRLF';
      } | null>;
      moveToMain: (tabData: {
        id: string;
        title: string;
        filePath: string | null;
        content: string;
        isDirty?: boolean;
        language?: string;
        eol?: 'LF' | 'CRLF';
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
      }) => void) => void;

      removeListeners: () => void;
    };
  }
}

export {};
