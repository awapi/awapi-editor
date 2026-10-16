import React, { useState, useEffect } from 'react';
import Editor, * as MonacoReact from '@monaco-editor/react';
import { SquareTerminal, X } from 'lucide-react';
import { useTheme } from './theme/ThemeContext';
import { useSessionPersistence, loadSession, SessionTab } from './useSessionPersistence';
import LanguageSelector from './LanguageSelector';
import LineEndingSelector from './LineEndingSelector';
import EncodingSelector from './EncodingSelector';
import SettingsModal from './SettingsModal';
import ShortcutsModal from './ShortcutsModal';
import HelpModal from './HelpModal';
import GoToLineModal from './GoToLineModal';
import FindInTabsPanel, { type TabSearchMatch } from './FindInTabsPanel';
import { applyTextOperation, type TextOperationKind } from './textOperations';
import type { EolKind } from './lineEndings';
import {
  type EncodingKind,
  DEFAULT_ENCODING,
  ENCODING_LABEL,
  countUnrepresentableCharacters,
  toEncodableContent,
} from '../../shared/encodings';
import { inferLanguageFromFilename } from './languages';
import { isCsvTab } from './csv';
import { isMarkdownTab } from './markdown';
import {
  isRasterImagePath,
  isSvgPath,
  getImageFormatLabel,
} from '../../shared/images';
import CsvGridEditor from './CsvGridEditor';
import ImageViewer, { type ImageViewerMetadata } from './ImageViewer';
import TerminalPanel from './TerminalPanel';
import { useTerminalSessions } from './useTerminalSessions';
import { isNewTerminalShortcut, isToggleTerminalShortcut } from './terminalKeys';
import FileExplorer, { getParentDirPath, normalizePathForCompare } from './FileExplorer';

/** True when this window was opened via "Pop out to new window" (single-file view). */
const isPopoutMode = typeof window !== 'undefined' && window.location.hash === '#popout';

type EditorViewMode = 'single' | 'split' | 'diff';
const DiffEditorComponent: React.ComponentType<any> | undefined = (MonacoReact as any).DiffEditor;

interface Tab {
  id: string;
  title: string;
  filePath: string | null;
  content: string;
  isDirty?: boolean;
  /** The content as it existed on disk at the last open or save. Used to
   *  auto-clear the dirty flag when the user undoes all edits back to the
   *  saved state. Undefined means the saved state is unknown (e.g. a dirty
   *  tab restored from a previous session), so the tab stays dirty. */
  savedContent?: string;
  /** User-selected Monaco language id. When undefined, the language is
   *  inferred from the filename extension (or "plaintext" if none). */
  language?: string;
  /** Line-ending sequence used when saving the tab's content. Defaults to LF. */
  eol?: EolKind;
  /** Character encoding used when saving the tab's content. Defaults to utf-8. */
  encoding?: EncodingKind;
  /** Per-tab editor theme override. When undefined, the global theme is used.
   *  Only affects the Monaco editor surface, not the surrounding chrome. */
  themeOverride?: 'light' | 'dark';
  /** For CSV/TSV tabs: whether to render the spreadsheet grid ('grid', default) or raw text ('text'). */
  csvViewMode?: 'grid' | 'text';
  /** For SVG tabs: whether to render the image viewer ('preview', default) or XML code editor ('code'). */
  imageViewMode?: 'preview' | 'code';
  /** Optional file size in bytes as reported when opened from disk. */
  byteSize?: number;
  /** Incremented when the file is updated on disk so image views reload fresh. */
  reloadToken?: number;
  /** True when opened via a single-click in the File Explorer (italic title; replaced by the next single-clicked file until pinned). */
  isPreview?: boolean;
}

