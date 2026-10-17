import { app, BrowserWindow, ipcMain, dialog, shell, nativeTheme, clipboard, webContents, protocol, net } from 'electron';

// Set app name BEFORE any imports that use app.getPath()
app.name = 'AwapiEditor';

// Register a privileged scheme so the Markdown preview window can load local
// relative images (`awapi-asset://local/...`) even when the renderer runs on
// http://localhost in dev mode (where Chromium blocks `file://` subresources).
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'awapi-asset',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

import { dirname, isAbsolute, join } from 'path';
import { pathToFileURL } from 'url';
import * as fs from 'fs';
import { spawn } from 'child_process';
import { checkForUpdates } from './updater';
import { ZOOM_STEP, adjustZoom, resetZoom, clearZoomState } from './zoom';
import {
  GO_TO_LINE_ACCELERATOR,
  SHORTCUTS_REFERENCE_ACCELERATOR,
  TOGGLE_EXPLORER_ACCELERATOR,
  MARKDOWN_PREVIEW_ACCELERATOR,
} from './shortcuts';
import {
  createMarkdownPreviewManager,
  type MarkdownPreviewData,
} from './markdownPreviewManager';
import {
  listDirectoryEntries,
  deleteExplorerPath,
  createExplorerFile,
  createExplorerFolder,
  syncWatchedDirs,
  clearAllWatchedDirs,
} from './explorer';
import { parseReadFileOptions } from './readFileOptions';
import { openExternalTerminal, resolveTerminalCwd, type ExternalTerminalDeps } from './externalTerminal';
import { getTerminalChoices, resolveShell } from './terminalDetection';
import { PtyManager } from './ptyManager';
import type { PtyCreateOptions } from '../shared/terminal';
import { createPopoutCloseGuard } from './popoutCloseGuard';
import { createMainWindowCloseCoordinator } from './mainWindowCloseCoordinator';
import { WatchRegistry, parseWatchEntries } from './watchRegistry';
import { readFilesForOpen, formatOpenFailures } from './openFiles';
import { ensureWindow, sendWhenLoaded } from './windowDelivery';
import {
  isWindowAlwaysOnTop,
  setWindowAlwaysOnTop,
  toggleWindowAlwaysOnTop,
  syncAlwaysOnTopMenuItem,
  appMenuAlwaysOnTopWindow,
  ALWAYS_ON_TOP_MENU_ID,
} from './alwaysOnTop';
import {
  type EncodingKind,
  DEFAULT_ENCODING,
  isEncodingKind,
  decodeRawFileInput,
  encodeTextToBuffer,
} from './encoding';
import { isRasterImagePath } from '../shared/images';
import {
  markSelfSaved,
  syncWatchedFiles,
  refreshWatchedFile,
  clearAllWatchedFiles,
} from './fileWatcher';
import {
  getContextMenuStatus,
  setContextMenuEnabled,
  type ContextMenuDeps,
} from './contextMenu';
import {
  pathsFromArgv,
  getCliCommandStatus,
  setCliCommandEnabled,
  type CliCommandDeps,
  type CliArgDeps,
} from './cliCommand';
import { 
  loadAppSettings, 
  saveAppSettings, 
  getSessionDirPath,
  getDefaultBackupDir,
  saveSession, 
  loadSession,
  getRecentFiles,
  addRecentFile,
  clearRecentFiles,
  removeRecentFile,
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
 * Extract all file and directory paths from argv produced by Electron / the OS,
 * resolving relative paths against `workingDirectory`.
 */
function cliArgDeps(): CliArgDeps {
  return {
    platform: process.platform,
    isFile: (p: string) => {
      try {
        return fs.statSync(p).isFile();
      } catch {
        return false;
      }
    },
    isDirectory: (p: string) => {
      try {
        return fs.statSync(p).isDirectory();
      } catch {
        return false;
      }
    },
  };
}

function extractPathsFromArgv(
  argv: string[],
  workingDirectory = process.cwd(),
): { files: string[]; directories: string[] } {
  return pathsFromArgv(argv, isDev, workingDirectory, cliArgDeps());
}

/** Add `filePath` to "Open Recent" and refresh the application menu. */
function recordRecentFile(filePath: string): void {
  addRecentFile(filePath);
  rebuildAppMenu();
}

/**
 * Send a file-open request (OS "Open With", CLI argument, or File -> Open Recent)
 * to the renderer once it is ready. These are user-initiated opens, so the file
 * is recorded in "Open Recent" here, even if it is already open in a tab.
 *
 * Must only be called after `app` is ready: on macOS the app keeps running
 * with no window, so the main window is re-created if needed.
 */
function sendFileToRenderer(filePath: string): void {
  const win = ensureWindow(mainWindow, () => {
    createWindow();
    return mainWindow!;
  });
  recordRecentFile(filePath);
  sendWhenLoaded(win, 'file:openFromArgs', filePath);
}

/**
 * Send a folder-open request (Windows Explorer folder context menu, macOS Finder,
 * or CLI argument) to the renderer once it is ready so the File Explorer sidebar
 * opens rooted at `dirPath`.
 */
function sendFolderToRenderer(dirPath: string): void {
  const win = ensureWindow(mainWindow, () => {
    createWindow();
    return mainWindow!;
  });
  saveAppSettings({ explorerFolderPath: dirPath, explorerVisible: true });
  sendWhenLoaded(win, 'folder:openFromArgs', dirPath);
}

function isExistingDirectory(targetPath: string): boolean {
  try {
    return fs.statSync(targetPath).isDirectory();
  } catch {
    return false;
  }
}

// macOS: the OS sends this event when a file or folder is opened via Finder / "Open With".
// It may fire before app.whenReady() (e.g. launching the app by opening a
// file), so it is queued until startup creates the window.
let pendingOpenPath: string | null = null;
app.on('open-file', (event, targetPath) => {
  event.preventDefault();
  if (app.isReady()) {
    if (isExistingDirectory(targetPath)) {
      sendFolderToRenderer(targetPath);
    } else {
      sendFileToRenderer(targetPath);
    }
  } else {
    pendingOpenPath = targetPath;
  }
});

// Single-instance lock: if the app is already running and the user opens
// another file or folder via "Open With" / context menu, the OS launches a second
// process. We redirect that request to the existing window and quit the second process.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv, workingDirectory) => {
    // Bring existing window to front
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    const { files, directories } = extractPathsFromArgv(argv, workingDirectory || process.cwd());
    if (directories.length > 0) {
      sendFolderToRenderer(directories[directories.length - 1]);
    }
    for (const filePath of files) {
      sendFileToRenderer(filePath);
    }
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

  // Close all popout windows when the main window is closed. Pop-out tabs are
  // not part of the session, so dirty pop-outs are asked to save first.
  mainWindow.on('close', (event) => {
    if (mainWindowCloseCoordinator.requestMainClose()) {
      event.preventDefault();
      return;
    }
    watchRegistry.clear();
    clearAllWatchedFiles();
    clearAllWatchedDirs();
    for (const winId of popoutWindowIds) {
      const win = BrowserWindow.fromId(winId);
      win?.destroy();
    }
    const previewWinId = markdownPreviewManager.getWindowId();
    if (previewWinId !== null) {
      BrowserWindow.fromId(previewWinId)?.destroy();
      markdownPreviewManager.clear();
    }
  });
  // On macOS the app outlives its windows; drop the destroyed window so menu
  // rebuilds (e.g. Clear Recent) don't touch it.
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // When the Markdown preview popup is magnetically docked to the main window's
  // right edge, moving or resizing the main window moves the preview along with it.
  mainWindow.on('move', () => {
    syncDockedMarkdownPreviewToMain();
  });
  mainWindow.on('resize', () => {
    syncDockedMarkdownPreviewToMain();
  });
  // When the user clicks back on the main editor window (after another app like
  // VS Code was covering the preview), raise the preview window to the front too
  // while keeping keyboard focus in the main editor.
  mainWindow.on('focus', () => {
    bringMarkdownPreviewToFront();
  });
  mainWindow.on('restore', () => {
    bringMarkdownPreviewToFront();
  });

  // Handle Ctrl++ (Ctrl+Shift+=) for zoom in — the menu only registers Ctrl+=.
  // before-input-event fires before Chromium or the menu processes the key,
  // so preventDefault() stops the menu accelerator from firing a second time.
  mainWindow.webContents.on('before-input-event', (event, input) => {
    const ctrl = input.control || input.meta;
    if (!ctrl || input.type !== 'keyDown') return;
    if (input.key === '+') {
      event.preventDefault();
      adjustZoom(mainWindow!.webContents, ZOOM_STEP);
    }
  });

  if (isDev) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }
}

