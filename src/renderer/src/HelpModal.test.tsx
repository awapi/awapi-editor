import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from './theme/ThemeContext';
import HelpModal from './HelpModal';

describe('HelpModal', () => {
  it('renders nothing when isOpen is false', () => {
    render(
      <ThemeProvider>
        <HelpModal isOpen={false} onClose={vi.fn()} />
      </ThemeProvider>
    );
    expect(screen.queryByTestId('help-modal')).toBeNull();
  });

  it('renders high-level help sections including CLI and drag-and-drop instructions when open', () => {
    render(
      <ThemeProvider>
        <HelpModal isOpen={true} onClose={vi.fn()} />
      </ThemeProvider>
    );
    expect(screen.getByTestId('help-modal')).toBeTruthy();
    expect(screen.getByText('Getting Started & Quick Guide')).toBeTruthy();
    expect(screen.getByText('Opening & Saving Files')).toBeTruthy();
    expect(screen.getByText('Drag & Drop')).toBeTruthy();
    expect(screen.getByText('Command Line (CLI) & OS Integration')).toBeTruthy();
    expect(screen.getByText('Enable the "awed" CLI Command')).toBeTruthy();
    expect(screen.getByText(/awed notes\.txt/)).toBeTruthy();
    expect(screen.getByText('Tabs, Split View & Compare')).toBeTruthy();
    expect(screen.getByText('Terminal, Search & Encoding')).toBeTruthy();
  });

  it('calls onClose when clicking Close button, overlay, or pressing Escape', () => {
    const onClose = vi.fn();
    render(
      <ThemeProvider>
        <HelpModal isOpen={true} onClose={onClose} />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByTestId('help-close-btn'));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('help-overlay'));
    expect(onClose).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('allows jumping directly to Keyboard Shortcuts or Preferences from footer buttons', () => {
    const onClose = vi.fn();
    const onOpenShortcuts = vi.fn();
    const onOpenSettings = vi.fn();

    render(
      <ThemeProvider>
        <HelpModal
          isOpen={true}
          onClose={onClose}
          onOpenShortcuts={onOpenShortcuts}
          onOpenSettings={onOpenSettings}
        />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByTestId('help-open-shortcuts-btn'));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onOpenShortcuts).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('help-open-settings-btn'));
    expect(onClose).toHaveBeenCalledTimes(2);
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });
});
