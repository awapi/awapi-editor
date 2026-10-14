import React, { useState, useEffect } from 'react';
import { useTheme } from './theme/ThemeContext';
import type { ThemeType, ThemeColors } from './theme/ThemeContext';
import type { TerminalChoice, TerminalChoices, TerminalPreference } from '../../shared/terminal';
import { detectConsoleFonts, notifyTerminalFontChanged } from './terminalFonts';

const CUSTOM_OPTION = '__custom__';

interface TerminalPreferenceFieldProps {
  label: string;
  description: string;
  choices: TerminalChoice[];
  autoLabel: string | null;
  value: TerminalPreference;
  customPlaceholder: string;
  testId: string;
  colors: ThemeColors;
  onChange: (value: TerminalPreference) => void;
}

/**
 * Dropdown for a terminal preference: Automatic, a detected choice, or a
 * custom executable/app typed by the user (saved on blur or Enter).
 */
export const TerminalPreferenceField: React.FC<TerminalPreferenceFieldProps> = ({
  label,
  description,
  choices,
  autoLabel,
  value,
  customPlaceholder,
  testId,
  colors,
  onChange,
}) => {
  const isCustomValue = !!value && !choices.some(c => c.id === value);
  const [customMode, setCustomMode] = useState(isCustomValue);
  const [customText, setCustomText] = useState(isCustomValue ? value ?? '' : '');
  const selectValue = customMode ? CUSTOM_OPTION : value ?? '';

  const inputStyle: React.CSSProperties = {
    fontSize: '13px',
    padding: '5px 8px',
    borderRadius: '4px',
    border: `1px solid ${colors.tabHover}`,
    backgroundColor: colors.tabBackground,
    color: colors.foreground,
    width: '100%',
    boxSizing: 'border-box',
  };

  const commitCustom = () => {
    const trimmed = customText.trim();
    if (trimmed !== (value ?? '')) onChange(trimmed || null);
  };

  return (
    <div style={{ marginBottom: '12px' }}>
      <label htmlFor={testId} style={{ display: 'block', fontSize: '13px', marginBottom: '4px' }}>{label}</label>
      <select
        id={testId}
        data-testid={testId}
        value={selectValue}
        onChange={e => {
          const next = e.target.value;
          if (next === CUSTOM_OPTION) {
            setCustomMode(true);
            return;
          }
          setCustomMode(false);
          onChange(next || null);
        }}
        style={inputStyle}
      >
        <option value="">{autoLabel ? `Automatic (${autoLabel})` : 'Automatic'}</option>
        {choices.map(choice => (
          <option key={choice.id} value={choice.id} title={choice.detail}>
            {choice.label}
          </option>
        ))}
        <option value={CUSTOM_OPTION}>Custom…</option>
      </select>
      {customMode && (
        <input
          data-testid={`${testId}-custom`}
          type="text"
          value={customText}
          placeholder={customPlaceholder}
          onChange={e => setCustomText(e.target.value)}
          onBlur={commitCustom}
          onKeyDown={e => {
            if (e.key === 'Enter') commitCustom();
          }}
          style={{ ...inputStyle, marginTop: '6px', fontFamily: 'monospace', fontSize: '12px' }}
        />
      )}
      <p style={{ fontSize: '12px', opacity: 0.6, margin: '4px 0 0' }}>{description}</p>
    </div>
  );
};

function customExternalPlaceholder(platform: string): string {
  if (platform === 'darwin') return 'App name or path, e.g. Hyper or /Applications/Hyper.app';
  if (platform === 'win32') return 'Path to a terminal, e.g. C:\\Program Files\\Alacritty\\alacritty.exe';
  return 'Terminal command or path, e.g. foot';
}

function customShellPlaceholder(platform: string): string {
  if (platform === 'win32') return 'Path to a shell, e.g. C:\\msys64\\usr\\bin\\bash.exe';
  return 'Shell command or path, e.g. /opt/homebrew/bin/nu';
}

