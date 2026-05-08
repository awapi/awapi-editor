import { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme } from 'electron';

// Set app name BEFORE any imports that use app.getPath()
app.name = 'AwapiEditor';

import { dirname, join } from 'path';
import * as fs from 'fs';
import { checkForUpdates } from './updater';
import { 
  loadAppSettings, 
  saveAppSettings, 
  getSessionDirPath,
  getDefaultBackupDir,
  saveSession, 
  loadSession,
  type AppSettings
} from './session';

/** Line-ending kinds supported by the editor. Mirrors renderer/src/lineEndings. */
type EolKind = 'LF' | 'CRLF';

/** Detect dominant EOL: CRLF if any \r\n present, else LF. */
function detectEol(content: string): EolKind {
  return content.includes('\r\n') ? 'CRLF' : 'LF';
}

/** Normalize any mixed line endings to `\n`. */
function normalizeToLF(content: string): string {
  return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/** Apply the requested EOL to LF-normalized content (idempotent for LF). */
function applyEol(content: string, eol: EolKind): string {
  const lf = normalizeToLF(content);
  return eol === 'CRLF' ? lf.replace(/\n/g, '\r\n') : lf;
}

// Environment variable indicating if we are in dev mode
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

let mainWindow: BrowserWindow | null = null;

/**
 * Extract a file path from argv produced by Electron / the OS.
 * Electron prepends the executable (and in dev the Vite entry), so we skip
 * everything up to and including "--" or the first non-flag argument that
 * looks like a real filesystem path.
 */
function fileArgFromArgv(argv: string[]): string | null {
  // In packaged builds argv[0] is the executable; in dev argv[0..1] are
  // electron + the entry script.  We skip the first 1-2 elements and look
  // for the first argument that is not a flag and exists on disk.
  const candidates = argv.slice(isDev ? 2 : 1);
  for (const arg of candidates) {
    if (!arg.startsWith('-') && fs.existsSync(arg)) {
      return arg;
    }
  }
  return null;
}

/** Send a file-open-from-args request to the renderer once it is ready. */
function sendFileToRenderer(filePath: string): void {
  if (!mainWindow) return;
  const send = () => mainWindow?.webContents.send('file:openFromArgs', filePath);
  if (mainWindow.webContents.isLoading()) {
    mainWindow.webContents.once('did-finish-load', send);
  } else {
    send();
  }
}

// macOS: the OS sends this event when a file is opened via Finder / "Open With".
// It may fire before or after app.whenReady(), so we capture it early.
let pendingOpenFilePath: string | null = null;
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (mainWindow) {
    sendFileToRenderer(filePath);
  } else {
    pendingOpenFilePath = filePath;
  }
});

