declare global {
  interface Window {
    electronAPI: {
      openFileDialog: () => Promise<{ filePath: string; content: string } | null>;
      saveFileDialog: (filePath: string | null, content: string) => Promise<string | null>;
      readFile: (filePath: string) => Promise<{ filePath: string; content: string } | null>;
      getPathForFile: (file: File) => string;

      saveSession: (session: {
        activeTabId: string | null;
        tabs: Array<{
          id: string;
          title: string;
          filePath: string | null;
          content: string;
          isDirty: boolean;
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