app.whenReady().then(() => {
  protocol.handle('awapi-asset', (request) => {
    try {
      const parsed = new URL(request.url);
      let filePath = decodeURIComponent(parsed.pathname);
      if (process.platform === 'win32' && /^\/[a-zA-Z]:\//.test(filePath)) {
        filePath = filePath.slice(1);
      }
      return net.fetch(pathToFileURL(filePath).toString());
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });

  // Apply the persisted theme to the native title bar before the window opens
  // so there is no dark-title-bar flash when the user prefers light theme.
  const startupSettings = loadAppSettings();
  nativeTheme.themeSource = startupSettings.theme === 'light' ? 'light' : 'dark';

  // Set the macOS Dock icon explicitly in dev (BrowserWindow.icon doesn't affect the Dock)
  if (process.platform === 'darwin' && isDev && app.dock) {
    app.dock.setIcon(join(__dirname, '../../build/icon.png'));
  }

  // An 'open-file' event right after 'ready' may already have created it.
  if (!mainWindow) createWindow();

  // Open file(s) or folder(s) passed as CLI arguments (Windows/Linux "Open With", context menu, or terminal `awed`)
  const { files: cliFiles, directories: cliDirectories } = extractPathsFromArgv(process.argv, process.cwd());
  const pendingIsDir = pendingOpenPath ? isExistingDirectory(pendingOpenPath) : false;
  const pendingFile = pendingOpenPath && !pendingIsDir ? pendingOpenPath : null;
  const pendingDir = pendingOpenPath && pendingIsDir ? pendingOpenPath : null;

  const dirsToOpen = pendingDir
    ? [...cliDirectories.filter(d => d !== pendingDir), pendingDir]
    : cliDirectories;
  if (dirsToOpen.length > 0) {
    sendFolderToRenderer(dirsToOpen[dirsToOpen.length - 1]);
  }

  const filesToOpen = pendingFile
    ? [pendingFile, ...cliFiles.filter(f => f !== pendingFile)]
    : cliFiles;
  for (const fileToOpen of filesToOpen) {
    sendFileToRenderer(fileToOpen);
  }
  pendingOpenPath = null;

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

/**
 * Reads a file for opening in a tab. For binary raster images, skips reading
 * and decoding the file payload into a text string (the renderer streams the
 * image via `awapi-asset://`), while still verifying read access and size.
 */
function readTargetFileForTab(fp: string, explicitEncoding?: EncodingKind) {
  if (isRasterImagePath(fp)) {
    const stat = fs.statSync(fp);
    if (stat.isDirectory()) {
      throw new Error(`EISDIR: illegal operation on a directory, read '${fp}'`);
    }
    const fd = fs.openSync(fp, 'r');
    fs.closeSync(fd);
    return {
      filePath: fp,
      content: '',
      eol: 'LF' as EolKind,
      encoding: DEFAULT_ENCODING,
      byteSize: stat.size,
    };
  }
  const raw = fs.readFileSync(fp);
  const decoded = decodeRawFileInput(raw, explicitEncoding);
  const eol = detectEol(decoded.content);
  // Normalize to LF so Monaco has consistent line endings in memory.
  return {
    filePath: fp,
    content: normalizeToLF(decoded.content),
    eol,
    encoding: decoded.encoding,
    byteSize: raw.byteLength,
  };
}

// IPC Handlers
ipcMain.handle('dialog:openFile', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) ?? mainWindow;
  if (!win) return null;
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    properties: ['openFile', 'multiSelections'],
  });
  if (canceled || filePaths.length === 0) return null;

  const { files, failures } = readFilesForOpen(filePaths, (fp) => readTargetFileForTab(fp));

  if (failures.length > 0) {
    // Not awaited: the readable files open while the error is shown.
    void dialog.showMessageBox(win, {
      type: 'error',
      title: 'Open File',
      ...formatOpenFailures(failures),
      noLink: true,
    });
  }
  if (files.length === 0) return null;

  for (const file of files) addRecentFile(file.filePath);
  rebuildAppMenu();
  return files;
});

