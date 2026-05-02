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

  it('renders the modal when open', async () => {
    renderModal(true);
    await waitFor(() => expect(screen.getByTestId('settings-modal')).toBeDefined());
    expect(screen.getByText('Preferences')).toBeDefined();
  });

  it('shows the default session directory when no custom dir is set', async () => {
    renderModal(true);
    await waitFor(() =>
      expect(screen.getByTestId('session-dir-path').textContent).toBe('/home/user/.config/awapi-editor')
    );
  });

  it('shows a custom session directory when one is configured', async () => {
    mockElectronAPI.loadSettings.mockResolvedValue({ sessionDir: '/custom/sessions' });
    renderModal(true);
    await waitFor(() =>
      expect(screen.getByTestId('session-dir-path').textContent).toBe('/custom/sessions')
    );
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
    await waitFor(() => screen.getByTestId('change-dir-btn'));
    fireEvent.click(screen.getByTestId('change-dir-btn'));
    await waitFor(() => expect(mockElectronAPI.saveSettings).toHaveBeenCalledWith({ sessionDir: '/new/session/path', theme: 'dark' }));
    expect(screen.getByTestId('session-dir-path').textContent).toBe('/new/session/path');
  });

  it('does not save if dir dialog is cancelled', async () => {
    mockElectronAPI.openDirDialog.mockResolvedValue(null);
    renderModal(true);
    await waitFor(() => screen.getByTestId('change-dir-btn'));
    fireEvent.click(screen.getByTestId('change-dir-btn'));
    await waitFor(() => expect(mockElectronAPI.openDirDialog).toHaveBeenCalled());
    expect(mockElectronAPI.saveSettings).not.toHaveBeenCalled();
  });

  it('calls openInExplorer with the resolved path on Open click', async () => {
    renderModal(true);
    await waitFor(() => screen.getByTestId('open-explorer-btn'));
    fireEvent.click(screen.getByTestId('open-explorer-btn'));
    await waitFor(() =>
      expect(mockElectronAPI.openInExplorer).toHaveBeenCalledWith('/home/user/.config/awapi-editor')
    );
  });

  it('shows Reset to Default button only when a custom dir is set', async () => {
    // No custom dir – reset button should not appear
    renderModal(true);
    await waitFor(() => screen.getByTestId('session-dir-path'));
    expect(screen.queryByTestId('reset-default-btn')).toBeNull();

    // Now with custom dir
    mockElectronAPI.loadSettings.mockResolvedValue({ sessionDir: '/custom/path' });
    renderModal(true);
    await waitFor(() => screen.getByTestId('reset-default-btn'));
    expect(screen.getByTestId('reset-default-btn')).toBeDefined();
  });

  it('resets to default dir and saves null sessionDir', async () => {
    mockElectronAPI.loadSettings.mockResolvedValue({ sessionDir: '/custom/path', theme: 'dark' });
    renderModal(true);
    await waitFor(() => screen.getByTestId('reset-default-btn'));
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
});
