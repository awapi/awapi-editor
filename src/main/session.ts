import { app } from 'electron';
import { join } from 'path';
import * as fs from 'fs';

/** Line-ending kinds supported by the editor. */
type EolKind = 'LF' | 'CRLF';

export interface AppSettings {
  /** Custom directory where session folder is stored. null = use userData default. */
  sessionDir: string | null;
  /** Last selected theme ('dark' | 'light'). null/undefined = default dark. */
  theme?: string | null;
}

/** Lazily compute settings file path (not at module load time) */
function getSettingsFilePath(): string {
  return join(app.getPath('userData'), 'settings.json');
}

export function loadAppSettings(): AppSettings {
  try {
    const settingsFile = getSettingsFilePath();
    if (fs.existsSync(settingsFile)) {
      return JSON.parse(fs.readFileSync(settingsFile, 'utf-8')) as AppSettings;
    }
  } catch {
    // ignore corrupt settings
  }
  return { sessionDir: null };
}

export function saveAppSettings(settings: AppSettings): void {
  const settingsFile = getSettingsFilePath();
  fs.writeFileSync(settingsFile, JSON.stringify(settings), 'utf-8');
}

/**
 * Get the default backup folder location (user's Documents folder).
 * This is user-accessible on all platforms and follows OS conventions.
 */
export function getDefaultBackupDir(): string {
  return join(app.getPath('documents'), 'AwapiEditor', 'Backups');
}

export function getSessionDirPath(): string {
  const settings = loadAppSettings();
  const baseDir = settings.sessionDir || getDefaultBackupDir();
  return join(baseDir, 'session');
}

export function getSessionMetadataPath(): string {
  return join(getSessionDirPath(), 'session.json');
}

export function getUnsavedFilesDirPath(): string {
  return join(getSessionDirPath(), 'unsaved');
}

export function getUnsavedFilePath(tabId: string): string {
  return join(getUnsavedFilesDirPath(), `${tabId}.txt`);
}

/**
 * Ensure session folder structure exists: session/ and session/unsaved/
 */
export function ensureSessionFolders(): void {
  const sessionDir = getSessionDirPath();
  const unsavedDir = getUnsavedFilesDirPath();
  if (!fs.existsSync(sessionDir)) fs.mkdirSync(sessionDir, { recursive: true });
  if (!fs.existsSync(unsavedDir)) fs.mkdirSync(unsavedDir, { recursive: true });
}

/**
 * Migrate old session.json (single file) to new folder structure.
 * Called on startup if old session.json exists but new structure doesn't.
 */
export function migrateOldSessionFormat(): void {
  const settings = loadAppSettings();
  const baseDir = settings.sessionDir || app.getPath('userData');
  const oldSessionFile = join(baseDir, 'session.json');
  const newSessionDir = getSessionDirPath();

  // Only migrate if old file exists and new structure doesn't
  if (!fs.existsSync(oldSessionFile) || fs.existsSync(newSessionDir)) {
    return;
  }

  try {
    const oldData = JSON.parse(fs.readFileSync(oldSessionFile, 'utf-8')) as any;
    ensureSessionFolders();

    // Save unsaved file contents to individual files
    if (oldData.tabs && Array.isArray(oldData.tabs)) {
      for (const tab of oldData.tabs) {
        if (tab.content && (tab.isDirty || !tab.filePath)) {
          const unsavedPath = getUnsavedFilePath(tab.id);
          fs.writeFileSync(unsavedPath, tab.content, 'utf-8');
        }
      }
    }

    // Save metadata (without content)
    const metadata = {
      activeTabId: oldData.activeTabId || null,
      tabs: (oldData.tabs || []).map((tab: any) => ({
        id: tab.id,
        title: tab.title,
        filePath: tab.filePath,
        isDirty: tab.isDirty ?? false,
        language: tab.language,
        eol: tab.eol,
        themeOverride: tab.themeOverride,
      })),
    };
    fs.writeFileSync(getSessionMetadataPath(), JSON.stringify(metadata), 'utf-8');

    // Rename old file as backup
    const backupPath = oldSessionFile + '.backup';
    fs.renameSync(oldSessionFile, backupPath);
    console.log(`Migrated session from old format. Backup saved to: ${backupPath}`);
  } catch (err) {
    console.error('Failed to migrate old session format:', err);
  }
}

/**
 * Save the editor session (open tabs) to disk using folder-based structure.
 * Metadata stored in session/session.json, unsaved content in session/unsaved/{tabId}.txt
 */
export function saveSession(sessionData: any): boolean {
  try {
    ensureSessionFolders();

    // Get list of current tab IDs to clean up deleted ones
    const currentTabIds = new Set<string>();
    if (sessionData.tabs && Array.isArray(sessionData.tabs)) {
      for (const tab of sessionData.tabs) {
        currentTabIds.add(tab.id);
        // Save unsaved file content
        if (tab.content && (tab.isDirty || !tab.filePath)) {
          const unsavedPath = getUnsavedFilePath(tab.id);
          fs.writeFileSync(unsavedPath, tab.content, 'utf-8');
        }
      }
    }

    // Clean up unsaved files for deleted tabs
    const unsavedDir = getUnsavedFilesDirPath();
    if (fs.existsSync(unsavedDir)) {
      const files = fs.readdirSync(unsavedDir);
      for (const file of files) {
        const tabId = file.replace(/\.txt$/, '');
        if (!currentTabIds.has(tabId)) {
          fs.unlinkSync(join(unsavedDir, file));
        }
      }
    }

    // Save metadata (without content)
    const metadata = {
      activeTabId: sessionData.activeTabId || null,
      tabs: (sessionData.tabs || []).map((tab: any) => ({
        id: tab.id,
        title: tab.title,
        filePath: tab.filePath,
        isDirty: tab.isDirty ?? false,
        language: tab.language,
        eol: tab.eol,
        themeOverride: tab.themeOverride,
      })),
    };
    fs.writeFileSync(getSessionMetadataPath(), JSON.stringify(metadata), 'utf-8');
    return true;
  } catch (error) {
    console.error('Failed to save session:', error);
    return false;
  }
}

/**
 * Load the editor session from disk.
 * Reads metadata from session/session.json and content from session/unsaved/{tabId}.txt
 */
export function loadSession(): any {
  try {
    // Migrate old format if needed
    migrateOldSessionFormat();

    const metadataPath = getSessionMetadataPath();
    if (!fs.existsSync(metadataPath)) return null;

    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8')) as any;

    // Load unsaved file contents
    const tabs = (metadata.tabs || []).map((tab: any) => {
      let content = '';
      if (tab.isDirty || !tab.filePath) {
        const unsavedPath = getUnsavedFilePath(tab.id);
        if (fs.existsSync(unsavedPath)) {
          content = fs.readFileSync(unsavedPath, 'utf-8');
        }
      }
      return {
        id: tab.id,
        title: tab.title,
        filePath: tab.filePath,
        content,
        isDirty: tab.isDirty ?? false,
        language: tab.language,
        eol: tab.eol,
        themeOverride: tab.themeOverride,
      };
    });

    return {
      activeTabId: metadata.activeTabId || null,
      tabs,
    };
  } catch (error) {
    console.error('Failed to load session:', error);
    return null;
  }
}
