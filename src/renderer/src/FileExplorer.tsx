import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowUp, ChevronDown, ChevronRight, FolderOpen, RefreshCw, ChevronsDownUp, X } from 'lucide-react';
import { useTheme } from './theme/ThemeContext';
import { FileIcon, FolderIcon } from './FileIcon';

export interface ExplorerEntry {
  name: string;
  path: string;
  isDirectory: boolean;
}

export interface ExplorerTabItem {
  id: string;
  title: string;
  filePath: string | null;
  isDirty?: boolean;
  isPreview?: boolean;
}

interface FileExplorerProps {
  isOpen: boolean;
  rootFolderPath: string | null;
  tabs: ExplorerTabItem[];
  activeTabId: string | null;
  onSelectTab: (tabId: string) => void;
  onPinTab?: (tabId: string) => void;
  onCloseTab: (e: React.MouseEvent, tabId: string) => void;
  onOpenFileFromTree: (filePath: string, options?: { preview?: boolean }) => void;
  onOpenInIntegratedTerminal?: (dirPath: string) => void;
  onPickFolder: () => void;
  onCloseExplorer: () => void;
  /** Switches the File Explorer root to `dirPath` on the same instance. */
  onChangeRootFolder?: (dirPath: string) => void;
  /** Notifies the parent app when a file or folder is renamed from the Explorer tree. */
  onItemRenamed?: (oldPath: string, newPath: string, newName: string, isDirectory: boolean) => void;
  /** Notifies the parent app when a file or folder is deleted from the Explorer tree. */
  onItemDeleted?: (deletedPath: string, isDirectory: boolean) => void;
  /** Incremented after a file save or rename so expanded folders refresh immediately. */
  refreshToken?: number;
}

const DEFAULT_WIDTH = 240;
const MIN_WIDTH = 160;
const MAX_WIDTH = 520;
/** Default maximum height of the Open Editors list before it scrolls internally (~7 rows). */
export const OPEN_EDITORS_MAX_HEIGHT = 180;
export const MIN_OPEN_EDITORS_HEIGHT = 48;
export const MAX_OPEN_EDITORS_HEIGHT = 500;

/** Normalizes slashes and trailing separators for cross-platform path comparisons. */
export function normalizePathForCompare(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+$/, '');
}

/** Extracts the basename of a directory or file path. */
export function getPathBasename(p: string): string {
  const trimmed = p.replace(/[\\/]+$/, '');
  const parts = trimmed.split(/[\\/]/);
  return parts[parts.length - 1] || p;
}

/** Extracts the parent directory of a file path, preserving its separator style. */
export function getParentDirPath(filePath: string): string {
  const lastSep = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'));
  if (lastSep <= 0) return filePath;
  // Handle Windows drive roots like "C:\file.txt" -> "C:\"
  if (lastSep === 2 && /^[a-zA-Z]:[\\/]/.test(filePath)) {
    return filePath.slice(0, 3);
  }
  return filePath.slice(0, lastSep);
}

/**
 * Formats the subtle directory hint shown beside an item in "Open Editors"
 * (e.g. `src\renderer\src` when inside the root folder, or parent folder name).
 */