ipcMain.handle('file:read', async (_, filePath: string, rawOptions?: unknown) => {
  try {
    const options = parseReadFileOptions(rawOptions);
    const result = readTargetFileForTab(filePath, options.encoding);
    if (options.trackRecent) {
      recordRecentFile(filePath);
    }
    return result;
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

// ── File Explorer Sidebar IPC ────────────────────────────────────────────────
ipcMain.handle('explorer:openFolderDialog', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) ?? mainWindow;
  if (!win) return null;
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    properties: ['openDirectory'],
    title: 'Open Folder in Explorer',
  });
  if (canceled || filePaths.length === 0) return null;
  return filePaths[0];
});

ipcMain.handle('explorer:readDir', async (_, dirPath: string) => {
  return listDirectoryEntries(dirPath);
});

ipcMain.handle('explorer:deletePath', async (_, targetPath: string) => {
  const res = deleteExplorerPath(targetPath);
  if (res.ok && typeof targetPath === 'string' && targetPath) {
    removeRecentFile(targetPath);
    rebuildAppMenu();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('explorer:dirChanged', dirname(targetPath));
    }
  }
  return res;
});

ipcMain.handle('explorer:createFile', async (_, parentDirPath: string, name: string) => {
  const res = createExplorerFile(parentDirPath, name);
  if (res.ok && typeof parentDirPath === 'string' && parentDirPath) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('explorer:dirChanged', parentDirPath);
    }
  }
  return res;
});

ipcMain.handle('explorer:createFolder', async (_, parentDirPath: string, name: string) => {
  const res = createExplorerFolder(parentDirPath, name);
  if (res.ok && typeof parentDirPath === 'string' && parentDirPath) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('explorer:dirChanged', parentDirPath);
    }
  }
  return res;
});

ipcMain.handle('explorer:watchDirs', async (_, dirPaths: unknown) => {
  syncWatchedDirs(dirPaths, (changedDirPath) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('explorer:dirChanged', changedDirPath);
    }
  });
});

// ── Windows Explorer Context Menu ────────────────────────────────────────────
function contextMenuDeps(): ContextMenuDeps {
  return {
    platform: process.platform,
    execPath: process.execPath,
    isPackaged: app.isPackaged,
    iconPath: join(__dirname, '../../build/icon.ico'),
    appEntryPath: join(__dirname, 'main.js'),
    runReg: (args: string[]) =>
      new Promise((resolve) => {
        try {
          const child = spawn('reg.exe', args, { windowsHide: true });
          let stdout = '';
          let stderr = '';
          child.stdout?.on('data', (chunk) => {
            stdout += String(chunk);
          });
          child.stderr?.on('data', (chunk) => {
            stderr += String(chunk);
          });
          child.on('error', (err) => {
            resolve({ code: 1, stdout, stderr: err.message });
          });
          child.on('close', (code) => {
            resolve({ code: code ?? 1, stdout, stderr });
          });
        } catch (err) {
          resolve({
            code: 1,
            stdout: '',
            stderr: err instanceof Error ? err.message : String(err),
          });
        }
      }),
  };
}

ipcMain.handle('contextMenu:getStatus', () => getContextMenuStatus(contextMenuDeps()));

ipcMain.handle('contextMenu:setEnabled', (_, enable: boolean) =>
  setContextMenuEnabled(Boolean(enable), contextMenuDeps()),
);

// ── CLI Command (`awed`) ─────────────────────────────────────────────────────
function cliCommandDeps(): CliCommandDeps {
  return {
    platform: process.platform,
    env: process.env,
    homeDir: app.getPath('home'),
    execPath: process.execPath,
    isPackaged: app.isPackaged,
    appEntryPath: join(__dirname, 'main.js'),
    exists: (p: string) => fs.existsSync(p),
    mkdir: (p: string) => fs.mkdirSync(p, { recursive: true }),
    writeFile: (p: string, content: string, mode?: number) => {
      fs.writeFileSync(p, content, { encoding: 'utf-8', ...(mode !== undefined ? { mode } : {}) });
      if (mode !== undefined && process.platform !== 'win32') {
        fs.chmodSync(p, mode);
      }
    },
    unlink: (p: string) => fs.unlinkSync(p),
  };
}

ipcMain.handle('cliCommand:getStatus', () => getCliCommandStatus(cliCommandDeps()));

ipcMain.handle('cliCommand:setEnabled', (_, enable: boolean) =>
  setCliCommandEnabled(Boolean(enable), cliCommandDeps()),
);

ipcMain.handle('file:showInFolder', async (_, filePath: string) => {
  if (typeof filePath === 'string' && filePath) {
    shell.showItemInFolder(filePath);
  }
});

// ── Terminals ────────────────────────────────────────────────────────────────
function terminalDeps(): ExternalTerminalDeps {
  return {
    platform: process.platform,
    env: process.env,
    spawn,
    isDirectory: p => {
      try {
        return fs.statSync(p).isDirectory();
      } catch {
        return false;
      }
    },
    // lstat: Windows app execution aliases (wt.exe) are reparse points that
    // a following stat cannot open.
    exists: p => {
      try {
        fs.lstatSync(p);
        return true;
      } catch {
        return false;
      }
    },
    readFile: p => {
      try {
        return fs.readFileSync(p, 'utf-8');
      } catch {
        return null;
      }
    },
    realpath: p => {
      try {
        return fs.realpathSync(p);
      } catch {
        return null;
      }
    },
    dirname,
    isAbsolute,
    homeDir: app.getPath('home'),
  };
}

/** Terminal apps and shells available on this machine, for Preferences. */
ipcMain.handle('terminal:getChoices', () => getTerminalChoices(terminalDeps()));

// Opens the external terminal chosen in Preferences (automatic by default) in
// the folder containing `filePath`, or in the home folder when it is null
// (unsaved tabs).
ipcMain.handle('file:openInTerminal', async (event, filePath: string | null) => {
  const preference = loadAppSettings().externalTerminal ?? null;
  const result = await openExternalTerminal(filePath, terminalDeps(), preference);
  if (!result.ok) {
    const parent = BrowserWindow.fromWebContents(event.sender);
    const options = { type: 'error' as const, message: 'Could not open a terminal', detail: result.error };
    if (parent) await dialog.showMessageBox(parent, options);
    else await dialog.showMessageBox(options);
  }
  return result.ok;
});