const App: React.FC = () => {
  const { currentTheme, colors, importThemeFromMain } = useTheme();
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [secondaryTabId, setSecondaryTabId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<EditorViewMode>('single');
  const [alwaysOnTop, setAlwaysOnTop] = useState<boolean>(false);
  const [wordWrap, setWordWrap] = useState<boolean>(true);
  const [showWhitespace, setShowWhitespace] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [isGoToLineOpen, setIsGoToLineOpen] = useState(false);
  const [isFindInTabsOpen, setIsFindInTabsOpen] = useState(false);
  const [isExplorerOpen, setIsExplorerOpen] = useState(false);
  const [isMarkdownPreviewOpen, setIsMarkdownPreviewOpen] = useState(false);
  const [explorerFolderPath, setExplorerFolderPath] = useState<string | null>(null);
  const [favoriteFolders, setFavoriteFolders] = useState<string[]>([]);
  const [explorerRefreshToken, setExplorerRefreshToken] = useState(0);
  const explorerSettingsReadyRef = React.useRef(false);
  const explorerOverriddenByArgsRef = React.useRef(false);
  const [tabContextMenu, setTabContextMenu] = useState<{ tabId: string; x: number; y: number } | null>(null);
  const [closedTabs, setClosedTabs] = useState<Tab[]>([]);
  const [renameTarget, setRenameTarget] = useState<{ tabId: string; currentName: string } | null>(null);
  const [renameInput, setRenameInput] = useState('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const editorRef = React.useRef<any>(null);
  const editorDisposablesRef = React.useRef<Array<{ dispose: () => void }>>([]);
  const pendingJumpRef = React.useRef<{ lineNumber: number; column: number; matchLength?: number } | null>(null);
  const diffEditorDisposableRef = React.useRef<{ dispose: () => void } | null>(null);
  const diffModifiedTabIdRef = React.useRef<string | null>(null);
  const popoutCloseInFlightRef = React.useRef(false);
  /**
   * File paths with an open "changed on disk" prompt, mapped to the latest disk
   * content reported while it is open. Further change events only update the
   * entry, so one prompt is shown and the user's choice applies to the newest content.
   */
  const reloadPromptsInFlightRef = React.useRef(
    new Map<string, { filePath: string; content: string; eol: EolKind; encoding?: EncodingKind }>()
  );
  const [cursorPosition, setCursorPosition] = useState<{ line: number; column: number }>({ line: 1, column: 1 });
  const [selectionSummary, setSelectionSummary] = useState<{ lines: number; chars: number }>({ lines: 0, chars: 0 });
  const [imageMetadata, setImageMetadata] = useState<ImageViewerMetadata | null>(null);

  const updateSelectionSummary = React.useCallback((editor: any) => {
    const selection = editor?.getSelection?.();
    if (!selection || selection.isEmpty()) {
      setSelectionSummary({ lines: 0, chars: 0 });
      return;
    }

    const lines = Math.abs(selection.endLineNumber - selection.startLineNumber) + 1;

    let chars = 0;
    const model = editor?.getModel?.();
    if (model?.getValueLengthInRange) {
      chars = model.getValueLengthInRange(selection);
    } else if (model?.getValueInRange) {
      chars = model.getValueInRange(selection).length;
    }

    setSelectionSummary({ lines, chars });
  }, []);

  const resetStatusMetrics = React.useCallback(() => {
    setCursorPosition({ line: 1, column: 1 });
    setSelectionSummary({ lines: 0, chars: 0 });
  }, []);

  const addNewTab = () => {
    const id = `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newTab: Tab = {
      id,
      title: 'Untitled',
      filePath: null,
      content: '',
      isDirty: false,
      savedContent: '',
      eol: 'LF',
      encoding: DEFAULT_ENCODING,
    };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(id);
  };

  /**
   * Warns before saving content that the tab's encoding can't represent
   * (those characters would be written as `?`). Resolves true to proceed.
   */
  const confirmLossySave = async (w: any, tab: Tab): Promise<boolean> => {
    const encoding = tab.encoding ?? DEFAULT_ENCODING;
    const count = countUnrepresentableCharacters(tab.content, encoding);
    if (count === 0) return true;
    const label = ENCODING_LABEL[encoding];
    if (w.electronAPI?.confirmLossyEncoding) {
      return w.electronAPI.confirmLossyEncoding(tab.title, label, count);
    }
    return typeof window.confirm === 'function'
      ? window.confirm(`${count} character(s) in "${tab.title}" cannot be represented in ${label} and will be saved as "?". Save anyway?`)
      : false;
  };

  /** Saves `tab` (in its encoding/EOL). Resolves to the saved path, or null if cancelled. */
  const invokeSaveFileDialog = async (
    w: any,
    tab: Tab,
    filePathOverride: string | null = tab.filePath,
  ): Promise<string | null> => {
    if (!(await confirmLossySave(w, tab))) return null;
    const eol = tab.eol ?? 'LF';
    if (tab.encoding && tab.encoding !== DEFAULT_ENCODING) {
      return w.electronAPI.saveFileDialog(filePathOverride, tab.content, eol, tab.encoding);
    }
    return w.electronAPI.saveFileDialog(filePathOverride, tab.content, eol);
  };

  /** The tab's content as it reads back from disk after saving it in its encoding. */
  const contentAsSaved = (tab: Tab): string =>
    toEncodableContent(tab.content, tab.encoding ?? DEFAULT_ENCODING);

  /**
   * After a lossy save the buffer is replaced with what was written; otherwise
   * the current buffer is kept (it may contain edits made during the save dialog).
   */
  const savedContentPatch = (tab: Tab, savedContent: string): Partial<Tab> =>
    savedContent !== tab.content ? { content: savedContent } : {};

  const tabsRef = React.useRef(tabs);
  const activeTabIdRef = React.useRef(activeTabId);
  // Read by closeTabsByIds, which also runs from IPC listeners registered once on mount.
  const secondaryTabIdRef = React.useRef(secondaryTabId);
  const closedTabsRef = React.useRef<Tab[]>(closedTabs);
  // Prevents the async init from running twice in React StrictMode
  const initDoneRef = React.useRef(false);

  tabsRef.current = tabs;
  activeTabIdRef.current = activeTabId;
  secondaryTabIdRef.current = secondaryTabId;

  // Integrated terminal (main window only; pop-outs are single-file views).
  const terminals = useTerminalSessions(isPopoutMode ? null : undefined);
  const activeFilePath = tabs.find(t => t.id === activeTabId)?.filePath ?? null;
  const terminalCwdForNew = explorerFolderPath ?? activeFilePath;
  const terminalCwdForNewRef = React.useRef<string | null>(terminalCwdForNew);
  terminalCwdForNewRef.current = terminalCwdForNew;
  const toggleTerminalRef = React.useRef(() => {});
  const lastTerminalToggleRef = React.useRef(0);
  toggleTerminalRef.current = () => {
    if (!terminals.isAvailable) return;
    // On macOS one Ctrl+` press can reach both the menu accelerator and the
    // keydown listener; collapse them into a single toggle.
    const now = Date.now();
    if (now - lastTerminalToggleRef.current < 150) return;
    lastTerminalToggleRef.current = now;
    terminals.togglePanel(terminalCwdForNewRef.current);
  };
  const newTerminalRef = React.useRef(() => {});
  const lastNewTerminalRef = React.useRef(0);
  newTerminalRef.current = () => {
    if (!terminals.isAvailable) return;
    // Same double-trigger guard as the toggle (menu accelerator + keydown on macOS).
    const now = Date.now();
    if (now - lastNewTerminalRef.current < 150) return;
    lastNewTerminalRef.current = now;
    void terminals.createSession(terminalCwdForNewRef.current);
  };

  useEffect(() => {
    if (isPopoutMode) return;
    // Capture phase so Ctrl+` works even while Monaco or xterm has focus.
    const onKeyDown = (e: KeyboardEvent) => {
      const toggle = isToggleTerminalShortcut(e);
      if (!toggle && !isNewTerminalShortcut(e)) return;
      e.preventDefault();
      e.stopPropagation();
      if (toggle) toggleTerminalRef.current();
      else newTerminalRef.current();
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, []);

  useEffect(() => {
    tabsRef.current = tabs;
    activeTabIdRef.current = activeTabId;
  }, [tabs, activeTabId]);

  useEffect(() => {
    if (!activeTabId) {
      resetStatusMetrics();
    }
  }, [activeTabId, resetStatusMetrics]);

  useEffect(() => {
    return () => {
      editorDisposablesRef.current.forEach(d => d.dispose());
      editorDisposablesRef.current = [];
    };
  }, []);

  // Auto-save session whenever tabs or active tab changes (disabled in popout windows)
  useSessionPersistence(tabs, activeTabId, !isPopoutMode);

  // Open files and their encodings, serialized so the watch-sync effect only
  // re-runs when a path or encoding actually changes (not on every keystroke).
  const watchedFilesKey = JSON.stringify(
    tabs
      .filter(t => !!t.filePath)
      .map(t => ({ filePath: t.filePath as string, encoding: t.encoding ?? DEFAULT_ENCODING })),
  );

  // Runs in pop-outs too: main routes external changes to every window that has the file open.
  useEffect(() => {
    const w = window as any;
    w.electronAPI?.syncWatchedFiles?.(JSON.parse(watchedFilesKey));
  }, [watchedFilesKey]);

  // Pop-outs report unsaved changes so main can guard closing the window.
  const popoutIsDirty = isPopoutMode && tabs.some(t => t.isDirty);
  useEffect(() => {
    if (!isPopoutMode) return;
    (window as any).electronAPI?.setWindowDirty?.(popoutIsDirty);
  }, [popoutIsDirty]);

  // Persist File Explorer visibility, folder path, and favorite folders once initial settings have loaded
  useEffect(() => {
    if (isPopoutMode || !explorerSettingsReadyRef.current) return;
    const w = window as any;
    w.electronAPI?.saveSettings?.({
      explorerVisible: isExplorerOpen,
      explorerFolderPath,
      favoriteFolders,
    });
  }, [isExplorerOpen, explorerFolderPath, favoriteFolders]);

  const handleToggleFavoriteFolder = React.useCallback((dirPath: string) => {
    if (!dirPath) return;
    const normTarget = normalizePathForCompare(dirPath);
    setFavoriteFolders(prev => {
      const exists = prev.some(f => normalizePathForCompare(f) === normTarget);
      if (exists) {
        return prev.filter(f => normalizePathForCompare(f) !== normTarget);
      }
      return [...prev, dirPath];
    });
  }, []);

  const handlePickExplorerFolder = React.useCallback(async () => {
    const w = window as any;
    if (!w.electronAPI?.openExplorerFolderDialog) return;
    try {
      const selected = await w.electronAPI.openExplorerFolderDialog();
      if (selected) {
        setExplorerFolderPath(selected);
        setIsExplorerOpen(true);
      }
    } catch (err) {
      console.error('Failed to open folder in Explorer:', err);
    }
  }, []);

  const pinTab = React.useCallback((tabId: string) => {
    setTabs(prev =>
      prev.map(t => (t.id === tabId && t.isPreview ? { ...t, isPreview: false } : t)),
    );
  }, []);

  const handleOpenFileFromExplorer = React.useCallback(
    async (filePath: string, options?: { preview?: boolean }) => {
      const wantPreview = options?.preview ?? true;
      const normTarget = normalizePathForCompare(filePath);
      const existingTab = tabsRef.current.find(
        t => t.filePath && normalizePathForCompare(t.filePath) === normTarget,
      );
      if (existingTab) {
        if (!wantPreview && existingTab.isPreview) {
          pinTab(existingTab.id);
        }
        setActiveTabId(existingTab.id);
        return;
      }

      const w = window as any;
      if (!w.electronAPI?.readFile) return;
      try {
        const result = await w.electronAPI.readFile(filePath, { trackRecent: true });
        if (!result) return;
        const normResultPath = normalizePathForCompare(result.filePath);
        const postAwaitExisting = tabsRef.current.find(
          t => t.filePath && normalizePathForCompare(t.filePath) === normResultPath,
        );
        if (postAwaitExisting) {
          if (!wantPreview && postAwaitExisting.isPreview) {
            pinTab(postAwaitExisting.id);
          }
          setActiveTabId(postAwaitExisting.id);
          return;
        }
        const fileName = result.filePath.split(/[\\/]/).pop() || result.filePath;
        const existingPreview = wantPreview
          ? tabsRef.current.find(t => t.isPreview && !t.isDirty)
          : undefined;

        if (existingPreview) {
          const targetId = existingPreview.id;
          setTabs(prev =>
            prev.map(t =>
              t.id === targetId
                ? {
                    id: targetId,
                    title: fileName,
                    filePath: result.filePath,
                    content: result.content,
                    isDirty: false,
                    savedContent: result.content,
                    eol: result.eol ?? 'LF',
                    encoding: result.encoding ?? DEFAULT_ENCODING,
                    byteSize: result.byteSize,
                    isPreview: true,
                  }
                : t,
            ),
          );
          setActiveTabId(targetId);
          return;
        }

        const id = `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        setTabs(prev => [
          ...prev,
          {
            id,
            title: fileName,
            filePath: result.filePath,
            content: result.content,
            isDirty: false,
            savedContent: result.content,
            eol: result.eol ?? 'LF',
            encoding: result.encoding ?? DEFAULT_ENCODING,
            byteSize: result.byteSize,
            isPreview: wantPreview,
          },
        ]);
        setActiveTabId(id);
      } catch (err) {
        console.error('Failed to open file from Explorer:', err);
      }
    },
    [pinTab],
  );

  const handleExplorerItemRenamed = React.useCallback(
    (oldPath: string, newPath: string, newName: string, isDirectory: boolean) => {
      const normOld = normalizePathForCompare(oldPath);
      setTabs(prev =>
        prev.map(t => {
          if (!t.filePath) return t;
          const normTab = normalizePathForCompare(t.filePath);
          if (!isDirectory && normTab === normOld) {
            return { ...t, title: newName, filePath: newPath };
          }
          if (isDirectory && normTab.startsWith(normOld + '/')) {
            const sep = newPath.includes('\\') ? '\\' : '/';
            const suffix = normTab.slice(normOld.length).replace(/\//g, sep);
            return { ...t, filePath: newPath + suffix };
          }
          return t;
        }),
      );
      if (isDirectory) {
        setFavoriteFolders(prev =>
          prev.map(fav => {
            const normFav = normalizePathForCompare(fav);
            if (normFav === normOld) return newPath;
            if (normFav.startsWith(normOld + '/')) {
              const sep = newPath.includes('\\') ? '\\' : '/';
              const suffix = normFav.slice(normOld.length).replace(/\//g, sep);
              return newPath + suffix;
            }
            return fav;
          }),
        );
      }
    },
    [],
  );

  const handleExplorerItemDeleted = React.useCallback(
    (deletedPath: string, isDirectory: boolean) => {
      const normDeleted = normalizePathForCompare(deletedPath);
      setTabs(prev =>
        prev.map(t => {
          if (!t.filePath) return t;
          const normTab = normalizePathForCompare(t.filePath);
          if (
            (!isDirectory && normTab === normDeleted) ||
            (isDirectory && normTab.startsWith(normDeleted + '/'))
          ) {
            return { ...t, isDirty: true, savedContent: undefined };
          }
          return t;
        }),
      );
      if (isDirectory) {
        setFavoriteFolders(prev =>
          prev.filter(fav => {
            const normFav = normalizePathForCompare(fav);
            return normFav !== normDeleted && !normFav.startsWith(normDeleted + '/');
          }),
        );
      }
    },
    [],
  );

  useEffect(() => {
    // Session restore is a one-shot operation: guard it so React StrictMode's
    // double-invoke in development doesn't create duplicate tabs. Listener
    // wiring, on the other hand, MUST run on every effect mount (and clean up
    // on unmount) – otherwise StrictMode's mount → cleanup → mount sequence
    // leaves the app with no IPC or drag listeners attached in dev builds.
    if (!initDoneRef.current) {
      initDoneRef.current = true;

      if (isPopoutMode) {
        // Pull tab data from the main process now that the component is mounted.
        // Using invoke (pull) instead of a push event avoids the race condition
        // where the renderer wasn't ready to receive when the window first loaded.
        (async () => {
          const w = window as any;
          const tabData: Tab | null = await w.electronAPI?.getPopoutData?.();
          if (tabData) {
            setTabs([tabData]);
            setActiveTabId(tabData.id);
          }
        })();
      } else {
      // Restore previous session, or open a blank tab if none exists
      (async () => {
        const w = window as any;
        let sessionRestored = false;

        if (w.electronAPI) {
          try {
            const session = await loadSession();
            if (session && session.tabs.length > 0) {
              // Re-read clean saved files from disk so we always get fresh content
              const restoredTabs = await Promise.all(
                session.tabs.map(async (saved: SessionTab) => {
                  if (saved.filePath && !saved.isDirty) {
                    try {
                      const fileData = await w.electronAPI.readFile(saved.filePath);
                      if (fileData) {
                        return {
                          ...saved,
                          content: fileData.content,
                          eol: fileData.eol,
                          encoding: fileData.encoding ?? saved.encoding ?? DEFAULT_ENCODING,
                          savedContent: fileData.content,
                          byteSize: fileData.byteSize,
                        };
                      }
                    } catch {
                      // File no longer exists – fall through and use stored content
                    }
                  }
                  return {
                    ...saved,
                    eol: saved.eol ?? 'LF',
                    encoding: saved.encoding ?? DEFAULT_ENCODING,
                  };
                })
              );
              setTabs(restoredTabs);
              const validActiveId = session.activeTabId && restoredTabs.some((t: SessionTab) => t.id === session.activeTabId)
                ? session.activeTabId
                : restoredTabs[0]?.id ?? null;
              setActiveTabId(validActiveId);
              sessionRestored = true;
            }
          } catch (e) {
            console.error('Failed to restore session:', e);
          }
        }

        if (!sessionRestored) {
          addNewTab();
        }

        // Restore persisted File Explorer folder, visibility, and favorite folders from settings
        if (w.electronAPI?.loadSettings) {
          try {
            const settings = await w.electronAPI.loadSettings();
            if (settings) {
              if (Array.isArray(settings.favoriteFolders)) {
                setFavoriteFolders(
                  settings.favoriteFolders.filter((p: unknown): p is string => typeof p === 'string' && p.length > 0),
                );
              }
              if (!explorerOverriddenByArgsRef.current) {
                if (typeof settings.explorerFolderPath === 'string' && settings.explorerFolderPath) {
                  setExplorerFolderPath(settings.explorerFolderPath);
                }
                if (typeof settings.explorerVisible === 'boolean') {
                  setIsExplorerOpen(settings.explorerVisible);
                }
              }
            }
          } catch {
            // ignore settings load error
          }
        }
        explorerSettingsReadyRef.current = true;
      })();
      } // end else (non-popout)
    }

    // Listen to IPC
    const w = window as any;
    if (w.electronAPI) {
      w.electronAPI.onNewFile(() => {
        addNewTab();
      });

      w.electronAPI.onOpenFile(async () => {
        try {
          const openedFiles: Array<{ filePath: string; content: string; eol: EolKind; encoding?: EncodingKind; byteSize?: number }> | null =
            await w.electronAPI.openFileDialog();
          if (!Array.isArray(openedFiles) || openedFiles.length === 0) return;

          const newTabsToAdd: Tab[] = [];
          let lastTargetId: string | null = null;
          const now = Date.now();

          openedFiles.forEach((item, idx) => {
            if (!item?.filePath) return;
            const existingTab =
              tabsRef.current.find((t: Tab) => t.filePath === item.filePath) ??
              newTabsToAdd.find((t: Tab) => t.filePath === item.filePath);
            if (existingTab) {
              lastTargetId = existingTab.id;
              return;
            }

            const fileName = item.filePath.split(/[\\/]/).pop() || item.filePath;
            const id = openedFiles.length === 1 ? `${now}` : `tab-${now}-${idx}`;
            newTabsToAdd.push({
              id,
              title: fileName,
              filePath: item.filePath,
              content: item.content,
              isDirty: false,
              savedContent: item.content,
              eol: item.eol ?? 'LF',
              encoding: item.encoding ?? DEFAULT_ENCODING,
              byteSize: item.byteSize,
            });
            lastTargetId = id;
          });

          if (newTabsToAdd.length > 0) {
            setTabs(prev => [...prev, ...newTabsToAdd]);
          }
          if (lastTargetId) {
            setActiveTabId(lastTargetId);
          }
        } catch(e) { console.error('Error opening file', e); }
      });

      w.electronAPI.onSaveFile(async () => {
        const active = activeTabIdRef.current;
        if (!active) return;
        const currentTab = tabsRef.current.find((t: Tab) => t.id === active);
        if (!currentTab || isRasterImagePath(currentTab.filePath ?? currentTab.title)) return;

        try {
          const savedPath = await invokeSaveFileDialog(w, currentTab, currentTab.filePath);
          if (savedPath) {
            const fileName = savedPath.split(/[\\/]/).pop() || savedPath;
            const savedContent = contentAsSaved(currentTab);
            setTabs(prev => prev.map(t => 
              t.id === active 
                ? { ...t, ...savedContentPatch(currentTab, savedContent), filePath: savedPath, title: fileName, isDirty: false, savedContent }
                : t
            ));
            setExplorerRefreshToken(n => n + 1);
          }
        } catch(e) { console.error('Error saving file', e); }
      });

      w.electronAPI.onSaveAsFile(async () => {
        const active = activeTabIdRef.current;
        if (!active) return;
        const currentTab = tabsRef.current.find((t: Tab) => t.id === active);
        if (!currentTab || isRasterImagePath(currentTab.filePath ?? currentTab.title)) return;

        try {
          const savedPath = await invokeSaveFileDialog(w, currentTab, null);
          if (savedPath) {
            const fileName = savedPath.split(/[\\/]/).pop() || savedPath;
            const savedContent = contentAsSaved(currentTab);
            setTabs(prev => prev.map(t => 
              t.id === active 
                ? { ...t, ...savedContentPatch(currentTab, savedContent), filePath: savedPath, title: fileName, isDirty: false, savedContent }
                : t
            ));
            setExplorerRefreshToken(n => n + 1);
          }
        } catch(e) { console.error('Error saving file', e); }
      });

      w.electronAPI.onSaveAllFiles?.(async () => {
        const dirtyTabs = tabsRef.current.filter((t: Tab) => t.isDirty);
        for (const tab of dirtyTabs) {
          try {
            // eslint-disable-next-line no-await-in-loop
            const savedPath = await invokeSaveFileDialog(w, tab, tab.filePath);
            if (savedPath) {
              const fileName = savedPath.split(/[\\/]/).pop() || savedPath;
              const savedContent = contentAsSaved(tab);
              setTabs(prev => prev.map(t =>
                t.id === tab.id
                  ? { ...t, ...savedContentPatch(tab, savedContent), filePath: savedPath, title: fileName, isDirty: false, savedContent }
                  : t
              ));
              setExplorerRefreshToken(n => n + 1);
            }
          } catch (e) {
            console.error('Error saving file during Save All', e);
          }
        }
      });

      w.electronAPI.onExternalFileChange?.(async (data: {
        filePath: string;
        content: string;
        eol: EolKind;
        encoding?: EncodingKind;
      }) => {
        const target = tabsRef.current.find((t: Tab) => t.filePath === data.filePath);
        if (!target) return;
        if (isRasterImagePath(target.filePath ?? target.title)) {
          setTabs(prev =>
            prev.map(t =>
              t.id === target.id
                ? { ...t, reloadToken: (t.reloadToken ?? 0) + 1, isDirty: false }
                : t,
            ),
          );
          return;
        }
        const nextEol = data.eol ?? target.eol ?? 'LF';
        const nextEncoding = data.encoding ?? target.encoding ?? DEFAULT_ENCODING;
        if (
          target.content === data.content &&
          (target.eol ?? 'LF') === nextEol &&
          (target.encoding ?? DEFAULT_ENCODING) === nextEncoding &&
          !target.isDirty
        ) {
          return;
        }
        const reloadedFrom = (latest: typeof data) => ({
          content: latest.content,
          savedContent: latest.content,
          eol: latest.eol ?? target.eol ?? 'LF',
          encoding: latest.encoding ?? target.encoding ?? DEFAULT_ENCODING,
          reloadToken: (target.reloadToken ?? 0) + 1,
          isDirty: false,
        });
        if (!target.isDirty) {
          setTabs(prev => prev.map(t => (t.id === target.id ? { ...t, ...reloadedFrom(data) } : t)));
          return;
        }

        const promptsInFlight = reloadPromptsInFlightRef.current;
        if (promptsInFlight.has(data.filePath)) {
          promptsInFlight.set(data.filePath, data);
          return;
        }
        promptsInFlight.set(data.filePath, data);

        let decision: 'reload' | 'keep' = 'keep';
        try {
          if (w.electronAPI?.confirmReloadExternalChange) {
            decision = await w.electronAPI.confirmReloadExternalChange(target.title);
          } else if (typeof window.confirm === 'function') {
            decision = window.confirm(`"${target.title}" changed on disk. Reload and discard your edits?`)
              ? 'reload'
              : 'keep';
          }
        } catch (e) {
          console.error('Failed to confirm reload of externally changed file', e);
        }
        const latest = promptsInFlight.get(data.filePath) ?? data;
        promptsInFlight.delete(data.filePath);

        if (decision === 'reload') {
          setTabs(prev => prev.map(t => (t.id === target.id ? { ...t, ...reloadedFrom(latest) } : t)));
        } else {
          setTabs(prev => prev.map(t =>
            t.id === target.id
              ? { ...t, savedContent: latest.content, isDirty: t.content !== latest.content }
              : t
          ));
        }
      });

      w.electronAPI.onExternalFileDelete?.((data: { filePath: string }) => {
        setTabs(prev => prev.map(t =>
          t.filePath === data.filePath
            ? { ...t, isDirty: true, savedContent: undefined }
            : t
        ));
      });

      w.electronAPI.onCloseTab?.(() => {
        const active = activeTabIdRef.current;
        if (active) {
          closeTabsByIds([active]);
        }
      });

      w.electronAPI.onReopenClosedTab?.(() => {
        reopenClosedTab();
      });

      w.electronAPI.onFind(() => {
        if (editorRef.current) {
          editorRef.current.getAction('actions.find').run();
        }
      });

      w.electronAPI.onReplace(() => {
        if (editorRef.current) {
          editorRef.current.getAction('editor.action.startFindReplaceAction').run();
        }
      });

      w.electronAPI.onFindInTabs?.(() => {
        if (!isPopoutMode) {
          setIsFindInTabsOpen(true);
        }
      });

      w.electronAPI.onGoToLine?.(() => {
        if (activeTabIdRef.current) {
          setIsGoToLineOpen(true);
        }
      });

      w.electronAPI.onToggleWhitespace?.(() => {
        setShowWhitespace(prev => !prev);
      });

      w.electronAPI.onToggleExplorer?.(() => {
        if (!isPopoutMode) {
          setIsExplorerOpen(prev => !prev);
        }
      });

      w.electronAPI.onOpenFolder?.(() => {
        if (!isPopoutMode) {
          void handlePickExplorerFolder();
        }
      });

      w.electronAPI.onToggleTerminal?.(() => {
        toggleTerminalRef.current();
      });

      w.electronAPI.onNewTerminal?.(() => {
        newTerminalRef.current();
      });

      w.electronAPI.onToggleSplitView?.(() => {
        if (!isPopoutMode) {
          setViewMode(prev => (prev === 'split' ? 'single' : 'split'));
        }
      });

      w.electronAPI.onToggleDiffView?.(() => {
        if (!isPopoutMode) {
          setViewMode(prev => (prev === 'diff' ? 'single' : 'diff'));
        }
      });

      w.electronAPI.onAlwaysOnTopChanged?.((flag: boolean) => {
        setAlwaysOnTop(Boolean(flag));
      });

      if (w.electronAPI.getAlwaysOnTop) {
        Promise.resolve(w.electronAPI.getAlwaysOnTop())
          .then((flag: boolean) => setAlwaysOnTop(Boolean(flag)))
          .catch(() => {});
      }

      w.electronAPI.onTextOperation?.((operation: string) => {
        const activeId = activeTabIdRef.current;
        if (!activeId) return;
        const currentTab = tabsRef.current.find((t: Tab) => t.id === activeId);
        if (!currentTab) return;

        const selection = editorRef.current?.getSelection?.();
        const nextContent = applyTextOperation(
          currentTab.content,
          operation as TextOperationKind,
          selection && typeof selection.isEmpty === 'function' && !selection.isEmpty()
            ? {
                startLineNumber: selection.startLineNumber,
                startColumn: selection.startColumn,
                endLineNumber: selection.endLineNumber,
                endColumn: selection.endColumn,
              }
            : null,
        );
        if (nextContent === currentTab.content) return;
        setTabs(prev =>
          prev.map(t => {
            if (t.id !== activeId) return t;
            const isDirty = t.savedContent === undefined ? true : nextContent !== t.savedContent;
            return { ...t, content: nextContent, isDirty };
          }),
        );
      });

      w.electronAPI.onFormat(() => {
        if (editorRef.current) {
          editorRef.current.getAction('editor.action.formatDocument').run();
        }
      });

      w.electronAPI.onPrintPreview(() => {
        const active = activeTabIdRef.current;
        if (!active) return;
        const currentTab = tabsRef.current.find((t: Tab) => t.id === active);
        if (!currentTab) return;
        const language = currentTab.language ?? inferLanguageFromFilename(currentTab.filePath ?? currentTab.title);
        w.electronAPI.printPreview(currentTab.content, language, currentTab.title).catch((err: Error) =>
          console.error('Print preview failed:', err)
        );
      });

      w.electronAPI.onOpenSettings(() => {
        setIsSettingsOpen(true);
      });

      w.electronAPI.onOpenShortcuts?.(() => {
        setIsShortcutsOpen(true);
      });

      w.electronAPI.onOpenHelp?.(() => {
        setIsHelpOpen(true);
      });

      w.electronAPI.onShowAllCommands(() => {
        if (editorRef.current) {
          editorRef.current.trigger('keyboard', 'editor.action.quickCommand', {});
        }
      });

      w.electronAPI.onPopoutActiveTab(() => {
        const id = activeTabIdRef.current;
        if (id) handlePopout(id);
      });

      w.electronAPI.onMarkdownPreview?.(() => {
        const id = activeTabIdRef.current;
        if (id) openMarkdownPreviewForTab(id);
      });

      w.electronAPI.onMarkdownPreviewVisibilityChanged?.((isOpen: boolean) => {
        setIsMarkdownPreviewOpen(Boolean(isOpen));
      });

      if (w.electronAPI.getMarkdownPreviewOpen) {
        Promise.resolve(w.electronAPI.getMarkdownPreviewOpen())
          .then((flag: boolean) => setIsMarkdownPreviewOpen(Boolean(flag)))
          .catch(() => {});
      }

      const syncPreviewOpenOnFocus = () => {
        if (w.electronAPI?.getMarkdownPreviewOpen) {
          Promise.resolve(w.electronAPI.getMarkdownPreviewOpen())
            .then((flag: boolean) => setIsMarkdownPreviewOpen(Boolean(flag)))
            .catch(() => {});
        }
      };
      window.addEventListener('focus', syncPreviewOpenOnFocus);

      if (isPopoutMode) {
        // Main intercepted a close of this (dirty) pop-out window: run the same
        // Save / Don't Save / Cancel flow used when closing a tab.
        w.electronAPI.onWindowCloseRequested?.(async () => {
          if (popoutCloseInFlightRef.current) return;
          popoutCloseInFlightRef.current = true;
          try {
            const tab = tabsRef.current[0];
            const { proceed } = tab ? await confirmCloseTab(tab) : { proceed: true };
            if (proceed) await w.electronAPI.confirmWindowClose?.();
            else await w.electronAPI.cancelWindowClose?.();
          } finally {
            popoutCloseInFlightRef.current = false;
          }
        });

        // Popout: move this tab back to the main window
        w.electronAPI.onMoveToMain(() => {
          const tab = tabsRef.current[0];
          if (!tab) return;
          const content = editorRef.current?.getValue() ?? tab.content;
          w.electronAPI.moveToMain({ ...tab, content });
        });
      } else {
        // Main: receive a tab being moved back from a popout
        w.electronAPI.onAddTab((tabData: Tab) => {
          setTabs(prev => {
            const exists = prev.some(t => t.id === tabData.id);
            if (exists) return prev;
            return [...prev, tabData];
          });
          setActiveTabId(tabData.id);
        });
      }

      w.electronAPI.onOpenFileFromArgs(async (filePath: string) => {
        try {
          const existingTab = tabsRef.current.find((t: Tab) => t.filePath === filePath);
          if (existingTab) {
            setActiveTabId(existingTab.id);
            return;
          }
          const result = await w.electronAPI.readFile(filePath);
          if (result) {
            const fileName = filePath.split(/[\\/]/).pop() || filePath;
            const id = `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            setTabs(prev => [...prev, {
              id,
              title: fileName,
              filePath: result.filePath,
              content: result.content,
              isDirty: false,
              savedContent: result.content,
              eol: result.eol,
              encoding: result.encoding ?? DEFAULT_ENCODING,
              byteSize: result.byteSize,
            }]);
            setActiveTabId(id);
          }
        } catch (e) {
          console.error('Error opening file from args', e);
        }
      });

      w.electronAPI.onOpenFolderFromArgs?.((dirPath: string) => {
        if (isPopoutMode || typeof dirPath !== 'string' || !dirPath.trim()) return;
        explorerOverriddenByArgsRef.current = true;
        setExplorerFolderPath(dirPath);
        setIsExplorerOpen(true);
      });

      // Handle global drag and drop
      // Use capture:true so events are intercepted BEFORE Monaco can stopPropagation()
      const preventDefault = (e: DragEvent) => {
        if (e.dataTransfer && e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          e.stopPropagation();
        }
      };
      
      const handleGlobalDrop = async (e: DragEvent) => {
        if (!e.dataTransfer || !e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        e.stopPropagation();

        // Snapshot the dropped File objects synchronously before any `await`,
        // because the browser clears `e.dataTransfer.files` once the synchronous
        // drop event dispatch finishes.
        const droppedFiles = Array.from(e.dataTransfer.files);
        if (droppedFiles.length === 0) return;

        const newTabsToAdd: Tab[] = [];
        let lastTargetId: string | null = null;
        const now = Date.now();

        for (let i = 0; i < droppedFiles.length; i++) {
          const file = droppedFiles[i];
          try {
            const filePath = w.electronAPI.getPathForFile(file);
            if (!filePath) continue;

            const existingTab =
              tabsRef.current.find((t: Tab) => t.filePath === filePath) ??
              newTabsToAdd.find((t: Tab) => t.filePath === filePath);
            if (existingTab) {
              lastTargetId = existingTab.id;
              continue;
            }

            const result = await w.electronAPI.readFile(filePath, { trackRecent: true });
            if (result) {
              const postAwaitExisting =
                tabsRef.current.find((t: Tab) => t.filePath === result.filePath) ??
                newTabsToAdd.find((t: Tab) => t.filePath === result.filePath);
              if (postAwaitExisting) {
                lastTargetId = postAwaitExisting.id;
                continue;
              }

              const fileName = file.name || result.filePath.split(/[\\/]/).pop() || result.filePath;
              const id = `tab-${now}-${i}`;
              newTabsToAdd.push({
                id,
                title: fileName,
                filePath: result.filePath,
                content: result.content,
                isDirty: false,
                savedContent: result.content,
                eol: result.eol,
                encoding: result.encoding ?? DEFAULT_ENCODING,
                byteSize: result.byteSize,
              });
              lastTargetId = id;
            }
          } catch (err) {
            console.error('Failed to open dropped file', err);
          }
        }

        if (newTabsToAdd.length > 0) {
          setTabs(prev => {
            const existingPaths = new Set(prev.map(t => t.filePath).filter(Boolean));
            const uniqueNewTabs = newTabsToAdd.filter(t => !t.filePath || !existingPaths.has(t.filePath));
            return uniqueNewTabs.length > 0 ? [...prev, ...uniqueNewTabs] : prev;
          });
        }
        if (lastTargetId) {
          setActiveTabId(lastTargetId);
        }
      };

      window.addEventListener('dragover', preventDefault, true);
      window.addEventListener('dragenter', preventDefault, true);
      window.addEventListener('drop', handleGlobalDrop, true);

      // Cleanup on unmount
      return () => {
        w.electronAPI.removeListeners();
        window.removeEventListener('focus', syncPreviewOpenOnFocus);
        window.removeEventListener('dragover', preventDefault, true);
        window.removeEventListener('dragenter', preventDefault, true);
        window.removeEventListener('drop', handleGlobalDrop, true);
      };
    }
  }, []); // Run ONCE


  const handleEditorChange = (value: string | undefined) => {
    if(!activeTabId || typeof value === 'undefined') return;
    
    setTabs(prev => prev.map(t => {
      if (t.id !== activeTabId) return t;
      const isDirty = t.savedContent === undefined ? true : value !== t.savedContent;
      return { ...t, content: value, isDirty, isPreview: false };
    }));
  };

  /**
   * Prompts the user for unsaved-change resolution on a single tab.
   * Returns `{ proceed: true, snapshot }` if the tab is safe to close, or
   * `{ proceed: false }` if the user cancelled (or saving failed).
   */
  const confirmCloseTab = async (tab: Tab): Promise<{ proceed: boolean; snapshot?: Tab }> => {
    if (!tab.isDirty) return { proceed: true, snapshot: { ...tab } };

    const w = window as any;
    // Fallback to window.confirm if native dialog IPC is unavailable (e.g. tests).
    let choice: 'save' | 'dont-save' | 'cancel';
    if (w.electronAPI?.confirmUnsavedChanges) {
      choice = await w.electronAPI.confirmUnsavedChanges(tab.title);
    } else {
      const ok = typeof window.confirm === 'function'
        ? window.confirm(`Discard unsaved changes to ${tab.title}?`)
        : true;
      choice = ok ? 'dont-save' : 'cancel';
    }

    if (choice === 'cancel') return { proceed: false };

    if (choice === 'save') {
      if (!w.electronAPI?.saveFileDialog) return { proceed: false };
      try {
        const savedPath = await invokeSaveFileDialog(w, tab, tab.filePath);
        if (!savedPath) return { proceed: false }; // Save dialog cancelled – abort close
        const fileName = savedPath.split(/[\\/]/).pop() || savedPath;
        const savedContent = contentAsSaved(tab);
        return {
          proceed: true,
          snapshot: {
            ...tab,
            content: savedContent,
            filePath: savedPath,
            title: fileName,
            isDirty: false,
            savedContent,
          },
        };
      } catch (err) {
        console.error('Error saving file during close', err);
        return { proceed: false };
      }
    }

    // choice === 'dont-save'
    if (tab.filePath) {
      const cleanContent = tab.savedContent ?? tab.content;
      return {
        proceed: true,
        snapshot: {
          ...tab,
          content: cleanContent,
          savedContent: cleanContent,
          isDirty: false,
        },
      };
    }

    return { proceed: true, snapshot: { ...tab } };
  };

  const MAX_CLOSED_TABS = 20;

  const pushClosedTabs = (snapshots: Tab[]) => {
    if (snapshots.length === 0) return;
    const next = [...closedTabsRef.current, ...snapshots].slice(-MAX_CLOSED_TABS);
    closedTabsRef.current = next;
    setClosedTabs(next);
  };

  const reopenClosedTab = async () => {
    setTabContextMenu(null);
    const stack = [...closedTabsRef.current];
    const restored = stack.pop();
    if (!restored) return;

    closedTabsRef.current = stack;
    setClosedTabs(stack);

    if (restored.filePath) {
      const existing = tabsRef.current.find(t => t.filePath === restored.filePath);
      if (existing) {
        setActiveTabId(existing.id);
        return;
      }
    }

    let tabToRestore: Tab = { ...restored };
    const w = window as any;
    if (restored.filePath && !restored.isDirty && w.electronAPI?.readFile) {
      try {
        const fileData = await w.electronAPI.readFile(restored.filePath);
        if (fileData) {
          tabToRestore = {
            ...restored,
            content: fileData.content,
            savedContent: fileData.content,
            eol: fileData.eol ?? restored.eol ?? 'LF',
            encoding: fileData.encoding ?? restored.encoding ?? DEFAULT_ENCODING,
            isDirty: false,
          };
        }
      } catch {
        // Fall back to cached snapshot if reading from disk fails
      }
    }

    setTabs(prev => {
      if (prev.some(t => t.id === tabToRestore.id)) return prev;
      return [...prev, tabToRestore];
    });
    setActiveTabId(tabToRestore.id);
  };

  const closeTab = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await closeTabsByIds([id]);
  };

  /**
   * Closes a set of tabs, prompting the user about unsaved changes for each
   * one. Tabs the user chooses to keep (via Cancel) remain open. Used by the
   * close button, keyboard shortcut, and context-menu close actions.
   */
  const closeTabsByIds = async (idsToClose: string[]) => {
    const targets = tabsRef.current.filter(t => idsToClose.includes(t.id));
    const closedIds: string[] = [];
    const closedSnapshots: Tab[] = [];

    for (const tab of targets) {
      // eslint-disable-next-line no-await-in-loop
      const { proceed, snapshot } = await confirmCloseTab(tab);
      if (proceed) {
        closedIds.push(tab.id);
        if (snapshot) closedSnapshots.push(snapshot);
      }
    }

    if (closedIds.length === 0) return;

    pushClosedTabs(closedSnapshots);

    const remaining = tabsRef.current.filter(t => !closedIds.includes(t.id));
    setTabs(remaining);

    const currentActive = activeTabIdRef.current;
    if (currentActive && closedIds.includes(currentActive)) {
      setActiveTabId(remaining.length > 0 ? remaining[remaining.length - 1].id : null);
    }
    const currentSecondary = secondaryTabIdRef.current;
    if (remaining.length === 0) {
      setViewMode('single');
      setSecondaryTabId(null);
    } else if (currentSecondary && closedIds.includes(currentSecondary)) {
      const fallback = remaining.find(t => t.id !== currentActive) ?? remaining[0];
      setSecondaryTabId(fallback ? fallback.id : null);
    }
  };

  const handleCloseTabFromMenu = async (id: string) => {
    setTabContextMenu(null);
    await closeTabsByIds([id]);
  };

  const handleCloseOtherTabs = async (keepId: string) => {
    setTabContextMenu(null);
    const others = tabsRef.current.filter(t => t.id !== keepId).map(t => t.id);
    await closeTabsByIds(others);
  };

  const handleCloseAllTabs = async () => {
    setTabContextMenu(null);
    const all = tabsRef.current.map(t => t.id);
    await closeTabsByIds(all);
  };

  /**
   * Opens the inline rename modal for the given tab. The tab must already be
   * backed by a real file on disk — untitled / unsaved tabs cannot be renamed
   * (use Save As instead).
   */
  const handleRenameTab = (tabId: string) => {
    setTabContextMenu(null);
    const tab = tabsRef.current.find(t => t.id === tabId);
    if (!tab || !tab.filePath) return;
    setRenameTarget({ tabId, currentName: tab.title });
    setRenameInput(tab.title);
    setRenameError(null);
  };

  const copyTextToClipboard = async (text: string) => {
    const w = window as any;
    if (w.electronAPI?.copyToClipboard) {
      await w.electronAPI.copyToClipboard(text);
    } else if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    }
  };

  const handleCopyFullPath = async (tabId: string) => {
    setTabContextMenu(null);
    const tab = tabsRef.current.find(t => t.id === tabId);
    if (!tab?.filePath) return;
    await copyTextToClipboard(tab.filePath);
  };

  const handleCopyFilename = async (tabId: string) => {
    setTabContextMenu(null);
    const tab = tabsRef.current.find(t => t.id === tabId);
    if (!tab) return;
    await copyTextToClipboard(tab.title);
  };

  const handleRevealInFolder = async (tabId: string) => {
    setTabContextMenu(null);
    const tab = tabsRef.current.find(t => t.id === tabId);
    if (!tab?.filePath) return;
    const w = window as any;
    await w.electronAPI?.showItemInFolder?.(tab.filePath);
  };

  const handleOpenTabFolderInExplorer = (tabId: string) => {
    setTabContextMenu(null);
    const tab = tabsRef.current.find(t => t.id === tabId);
    if (!tab?.filePath) return;
    const dir = getParentDirPath(tab.filePath);
    if (!dir) return;
    setExplorerFolderPath(dir);
    setIsExplorerOpen(true);
  };

  // Terminals open in the file's folder, or the home folder for unsaved tabs.
  const handleOpenInExternalTerminal = async (tabId: string) => {
    setTabContextMenu(null);
    const tab = tabsRef.current.find(t => t.id === tabId);
    if (!tab) return;
    const w = window as any;
    await w.electronAPI?.openInTerminal?.(tab.filePath ?? null);
  };

  const handleOpenInIntegratedTerminal = async (tabId: string) => {
    setTabContextMenu(null);
    const tab = tabsRef.current.find(t => t.id === tabId);
    if (!tab) return;
    await terminals.createSession(tab.filePath ?? null);
  };

  const closeRenameModal = () => {
    setRenameTarget(null);
    setRenameInput('');
    setRenameError(null);
  };

  const submitRename = async () => {
    if (!renameTarget) return;
    const tab = tabsRef.current.find(t => t.id === renameTarget.tabId);
    if (!tab || !tab.filePath) {
      setRenameError('This tab is not backed by a file on disk.');
      return;
    }

    const newName = renameInput.trim();
    if (!newName) {
      setRenameError('Name cannot be empty.');
      return;
    }
    if (/[\\/]/.test(newName)) {
      setRenameError('Name cannot contain path separators.');
      return;
    }
    if (newName === tab.title) {
      closeRenameModal();
      return;
    }

    const w = window as any;
    if (!w.electronAPI?.renameFile) {
      setRenameError('Rename is not available in this environment.');
      return;
    }

    const result = await w.electronAPI.renameFile(tab.filePath, newName);
    if (!result?.ok) {
      setRenameError(result?.error ?? 'Failed to rename file.');
      return;
    }

    setTabs(prev =>
      prev.map(t =>
        t.id === renameTarget.tabId
          ? { ...t, title: newName, filePath: result.newPath }
          : t
      )
    );
    setExplorerRefreshToken(n => n + 1);
    closeRenameModal();
  };

  /**
   * Sets (or clears) a per-tab theme override. Pass null to clear the override
   * and let the tab follow the global theme again.
   */
  const handleSetTabTheme = (tabId: string, theme: 'light' | 'dark' | null) => {
    setTabContextMenu(null);
    setTabs(prev => prev.map(t =>
      t.id === tabId ? { ...t, themeOverride: theme ?? undefined } : t
    ));
  };

  const handlePopout = (tabId: string) => {
    const tab = tabsRef.current.find(t => t.id === tabId);
    if (!tab) return;
    const w = window as any;
    if (w.electronAPI?.popoutTab) {
      w.electronAPI.popoutTab(tab);
    }
    const newTabs = tabsRef.current.filter(t => t.id !== tabId);
    setTabs(newTabs);
    if (activeTabIdRef.current === tabId) {
      const idx = tabsRef.current.findIndex(t => t.id === tabId);
      const next = newTabs[idx] ?? newTabs[idx - 1] ?? newTabs[0] ?? null;
      setActiveTabId(next?.id ?? null);
    }
    setTabContextMenu(null);
  };

  const activeTab = tabs.find(t => t.id === activeTabId);
  const effectiveSecondaryTabId =
    secondaryTabId && tabs.some(t => t.id === secondaryTabId)
      ? secondaryTabId
      : (tabs.find(t => t.id !== activeTabId)?.id ?? activeTabId ?? null);
  const secondaryTab = tabs.find(t => t.id === effectiveSecondaryTabId);
  diffModifiedTabIdRef.current = secondaryTab?.id ?? null;

  const inferredLanguage = activeTab ? inferLanguageFromFilename(activeTab.filePath ?? activeTab.title) : 'plaintext';
  const effectiveLanguage = activeTab?.language ?? inferredLanguage;
  const isLanguageInferred = !activeTab?.language;
  const isActiveTabCsv = activeTab ? isCsvTab(activeTab.filePath ?? activeTab.title, effectiveLanguage) : false;
  const isActiveTabMarkdown = activeTab
    ? isMarkdownTab(activeTab.filePath ?? activeTab.title, effectiveLanguage)
    : false;
  const isActiveTabRasterImage = activeTab
    ? isRasterImagePath(activeTab.filePath ?? activeTab.title)
    : false;
  const isActiveTabSvg = activeTab
    ? isSvgPath(activeTab.filePath ?? activeTab.title)
    : false;
  const activeCsvViewMode = activeTab?.csvViewMode ?? 'grid';
  const activeImageViewMode = activeTab?.imageViewMode ?? 'preview';
  const isActiveTabImagePreview =
    isActiveTabRasterImage || (isActiveTabSvg && activeImageViewMode === 'preview');

  const isSecondaryTabRasterImage = secondaryTab
    ? isRasterImagePath(secondaryTab.filePath ?? secondaryTab.title)
    : false;
  const isSecondaryTabSvg = secondaryTab
    ? isSvgPath(secondaryTab.filePath ?? secondaryTab.title)
    : false;
  const isSecondaryTabImagePreview =
    isSecondaryTabRasterImage ||
    (isSecondaryTabSvg && (secondaryTab?.imageViewMode ?? 'preview') === 'preview');

  const currentThemeRef = React.useRef(currentTheme);
  currentThemeRef.current = currentTheme;

  const buildMarkdownPreviewPayload = React.useCallback((tab: Tab) => {
    const resolvedTheme: 'light' | 'dark' =
      tab.themeOverride ?? (currentThemeRef.current === 'light' ? 'light' : 'dark');
    return {
      title: tab.title,
      filePath: tab.filePath,
      content: tab.content,
      theme: resolvedTheme,
    };
  }, []);

  const openMarkdownPreviewForTab = React.useCallback(
    (tabId: string) => {
      const tab = tabsRef.current.find(t => t.id === tabId);
      if (!tab) return;
      if (tabId !== activeTabIdRef.current) {
        setActiveTabId(tabId);
      }
      setTabContextMenu(null);
      const w = window as any;
      Promise.resolve(w.electronAPI?.openMarkdownPreview?.(buildMarkdownPreviewPayload(tab)))
        .then((result: unknown) => {
          if (typeof result === 'boolean') {
            setIsMarkdownPreviewOpen(result);
          } else {
            setIsMarkdownPreviewOpen(prev => !prev);
          }
        })
        .catch(() => {});
    },
    [buildMarkdownPreviewPayload],
  );

  // Live-refresh the Markdown preview popup whenever the active Markdown tab's
  // content, title, filePath, or theme changes.
  useEffect(() => {
    if (!activeTab || !isActiveTabMarkdown) return;
    const w = window as any;
    if (!w.electronAPI?.updateMarkdownPreview) return;
    const resolvedTheme: 'light' | 'dark' =
      activeTab.themeOverride ?? (currentTheme === 'light' ? 'light' : 'dark');
    const timer = setTimeout(() => {
      void w.electronAPI?.updateMarkdownPreview?.({
        title: activeTab.title,
        filePath: activeTab.filePath,
        content: activeTab.content,
        theme: resolvedTheme,
      });
    }, 60);
    return () => clearTimeout(timer);
  }, [
    activeTab?.id,
    activeTab?.title,
    activeTab?.filePath,
    activeTab?.content,
    activeTab?.themeOverride,
    isActiveTabMarkdown,
    currentTheme,
  ]);

  const setActiveTabCsvViewMode = (mode: 'grid' | 'text') => {
    if (!activeTabId) return;
    setTabs(prev => prev.map(t => (t.id === activeTabId ? { ...t, csvViewMode: mode } : t)));
  };

  const setActiveTabImageViewMode = (mode: 'preview' | 'code') => {
    if (!activeTabId) return;
    setTabs(prev => prev.map(t => (t.id === activeTabId ? { ...t, imageViewMode: mode } : t)));
  };

  const secondaryInferredLanguage = secondaryTab
    ? inferLanguageFromFilename(secondaryTab.filePath ?? secondaryTab.title)
    : 'plaintext';
  const secondaryEffectiveLanguage = secondaryTab?.language ?? secondaryInferredLanguage;

  const handleLanguageChange = (languageId: string) => {
    if (!activeTabId) return;
    setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, language: languageId } : t));
  };

  const handleEolChange = (eol: EolKind) => {
    if (!activeTabId) return;
    setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, eol, isDirty: true } : t));
  };

  /**
   * "Save with Encoding": saves the active tab in `encoding` and only switches
   * the tab's encoding once the save succeeds. The buffer is left untouched
   * unless the user accepted the lossy-save warning, in which case it is
   * updated to match what was written (unrepresentable characters -> `?`).
   */
  const handleSaveWithEncoding = async (encoding: EncodingKind) => {
    const w = window as any;
    const tab = tabsRef.current.find(t => t.id === activeTabIdRef.current);
    if (!tab || !w.electronAPI?.saveFileDialog) return;
    const candidate: Tab = { ...tab, encoding };
    try {
      const savedPath = await invokeSaveFileDialog(w, candidate, tab.filePath);
      if (!savedPath) return;
      const fileName = savedPath.split(/[\\/]/).pop() || savedPath;
      const savedContent = contentAsSaved(candidate);
      setTabs(prev => prev.map(t =>
        t.id === tab.id
          ? { ...t, ...savedContentPatch(tab, savedContent), encoding, filePath: savedPath, title: fileName, isDirty: false, savedContent }
          : t
      ));
    } catch (e) {
      console.error('Error saving file with encoding', e);
    }
  };

  /**
   * "Reopen with Encoding": re-reads the active tab's file from disk, decoding
   * it as `encoding` (e.g. to fix a mis-detected file). Unsaved changes are
   * discarded after confirmation.
   */
  const handleReopenWithEncoding = async (encoding: EncodingKind) => {
    const w = window as any;
    const tab = tabsRef.current.find(t => t.id === activeTabIdRef.current);
    if (!tab?.filePath || !w.electronAPI?.readFile) return;

    if (tab.isDirty) {
      const label = ENCODING_LABEL[encoding];
      const ok = w.electronAPI.confirmReopenWithEncoding
        ? await w.electronAPI.confirmReopenWithEncoding(tab.title, label)
        : typeof window.confirm === 'function' &&
          window.confirm(`Reopen "${tab.title}" as ${label}? Unsaved changes will be lost.`);
      if (!ok) return;
    }

    try {
      const result = await w.electronAPI.readFile(tab.filePath, { encoding });
      if (!result) return;
      setTabs(prev => prev.map(t =>
        t.id === tab.id
          ? {
              ...t,
              content: result.content,
              savedContent: result.content,
              eol: result.eol ?? t.eol ?? 'LF',
              encoding: result.encoding ?? encoding,
              isDirty: false,
            }
          : t
      ));
    } catch (e) {
      console.error('Error reopening file with encoding', e);
    }
  };

  const toggleSplitView = () => {
    setViewMode(prev => {
      const next = prev !== 'single' ? 'single' : 'split';
      if (next === 'split' && (!secondaryTabId || !tabsRef.current.some(t => t.id === secondaryTabId))) {
        const candidate = tabsRef.current.find(t => t.id !== activeTabIdRef.current) ?? tabsRef.current[0];
        if (candidate) setSecondaryTabId(candidate.id);
      }
      return next;
    });
  };

  const handleOpenInSplitView = (tabId: string) => {
    setTabContextMenu(null);
    setSecondaryTabId(tabId);
    setViewMode('split');
  };

  const handleCompareWithActiveTab = (tabId: string) => {
    setTabContextMenu(null);
    setSecondaryTabId(tabId);
    setViewMode('diff');
  };

  const handleSwapSplitTabs = () => {
    if (!activeTabId || !effectiveSecondaryTabId) return;
    const prevActive = activeTabId;
    setActiveTabId(effectiveSecondaryTabId);
    setSecondaryTabId(prevActive);
  };

  const updateTabContent = (tabId: string, value: string) => {
    setTabs(prev =>
      prev.map(t => {
        if (t.id !== tabId || t.content === value) return t;
        const isDirty = t.savedContent === undefined ? true : value !== t.savedContent;
        return { ...t, content: value, isDirty, isPreview: false };
      }),
    );
  };

  const handleSecondaryEditorChange = (value: string | undefined) => {
    if (!effectiveSecondaryTabId || typeof value === 'undefined') return;
    updateTabContent(effectiveSecondaryTabId, value);
  };

  /**
   * Wires the diff editor's modified (right-hand) side back into tab state.
   * The listener is registered once per mount, so it reads the target tab id
   * from a ref that is refreshed on every render (the tab may be swapped).
   *
   * The original (left-hand) side shows the active tab, so it becomes the
   * primary editor: Find, Go to Line, text operations and the status bar
   * follow it instead of the unmounted single-view editor.
   */
  const handleDiffEditorMount = (diffEditor: any) => {
    diffEditorDisposableRef.current?.dispose();
    diffEditorDisposableRef.current = null;
    const originalEditor = diffEditor?.getOriginalEditor?.();
    if (originalEditor) handlePrimaryEditorMount(originalEditor);
    const modifiedEditor = diffEditor?.getModifiedEditor?.();
    if (!modifiedEditor?.onDidChangeModelContent) return;
    diffEditorDisposableRef.current = modifiedEditor.onDidChangeModelContent(() => {
      const targetId = diffModifiedTabIdRef.current;
      if (!targetId) return;
      updateTabContent(targetId, modifiedEditor.getValue());
    });
  };

  const applyJumpOnEditor = React.useCallback((
    editor: any,
    lineNumber: number,
    column = 1,
    matchLength?: number,
  ) => {
    if (!editor) return;
    if (matchLength && matchLength > 0 && typeof editor.setSelection === 'function') {
      editor.setSelection({
        startLineNumber: lineNumber,
        startColumn: column,
        endLineNumber: lineNumber,
        endColumn: column + matchLength,
      });
    } else if (typeof editor.setPosition === 'function') {
      editor.setPosition({ lineNumber, column });
    }
    editor.revealLineInCenter?.(lineNumber);
    editor.focus?.();
    setCursorPosition({ line: lineNumber, column });
  }, []);

  /**
   * Mount handler for the editor that shows the active tab (single view, the
   * split view's left pane, or the diff view's original side). Points
   * `editorRef` at it and keeps the status bar cursor/selection in sync.
   */
  const handlePrimaryEditorMount = (editor: any) => {
    editorDisposablesRef.current.forEach(d => d.dispose());
    editorDisposablesRef.current = [];
    editorRef.current = editor;

    const position = editor.getPosition?.();
    if (position) {
      setCursorPosition({ line: position.lineNumber, column: position.column });
    }
    updateSelectionSummary(editor);

    const cursorDisposable = editor.onDidChangeCursorPosition?.((event: any) => {
      setCursorPosition({ line: event.position.lineNumber, column: event.position.column });
    });
    if (cursorDisposable) {
      editorDisposablesRef.current.push(cursorDisposable);
    }

    const selectionDisposable = editor.onDidChangeCursorSelection?.(() => {
      updateSelectionSummary(editor);
    });
    if (selectionDisposable) {
      editorDisposablesRef.current.push(selectionDisposable);
    }

    if (pendingJumpRef.current) {
      const jump = pendingJumpRef.current;
      pendingJumpRef.current = null;
      applyJumpOnEditor(editor, jump.lineNumber, jump.column, jump.matchLength);
    }
  };

  const handleGoToLine = (lineNumber: number, column = 1) => {
    applyJumpOnEditor(editorRef.current, lineNumber, column);
  };

  const handleSelectFindMatch = (match: TabSearchMatch) => {
    const matchedTab = tabsRef.current.find(t => t.id === match.tabId);
    const needsSvgCodeSwitch =
      matchedTab &&
      isSvgPath(matchedTab.filePath ?? matchedTab.title) &&
      (matchedTab.imageViewMode ?? 'preview') === 'preview';
    if (needsSvgCodeSwitch) {
      setTabs(prev =>
        prev.map(t => (t.id === match.tabId ? { ...t, imageViewMode: 'code' } : t)),
      );
    }
    if (match.tabId !== activeTabId || needsSvgCodeSwitch) {
      pendingJumpRef.current = {
        lineNumber: match.lineNumber,
        column: match.column,
        matchLength: match.matchLength,
      };
      setActiveTabId(match.tabId);
      setTimeout(() => {
        if (pendingJumpRef.current && editorRef.current) {
          const jump = pendingJumpRef.current;
          pendingJumpRef.current = null;
          applyJumpOnEditor(editorRef.current, jump.lineNumber, jump.column, jump.matchLength);
        }
      }, 0);
    } else {
      applyJumpOnEditor(editorRef.current, match.lineNumber, match.column, match.matchLength);
    }
  };

  const handleReplaceAllInTabs = (
    updatedByTabId: Record<string, { content: string; replacements: number }>,
  ) => {
    setTabs(prev =>
      prev.map(t => {
        const update = updatedByTabId[t.id];
        if (!update) return t;
        const isDirty = t.savedContent === undefined ? true : update.content !== t.savedContent;
        return { ...t, content: update.content, isDirty };
      }),
    );
  };

  const activeTabContent = activeTab?.content;
  const activeTabLineCount = React.useMemo(() => {
    if (!activeTabContent) return 1;
    let lines = 1;
    for (let i = 0; i < activeTabContent.length; i++) {
      if (activeTabContent.charCodeAt(i) === 10) lines++;
    }
    return lines;
  }, [activeTabContent]);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.setData('text/plain', index.toString());
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    const dragIndexStr = e.dataTransfer.getData('text/plain');
    if (!dragIndexStr) return;
    const dragIndex = parseInt(dragIndexStr, 10);
    
    if (dragIndex === dropIndex) return;

    setTabs(prev => {
      const newTabs = [...prev];
      const [draggedTab] = newTabs.splice(dragIndex, 1);
      newTabs.splice(dropIndex, 0, draggedTab);
      return newTabs;
    });
  };

  // Horizontally scroll the tab strip with the mouse wheel so users without a
  // trackpad can reach overflowed tabs.
  const handleTabStripWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    // Only translate vertical wheel motion into horizontal scroll. If the user
    // is already scrolling horizontally (shift+wheel or a trackpad), let the
    // browser handle it natively.
    if (e.deltaY !== 0 && e.deltaX === 0) {
      e.currentTarget.scrollLeft += e.deltaY;
    }
  };

  // Keep the active tab visible when it changes or when tabs are added/removed.
  const tabStripRef = React.useRef<HTMLDivElement>(null);
  const activeTabElRef = React.useRef<HTMLDivElement | null>(null);

  /** Background colour for a tab/editor surface, honouring per-tab theme override. */
  const surfaceBgFor = (override: 'light' | 'dark' | undefined) =>
    override === 'light' ? '#fffffe'
    : override === 'dark' ? '#1e1e1e'
    : colors.tabActiveBackground;

  /** Slightly dimmed variant of `surfaceBgFor`, used for inactive themed tabs
   *  so the override is still visible but distinguishable from the active tab. */
  const surfaceBgInactiveFor = (override: 'light' | 'dark' | undefined) =>
    override === 'light' ? '#e8e8e8'
    : override === 'dark' ? '#2a2a2a'
    : colors.tabBackground;

  /** Foreground (text) colour to pair with `surfaceBgFor`. */
  const surfaceFgFor = (override: 'light' | 'dark' | undefined) =>
    override === 'light' ? '#333333'
    : override === 'dark' ? '#d4d4d4'
    : colors.foreground;

  /** Colour used for tabs with unsaved changes. Adapts to light/dark theme so
   *  the indicator is legible in both modes. */
  const dirtyColor = currentTheme === 'light' ? '#b45309' : '#e2c08d';

  useEffect(() => {
    // jsdom (used in tests) doesn't implement scrollIntoView; guard it so the
    // renderer doesn't crash during unit tests.
    const el = activeTabElRef.current;
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ inline: 'nearest', block: 'nearest' });
    }
  }, [activeTabId, tabs.length]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: colors.background, color: colors.foreground }}>
      {/* Workspace Row: File Explorer Sidebar + Editor Column (Tab Bar + Editor Area) */}
      <div
        data-testid="workspace-row"
        style={{ display: 'flex', flexGrow: 1, minHeight: 0, overflow: 'hidden' }}
      >
      {!isPopoutMode && (
        <FileExplorer
          isOpen={isExplorerOpen}
          rootFolderPath={explorerFolderPath}
          tabs={tabs}
          activeTabId={activeTabId}
          onSelectTab={setActiveTabId}
          onPinTab={pinTab}
          onCloseTab={closeTab}
          onOpenFileFromTree={handleOpenFileFromExplorer}
          onOpenInIntegratedTerminal={dirPath => { void terminals.createSession(dirPath); }}
          onPickFolder={() => { void handlePickExplorerFolder(); }}
          onCloseExplorer={() => setIsExplorerOpen(false)}
          onChangeRootFolder={setExplorerFolderPath}
          favoriteFolders={favoriteFolders}
          onToggleFavoriteFolder={handleToggleFavoriteFolder}
          onItemRenamed={handleExplorerItemRenamed}
          onItemDeleted={handleExplorerItemDeleted}
          refreshToken={explorerRefreshToken}
        />
      )}

      {/* Editor Column: Tab Bar + Toolbars + Editor Area */}
      <div
        data-testid="editor-column"
        style={{ display: 'flex', flexDirection: 'column', flexGrow: 1, minWidth: 0, minHeight: 0, overflow: 'hidden' }}
      >
      {/* Tab Bar: hidden in popout (single-file) mode */}
      {!isPopoutMode && (
      <div
        data-testid="tab-bar"
        style={{ display: 'flex', backgroundColor: colors.tabBackground, flexShrink: 0 }}
      >
        {/* Scrollable tab strip. minWidth:0 is required so this flex child can
            shrink below its content width instead of pushing siblings off-screen. */}
        <div
          ref={tabStripRef}
          onWheel={handleTabStripWheel}
          style={{ display: 'flex', flex: '1 1 auto', minWidth: 0, overflowX: 'auto' }}
        >
          {tabs.map((tab, index) => (
            <div
              key={tab.id}
              ref={el => {
                if (tab.id === activeTabId) activeTabElRef.current = el;
              }}
              draggable
              title={tab.filePath ?? undefined}
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, index)}
              onClick={() => setActiveTabId(tab.id)}
              onDoubleClick={() => pinTab(tab.id)}
              onAuxClick={(e) => { if (e.button === 1) closeTab(e, tab.id); }}
              onContextMenu={(e) => { e.preventDefault(); setTabContextMenu({ tabId: tab.id, x: e.clientX, y: e.clientY }); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '8px 16px',
                backgroundColor: activeTabId === tab.id ? surfaceBgFor(tab.themeOverride) : surfaceBgInactiveFor(tab.themeOverride),
                borderTop: activeTabId === tab.id ? `2px solid ${colors.tabBorder}` : '2px solid transparent',
                cursor: 'pointer',
                borderRight: `1px solid ${colors.tabHover}`,
                minWidth: '120px',
                flexShrink: 0,
                userSelect: 'none',
                color: tab.isDirty ? dirtyColor : surfaceFgFor(tab.themeOverride)
              }}
            >
              <span
                data-testid={`tab-title-${tab.id}`}
                style={{
                  flexGrow: 1,
                  whiteSpace: 'nowrap',
                  textOverflow: 'ellipsis',
                  overflow: 'hidden',
                  fontSize: '13px',
                  fontStyle: tab.isPreview ? 'italic' : 'normal',
                }}
              >
                {tab.title} {tab.isDirty && '*'}
              </span>
              <span
                title="Close Tab (Ctrl+W)"
                data-testid={`close-tab-btn-${tab.id}`}
                style={{ display: 'inline-flex', alignItems: 'center' }}
              >
                <X
                  size={14}
                  aria-label={`Close ${tab.title}`}
                  style={{ marginLeft: 8, opacity: 0.6, flexShrink: 0 }}
                  onClick={(e) => closeTab(e, tab.id)}
                  onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                  onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.6')}
                />
              </span>
            </div>
          ))}
          {/* Add Tab Button */}
          <div
            data-testid="add-tab-button"
            title="New Tab (Ctrl+N)"
            aria-label="New Tab"
            onClick={addNewTab}
            style={{ padding: '8px', cursor: 'pointer', color: colors.foreground, display: 'flex', alignItems: 'center', flexShrink: 0 }}
          >
            +
          </div>
          {/* Empty space – double-click to open a new tab */}
          <div
            data-testid="tab-bar-spacer"
            title="Double-click to create a new tab"
            style={{ flexGrow: 1, minWidth: '24px' }}
            onDoubleClick={addNewTab}
          />
        </div>
        {/* Action group: pinned to the right, never scrolls with tabs. */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', paddingRight: '8px', flexShrink: 0 }}>
          <button
            data-testid="explorer-toggle"
            aria-label={isExplorerOpen ? 'Hide File Explorer' : 'Show File Explorer'}
            aria-pressed={isExplorerOpen}
            onClick={() => setIsExplorerOpen(prev => !prev)}
            title={isExplorerOpen ? 'Hide File Explorer (Cmd/Ctrl+B)' : 'Show File Explorer (Cmd/Ctrl+B)'}
            style={{
              width: '28px',
              height: '24px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              cursor: 'pointer',
              borderRadius: '4px',
              border: `1px solid ${colors.tabHover}`,
              backgroundColor: isExplorerOpen ? colors.tabActiveBackground : colors.tabBackground,
              color: colors.foreground,
              opacity: isExplorerOpen ? 1 : 0.55,
            }}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              focusable="false"
            >
              <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
              <line x1="6" y1="2.5" x2="6" y2="13.5" />
            </svg>
          </button>
          <button
            data-testid="split-view-toggle"
            aria-label={viewMode !== 'single' ? 'Close Split View' : 'Side-by-Side Split View'}
            aria-pressed={viewMode !== 'single'}
            onClick={toggleSplitView}
            title={viewMode !== 'single' ? 'Close Split View' : 'Toggle Side-by-Side Split View'}
            style={{
              width: '28px',
              height: '24px',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 0,
              cursor: 'pointer',
              borderRadius: '4px',
              border: `1px solid ${colors.tabHover}`,
              backgroundColor: viewMode !== 'single' ? colors.tabActiveBackground : colors.tabBackground,
              color: colors.foreground,
              opacity: viewMode !== 'single' ? 1 : 0.55,
            }}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.3"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              focusable="false"
            >
              <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
              <line x1="8" y1="2.5" x2="8" y2="13.5" />
            </svg>
          </button>
          {activeTab && isActiveTabMarkdown && (
            <button
              data-testid="markdown-preview-button"
              aria-label={isMarkdownPreviewOpen ? 'Close Markdown Preview' : 'Open Markdown Preview'}
              aria-pressed={isMarkdownPreviewOpen}
              onClick={() => openMarkdownPreviewForTab(activeTab.id)}
              title={
                isMarkdownPreviewOpen
                  ? 'Close Markdown Preview Popup (Cmd/Ctrl+Shift+V)'
                  : 'Open Markdown Preview in Popup Window (Cmd/Ctrl+Shift+V)'
              }
              style={{
                height: '24px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                padding: '0 8px',
                cursor: 'pointer',
                borderRadius: '4px',
                border: `1px solid ${isMarkdownPreviewOpen ? colors.tabBorder : colors.tabHover}`,
                backgroundColor: isMarkdownPreviewOpen ? colors.tabActiveBackground : colors.tabBackground,
                color: colors.foreground,
                opacity: isMarkdownPreviewOpen ? 1 : 0.55,
                fontSize: '11px',
                fontWeight: 600,
              }}
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                focusable="false"
              >
                <path d="M1.5 8s2.4-4.5 6.5-4.5S14.5 8 14.5 8s-2.4 4.5-6.5 4.5S1.5 8 1.5 8z" />
                <circle cx="8" cy="8" r="2" />
              </svg>
              <span>Preview</span>
            </button>
          )}
        </div>
      </div>
      )} {/* end !isPopoutMode tab bar */}

      {/* Popout title strip — shown instead of the tab bar in single-file windows */}
      {isPopoutMode && activeTab && (
        <div
          data-testid="popout-title-bar"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '6px 14px',
            backgroundColor: colors.tabBackground,
            borderBottom: `1px solid ${colors.tabHover}`,
            flexShrink: 0,
            fontSize: '13px',
            color: activeTab.isDirty ? dirtyColor : colors.foreground,
            userSelect: 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', minWidth: 0, overflow: 'hidden' }}>
            <span>{activeTab.title}{activeTab.isDirty && ' *'}</span>
            {activeTab.filePath && (
              <span
                style={{ marginLeft: 10, opacity: 0.5, fontSize: '11px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                title={activeTab.filePath}
              >
                {activeTab.filePath}
              </span>
            )}
          </div>
          {isActiveTabMarkdown && (
            <button
              data-testid="markdown-preview-button"
              aria-label={isMarkdownPreviewOpen ? 'Close Markdown Preview' : 'Open Markdown Preview'}
              aria-pressed={isMarkdownPreviewOpen}
              onClick={() => openMarkdownPreviewForTab(activeTab.id)}
              title={
                isMarkdownPreviewOpen
                  ? 'Close Markdown Preview Popup (Cmd/Ctrl+Shift+V)'
                  : 'Open Markdown Preview in Popup Window (Cmd/Ctrl+Shift+V)'
              }
              style={{
                height: '22px',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '0 8px',
                cursor: 'pointer',
                borderRadius: '4px',
                border: `1px solid ${isMarkdownPreviewOpen ? colors.tabBorder : colors.tabHover}`,
                backgroundColor: isMarkdownPreviewOpen ? colors.tabActiveBackground : colors.tabBackground,
                color: colors.foreground,
                opacity: isMarkdownPreviewOpen ? 1 : 0.55,
                fontSize: '11px',
                fontWeight: 600,
                flexShrink: 0,
              }}
            >
              Preview
            </button>
          )}
        </div>
      )}

      {/* Split / Diff control strip */}
      {!isPopoutMode && activeTab && viewMode !== 'single' && (
        <div
          data-testid="split-diff-toolbar"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '8px',
            padding: '4px 10px',
            backgroundColor: colors.tabBackground,
            borderTop: `1px solid ${colors.tabHover}`,
            borderBottom: `1px solid ${colors.tabHover}`,
            fontSize: '12px',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
            <span style={{ fontWeight: 600 }}>
              {viewMode === 'diff' ? 'Diff View:' : 'Split View:'}
            </span>
            <span data-testid="split-primary-tab-label" style={{ opacity: 0.9 }}>
              {activeTab.title}
            </span>
            {viewMode === 'diff' && (
              <span
                data-testid="diff-readonly-hint"
                title="In Diff View the left (original) side is read-only; edit the right side or use Split View."
                style={{ opacity: 0.6, fontSize: '11px' }}
              >
                (read-only)
              </span>
            )}
            <button
              data-testid="swap-split-tabs-button"
              onClick={handleSwapSplitTabs}
              title="Swap Left and Right Tabs"
              style={{
                padding: '1px 6px',
                fontSize: '11px',
                cursor: 'pointer',
                borderRadius: '3px',
                border: `1px solid ${colors.tabHover}`,
                backgroundColor: colors.background,
                color: colors.foreground,
              }}
            >
              ⇄
            </button>
            <label htmlFor="secondary-tab-select" style={{ opacity: 0.75 }}>
              {viewMode === 'diff' ? 'Compare with:' : 'Right pane:'}
            </label>
            <select
              id="secondary-tab-select"
              data-testid="secondary-tab-select"
              value={effectiveSecondaryTabId ?? ''}
              onChange={e => setSecondaryTabId(e.target.value)}
              style={{
                padding: '2px 6px',
                fontSize: '12px',
                borderRadius: '3px',
                border: `1px solid ${colors.tabHover}`,
                backgroundColor: colors.background,
                color: colors.foreground,
              }}
            >
              {tabs.map(t => (
                <option key={t.id} value={t.id}>
                  {t.title}{t.isDirty ? ' *' : ''}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              data-testid="split-mode-button"
              aria-pressed={viewMode === 'split'}
              onClick={() => setViewMode('split')}
              style={{
                padding: '2px 8px',
                fontSize: '11px',
                cursor: 'pointer',
                borderRadius: '3px',
                border: `1px solid ${colors.tabHover}`,
                backgroundColor: viewMode === 'split' ? colors.tabActiveBackground : 'transparent',
                color: colors.foreground,
              }}
            >
              Split
            </button>
            <button
              data-testid="diff-mode-button"
              aria-pressed={viewMode === 'diff'}
              onClick={() => setViewMode('diff')}
              style={{
                padding: '2px 8px',
                fontSize: '11px',
                cursor: 'pointer',
                borderRadius: '3px',
                border: `1px solid ${colors.tabHover}`,
                backgroundColor: viewMode === 'diff' ? colors.tabActiveBackground : 'transparent',
                color: colors.foreground,
              }}
            >
              Diff
            </button>
            <button
              data-testid="close-split-diff-button"
              onClick={() => setViewMode('single')}
              title="Return to Single Editor View"
              style={{
                padding: '2px 8px',
                fontSize: '11px',
                cursor: 'pointer',
                borderRadius: '3px',
                border: `1px solid ${colors.tabHover}`,
                backgroundColor: 'transparent',
                color: colors.foreground,
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}

      {/* Editor Area */}
      <div style={{ flexGrow: 1, minWidth: 0, minHeight: 0, overflow: 'hidden', backgroundColor: activeTab ? surfaceBgFor(activeTab.themeOverride) : undefined }}>
        {activeTab ? (
          !isPopoutMode && viewMode === 'split' && secondaryTab ? (
            <div
              data-testid="split-view-container"
              style={{ display: 'flex', width: '100%', height: '100%' }}
            >
              <div
                data-testid="split-left-pane"
                style={{
                  flex: 1,
                  minWidth: 0,
                  height: '100%',
                  borderRight: `1px solid ${colors.tabHover}`,
                }}
              >
                {isActiveTabImagePreview ? (
                  <ImageViewer
                    filePath={activeTab.filePath}
                    title={activeTab.title}
                    svgContent={isActiveTabSvg ? activeTab.content : undefined}
                    byteSize={activeTab.byteSize}
                    reloadToken={activeTab.reloadToken}
                    onSwitchToCodeView={isActiveTabSvg ? () => setActiveTabImageViewMode('code') : undefined}
                    onMetadataChange={setImageMetadata}
                    colors={{
                      ...colors,
                      background: surfaceBgFor(activeTab.themeOverride),
                      foreground: surfaceFgFor(activeTab.themeOverride),
                    }}
                    themeMode={(activeTab.themeOverride ?? (currentTheme === 'light' ? 'light' : 'dark'))}
                  />
                ) : (
                  <Editor
                    height="100%"
                    theme={(activeTab.themeOverride ?? (currentTheme === 'light' ? 'light' : 'dark')) === 'light' ? 'light' : 'vs-dark'}
                    path={activeTab.title}
                    language={effectiveLanguage}
                    value={activeTab.content}
                    onChange={handleEditorChange}
                    onMount={handlePrimaryEditorMount}
                    options={{
                      minimap: { enabled: false },
                      fontSize: 14,
                      wordWrap: wordWrap ? 'on' : 'off',
                      renderWhitespace: showWhitespace ? 'all' : 'none',
                      renderControlCharacters: showWhitespace,
                      formatOnType: true,
                      formatOnPaste: true,
                      padding: { top: 6 },
                      lineNumbersMinChars: 5,
                    }}
                  />
                )}
              </div>
              <div
                data-testid="split-right-pane"
                style={{ flex: 1, minWidth: 0, height: '100%' }}
              >
                {isSecondaryTabImagePreview ? (
                  <ImageViewer
                    filePath={secondaryTab.filePath}
                    title={secondaryTab.title}
                    svgContent={isSecondaryTabSvg ? secondaryTab.content : undefined}
                    byteSize={secondaryTab.byteSize}
                    reloadToken={secondaryTab.reloadToken}
                    onSwitchToCodeView={
                      isSecondaryTabSvg
                        ? () =>
                            setTabs(prev =>
                              prev.map(t =>
                                t.id === secondaryTab.id ? { ...t, imageViewMode: 'code' } : t,
                              ),
                            )
                        : undefined
                    }
                    colors={{
                      ...colors,
                      background: surfaceBgFor(secondaryTab.themeOverride),
                      foreground: surfaceFgFor(secondaryTab.themeOverride),
                    }}
                    themeMode={(secondaryTab.themeOverride ?? (currentTheme === 'light' ? 'light' : 'dark'))}
                  />
                ) : (
                  <Editor
                    height="100%"
                    theme={(secondaryTab.themeOverride ?? (currentTheme === 'light' ? 'light' : 'dark')) === 'light' ? 'light' : 'vs-dark'}
                    path={`${secondaryTab.title}-split`}
                    language={secondaryEffectiveLanguage}
                    value={secondaryTab.content}
                    onChange={handleSecondaryEditorChange}
                    options={{
                      minimap: { enabled: false },
                      fontSize: 14,
                      wordWrap: wordWrap ? 'on' : 'off',
                      renderWhitespace: showWhitespace ? 'all' : 'none',
                      renderControlCharacters: showWhitespace,
                      formatOnType: true,
                      formatOnPaste: true,
                      padding: { top: 6 },
                      lineNumbersMinChars: 5,
                    }}
                  />
                )}
              </div>
            </div>
          ) : !isPopoutMode && viewMode === 'diff' && secondaryTab ? (
            <div
              data-testid="diff-view-container"
              style={{ width: '100%', height: '100%' }}
            >
              {DiffEditorComponent ? (
                <DiffEditorComponent
                  height="100%"
                  theme={(activeTab.themeOverride ?? (currentTheme === 'light' ? 'light' : 'dark')) === 'light' ? 'light' : 'vs-dark'}
                  original={activeTab.content}
                  modified={secondaryTab.content}
                  originalLanguage={effectiveLanguage}
                  modifiedLanguage={secondaryEffectiveLanguage}
                  onMount={handleDiffEditorMount}
                  options={{
                    renderSideBySide: true,
                    // Only the right-hand (modified) side is editable; its edits are
                    // synced back to the compared tab in handleDiffEditorMount.
                    readOnly: false,
                    originalEditable: false,
                    fontSize: 14,
                    wordWrap: wordWrap ? 'on' : 'off',
                    renderWhitespace: showWhitespace ? 'all' : 'none',
                    minimap: { enabled: false },
                  }}
                />
              ) : null}
            </div>
          ) : isActiveTabImagePreview ? (
            <ImageViewer
              filePath={activeTab.filePath}
              title={activeTab.title}
              svgContent={isActiveTabSvg ? activeTab.content : undefined}
              byteSize={activeTab.byteSize}
              reloadToken={activeTab.reloadToken}
              onSwitchToCodeView={isActiveTabSvg ? () => setActiveTabImageViewMode('code') : undefined}
              onMetadataChange={setImageMetadata}
              colors={{
                ...colors,
                background: surfaceBgFor(activeTab.themeOverride),
                foreground: surfaceFgFor(activeTab.themeOverride),
              }}
              themeMode={(activeTab.themeOverride ?? (currentTheme === 'light' ? 'light' : 'dark'))}
            />
          ) : isActiveTabCsv && activeCsvViewMode === 'grid' ? (
            <CsvGridEditor
              content={activeTab.content}
              filename={activeTab.filePath ?? activeTab.title}
              eol={activeTab.eol ?? 'LF'}
              onChange={(nextContent) => updateTabContent(activeTab.id, nextContent)}
              onSwitchToTextView={() => setActiveTabCsvViewMode('text')}
              onCursorChange={(row, col) => setCursorPosition({ line: row, column: col })}
              colors={{
                ...colors,
                background: surfaceBgFor(activeTab.themeOverride),
                foreground: surfaceFgFor(activeTab.themeOverride),
              }}
              themeMode={(activeTab.themeOverride ?? (currentTheme === 'light' ? 'light' : 'dark'))}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', width: '100%', height: '100%' }}>
              {isActiveTabCsv && (
                <div
                  data-testid="csv-raw-text-banner"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '4px 10px',
                    backgroundColor: colors.tabBackground,
                    borderBottom: `1px solid ${colors.tabHover}`,
                    fontSize: '12px',
                    flexShrink: 0,
                  }}
                >
                  <span style={{ opacity: 0.8 }}>Viewing CSV as raw text</span>
                  <button
                    data-testid="csv-switch-to-grid-button"
                    onClick={() => setActiveTabCsvViewMode('grid')}
                    style={{
                      padding: '2px 9px',
                      fontSize: '11px',
                      fontWeight: 600,
                      borderRadius: '4px',
                      border: `1px solid ${colors.tabBorder}`,
                      backgroundColor: colors.background,
                      color: colors.foreground,
                      cursor: 'pointer',
                    }}
                  >
                    Grid View
                  </button>
                </div>
              )}
              {isActiveTabSvg && (
                <div
                  data-testid="svg-code-view-banner"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '4px 10px',
                    backgroundColor: colors.tabBackground,
                    borderBottom: `1px solid ${colors.tabHover}`,
                    fontSize: '12px',
                    flexShrink: 0,
                  }}
                >
                  <span style={{ opacity: 0.8 }}>Editing SVG XML source</span>
                  <button
                    data-testid="svg-switch-to-preview-button"
                    onClick={() => setActiveTabImageViewMode('preview')}
                    style={{
                      padding: '2px 9px',
                      fontSize: '11px',
                      fontWeight: 600,
                      borderRadius: '4px',
                      border: `1px solid ${colors.tabBorder}`,
                      backgroundColor: colors.background,
                      color: colors.foreground,
                      cursor: 'pointer',
                    }}
                  >
                    Image Preview
                  </button>
                </div>
              )}
              <div style={{ flex: 1, minHeight: 0 }}>
                <Editor
                  height="100%"
                  theme={(activeTab.themeOverride ?? (currentTheme === 'light' ? 'light' : 'dark')) === 'light' ? 'light' : 'vs-dark'} /* Per-tab override falls back to global theme */
                  path={activeTab.title} /* Monaco uses path to infer language (e.g. file.json -> json) */
                  language={effectiveLanguage === 'csv' ? 'plaintext' : effectiveLanguage}
                  value={activeTab.content}
                  onChange={handleEditorChange}
                  onMount={handlePrimaryEditorMount}
                  options={{
                    minimap: { enabled: true },
                    fontSize: 14,
                    wordWrap: wordWrap ? 'on' : 'off',
                    renderWhitespace: showWhitespace ? 'all' : 'none',
                    renderControlCharacters: showWhitespace,
                    formatOnType: true,
                    formatOnPaste: true,
                    padding: { top: 6 },
                    lineNumbersMinChars: 6,
                  }}
                />
              </div>
            </div>
          )
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', height: '100%', color: '#666', gap: '6px' }}>
            <p style={{ margin: 0 }}>No tabs open. Press Cmd/Ctrl+N to create a new file.</p>
            <p style={{ margin: 0, fontSize: '12px', opacity: 0.8 }} data-testid="empty-state-shortcuts-hint">
              Press Cmd/Ctrl+Shift+T to reopen a closed tab, or Shift+F1 to view all shortcuts.
            </p>
          </div>
        )}
      </div>
      </div>{/* end Editor Column */}
      </div>{/* end Workspace Row */}

      {!isPopoutMode && (
        <FindInTabsPanel
          isOpen={isFindInTabsOpen}
          tabs={tabs.filter(t => !isRasterImagePath(t.filePath ?? t.title))}
          onClose={() => setIsFindInTabsOpen(false)}
          onSelectMatch={handleSelectFindMatch}
          onReplaceAllInTabs={handleReplaceAllInTabs}
        />
      )}

      {terminals.isAvailable && <TerminalPanel terminals={terminals} cwdForNew={terminalCwdForNew} />}

      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
      <ShortcutsModal isOpen={isShortcutsOpen} onClose={() => setIsShortcutsOpen(false)} />
      <HelpModal
        isOpen={isHelpOpen}
        onClose={() => setIsHelpOpen(false)}
        onOpenShortcuts={() => setIsShortcutsOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
      />
      <GoToLineModal
        isOpen={isGoToLineOpen}
        currentLine={cursorPosition.line}
        maxLine={activeTabLineCount}
        onGoToLine={handleGoToLine}
        onClose={() => setIsGoToLineOpen(false)}
      />

      {/* Tab context menu */}
      {tabContextMenu && (
        <>
          {/* Invisible backdrop to close menu on outside click */}
          <div
            data-testid="tab-context-menu-backdrop"
            style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
            onClick={() => setTabContextMenu(null)}
          />
          <div
            data-testid="tab-context-menu"
            role="menu"
            style={{
              position: 'fixed',
              top: tabContextMenu.y,
              left: tabContextMenu.x,
              zIndex: 9999,
              backgroundColor: colors.background,
              border: `1px solid ${colors.tabHover}`,
              borderRadius: '4px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
              minWidth: '180px',
              padding: '4px 0',
            }}
          >
            <div
              role="menuitem"
              data-testid="tab-context-popout"
              onClick={() => handlePopout(tabContextMenu.tabId)}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.backgroundColor = colors.tabHover; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent'; }}
              style={{
                padding: '7px 16px',
                cursor: 'pointer',
                fontSize: '13px',
                color: colors.foreground,
                backgroundColor: 'transparent',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '24px',
              }}
            >
              <span>Pop out to new window</span>
              <span style={{ opacity: 0.45, fontSize: '11px', flexShrink: 0 }}>Ctrl+Shift+N</span>
            </div>
            {(() => {
              const target = tabs.find(t => t.id === tabContextMenu.tabId);
              const targetLang =
                target?.language ??
                inferLanguageFromFilename(target?.filePath ?? target?.title);
              if (!target || !isMarkdownTab(target.filePath ?? target.title, targetLang)) {
                return null;
              }
              return (
                <div
                  role="menuitem"
                  data-testid="tab-context-markdown-preview"
                  onClick={() => openMarkdownPreviewForTab(tabContextMenu.tabId)}
                  onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.backgroundColor = colors.tabHover; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent'; }}
                  style={{
                    padding: '7px 16px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    color: colors.foreground,
                    backgroundColor: 'transparent',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '24px',
                  }}
                >
                  <span>Open Markdown Preview</span>
                  <span style={{ opacity: 0.45, fontSize: '11px', flexShrink: 0 }}>Ctrl+Shift+V</span>
                </div>
              );
            })()}
            <div
              role="menuitem"
              data-testid="tab-context-split-view"
              onClick={() => handleOpenInSplitView(tabContextMenu.tabId)}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.backgroundColor = colors.tabHover; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent'; }}
              style={{
                padding: '7px 16px',
                cursor: 'pointer',
                fontSize: '13px',
                color: colors.foreground,
                backgroundColor: 'transparent',
              }}
            >
              Open in Split View
            </div>
            <div
              role="menuitem"
              data-testid="tab-context-compare-active"
              onClick={() => handleCompareWithActiveTab(tabContextMenu.tabId)}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.backgroundColor = colors.tabHover; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent'; }}
              style={{
                padding: '7px 16px',
                cursor: 'pointer',
                fontSize: '13px',
                color: colors.foreground,
                backgroundColor: 'transparent',
              }}
            >
              Compare with Active Tab
            </div>

            {(() => {
              const target = tabs.find(t => t.id === tabContextMenu.tabId);
              const hasFilePath = !!target?.filePath;
              return (
                <>
                  <div
                    role="menuitem"
                    aria-disabled={!hasFilePath}
                    data-testid="tab-context-rename"
                    onClick={() => { if (hasFilePath) handleRenameTab(tabContextMenu.tabId); }}
                    onMouseEnter={e => { if (hasFilePath) (e.currentTarget as HTMLDivElement).style.backgroundColor = colors.tabHover; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent'; }}
                    style={{
                      padding: '7px 16px',
                      cursor: hasFilePath ? 'pointer' : 'not-allowed',
                      fontSize: '13px',
                      color: colors.foreground,
                      opacity: hasFilePath ? 1 : 0.45,
                      backgroundColor: 'transparent',
                    }}
                    title={hasFilePath ? undefined : 'Save the file before renaming'}
                  >
                    Rename…
                  </div>
                  <div
                    role="menuitem"
                    aria-disabled={!hasFilePath}
                    data-testid="tab-context-copy-path"
                    onClick={() => { if (hasFilePath) handleCopyFullPath(tabContextMenu.tabId); }}
                    onMouseEnter={e => { if (hasFilePath) (e.currentTarget as HTMLDivElement).style.backgroundColor = colors.tabHover; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent'; }}
                    style={{
                      padding: '7px 16px',
                      cursor: hasFilePath ? 'pointer' : 'not-allowed',
                      fontSize: '13px',
                      color: colors.foreground,
                      opacity: hasFilePath ? 1 : 0.45,
                      backgroundColor: 'transparent',
                    }}
                    title={hasFilePath ? undefined : 'Save the file before copying its path'}
                  >
                    Copy Full Path
                  </div>
                  <div
                    role="menuitem"
                    data-testid="tab-context-copy-filename"
                    onClick={() => handleCopyFilename(tabContextMenu.tabId)}
                    onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.backgroundColor = colors.tabHover; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent'; }}
                    style={{
                      padding: '7px 16px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      color: colors.foreground,
                      backgroundColor: 'transparent',
                    }}
                  >
                    Copy Filename
                  </div>
                  <div
                    role="menuitem"
                    aria-disabled={!hasFilePath}
                    data-testid="tab-context-open-folder-in-explorer"
                    onClick={() => { if (hasFilePath) handleOpenTabFolderInExplorer(tabContextMenu.tabId); }}
                    onMouseEnter={e => { if (hasFilePath) (e.currentTarget as HTMLDivElement).style.backgroundColor = colors.tabHover; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent'; }}
                    style={{
                      padding: '7px 16px',
                      cursor: hasFilePath ? 'pointer' : 'not-allowed',
                      fontSize: '13px',
                      color: colors.foreground,
                      opacity: hasFilePath ? 1 : 0.45,
                      backgroundColor: 'transparent',
                    }}
                    title={hasFilePath ? undefined : 'Save the file before opening its folder in File Explorer'}
                  >
                    Open Folder in File Explorer
                  </div>
                  <div
                    role="menuitem"
                    aria-disabled={!hasFilePath}
                    data-testid="tab-context-reveal-in-folder"
                    onClick={() => { if (hasFilePath) handleRevealInFolder(tabContextMenu.tabId); }}
                    onMouseEnter={e => { if (hasFilePath) (e.currentTarget as HTMLDivElement).style.backgroundColor = colors.tabHover; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent'; }}
                    style={{
                      padding: '7px 16px',
                      cursor: hasFilePath ? 'pointer' : 'not-allowed',
                      fontSize: '13px',
                      color: colors.foreground,
                      opacity: hasFilePath ? 1 : 0.45,
                      backgroundColor: 'transparent',
                    }}
                    title={hasFilePath ? undefined : 'Save the file before revealing in folder'}
                  >
                    Reveal in Finder / Explorer
                  </div>
                  {terminals.isAvailable && (
                  <div
                    role="menuitem"
                    data-testid="tab-context-open-in-integrated-terminal"
                    onClick={() => handleOpenInIntegratedTerminal(tabContextMenu.tabId)}
                    onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.backgroundColor = colors.tabHover; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent'; }}
                    style={{
                      padding: '7px 16px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      color: colors.foreground,
                      backgroundColor: 'transparent',
                    }}
                    title={hasFilePath ? undefined : 'Opens in your home folder (the file is not saved yet)'}
                  >
                    Open in Integrated Terminal
                  </div>
                  )}
                  <div
                    role="menuitem"
                    data-testid="tab-context-open-in-external-terminal"
                    onClick={() => handleOpenInExternalTerminal(tabContextMenu.tabId)}
                    onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.backgroundColor = colors.tabHover; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent'; }}
                    style={{
                      padding: '7px 16px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      color: colors.foreground,
                      backgroundColor: 'transparent',
                    }}
                    title={hasFilePath ? undefined : 'Opens in your home folder (the file is not saved yet)'}
                  >
                    Open in External Terminal
                  </div>
                </>
              );
            })()}

            {/* Separator */}
            <div
              style={{
                height: '1px',
                margin: '4px 0',
                backgroundColor: colors.tabHover,
              }}
            />

            {/* Theme submenu header */}
            <div
              style={{
                padding: '4px 16px 2px',
                fontSize: '11px',
                color: colors.foreground,
                opacity: 0.55,
                textTransform: 'uppercase',
                letterSpacing: '0.04em',
              }}
            >
              Editor Theme
            </div>
            {(() => {
              const target = tabs.find(t => t.id === tabContextMenu.tabId);
              const override = target?.themeOverride;
              const renderThemeItem = (
                label: string,
                value: 'light' | 'dark' | null,
                testId: string
              ) => {
                const isActive =
                  value === null ? override === undefined : override === value;
                return (
                  <div
                    role="menuitemradio"
                    aria-checked={isActive}
                    data-testid={testId}
                    onClick={() => handleSetTabTheme(tabContextMenu.tabId, value)}
                    onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.backgroundColor = colors.tabHover; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent'; }}
                    style={{
                      padding: '7px 16px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      color: colors.foreground,
                      backgroundColor: 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                    }}
                  >
                    <span style={{ width: '14px', display: 'inline-block', textAlign: 'center', opacity: isActive ? 1 : 0 }}>
                      ✓
                    </span>
                    <span>{label}</span>
                  </div>
                );
              };
              return (
                <>
                  {renderThemeItem('Light', 'light', 'tab-context-theme-light')}
                  {renderThemeItem('Dark', 'dark', 'tab-context-theme-dark')}
                  {renderThemeItem('Use Default', null, 'tab-context-theme-default')}
                </>
              );
            })()}

            {/* Separator */}
            <div
              style={{
                height: '1px',
                margin: '4px 0',
                backgroundColor: colors.tabHover,
              }}
            />

            <div
              role="menuitem"
              data-testid="tab-context-close"
              onClick={() => handleCloseTabFromMenu(tabContextMenu.tabId)}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.backgroundColor = colors.tabHover; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent'; }}
              style={{
                padding: '7px 16px',
                cursor: 'pointer',
                fontSize: '13px',
                color: colors.foreground,
                backgroundColor: 'transparent',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: '24px',
              }}
            >
              <span>Close Tab</span>
              <span style={{ opacity: 0.45, fontSize: '11px', flexShrink: 0 }}>Ctrl+W</span>
            </div>

            {tabs.length > 1 && (
              <div
                role="menuitem"
                data-testid="tab-context-close-others"
                onClick={() => handleCloseOtherTabs(tabContextMenu.tabId)}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.backgroundColor = colors.tabHover; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent'; }}
                style={{
                  padding: '7px 16px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  color: colors.foreground,
                  backgroundColor: 'transparent',
                }}
              >
                Close Other Tabs
              </div>
            )}

            <div
              role="menuitem"
              data-testid="tab-context-close-all"
              onClick={() => handleCloseAllTabs()}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.backgroundColor = colors.tabHover; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent'; }}
              style={{
                padding: '7px 16px',
                cursor: 'pointer',
                fontSize: '13px',
                color: colors.foreground,
                backgroundColor: 'transparent',
              }}
            >
              Close All Tabs
            </div>

            {(() => {
              const canReopen = closedTabs.length > 0;
              return (
                <div
                  role="menuitem"
                  aria-disabled={!canReopen}
                  data-testid="tab-context-reopen-closed"
                  onClick={() => { if (canReopen) reopenClosedTab(); }}
                  onMouseEnter={e => { if (canReopen) (e.currentTarget as HTMLDivElement).style.backgroundColor = colors.tabHover; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent'; }}
                  style={{
                    padding: '7px 16px',
                    cursor: canReopen ? 'pointer' : 'not-allowed',
                    fontSize: '13px',
                    color: colors.foreground,
                    opacity: canReopen ? 1 : 0.45,
                    backgroundColor: 'transparent',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: '24px',
                  }}
                >
                  <span>Reopen Closed Tab</span>
                  <span style={{ opacity: 0.45, fontSize: '11px', flexShrink: 0 }}>Ctrl+Shift+T</span>
                </div>
              );
            })()}
          </div>
        </>
      )}

      {/* Rename file modal */}
      {renameTarget && (
        <div
          data-testid="rename-modal-backdrop"
          onClick={closeRenameModal}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 10000,
            backgroundColor: 'rgba(0,0,0,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div
            data-testid="rename-modal"
            role="dialog"
            aria-label="Rename file"
            onClick={e => e.stopPropagation()}
            style={{
              backgroundColor: colors.background,
              border: `1px solid ${colors.tabHover}`,
              borderRadius: '6px',
              padding: '20px 24px',
              minWidth: '360px',
              boxShadow: '0 6px 24px rgba(0,0,0,0.4)',
            }}
          >
            <div style={{ fontSize: '14px', color: colors.foreground, marginBottom: '12px', fontWeight: 600 }}>
              Rename file
            </div>
            <div style={{ fontSize: '12px', color: colors.foreground, opacity: 0.7, marginBottom: '8px' }}>
              Current name: {renameTarget.currentName}
            </div>
            <input
              data-testid="rename-modal-input"
              autoFocus
              value={renameInput}
              onChange={e => { setRenameInput(e.target.value); if (renameError) setRenameError(null); }}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); submitRename(); }
                else if (e.key === 'Escape') { e.preventDefault(); closeRenameModal(); }
              }}
              style={{
                width: '100%',
                padding: '6px 8px',
                fontSize: '13px',
                color: colors.foreground,
                backgroundColor: colors.tabHover,
                border: `1px solid ${colors.tabHover}`,
                borderRadius: '3px',
                boxSizing: 'border-box',
              }}
            />
            {renameError && (
              <div
                data-testid="rename-modal-error"
                style={{ marginTop: '8px', fontSize: '12px', color: '#e06c75' }}
              >
                {renameError}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
              <button
                data-testid="rename-modal-cancel"
                onClick={closeRenameModal}
                style={{
                  padding: '6px 14px',
                  fontSize: '13px',
                  color: colors.foreground,
                  backgroundColor: 'transparent',
                  border: `1px solid ${colors.tabHover}`,
                  borderRadius: '3px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                data-testid="rename-modal-submit"
                onClick={submitRename}
                style={{
                  padding: '6px 14px',
                  fontSize: '13px',
                  color: colors.background,
                  backgroundColor: colors.foreground,
                  border: `1px solid ${colors.foreground}`,
                  borderRadius: '3px',
                  cursor: 'pointer',
                }}
              >
                Rename
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status Bar */}
      <div
        data-testid="status-bar"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '4px 8px',
          borderTop: `1px solid ${colors.tabHover}`,
          backgroundColor: colors.tabBackground,
          flexShrink: 0,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            fontSize: '12px',
            color: colors.foreground,
            opacity: 0.9,
          }}
        >
          {activeTab && isActiveTabImagePreview ? (
            <>
              <span data-testid="status-image-format">
                {getImageFormatLabel(activeTab.filePath ?? activeTab.title)} Image
              </span>
              {imageMetadata?.width && imageMetadata?.height && (
                <span data-testid="status-image-dimensions">
                  {imageMetadata.width} × {imageMetadata.height} px
                </span>
              )}
              <span data-testid="status-image-zoom">
                Zoom: {imageMetadata?.isFit ?? true ? 'Fit' : `${imageMetadata?.zoomPercent ?? 100}%`}
              </span>
            </>
          ) : (
            <>
              {activeTab && (
                <span
                  data-testid="status-cursor-position"
                  role="button"
                  tabIndex={0}
                  title="Go to Line (Ctrl+G)"
                  onClick={() => setIsGoToLineOpen(true)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setIsGoToLineOpen(true);
                    }
                  }}
                  style={{ cursor: 'pointer' }}
                >
                  Ln {cursorPosition.line}, Col {cursorPosition.column}
                </span>
              )}
              {activeTab && (
                <span data-testid="status-selection-summary">
                  Sel {selectionSummary.lines}L, {selectionSummary.chars}C
                </span>
              )}
              {activeTab && (
                <span data-testid="status-total-characters">
                  Chars {activeTab.content.length}
                </span>
              )}
              {activeTab && showWhitespace && (
                <span
                  data-testid="status-whitespace-indicator"
                  title="Showing whitespace & EOL"
                >
                  WS+EOL ({activeTab.eol ?? 'LF'})
                </span>
              )}
            </>
          )}
          {alwaysOnTop && (
            <span
              data-testid="status-always-on-top"
              title="Window is pinned Always on Top"
            >
              📌 Pinned
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center' }}>
        {!isActiveTabImagePreview && (
        <button
          data-testid="whitespace-toggle"
          aria-label={showWhitespace ? 'Hide Whitespace & EOL' : 'Show Whitespace & EOL'}
          aria-pressed={showWhitespace}
          onClick={() => setShowWhitespace(prev => !prev)}
          title={showWhitespace ? 'Hide Whitespace & EOL' : 'Show Whitespace & EOL'}
          style={{
            width: '28px',
            height: '22px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            cursor: 'pointer',
            borderRadius: '4px',
            border: `1px solid ${colors.tabHover}`,
            backgroundColor: showWhitespace ? colors.tabActiveBackground : colors.tabBackground,
            color: colors.foreground,
            opacity: showWhitespace ? 1 : 0.55,
            fontSize: '12px',
            fontWeight: 600,
            fontFamily: 'monospace',
          }}
        >
          ¶
        </button>
        )}
        {!isActiveTabImagePreview && (
        <button
          data-testid="word-wrap-toggle"
          aria-label={wordWrap ? 'Disable Word Wrap' : 'Enable Word Wrap'}
          aria-pressed={wordWrap}
          onClick={() => setWordWrap(prev => !prev)}
          title={wordWrap ? 'Disable Word Wrap' : 'Enable Word Wrap'}
          style={{
            width: '28px',
            height: '22px',
            marginLeft: '4px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            cursor: 'pointer',
            borderRadius: '4px',
            border: `1px solid ${colors.tabHover}`,
            backgroundColor: wordWrap ? colors.tabActiveBackground : colors.tabBackground,
            color: colors.foreground,
            opacity: wordWrap ? 1 : 0.55,
          }}
        >
          {/* Word wrap icon: three lines with a curved arrow indicating wrap on the second line */}
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.25"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            <line x1="2" y1="3.5" x2="14" y2="3.5" />
            <path d="M2 8h9.5a2 2 0 0 1 0 4H8" />
            <polyline points="9.5,10 8,12 9.5,14" />
            <line x1="2" y1="12.5" x2="5" y2="12.5" />
          </svg>
        </button>
        )}
        {activeTab && !isActiveTabImagePreview && (
          <EncodingSelector
            encoding={activeTab.encoding ?? DEFAULT_ENCODING}
            canReopen={!!activeTab.filePath}
            onReopenWithEncoding={handleReopenWithEncoding}
            onSaveWithEncoding={handleSaveWithEncoding}
            colors={{
              background: colors.background,
              foreground: colors.foreground,
              tabBackground: colors.tabBackground,
              tabActiveBackground: colors.tabActiveBackground,
              tabHover: colors.tabHover,
            }}
          />
        )}
        {activeTab && !isActiveTabImagePreview && (
          <LineEndingSelector
            eol={activeTab.eol ?? 'LF'}
            onChange={handleEolChange}
            colors={{
              background: colors.background,
              foreground: colors.foreground,
              tabBackground: colors.tabBackground,
              tabActiveBackground: colors.tabActiveBackground,
              tabHover: colors.tabHover,
            }}
          />
        )}
        {activeTab && !isActiveTabImagePreview && (
          <LanguageSelector
            languageId={effectiveLanguage}
            inferred={isLanguageInferred}
            onChange={handleLanguageChange}
            colors={{
              background: colors.background,
              foreground: colors.foreground,
              tabBackground: colors.tabBackground,
              tabActiveBackground: colors.tabActiveBackground,
              tabHover: colors.tabHover,
            }}
          />
        )}
        {terminals.isAvailable && (
          <button
            data-testid="status-bar-terminal-toggle"
            aria-label="Toggle terminal"
            aria-pressed={terminals.isOpen}
            title="Toggle terminal (Ctrl+`)"
            onClick={() => toggleTerminalRef.current()}
            style={{
              display: 'flex',
              alignItems: 'center',
              marginLeft: '6px',
              padding: '2px 6px',
              border: 'none',
              borderRadius: '3px',
              background: terminals.isOpen ? colors.tabHover : 'transparent',
              color: colors.foreground,
              cursor: 'pointer',
            }}
          >
            <SquareTerminal size={14} />
          </button>
        )}
        </div>
      </div>
    </div>
  );
};

export default App;
