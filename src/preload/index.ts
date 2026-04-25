import { contextBridge, ipcRenderer, webUtils } from 'electron';

export const electronAPI = {
  openFileDialog: () => ipcRenderer.invoke('dialog:openFile'),
  saveFileDialog: (filePath: string | null, content: string, eol?: 'LF' | 'CRLF') =>
    ipcRenderer.invoke('dialog:saveFile', filePath, content, eol),
  confirmUnsavedChanges: (tabTitle: string) => ipcRenderer.invoke('dialog:confirmUnsavedChanges', tabTitle) as Promise<'save' | 'dont-save' | 'cancel'>,
  readFile: (filePath: string) => ipcRenderer.invoke('file:read', filePath),
  getPathForFile: (file: File) => webUtils.getPathForFile(file),

  saveSession: (session: unknown) => ipcRenderer.invoke('session:save', session),
  loadSession: () => ipcRenderer.invoke('session:load'),

  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: (settings: unknown) => ipcRenderer.invoke('settings:save', settings),
  getDefaultSessionDir: () => ipcRenderer.invoke('settings:getDefaultDir'),
  openDirDialog: () => ipcRenderer.invoke('settings:openDirDialog'),
  openInExplorer: (dirPath: string) => ipcRenderer.invoke('settings:openInExplorer', dirPath),
  onNewFile: (callback: () => void) => ipcRenderer.on('menu:new', () => callback()),
  onOpenFile: (callback: () => void) => ipcRenderer.on('menu:open', () => callback()),
  onSaveFile: (callback: () => void) => ipcRenderer.on('menu:save', () => callback()),
  onSaveAsFile: (callback: () => void) => ipcRenderer.on('menu:saveAs', () => callback()),
  onCloseTab: (callback: () => void) => ipcRenderer.on('menu:closeTab', () => callback()),
  onFind: (callback: () => void) => ipcRenderer.on('menu:find', () => callback()),
  onReplace: (callback: () => void) => ipcRenderer.on('menu:replace', () => callback()),
  onFormat: (callback: () => void) => ipcRenderer.on('menu:format', () => callback()),
  onThemeChange: (callback: (theme: string) => void) => ipcRenderer.on('menu:themeChange', (_, theme) => callback(theme)),
  onPrintPreview: (callback: () => void) => ipcRenderer.on('menu:printPreview', () => callback()),
  onOpenSettings: (callback: () => void) => ipcRenderer.on('menu:openSettings', () => callback()),
  onShowAllCommands: (callback: () => void) => ipcRenderer.on('menu:showAllCommands', () => callback()),
  onOpenFileFromArgs: (callback: (filePath: string) => void) => ipcRenderer.on('file:openFromArgs', (_, filePath) => callback(filePath)),
  printPreview: (content: string, language: string, title: string) =>
    ipcRenderer.invoke('print:preview', content, language, title),

  // Cleanup listeners
  removeListeners: () => {
    ipcRenderer.removeAllListeners('menu:new');
    ipcRenderer.removeAllListeners('menu:open');
    ipcRenderer.removeAllListeners('menu:save');
    ipcRenderer.removeAllListeners('menu:saveAs');
    ipcRenderer.removeAllListeners('menu:closeTab');
    ipcRenderer.removeAllListeners('menu:find');
    ipcRenderer.removeAllListeners('menu:replace');
    ipcRenderer.removeAllListeners('menu:format');
    ipcRenderer.removeAllListeners('menu:themeChange');
    ipcRenderer.removeAllListeners('menu:printPreview');
    ipcRenderer.removeAllListeners('menu:openSettings');
    ipcRenderer.removeAllListeners('menu:showAllCommands');
    ipcRenderer.removeAllListeners('file:openFromArgs');
  }
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
