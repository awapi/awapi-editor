import React, { useEffect } from 'react';
import { useTheme } from './theme/ThemeContext';

interface ShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutItem {
  action: string;
  shortcut: string;
}

interface ShortcutSection {
  title: string;
  items: ShortcutItem[];
}

const SHORTCUT_SECTIONS: ShortcutSection[] = [
  {
    title: 'File & Tabs',
    items: [
      { action: 'New Tab', shortcut: 'Cmd/Ctrl + N' },
      { action: 'Open File', shortcut: 'Cmd/Ctrl + O' },
      { action: 'Save', shortcut: 'Cmd/Ctrl + S' },
      { action: 'Save As', shortcut: 'Cmd/Ctrl + Shift + S' },
      { action: 'Save All', shortcut: 'Cmd/Ctrl + Shift + Alt + S' },
      { action: 'Close Active Tab', shortcut: 'Cmd/Ctrl + W' },
      { action: 'Reopen Closed Tab', shortcut: 'Cmd/Ctrl + Shift + T' },
      { action: 'Pop Out Tab to New Window', shortcut: 'Cmd/Ctrl + Shift + N' },
      { action: 'Move Pop-out Back to Main Window', shortcut: 'Cmd/Ctrl + Shift + M' },
      { action: 'Print Preview', shortcut: 'Cmd/Ctrl + Shift + P' },
      { action: 'Print', shortcut: 'Cmd/Ctrl + P' },
      { action: 'Preferences', shortcut: 'Cmd/Ctrl + ,' },
    ],
  },
  {
    title: 'Editing & View',
    items: [
      { action: 'Find', shortcut: 'Cmd/Ctrl + F' },
      { action: 'Replace', shortcut: 'Cmd/Ctrl + H' },
      { action: 'Find in All Open Tabs', shortcut: 'Cmd/Ctrl + Shift + F' },
      { action: 'Go to Line', shortcut: 'Ctrl + G' },
      { action: 'Find Next / Previous', shortcut: 'F3 / Shift + F3 (macOS: Cmd + G / Cmd + Shift + G)' },
      { action: 'Toggle Line Comment', shortcut: 'Cmd/Ctrl + /' },
      { action: 'Format Document', shortcut: 'Shift + Alt + F' },
      { action: 'Show All Commands (Command Palette)', shortcut: 'F1' },
      { action: 'Zoom In / Out / Reset', shortcut: 'Cmd/Ctrl + = / - / 0' },
      { action: 'Keyboard Shortcuts Reference', shortcut: 'Shift + F1' },
    ],
  },
  {
    title: 'Mouse & Tab Bar Tips',
    items: [
      { action: 'Close any tab quickly', shortcut: 'Middle-Click Tab' },
      { action: 'Create a new tab', shortcut: 'Double-Click Empty Tab Bar' },
      { action: 'Reorder tabs', shortcut: 'Drag & Drop Tab' },
      { action: 'Rename, Theme, or Close Others', shortcut: 'Right-Click Tab' },
    ],
  },
];

const ShortcutsModal: React.FC<ShortcutsModalProps> = ({ isOpen, onClose }) => {
  const { colors } = useTheme();

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const overlayStyle: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  };

  const modalStyle: React.CSSProperties = {
    backgroundColor: colors.background,
    color: colors.foreground,
    border: `1px solid ${colors.tabHover}`,
    borderRadius: '8px',
    padding: '24px',
    minWidth: '480px',
    maxWidth: '640px',
    width: '90%',
    maxHeight: '80vh',
    overflowY: 'auto',
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
  };

  const sectionLabelStyle: React.CSSProperties = {
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    opacity: 0.65,
    marginBottom: '8px',
    fontWeight: 600,
  };

  const kbdStyle: React.CSSProperties = {
    fontFamily: 'monospace',
    fontSize: '12px',
    padding: '2px 8px',
    backgroundColor: colors.tabBackground,
    border: `1px solid ${colors.tabHover}`,
    borderRadius: '4px',
    whiteSpace: 'nowrap',
  };

  const btnStyle: React.CSSProperties = {
    padding: '6px 14px',
    borderRadius: '4px',
    border: `1px solid ${colors.tabBorder}`,
    backgroundColor: colors.tabBorder,
    color: '#fff',
    cursor: 'pointer',
    fontSize: '13px',
  };

  return (
    <div style={overlayStyle} onClick={onClose} data-testid="shortcuts-overlay">
      <div
        style={modalStyle}
        role="dialog"
        aria-label="Keyboard Shortcuts"
        onClick={e => e.stopPropagation()}
        data-testid="shortcuts-modal"
      >
        <h2 style={{ margin: '0 0 18px', fontSize: '16px', fontWeight: 600 }}>
          Keyboard Shortcuts & Tips
        </h2>

        {SHORTCUT_SECTIONS.map(section => (
          <div key={section.title} style={{ marginBottom: '20px' }}>
            <div style={sectionLabelStyle}>{section.title}</div>
            <div
              style={{
                border: `1px solid ${colors.tabHover}`,
                borderRadius: '6px',
                overflow: 'hidden',
              }}
            >
              {section.items.map((item, idx) => (
                <div
                  key={item.action}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '7px 12px',
                    fontSize: '13px',
                    borderTop: idx === 0 ? 'none' : `1px solid ${colors.tabHover}`,
                  }}
                >
                  <span>{item.action}</span>
                  <kbd style={kbdStyle}>{item.shortcut}</kbd>
                </div>
              ))}
            </div>
          </div>
        ))}

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            borderTop: `1px solid ${colors.tabHover}`,
            paddingTop: '16px',
          }}
        >
          <button style={btnStyle} onClick={onClose} data-testid="shortcuts-close-btn">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ShortcutsModal;