// Integrated terminal. Renderer → main: pty:create (invoke), pty:write and
// pty:resize (fire-and-forget), pty:kill (invoke). Main → renderer:
// pty:data { id, data } and pty:exit { id, exitCode }.
const ptyManager = new PtyManager({
  platform: process.platform,
  env: process.env,
  loadSpawnPty: async () => {
    // Lazy CommonJS require (not import()): resolves inside app.asar.unpacked
    // in packaged builds, and a broken native build only disables the terminal.
    const pty = require('node-pty') as typeof import('node-pty');
    return (file, args, options) => pty.spawn(file, args, options);
  },
  resolveShell: () => resolveShell(loadAppSettings().integratedShell ?? null, terminalDeps()),
  resolveCwd: target => {
    const deps = terminalDeps();
    return (target && resolveTerminalCwd(target, deps)) || deps.homeDir;
  },
  sendData: (ownerId, payload) => {
    const wc = webContents.fromId(ownerId);
    if (wc && !wc.isDestroyed()) wc.send('pty:data', payload);
  },
  sendExit: (ownerId, payload) => {
    const wc = webContents.fromId(ownerId);
    if (wc && !wc.isDestroyed()) wc.send('pty:exit', payload);
  },
});

const ptyOwnersWithCleanup = new Set<number>();

ipcMain.handle('pty:create', (event, options: unknown) => {
  const owner = event.sender;
  const ownerId = owner.id;
  if (!ptyOwnersWithCleanup.has(ownerId)) {
    ptyOwnersWithCleanup.add(ownerId);
    // Kill the window's shells when it closes or reloads (the new page
    // cannot reattach to them).
    owner.on('did-navigate', () => ptyManager.killAllForOwner(ownerId));
    owner.once('destroyed', () => {
      ptyManager.killAllForOwner(ownerId);
      ptyOwnersWithCleanup.delete(ownerId);
    });
  }
  return ptyManager.create(ownerId, (options ?? undefined) as Partial<PtyCreateOptions> | undefined);
});

ipcMain.on('pty:write', (event, id: number, data: unknown) => {
  ptyManager.write(event.sender.id, id, data);
});

ipcMain.on('pty:resize', (event, id: number, cols: unknown, rows: unknown) => {
  ptyManager.resize(event.sender.id, id, cols, rows);
});

ipcMain.handle('pty:kill', (event, id: number) => {
  ptyManager.kill(event.sender.id, id);
});

app.on('will-quit', () => ptyManager.killAll());

ipcMain.handle('clipboard:readText', () => clipboard.readText());

ipcMain.handle('clipboard:writeText', async (_, text: string) => {
  if (typeof text === 'string') {
    clipboard.writeText(text);
  }
});

// ── External file watching ────────────────────────────────────────────────────
// Every window (main and pop-outs) reports the files it has open. Watchers run
// on the union, and each change is sent to the windows that have the file open.
const watchRegistry = new WatchRegistry();

function sendToFileOwners(filePath: string, channel: string, payload: unknown): void {
  for (const ownerId of watchRegistry.ownersOf(filePath)) {
    const wc = webContents.fromId(ownerId);
    if (wc && !wc.isDestroyed()) wc.send(channel, payload);
  }
}

const fileWatcherCallbacks = {
  onFileChanged: (payload: { filePath: string }) => {
    sendToFileOwners(payload.filePath, 'file:externalChange', payload);
  },
  onFileDeleted: (filePath: string) => {
    sendToFileOwners(filePath, 'file:externalDelete', { filePath });
  },
};

function resyncWatchedFiles(): void {
  syncWatchedFiles(watchRegistry.entries(), fileWatcherCallbacks);
}

ipcMain.handle('file:watchSync', async (event, rawEntries: unknown) => {
  const sender = event.sender;
  const ownerId = sender.id;
  if (!watchRegistry.has(ownerId)) {
    sender.once('destroyed', () => {
      watchRegistry.remove(ownerId);
      resyncWatchedFiles();
    });
  }
  watchRegistry.set(ownerId, parseWatchEntries(rawEntries));
  resyncWatchedFiles();
});

ipcMain.handle('dialog:confirmReloadExternalChange', async (event, tabTitle: string) => {
  const win = BrowserWindow.fromWebContents(event.sender) ?? mainWindow;
  if (!win) return 'keep';
  const { response } = await dialog.showMessageBox(win, {
    type: 'question',
    buttons: ['Reload from Disk', 'Keep My Changes'],
    defaultId: 0,
    cancelId: 1,
    title: 'File Changed on Disk',
    message: `"${tabTitle}" has been modified by another program.`,
    detail: 'This tab has unsaved changes. Do you want to reload it from disk and discard your changes, or keep your edits?',
    noLink: true,
  });
  return response === 0 ? 'reload' : 'keep';
});

