import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider } from './theme/ThemeContext';
import ShortcutsModal from './ShortcutsModal';

describe('ShortcutsModal', () => {
  it('renders nothing when isOpen is false', () => {
    render(
      <ThemeProvider>
        <ShortcutsModal isOpen={false} onClose={vi.fn()} />
      </ThemeProvider>
    );
    expect(screen.queryByTestId('shortcuts-modal')).toBeNull();
  });

  it('renders shortcut sections and tips when isOpen is true', () => {
    render(
      <ThemeProvider>
        <ShortcutsModal isOpen={true} onClose={vi.fn()} />
      </ThemeProvider>
    );
    expect(screen.getByTestId('shortcuts-modal')).toBeTruthy();
    expect(screen.getByText('Close Active Tab')).toBeTruthy();
    expect(screen.getByText('Cmd/Ctrl + W')).toBeTruthy();
    expect(screen.getByText('Reopen Closed Tab')).toBeTruthy();
    expect(screen.getByText('Cmd/Ctrl + Shift + T')).toBeTruthy();
    expect(screen.getByText('Middle-Click Tab')).toBeTruthy();
  });

  it('lists the integrated terminal shortcuts', () => {
    render(
      <ThemeProvider>
        <ShortcutsModal isOpen={true} onClose={vi.fn()} />
      </ThemeProvider>
    );
    expect(screen.getByText('Toggle File Explorer')).toBeTruthy();
    expect(screen.getByText('Cmd/Ctrl + B')).toBeTruthy();
    expect(screen.getByText('Toggle Integrated Terminal')).toBeTruthy();
    expect(screen.getByText('Ctrl + ` (all platforms)')).toBeTruthy();
    expect(screen.getByText('New Integrated Terminal')).toBeTruthy();
    expect(screen.getByText('Ctrl + Shift + ` (all platforms)')).toBeTruthy();
  });

  it('calls onClose when clicking Close button, overlay, or pressing Escape', () => {
    const onClose = vi.fn();
    render(
      <ThemeProvider>
        <ShortcutsModal isOpen={true} onClose={onClose} />
      </ThemeProvider>
    );

    fireEvent.click(screen.getByTestId('shortcuts-close-btn'));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('shortcuts-overlay'));
    expect(onClose).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
