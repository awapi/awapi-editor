import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resetGitState, type GitRunResult } from './git';
import {
  getGitChanges,
  getGitCommitDetails,
  getGitDiff,
  getGitLog,
  runGitOperation,
  toRepoPathspec,
  type GitCommandDeps,
} from './gitCommands';

const OK = (stdout = ''): GitRunResult => ({ code: 0, stdout, stderr: '' });
const FAIL = (stderr = 'boom', code = 1): GitRunResult => ({ code, stdout: '', stderr });

/** Fake deps for a repo at `/repo`; `respond` handles everything except repo resolution. */
function makeDeps(respond: (args: string[]) => GitRunResult = () => OK(), files: Record<string, string> = {}) {
  const calls: string[][] = [];
  const written: Record<string, string> = {};
  const deps: GitCommandDeps = {
    platform: 'linux',
    runGit: vi.fn(async (args: string[]) => {
      if (args[0] === 'rev-parse' && args[1] === '--show-toplevel') return OK('/repo\n/repo/.git\n');
      // Strip the global flag so assertions read naturally.
      const rest = args[0] === '--literal-pathspecs' ? args.slice(1) : args;
      calls.push(rest);
      return respond(rest);
    }),
    watchDir: () => null,
    relativePath: (from, to) => (to === from ? '' : to.startsWith(from + '/') ? to.slice(from.length + 1) : `../${to}`),
    isAbsolute: p => p.startsWith('/'),
    realPath: p => p,
    readTextFile: p => (p in files ? files[p] : null),
    writeTextFile: (p, c) => {
      written[p] = c;
    },
  };
  return { deps, calls, written };
}

beforeEach(() => resetGitState());

describe('toRepoPathspec', () => {
  it('maps paths to repo-relative specs and rejects paths outside the repo', () => {
    const { deps } = makeDeps();
    expect(toRepoPathspec('/repo', '/repo', deps)).toBe('.');
    expect(toRepoPathspec('/repo', '/repo/src/a.ts', deps)).toBe('src/a.ts');
    expect(toRepoPathspec('/repo', '/elsewhere/a.ts', deps)).toBeNull();
    expect(toRepoPathspec('/repo', '', deps)).toBeNull();
  });
});

