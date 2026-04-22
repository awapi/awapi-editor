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

      onNewFile: (callback: () => void) => void;
      onOpenFile: (callback: () => void) => void;
      onSaveFile: (callback: () => void) => void;
      onSaveAsFile: (callback: () => void) => void;
      onCloseTab: (callback: () => void) => void;
      onThemeChange: (callback: (theme: string) => void) => void;
      
      removeListeners: () => void;
    };
  }
}

export {};
