import { contextBridge, ipcRenderer, webUtils } from 'electron';

export const electronAPI = {
  openFileDialog: () => ipcRenderer.invoke('dialog:openFile'),
  saveFileDialog: (filePath: string | null, content: string, eol?: 'LF' | 'CRLF') =>
    ipcRenderer.invoke('dialog:saveFile', filePath, content, eol),
  confirmUnsavedChanges: (tabTitle: string) => ipcRenderer.invoke('dialog:confirmUnsavedChanges', tabTitle) as Promise<'save' | 'dont-save' | 'cancel'>,
  readFile: (filePath: string) => ipcRenderer.invoke('file:read', filePath),
  renameFile: (oldPath: string, newName: string) =>
    ipcRenderer.invoke('file:rename', oldPath, newName) as Promise<{ ok: true; newPath: string } | { ok: false; error: string }>,
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

  // Pop-out: move a tab to a new standalone window
  popoutTab: (tabData: unknown) => ipcRenderer.invoke('window:popout', tabData),
  onPopoutActiveTab: (callback: () => void) => ipcRenderer.on('menu:popoutActiveTab', () => callback()),
  // Pull model: renderer calls this from useEffect to avoid the race condition
  // where a push ('popout:init') could arrive before the listener was registered.
  getPopoutData: () => ipcRenderer.invoke('popout:get-data'),
  // Move tab back from popout to main window
  moveToMain: (tabData: unknown) => ipcRenderer.invoke('window:moveToMain', tabData),
  onMoveToMain: (callback: () => void) => ipcRenderer.on('menu:moveToMain', () => callback()),
  onAddTab: (callback: (tabData: unknown) => void) => ipcRenderer.on('menu:addTab', (_, tabData) => callback(tabData)),

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
    ipcRenderer.removeAllListeners('menu:popoutActiveTab');
    ipcRenderer.removeAllListeners('menu:moveToMain');
    ipcRenderer.removeAllListeners('menu:addTab');
  }
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