export type SettingsTabId = 'appearance' | 'terminal' | 'backup';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: SettingsTabId;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, initialTab = 'appearance' }) => {
  const { colors, currentTheme, setTheme } = useTheme();
  const [activeTab, setActiveTab] = useState<SettingsTabId>(initialTab);
  const [sessionDir, setSessionDir] = useState<string | null>(null);
  const [defaultDir, setDefaultDir] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [terminalChoices, setTerminalChoices] = useState<TerminalChoices | null>(null);
  const [externalTerminal, setExternalTerminal] = useState<TerminalPreference>(null);
  const [integratedShell, setIntegratedShell] = useState<TerminalPreference>(null);
  const [terminalFont, setTerminalFont] = useState<string | null>(null);
  const [consoleFonts, setConsoleFonts] = useState<string[]>([]);

  useEffect(() => {
    if (!isOpen) return;
    setActiveTab(initialTab);
    const w = window as any;
    if (!w.electronAPI) return;

    setLoading(true);
    Promise.all([
      w.electronAPI.loadSettings() as Promise<{
        sessionDir: string | null;
        externalTerminal?: TerminalPreference;
        integratedShell?: TerminalPreference;
        terminalFont?: string | null;
      }>,
      w.electronAPI.getDefaultSessionDir() as Promise<string>,
      (w.electronAPI.getTerminalChoices?.() as Promise<TerminalChoices> | undefined)?.catch(() => null) ?? null,
      detectConsoleFonts().catch(() => [] as string[]),
    ]).then(([settings, defDir, choices, fonts]) => {
      setSessionDir(settings.sessionDir);
      setExternalTerminal(settings.externalTerminal ?? null);
      setIntegratedShell(settings.integratedShell ?? null);
      setTerminalFont(settings.terminalFont ?? null);
      setDefaultDir(defDir);
      setTerminalChoices(choices);
      setConsoleFonts(fonts);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  const w = window as any;
  const resolvedDir = sessionDir || defaultDir;

  const handleChangeDir = async () => {
    if (!w.electronAPI) return;
    const picked = await w.electronAPI.openDirDialog() as string | null;
    if (!picked) return;
    await w.electronAPI.saveSettings({ sessionDir: picked, theme: currentTheme });
    setSessionDir(picked);
  };

  const handleResetDefault = async () => {
    if (!w.electronAPI) return;
    await w.electronAPI.saveSettings({ sessionDir: null, theme: currentTheme });
    setSessionDir(null);
  };

  const handleThemeChange = async (theme: ThemeType) => {
    setTheme(theme);
    if (w.electronAPI) {
      await w.electronAPI.saveSettings({ sessionDir, theme });
    }
  };

  const handleExternalTerminalChange = async (value: TerminalPreference) => {
    setExternalTerminal(value);
    await w.electronAPI?.saveSettings({ externalTerminal: value });
  };

  const handleIntegratedShellChange = async (value: TerminalPreference) => {
    setIntegratedShell(value);
    await w.electronAPI?.saveSettings({ integratedShell: value });
  };

  const handleTerminalFontChange = async (value: string | null) => {
    setTerminalFont(value);
    notifyTerminalFontChanged(value);
    await w.electronAPI?.saveSettings({ terminalFont: value });
  };

  const fontOptions =
    terminalFont && !consoleFonts.includes(terminalFont)
      ? [terminalFont, ...consoleFonts]
      : consoleFonts;

  const handleOpenInExplorer = async () => {
    if (!w.electronAPI) return;
    await w.electronAPI.openInExplorer(resolvedDir);
  };

  // Overlay
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
    maxHeight: '90vh',
    display: 'flex',
    flexDirection: 'column',
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
  };

  // Fixed height for the tab content area so switching tabs (e.g. the taller
  // Terminal tab vs. the shorter Appearance tab) doesn't resize/reposition the modal.
  const TAB_CONTENT_HEIGHT = '400px';

  const tabContentStyle: React.CSSProperties = {
    height: TAB_CONTENT_HEIGHT,
    maxHeight: 'calc(90vh - 160px)',
    overflowY: 'auto',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    opacity: 0.6,
    marginBottom: '6px',
  };

  const pathBoxStyle: React.CSSProperties = {
    fontFamily: 'monospace',
    fontSize: '12px',
    padding: '8px 10px',
    backgroundColor: colors.tabBackground,
    border: `1px solid ${colors.tabHover}`,
    borderRadius: '4px',
    flex: '1 1 auto',
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    color: colors.foreground,
    cursor: 'default',
    userSelect: 'text',
  };

  const btnStyle = (primary = false): React.CSSProperties => ({
    padding: '6px 14px',
    borderRadius: '4px',
    border: `1px solid ${colors.tabBorder}`,
    backgroundColor: primary ? colors.tabBorder : colors.tabBackground,
    color: primary ? '#fff' : colors.foreground,
    cursor: 'pointer',
    fontSize: '13px',
    flexShrink: 0,
    whiteSpace: 'nowrap',
  });

  const groupCardStyle: React.CSSProperties = {
    border: `1px solid ${colors.tabHover}`,
    borderRadius: '6px',
    padding: '14px 16px',
    marginBottom: '16px',
    backgroundColor: colors.tabBackground,
  };

  const inputInCardStyle: React.CSSProperties = {
    fontSize: '13px',
    padding: '5px 8px',
    borderRadius: '4px',
    border: `1px solid ${colors.tabHover}`,
    backgroundColor: colors.background,
    color: colors.foreground,
    width: '100%',
    boxSizing: 'border-box',
  };

  const themeOptions: { value: ThemeType; label: string }[] = [
    { value: 'dark', label: 'Dark' },
    { value: 'light', label: 'Light' },
  ];

  const tabs: { id: SettingsTabId; label: string }[] = [
    { id: 'appearance', label: 'Appearance' },
    ...(terminalChoices ? [{ id: 'terminal' as const, label: 'Terminal' }] : []),
    { id: 'backup', label: 'Backup' },
  ];

  const resolvedActiveTab: SettingsTabId =
    activeTab === 'terminal' && !terminalChoices ? 'appearance' : activeTab;

  return (
    <div style={overlayStyle} data-testid="settings-overlay">
      <div style={modalStyle} onClick={e => e.stopPropagation()} data-testid="settings-modal">
        <h2 style={{ margin: '0 0 14px', fontSize: '16px', fontWeight: 600 }}>Preferences</h2>

        {loading ? (
          <p style={{ opacity: 0.6 }}>Loading…</p>
        ) : (
          <>
            {/* Tab Bar */}
            <div
              role="tablist"
              aria-label="Preferences sections"
              data-testid="settings-tabs"
              style={{
                display: 'flex',
                gap: '4px',
                borderBottom: `1px solid ${colors.tabHover}`,
                marginBottom: '18px',
                flexShrink: 0,
              }}
            >
              {tabs.map(tab => {
                const isActive = resolvedActiveTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    role="tab"
                    id={`settings-tab-${tab.id}`}
                    aria-selected={isActive}
                    aria-controls={`settings-panel-${tab.id}`}
                    data-testid={`settings-tab-${tab.id}`}
                    onClick={() => setActiveTab(tab.id)}
                    style={{
                      padding: '8px 16px',
                      fontSize: '13px',
                      fontWeight: isActive ? 600 : 400,
                      color: colors.foreground,
                      opacity: isActive ? 1 : 0.7,
                      backgroundColor: 'transparent',
                      border: 'none',
                      borderBottom: isActive
                        ? `2px solid ${colors.tabBorder}`
                        : '2px solid transparent',
                      marginBottom: '-1px',
                      cursor: 'pointer',
                    }}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>

            {/* Tab Content (fixed height so switching tabs doesn't resize the modal) */}
            <div style={tabContentStyle} data-testid="settings-tab-content">
            {/* Appearance Tab */}
            {resolvedActiveTab === 'appearance' && (
              <div
                role="tabpanel"
                id="settings-panel-appearance"
                aria-labelledby="settings-tab-appearance"
                data-testid="settings-appearance-section"
              >
                <div style={groupCardStyle} data-testid="settings-group-theme">
                  <div style={labelStyle}>Theme</div>
                  <p style={{ fontSize: '12px', opacity: 0.7, margin: '0 0 10px' }}>
                    Choose the color theme for the editor interface and syntax highlighting.
                  </p>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    {themeOptions.map(opt => (
                      <button
                        key={opt.value}
                        data-testid={`theme-btn-${opt.value}`}
                        aria-pressed={currentTheme === opt.value}
                        onClick={() => handleThemeChange(opt.value)}
                        style={{
                          ...btnStyle(currentTheme === opt.value),
                          minWidth: '72px',
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Terminal Tab */}
            {resolvedActiveTab === 'terminal' && terminalChoices && (
              <div
                role="tabpanel"
                id="settings-panel-terminal"
                aria-labelledby="settings-tab-terminal"
                data-testid="settings-terminal-section"
              >
                <div style={groupCardStyle} data-testid="settings-group-integrated-terminal">
                  <div style={labelStyle}>Integrated Terminal</div>
                  <TerminalPreferenceField
                    label="Integrated terminal shell"
                    description="Shell used by the terminal panel (Ctrl+`). Applies to new terminals."
                    choices={terminalChoices.shells}
                    autoLabel={terminalChoices.autoShell}
                    value={integratedShell}
                    customPlaceholder={customShellPlaceholder(terminalChoices.platform)}
                    testId="settings-integrated-shell"
                    colors={{ ...colors, tabBackground: colors.background }}
                    onChange={handleIntegratedShellChange}
                  />
                  <div>
                    <label htmlFor="settings-terminal-font" style={{ display: 'block', fontSize: '13px', marginBottom: '4px' }}>
                      Integrated terminal font
                    </label>
                    <select
                      id="settings-terminal-font"
                      data-testid="settings-terminal-font"
                      value={terminalFont ?? ''}
                      onChange={e => void handleTerminalFontChange(e.target.value || null)}
                      style={inputInCardStyle}
                    >
                      <option value="">Default</option>
                      {fontOptions.map(font => (
                        <option key={font} value={font}>
                          {font}
                        </option>
                      ))}
                    </select>
                    <p style={{ fontSize: '12px', opacity: 0.6, margin: '4px 0 0' }}>
                      Console (fixed-width) font used by the integrated terminal. Pick a Nerd Font or Powerline font for prompt icons.
                    </p>
                  </div>
                </div>

                <div style={groupCardStyle} data-testid="settings-group-external-terminal">
                  <div style={labelStyle}>External Terminal</div>
                  <div style={{ marginBottom: '-12px' }}>
                    <TerminalPreferenceField
                      label="External terminal"
                      description={'Application used by \u201cOpen in External Terminal\u201d in the tab menu.'}
                      choices={terminalChoices.externalTerminals}
                      autoLabel={terminalChoices.autoExternalTerminal}
                      value={externalTerminal}
                      customPlaceholder={customExternalPlaceholder(terminalChoices.platform)}
                      testId="settings-external-terminal"
                      colors={{ ...colors, tabBackground: colors.background }}
                      onChange={handleExternalTerminalChange}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Backup Tab */}
            {resolvedActiveTab === 'backup' && (
              <div
                role="tabpanel"
                id="settings-panel-backup"
                aria-labelledby="settings-tab-backup"
                data-testid="settings-backup-section"
              >
                <div style={groupCardStyle} data-testid="settings-group-backup-folder">
                  <div style={labelStyle}>Backup Folder (Unsaved Files)</div>
                  <p style={{ fontSize: '12px', opacity: 0.7, margin: '0 0 10px' }}>
                    Unsaved files are backed up here in individual files for easy recovery. Open tabs and session state are restored on next launch.
                    {sessionDir === null && (
                      <span style={{ marginLeft: 4, opacity: 0.55 }}>(default: ~/Documents/AwapiEditor/Backups)</span>
                    )}
                  </p>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: sessionDir !== null ? '8px' : '0' }}>
                    <span
                      title={resolvedDir}
                      style={{ ...pathBoxStyle, backgroundColor: colors.background }}
                      data-testid="session-dir-path"
                    >
                      {resolvedDir}
                    </span>
                    <button style={btnStyle()} onClick={handleChangeDir} data-testid="change-dir-btn">
                      Change…
                    </button>
                    <button style={btnStyle()} onClick={handleOpenInExplorer} data-testid="open-explorer-btn">
                      Open
                    </button>
                  </div>
                  {sessionDir !== null && (
                    <button
                      style={{ ...btnStyle(), fontSize: '12px', padding: '4px 10px' }}
                      onClick={handleResetDefault}
                      data-testid="reset-default-btn"
                    >
                      Reset to Default
                    </button>
                  )}
                </div>
              </div>
            )}
            </div>
          </>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: `1px solid ${colors.tabHover}`, paddingTop: '16px', flexShrink: 0 }}>
          <button style={btnStyle(true)} onClick={onClose} data-testid="settings-close-btn">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
