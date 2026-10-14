import { contextBridge, ipcRenderer, webUtils } from 'electron';
import type { EncodingKind } from '../shared/encodings';
import type { PtyCreateOptions, PtyCreateResult, PtyDataEvent, PtyExitEvent, TerminalChoices } from '../shared/terminal';

export const electronAPI = {
  /** Resolves with every file that could be read, or null if canceled / none could be read. */
  openFileDialog: () =>
    ipcRenderer.invoke('dialog:openFile') as Promise<
      Array<{ filePath: string; content: string; eol: 'LF' | 'CRLF'; encoding?: EncodingKind }> | null
    >,
  saveFileDialog: (
    filePath: string | null,
    content: string,
    eol?: 'LF' | 'CRLF',
    encoding?: EncodingKind,
  ) => ipcRenderer.invoke('dialog:saveFile', filePath, content, eol, encoding),
  confirmUnsavedChanges: (tabTitle: string) => ipcRenderer.invoke('dialog:confirmUnsavedChanges', tabTitle) as Promise<'save' | 'dont-save' | 'cancel'>,
  readFile: (
    filePath: string,
    options?: {
      encoding?: EncodingKind;
      /** Record in "Open Recent" (user-initiated opens only). */
      trackRecent?: boolean;
    },
  ) => ipcRenderer.invoke('file:read', filePath, options),
  renameFile: (oldPath: string, newName: string) =>
    ipcRenderer.invoke('file:rename', oldPath, newName) as Promise<{ ok: true; newPath: string } | { ok: false; error: string }>,
  getPathForFile: (file: File) => webUtils.getPathForFile(file),

  saveSession: (session: unknown) => ipcRenderer.invoke('session:save', session),
  loadSession: () => ipcRenderer.invoke('session:load'),

  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: (settings: unknown) => ipcRenderer.invoke('settings:save', settings),
  applyNativeTheme: (theme: string) => ipcRenderer.invoke('theme:applyNative', theme),
  getDefaultSessionDir: () => ipcRenderer.invoke('settings:getDefaultDir'),
  openDirDialog: () => ipcRenderer.invoke('settings:openDirDialog'),
  openInExplorer: (dirPath: string) => ipcRenderer.invoke('settings:openInExplorer', dirPath),
  showItemInFolder: (filePath: string) => ipcRenderer.invoke('file:showInFolder', filePath),
  /** Opens the configured external terminal in the folder containing `filePath` (null = home folder). Resolves false on failure. */
  openInTerminal: (filePath: string | null) => ipcRenderer.invoke('file:openInTerminal', filePath) as Promise<boolean>,
  /** Terminal apps and shells available on this machine (for Preferences). */
  getTerminalChoices: () => ipcRenderer.invoke('terminal:getChoices') as Promise<TerminalChoices>,
  /** Integrated terminal: start a shell. `cwd` may be a file (its folder is used) or null (home). */
  ptyCreate: (options: PtyCreateOptions) => ipcRenderer.invoke('pty:create', options) as Promise<PtyCreateResult>,
  ptyWrite: (id: number, data: string) => ipcRenderer.send('pty:write', id, data),
  ptyResize: (id: number, cols: number, rows: number) => ipcRenderer.send('pty:resize', id, cols, rows),
  ptyKill: (id: number) => ipcRenderer.invoke('pty:kill', id) as Promise<void>,
  /** Subscribes to shell output for this window's sessions. Returns an unsubscribe function. */
  onPtyData: (callback: (event: PtyDataEvent) => void) => {
    const listener = (_: unknown, event: PtyDataEvent) => callback(event);
    ipcRenderer.on('pty:data', listener);
    return () => { ipcRenderer.removeListener('pty:data', listener); };
  },
  /** Subscribes to shell exits for this window's sessions. Returns an unsubscribe function. */
  onPtyExit: (callback: (event: PtyExitEvent) => void) => {
    const listener = (_: unknown, event: PtyExitEvent) => callback(event);
    ipcRenderer.on('pty:exit', listener);
    return () => { ipcRenderer.removeListener('pty:exit', listener); };
  },
  copyToClipboard: (text: string) => ipcRenderer.invoke('clipboard:writeText', text),
  readClipboardText: () => ipcRenderer.invoke('clipboard:readText') as Promise<string>,
  /** Report this window's open files (and their encodings) for external-change detection. */
  syncWatchedFiles: (
    files: Array<{ filePath: string; encoding?: EncodingKind }>,
  ) => ipcRenderer.invoke('file:watchSync', files),
  confirmReloadExternalChange: (tabTitle: string) =>
    ipcRenderer.invoke('dialog:confirmReloadExternalChange', tabTitle) as Promise<'reload' | 'keep'>,
  /** Warn that `count` characters can't be saved in `encodingLabel`; resolves true to save anyway. */
  confirmLossyEncoding: (tabTitle: string, encodingLabel: string, count: number) =>
    ipcRenderer.invoke('dialog:confirmLossyEncoding', tabTitle, encodingLabel, count) as Promise<boolean>,
  /** Confirm discarding unsaved changes to reopen a file with another encoding. */
  confirmReopenWithEncoding: (tabTitle: string, encodingLabel: string) =>
    ipcRenderer.invoke('dialog:confirmReopenWithEncoding', tabTitle, encodingLabel) as Promise<boolean>,
  onExternalFileChange: (
    callback: (data: {
      filePath: string;
      content: string;
      eol: 'LF' | 'CRLF';
      encoding?: EncodingKind;
    }) => void,
  ) => ipcRenderer.on('file:externalChange', (_, data) => callback(data)),
  onExternalFileDelete: (callback: (data: { filePath: string }) => void) =>
    ipcRenderer.on('file:externalDelete', (_, data) => callback(data)),
  onNewFile: (callback: () => void) => ipcRenderer.on('menu:new', () => callback()),
  onOpenFile: (callback: () => void) => ipcRenderer.on('menu:open', () => callback()),
  onSaveFile: (callback: () => void) => ipcRenderer.on('menu:save', () => callback()),
  onSaveAsFile: (callback: () => void) => ipcRenderer.on('menu:saveAs', () => callback()),
  onSaveAllFiles: (callback: () => void) => ipcRenderer.on('menu:saveAll', () => callback()),
  onCloseTab: (callback: () => void) => ipcRenderer.on('menu:closeTab', () => callback()),
  onReopenClosedTab: (callback: () => void) => ipcRenderer.on('menu:reopenClosedTab', () => callback()),
  onFind: (callback: () => void) => ipcRenderer.on('menu:find', () => callback()),
  onReplace: (callback: () => void) => ipcRenderer.on('menu:replace', () => callback()),
  onFindInTabs: (callback: () => void) => ipcRenderer.on('menu:findInTabs', () => callback()),
  onGoToLine: (callback: () => void) => ipcRenderer.on('menu:goToLine', () => callback()),
  onToggleWhitespace: (callback: () => void) => ipcRenderer.on('menu:toggleWhitespace', () => callback()),
  onToggleSplitView: (callback: () => void) => ipcRenderer.on('menu:toggleSplitView', () => callback()),
  onToggleTerminal: (callback: () => void) => ipcRenderer.on('menu:toggleTerminal', () => callback()),
  onNewTerminal: (callback: () => void) => ipcRenderer.on('menu:newTerminal', () => callback()),
  onToggleDiffView: (callback: () => void) => ipcRenderer.on('menu:toggleDiffView', () => callback()),
  getAlwaysOnTop: () => ipcRenderer.invoke('window:getAlwaysOnTop') as Promise<boolean>,
  setAlwaysOnTop: (flag: boolean) => ipcRenderer.invoke('window:setAlwaysOnTop', flag) as Promise<boolean>,
  toggleAlwaysOnTop: () => ipcRenderer.invoke('window:toggleAlwaysOnTop') as Promise<boolean>,
  onAlwaysOnTopChanged: (callback: (alwaysOnTop: boolean) => void) =>
    ipcRenderer.on('window:alwaysOnTopChanged', (_, flag: boolean) => callback(flag)),
  setWindowDirty: (dirty: boolean) => ipcRenderer.invoke('window:setDirty', dirty) as Promise<void>,
  confirmWindowClose: () => ipcRenderer.invoke('window:confirmClose') as Promise<void>,
  /** Pop-out only: the user cancelled the close prompt (also aborts a pending main-window close). */
  cancelWindowClose: () => ipcRenderer.invoke('window:cancelClose') as Promise<void>,
  onWindowCloseRequested: (callback: () => void) =>
    ipcRenderer.on('window:closeRequested', () => callback()),
  onTextOperation: (callback: (operation: string) => void) =>
    ipcRenderer.on('menu:textOperation', (_, operation: string) => callback(operation)),
  onFormat: (callback: () => void) => ipcRenderer.on('menu:format', () => callback()),
  onThemeChange: (callback: (theme: string) => void) => ipcRenderer.on('menu:themeChange', (_, theme) => callback(theme)),
  onPrintPreview: (callback: () => void) => ipcRenderer.on('menu:printPreview', () => callback()),
  onOpenSettings: (callback: () => void) => ipcRenderer.on('menu:openSettings', () => callback()),
  onOpenShortcuts: (callback: () => void) => ipcRenderer.on('menu:openShortcuts', () => callback()),
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
    ipcRenderer.removeAllListeners('menu:saveAll');
    ipcRenderer.removeAllListeners('menu:closeTab');
    ipcRenderer.removeAllListeners('menu:reopenClosedTab');
    ipcRenderer.removeAllListeners('file:externalChange');
    ipcRenderer.removeAllListeners('file:externalDelete');
    ipcRenderer.removeAllListeners('menu:find');
    ipcRenderer.removeAllListeners('menu:replace');
    ipcRenderer.removeAllListeners('menu:findInTabs');
    ipcRenderer.removeAllListeners('menu:goToLine');
    ipcRenderer.removeAllListeners('menu:toggleWhitespace');
    ipcRenderer.removeAllListeners('menu:toggleSplitView');
    ipcRenderer.removeAllListeners('menu:toggleDiffView');
    ipcRenderer.removeAllListeners('window:alwaysOnTopChanged');
    ipcRenderer.removeAllListeners('window:closeRequested');
    ipcRenderer.removeAllListeners('menu:textOperation');
    ipcRenderer.removeAllListeners('menu:format');
    ipcRenderer.removeAllListeners('menu:themeChange');
    ipcRenderer.removeAllListeners('menu:printPreview');
    ipcRenderer.removeAllListeners('menu:openSettings');
    ipcRenderer.removeAllListeners('menu:openShortcuts');
    ipcRenderer.removeAllListeners('menu:showAllCommands');
    ipcRenderer.removeAllListeners('file:openFromArgs');
    ipcRenderer.removeAllListeners('menu:popoutActiveTab');
    ipcRenderer.removeAllListeners('menu:moveToMain');
    ipcRenderer.removeAllListeners('menu:addTab');
  }
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);
