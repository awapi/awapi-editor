import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import { join } from 'path';
import * as fs from 'fs';
import { checkForUpdates } from './updater';

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

app.name = 'AwapiEditor';

// Environment variable indicating if we are in dev mode
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

let mainWindow: BrowserWindow | null = null;

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

  if (isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  // Set the macOS Dock icon explicitly in dev (BrowserWindow.icon doesn't affect the Dock)
  if (process.platform === 'darwin' && isDev && app.dock) {
    app.dock.setIcon(join(__dirname, '../../build/icon.png'));
  }

  createWindow();

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
ipcMain.handle('dialog:openFile', async () => {
  if (!mainWindow) return null;
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
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
interface AppSettings {
  /** Custom directory where session.json is stored. null = use userData default. */
  sessionDir: string | null;
  /** Last selected theme ('dark' | 'light'). null/undefined = default dark. */
  theme?: string | null;
}

const SETTINGS_FILE = join(app.getPath('userData'), 'settings.json');

function loadAppSettings(): AppSettings {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      return JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf-8')) as AppSettings;
    }
  } catch {
    // ignore corrupt settings
  }
  return { sessionDir: null };
}

function getSessionFilePath(): string {
  const settings = loadAppSettings();
  const dir = settings.sessionDir || app.getPath('userData');
  return join(dir, 'session.json');
}

// Session persistence – save / load the editor session (open tabs) so the
// previous workspace is restored automatically on next launch.
ipcMain.handle('session:save', async (_, sessionData: unknown) => {
  try {
    const sessionFile = getSessionFilePath();
    const dir = sessionFile.substring(0, sessionFile.lastIndexOf('/') !== -1
      ? sessionFile.lastIndexOf('/')
      : sessionFile.lastIndexOf('\\'));
    if (dir && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(sessionFile, JSON.stringify(sessionData), 'utf-8');
    return true;
  } catch (error) {
    console.error('Failed to save session:', error);
    return false;
  }
});

ipcMain.handle('session:load', async () => {
  try {
    const sessionFile = getSessionFilePath();
    if (!fs.existsSync(sessionFile)) return null;
    const raw = fs.readFileSync(sessionFile, 'utf-8');
    return JSON.parse(raw);
  } catch (error) {
    console.error('Failed to load session:', error);
    return null;
  }
});

// ── Settings IPC ──────────────────────────────────────────────────────────────
ipcMain.handle('settings:load', async () => {
  return loadAppSettings();
});

ipcMain.handle('settings:save', async (_, settings: AppSettings) => {
  try {
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(settings), 'utf-8');
    return true;
  } catch (error) {
    console.error('Failed to save settings:', error);
    return false;
  }
});

ipcMain.handle('settings:getDefaultDir', async () => {
  return app.getPath('userData');
});

ipcMain.handle('settings:openDirDialog', async () => {
  if (!mainWindow) return null;
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory', 'createDirectory'],
    title: 'Select Session Storage Folder',
  });
  if (canceled || filePaths.length === 0) return null;
  return filePaths[0];
});

ipcMain.handle('settings:openInExplorer', async (_, dirPath: string) => {
  await shell.openPath(dirPath);
});

ipcMain.handle('dialog:confirmUnsavedChanges', async (_, tabTitle: string) => {
  if (!mainWindow) return 'cancel';
  const { response } = await dialog.showMessageBox(mainWindow, {
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

ipcMain.handle('dialog:saveFile', async (_, filePath: string, content: string, eol?: EolKind) => {
  if (!mainWindow) return null;
  let targetPath = filePath;

  if (!targetPath) {
    const { canceled, filePath: newPath } = await dialog.showSaveDialog(mainWindow, {
      defaultPath: 'Untitled.txt',
    });
    if (canceled || !newPath) return null;
    targetPath = newPath;
  }

  const normalized = applyEol(content, eol ?? 'LF');
  fs.writeFileSync(targetPath, normalized, 'utf-8');
  return targetPath;
});

// Setup primitive app menu (can be fleshed out later)
import { Menu } from 'electron';

let zoomLevel = 0;

const isMac = process.platform === 'darwin';

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
      { label: 'New', accelerator: 'CmdOrCtrl+N', click: () => mainWindow?.webContents.send('menu:new') },
      { label: 'Open', accelerator: 'CmdOrCtrl+O', click: () => mainWindow?.webContents.send('menu:open') },
      { label: 'Save', accelerator: 'CmdOrCtrl+S', click: () => mainWindow?.webContents.send('menu:save') },
      { label: 'Save As...', accelerator: 'CmdOrCtrl+Shift+S', click: () => mainWindow?.webContents.send('menu:saveAs') },
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
        click: () => { mainWindow?.webContents.send('menu:printPreview'); }
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
      { label: 'Find...', accelerator: 'CmdOrCtrl+F', click: () => mainWindow?.webContents.send('menu:find') },
      { label: 'Replace...', accelerator: 'CmdOrCtrl+H', click: () => mainWindow?.webContents.send('menu:replace') },
      { type: 'separator' },
      { label: 'Format Document', accelerator: 'Shift+Alt+F', click: () => mainWindow?.webContents.send('menu:format') },
    ]
  },
  {
    label: 'View',
    submenu: [
      { label: 'Zoom In',    accelerator: 'CmdOrCtrl+=', click: () => { zoomLevel = Math.min(zoomLevel + 1, 9);  mainWindow?.webContents.setZoomLevel(zoomLevel); } },
      { label: 'Zoom Out',   accelerator: 'CmdOrCtrl+-', click: () => { zoomLevel = Math.max(zoomLevel - 1, -9); mainWindow?.webContents.setZoomLevel(zoomLevel); } },
      { label: 'Reset Zoom', accelerator: 'CmdOrCtrl+0', click: () => { zoomLevel = 0; mainWindow?.webContents.setZoomLevel(0); } },
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
        click: () => mainWindow?.webContents.send('menu:showAllCommands')
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
