import React, { useEffect } from 'react';
import { useTheme } from './theme/ThemeContext';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenSettings?: () => void;
  onOpenShortcuts?: () => void;
}

interface HelpTopic {
  title: string;
  items: Array<{
    heading: string;
    description: string;
    code?: string;
  }>;
}

export const HELP_TOPICS: HelpTopic[] = [
  {
    title: 'Opening & Saving Files',
    items: [
      {
        heading: 'Open & Save',
        description:
          'Use Cmd/Ctrl + O to open one or more files, Cmd/Ctrl + S to save, and Cmd/Ctrl + Shift + Alt + S to save all modified tabs.',
      },
      {
        heading: 'Drag & Drop',
        description:
          'Drag one or multiple files from Finder / File Explorer anywhere into the editor window to open each file in its own tab.',
      },
      {
        heading: 'Automatic Session & Backup',
        description:
          'Open tabs and unsaved edits are automatically backed up and restored the next time you launch AwapiEditor.',
      },
    ],
  },
  {
    title: 'Command Line (CLI) & OS Integration',
    items: [
      {
        heading: 'Enable the "awed" CLI Command',
        description:
          'Go to Preferences (Cmd/Ctrl + ,) → General and enable the "awed" command to open files directly from any terminal:',
        code: 'awed notes.txt\nawed file1.txt file2.csv src/index.ts',
      },
      {
        heading: 'File Explorer Context Menu (Windows)',
        description:
          'On Windows, enable "Edit with AwapiEditor" in Preferences → General to open any file or folder from the right-click menu.',
      },
    ],
  },
  {
    title: 'Tabs, Split View & Compare',
    items: [
      {
        heading: 'Working with Tabs',
        description:
          'Double-click empty tab bar space (or press Cmd/Ctrl + N) for a new tab, middle-click a tab to close it, and right-click a tab for rename, path copy, per-tab theme, or pop-out options.',
      },
      {
        heading: 'Split View & Diff View',
        description:
          'Use the toolbar buttons on the right of the tab bar (or right-click a tab) to edit two files side-by-side or compare differences.',
      },
      {
        heading: 'CSV / TSV Spreadsheet Grid',
        description:
          'CSV and TSV files open in an interactive grid view by default, with a one-click toggle to switch between Grid View and Raw Text.',
      },
    ],
  },
  {
    title: 'Terminal, Search & Encoding',
    items: [
      {
        heading: 'Integrated & External Terminals',
        description:
          'Press Ctrl + ` to toggle the built-in terminal panel (or Ctrl + Shift + ` for a new shell), starting in the active file’s folder.',
      },
      {
        heading: 'Find Across Tabs & Text Operations',
        description:
          'Press Cmd/Ctrl + Shift + F to search or regex-replace across all open tabs. Use Edit → Line & Text Operations to sort, deduplicate, trim, or change case.',
      },
      {
        heading: 'Language, Encoding & Line Endings',
        description:
          'Click the indicators in the bottom-right status bar to change syntax highlighting, line endings (LF / CRLF), or file encoding.',
      },
    ],
  },
];

const HelpModal: React.FC<HelpModalProps> = ({
  isOpen,
  onClose,
  onOpenSettings,
  onOpenShortcuts,
}) => {
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
    maxWidth: '660px',
    width: '90%',
    maxHeight: '82vh',
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

  const codeStyle: React.CSSProperties = {
    display: 'block',
    fontFamily: 'monospace',
    fontSize: '12px',
    padding: '6px 10px',
    marginTop: '6px',
    backgroundColor: colors.tabBackground,
    border: `1px solid ${colors.tabHover}`,
    borderRadius: '4px',
    whiteSpace: 'pre-wrap',
    userSelect: 'text',
  };

  const secondaryBtnStyle: React.CSSProperties = {
    padding: '6px 12px',
    borderRadius: '4px',
    border: `1px solid ${colors.tabHover}`,
    backgroundColor: colors.tabBackground,
    color: colors.foreground,
    cursor: 'pointer',
    fontSize: '13px',
  };

  const primaryBtnStyle: React.CSSProperties = {
    padding: '6px 14px',
    borderRadius: '4px',
    border: `1px solid ${colors.tabBorder}`,
    backgroundColor: colors.tabBorder,
    color: '#fff',
    cursor: 'pointer',
    fontSize: '13px',
  };

  return (
    <div style={overlayStyle} onClick={onClose} data-testid="help-overlay">
      <div
        style={modalStyle}
        role="dialog"
        aria-label="Getting Started & Help"
        onClick={e => e.stopPropagation()}
        data-testid="help-modal"
      >
        <h2 style={{ margin: '0 0 6px', fontSize: '16px', fontWeight: 600 }}>
          Getting Started &amp; Quick Guide
        </h2>
        <p style={{ margin: '0 0 18px', fontSize: '13px', opacity: 0.75 }}>
          A high-level overview of how to get the most out of AwapiEditor.
        </p>

        {HELP_TOPICS.map(topic => (
          <div key={topic.title} style={{ marginBottom: '18px' }}>
            <div style={sectionLabelStyle}>{topic.title}</div>
            <div
              style={{
                border: `1px solid ${colors.tabHover}`,
                borderRadius: '6px',
                overflow: 'hidden',
              }}
            >
              {topic.items.map((item, idx) => (
                <div
                  key={item.heading}
                  style={{
                    padding: '9px 12px',
                    fontSize: '13px',
                    borderTop: idx === 0 ? 'none' : `1px solid ${colors.tabHover}`,
                  }}
                >
                  <div style={{ fontWeight: 600, marginBottom: '2px' }}>{item.heading}</div>
                  <div style={{ fontSize: '12px', opacity: 0.8, lineHeight: 1.45 }}>
                    {item.description}
                  </div>
                  {item.code && <code style={codeStyle}>{item.code}</code>}
                </div>
              ))}
            </div>
          </div>
        ))}

        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '8px',
            borderTop: `1px solid ${colors.tabHover}`,
            paddingTop: '16px',
          }}
        >
          <div style={{ display: 'flex', gap: '8px' }}>
            {onOpenShortcuts && (
              <button
                style={secondaryBtnStyle}
                onClick={() => {
                  onClose();
                  onOpenShortcuts();
                }}
                data-testid="help-open-shortcuts-btn"
              >
                Keyboard Shortcuts…
              </button>
            )}
            {onOpenSettings && (
              <button
                style={secondaryBtnStyle}
                onClick={() => {
                  onClose();
                  onOpenSettings();
                }}
                data-testid="help-open-settings-btn"
              >
                Preferences…
              </button>
            )}
          </div>
          <button style={primaryBtnStyle} onClick={onClose} data-testid="help-close-btn">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default HelpModal;
