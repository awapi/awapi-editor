declare global {
  interface Window {
    electronAPI: {
      openFileDialog: () => Promise<{ filePath: string; content: string } | null>;
      saveFileDialog: (filePath: string | null, content: string) => Promise<string | null>;
      
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