ipcMain.handle(
  'dialog:confirmLossyEncoding',
  async (event, tabTitle: string, encodingLabel: string, count: number) => {
    const win = BrowserWindow.fromWebContents(event.sender) ?? mainWindow;
    if (!win) return false;
    const n = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
    const { response } = await dialog.showMessageBox(win, {
      type: 'warning',
      buttons: ['Save Anyway', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      title: 'Characters Will Be Lost',
      message: `${n} character${n === 1 ? '' : 's'} in "${String(tabTitle)}" cannot be represented in ${String(encodingLabel)}.`,
      detail: 'If you save, these characters will be replaced with "?". Choose a Unicode encoding (e.g. UTF-8) to keep them.',
      noLink: true,
    });
    return response === 0;
  },
);

ipcMain.handle('dialog:confirmReopenWithEncoding', async (event, tabTitle: string, encodingLabel: string) => {
  const win = BrowserWindow.fromWebContents(event.sender) ?? mainWindow;
  if (!win) return false;
  const { response } = await dialog.showMessageBox(win, {
    type: 'warning',
    buttons: ['Reopen', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    title: 'Reopen with Encoding',
    message: `Reopen "${String(tabTitle)}" as ${String(encodingLabel)}?`,
    detail: 'This tab has unsaved changes. Reopening reloads the file from disk and discards them.',
    noLink: true,
  });
  return response === 0;
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

ipcMain.handle(
  'dialog:saveFile',
  async (event, filePath: string, content: string, eol?: EolKind, encoding?: EncodingKind) => {
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
    const targetEncoding = isEncodingKind(encoding) ? encoding : DEFAULT_ENCODING;
    const encodedBuffer = encodeTextToBuffer(normalized, targetEncoding);
    markSelfSaved(targetPath);
    fs.writeFileSync(targetPath, encodedBuffer);
    refreshWatchedFile(targetPath);
    addRecentFile(targetPath);
    rebuildAppMenu();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('explorer:dirChanged', dirname(targetPath));
    }
    return targetPath;
  },
);

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

    markSelfSaved(oldPath);
    markSelfSaved(newPath);
    fs.renameSync(oldPath, newPath);
    let isDir = false;
    try {
      isDir = fs.statSync(newPath).isDirectory();
    } catch {
      isDir = false;
    }
    if (!isDir) {
      removeRecentFile(oldPath);
      addRecentFile(newPath);
      rebuildAppMenu();
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('explorer:dirChanged', dir);
    }
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
  encoding?: EncodingKind;
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

// Unsaved-change protection for pop-out windows (Cmd/Ctrl+W, menu, title-bar close).
const popoutCloseGuard = createPopoutCloseGuard();

/** Set by `before-quit` so a close deferred for pop-out prompts resumes quitting. */
let quitRequested = false;
app.on('before-quit', () => {
  quitRequested = true;
});

function isPopoutRendererUnavailable(win: BrowserWindow): boolean {
  const wc = win.webContents;
  return wc.isDestroyed() || wc.isCrashed();
}

// Closing the main window first runs each dirty pop-out's Save / Don't Save /
// Cancel prompt (one at a time) instead of destroying it with unsaved edits.
const mainWindowCloseCoordinator = createMainWindowCloseCoordinator({
  dirtyPopoutIds: () =>
    Array.from(popoutWindowIds).filter((id) => {
      const win = BrowserWindow.fromId(id);
      return !!win && !win.isDestroyed() && popoutCloseGuard.shouldPreventClose(id, isPopoutRendererUnavailable(win));
    }),
  promptPopoutClose: (id) => {
    const win = BrowserWindow.fromId(id);
    if (!win || win.isDestroyed()) return false;
    if (win.isMinimized()) win.restore();
    win.focus();
    win.close();
    return true;
  },
  finishMainClose: () => {
    // Deferred: this can run from inside the main window's 'close' handler.
    setImmediate(() => {
      if (quitRequested) app.quit();
      else mainWindow?.close();
    });
  },
});

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
        { label: 'Go to Line…',     accelerator: GO_TO_LINE_ACCELERATOR, click: () => send('menu:goToLine') },
        { type: 'separator' as const },
        {
          label: 'Line & Text Operations',
          submenu: [
            { label: 'Sort Lines Ascending',       click: () => wc.send('menu:textOperation', 'sortLinesAsc') },
            { label: 'Sort Lines Descending',      click: () => wc.send('menu:textOperation', 'sortLinesDesc') },
            { label: 'Remove Duplicate Lines',     click: () => wc.send('menu:textOperation', 'removeDuplicateLines') },
            { label: 'Remove Empty Lines',         click: () => wc.send('menu:textOperation', 'removeEmptyLines') },
            { label: 'Trim Trailing Whitespace',   click: () => wc.send('menu:textOperation', 'trimTrailingWhitespace') },
            { type: 'separator' as const },
            { label: 'Convert to UPPERCASE',       click: () => wc.send('menu:textOperation', 'uppercase') },
            { label: 'Convert to lowercase',       click: () => wc.send('menu:textOperation', 'lowercase') },
          ],
        },
        { type: 'separator' as const },
        { label: 'Format Document', accelerator: 'Shift+Alt+F',   click: () => send('menu:format') },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Always on Top',
          type: 'checkbox' as const,
          checked: isWindowAlwaysOnTop(win),
          click: () => {
            toggleWindowAlwaysOnTop(win);
            refreshAlwaysOnTopMenus(win);
          },
        },
        { type: 'separator' as const },
        {
          label: 'Open Markdown Preview',
          accelerator: MARKDOWN_PREVIEW_ACCELERATOR,
          click: () => send('menu:markdownPreview'),
        },
        { label: 'Toggle Whitespace & EOL', click: () => send('menu:toggleWhitespace') },
        { type: 'separator' as const },
        { label: 'Zoom In',    accelerator: 'CmdOrCtrl+=', click: () => adjustZoom(wc, ZOOM_STEP) },
        { label: 'Zoom Out',   accelerator: 'CmdOrCtrl+-', click: () => adjustZoom(wc, -ZOOM_STEP) },
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
  const popoutWinId = popoutWin.id;
  // Every close path (menu accelerator, Close Window, title-bar button) ends up
  // here. If the tab has unsaved changes, ask the renderer to run its
  // Save / Don't Save / Cancel prompt; it calls 'window:confirmClose' to proceed.
  popoutWin.on('close', (event) => {
    if (!popoutCloseGuard.shouldPreventClose(popoutWinId, isPopoutRendererUnavailable(popoutWin))) return;
    event.preventDefault();
    popoutWin.webContents.send('window:closeRequested');
  });
  popoutWin.on('closed', () => {
    popoutDataMap.delete(popoutWinId);
    popoutWindowIds.delete(popoutWinId);
    popoutCloseGuard.forget(popoutWinId);
    clearZoomState(popoutWcId);
    mainWindowCloseCoordinator.popoutClosed(popoutWinId);
  });

  // Handle Ctrl++ (Ctrl+Shift+=) for zoom in — the menu only registers Ctrl+=.
  popoutWin.webContents.on('before-input-event', (event, input) => {
    const ctrl = input.control || input.meta;
    if (!ctrl || input.type !== 'keyDown') return;
    if (input.key === '+') {
      event.preventDefault();
      adjustZoom(popoutWin.webContents, ZOOM_STEP);
    }
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
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  // The tab (including unsaved edits) now lives in the main window.
  popoutCloseGuard.approveClose(win.id);
  win.close();
});

/** Pop-out renderers report whether their tab has unsaved changes. */
ipcMain.handle('window:setDirty', (event, dirty: boolean) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || !popoutWindowIds.has(win.id)) return;
  popoutCloseGuard.setDirty(win.id, dirty === true);
});

