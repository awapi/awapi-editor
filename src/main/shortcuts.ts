/**
 * Menu accelerators for app-level commands that must not shadow Monaco's own
 * editor keybindings (menu accelerators fire before the editor sees the key).
 */

/**
 * Go to Line. Matches Monaco's own binding: Ctrl+G on every platform. On macOS
 * this is the Control key, which keeps Cmd+G free for Monaco's Find Next.
 */
export const GO_TO_LINE_ACCELERATOR = 'Ctrl+G';

/** Keyboard Shortcuts reference. Pairs with F1 (Command Palette). */
export const SHORTCUTS_REFERENCE_ACCELERATOR = 'Shift+F1';

/** Toggle File Explorer sidebar. Matches VS Code's sidebar toggle. */
export const TOGGLE_EXPLORER_ACCELERATOR = 'CmdOrCtrl+B';

/** Open or focus the live Markdown Preview popup window. */
export const MARKDOWN_PREVIEW_ACCELERATOR = 'CmdOrCtrl+Shift+V';

/**
 * Monaco editor keybindings that app menu accelerators must never use,
 * expressed as Electron accelerator strings.
 */
export const MONACO_RESERVED_ACCELERATORS: readonly string[] = [
  'CmdOrCtrl+/', // Toggle Line Comment
  'Cmd+G', // Find Next (macOS)
  'Cmd+Shift+G', // Find Previous (macOS)
  'F3', // Find Next (Windows/Linux)
  'Shift+F3', // Find Previous (Windows/Linux)
  'Alt+F1', // Accessibility Help
  'F1', // Command Palette (handled by the editor itself)
];

/** Normalizes an Electron accelerator for the current platform, e.g. `CmdOrCtrl+G` -> `Cmd+G` on macOS. */
export function normalizeAccelerator(accelerator: string, platform: NodeJS.Platform): string {
  const isMac = platform === 'darwin';
  return accelerator
    .split('+')
    .map(part => {
      if (part === 'CmdOrCtrl' || part === 'CommandOrControl') return isMac ? 'Cmd' : 'Ctrl';
      if (part === 'Command') return 'Cmd';
      if (part === 'Control') return 'Ctrl';
      return part;
    })
    .join('+');
}

/** Returns true when `accelerator` collides with a reserved Monaco keybinding on `platform`. */
export function conflictsWithMonaco(accelerator: string, platform: NodeJS.Platform): boolean {
  const target = normalizeAccelerator(accelerator, platform).toLowerCase();
  return MONACO_RESERVED_ACCELERATORS.some(
    reserved => normalizeAccelerator(reserved, platform).toLowerCase() === target,
  );
}
