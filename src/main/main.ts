import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import { join } from 'path';
import * as fs from 'fs';

// Environment variable indicating if we are in dev mode
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

let mainWindow: BrowserWindow | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1024,
    height: 768,
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
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
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
const template: Electron.MenuItemConstructorOptions[] = [
  {
    label: 'File',
    submenu: [
      { label: 'New', click: () => mainWindow?.webContents.send('menu:new') },
      { label: 'Open', click: () => mainWindow?.webContents.send('menu:open') },
      { label: 'Save', click: () => mainWindow?.webContents.send('menu:save') },
      { label: 'Save As...', click: () => mainWindow?.webContents.send('menu:saveAs') },
      { type: 'separator' },
      { label: 'Print', click: () => { mainWindow?.webContents.print({ silent: false, printBackground: true }); } },
      { type: 'separator' },
      { label: 'Close Tab', click: () => mainWindow?.webContents.send('menu:closeTab') },
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
    ]
  },
  {
    label: 'View',
    submenu: [
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
  }
];

const menu = Menu.buildFromTemplate(template);
Menu.setApplicationMenu(menu);