/**
 * Called by a pop-out renderer when the user cancelled its close prompt. Aborts
 * a pending main-window close (or quit) that was waiting on this pop-out.
 */
ipcMain.handle('window:cancelClose', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || !popoutWindowIds.has(win.id)) return;
  quitRequested = false;
  mainWindowCloseCoordinator.popoutCloseCancelled(win.id);
});

/** Called by a pop-out renderer once the user has resolved unsaved changes. */
ipcMain.handle('window:confirmClose', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || !popoutWindowIds.has(win.id)) return;
  popoutCloseGuard.approveClose(win.id);
  win.close();
});

// ── Markdown Preview popup window ─────────────────────────────────────────────
const markdownPreviewManager = createMarkdownPreviewManager();
let isProgrammaticPreviewMove = false;
let previewSnapTimer: ReturnType<typeof setTimeout> | null = null;

function setPreviewPositionProgrammatically(win: BrowserWindow, x: number, y: number): void {
  if (win.isDestroyed()) return;
  const [curX, curY] = win.getPosition();
  const targetX = Math.round(x);
  const targetY = Math.round(y);
  if (curX === targetX && curY === targetY) return;
  isProgrammaticPreviewMove = true;
  try {
    win.setPosition(targetX, targetY);
  } finally {
    isProgrammaticPreviewMove = false;
  }
}

function syncDockedMarkdownPreviewToMain(): void {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  const previewWinId = markdownPreviewManager.getWindowId();
  if (previewWinId === null) return;
  const previewWin = BrowserWindow.fromId(previewWinId);
  if (!previewWin || previewWin.isDestroyed() || previewWin.isMinimized()) return;
  const nextPos = markdownPreviewManager.onMainBoundsChanged(mainWindow.getBounds());
  if (!nextPos) return;
  setPreviewPositionProgrammatically(previewWin, nextPos.x, nextPos.y);
}

/**
 * Raises the Markdown preview popup to the top of the window stack (above
 * other apps like VS Code) without stealing keyboard focus from `mainWindow`.
 * On Windows, temporarily toggling `alwaysOnTop` on the preview window forces
 * the OS window manager to bring it above other foreground applications even
 * when it does not have input focus.
 */
function bringMarkdownPreviewToFront(): void {
  const previewWinId = markdownPreviewManager.getWindowId();
  if (previewWinId === null) return;
  const previewWin = BrowserWindow.fromId(previewWinId);
  if (!previewWin || previewWin.isDestroyed() || previewWin.isMinimized()) return;

  const alreadyPinned = isWindowAlwaysOnTop(previewWin);
  if (alreadyPinned) {
    previewWin.moveTop();
    return;
  }

  previewWin.setAlwaysOnTop(true);
  previewWin.showInactive();
  previewWin.moveTop();
  previewWin.setAlwaysOnTop(false);
}

function buildMarkdownPreviewMenu(win: Electron.BrowserWindow): Electron.Menu {
  const wc = win.webContents;
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        { label: 'Close Preview', accelerator: 'CmdOrCtrl+W', click: () => win.close() },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'copy' as const },
        { role: 'selectAll' as const },
      ],
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Always on Top',
          type: 'checkbox' as const,
          checked: isWindowAlwaysOnTop(win),
          click: () => {
            toggleWindowAlwaysOnTop(win);
            refreshAlwaysOnTopMenus(win);
          },
        },
        { type: 'separator' as const },
        { label: 'Zoom In',    accelerator: 'CmdOrCtrl+=', click: () => adjustZoom(wc, ZOOM_STEP) },
        { label: 'Zoom Out',   accelerator: 'CmdOrCtrl+-', click: () => adjustZoom(wc, -ZOOM_STEP) },
        { label: 'Reset Zoom', accelerator: 'CmdOrCtrl+0', click: () => resetZoom(wc) },
      ],
    },
  ];
  return Menu.buildFromTemplate(template);
}

function sendUpdateToMarkdownPreviewWindow(data: MarkdownPreviewData): void {
  const winId = markdownPreviewManager.getWindowId();
  if (winId === null) return;
  const win = BrowserWindow.fromId(winId);
  if (!win || win.isDestroyed()) return;
  win.setTitle(`Preview — ${data.title}`);
  const wc = win.webContents;
  if (!wc.isDestroyed() && !wc.isLoading()) {
    wc.send('markdown:previewUpdate', data);
  }
}

function broadcastMarkdownPreviewVisibility(isOpen: boolean): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('markdown:previewVisibilityChanged', isOpen);
  }
  for (const winId of popoutWindowIds) {
    const win = BrowserWindow.fromId(winId);
    if (win && !win.isDestroyed()) {
      win.webContents.send('markdown:previewVisibilityChanged', isOpen);
    }
  }
}