describe('runGitOperation', () => {
  it('refuses paths outside the repository', async () => {
    const { deps, calls } = makeDeps();
    expect(await runGitOperation({ kind: 'add', cwd: '/repo', paths: ['/etc/passwd'] }, deps)).toEqual({
      ok: false,
      error: 'Invalid paths.',
    });
    expect(calls).toHaveLength(0);
  });

  it('runs network commands without terminal prompts and reports failures', async () => {
    const { deps } = makeDeps(args => (args[0] === 'pull' ? FAIL('fatal: no upstream') : OK()));
    expect(await runGitOperation({ kind: 'pull', cwd: '/repo/src' }, deps)).toEqual({ ok: false, error: 'fatal: no upstream' });
    const pullCall = vi.mocked(deps.runGit).mock.calls.find(([args]) => args.includes('pull'));
    expect(pullCall?.[1]).toBe('/repo');
    expect(pullCall?.[2]?.env).toEqual({ GIT_TERMINAL_PROMPT: '0' });
  });

  it('publishes a branch without upstream to origin on push', async () => {
    const { deps, calls } = makeDeps(args => {
      if (args.includes('@{u}')) return FAIL('no upstream', 128);
      if (args[0] === 'remote') return OK('upstream\norigin\n');
      return OK('pushed');
    });
    expect(await runGitOperation({ kind: 'push', cwd: '/repo' }, deps)).toEqual({ ok: true, output: 'pushed' });
    expect(calls.at(-1)).toEqual(['push', '--set-upstream', 'origin', 'HEAD']);
  });

  it('commits only the selected files, then pushes when asked', async () => {
    const { deps, calls } = makeDeps(args => (args[0] === 'rev-parse' ? FAIL('', 1) : OK()));
    const res = await runGitOperation(
      { kind: 'commit', cwd: '/repo', message: ' Fix bug ', paths: ['/repo/a.ts', '/repo/new.ts'], amend: false, push: true },
      deps,
    );
    expect(res.ok).toBe(true);
    expect(calls).toContainEqual(['add', '-A', '--', 'a.ts', 'new.ts']);
    expect(calls).toContainEqual(['commit', '-m', 'Fix bug', '--only', '--', 'a.ts', 'new.ts']);
    expect(calls.some(c => c[0] === 'push')).toBe(true);
  });

  it('commits everything staged during a merge and validates input', async () => {
    const { deps, calls } = makeDeps();
    await runGitOperation({ kind: 'commit', cwd: '/repo', message: 'merge', paths: ['/repo/a.ts'], amend: false, push: false }, deps);
    expect(calls.at(-1)).toEqual(['commit', '-m', 'merge']);

    expect(await runGitOperation({ kind: 'commit', cwd: '/repo', message: '  ', paths: ['/repo/a.ts'], amend: false, push: false }, deps)).toEqual({
      ok: false,
      error: 'Commit message cannot be empty.',
    });
    expect(await runGitOperation({ kind: 'commit', cwd: '/repo', message: 'x', paths: [], amend: false, push: false }, deps)).toEqual({
      ok: false,
      error: 'Select at least one file to commit.',
    });
  });

  it('restores tracked files from HEAD but only unstages newly added ones', async () => {
    const { deps, calls } = makeDeps();
    await runGitOperation(
      {
        kind: 'revert',
        cwd: '/repo',
        files: [
          { path: '/repo/a.ts', status: 'modified' },
          { path: '/repo/new.ts', status: 'added' },
        ],
      },
      deps,
    );
    expect(calls).toEqual([
      ['restore', '--source=HEAD', '--staged', '--worktree', '--', 'a.ts'],
      ['rm', '--cached', '-r', '-q', '--', 'new.ts'],
    ]);
  });

  it('unstages with rm --cached before the first commit', async () => {
    const { deps, calls } = makeDeps(args => (args[0] === 'rev-parse' ? FAIL('', 1) : OK()));
    await runGitOperation({ kind: 'unstage', cwd: '/repo', paths: ['/repo/a.ts'] }, deps);
    expect(calls.at(-1)).toEqual(['rm', '--cached', '-r', '-q', '--', 'a.ts']);
  });

  it('rejects branch names that look like options', async () => {
    const { deps, calls } = makeDeps();
    expect(await runGitOperation({ kind: 'createBranch', cwd: '/repo', name: '--force', checkout: true }, deps)).toEqual({
      ok: false,
      error: 'Invalid branch name.',
    });
    expect(await runGitOperation({ kind: 'switch', cwd: '/repo', branch: '-f', remote: false }, deps)).toEqual({
      ok: false,
      error: 'Invalid branch name.',
    });
    expect(calls).toHaveLength(0);
  });

  it('creates and switches branches', async () => {
    const { deps, calls } = makeDeps();
    await runGitOperation({ kind: 'createBranch', cwd: '/repo', name: 'feature/x', checkout: true }, deps);
    expect(calls.at(-1)).toEqual(['switch', '-c', 'feature/x']);
    await runGitOperation({ kind: 'switch', cwd: '/repo', branch: 'origin/y', remote: true }, deps);
    expect(calls.at(-1)).toEqual(['switch', '--track', 'origin/y']);
  });

  it('appends to .gitignore once and warns when the path is tracked', async () => {
    const { deps, written } = makeDeps(args => (args[0] === 'ls-files' ? OK('dist/a.js\n') : OK()), {
      '/repo/.gitignore': 'node_modules/\n',
    });
    const res = await runGitOperation(
      { kind: 'ignore', cwd: '/repo', path: '/repo/dist', isDirectory: true, byExtension: false },
      deps,
    );
    expect(written['/repo/.gitignore']).toBe('node_modules/\n/dist/\n');
    expect(res.ok && res.output).toContain('already tracked');
  });
});

