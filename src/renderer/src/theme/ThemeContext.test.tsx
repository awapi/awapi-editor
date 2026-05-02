import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import React from 'react';
import { ThemeProvider, useTheme } from './ThemeContext';

// A minimal consumer component that captures the hook return value.
let capturedHook: ReturnType<typeof useTheme> | undefined;
const Consumer = () => {
  capturedHook = useTheme();
  return null;
};

const renderWithProvider = () =>
  render(
    <ThemeProvider>
      <Consumer />
    </ThemeProvider>
  );

describe('ThemeContext', () => {
  let applyNativeThemeMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    capturedHook = undefined;
    applyNativeThemeMock = vi.fn().mockResolvedValue(undefined);
    (window as any).electronAPI = {
      loadSettings: vi.fn().mockResolvedValue({ sessionDir: null, theme: null }),
      onThemeChange: vi.fn(),
      applyNativeTheme: applyNativeThemeMock,
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
    delete (window as any).electronAPI;
  });

  it('defaults to dark theme', () => {
    renderWithProvider();
    expect(capturedHook?.currentTheme).toBe('dark');
  });

  it('setTheme updates currentTheme', () => {
    renderWithProvider();
    act(() => {
      capturedHook?.setTheme('light');
    });
    expect(capturedHook?.currentTheme).toBe('light');
  });

  it('setTheme("light") calls applyNativeTheme with "light"', () => {
    renderWithProvider();
    act(() => {
      capturedHook?.setTheme('light');
    });
    expect(applyNativeThemeMock).toHaveBeenCalledWith('light');
  });

  it('setTheme("dark") calls applyNativeTheme with "dark"', () => {
    renderWithProvider();
    act(() => {
      capturedHook?.setTheme('light'); // first switch to light
    });
    act(() => {
      capturedHook?.setTheme('dark');
    });
    expect(applyNativeThemeMock).toHaveBeenLastCalledWith('dark');
  });

  it('applyNativeTheme is not called when electronAPI is absent', () => {
    delete (window as any).electronAPI;
    // Should not throw
    renderWithProvider();
    act(() => {
      capturedHook?.setTheme('light');
    });
    expect(capturedHook?.currentTheme).toBe('light');
  });

  it('applies persisted theme from settings on startup', async () => {
    (window as any).electronAPI.loadSettings = vi.fn().mockResolvedValue({ sessionDir: null, theme: 'light' });
    renderWithProvider();
    // Wait for async loadSettings to resolve
    await act(async () => {});
    expect(applyNativeThemeMock).toHaveBeenCalledWith('light');
  });

  it('importThemeFromMain applies custom theme type to native theme', () => {
    renderWithProvider();
    act(() => {
      capturedHook?.importThemeFromMain({
        id: 'my-custom',
        name: 'My Custom',
        type: 'light',
        colors: {
          background: '#fff',
          foreground: '#000',
          tabBackground: '#eee',
          tabActiveBackground: '#fff',
          tabBorder: '#007acc',
          tabHover: '#ddd',
        },
      });
    });
    expect(applyNativeThemeMock).toHaveBeenCalledWith('light');
  });
});
