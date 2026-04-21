import { contextBridge, ipcRenderer } from 'electron';

export const electronAPI = {
  openFileDialog: () => ipcRenderer.invoke('dialog:openFile'),
  saveFileDialog: (filePath: string | null, content: string) => ipcRenderer.invoke('dialog:saveFile', filePath, content),
  
  onNewFile: (callback: () => void) => ipcRenderer.on('menu:new', () => callback()),
  onOpenFile: (callback: () => void) => ipcRenderer.on('menu:open', () => callback()),
  onSaveFile: (callback: () => void) => ipcRenderer.on('menu:save', () => callback()),
  onSaveAsFile: (callback: () => void) => ipcRenderer.on('menu:saveAs', () => callback()),
  onCloseTab: (callback: () => void) => ipcRenderer.on('menu:closeTab', () => callback()),
  onThemeChange: (callback: (theme: string) => void) => ipcRenderer.on('menu:themeChange', (_, theme) => callback(theme)),
  
  // Cleanup listeners
  removeListeners: () => {
    ipcRenderer.removeAllListeners('menu:new');
    ipcRenderer.removeAllListeners('menu:open');
    ipcRenderer.removeAllListeners('menu:save');
    ipcRenderer.removeAllListeners('menu:saveAs');
    ipcRenderer.removeAllListeners('menu:closeTab');
    ipcRenderer.removeAllListeners('menu:themeChange');
  }
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
