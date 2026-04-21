import React, { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { X } from 'lucide-react';
import { useTheme } from './theme/ThemeContext';

interface Tab {
  id: string;
  title: string;
  filePath: string | null;
  content: string;
  isDirty?: boolean;
}

const App: React.FC = () => {
  const { currentTheme, colors, importThemeFromMain } = useTheme();
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  const addNewTab = () => {
    const id = Date.now().toString();
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

  useEffect(() => {
    tabsRef.current = tabs;
    activeTabIdRef.current = activeTabId;
  }, [tabs, activeTabId]);

  useEffect(() => {
    // Initial tab
    addNewTab();

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

      // Cleanup on unmount
      return () => {
        w.electronAPI.removeListeners();
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

  const closeTab = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    // Simplified: No dirtiness check for time concerns
    const newTabs = tabs.filter(t => t.id !== id);
    setTabs(newTabs);
    
    if (activeTabId === id) {
      setActiveTabId(newTabs.length > 0 ? newTabs[newTabs.length - 1].id : null);
    }
  };

  const activeTab = tabs.find(t => t.id === activeTabId);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: colors.background, color: colors.foreground }}>
      {/* Tab Bar */}
      <div style={{ display: 'flex', backgroundColor: colors.tabBackground, overflowX: 'auto', flexShrink: 0 }}>
        {tabs.map(tab => (
          <div
            key={tab.id}
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
      </div>

      {/* Editor Area */}
      <div style={{ flexGrow: 1, overflow: 'hidden' }}>
        {activeTab ? (
          <Editor
            height="100%"
            theme={currentTheme === 'light' ? 'light' : 'vs-dark'} /* Monaco respects custom definitions elsewhere if we register them */
            path={activeTab.title} /* Monaco uses path to infer language (e.g. file.json -> json) */
            value={activeTab.content}
            onChange={handleEditorChange}
            options={{
              minimap: { enabled: true },
              fontSize: 14,
              wordWrap: 'on',
              formatOnType: true,
              formatOnPaste: true,
            }}
          />
        ) : (
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: '#666' }}>
            <p>No tabs open. Press Cmd/Ctrl+N to create a new file.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