// Single-instance lock: if the app is already running and the user opens
// another file via "Open With", the OS launches a second process. We redirect
// that request to the existing window and quit the second process.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    // Bring existing window to front
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    const filePath = fileArgFromArgv(argv);
    if (filePath) sendFileToRenderer(filePath);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
    icon: join(__dirname, '../../build/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Close all popout windows when the main window is closed.
  mainWindow.on('close', () => {
    for (const winId of popoutWindowIds) {
      const win = BrowserWindow.fromId(winId);
      win?.destroy();
    }
  });

  // Handle Ctrl++ (Ctrl+Shift+=) for zoom in — the menu only registers Ctrl+=.
  // before-input-event fires before Chromium or the menu processes the key.
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    const ctrl = input.control || input.meta;
    if (!ctrl || input.type !== 'keyDown') return;
    if (input.key === '+') adjustZoom(mainWindow!.webContents, +1);
  });

  if (isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  // Apply the persisted theme to the native title bar before the window opens
  // so there is no dark-title-bar flash when the user prefers light theme.
  const startupSettings = loadAppSettings();
  nativeTheme.themeSource = startupSettings.theme === 'light' ? 'light' : 'dark';

  // Set the macOS Dock icon explicitly in dev (BrowserWindow.icon doesn't affect the Dock)
  if (process.platform === 'darwin' && isDev && app.dock) {
    app.dock.setIcon(join(__dirname, '../../build/icon.png'));
  }

  createWindow();

  // Open file passed as CLI argument (Windows/Linux "Open With" or terminal)
  const cliFile = fileArgFromArgv(process.argv);
  const fileToOpen = pendingOpenFilePath ?? cliFile;
  if (fileToOpen) {
    sendFileToRenderer(fileToOpen);
    pendingOpenFilePath = null;
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  // Silent background update check on startup (production only).
  // Delayed a few seconds so it never competes with window startup work.
  if (!isDev) {
    setTimeout(() => {
      checkForUpdates({ parentWindow: mainWindow }).catch((err) =>
        console.error('Background update check failed:', err),
      );
    }, 4000);
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC Handlers
ipcMain.handle('dialog:openFile', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) ?? mainWindow;
  if (!win) return null;
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    properties: ['openFile'],
  });
  if (canceled || filePaths.length === 0) return null;

  const raw = fs.readFileSync(filePaths[0], 'utf-8');
  const eol = detectEol(raw);
  // Normalize to LF so Monaco has consistent line endings in memory.
  return { filePath: filePaths[0], content: normalizeToLF(raw), eol };
});

ipcMain.handle('file:read', async (_, filePath: string) => {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const eol = detectEol(raw);
    return { filePath, content: normalizeToLF(raw), eol };
  } catch (error) {
    console.error('Failed to read file:', error);
    return null;
  }
});

// ── App Settings ─────────────────────────────────────────────────────────────
// AppSettings interface and settings functions are now imported from ./session

// ── Session persistence ──────────────────────────────────────────────────────
// Session handlers use folder-based structure: session/session.json + session/unsaved/{tabId}.txt
ipcMain.handle('session:save', async (_, sessionData: unknown) => {
  return saveSession(sessionData);
});

ipcMain.handle('session:load', async () => {
  return loadSession();
});

// ── Settings IPC ──────────────────────────────────────────────────────────────
ipcMain.handle('settings:load', async () => {
  return loadAppSettings();
});

ipcMain.handle('settings:save', async (_, settings: AppSettings) => {
  try {
    saveAppSettings(settings);
    return true;
  } catch (error) {
    console.error('Failed to save settings:', error);
    return false;
  }
});

// Sync the native OS title-bar appearance with the app's theme selection.
ipcMain.handle('theme:applyNative', (_, theme: string) => {
  nativeTheme.themeSource = theme === 'light' ? 'light' : 'dark';
});

ipcMain.handle('settings:getDefaultDir', async () => {
  return getDefaultBackupDir();
});

ipcMain.handle('settings:openDirDialog', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) ?? mainWindow;
  if (!win) return null;
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Select Session Storage Folder',
  });
  if (canceled || filePaths.length === 0) return null;
  return filePaths[0];
});

ipcMain.handle('settings:openInExplorer', async (_, dirPath: string) => {
  await shell.openPath(dirPath);
});

ipcMain.handle('dialog:confirmUnsavedChanges', async (event, tabTitle: string) => {
  const win = BrowserWindow.fromWebContents(event.sender) ?? mainWindow;
  if (!win) return 'cancel';
  const { response } = await dialog.showMessageBox(win, {
    type: 'warning',
    buttons: ['Save', "Don't Save", 'Cancel'],
    defaultId: 0,
    cancelId: 2,
    title: 'Unsaved Changes',
    message: `Do you want to save the changes you made to ${tabTitle}?`,
    detail: "Your changes will be lost if you don't save them.",
    noLink: true,
  });
  if (response === 0) return 'save';
  if (response === 1) return 'dont-save';
  return 'cancel';
});

