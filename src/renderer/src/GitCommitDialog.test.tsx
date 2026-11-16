import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { GitCommitDialog, getInitialCommitSelection } from './GitCommitDialog';
import { defaultDark } from './theme/ThemeContext';
import type { GitTarget } from './gitMenu';
import type { GitChangedFile } from '../../shared/git';

const target: GitTarget = { path: '/repo', isDirectory: true, isRoot: true, status: 'modified' };

describe('getInitialCommitSelection', () => {
  const files: GitChangedFile[] = [
    { path: 'src/a.ts', absPath: '/repo/src/a.ts', status: 'modified' },
    { path: 'src/new.ts', absPath: '/repo/src/new.ts', status: 'untracked' },
    { path: 'docs/b.md', absPath: '/repo/docs/b.md', status: 'staged' },
  ];
  const pick = (t: Partial<GitTarget>) =>
    [...getInitialCommitSelection(files, { path: '/repo', isDirectory: true, isRoot: false, status: 'clean', ...t })].sort();

  it('selects every versioned change for the root or an unmodified file', () => {
    expect(pick({ isRoot: true })).toEqual(['docs/b.md', 'src/a.ts']);
    expect(pick({ path: '/repo/README.md', isDirectory: false })).toEqual(['docs/b.md', 'src/a.ts']);
  });

  it('selects only the right-clicked changed file, even when untracked', () => {
    expect(pick({ path: '/repo/src/a.ts', isDirectory: false, status: 'modified' })).toEqual(['src/a.ts']);
    expect(pick({ path: '/repo/src/new.ts', isDirectory: false, status: 'untracked' })).toEqual(['src/new.ts']);
  });

  it('selects the versioned changes inside a folder, falling back to all when it has none', () => {
    expect(pick({ path: '/repo/src', status: 'modified' })).toEqual(['src/a.ts']);
    expect(pick({ path: '/repo/empty' })).toEqual(['docs/b.md', 'src/a.ts']);
  });
});

describe('GitCommitDialog', () => {
  let runGitOperation: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    runGitOperation = vi.fn(async () => ({ ok: true, output: '[main abc] msg' }));
    (window as any).electronAPI = {
      getGitChanges: vi.fn(async () => ({
        ok: true,
        repoRoot: '/repo',
        branch: 'main',
        mergeInProgress: false,
        files: [
          { path: 'a.ts', absPath: '/repo/a.ts', status: 'modified' },
          { path: 'new.ts', absPath: '/repo/new.ts', status: 'untracked' },
        ],
      })),
      getGitCommitDetails: vi.fn(async () => ({ ok: true, message: 'previous message', files: [] })),
      runGitOperation,
    };
  });

  it('preselects versioned changes, then commits the checked files', async () => {
    const onDone = vi.fn();
    render(<GitCommitDialog target={target} colors={defaultDark} onClose={vi.fn()} onDone={onDone} />);

    const tracked = (await screen.findByTestId('git-commit-files-item-a.ts')) as HTMLInputElement;
    const untracked = screen.getByTestId('git-commit-files-item-new.ts') as HTMLInputElement;
    expect(tracked.checked).toBe(true);
    expect(untracked.checked).toBe(false);
    expect(screen.getByRole('dialog').getAttribute('aria-label')).toBe('Commit to main');

    const submit = screen.getByTestId('git-commit-submit') as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.click(untracked);
    fireEvent.change(screen.getByTestId('git-commit-message'), { target: { value: 'Add feature' } });
    fireEvent.click(screen.getByTestId('git-commit-push'));

    await waitFor(() => expect(onDone).toHaveBeenCalledWith('Committed and pushed.', '[main abc] msg'));
    expect(runGitOperation).toHaveBeenCalledWith({
      kind: 'commit',
      cwd: '/repo',
      message: 'Add feature',
      paths: ['/repo/a.ts', '/repo/new.ts'],
      amend: false,
      push: true,
    });
  });

  it('prefills the last message when amending and shows errors inline', async () => {
    runGitOperation.mockResolvedValueOnce({ ok: false, error: 'hook rejected' });
    const onDone = vi.fn();
    render(<GitCommitDialog target={target} colors={defaultDark} onClose={vi.fn()} onDone={onDone} />);
    await screen.findByTestId('git-commit-files-item-a.ts');

    fireEvent.click(screen.getByTestId('git-commit-amend'));
    await waitFor(() =>
      expect((screen.getByTestId('git-commit-message') as HTMLTextAreaElement).value).toBe('previous message'),
    );
    fireEvent.click(screen.getByTestId('git-commit-submit'));
    expect((await screen.findByTestId('git-commit-error')).textContent).toContain('hook rejected');
    expect(onDone).not.toHaveBeenCalled();
  });
});