ipcMain.handle('markdown:openPreview', async (_event, rawData: unknown) => {
  const existingId = markdownPreviewManager.getWindowId();
  if (existingId !== null) {
    const existingWin = BrowserWindow.fromId(existingId);
    if (existingWin && !existingWin.isDestroyed()) {
      existingWin.close();
      markdownPreviewManager.clear();
      broadcastMarkdownPreviewVisibility(false);
      return false;
    }
    markdownPreviewManager.setWindowId(null);
  }

  const data = markdownPreviewManager.setData(rawData);

  const initialMainBounds =
    mainWindow && !mainWindow.isDestroyed() ? mainWindow.getBounds() : null;
  const initialPos = initialMainBounds
    ? markdownPreviewManager.dockToMain(initialMainBounds)
    : null;

  const previewWin = new BrowserWindow({
    width: 820,
    height: initialMainBounds ? initialMainBounds.height : 680,
    ...(initialPos ? { x: Math.round(initialPos.x), y: Math.round(initialPos.y) } : {}),
    title: `Preview — ${data.title}`,
    icon: join(__dirname, '../../build/icon.png'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  previewWin.setMenu(buildMarkdownPreviewMenu(previewWin));
  markdownPreviewManager.setWindowId(previewWin.id);
  if (initialMainBounds) {
    markdownPreviewManager.dockToMain(initialMainBounds, previewWin.getBounds());
  }
  const previewWinId = previewWin.id;
  const previewWcId = previewWin.webContents.id;

  // Magnetic / sticky behavior when the user moves the preview window:
  // - If brought near the right edge of the main window, it sticks (docks) so
  //   subsequent main-window moves carry the preview along.
  // - If dragged away, it detaches and moves independently without affecting the main window.
  previewWin.on('move', () => {
    if (isProgrammaticPreviewMove) return;
    if (!mainWindow || mainWindow.isDestroyed() || previewWin.isDestroyed()) return;
    const { docked, snapPosition } = markdownPreviewManager.onPreviewMoved(
      mainWindow.getBounds(),
      previewWin.getBounds(),
    );
    if (previewSnapTimer) {
      clearTimeout(previewSnapTimer);
      previewSnapTimer = null;
    }
    if (docked && snapPosition) {
      previewSnapTimer = setTimeout(() => {
        previewSnapTimer = null;
        if (!previewWin.isDestroyed()) {
          setPreviewPositionProgrammatically(previewWin, snapPosition.x, snapPosition.y);
        }
      }, 120);
    }
  });

  // Open external http/https/mailto links in the OS default browser rather than navigating the popup
  previewWin.webContents.setWindowOpenHandler(({ url }) => {
    if (/^(?:https?:|mailto:)/i.test(url)) {
      void shell.openExternal(url);
    }
    return { action: 'deny' };
  });
  previewWin.webContents.on('will-navigate', (navEvent, url) => {
    if (/^(?:https?:|mailto:)/i.test(url)) {
      navEvent.preventDefault();
      void shell.openExternal(url);
    }
  });

  previewWin.on('close', () => {
    if (markdownPreviewManager.isPreviewWindow(previewWinId)) {
      markdownPreviewManager.clear();
      broadcastMarkdownPreviewVisibility(false);
    }
  });

  previewWin.on('closed', () => {
    if (previewSnapTimer) {
      clearTimeout(previewSnapTimer);
      previewSnapTimer = null;
    }
    markdownPreviewManager.clear();
    broadcastMarkdownPreviewVisibility(false);
    clearZoomState(previewWcId);
  });

  broadcastMarkdownPreviewVisibility(true);

  previewWin.webContents.on('before-input-event', (event, input) => {
    const ctrl = input.control || input.meta;
    if (!ctrl || input.type !== 'keyDown') return;
    if (input.key === '+') {
      event.preventDefault();
      adjustZoom(previewWin.webContents, ZOOM_STEP);
    }
  });

  if (isDev) {
    await previewWin.loadURL(
      (process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173') + '#markdown-preview',
    );
  } else {
    await previewWin.loadFile(join(__dirname, '../renderer/index.html'), {
      hash: 'markdown-preview',
    });
  }
  return true;
});

ipcMain.handle('markdown:updatePreview', (_event, rawData: unknown) => {
  if (markdownPreviewManager.getWindowId() === null) return;
  const data = markdownPreviewManager.setData(rawData);
  sendUpdateToMarkdownPreviewWindow(data);
});

ipcMain.handle('markdown:getPreviewData', () => {
  return markdownPreviewManager.getData();
});

ipcMain.handle('markdown:isPreviewOpen', () => {
  const winId = markdownPreviewManager.getWindowId();
  if (winId === null) return false;
  const win = BrowserWindow.fromId(winId);
  return !!win && !win.isDestroyed();
});

/**
 * Refreshes the menus that show `win`'s Always on Top state: the pop-out's own
 * menu (Windows/Linux) and the application menu checkbox (see appMenuAlwaysOnTopWindow).
 */
function refreshAlwaysOnTopMenus(win: BrowserWindow): void {
  if (popoutWindowIds.has(win.id)) win.setMenu(buildPopoutMenu(win));
  if (markdownPreviewManager.isPreviewWindow(win.id)) win.setMenu(buildMarkdownPreviewMenu(win));
  syncAlwaysOnTopMenuItem(
    Menu.getApplicationMenu(),
    appMenuAlwaysOnTopWindow(isMac, BrowserWindow.getFocusedWindow(), mainWindow),
  );
}

app.on('browser-window-focus', (_event, win) => {
  syncAlwaysOnTopMenuItem(Menu.getApplicationMenu(), appMenuAlwaysOnTopWindow(isMac, win, mainWindow));
});

ipcMain.handle('window:getAlwaysOnTop', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) ?? mainWindow;
  return isWindowAlwaysOnTop(win);
});

ipcMain.handle('window:setAlwaysOnTop', (event, flag: boolean) => {
  const win = BrowserWindow.fromWebContents(event.sender) ?? mainWindow;
  if (!win) return false;
  const next = setWindowAlwaysOnTop(win, flag);
  refreshAlwaysOnTopMenus(win);
  return next;
});

ipcMain.handle('window:toggleAlwaysOnTop', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender) ?? mainWindow;
  if (!win) return false;
  const next = toggleWindowAlwaysOnTop(win);
  refreshAlwaysOnTopMenus(win);
  return next;
});

// Setup primitive app menu (can be fleshed out later)
import { Menu } from 'electron';

const isMac = process.platform === 'darwin';

// Electron types the `win` parameter of menu click callbacks as
// `BrowserWindow | BaseWindow`. Only BrowserWindow has webContents,
// which is all we ever use here, so we narrow it with this helper.
const asBrowserWindow = (win: Electron.BrowserWindow | Electron.BaseWindow | undefined): Electron.BrowserWindow | undefined =>
  win instanceof BrowserWindow ? win : undefined;

function buildRecentFilesSubmenu(): Electron.MenuItemConstructorOptions[] {
  const recentFiles = getRecentFiles();
  if (recentFiles.length === 0) {
    return [{ label: 'No Recent Files', enabled: false }];
  }

  return [
    ...recentFiles.map((filePath): Electron.MenuItemConstructorOptions => ({
      label: filePath,
      click: () => {
        if (!fs.existsSync(filePath)) {
          removeRecentFile(filePath);
          rebuildAppMenu();
          dialog.showErrorBox('File Not Found', `The file "${filePath}" no longer exists on disk.`);
          return;
        }
        sendFileToRenderer(filePath);
      },
    })),
    { type: 'separator' },
    {
      label: 'Clear Recent',
      click: () => {
        clearRecentFiles();
        rebuildAppMenu();
      },
    },
  ];
}