ipcMain.handle('print:preview', async (_, content: string, _language: string, title: string) => {
  try {
    const escaped = content
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>${title.replace(/</g, '&lt;')}</title>
  <style>
    body { margin: 0; padding: 24px 32px; font-family: 'Courier New', Courier, monospace; font-size: 13px; line-height: 1.6; color: #1e1e1e; background: #fff; }
    h1 { font-size: 14px; font-weight: bold; margin: 0 0 16px; border-bottom: 1px solid #ccc; padding-bottom: 8px; color: #555; }
    pre { margin: 0; white-space: pre-wrap; word-break: break-word; }
  </style>
</head>
<body>
  <h1>${title.replace(/</g, '&lt;')}</h1>
  <pre>${escaped}</pre>
</body>
</html>`;
    const tempPath = join(app.getPath('temp'), `awapi-preview-${Date.now()}.html`);
    fs.writeFileSync(tempPath, html, 'utf-8');
    await shell.openPath(tempPath);
  } catch (err) {
    console.error('Print preview failed:', err);
  }
});

ipcMain.handle('dialog:saveFile', async (event, filePath: string, content: string, eol?: EolKind) => {
  const win = BrowserWindow.fromWebContents(event.sender) ?? mainWindow;
  if (!win) return null;
  let targetPath = filePath;

  if (!targetPath) {
    const { canceled, filePath: newPath } = await dialog.showSaveDialog(win, {
      defaultPath: 'Untitled.txt',
    });
    if (canceled || !newPath) return null;
    targetPath = newPath;
  }

  const normalized = applyEol(content, eol ?? 'LF');
  fs.writeFileSync(targetPath, normalized, 'utf-8');
  return targetPath;
});

/**
 * Renames a file on disk. The renderer supplies the existing absolute path
 * and the desired new basename (e.g. "notes.md"). The file is renamed within
 * its current directory.
 *
 * Returns:
 *  - { ok: true, newPath } on success
 *  - { ok: false, error }  when validation or fs operations fail
 */
ipcMain.handle('file:rename', async (_event, oldPath: string, newName: string) => {
  if (typeof oldPath !== 'string' || !oldPath) {
    return { ok: false as const, error: 'No source path provided.' };
  }
  if (typeof newName !== 'string' || !newName.trim()) {
    return { ok: false as const, error: 'New name cannot be empty.' };
  }

  const trimmed = newName.trim();
  // Disallow path separators or traversal in the new basename — rename stays
  // within the source directory by design.
  if (/[\\/]/.test(trimmed) || trimmed === '.' || trimmed === '..') {
    return { ok: false as const, error: 'Name cannot contain path separators.' };
  }

  try {
    if (!fs.existsSync(oldPath)) {
      return { ok: false as const, error: 'Source file no longer exists on disk.' };
    }
    const dir = dirname(oldPath);
    const newPath = join(dir, trimmed);

    if (newPath === oldPath) {
      // No-op: the user kept the same name.
      return { ok: true as const, newPath };
    }
    if (fs.existsSync(newPath)) {
      return { ok: false as const, error: 'A file with that name already exists.' };
    }

    fs.renameSync(oldPath, newPath);
    return { ok: true as const, newPath };
  } catch (err) {
    return { ok: false as const, error: (err as Error).message };
  }
});

// ── Pop-out window ────────────────────────────────────────────────────────────
interface PopoutTabData {
  id: string;
  title: string;
  filePath: string | null;
  content: string;
  isDirty?: boolean;
  language?: string;
  eol?: EolKind;
}

// Holds tab data for each popout window until the renderer fetches it via
// 'popout:get-data'. Keyed by BrowserWindow.id. Using a pull model (renderer
// invokes) avoids the race condition where 'popout:init' was sent before
// React's useEffect had registered its listener.
const popoutDataMap = new Map<number, PopoutTabData>();

// Tracks all currently open popout windows by id so we can close them when
// the main window closes. (popoutDataMap entries are removed after data fetch,
// so they can't be used for lifetime tracking.)
const popoutWindowIds = new Set<number>();

/** Builds a minimal menu for a single-file popout window.
 *  - No New / Open / Quit — those belong to the main window only.
 *  - "Close Window" closes only this popout.
 */
function buildPopoutMenu(win: Electron.BrowserWindow): Electron.Menu {
  const wc = win.webContents;
  const send = (ch: string) => wc.send(ch);

  const popoutTemplate: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        { label: 'Save',        accelerator: 'CmdOrCtrl+S',       click: () => send('menu:save') },
        { label: 'Save As…',    accelerator: 'CmdOrCtrl+Shift+S', click: () => send('menu:saveAs') },
        { type: 'separator' },
        {
          label: 'Print Preview…',
          accelerator: 'CmdOrCtrl+Shift+P',
          click: () => send('menu:printPreview'),
        },
        { type: 'separator' },
        { label: 'Move to Main Window', accelerator: 'CmdOrCtrl+Shift+M', click: () => send('menu:moveToMain') },
        { type: 'separator' },
        { label: 'Close Window', accelerator: 'CmdOrCtrl+W', click: () => win.close() },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' as const },
        { role: 'redo' as const },
        { type: 'separator' as const },
        { role: 'cut' as const },
        { role: 'copy' as const },
        { role: 'paste' as const },
        { type: 'separator' as const },
        { label: 'Find…',           accelerator: 'CmdOrCtrl+F',   click: () => send('menu:find') },
        { label: 'Replace…',        accelerator: 'CmdOrCtrl+H',   click: () => send('menu:replace') },
        { type: 'separator' as const },
        { label: 'Format Document', accelerator: 'Shift+Alt+F',   click: () => send('menu:format') },
      ],
    },
    {
      label: 'View',
      submenu: [
        { label: 'Zoom In',    accelerator: 'CmdOrCtrl+=', click: () => adjustZoom(wc, +1) },
        { label: 'Zoom Out',   accelerator: 'CmdOrCtrl+-', click: () => adjustZoom(wc, -1) },
        { label: 'Reset Zoom', accelerator: 'CmdOrCtrl+0', click: () => resetZoom(wc) },
      ],
    },
  ];

  return Menu.buildFromTemplate(popoutTemplate);
}

ipcMain.handle('window:popout', async (_event, tabData: PopoutTabData) => {
  const popoutWin = new BrowserWindow({
    width: 900,
    height: 700,
    title: tabData.title,
    icon: join(__dirname, '../../build/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Give the popout its own trimmed menu (no Quit, no New/Open, no Preferences).
  popoutWin.setMenu(buildPopoutMenu(popoutWin));

  // Store the tab data; the renderer will fetch it via 'popout:get-data' once mounted.
  popoutDataMap.set(popoutWin.id, tabData);
  popoutWindowIds.add(popoutWin.id);
  // Capture the webContents id now — by the time 'closed' fires the webContents
  // is already destroyed and accessing popoutWin.webContents.id would throw.
  const popoutWcId = popoutWin.webContents.id;
  popoutWin.on('closed', () => {
    popoutDataMap.delete(popoutWin.id);
    popoutWindowIds.delete(popoutWin.id);
    zoomLevels.delete(popoutWcId);
  });

  // Handle Ctrl++ (Ctrl+Shift+=) for zoom in — the menu only registers Ctrl+=.
  popoutWin.webContents.on('before-input-event', (_event, input) => {
    const ctrl = input.control || input.meta;
    if (!ctrl || input.type !== 'keyDown') return;
    if (input.key === '+') adjustZoom(popoutWin.webContents, +1);
  });

  if (isDev) {
    await popoutWin.loadURL((process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173') + '#popout');
  } else {
    await popoutWin.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'popout' });
  }
});

// Renderer calls this from useEffect (after mount) to retrieve its tab data.
// Pull model guarantees the listener is always ready before the request.
ipcMain.handle('popout:get-data', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return null;
  const data = popoutDataMap.get(win.id) ?? null;
  popoutDataMap.delete(win.id);
  return data;
});

ipcMain.handle('window:moveToMain', (event, tabData: PopoutTabData) => {
  mainWindow?.webContents.send('menu:addTab', tabData);
  BrowserWindow.fromWebContents(event.sender)?.close();
});

// Setup primitive app menu (can be fleshed out later)
import { Menu } from 'electron';

// Per-webContents zoom level (keyed by webContents.id) so each window zooms independently.
const zoomLevels = new Map<number, number>();

function adjustZoom(wc: Electron.WebContents, delta: number): void {
  const current = zoomLevels.get(wc.id) ?? 0;
  const next = Math.max(-9, Math.min(9, current + delta));
  zoomLevels.set(wc.id, next);
  wc.setZoomLevel(next);
}

function resetZoom(wc: Electron.WebContents): void {
  zoomLevels.set(wc.id, 0);
  wc.setZoomLevel(0);
}

const isMac = process.platform === 'darwin';

// Electron types the `win` parameter of menu click callbacks as
// `BrowserWindow | BaseWindow`. Only BrowserWindow has webContents,
// which is all we ever use here, so we narrow it with this helper.
const asBrowserWindow = (win: Electron.BrowserWindow | Electron.BaseWindow | undefined): Electron.BrowserWindow | undefined =>
  win instanceof BrowserWindow ? win : undefined;

const template: Electron.MenuItemConstructorOptions[] = [
  // App Menu (macOS only)
  ...(isMac
    ? [{
        label: app.name,
        submenu: [
          { role: 'about' as const },
          { type: 'separator' as const },
          {
            label: 'Check for Updates…',
            click: () => checkForUpdates({ notifyIfUpToDate: true, parentWindow: mainWindow })
          },
          { type: 'separator' as const },
          { role: 'services' as const },
          { type: 'separator' as const },
          { role: 'hide' as const },
          { role: 'hideOthers' as const },
          { role: 'unhide' as const },
          { type: 'separator' as const },
          { role: 'quit' as const }
        ]
      }]
    : []),
  {
    label: 'File',
    submenu: [
      { label: 'New', accelerator: 'CmdOrCtrl+N', click: (_item, win) => (asBrowserWindow(win) ?? mainWindow)?.webContents.send('menu:new') },
      { label: 'Open', accelerator: 'CmdOrCtrl+O', click: (_item, win) => (asBrowserWindow(win) ?? mainWindow)?.webContents.send('menu:open') },
      { label: 'Save', accelerator: 'CmdOrCtrl+S', click: (_item, win) => (asBrowserWindow(win) ?? mainWindow)?.webContents.send('menu:save') },
      { label: 'Save As...', accelerator: 'CmdOrCtrl+Shift+S', click: (_item, win) => (asBrowserWindow(win) ?? mainWindow)?.webContents.send('menu:saveAs') },
      { label: 'Pop Out to New Window', accelerator: 'CmdOrCtrl+Shift+N', click: (_item, win) => (asBrowserWindow(win) ?? mainWindow)?.webContents.send('menu:popoutActiveTab') },
      { type: 'separator' },
      {
        label: 'Preferences…',
        accelerator: 'CmdOrCtrl+,',
        click: () => mainWindow?.webContents.send('menu:openSettings'),
      },
      { type: 'separator' },
      {
        label: 'Print Preview…',
        accelerator: 'CmdOrCtrl+Shift+P',
        click: (_item, win) => { (asBrowserWindow(win) ?? mainWindow)?.webContents.send('menu:printPreview'); }
      },
      {
        label: 'Print…', accelerator: 'CmdOrCtrl+P', click: async () => {
          if (!mainWindow) return;
          const printers = await mainWindow.webContents.getPrintersAsync();
          if (printers.length === 0) {
            dialog.showErrorBox('No Printer Found', 'No printers are installed or available on this system.');
            return;
          }
          const defaultPrinter = printers.find(p => (p as Electron.PrinterInfo & { isDefault?: boolean }).isDefault) ?? printers[0];
          mainWindow.webContents.print(
            { silent: false, printBackground: true, deviceName: defaultPrinter.name },
            (success, failureReason) => { if (!success) console.error('Print failed:', failureReason); }
          );
        }
      },
      { type: 'separator' },
      { role: 'quit' }
    ]
  },
  {
    label: 'Edit',
    submenu: [
      { role: 'undo' },
      { role: 'redo' },
      { type: 'separator' },
      { role: 'cut' },
      { role: 'copy' },
      { role: 'paste' },
      { type: 'separator' },
      { label: 'Find...', accelerator: 'CmdOrCtrl+F', click: (_item, win) => (asBrowserWindow(win) ?? mainWindow)?.webContents.send('menu:find') },
      { label: 'Replace...', accelerator: 'CmdOrCtrl+H', click: (_item, win) => (asBrowserWindow(win) ?? mainWindow)?.webContents.send('menu:replace') },
      { type: 'separator' },
      { label: 'Format Document', accelerator: 'Shift+Alt+F', click: (_item, win) => (asBrowserWindow(win) ?? mainWindow)?.webContents.send('menu:format') },
    ]
  },
  {
    label: 'View',
    submenu: [
      { label: 'Zoom In',    accelerator: 'CmdOrCtrl+=', click: (_item, win) => adjustZoom((asBrowserWindow(win) ?? mainWindow)!.webContents, +1) },
      { label: 'Zoom Out',   accelerator: 'CmdOrCtrl+-', click: (_item, win) => adjustZoom((asBrowserWindow(win) ?? mainWindow)!.webContents, -1) },
      { label: 'Reset Zoom', accelerator: 'CmdOrCtrl+0', click: (_item, win) => resetZoom((asBrowserWindow(win) ?? mainWindow)!.webContents) },
      { type: 'separator' },
      { label: 'Pop Out Active Tab to New Window', accelerator: 'CmdOrCtrl+Shift+N', click: () => mainWindow?.webContents.send('menu:popoutActiveTab') },
      { type: 'separator' },
      { role: 'reload' },
      { role: 'toggleDevTools' },
    ]
  },
  {
    role: 'help',
    submenu: [
      {
        label: 'Show All Commands',
        accelerator: 'F1',
        click: (_item, win) => (asBrowserWindow(win) ?? mainWindow)?.webContents.send('menu:showAllCommands')
      },
      { type: 'separator' },
      {
        label: 'Check for Updates\u2026',
        click: () => checkForUpdates({ notifyIfUpToDate: true, parentWindow: mainWindow })
      },
      { type: 'separator' },
      {
        label: 'About',
        click: async () => {
          const { response } = await dialog.showMessageBox(mainWindow ?? undefined!, {
            type: 'info',
            title: 'About AwapiEditor',
            message: 'AwapiEditor',
            detail: [
              `Version: ${app.getVersion()}`,
              `Electron: ${process.versions.electron}`,
              `Chrome: ${process.versions.chrome}`,
              `Node.js: ${process.versions.node}`,
              `Platform: ${process.platform} ${process.arch}`,
              '',
              'A fast, lightweight, universal text editor.',
              'github.com/awapi/awapi-editor',
              '',
              'Maintainer: Omer Yesil',
              'github.com/omeryesil',
            ].join('\n'),
            buttons: ['OK', 'Open Repo', 'Open Profile'],
          });
          if (response === 1) shell.openExternal('https://github.com/awapi/awapi-editor');
          if (response === 2) shell.openExternal('https://github.com/omeryesil');
        }
      }
    ]
  }
];

const menu = Menu.buildFromTemplate(template);
Menu.setApplicationMenu(menu);
