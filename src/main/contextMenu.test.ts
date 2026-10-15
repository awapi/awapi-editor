import { describe, it, expect, vi } from 'vitest';
import {
  CONTEXT_MENU_KEY,
  CONTEXT_MENU_COMMAND_KEY,
  CONTEXT_MENU_LABEL,
  buildQueryArgs,
  buildRegisterCommands,
  buildUnregisterArgs,
  isContextMenuSupported,
  getContextMenuStatus,
  setContextMenuEnabled,
  type ContextMenuDeps,
} from './contextMenu';

function createDeps(overrides: Partial<ContextMenuDeps> = {}): ContextMenuDeps {
  return {
    platform: 'win32',
    execPath: 'C:\\Users\\me\\AppData\\Local\\Programs\\AwapiEditor\\AwapiEditor.exe',
    isPackaged: true,
    runReg: vi.fn().mockResolvedValue({ code: 0, stdout: '', stderr: '' }),
    ...overrides,
  };
}

describe('contextMenu', () => {
  describe('command builders', () => {
    it('builds query args for the command subkey', () => {
      expect(buildQueryArgs()).toEqual(['query', CONTEXT_MENU_COMMAND_KEY, '/ve']);
    });

    it('builds registration commands with label, icon, and "%1" command', () => {
      const exe = 'C:\\Program Files\\AwapiEditor\\AwapiEditor.exe';
      expect(buildRegisterCommands(exe)).toEqual([
        ['add', CONTEXT_MENU_KEY, '/ve', '/t', 'REG_SZ', '/d', CONTEXT_MENU_LABEL, '/f'],
        ['add', CONTEXT_MENU_KEY, '/v', 'Icon', '/t', 'REG_SZ', '/d', `"${exe}",0`, '/f'],
        ['add', CONTEXT_MENU_COMMAND_KEY, '/ve', '/t', 'REG_SZ', '/d', `"${exe}" "%1"`, '/f'],
      ]);
    });

    it('uses iconPath and appEntryPath when running unpackaged (dev mode)', () => {
      const exe = 'C:\\repo\\node_modules\\electron\\dist\\electron.exe';
      const iconPath = 'C:\\repo\\build\\icon.ico';
      const appEntryPath = 'C:\\repo\\dist\\main\\main.js';
      expect(
        buildRegisterCommands({
          execPath: exe,
          isPackaged: false,
          iconPath,
          appEntryPath,
        }),
      ).toEqual([
        ['add', CONTEXT_MENU_KEY, '/ve', '/t', 'REG_SZ', '/d', CONTEXT_MENU_LABEL, '/f'],
        ['add', CONTEXT_MENU_KEY, '/v', 'Icon', '/t', 'REG_SZ', '/d', `"${iconPath}"`, '/f'],
        ['add', CONTEXT_MENU_COMMAND_KEY, '/ve', '/t', 'REG_SZ', '/d', `"${exe}" "${appEntryPath}" "%1"`, '/f'],
      ]);
    });

    it('builds unregister args to delete the shell key', () => {
      expect(buildUnregisterArgs()).toEqual(['delete', CONTEXT_MENU_KEY, '/f']);
    });
  });

  describe('isContextMenuSupported', () => {
    it('returns true on win32 with a non-empty execPath', () => {
      expect(isContextMenuSupported({ platform: 'win32', execPath: 'C:\\AwapiEditor.exe' })).toBe(true);
    });

    it('returns false on macOS and Linux or when execPath is empty', () => {
      expect(isContextMenuSupported({ platform: 'darwin', execPath: '/Applications/AwapiEditor' })).toBe(false);
      expect(isContextMenuSupported({ platform: 'linux', execPath: '/usr/bin/awapi-editor' })).toBe(false);
      expect(isContextMenuSupported({ platform: 'win32', execPath: '' })).toBe(false);
    });
  });

  describe('getContextMenuStatus', () => {
    it('returns supported: false on non-Windows platforms without invoking reg.exe', async () => {
      const runReg = vi.fn();
      const status = await getContextMenuStatus(createDeps({ platform: 'darwin', runReg }));
      expect(status).toEqual({ supported: false, enabled: false });
      expect(runReg).not.toHaveBeenCalled();
    });

    it('returns enabled: true when reg query succeeds with code 0', async () => {
      const runReg = vi.fn().mockResolvedValue({ code: 0, stdout: 'REG_SZ', stderr: '' });
      const status = await getContextMenuStatus(createDeps({ runReg }));
      expect(status).toEqual({ supported: true, enabled: true });
      expect(runReg).toHaveBeenCalledWith(['query', CONTEXT_MENU_COMMAND_KEY, '/ve']);
    });

    it('returns enabled: false when reg query exits non-zero or throws', async () => {
      const runRegMissing = vi.fn().mockResolvedValue({
        code: 1,
        stdout: '',
        stderr: 'ERROR: The system was unable to find the specified registry key or value.',
      });
      expect(await getContextMenuStatus(createDeps({ runReg: runRegMissing }))).toEqual({
        supported: true,
        enabled: false,
      });

      const runRegThrows = vi.fn().mockRejectedValue(new Error('spawn EACCES'));
      expect(await getContextMenuStatus(createDeps({ runReg: runRegThrows }))).toEqual({
        supported: true,
        enabled: false,
      });
    });
  });

  describe('setContextMenuEnabled', () => {
    it('fails gracefully on non-Windows platforms', async () => {
      const res = await setContextMenuEnabled(true, createDeps({ platform: 'linux' }));
      expect(res.ok).toBe(false);
      expect(res.enabled).toBe(false);
    });

    it('registers label, Icon, and command keys when enabling', async () => {
      const runReg = vi.fn().mockResolvedValue({ code: 0, stdout: 'The operation completed successfully.', stderr: '' });
      const deps = createDeps({ runReg });
      const res = await setContextMenuEnabled(true, deps);

      expect(res).toEqual({ ok: true, enabled: true });
      expect(runReg).toHaveBeenCalledTimes(3);
      expect(runReg.mock.calls.map(c => c[0])).toEqual(buildRegisterCommands(deps.execPath));
    });

    it('returns an error if any reg add command fails during enable', async () => {
      const runReg = vi
        .fn()
        .mockResolvedValueOnce({ code: 0, stdout: '', stderr: '' })
        .mockResolvedValueOnce({ code: 1, stdout: '', stderr: 'ERROR: Access is denied.' });
      const res = await setContextMenuEnabled(true, createDeps({ runReg }));

      expect(res).toEqual({
        ok: false,
        enabled: false,
        error: 'ERROR: Access is denied.',
      });
      expect(runReg).toHaveBeenCalledTimes(2);
    });

    it('deletes the registry key when disabling', async () => {
      const runReg = vi.fn().mockResolvedValue({ code: 0, stdout: '', stderr: '' });
      const res = await setContextMenuEnabled(false, createDeps({ runReg }));

      expect(res).toEqual({ ok: true, enabled: false });
      expect(runReg).toHaveBeenCalledWith(['delete', CONTEXT_MENU_KEY, '/f']);
    });

    it('treats disable as succeeding if reg delete fails because the key is already absent', async () => {
      const runReg = vi
        .fn()
        // First call: reg delete fails
        .mockResolvedValueOnce({ code: 1, stdout: '', stderr: 'ERROR: Unable to find key' })
        // Second call: reg query confirms key does not exist
        .mockResolvedValueOnce({ code: 1, stdout: '', stderr: 'ERROR: Unable to find key' });
      const res = await setContextMenuEnabled(false, createDeps({ runReg }));

      expect(res).toEqual({ ok: true, enabled: false });
    });

    it('returns an error on disable if reg delete fails and key is still present', async () => {
      const runReg = vi
        .fn()
        .mockResolvedValueOnce({ code: 1, stdout: '', stderr: 'ERROR: Access is denied.' })
        .mockResolvedValueOnce({ code: 0, stdout: 'still exists', stderr: '' });
      const res = await setContextMenuEnabled(false, createDeps({ runReg }));

      expect(res).toEqual({
        ok: false,
        enabled: true,
        error: 'ERROR: Access is denied.',
      });
    });
  });
});
