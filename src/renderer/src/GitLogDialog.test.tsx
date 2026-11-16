import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GitLogDialog, filterGitCommits, toDisplayFiles } from './GitLogDialog';
import { defaultDark } from './theme/ThemeContext';
import type { GitLogCommit } from '../../shared/git';

const commits: GitLogCommit[] = [
  {
    hash: 'aaa1111',
    shortHash: 'aaa1111',
    parents: ['bbb2222'],
    author: 'Ann',
    date: '2026-01-02T03:04:05Z',
    refs: [
      { name: 'main', kind: 'head' },
      { name: 'origin/main', kind: 'remote' },
      { name: 'v1', kind: 'tag' },
    ],
    subject: 'Fix login',
  },
  { hash: 'bbb2222', shortHash: 'bbb2222', parents: [], author: 'Bob', date: '2026-01-01T00:00:00Z', refs: [], subject: 'Add tests' },
];

describe('filterGitCommits', () => {
  it('matches subject, author, hash prefix, or ref name case-insensitively', () => {
    expect(filterGitCommits(commits, 'LOGIN').map(c => c.shortHash)).toEqual(['aaa1111']);
    expect(filterGitCommits(commits, 'bob').map(c => c.shortHash)).toEqual(['bbb2222']);
    expect(filterGitCommits(commits, 'bbb2').map(c => c.shortHash)).toEqual(['bbb2222']);
    expect(filterGitCommits(commits, 'origin/').map(c => c.shortHash)).toEqual(['aaa1111']);
    expect(filterGitCommits(commits, ' ')).toHaveLength(2);
  });
});

describe('toDisplayFiles', () => {
  it('builds absolute paths and readable statuses, including renames', () => {
    expect(
      toDisplayFiles([{ status: 'R', path: 'src/new.ts', oldPath: 'src/old.ts', added: 1, removed: 2 }], 'C:/repo'),
    ).toEqual([
      {
        path: 'src/new.ts',
        absPath: 'C:/repo/src/new.ts',
        oldAbsPath: 'C:/repo/src/old.ts',
        statusLabel: 'Renamed (from src/old.ts)',
        status: 'renamed',
        added: 1,
        removed: 2,
      },
    ]);
  });
});

describe('GitLogDialog', () => {
  let api: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    api = {
      getGitLog: vi.fn(async () => ({ ok: true, repoRoot: 'C:/repo', commits })),
      getGitChanges: vi.fn(async () => ({
        ok: true,
        repoRoot: 'C:/repo',
        branch: 'main',
        mergeInProgress: false,
        files: [{ path: 'src/wip.ts', absPath: 'C:/repo/src/wip.ts', status: 'modified' }],
      })),
      getGitCommitDetails: vi.fn(async (_cwd: string, hash: string) => ({
        ok: true,
        message: hash === 'aaa1111' ? 'Fix login\n\nLonger body' : 'Add tests',
        files: [
          { status: 'M', path: 'src/login.ts', added: 5, removed: 2 },
          { status: 'A', path: 'docs/readme.md', added: 10, removed: 0 },
        ],
      })),
    };
    (window as any).electronAPI = api;
  });

  const renderLog = (onOpenDiff = vi.fn()) => {
    render(
      <GitLogDialog
        target={{ path: 'C:/repo/src', isDirectory: true, isRoot: false, status: 'modified' }}
        colors={defaultDark}
        activeRowBg="#37373d"
        onClose={vi.fn()}
        onOpenDiff={onOpenDiff}
      />,
    );
    return onOpenDiff;
  };

  it('lists working-tree changes first, then commits with branch and tag labels', async () => {
    renderLog();
    expect(await screen.findByTestId('git-log-worktree')).toBeTruthy();
    expect(screen.getByTestId('git-log-worktree').getAttribute('aria-selected')).toBe('true');
    expect(screen.getByTestId('git-log-ref-head-main')).toBeTruthy();
    expect(screen.getByTestId('git-log-ref-remote-origin/main')).toBeTruthy();
    expect(screen.getByTestId('git-log-ref-tag-v1')).toBeTruthy();
    expect(await screen.findByTestId('git-log-file-src/wip.ts')).toBeTruthy();
    expect(screen.getByTestId('git-log-status').textContent).toContain('Showing 2 revision(s)');
  });

  it('shows commit details and line counts, dims files outside the logged folder, and opens commit diffs', async () => {
    const onOpenDiff = renderLog();
    fireEvent.click(await screen.findByTestId('git-log-commit-aaa1111'));

    await waitFor(() => expect(screen.getByTestId('git-log-details').textContent).toContain('SHA-1: aaa1111'));
    expect(screen.getByTestId('git-log-details').textContent).toContain('Longer body');
    const inside = screen.getByTestId('git-log-file-src/login.ts');
    expect(inside.textContent).toContain('Modified');
    expect(inside.textContent).toContain('5');
    expect(inside.style.opacity).toBe('1');
    expect(screen.getByTestId('git-log-file-docs/readme.md').style.opacity).toBe('0.5');
    expect(screen.getByTestId('git-log-status').textContent).toContain('2 file(s), +15 −2');

    fireEvent.doubleClick(inside);
    expect(onOpenDiff).toHaveBeenCalledWith({
      absPath: 'C:/repo/src/login.ts',
      status: 'modified',
      repoRoot: 'C:/repo',
      revision: 'aaa1111',
    });
  });

  it('opens working-tree diffs without a revision and reloads across all branches', async () => {
    const onOpenDiff = renderLog();
    fireEvent.doubleClick(await screen.findByTestId('git-log-file-src/wip.ts'));
    expect(onOpenDiff).toHaveBeenCalledWith({ absPath: 'C:/repo/src/wip.ts', status: 'modified', repoRoot: 'C:/repo' });

    fireEvent.click(screen.getByTestId('git-log-all-branches'));
    await waitFor(() => expect(api.getGitLog).toHaveBeenLastCalledWith('C:/repo/src', 'C:/repo/src', true, true));
  });

  it('moves the selection with the arrow keys', async () => {
    renderLog();
    const list = await screen.findByTestId('git-log-list');
    await screen.findByTestId('git-log-worktree');
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    expect(screen.getByTestId('git-log-commit-aaa1111').getAttribute('aria-selected')).toBe('true');
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    expect(screen.getByTestId('git-log-commit-bbb2222').getAttribute('aria-selected')).toBe('true');
  });
});
