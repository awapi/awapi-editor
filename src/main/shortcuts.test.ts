import { describe, it, expect } from 'vitest';
import {
  GO_TO_LINE_ACCELERATOR,
  SHORTCUTS_REFERENCE_ACCELERATOR,
  TOGGLE_EXPLORER_ACCELERATOR,
  MARKDOWN_PREVIEW_ACCELERATOR,
  normalizeAccelerator,
  conflictsWithMonaco,
} from './shortcuts';

const PLATFORMS: NodeJS.Platform[] = ['darwin', 'win32', 'linux'];

describe('shortcuts', () => {
  it('normalizes CmdOrCtrl per platform', () => {
    expect(normalizeAccelerator('CmdOrCtrl+G', 'darwin')).toBe('Cmd+G');
    expect(normalizeAccelerator('CmdOrCtrl+G', 'win32')).toBe('Ctrl+G');
    expect(normalizeAccelerator('CommandOrControl+Shift+F', 'linux')).toBe('Ctrl+Shift+F');
    expect(normalizeAccelerator('Control+G', 'darwin')).toBe('Ctrl+G');
  });

  it('detects conflicts with Monaco keybindings', () => {
    expect(conflictsWithMonaco('CmdOrCtrl+/', 'darwin')).toBe(true);
    expect(conflictsWithMonaco('CmdOrCtrl+/', 'win32')).toBe(true);
    // The old Go to Line binding shadowed Find Next on macOS only.
    expect(conflictsWithMonaco('CmdOrCtrl+G', 'darwin')).toBe(true);
    expect(conflictsWithMonaco('CmdOrCtrl+G', 'win32')).toBe(false);
  });

  it.each(PLATFORMS)('Go to Line, Shortcuts Reference, Toggle Explorer, and Markdown Preview accelerators do not shadow Monaco on %s', platform => {
    expect(conflictsWithMonaco(GO_TO_LINE_ACCELERATOR, platform)).toBe(false);
    expect(conflictsWithMonaco(SHORTCUTS_REFERENCE_ACCELERATOR, platform)).toBe(false);
    expect(conflictsWithMonaco(TOGGLE_EXPLORER_ACCELERATOR, platform)).toBe(false);
    expect(conflictsWithMonaco(MARKDOWN_PREVIEW_ACCELERATOR, platform)).toBe(false);
  });

  it('uses Ctrl+G for Go to Line, Shift+F1 for the shortcuts reference, CmdOrCtrl+B for Toggle Explorer, and CmdOrCtrl+Shift+V for Markdown Preview', () => {
    expect(GO_TO_LINE_ACCELERATOR).toBe('Ctrl+G');
    expect(SHORTCUTS_REFERENCE_ACCELERATOR).toBe('Shift+F1');
    expect(TOGGLE_EXPLORER_ACCELERATOR).toBe('CmdOrCtrl+B');
    expect(MARKDOWN_PREVIEW_ACCELERATOR).toBe('CmdOrCtrl+Shift+V');
  });
});
