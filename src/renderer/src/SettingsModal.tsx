import React, { useState, useEffect } from 'react';
import { useTheme } from './theme/ThemeContext';
import type { ThemeType, ThemeColors } from './theme/ThemeContext';
import type { TerminalChoice, TerminalChoices, TerminalPreference } from '../../shared/terminal';

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

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { colors, currentTheme, setTheme } = useTheme();
  const [sessionDir, setSessionDir] = useState<string | null>(null);
  const [defaultDir, setDefaultDir] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [terminalChoices, setTerminalChoices] = useState<TerminalChoices | null>(null);
  const [externalTerminal, setExternalTerminal] = useState<TerminalPreference>(null);
  const [integratedShell, setIntegratedShell] = useState<TerminalPreference>(null);

  useEffect(() => {
    if (!isOpen) return;
    const w = window as any;
    if (!w.electronAPI) return;

    setLoading(true);
    Promise.all([
      w.electronAPI.loadSettings() as Promise<{
        sessionDir: string | null;
        externalTerminal?: TerminalPreference;
        integratedShell?: TerminalPreference;
      }>,
      w.electronAPI.getDefaultSessionDir() as Promise<string>,
      (w.electronAPI.getTerminalChoices?.() as Promise<TerminalChoices> | undefined)?.catch(() => null) ?? null,
    ]).then(([settings, defDir, choices]) => {
      setSessionDir(settings.sessionDir);
      setExternalTerminal(settings.externalTerminal ?? null);
      setIntegratedShell(settings.integratedShell ?? null);
      setDefaultDir(defDir);
      setTerminalChoices(choices);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [isOpen]);

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
    overflowY: 'auto',
    boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
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

  const sectionStyle: React.CSSProperties = {
    marginBottom: '24px',
  };

  const themeOptions: { value: ThemeType; label: string }[] = [
    { value: 'dark', label: 'Dark' },
    { value: 'light', label: 'Light' },
  ];

  return (
    <div style={overlayStyle} data-testid="settings-overlay">
      <div style={modalStyle} onClick={e => e.stopPropagation()} data-testid="settings-modal">
        <h2 style={{ margin: '0 0 20px', fontSize: '16px', fontWeight: 600 }}>Preferences</h2>

        {loading ? (
          <p style={{ opacity: 0.6 }}>Loading…</p>
        ) : (
          <>
            {/* Theme Section */}
            <div style={sectionStyle}>
              <div style={labelStyle}>Theme</div>
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

            {/* Terminal Section */}
            {terminalChoices && (
              <div style={sectionStyle} data-testid="settings-terminal-section">
                <div style={labelStyle}>Terminal</div>
                <TerminalPreferenceField
                  label="Integrated terminal shell"
                  description="Shell used by the terminal panel (Ctrl+`). Applies to new terminals."
                  choices={terminalChoices.shells}
                  autoLabel={terminalChoices.autoShell}
                  value={integratedShell}
                  customPlaceholder={customShellPlaceholder(terminalChoices.platform)}
                  testId="settings-integrated-shell"
                  colors={colors}
                  onChange={handleIntegratedShellChange}
                />
                <TerminalPreferenceField
                  label="External terminal"
                  description={'Application used by \u201cOpen in External Terminal\u201d in the tab menu.'}
                  choices={terminalChoices.externalTerminals}
                  autoLabel={terminalChoices.autoExternalTerminal}
                  value={externalTerminal}
                  customPlaceholder={customExternalPlaceholder(terminalChoices.platform)}
                  testId="settings-external-terminal"
                  colors={colors}
                  onChange={handleExternalTerminalChange}
                />
              </div>
            )}

            {/* Session Storage Section */}
            <div style={sectionStyle}>
              <div style={labelStyle}>Backup Folder (Unsaved Files)</div>
              <p style={{ fontSize: '12px', opacity: 0.7, margin: '0 0 10px' }}>
                Unsaved files are backed up here in individual files for easy recovery. Open tabs and session state are restored on next launch.
                {sessionDir === null && (
                  <span style={{ marginLeft: 4, opacity: 0.55 }}>(default: ~/Documents/AwapiEditor/Backups)</span>
                )}
              </p>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '8px' }}>
                <span
                  title={resolvedDir}
                  style={pathBoxStyle}
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
          </>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', borderTop: `1px solid ${colors.tabHover}`, paddingTop: '16px' }}>
          <button style={btnStyle(true)} onClick={onClose} data-testid="settings-close-btn">
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