function rebuildAppMenu(): void {
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
        { label: 'Open Folder…', click: () => mainWindow?.webContents.send('menu:openFolder') },
        { label: 'Open Recent', submenu: buildRecentFilesSubmenu() },
        { label: 'Save', accelerator: 'CmdOrCtrl+S', click: (_item, win) => (asBrowserWindow(win) ?? mainWindow)?.webContents.send('menu:save') },
        { label: 'Save As...', accelerator: 'CmdOrCtrl+Shift+S', click: (_item, win) => (asBrowserWindow(win) ?? mainWindow)?.webContents.send('menu:saveAs') },
        { label: 'Save All', accelerator: 'CmdOrCtrl+Shift+Alt+S', click: (_item, win) => (asBrowserWindow(win) ?? mainWindow)?.webContents.send('menu:saveAll') },
        { type: 'separator' },
        {
          label: 'Close Tab',
          accelerator: 'CmdOrCtrl+W',
          click: (_item, win) => {
            const targetWin = asBrowserWindow(win) ?? mainWindow;
            if (targetWin && popoutWindowIds.has(targetWin.id)) {
              // Pop-outs hold a single tab; closing goes through the window's
              // 'close' guard, which prompts about unsaved changes.
              targetWin.close();
            } else {
              targetWin?.webContents.send('menu:closeTab');
            }
          },
        },
        {
          label: 'Reopen Closed Tab',
          accelerator: 'CmdOrCtrl+Shift+T',
          click: (_item, win) => (asBrowserWindow(win) ?? mainWindow)?.webContents.send('menu:reopenClosedTab'),
        },
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
        { label: 'Find in All Open Tabs...', accelerator: 'CmdOrCtrl+Shift+F', click: () => mainWindow?.webContents.send('menu:findInTabs') },
        { label: 'Go to Line...', accelerator: GO_TO_LINE_ACCELERATOR, click: (_item, win) => (asBrowserWindow(win) ?? mainWindow)?.webContents.send('menu:goToLine') },
        { type: 'separator' },
        {
          label: 'Line & Text Operations',
          submenu: [
            { label: 'Sort Lines Ascending', click: (_item, win) => (asBrowserWindow(win) ?? mainWindow)?.webContents.send('menu:textOperation', 'sortLinesAsc') },
            { label: 'Sort Lines Descending', click: (_item, win) => (asBrowserWindow(win) ?? mainWindow)?.webContents.send('menu:textOperation', 'sortLinesDesc') },
            { label: 'Remove Duplicate Lines', click: (_item, win) => (asBrowserWindow(win) ?? mainWindow)?.webContents.send('menu:textOperation', 'removeDuplicateLines') },
            { label: 'Remove Empty Lines', click: (_item, win) => (asBrowserWindow(win) ?? mainWindow)?.webContents.send('menu:textOperation', 'removeEmptyLines') },
            { label: 'Trim Trailing Whitespace', click: (_item, win) => (asBrowserWindow(win) ?? mainWindow)?.webContents.send('menu:textOperation', 'trimTrailingWhitespace') },
            { type: 'separator' },
            { label: 'Convert to UPPERCASE', click: (_item, win) => (asBrowserWindow(win) ?? mainWindow)?.webContents.send('menu:textOperation', 'uppercase') },
            { label: 'Convert to lowercase', click: (_item, win) => (asBrowserWindow(win) ?? mainWindow)?.webContents.send('menu:textOperation', 'lowercase') },
          ]
        },
        { type: 'separator' },
        { label: 'Format Document', accelerator: 'Shift+Alt+F', click: (_item, win) => (asBrowserWindow(win) ?? mainWindow)?.webContents.send('menu:format') },
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          id: ALWAYS_ON_TOP_MENU_ID,
          label: 'Always on Top',
          type: 'checkbox',
          checked: isWindowAlwaysOnTop(appMenuAlwaysOnTopWindow(isMac, BrowserWindow.getFocusedWindow(), mainWindow)),
          click: (_item, win) => {
            const targetWin = asBrowserWindow(win) ?? mainWindow;
            if (!targetWin) return;
            toggleWindowAlwaysOnTop(targetWin);
            refreshAlwaysOnTopMenus(targetWin);
          },
        },
        { type: 'separator' },
        {
          label: 'Toggle File Explorer',
          accelerator: TOGGLE_EXPLORER_ACCELERATOR,
          click: () => mainWindow?.webContents.send('menu:toggleExplorer'),
        },
        {
          label: 'Toggle Terminal',
          accelerator: 'Ctrl+`',
          // Windows/Linux: the renderer handles Ctrl+` itself (so it works while
          // xterm has focus); the accelerator is shown for discoverability only.
          registerAccelerator: false,
          click: () => mainWindow?.webContents.send('menu:toggleTerminal'),
        },
        {
          label: 'New Terminal',
          accelerator: 'Ctrl+Shift+`',
          registerAccelerator: false,
          click: () => mainWindow?.webContents.send('menu:newTerminal'),
        },
        { label: 'Toggle Split View', click: () => mainWindow?.webContents.send('menu:toggleSplitView') },
        { label: 'Toggle Diff View', click: () => mainWindow?.webContents.send('menu:toggleDiffView') },
        {
          label: 'Open Markdown Preview',
          accelerator: MARKDOWN_PREVIEW_ACCELERATOR,
          click: (_item, win) => (asBrowserWindow(win) ?? mainWindow)?.webContents.send('menu:markdownPreview'),
        },
        { type: 'separator' },
        { label: 'Toggle Whitespace & EOL', click: (_item, win) => (asBrowserWindow(win) ?? mainWindow)?.webContents.send('menu:toggleWhitespace') },
        { type: 'separator' },
        { label: 'Zoom In',    accelerator: 'CmdOrCtrl+=', click: (_item, win) => adjustZoom((asBrowserWindow(win) ?? mainWindow)!.webContents, ZOOM_STEP) },
        { label: 'Zoom Out',   accelerator: 'CmdOrCtrl+-', click: (_item, win) => adjustZoom((asBrowserWindow(win) ?? mainWindow)!.webContents, -ZOOM_STEP) },
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
          label: 'Getting Started & Help…',
          click: (_item, win) => (asBrowserWindow(win) ?? mainWindow)?.webContents.send('menu:openHelp'),
        },
        {
          label: 'Keyboard Shortcuts…',
          accelerator: SHORTCUTS_REFERENCE_ACCELERATOR,
          click: (_item, win) => (asBrowserWindow(win) ?? mainWindow)?.webContents.send('menu:openShortcuts'),
        },
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
}

rebuildAppMenu();
