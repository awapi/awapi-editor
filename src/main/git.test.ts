import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  GIT_WATCH_DEBOUNCE_MS,
  getGitStatus,
  getGitStatusCoalesced,
  isRelevantGitDirChange,
  resetGitState,
  syncGitRepoWatch,
  type GitDeps,
  type GitRunResult,
} from './git';

const REV_PARSE = { code: 0, stdout: '/repo\n/repo/.git\n', stderr: '' };

function makeDeps(overrides: Partial<GitDeps> = {}): GitDeps {
  return {
    platform: 'linux',
    runGit: vi.fn(async (args: string[]) =>
      args[0] === 'rev-parse' ? REV_PARSE : { code: 0, stdout: ' M a.ts\0', stderr: '' },
    ),
    watchDir: vi.fn(() => ({ close: vi.fn() })),
    ...overrides,
  };
}

beforeEach(() => resetGitState());
afterEach(() => {
  resetGitState();
  vi.useRealTimers();
});

describe('getGitStatus', () => {
  it('resolves the repo root and runs a lock-free status there', async () => {
    const deps = makeDeps({ platform: 'win32' });
    const res = await getGitStatus('/repo/src', deps);
    expect(res).toEqual({
      ok: true,
      repoRoot: '/repo',
      caseInsensitive: true,
      entries: [{ path: 'a.ts', status: 'modified' }],
    });
    const statusCall = vi.mocked(deps.runGit).mock.calls[1];
    expect(statusCall[0]).toContain('--no-optional-locks');
    expect(statusCall[1]).toBe('/repo');
  });

  it('reports non-repositories and missing Git', async () => {
    const notRepo = makeDeps({ runGit: vi.fn(async () => ({ code: 128, stdout: '', stderr: 'fatal' })) });
    expect(await getGitStatus('/plain', notRepo)).toEqual({ ok: false, reason: 'not-a-repo' });

    const noGit = makeDeps({ runGit: vi.fn(async () => ({ code: null, stdout: '', stderr: '' })) });
    expect(await getGitStatus('/plain', noGit)).toEqual({ ok: false, reason: 'git-unavailable' });
  });

  it('caches the resolved repository between calls', async () => {
    const deps = makeDeps();
    await getGitStatus('/repo', deps);
    await getGitStatus('/repo', deps);
    const revParseCalls = vi.mocked(deps.runGit).mock.calls.filter(([args]) => args[0] === 'rev-parse');
    expect(revParseCalls).toHaveLength(1);
  });
});

describe('getGitStatusCoalesced', () => {
  it('runs at most one queued follow-up while a status is in flight', async () => {
    const pending: Array<(r: GitRunResult) => void> = [];
    const runGit = vi.fn((args: string[]) =>
      args[0] === 'rev-parse'
        ? Promise.resolve(REV_PARSE)
        : new Promise<GitRunResult>(resolve => pending.push(resolve)),
    );
    const deps = makeDeps({ runGit });

    const first = getGitStatusCoalesced('/repo', deps);
    const second = getGitStatusCoalesced('/repo', deps);
    const third = getGitStatusCoalesced('/repo', deps);
    expect(third).toBe(second);

    await vi.waitFor(() => expect(pending).toHaveLength(1));
    pending[0]({ code: 0, stdout: '', stderr: '' });
    await first;
    await vi.waitFor(() => expect(pending).toHaveLength(2));
    pending[1]({ code: 0, stdout: '?? b.ts\0', stderr: '' });
    const res = await second;
    expect(res.ok && res.entries).toEqual([{ path: 'b.ts', status: 'untracked' }]);
    expect(runGit.mock.calls.filter(([args]) => args[1] === 'status')).toHaveLength(2);
  });
});

describe('syncGitRepoWatch', () => {
  it('ignores lock files', () => {
    expect(isRelevantGitDirChange('index.lock')).toBe(false);
    expect(isRelevantGitDirChange('index')).toBe(true);
    expect(isRelevantGitDirChange(null)).toBe(true);
  });

  it('watches the git dir and debounces change notifications', async () => {
    vi.useFakeTimers();
    let emit: (filename: string | null) => void = () => {};
    const deps = makeDeps({
      watchDir: vi.fn((_dir, onEvent) => {
        emit = onEvent;
        return { close: vi.fn() };
      }),
    });
    const onChange = vi.fn();
    await syncGitRepoWatch('/repo', deps, onChange);
    expect(deps.watchDir).toHaveBeenCalledWith('/repo/.git', expect.any(Function));

    emit('index.lock');
    emit('index');
    emit('HEAD');
    vi.advanceTimersByTime(GIT_WATCH_DEBOUNCE_MS);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('/repo');
  });

  it('keeps one watcher per repo and closes it when cleared', async () => {
    const close = vi.fn();
    const deps = makeDeps({ watchDir: vi.fn(() => ({ close })) });
    await syncGitRepoWatch('/repo', deps, vi.fn());
    await syncGitRepoWatch('/repo', deps, vi.fn());
    expect(deps.watchDir).toHaveBeenCalledTimes(1);
    await syncGitRepoWatch(null, deps, vi.fn());
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('drops a superseded request that resolves late', async () => {
    let resolveSlow: (r: GitRunResult) => void = () => {};
    const runGit = vi.fn((_args: string[], cwd: string) =>
      cwd === '/slow'
        ? new Promise<GitRunResult>(resolve => (resolveSlow = resolve))
        : Promise.resolve(REV_PARSE),
    );
    const deps = makeDeps({ runGit });
    const slow = syncGitRepoWatch('/slow', deps, vi.fn());
    await syncGitRepoWatch(null, deps, vi.fn());
    resolveSlow({ code: 0, stdout: '/slow\n/slow/.git\n', stderr: '' });
    await slow;
    expect(deps.watchDir).not.toHaveBeenCalled();
  });
});
