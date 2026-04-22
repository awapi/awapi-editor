import React, { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { X } from 'lucide-react';
import { useTheme } from './theme/ThemeContext';
import { useSessionPersistence, loadSession, SessionTab } from './useSessionPersistence';
import LanguageSelector from './LanguageSelector';
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
      isDirty: false
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
                      if (fileData) return { ...saved, content: fileData.content };
                    } catch {
                      // File no longer exists – fall through and use stored content
                    }
                  }
                  return { ...saved };
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
              isDirty: false
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
          const savedPath = await w.electronAPI.saveFileDialog(currentTab.filePath, currentTab.content);
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
          const savedPath = await w.electronAPI.saveFileDialog(null, currentTab.content);
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
                isDirty: false
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
          const savedPath = await w.electronAPI.saveFileDialog(tab.filePath, tab.content);
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: colors.background, color: colors.foreground }}>
      {/* Tab Bar */}
      <div style={{ display: 'flex', backgroundColor: colors.tabBackground, overflowX: 'auto', flexShrink: 0 }}>
        {tabs.map((tab, index) => (
          <div
            key={tab.id}
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
              userSelect: 'none',
              color: tab.isDirty ? '#e2c08d' : colors.foreground
            }}
          >
            <span style={{ flexGrow: 1, whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
              {tab.title} {tab.isDirty && '*'}
            </span>
            <X 
              size={14} 
              style={{ marginLeft: 8, opacity: 0.6 }} 
              onClick={(e) => closeTab(e, tab.id)}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.6')}
            />
          </div>
        ))}
        {/* Add Tab Button */}
        <div 
          onClick={addNewTab}
          style={{ padding: '8px', cursor: 'pointer', color: colors.foreground, display: 'flex', alignItems: 'center' }}
        >
          +
        </div>
        {/* Empty space – double-click to open a new tab */}
        <div
          data-testid="tab-bar-spacer"
          style={{ flexGrow: 1 }}
          onDoubleClick={addNewTab}
        />
        {/* Word Wrap Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', paddingRight: '8px' }}>
          <button
            data-testid="word-wrap-toggle"
            onClick={() => setWordWrap(prev => !prev)}
            title={wordWrap ? 'Disable Word Wrap' : 'Enable Word Wrap'}
            style={{
              padding: '2px 10px',
              fontSize: '12px',
              cursor: 'pointer',
              borderRadius: '4px',
              border: `1px solid ${colors.tabHover}`,
              backgroundColor: wordWrap ? colors.tabActiveBackground : colors.tabBackground,
              color: wordWrap ? colors.foreground : colors.foreground,
              opacity: wordWrap ? 1 : 0.55,
              whiteSpace: 'nowrap',
            }}
          >
            Word Wrap
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
