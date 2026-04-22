import React, { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { X } from 'lucide-react';
import { useTheme } from './theme/ThemeContext';
import { useSessionPersistence, loadSession, SessionTab } from './useSessionPersistence';
import LanguageSelector from './LanguageSelector';
import LineEndingSelector from './LineEndingSelector';
import type { EolKind } from './lineEndings';
import { inferLanguageFromFilename } from './languages';

interface Tab {
  id: string;
  title: string;
  filePath: string | null;
  content: string;
  isDirty?: boolean;
  /** User-selected Monaco language id. When undefined, the language is
   *  inferred from the filename extension (or "plaintext" if none). */
  language?: string;
  /** Line-ending sequence used when saving the tab's content. Defaults to LF. */
  eol?: EolKind;
}

const App: React.FC = () => {
  const { currentTheme, colors, importThemeFromMain } = useTheme();
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [wordWrap, setWordWrap] = useState<boolean>(true);
  const editorRef = React.useRef<any>(null);

  const addNewTab = () => {
    const id = `tab-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newTab: Tab = {
      id,
      title: 'Untitled',
      filePath: null,
      content: '',
      isDirty: false,
      eol: 'LF'
    };
    setTabs(prev => [...prev, newTab]);
    setActiveTabId(id);
  };

  const tabsRef = React.useRef(tabs);
  const activeTabIdRef = React.useRef(activeTabId);
  // Prevents the async init from running twice in React StrictMode
  const initDoneRef = React.useRef(false);

  useEffect(() => {
    tabsRef.current = tabs;
    activeTabIdRef.current = activeTabId;
  }, [tabs, activeTabId]);

  // Auto-save session whenever tabs or active tab changes
  useSessionPersistence(tabs, activeTabId);

  useEffect(() => {
    // Session restore is a one-shot operation: guard it so React StrictMode's
    // double-invoke in development doesn't create duplicate tabs. Listener
    // wiring, on the other hand, MUST run on every effect mount (and clean up
    // on unmount) – otherwise StrictMode's mount → cleanup → mount sequence
    // leaves the app with no IPC or drag listeners attached in dev builds.
    if (!initDoneRef.current) {
      initDoneRef.current = true;

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
                      if (fileData) return { ...saved, content: fileData.content, eol: fileData.eol };
                    } catch {
                      // File no longer exists – fall through and use stored content
                    }
                  }
                  return { ...saved, eol: saved.eol ?? 'LF' };
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
      })();
    }

    // Listen to IPC
    const w = window as any;
    if (w.electronAPI) {
      w.electronAPI.onNewFile(() => {
        addNewTab();
      });

      w.electronAPI.onOpenFile(async () => {
        try {
          const result = await w.electronAPI.openFileDialog();
          if (result) {
            const fileName = result.filePath.split(/[\\/]/).pop() || result.filePath;
            
            // Check if file already open
            const existingTab = tabsRef.current.find((t: Tab) => t.filePath === result.filePath);
            if(existingTab) {
              setActiveTabId(existingTab.id);
              return;
            }

            const id = Date.now().toString();
            setTabs(prev => [...prev, {
              id,
              title: fileName,
              filePath: result.filePath,
              content: result.content,
              isDirty: false,
              eol: result.eol
            }]);
            setActiveTabId(id);
          }
        } catch(e) { console.error('Error opening file', e); }
      });

      w.electronAPI.onSaveFile(async () => {
        const active = activeTabIdRef.current;
        if (!active) return;
        const currentTab = tabsRef.current.find((t: Tab) => t.id === active);
        if(!currentTab) return;

        try {
          const savedPath = await w.electronAPI.saveFileDialog(
            currentTab.filePath,
            currentTab.content,
            currentTab.eol ?? 'LF'
          );
          if (savedPath) {
            const fileName = savedPath.split(/[\\/]/).pop() || savedPath;
            setTabs(prev => prev.map(t => 
              t.id === active 
                ? { ...t, filePath: savedPath, title: fileName, isDirty: false }
                : t
            ));
          }
        } catch(e) { console.error('Error saving file', e); }
      });

      w.electronAPI.onSaveAsFile(async () => {
        const active = activeTabIdRef.current;
        if (!active) return;
        const currentTab = tabsRef.current.find((t: Tab) => t.id === active);
        if(!currentTab) return;

        try {
          const savedPath = await w.electronAPI.saveFileDialog(
            null,
            currentTab.content,
            currentTab.eol ?? 'LF'
          );
          if (savedPath) {
            const fileName = savedPath.split(/[\\/]/).pop() || savedPath;
            setTabs(prev => prev.map(t => 
              t.id === active 
                ? { ...t, filePath: savedPath, title: fileName, isDirty: false }
                : t
            ));
          }
        } catch(e) { console.error('Error saving file', e); }
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

      w.electronAPI.onFormat(() => {
        if (editorRef.current) {
          editorRef.current.getAction('editor.action.formatDocument').run();
        }
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
        
        for (let i = 0; i < e.dataTransfer.files.length; i++) {
          const file = e.dataTransfer.files[i];
          try {
            const filePath = w.electronAPI.getPathForFile(file);
            if (!filePath) continue;

            const existingTab = tabsRef.current.find((t: Tab) => t.filePath === filePath);
            if (existingTab) {
              setActiveTabId(existingTab.id);
              continue;
            }

            const result = await w.electronAPI.readFile(filePath);
            if (result) {
              const fileName = file.name || result.filePath.split(/[\\/]/).pop();
              const id = `tab-${Date.now()}-${i}`;
              setTabs(prev => [...prev, {
                id,
                title: fileName,
                filePath: result.filePath,
                content: result.content,
                isDirty: false,
                eol: result.eol
              }]);
              setActiveTabId(id);
            }
          } catch (err) {
            console.error('Failed to open dropped file', err);
          }
        }
      };

      window.addEventListener('dragover', preventDefault, true);
      window.addEventListener('dragenter', preventDefault, true);
      window.addEventListener('drop', handleGlobalDrop, true);

      // Cleanup on unmount
      return () => {
        w.electronAPI.removeListeners();
        window.removeEventListener('dragover', preventDefault, true);
        window.removeEventListener('dragenter', preventDefault, true);
        window.removeEventListener('drop', handleGlobalDrop, true);
      };
    }
  }, []); // Run ONCE


  const handleEditorChange = (value: string | undefined) => {
    if(!activeTabId || typeof value === 'undefined') return;
    
    setTabs(prev => prev.map(t => 
      t.id === activeTabId 
        ? { ...t, content: value, isDirty: true }
        : t
    ));
  };

  const closeTab = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();

    const tab = tabs.find(t => t.id === id);
    if (!tab) return;

    if (tab.isDirty) {
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

      if (choice === 'cancel') return;

      if (choice === 'save') {
        if (!w.electronAPI?.saveFileDialog) return;
        try {
          const savedPath = await w.electronAPI.saveFileDialog(tab.filePath, tab.content, tab.eol ?? 'LF');
          if (!savedPath) return; // Save dialog cancelled – abort close
        } catch (err) {
          console.error('Error saving file during close', err);
          return;
        }
      }
    }

    const newTabs = tabs.filter(t => t.id !== id);
    setTabs(newTabs);

    if (activeTabId === id) {
      setActiveTabId(newTabs.length > 0 ? newTabs[newTabs.length - 1].id : null);
    }
  };

  const activeTab = tabs.find(t => t.id === activeTabId);

  const inferredLanguage = activeTab ? inferLanguageFromFilename(activeTab.filePath ?? activeTab.title) : 'plaintext';
  const effectiveLanguage = activeTab?.language ?? inferredLanguage;
  const isLanguageInferred = !activeTab?.language;

  const handleLanguageChange = (languageId: string) => {
    if (!activeTabId) return;
    setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, language: languageId } : t));
  };

  const handleEolChange = (eol: EolKind) => {
    if (!activeTabId) return;
    setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, eol, isDirty: true } : t));
  };

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
      {/* Tab Bar: outer row never scrolls so the right-side action group stays pinned. */}
      <div style={{ display: 'flex', backgroundColor: colors.tabBackground, flexShrink: 0 }}>
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
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, index)}
              onClick={() => setActiveTabId(tab.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                padding: '8px 16px',
                backgroundColor: activeTabId === tab.id ? colors.tabActiveBackground : colors.tabBackground,
                borderTop: activeTabId === tab.id ? `2px solid ${colors.tabBorder}` : '2px solid transparent',
                cursor: 'pointer',
                borderRight: `1px solid ${colors.tabHover}`,
                minWidth: '120px',
                flexShrink: 0,
                userSelect: 'none',
                color: tab.isDirty ? '#e2c08d' : colors.foreground
              }}
            >
              <span style={{ flexGrow: 1, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                {tab.title} {tab.isDirty && '*'}
              </span>
              <X
                size={14}
                style={{ marginLeft: 8, opacity: 0.6, flexShrink: 0 }}
                onClick={(e) => closeTab(e, tab.id)}
                onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.6')}
              />
            </div>
          ))}
          {/* Add Tab Button */}
          <div
            onClick={addNewTab}
            style={{ padding: '8px', cursor: 'pointer', color: colors.foreground, display: 'flex', alignItems: 'center', flexShrink: 0 }}
          >
            +
          </div>
          {/* Empty space – double-click to open a new tab */}
          <div
            data-testid="tab-bar-spacer"
            style={{ flexGrow: 1, minWidth: '24px' }}
            onDoubleClick={addNewTab}
          />
        </div>
        {/* Action group: pinned to the right, never scrolls with tabs. */}
        <div style={{ display: 'flex', alignItems: 'center', paddingRight: '8px', flexShrink: 0 }}>
          <button
            data-testid="word-wrap-toggle"
            aria-label={wordWrap ? 'Disable Word Wrap' : 'Enable Word Wrap'}
            aria-pressed={wordWrap}
            onClick={() => setWordWrap(prev => !prev)}
            title={wordWrap ? 'Disable Word Wrap' : 'Enable Word Wrap'}
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
        </div>
      </div>

      {/* Editor Area */}
      <div style={{ flexGrow: 1, overflow: 'hidden' }}>
        {activeTab ? (
          <Editor
            height="100%"
            theme={currentTheme === 'light' ? 'light' : 'vs-dark'} /* Monaco respects custom definitions elsewhere if we register them */
            path={activeTab.title} /* Monaco uses path to infer language (e.g. file.json -> json) */
            language={effectiveLanguage}
            value={activeTab.content}
            onChange={handleEditorChange}
            onMount={(editor) => {
              editorRef.current = editor;
            }}
            options={{
              minimap: { enabled: true },
              fontSize: 14,
              wordWrap: wordWrap ? 'on' : 'off',
              formatOnType: true,
              formatOnPaste: true,
              padding: { top: 6 },
              lineNumbersMinChars: 6,
            }}
          />
        ) : (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: '#666' }}>
            <p>No tabs open. Press Cmd/Ctrl+N to create a new file.</p>
          </div>
        )}
      </div>

      {/* Status Bar */}
      <div
        data-testid="status-bar"
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          padding: '4px 8px',
          borderTop: `1px solid ${colors.tabHover}`,
          backgroundColor: colors.tabBackground,
          flexShrink: 0,
        }}
      >
        {activeTab && (
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
        {activeTab && (
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
      </div>
    </div>
  );
};

export default App;
