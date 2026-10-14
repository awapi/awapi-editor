import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import SettingsModal from './SettingsModal';
import { ThemeProvider } from './theme/ThemeContext';

const renderModal = (isOpen = true, onClose = vi.fn()) =>
  render(
    <ThemeProvider>
      <SettingsModal isOpen={isOpen} onClose={onClose} />
    </ThemeProvider>
  );

describe('SettingsModal', () => {
  let mockElectronAPI: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    mockElectronAPI = {
      loadSettings: vi.fn().mockResolvedValue({ sessionDir: null }),
      saveSettings: vi.fn().mockResolvedValue(true),
      applyNativeTheme: vi.fn().mockResolvedValue(undefined),
      getDefaultSessionDir: vi.fn().mockResolvedValue('/home/user/.config/awapi-editor'),
      openDirDialog: vi.fn().mockResolvedValue(null),
      openInExplorer: vi.fn().mockResolvedValue(undefined),
    };
    (window as any).electronAPI = mockElectronAPI;
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete (window as any).electronAPI;
  });

  it('renders nothing when closed', () => {
    renderModal(false);
    expect(screen.queryByTestId('settings-modal')).toBeNull();
  });

  it('renders the modal when open and defaults to the Appearance tab', async () => {
    renderModal(true);
    await waitFor(() => expect(screen.getByTestId('settings-modal')).toBeDefined());
    expect(screen.getByText('Preferences')).toBeDefined();
    await waitFor(() => expect(screen.getByTestId('settings-tabs')).toBeDefined());
    expect(screen.getByTestId('settings-tab-appearance').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('settings-tab-backup').getAttribute('aria-selected')).toBe('false');
    expect(screen.getByTestId('settings-appearance-section')).toBeDefined();
    expect(screen.getByTestId('settings-group-theme')).toBeDefined();
  });

  it('switches between Appearance, Terminal, and Backup tabs with grouped sections', async () => {
    mockElectronAPI.getTerminalChoices = vi.fn().mockResolvedValue({
      platform: 'win32',
      externalTerminals: [],
      shells: [],
      autoExternalTerminal: null,
      autoShell: null,
    });
    renderModal(true);
    await waitFor(() => expect(screen.getByTestId('settings-tab-appearance')).toBeDefined());

    // Initially on Appearance tab
    expect(screen.getByTestId('settings-appearance-section')).toBeDefined();
    expect(screen.queryByTestId('settings-terminal-section')).toBeNull();
    expect(screen.queryByTestId('settings-backup-section')).toBeNull();

    // Switch to Terminal tab
    fireEvent.click(screen.getByTestId('settings-tab-terminal'));
    expect(screen.getByTestId('settings-tab-terminal').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('settings-terminal-section')).toBeDefined();
    expect(screen.getByTestId('settings-group-integrated-terminal')).toBeDefined();
    expect(screen.getByTestId('settings-group-external-terminal')).toBeDefined();
    expect(screen.queryByTestId('settings-appearance-section')).toBeNull();

    // Switch to Backup tab
    fireEvent.click(screen.getByTestId('settings-tab-backup'));
    expect(screen.getByTestId('settings-tab-backup').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('settings-backup-section')).toBeDefined();
    expect(screen.getByTestId('settings-group-backup-folder')).toBeDefined();
    expect(screen.queryByTestId('settings-terminal-section')).toBeNull();
  });

  it('shows the default session directory when no custom dir is set', async () => {
    renderModal(true);
    await waitFor(() => screen.getByTestId('settings-tab-backup'));
    fireEvent.click(screen.getByTestId('settings-tab-backup'));
    expect(screen.getByTestId('session-dir-path').textContent).toBe('/home/user/.config/awapi-editor');
  });

  it('shows a custom session directory when one is configured', async () => {
    mockElectronAPI.loadSettings.mockResolvedValue({ sessionDir: '/custom/sessions' });
    renderModal(true);
    await waitFor(() => screen.getByTestId('settings-tab-backup'));
    fireEvent.click(screen.getByTestId('settings-tab-backup'));
    expect(screen.getByTestId('session-dir-path').textContent).toBe('/custom/sessions');
  });

  it('does not close when overlay is clicked', async () => {
    const onClose = vi.fn();
    renderModal(true, onClose);
    await waitFor(() => screen.getByTestId('settings-overlay'));
    fireEvent.click(screen.getByTestId('settings-overlay'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('calls onClose when Close button is clicked', async () => {
    const onClose = vi.fn();
    renderModal(true, onClose);
    await waitFor(() => screen.getByTestId('settings-close-btn'));
    fireEvent.click(screen.getByTestId('settings-close-btn'));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('does not close when clicking inside the modal', async () => {
    const onClose = vi.fn();
    renderModal(true, onClose);
    await waitFor(() => screen.getByTestId('settings-modal'));
    fireEvent.click(screen.getByTestId('settings-modal'));
    expect(onClose).not.toHaveBeenCalled();
  });

  it('opens dir dialog and saves new path on Change click', async () => {
    mockElectronAPI.openDirDialog.mockResolvedValue('/new/session/path');
    renderModal(true);
    await waitFor(() => screen.getByTestId('settings-tab-backup'));
    fireEvent.click(screen.getByTestId('settings-tab-backup'));
    fireEvent.click(screen.getByTestId('change-dir-btn'));
    await waitFor(() => expect(mockElectronAPI.saveSettings).toHaveBeenCalledWith({ sessionDir: '/new/session/path', theme: 'dark' }));
    expect(screen.getByTestId('session-dir-path').textContent).toBe('/new/session/path');
  });

  it('does not save if dir dialog is cancelled', async () => {
    mockElectronAPI.openDirDialog.mockResolvedValue(null);
    renderModal(true);
    await waitFor(() => screen.getByTestId('settings-tab-backup'));
    fireEvent.click(screen.getByTestId('settings-tab-backup'));
    fireEvent.click(screen.getByTestId('change-dir-btn'));
    await waitFor(() => expect(mockElectronAPI.openDirDialog).toHaveBeenCalled());
    expect(mockElectronAPI.saveSettings).not.toHaveBeenCalled();
  });

  it('calls openInExplorer with the resolved path on Open click', async () => {
    renderModal(true);
    await waitFor(() => screen.getByTestId('settings-tab-backup'));
    fireEvent.click(screen.getByTestId('settings-tab-backup'));
    fireEvent.click(screen.getByTestId('open-explorer-btn'));
    await waitFor(() =>
      expect(mockElectronAPI.openInExplorer).toHaveBeenCalledWith('/home/user/.config/awapi-editor')
    );
  });

  it('shows Reset to Default button only when a custom dir is set', async () => {
    // No custom dir – reset button should not appear
    const { unmount } = renderModal(true);
    await waitFor(() => screen.getByTestId('settings-tab-backup'));
    fireEvent.click(screen.getByTestId('settings-tab-backup'));
    expect(screen.getByTestId('session-dir-path')).toBeDefined();
    expect(screen.queryByTestId('reset-default-btn')).toBeNull();
    unmount();

    // Now with custom dir
    mockElectronAPI.loadSettings.mockResolvedValue({ sessionDir: '/custom/path' });
    renderModal(true);
    await waitFor(() => screen.getByTestId('settings-tab-backup'));
    fireEvent.click(screen.getByTestId('settings-tab-backup'));
    expect(screen.getByTestId('reset-default-btn')).toBeDefined();
  });

  it('resets to default dir and saves null sessionDir', async () => {
    mockElectronAPI.loadSettings.mockResolvedValue({ sessionDir: '/custom/path', theme: 'dark' });
    renderModal(true);
    await waitFor(() => screen.getByTestId('settings-tab-backup'));
    fireEvent.click(screen.getByTestId('settings-tab-backup'));
    fireEvent.click(screen.getByTestId('reset-default-btn'));
    await waitFor(() => expect(mockElectronAPI.saveSettings).toHaveBeenCalledWith({ sessionDir: null, theme: 'dark' }));
    await waitFor(() =>
      expect(screen.getByTestId('session-dir-path').textContent).toBe('/home/user/.config/awapi-editor')
    );
  });

  it('renders both Dark and Light theme buttons', async () => {
    renderModal(true);
    await waitFor(() => screen.getByTestId('theme-btn-dark'));
    expect(screen.getByTestId('theme-btn-dark')).toBeDefined();
    expect(screen.getByTestId('theme-btn-light')).toBeDefined();
  });

  it('Dark button is pressed by default (default theme is dark)', async () => {
    renderModal(true);
    await waitFor(() => screen.getByTestId('theme-btn-dark'));
    expect(screen.getByTestId('theme-btn-dark').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('theme-btn-light').getAttribute('aria-pressed')).toBe('false');
  });

  it('switches to Light theme when Light button is clicked', async () => {
    renderModal(true);
    await waitFor(() => screen.getByTestId('theme-btn-light'));
    fireEvent.click(screen.getByTestId('theme-btn-light'));
    expect(screen.getByTestId('theme-btn-light').getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByTestId('theme-btn-dark').getAttribute('aria-pressed')).toBe('false');
  });

  it('persists selected theme to settings when a theme button is clicked', async () => {
    renderModal(true);
    await waitFor(() => screen.getByTestId('theme-btn-light'));
    fireEvent.click(screen.getByTestId('theme-btn-light'));
    await waitFor(() =>
      expect(mockElectronAPI.saveSettings).toHaveBeenCalledWith({ sessionDir: null, theme: 'light' })
    );
  });

  describe('Terminal section', () => {
    const choices = {
      platform: 'win32',
      externalTerminals: [
        { id: 'windows-terminal', label: 'Windows Terminal', detail: 'wt.exe' },
        { id: 'cmd', label: 'Command Prompt', detail: 'cmd.exe' },
      ],
      shells: [
        { id: 'pwsh', label: 'PowerShell 7', detail: 'C:\\pwsh.exe' },
        { id: 'git-bash', label: 'Git Bash', detail: 'C:\\bash.exe' },
      ],
      autoExternalTerminal: 'Windows Terminal',
      autoShell: 'PowerShell 7',
    };

    beforeEach(() => {
      mockElectronAPI.getTerminalChoices = vi.fn().mockResolvedValue(choices);
    });

    it('is hidden when terminal choices are unavailable', async () => {
      delete mockElectronAPI.getTerminalChoices;
      renderModal(true);
      await waitFor(() => screen.getByTestId('settings-tab-appearance'));
      expect(screen.queryByTestId('settings-tab-terminal')).toBeNull();
      expect(screen.queryByTestId('settings-terminal-section')).toBeNull();
    });

    it('lists automatic, detected, and custom options with the automatic target named', async () => {
      renderModal(true);
      await waitFor(() => screen.getByTestId('settings-tab-terminal'));
      fireEvent.click(screen.getByTestId('settings-tab-terminal'));
      const shell = (await screen.findByTestId('settings-integrated-shell')) as HTMLSelectElement;
      expect(Array.from(shell.options).map(o => o.textContent)).toEqual([
        'Automatic (PowerShell 7)',
        'PowerShell 7',
        'Git Bash',
        'Custom…',
      ]);
      expect(shell.value).toBe('');
      const external = screen.getByTestId('settings-external-terminal') as HTMLSelectElement;
      expect(external.options[0].textContent).toBe('Automatic (Windows Terminal)');
    });

    it('reflects stored preferences, including custom values', async () => {
      mockElectronAPI.loadSettings.mockResolvedValue({
        sessionDir: null,
        integratedShell: 'git-bash',
        externalTerminal: 'C:\\Tools\\term.exe',
      });
      renderModal(true);
      await waitFor(() => screen.getByTestId('settings-tab-terminal'));
      fireEvent.click(screen.getByTestId('settings-tab-terminal'));
      const shell = (await screen.findByTestId('settings-integrated-shell')) as HTMLSelectElement;
      expect(shell.value).toBe('git-bash');
      expect((screen.getByTestId('settings-external-terminal') as HTMLSelectElement).value).toBe('__custom__');
      expect((screen.getByTestId('settings-external-terminal-custom') as HTMLInputElement).value).toBe('C:\\Tools\\term.exe');
    });

    it('saves a detected choice or automatic immediately', async () => {
      renderModal(true);
      await waitFor(() => screen.getByTestId('settings-tab-terminal'));
      fireEvent.click(screen.getByTestId('settings-tab-terminal'));
      const shell = await screen.findByTestId('settings-integrated-shell');
      fireEvent.change(shell, { target: { value: 'git-bash' } });
      await waitFor(() => expect(mockElectronAPI.saveSettings).toHaveBeenCalledWith({ integratedShell: 'git-bash' }));

      fireEvent.change(shell, { target: { value: '' } });
      await waitFor(() => expect(mockElectronAPI.saveSettings).toHaveBeenCalledWith({ integratedShell: null }));

      fireEvent.change(screen.getByTestId('settings-external-terminal'), { target: { value: 'cmd' } });
      await waitFor(() => expect(mockElectronAPI.saveSettings).toHaveBeenCalledWith({ externalTerminal: 'cmd' }));
    });

    it('saves a custom path on blur or Enter, but not before one is typed', async () => {
      renderModal(true);
      await waitFor(() => screen.getByTestId('settings-tab-terminal'));
      fireEvent.click(screen.getByTestId('settings-tab-terminal'));
      const shell = await screen.findByTestId('settings-integrated-shell');
      fireEvent.change(shell, { target: { value: '__custom__' } });
      expect(mockElectronAPI.saveSettings).not.toHaveBeenCalled();

      const input = screen.getByTestId('settings-integrated-shell-custom');
      fireEvent.change(input, { target: { value: '  C:\\msys64\\usr\\bin\\bash.exe  ' } });
      fireEvent.keyDown(input, { key: 'Enter' });
      await waitFor(() =>
        expect(mockElectronAPI.saveSettings).toHaveBeenCalledWith({ integratedShell: 'C:\\msys64\\usr\\bin\\bash.exe' }),
      );

      // Blurring with the same value does not save again.
      fireEvent.blur(input);
      expect(mockElectronAPI.saveSettings).toHaveBeenCalledTimes(1);
    });

    it('lists console (fixed-width) fonts and saves the selected terminal font', async () => {
      mockElectronAPI.loadSettings.mockResolvedValue({
        sessionDir: null,
        terminalFont: 'MesloLGS NF',
      });
      renderModal(true);
      await waitFor(() => screen.getByTestId('settings-tab-terminal'));
      fireEvent.click(screen.getByTestId('settings-tab-terminal'));

      const fontSelect = (await screen.findByTestId('settings-terminal-font')) as HTMLSelectElement;
      expect(fontSelect.value).toBe('MesloLGS NF');
      expect(fontSelect.options[0].textContent).toBe('Default');
      expect(Array.from(fontSelect.options).map(o => o.value)).toContain('Consolas');

      fireEvent.change(fontSelect, { target: { value: 'Consolas' } });
      await waitFor(() =>
        expect(mockElectronAPI.saveSettings).toHaveBeenCalledWith({ terminalFont: 'Consolas' }),
      );

      fireEvent.change(fontSelect, { target: { value: '' } });
      await waitFor(() =>
        expect(mockElectronAPI.saveSettings).toHaveBeenCalledWith({ terminalFont: null }),
      );
    });
  });
});