describe('getGitChanges / getGitDiff', () => {
  it('lists changed files with absolute paths, excluding ignored ones', async () => {
    const { deps } = makeDeps(args => {
      if (args.includes('status')) return OK(' M src/a.ts\0?? new.ts\0!! dist/\0');
      if (args[0] === 'symbolic-ref') return OK('main\n');
      return FAIL('', 1);
    });
    expect(await getGitChanges('/repo', '/repo', deps)).toEqual({
      ok: true,
      repoRoot: '/repo',
      branch: 'main',
      mergeInProgress: false,
      files: [
        { path: 'src/a.ts', status: 'modified', absPath: '/repo/src/a.ts' },
        { path: 'new.ts', status: 'untracked', absPath: '/repo/new.ts' },
      ],
    });
    const statusArgs = () =>
      (deps.runGit as ReturnType<typeof vi.fn>).mock.calls.filter(([args]) => args.includes('status')).at(-1)?.[0];
    await getGitChanges('/repo', '/repo/src', deps);
    expect(statusArgs()?.at(-1)).toBe('src');

    // Without a scope the whole repository is listed.
    await getGitChanges('/repo/src', undefined, deps);
    expect(statusArgs()?.at(-1)).toBe('.');
  });

  it('diffs HEAD against the working tree, treating new files as empty originals', async () => {
    const { deps } = makeDeps(args => (args[1] === 'HEAD:a.ts' ? OK('old\n') : FAIL('missing', 128)), {
      '/repo/a.ts': 'new\n',
      '/repo/b.ts': 'fresh\n',
      '/repo/img.bin': 'a\0b',
    });
    expect(await getGitDiff('/repo', '/repo/a.ts', deps)).toEqual({ ok: true, original: 'old\n', modified: 'new\n', binary: false });
    expect(await getGitDiff('/repo', '/repo/b.ts', deps)).toEqual({ ok: true, original: '', modified: 'fresh\n', binary: false });
    expect(await getGitDiff('/repo', '/repo/img.bin', deps)).toEqual({ ok: true, original: '', modified: '', binary: true });
  });
});

describe('log / commit details / commit diffs', () => {
  it('logs with decorations, following files and optionally across all branches', async () => {
    const { deps, calls } = makeDeps(() => OK(''));
    await getGitLog('/repo', '/repo/a.ts', false, true, deps);
    const args = calls.at(-1)!;
    expect(args).toEqual(expect.arrayContaining(['log', '--decorate=full', '--all', '--follow']));
    expect(args.slice(-2)).toEqual(['--', 'a.ts']);
  });

  it('diffs a commit against its first parent, or with --root for the first commit', async () => {
    const { deps, calls } = makeDeps(args => {
      if (args[0] === 'rev-parse') return args[3] === 'abc1234^1' ? OK('parent123\n') : FAIL('', 1);
      if (args[0] === 'show') return OK('Message\n');
      return OK('');
    });
    await getGitCommitDetails('/repo', 'abc1234', deps);
    expect(calls.find(a => a.includes('--name-status'))?.slice(-2)).toEqual(['parent123', 'abc1234']);

    await getGitCommitDetails('/repo', 'fedcba9', deps);
    expect(calls.filter(a => a.includes('--name-status')).at(-1)?.slice(-2)).toEqual(['--root', 'fedcba9']);
    expect(await getGitCommitDetails('/repo', 'HEAD; rm', deps)).toEqual({ ok: false, error: 'Invalid commit.' });
  });

  it('reads both sides of a commit diff from Git, using the old path for renames', async () => {
    const { deps } = makeDeps(args => {
      if (args[1] === 'abc1234^:old.ts') return OK('before\n');
      if (args[1] === 'abc1234:new.ts') return OK('after\n');
      return FAIL('missing', 128);
    });
    expect(await getGitDiff('/repo', '/repo/new.ts', deps, { revision: 'abc1234', oldPath: '/repo/old.ts' })).toEqual({
      ok: true,
      original: 'before\n',
      modified: 'after\n',
      binary: false,
    });
    expect(await getGitDiff('/repo', '/repo/new.ts', deps, { revision: '--output=x' })).toEqual({ ok: false, error: 'Invalid commit.' });
  });
});