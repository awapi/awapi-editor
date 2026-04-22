import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import { join } from 'path';
import * as fs from 'fs';
import { checkForUpdates } from './updater';

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
  
  const content = fs.readFileSync(filePaths[0], 'utf-8');
  return { filePath: filePaths[0], content };
});

ipcMain.handle('file:read', async (_, filePath: string) => {
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    return { filePath, content };
  } catch (error) {
    console.error('Failed to read file:', error);
    return null;
  }
});

// Session persistence – save / load the editor session (open tabs) so the
// previous workspace is restored automatically on next launch.
const SESSION_FILE = join(app.getPath('userData'), 'session.json');

ipcMain.handle('session:save', async (_, sessionData: unknown) => {
  try {
    fs.writeFileSync(SESSION_FILE, JSON.stringify(sessionData), 'utf-8');
    return true;
  } catch (error) {
    console.error('Failed to save session:', error);
    return false;
  }
});

ipcMain.handle('session:load', async () => {
  try {
    if (!fs.existsSync(SESSION_FILE)) return null;
    const raw = fs.readFileSync(SESSION_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (error) {
    console.error('Failed to load session:', error);
    return null;
  }
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

ipcMain.handle('dialog:saveFile', async (_, filePath: string, content: string) => {
  if (!mainWindow) return null;
  let targetPath = filePath;
  
  if (!targetPath) {
    const { canceled, filePath: newPath } = await dialog.showSaveDialog(mainWindow, {
      defaultPath: 'Untitled.txt',
    });
    if (canceled || !newPath) return null;
    targetPath = newPath;
  }

  fs.writeFileSync(targetPath, content, 'utf-8');
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
      { label: 'Print', accelerator: 'CmdOrCtrl+P', click: () => { mainWindow?.webContents.print({ silent: false, printBackground: true }); } },
      { type: 'separator' },
      { label: 'Close Tab', accelerator: 'CmdOrCtrl+W', click: () => mainWindow?.webContents.send('menu:closeTab') },
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
    label: 'Settings',
    submenu: [
      {
        label: 'Theme',
        submenu: [
          { label: 'Light', click: () => mainWindow?.webContents.send('menu:themeChange', 'light') },
          { label: 'Dark', click: () => mainWindow?.webContents.send('menu:themeChange', 'dark') },
          { type: 'separator' },
          { label: 'Import Custom Theme (.json)...', click: () => {
             // Future implementation to read a .json file and push custom colors down via IPC
             dialog.showErrorBox('Coming Soon', 'Custom Theme ZIP/JSON uploading will be implemented here.');
          }}
        ]
      }
    ]
  },
  {
    role: 'help',
    submenu: [
      {
        label: 'Check for Updates\u2026',
        click: () => checkForUpdates({ notifyIfUpToDate: true, parentWindow: mainWindow })
      }
    ]
  }
];

const menu = Menu.buildFromTemplate(template);
Menu.setApplicationMenu(menu);