export function formatOpenEditorSubpath(
  filePath: string | null,
  rootFolderPath: string | null,
): string {
  if (!filePath) return '';
  const parentDir = getParentDirPath(filePath);
  if (!parentDir || parentDir === filePath) return '';

  if (rootFolderPath) {
    const normParent = normalizePathForCompare(parentDir);
    const normRoot = normalizePathForCompare(rootFolderPath);
    if (normParent === normRoot) return '';
    if (normParent.startsWith(normRoot + '/')) {
      const rel = normParent.slice(normRoot.length + 1);
      const sep = filePath.includes('\\') ? '\\' : '/';
      return rel.replace(/\//g, sep);
    }
  }

  return parentDir;
}

const FileExplorer: React.FC<FileExplorerProps> = ({
  isOpen,
  rootFolderPath,
  tabs,
  activeTabId,
  onSelectTab,
  onPinTab,
  onCloseTab,
  onOpenFileFromTree,
  onOpenInIntegratedTerminal,
  onPickFolder,
  onCloseExplorer,
  onChangeRootFolder,
  onItemRenamed,
  onItemDeleted,
  refreshToken = 0,
}) => {
  const { currentTheme, colors } = useTheme();
  const [width, setWidth] = useState<number>(DEFAULT_WIDTH);
  const [openEditorsExpanded, setOpenEditorsExpanded] = useState<boolean>(true);
  /** Explicit height set by dragging the section splitter; null = auto-size up to OPEN_EDITORS_MAX_HEIGHT. */
  const [openEditorsHeight, setOpenEditorsHeight] = useState<number | null>(null);
  const [isDraggingSectionSplitter, setIsDraggingSectionSplitter] = useState<boolean>(false);
  const openEditorsListRef = useRef<HTMLDivElement | null>(null);
  const [rootSectionExpanded, setRootSectionExpanded] = useState<boolean>(true);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [entriesByDir, setEntriesByDir] = useState<Record<string, ExplorerEntry[]>>({});
  const [rootError, setRootError] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<{
    entry: ExplorerEntry | null;
    targetDirPath: string;
    x: number;
    y: number;
  } | null>(null);
  const [createTarget, setCreateTarget] = useState<{
    parentDirPath: string;
    kind: 'file' | 'folder';
  } | null>(null);
  const [createInput, setCreateInput] = useState<string>('');
  const [createError, setCreateError] = useState<string | null>(null);
  const [renameTarget, setRenameTarget] = useState<ExplorerEntry | null>(null);
  const [renameInput, setRenameInput] = useState<string>('');
  const [renameError, setRenameError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ExplorerEntry | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const expandedDirsRef = useRef<Set<string>>(expandedDirs);
  expandedDirsRef.current = expandedDirs;
  const rootFolderPathRef = useRef<string | null>(rootFolderPath);
  rootFolderPathRef.current = rootFolderPath;

  const dirtyColor = currentTheme === 'light' ? '#b45309' : '#e2c08d';
  const subtleTextColor = currentTheme === 'light' ? 'rgba(51,51,51,0.65)' : 'rgba(212,212,212,0.55)';
  const guideLineColor = currentTheme === 'light' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.08)';
  const activeRowBg = currentTheme === 'light' ? '#d6ebff' : '#37373d';

  const loadDirectory = useCallback(async (dirPath: string, isRoot = false) => {
    const w = window as any;
    if (!w.electronAPI?.readDirectory) return;
    try {
      const res = await w.electronAPI.readDirectory(dirPath);
      if (res && res.ok) {
        if (isRoot) setRootError(null);
        setEntriesByDir(prev => ({
          ...prev,
          [normalizePathForCompare(dirPath)]: res.entries,
        }));
      } else if (isRoot) {
        setRootError(res?.error || 'Unable to read folder.');
      }
    } catch (err) {
      if (isRoot) {
        setRootError(err instanceof Error ? err.message : 'Unable to read folder.');
      }
    }
  }, []);

  // Load root directory when rootFolderPath changes
  useEffect(() => {
    setExpandedDirs(new Set());
    setEntriesByDir({});
    setRootError(null);
    setRootSectionExpanded(true);
    if (rootFolderPath) {
      void loadDirectory(rootFolderPath, true);
    }
  }, [rootFolderPath, loadDirectory]);

  // Refresh root and all expanded folders when refreshToken changes (e.g. after Save / Rename)
  useEffect(() => {
    if (!rootFolderPath || refreshToken === 0) return;
    void loadDirectory(rootFolderPath, true);
    for (const dirPath of Array.from(expandedDirsRef.current)) {
      void loadDirectory(dirPath, false);
    }
  }, [refreshToken, rootFolderPath, loadDirectory]);

  // Synchronize watched directories with the main process so external/saved files refresh live
  const watchedDirsList = React.useMemo(() => {
    if (!isOpen || !rootFolderPath || !rootSectionExpanded) return [];
    return [rootFolderPath, ...Array.from(expandedDirs)];
  }, [isOpen, rootFolderPath, rootSectionExpanded, expandedDirs]);

  const watchedDirsKey = JSON.stringify(watchedDirsList);

  useEffect(() => {
    const w = window as any;
    w.electronAPI?.syncWatchedDirs?.(JSON.parse(watchedDirsKey));
  }, [watchedDirsKey]);

  // Listen for directory-change notifications from the main process
  useEffect(() => {
    const w = window as any;
    if (!w.electronAPI?.onExplorerDirChanged) return;
    const unsubscribe = w.electronAPI.onExplorerDirChanged((changedDirPath: string) => {
      if (!changedDirPath) return;
      const normChanged = normalizePathForCompare(changedDirPath);
      const currentRoot = rootFolderPathRef.current;
      if (currentRoot && normalizePathForCompare(currentRoot) === normChanged) {
        void loadDirectory(currentRoot, true);
        return;
      }
      for (const expanded of Array.from(expandedDirsRef.current)) {
        if (normalizePathForCompare(expanded) === normChanged) {
          void loadDirectory(expanded, false);
          return;
        }
      }
    });
    return () => {
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [loadDirectory]);

  const handleRefreshAll = useCallback(() => {
    if (!rootFolderPath) return;
    void loadDirectory(rootFolderPath, true);
    for (const dirPath of Array.from(expandedDirsRef.current)) {
      void loadDirectory(dirPath, false);
    }
  }, [rootFolderPath, loadDirectory]);

  const handleCollapseAll = useCallback(() => {
    setExpandedDirs(new Set());
  }, []);

  const toggleDirectory = useCallback(
    (dirPath: string) => {
      setExpandedDirs(prev => {
        const next = new Set(prev);
        let found: string | null = null;
        const normTarget = normalizePathForCompare(dirPath);
        for (const existing of next) {
          if (normalizePathForCompare(existing) === normTarget) {
            found = existing;
            break;
          }
        }
        if (found) {
          next.delete(found);
        } else {
          next.add(dirPath);
          void loadDirectory(dirPath, false);
        }
        return next;
      });
    },
    [loadDirectory],
  );

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;

    const onMouseMove = (moveEvent: MouseEvent) => {
      const nextWidth = Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, startWidth + (moveEvent.clientX - startX)));
      setWidth(nextWidth);
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleSectionSplitterMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const measuredHeight = openEditorsListRef.current?.getBoundingClientRect().height;
    const startHeight =
      openEditorsHeight ??
      (measuredHeight && measuredHeight > 0 ? measuredHeight : OPEN_EDITORS_MAX_HEIGHT);

    setIsDraggingSectionSplitter(true);

    const onMouseMove = (moveEvent: MouseEvent) => {
      const nextHeight = Math.min(
        MAX_OPEN_EDITORS_HEIGHT,
        Math.max(MIN_OPEN_EDITORS_HEIGHT, Math.round(startHeight + (moveEvent.clientY - startY))),
      );
      setOpenEditorsHeight(nextHeight);
    };

    const onMouseUp = () => {
      setIsDraggingSectionSplitter(false);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleNewFileFromContextMenu = () => {
    if (!contextMenu) return;
    const { targetDirPath } = contextMenu;
    setContextMenu(null);
    setCreateTarget({ parentDirPath: targetDirPath, kind: 'file' });
    setCreateInput('');
    setCreateError(null);
  };

  const handleNewFolderFromContextMenu = () => {
    if (!contextMenu) return;
    const { targetDirPath } = contextMenu;
    setContextMenu(null);
    setCreateTarget({ parentDirPath: targetDirPath, kind: 'folder' });
    setCreateInput('');
    setCreateError(null);
  };

  const handleOpenTerminalFromContextMenu = () => {
    if (!contextMenu) return;
    const { targetDirPath } = contextMenu;
    setContextMenu(null);
    onOpenInIntegratedTerminal?.(targetDirPath);
  };

  const closeCreateModal = () => {
    setCreateTarget(null);
    setCreateInput('');
    setCreateError(null);
  };

  const submitExplorerCreate = async () => {
    if (!createTarget) return;
    const name = createInput.trim();
    if (!name) {
      setCreateError('Name cannot be empty.');
      return;
    }
    if (/[\\/]/.test(name) || name === '.' || name === '..') {
      setCreateError('Name cannot contain path separators.');
      return;
    }

    const w = window as any;
    const { parentDirPath, kind } = createTarget;
    const isRootTarget =
      !!rootFolderPath &&
      normalizePathForCompare(parentDirPath) === normalizePathForCompare(rootFolderPath);

    if (kind === 'file') {
      if (!w.electronAPI?.createFile) {
        setCreateError('Create file is not available in this environment.');
        return;
      }
      const res = await w.electronAPI.createFile(parentDirPath, name);
      if (!res?.ok) {
        setCreateError(res?.error ?? 'Failed to create file.');
        return;
      }

      if (!isRootTarget) {
        setExpandedDirs(prev => {
          const next = new Set(prev);
          const normParent = normalizePathForCompare(parentDirPath);
          let exists = false;
          for (const p of next) {
            if (normalizePathForCompare(p) === normParent) {
              exists = true;
              break;
            }
          }
          if (!exists) next.add(parentDirPath);
          return next;
        });
      }
      setRootSectionExpanded(true);
      await loadDirectory(parentDirPath, isRootTarget);
      onOpenFileFromTree(res.path, { preview: false });
      closeCreateModal();
      return;
    }

    if (!w.electronAPI?.createFolder) {
      setCreateError('Create folder is not available in this environment.');
      return;
    }
    const res = await w.electronAPI.createFolder(parentDirPath, name);
    if (!res?.ok) {
      setCreateError(res?.error ?? 'Failed to create folder.');
      return;
    }

    if (!isRootTarget) {
      setExpandedDirs(prev => {
        const next = new Set(prev);
        const normParent = normalizePathForCompare(parentDirPath);
        let exists = false;
        for (const p of next) {
          if (normalizePathForCompare(p) === normParent) {
            exists = true;
            break;
          }
        }
        if (!exists) next.add(parentDirPath);
        return next;
      });
    }
    setRootSectionExpanded(true);
    await loadDirectory(parentDirPath, isRootTarget);
    closeCreateModal();
  };

  const handleOpenFolderFromContextMenu = () => {
    if (!contextMenu?.entry) return;
    const { entry } = contextMenu;
    setContextMenu(null);
    if (entry.isDirectory) {
      onChangeRootFolder?.(entry.path);
    }
  };

  const startRename = (entry: ExplorerEntry) => {
    setContextMenu(null);
    setRenameTarget(entry);
    setRenameInput(entry.name);
    setRenameError(null);
  };

  const handleStartRenameFromContextMenu = () => {
    if (!contextMenu?.entry) return;
    startRename(contextMenu.entry);
  };

  const closeRenameModal = () => {
    setRenameTarget(null);
    setRenameInput('');
    setRenameError(null);
  };

  const submitExplorerRename = async () => {
    if (!renameTarget) return;
    const newName = renameInput.trim();
    if (!newName) {
      setRenameError('Name cannot be empty.');
      return;
    }
    if (/[\\/]/.test(newName) || newName === '.' || newName === '..') {
      setRenameError('Name cannot contain path separators.');
      return;
    }
    if (newName === renameTarget.name) {
      closeRenameModal();
      return;
    }

    const w = window as any;
    if (!w.electronAPI?.renameFile) {
      setRenameError('Rename is not available in this environment.');
      return;
    }

    const res = await w.electronAPI.renameFile(renameTarget.path, newName);
    if (!res?.ok) {
      setRenameError(res?.error ?? 'Failed to rename.');
      return;
    }

    const oldPath = renameTarget.path;
    const newPath = res.newPath;
    const parentDir = getParentDirPath(oldPath);

    if (renameTarget.isDirectory) {
      const normOld = normalizePathForCompare(oldPath);
      setExpandedDirs(prev => {
        const next = new Set<string>();
        for (const p of prev) {
          const normP = normalizePathForCompare(p);
          if (normP === normOld) {
            next.add(newPath);
          } else if (normP.startsWith(normOld + '/')) {
            const sep = newPath.includes('\\') ? '\\' : '/';
            const suffix = normP.slice(normOld.length).replace(/\//g, sep);
            next.add(newPath + suffix);
          } else {
            next.add(p);
          }
        }
        return next;
      });
    }

    if (parentDir) {
      const isRootParent =
        !!rootFolderPath &&
        normalizePathForCompare(parentDir) === normalizePathForCompare(rootFolderPath);
      await loadDirectory(parentDir, isRootParent);
    }
    if (renameTarget.isDirectory && isDirExpanded(oldPath)) {
      await loadDirectory(newPath, false);
    }

    onItemRenamed?.(oldPath, newPath, newName, renameTarget.isDirectory);
    closeRenameModal();
  };

  const startDelete = (entry: ExplorerEntry) => {
    setContextMenu(null);
    setDeleteTarget(entry);
    setDeleteError(null);
  };

  const handleStartDeleteFromContextMenu = () => {
    if (!contextMenu?.entry) return;
    startDelete(contextMenu.entry);
  };

  const closeDeleteModal = () => {
    setDeleteTarget(null);
    setDeleteError(null);
  };

  const confirmExplorerDelete = async () => {
    if (!deleteTarget) return;
    const w = window as any;
    if (!w.electronAPI?.deletePath) {
      setDeleteError('Delete is not available in this environment.');
      return;
    }

    const res = await w.electronAPI.deletePath(deleteTarget.path);
    if (!res?.ok) {
      setDeleteError(res?.error ?? 'Failed to delete.');
      return;
    }

    const deletedPath = deleteTarget.path;
    const parentDir = getParentDirPath(deletedPath);

    if (deleteTarget.isDirectory) {
      const normDeleted = normalizePathForCompare(deletedPath);
      setExpandedDirs(prev => {
        const next = new Set<string>();
        for (const p of prev) {
          const normP = normalizePathForCompare(p);
          if (normP !== normDeleted && !normP.startsWith(normDeleted + '/')) {
            next.add(p);
          }
        }
        return next;
      });
    }

    if (parentDir) {
      const isRootParent =
        !!rootFolderPath &&
        normalizePathForCompare(parentDir) === normalizePathForCompare(rootFolderPath);
      await loadDirectory(parentDir, isRootParent);
    }

    onItemDeleted?.(deletedPath, deleteTarget.isDirectory);
    closeDeleteModal();
  };

  if (!isOpen) return null;

  const activeTab = tabs.find(t => t.id === activeTabId) ?? null;
  const normActiveFilePath = activeTab?.filePath ? normalizePathForCompare(activeTab.filePath) : null;

  // Set of normalized file paths for dirty open tabs (used to show dirty dots on files & parent folders)
  const dirtyTabPaths = tabs
    .filter(t => t.isDirty && t.filePath)
    .map(t => normalizePathForCompare(t.filePath as string));

  const isFileDirty = (filePath: string): boolean => {
    const norm = normalizePathForCompare(filePath);
    return dirtyTabPaths.includes(norm);
  };

  const isFolderDirty = (dirPath: string): boolean => {
    const norm = normalizePathForCompare(dirPath) + '/';
    return dirtyTabPaths.some(p => p.startsWith(norm));
  };

  const isDirExpanded = (dirPath: string): boolean => {
    const norm = normalizePathForCompare(dirPath);
    for (const item of expandedDirs) {
      if (normalizePathForCompare(item) === norm) return true;
    }
    return false;
  };

  const handleTreeItemKeyDown = (e: React.KeyboardEvent<HTMLDivElement>, entry: ExplorerEntry) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.key === 'F2') {
      e.preventDefault();
      startRename(entry);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      startDelete(entry);
    }
  };

  const renderTreeEntries = (dirPath: string, depth: number): React.ReactNode => {
    const entries = entriesByDir[normalizePathForCompare(dirPath)];
    if (!entries) return null;

    return entries.map(entry => {
      if (entry.isDirectory) {
        const expanded = isDirExpanded(entry.path);
        const folderHasDirty = isFolderDirty(entry.path);
        return (
          <React.Fragment key={entry.path}>
            <div
              role="treeitem"
              aria-expanded={expanded}
              tabIndex={-1}
              data-testid={`explorer-folder-${entry.name}`}
              data-path={entry.path}
              title={entry.path}
              onClick={e => {
                e.currentTarget.focus();
                toggleDirectory(entry.path);
              }}
              onKeyDown={e => handleTreeItemKeyDown(e, entry)}
              onContextMenu={e => {
                e.preventDefault();
                e.stopPropagation();
                e.currentTarget.focus();
                setContextMenu({ entry, targetDirPath: entry.path, x: e.clientX, y: e.clientY });
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLDivElement).style.backgroundColor = colors.tabHover;
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent';
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '3px 8px',
                paddingLeft: `${10 + depth * 14}px`,
                cursor: 'pointer',
                fontSize: '13px',
                userSelect: 'none',
                position: 'relative',
              }}
            >
              <span style={{ display: 'inline-flex', alignItems: 'center', opacity: 0.75, flexShrink: 0 }}>
                {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </span>
              <FolderIcon name={entry.name} isOpen={expanded} size={16} />
              <span
                style={{
                  flexGrow: 1,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  color: folderHasDirty ? dirtyColor : colors.foreground,
                }}
              >
                {entry.name}
              </span>
              {folderHasDirty && (
                <span
                  data-testid={`explorer-folder-dirty-${entry.name}`}
                  style={{ color: dirtyColor, fontSize: '14px', lineHeight: 1, flexShrink: 0 }}
                >
                  ●
                </span>
              )}
            </div>
            {expanded && (
              <div
                style={{
                  position: 'relative',
                }}
              >
                {/* Vertical tree indent guide */}
                <div
                  aria-hidden="true"
                  style={{
                    position: 'absolute',
                    left: `${16 + depth * 14}px`,
                    top: 0,
                    bottom: 0,
                    width: '1px',
                    backgroundColor: guideLineColor,
                    pointerEvents: 'none',
                  }}
                />
                {renderTreeEntries(entry.path, depth + 1)}
              </div>
            )}
          </React.Fragment>
        );
      }

      const normEntryPath = normalizePathForCompare(entry.path);
      const isSelected = normActiveFilePath === normEntryPath;
      const dirty = isFileDirty(entry.path);

      return (
        <div
          key={entry.path}
          role="treeitem"
          aria-selected={isSelected}
          tabIndex={-1}
          data-testid={`explorer-file-${entry.name}`}
          data-path={entry.path}
          title={entry.path}
          onClick={e => {
            e.currentTarget.focus();
            onOpenFileFromTree(entry.path, { preview: true });
          }}
          onKeyDown={e => handleTreeItemKeyDown(e, entry)}
          onDoubleClick={() => onOpenFileFromTree(entry.path, { preview: false })}
          onContextMenu={e => {
            e.preventDefault();
            e.stopPropagation();
            e.currentTarget.focus();
            setContextMenu({
              entry,
              targetDirPath: getParentDirPath(entry.path),
              x: e.clientX,
              y: e.clientY,
            });
          }}
          onMouseEnter={e => {
            if (!isSelected) {
              (e.currentTarget as HTMLDivElement).style.backgroundColor = colors.tabHover;
            }
          }}
          onMouseLeave={e => {
            if (!isSelected) {
              (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent';
            }
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '3px 8px',
            paddingLeft: `${10 + depth * 14 + 19}px`,
            cursor: 'pointer',
            fontSize: '13px',
            userSelect: 'none',
            backgroundColor: isSelected ? activeRowBg : 'transparent',
            color: dirty ? dirtyColor : colors.foreground,
          }}
        >
          <FileIcon filename={entry.name} size={16} />
          <span
            style={{
              flexGrow: 1,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {entry.name}
          </span>
          {dirty && (
            <span
              data-testid={`explorer-file-dirty-${entry.name}`}
              style={{ color: dirtyColor, fontSize: '14px', lineHeight: 1, flexShrink: 0 }}
            >
              ●
            </span>
          )}
        </div>
      );
    });
  };

  const iconBtnStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '22px',
    height: '22px',
    padding: 0,
    border: 'none',
    borderRadius: '4px',
    backgroundColor: 'transparent',
    color: colors.foreground,
    opacity: 0.75,
    cursor: 'pointer',
  };

  const sectionHeaderStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '5px 8px',
    fontSize: '11px',
    fontWeight: 700,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    cursor: 'pointer',
    userSelect: 'none',
    backgroundColor: colors.tabBackground,
    borderBottom: `1px solid ${colors.tabHover}`,
  };

  const rootFolderName = rootFolderPath ? getPathBasename(rootFolderPath) : '';

  return (
    <aside
      data-testid="file-explorer-sidebar"
      aria-label="File Explorer"
      style={{
        width: `${width}px`,
        minWidth: `${MIN_WIDTH}px`,
        maxWidth: `${MAX_WIDTH}px`,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: colors.tabBackground,
        color: colors.foreground,
        borderRight: `1px solid ${colors.tabHover}`,
        position: 'relative',
        flexShrink: 0,
        userSelect: 'none',
      }}
    >
      {/* Explorer Title Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 8px 6px 12px',
          borderBottom: `1px solid ${colors.tabHover}`,
          flexShrink: 0,
        }}
      >
        <span
          style={{
            fontSize: '11px',
            fontWeight: 600,
            letterSpacing: '0.08em',
            opacity: 0.8,
            textTransform: 'uppercase',
          }}
        >
          Explorer
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
          <button
            data-testid="explorer-open-folder-btn"
            title="Open Folder in Explorer…"
            aria-label="Open Folder in Explorer"
            onClick={onPickFolder}
            style={iconBtnStyle}
          >
            <FolderOpen size={14} />
          </button>
          {rootFolderPath && (
            <>
              {(() => {
                const parentDir = getParentDirPath(rootFolderPath);
                const canGoUp =
                  !!parentDir &&
                  normalizePathForCompare(parentDir) !== normalizePathForCompare(rootFolderPath);
                if (!canGoUp || !onChangeRootFolder) return null;
                return (
                  <button
                    data-testid="explorer-parent-folder-btn"
                    title={`Open Parent Folder (${parentDir})`}
                    aria-label="Open Parent Folder"
                    onClick={() => onChangeRootFolder(parentDir)}
                    style={iconBtnStyle}
                  >
                    <ArrowUp size={14} />
                  </button>
                );
              })()}
              <button
                data-testid="explorer-refresh-btn"
                title="Refresh Explorer"
                aria-label="Refresh Explorer"
                onClick={handleRefreshAll}
                style={iconBtnStyle}
              >
                <RefreshCw size={13} />
              </button>
              <button
                data-testid="explorer-collapse-all-btn"
                title="Collapse Folders in Explorer"
                aria-label="Collapse Folders in Explorer"
                onClick={handleCollapseAll}
                style={iconBtnStyle}
              >
                <ChevronsDownUp size={14} />
              </button>
            </>
          )}
          <button
            data-testid="explorer-close-btn"
            title="Hide File Explorer (Cmd/Ctrl+B)"
            aria-label="Hide File Explorer"
            onClick={onCloseExplorer}
            style={iconBtnStyle}
          >
            <X size={14} />
          </button>
        </div>
      </div>

      {/* Body: Open Editors (capped height + own scrollbar) + Folder Tree (fills remaining height + own scrollbar) */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Open Editors Section */}
        <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
          <div
            data-testid="explorer-open-editors-header"
            onClick={() => setOpenEditorsExpanded(prev => !prev)}
            style={sectionHeaderStyle}
          >
            {openEditorsExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span style={{ flexGrow: 1 }}>Open Editors</span>
            <span
              data-testid="explorer-open-editors-count"
              style={{
                fontSize: '10px',
                padding: '0 5px',
                borderRadius: '8px',
                backgroundColor: colors.tabHover,
                opacity: 0.85,
              }}
            >
              {tabs.length}
            </span>
          </div>

          {openEditorsExpanded && (
            <div
              ref={openEditorsListRef}
              data-testid="explorer-open-editors-list"
              style={{
                padding: '2px 0 4px',
                height: openEditorsHeight !== null ? `${openEditorsHeight}px` : undefined,
                maxHeight: `${openEditorsHeight ?? OPEN_EDITORS_MAX_HEIGHT}px`,
                overflowY: 'auto',
                overflowX: 'hidden',
              }}
            >
              {tabs.map(tab => {
                const isActive = tab.id === activeTabId;
                const subpath = formatOpenEditorSubpath(tab.filePath, rootFolderPath);
                return (
                  <div
                    key={tab.id}
                    data-testid={`explorer-open-editor-${tab.id}`}
                    title={tab.filePath ?? tab.title}
                    onClick={() => onSelectTab(tab.id)}
                    onDoubleClick={() => onPinTab?.(tab.id)}
                    onMouseEnter={e => {
                      if (!isActive) {
                        (e.currentTarget as HTMLDivElement).style.backgroundColor = colors.tabHover;
                      }
                    }}
                    onMouseLeave={e => {
                      if (!isActive) {
                        (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent';
                      }
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '3px 8px 3px 10px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      backgroundColor: isActive ? activeRowBg : 'transparent',
                      color: tab.isDirty ? dirtyColor : colors.foreground,
                    }}
                  >
                    <button
                      type="button"
                      data-testid={`explorer-close-editor-${tab.id}`}
                      aria-label={`Close ${tab.title}`}
                      title="Close Tab"
                      onClick={e => onCloseTab(e, tab.id)}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: 0,
                        width: '16px',
                        height: '16px',
                        border: 'none',
                        background: 'transparent',
                        color: colors.foreground,
                        opacity: 0.65,
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
                    >
                      <X size={13} />
                    </button>
                    <FileIcon filename={tab.filePath ?? tab.title} size={15} />
                    <span
                      data-testid={`explorer-open-editor-title-${tab.id}`}
                      style={{
                        fontStyle: tab.isPreview ? 'italic' : 'normal',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        flexShrink: 0,
                        maxWidth: subpath ? '55%' : '100%',
                      }}
                    >
                      {tab.title}
                    </span>
                    {subpath && (
                      <span
                        data-testid={`explorer-open-editor-subpath-${tab.id}`}
                        style={{
                          fontSize: '11px',
                          color: subtleTextColor,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          flexGrow: 1,
                        }}
                      >
                        {subpath}
                      </span>
                    )}
                    {tab.isDirty && (
                      <span
                        data-testid={`explorer-open-editor-dirty-${tab.id}`}
                        style={{
                          marginLeft: 'auto',
                          color: dirtyColor,
                          fontSize: '13px',
                          lineHeight: 1,
                          flexShrink: 0,
                        }}
                      >
                        ●
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Horizontal Splitter between Open Editors and Folder Tree */}
        {openEditorsExpanded && (
          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label="Resize Open Editors section"
            title="Drag to resize Open Editors height (double-click to reset)"
            data-testid="explorer-sections-splitter"
            onMouseDown={handleSectionSplitterMouseDown}
            onDoubleClick={() => setOpenEditorsHeight(null)}
            onMouseEnter={e => {
              (e.currentTarget as HTMLDivElement).style.backgroundColor = colors.tabBorder;
            }}
            onMouseLeave={e => {
              if (!isDraggingSectionSplitter) {
                (e.currentTarget as HTMLDivElement).style.backgroundColor = colors.tabHover;
              }
            }}
            style={{
              height: '4px',
              flexShrink: 0,
              cursor: 'row-resize',
              backgroundColor: isDraggingSectionSplitter ? colors.tabBorder : colors.tabHover,
              transition: 'background-color 0.12s ease',
            }}
          />
        )}

        {/* Folder Tree Section */}
        {rootFolderPath ? (
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div
              data-testid="explorer-root-folder-header"
              title={rootFolderPath}
              onClick={() => setRootSectionExpanded(prev => !prev)}
              onContextMenu={e => {
                e.preventDefault();
                e.stopPropagation();
                setContextMenu({
                  entry: null,
                  targetDirPath: rootFolderPath,
                  x: e.clientX,
                  y: e.clientY,
                });
              }}
              style={{
                ...sectionHeaderStyle,
                borderTop: openEditorsExpanded ? 'none' : `1px solid ${colors.tabHover}`,
                textTransform: 'none',
                fontSize: '12px',
                flexShrink: 0,
              }}
            >
              {rootSectionExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              <span
                style={{
                  fontWeight: 700,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {rootFolderName}
              </span>
            </div>

            {rootSectionExpanded && (
              <div
                role="tree"
                aria-label={rootFolderName}
                data-testid="explorer-tree"
                onContextMenu={e => {
                  e.preventDefault();
                  e.stopPropagation();
                  setContextMenu({
                    entry: null,
                    targetDirPath: rootFolderPath,
                    x: e.clientX,
                    y: e.clientY,
                  });
                }}
                style={{
                  padding: '2px 0 8px',
                  flex: 1,
                  minHeight: 0,
                  overflowY: 'auto',
                  overflowX: 'hidden',
                }}
              >
                {rootError ? (
                  <div
                    data-testid="explorer-root-error"
                    style={{ padding: '10px 12px', fontSize: '12px', opacity: 0.75 }}
                  >
                    {rootError}
                  </div>
                ) : (
                  renderTreeEntries(rootFolderPath, 0)
                )}
              </div>
            )}
          </div>
        ) : (
          <div
            data-testid="explorer-no-folder"
            style={{
              padding: '16px 14px',
              fontSize: '12px',
              lineHeight: 1.5,
              borderTop: `1px solid ${colors.tabHover}`,
              display: 'flex',
              flexDirection: 'column',
              gap: '10px',
            }}
          >
            <div style={{ opacity: 0.8 }}>No folder opened in Explorer.</div>
            <button
              type="button"
              data-testid="explorer-empty-open-folder-btn"
              onClick={onPickFolder}
              style={{
                padding: '6px 10px',
                borderRadius: '4px',
                border: `1px solid ${colors.tabBorder}`,
                backgroundColor: colors.tabBorder,
                color: '#ffffff',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Open Folder…
            </button>
            <div style={{ fontSize: '11px', opacity: 0.65 }}>
              Tip: Right-click any open tab and select &ldquo;Open Folder in File Explorer&rdquo; to browse its folder.
            </div>
          </div>
        )}
      </div>

      {/* Right-edge Resize Handle */}
      <div
        data-testid="explorer-resize-handle"
        onMouseDown={handleResizeMouseDown}
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          bottom: 0,
          width: '4px',
          cursor: 'col-resize',
          zIndex: 10,
        }}
      />

      {/* Explorer Item Context Menu */}
      {contextMenu && (
        <>
          <div
            data-testid="explorer-context-menu-backdrop"
            style={{ position: 'fixed', inset: 0, zIndex: 9998 }}
            onClick={() => setContextMenu(null)}
          />
          <div
            data-testid="explorer-context-menu"
            role="menu"
            style={{
              position: 'fixed',
              top: contextMenu.y,
              left: contextMenu.x,
              zIndex: 9999,
              backgroundColor: colors.background,
              border: `1px solid ${colors.tabHover}`,
              borderRadius: '4px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
              minWidth: '170px',
              padding: '4px 0',
            }}
          >
            <div
              role="menuitem"
              data-testid="explorer-context-open-terminal"
              onClick={handleOpenTerminalFromContextMenu}
              onMouseEnter={e => {
                (e.currentTarget as HTMLDivElement).style.backgroundColor = colors.tabHover;
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent';
              }}
              style={{
                padding: '7px 14px',
                cursor: 'pointer',
                fontSize: '13px',
                color: colors.foreground,
                backgroundColor: 'transparent',
              }}
            >
              Open in Integrated Terminal
            </div>
            <div
              style={{
                height: '1px',
                margin: '4px 0',
                backgroundColor: colors.tabHover,
              }}
            />
            {(contextMenu.entry === null || contextMenu.entry.isDirectory) && (
              <>
                <div
                  role="menuitem"
                  data-testid="explorer-context-new-file"
                  onClick={handleNewFileFromContextMenu}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLDivElement).style.backgroundColor = colors.tabHover;
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent';
                  }}
                  style={{
                    padding: '7px 14px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    color: colors.foreground,
                    backgroundColor: 'transparent',
                  }}
                >
                  New File…
                </div>
                <div
                  role="menuitem"
                  data-testid="explorer-context-new-folder"
                  onClick={handleNewFolderFromContextMenu}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLDivElement).style.backgroundColor = colors.tabHover;
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent';
                  }}
                  style={{
                    padding: '7px 14px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    color: colors.foreground,
                    backgroundColor: 'transparent',
                  }}
                >
                  New Folder…
                </div>
              </>
            )}
            {contextMenu.entry?.isDirectory && (
              <>
                <div
                  style={{
                    height: '1px',
                    margin: '4px 0',
                    backgroundColor: colors.tabHover,
                  }}
                />
                <div
                  role="menuitem"
                  data-testid="explorer-context-open-folder"
                  onClick={handleOpenFolderFromContextMenu}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLDivElement).style.backgroundColor = colors.tabHover;
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent';
                  }}
                  style={{
                    padding: '7px 14px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    color: colors.foreground,
                    backgroundColor: 'transparent',
                  }}
                >
                  Open Folder
                </div>
                <div
                  style={{
                    height: '1px',
                    margin: '4px 0',
                    backgroundColor: colors.tabHover,
                  }}
                />
              </>
            )}
            {contextMenu.entry && (
              <>
                <div
                  role="menuitem"
                  data-testid="explorer-context-rename"
                  onClick={handleStartRenameFromContextMenu}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLDivElement).style.backgroundColor = colors.tabHover;
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent';
                  }}
                  style={{
                    padding: '7px 14px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    color: colors.foreground,
                    backgroundColor: 'transparent',
                  }}
                >
                  Rename…
                </div>
                <div
                  role="menuitem"
                  data-testid="explorer-context-delete"
                  onClick={handleStartDeleteFromContextMenu}
                  onMouseEnter={e => {
                    (e.currentTarget as HTMLDivElement).style.backgroundColor = colors.tabHover;
                  }}
                  onMouseLeave={e => {
                    (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent';
                  }}
                  style={{
                    padding: '7px 14px',
                    cursor: 'pointer',
                    fontSize: '13px',
                    color: '#e06c75',
                    backgroundColor: 'transparent',
                  }}
                >
                  Delete
                </div>
              </>
            )}
          </div>
        </>
      )}

      {/* New File / New Folder Modal */}
      {createTarget && (
        <div
          data-testid="explorer-create-modal-backdrop"
          onClick={closeCreateModal}
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
            data-testid="explorer-create-modal"
            role="dialog"
            aria-label={`New ${createTarget.kind === 'folder' ? 'Folder' : 'File'}`}
            onClick={e => e.stopPropagation()}
            style={{
              backgroundColor: colors.background,
              border: `1px solid ${colors.tabHover}`,
              borderRadius: '6px',
              padding: '20px 24px',
              minWidth: '340px',
              boxShadow: '0 6px 24px rgba(0,0,0,0.4)',
            }}
          >
            <div style={{ fontSize: '14px', color: colors.foreground, marginBottom: '8px', fontWeight: 600 }}>
              New {createTarget.kind === 'folder' ? 'Folder' : 'File'}
            </div>
            <div
              data-testid="explorer-create-parent-hint"
              title={createTarget.parentDirPath}
              style={{
                fontSize: '12px',
                color: colors.foreground,
                opacity: 0.7,
                marginBottom: '10px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              In folder: {getPathBasename(createTarget.parentDirPath)}
            </div>
            <input
              data-testid="explorer-create-input"
              autoFocus
              placeholder={createTarget.kind === 'folder' ? 'Folder name' : 'File name (e.g. notes.ts)'}
              value={createInput}
              onChange={e => {
                setCreateInput(e.target.value);
                if (createError) setCreateError(null);
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void submitExplorerCreate();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  closeCreateModal();
                }
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
            {createError && (
              <div
                data-testid="explorer-create-error"
                style={{ marginTop: '8px', fontSize: '12px', color: '#e06c75' }}
              >
                {createError}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
              <button
                type="button"
                data-testid="explorer-create-cancel"
                onClick={closeCreateModal}
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
                type="button"
                data-testid="explorer-create-submit"
                onClick={() => {
                  void submitExplorerCreate();
                }}
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
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Rename Modal for Explorer File/Folder */}
      {renameTarget && (
        <div
          data-testid="explorer-rename-modal-backdrop"
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
            data-testid="explorer-rename-modal"
            role="dialog"
            aria-label={`Rename ${renameTarget.isDirectory ? 'folder' : 'file'}`}
            onClick={e => e.stopPropagation()}
            style={{
              backgroundColor: colors.background,
              border: `1px solid ${colors.tabHover}`,
              borderRadius: '6px',
              padding: '20px 24px',
              minWidth: '340px',
              boxShadow: '0 6px 24px rgba(0,0,0,0.4)',
            }}
          >
            <div style={{ fontSize: '14px', color: colors.foreground, marginBottom: '12px', fontWeight: 600 }}>
              Rename {renameTarget.isDirectory ? 'folder' : 'file'}
            </div>
            <div style={{ fontSize: '12px', color: colors.foreground, opacity: 0.7, marginBottom: '8px' }}>
              Current name: {renameTarget.name}
            </div>
            <input
              data-testid="explorer-rename-input"
              autoFocus
              value={renameInput}
              onChange={e => {
                setRenameInput(e.target.value);
                if (renameError) setRenameError(null);
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  void submitExplorerRename();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  closeRenameModal();
                }
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
                data-testid="explorer-rename-error"
                style={{ marginTop: '8px', fontSize: '12px', color: '#e06c75' }}
              >
                {renameError}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '16px' }}>
              <button
                type="button"
                data-testid="explorer-rename-cancel"
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
                type="button"
                data-testid="explorer-rename-submit"
                onClick={() => {
                  void submitExplorerRename();
                }}
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

      {/* Delete Confirmation Modal for Explorer File/Folder */}
      {deleteTarget && (
        <div
          data-testid="explorer-delete-modal-backdrop"
          onClick={closeDeleteModal}
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
            data-testid="explorer-delete-modal"
            role="dialog"
            aria-label={`Delete ${deleteTarget.isDirectory ? 'folder' : 'file'}`}
            onClick={e => e.stopPropagation()}
            style={{
              backgroundColor: colors.background,
              border: `1px solid ${colors.tabHover}`,
              borderRadius: '6px',
              padding: '20px 24px',
              minWidth: '340px',
              maxWidth: '440px',
              boxShadow: '0 6px 24px rgba(0,0,0,0.4)',
            }}
          >
            <div style={{ fontSize: '14px', color: colors.foreground, marginBottom: '10px', fontWeight: 600 }}>
              Delete {deleteTarget.isDirectory ? 'Folder' : 'File'}
            </div>
            <div style={{ fontSize: '13px', color: colors.foreground, lineHeight: 1.5 }}>
              Are you sure you want to delete <strong>{deleteTarget.name}</strong>?
              {deleteTarget.isDirectory && ' All files and subfolders inside it will also be deleted.'}
            </div>
            {deleteError && (
              <div
                data-testid="explorer-delete-error"
                style={{ marginTop: '10px', fontSize: '12px', color: '#e06c75' }}
              >
                {deleteError}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '18px' }}>
              <button
                type="button"
                data-testid="explorer-delete-cancel"
                onClick={closeDeleteModal}
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
                type="button"
                data-testid="explorer-delete-confirm"
                onClick={() => {
                  void confirmExplorerDelete();
                }}
                style={{
                  padding: '6px 14px',
                  fontSize: '13px',
                  color: '#ffffff',
                  backgroundColor: '#d9534f',
                  border: '1px solid #d9534f',
                  borderRadius: '3px',
                  cursor: 'pointer',
                }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
};

export default FileExplorer;
