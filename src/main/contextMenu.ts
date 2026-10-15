// This module avoids runtime Node built-in imports so it can be unit-tested
// directly in the renderer-configured Vitest environment. All OS access is
// injected via `ContextMenuDeps` from `main.ts`.

export const CONTEXT_MENU_KEY = 'HKCU\\Software\\Classes\\*\\shell\\AwapiEditor';
export const CONTEXT_MENU_COMMAND_KEY = `${CONTEXT_MENU_KEY}\\command`;
export const CONTEXT_MENU_LABEL = 'Edit with AwapiEditor';

export interface ContextMenuStatus {
  /** True on Windows (`win32`) when packaged or an executable path is available. */
  supported: boolean;
  /** True when the Explorer context menu registry entry is currently registered. */
  enabled: boolean;
}

export type ContextMenuUpdateResult =
  | { ok: true; enabled: boolean }
  | { ok: false; enabled: boolean; error: string };

export interface ContextMenuDeps {
  platform: NodeJS.Platform;
  /** Full path to `AwapiEditor.exe` (or `process.execPath` in dev). */
  execPath: string;
  /** False in `vite` dev mode where `execPath` is `electron.exe` rather than the packaged app. */
  isPackaged: boolean;
  /** Optional path to `build/icon.ico` used when not packaged (so dev builds show the real icon instead of Electron's). */
  iconPath?: string;
  /** Optional path to the app entry script (`dist/main/main.js`) used in dev mode so `electron.exe` launches the app. */
  appEntryPath?: string;
  /** Runs `reg.exe` with the given arguments and resolves with exit code + output. */
  runReg: (args: string[]) => Promise<{ code: number; stdout: string; stderr: string }>;
}

/** Builds the `reg.exe` arguments to query whether the context menu command is registered. */
export function buildQueryArgs(): string[] {
  return ['query', CONTEXT_MENU_COMMAND_KEY, '/ve'];
}

export interface RegisterCommandOptions {
  execPath: string;
  isPackaged?: boolean;
  iconPath?: string;
  appEntryPath?: string;
}

/**
 * Builds the sequence of `reg.exe` invocations that register "Edit with AwapiEditor"
 * under `HKCU\Software\Classes\*\shell\AwapiEditor`.
 */
export function buildRegisterCommands(
  input: string | RegisterCommandOptions,
): string[][] {
  const opts: RegisterCommandOptions =
    typeof input === 'string' ? { execPath: input, isPackaged: true } : input;
  const isPackaged = opts.isPackaged ?? true;
  const iconValue =
    !isPackaged && opts.iconPath
      ? `"${opts.iconPath}"`
      : `"${opts.execPath}",0`;
  const commandValue =
    !isPackaged && opts.appEntryPath
      ? `"${opts.execPath}" "${opts.appEntryPath}" "%1"`
      : `"${opts.execPath}" "%1"`;

  return [
    ['add', CONTEXT_MENU_KEY, '/ve', '/t', 'REG_SZ', '/d', CONTEXT_MENU_LABEL, '/f'],
    ['add', CONTEXT_MENU_KEY, '/v', 'Icon', '/t', 'REG_SZ', '/d', iconValue, '/f'],
    ['add', CONTEXT_MENU_COMMAND_KEY, '/ve', '/t', 'REG_SZ', '/d', commandValue, '/f'],
  ];
}

/** Builds the `reg.exe` arguments to remove the context menu registry key tree. */
export function buildUnregisterArgs(): string[] {
  return ['delete', CONTEXT_MENU_KEY, '/f'];
}

/** Whether Windows Explorer context menu registration is supported in this environment. */
export function isContextMenuSupported(deps: Pick<ContextMenuDeps, 'platform' | 'execPath'>): boolean {
  return deps.platform === 'win32' && typeof deps.execPath === 'string' && deps.execPath.length > 0;
}

/** Queries the current Windows Explorer context menu registration status. */
export async function getContextMenuStatus(deps: ContextMenuDeps): Promise<ContextMenuStatus> {
  if (!isContextMenuSupported(deps)) {
    return { supported: false, enabled: false };
  }
  try {
    const res = await deps.runReg(buildQueryArgs());
    return {
      supported: true,
      enabled: res.code === 0,
    };
  } catch {
    return { supported: true, enabled: false };
  }
}

/** Enables or disables the "Edit with AwapiEditor" Windows Explorer context menu entry. */
export async function setContextMenuEnabled(
  enable: boolean,
  deps: ContextMenuDeps,
): Promise<ContextMenuUpdateResult> {
  if (!isContextMenuSupported(deps)) {
    return {
      ok: false,
      enabled: false,
      error: 'Windows Explorer context menu integration is only available on Windows.',
    };
  }

  try {
    if (enable) {
      for (const args of buildRegisterCommands({
        execPath: deps.execPath,
        isPackaged: deps.isPackaged,
        iconPath: deps.iconPath,
        appEntryPath: deps.appEntryPath,
      })) {
        const res = await deps.runReg(args);
        if (res.code !== 0) {
          return {
            ok: false,
            enabled: false,
            error: res.stderr.trim() || res.stdout.trim() || `reg.exe exited with code ${res.code}`,
          };
        }
      }
      return { ok: true, enabled: true };
    } else {
      const res = await deps.runReg(buildUnregisterArgs());
      if (res.code !== 0) {
        // If the key is already absent, verify via query and treat as success.
        const status = await getContextMenuStatus(deps);
        if (!status.enabled) {
          return { ok: true, enabled: false };
        }
        return {
          ok: false,
          enabled: true,
          error: res.stderr.trim() || res.stdout.trim() || `reg.exe exited with code ${res.code}`,
        };
      }
      return { ok: true, enabled: false };
    }
  } catch (err) {
    return {
      ok: false,
      enabled: !enable,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
