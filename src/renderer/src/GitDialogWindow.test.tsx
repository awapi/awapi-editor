import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import GitDialogWindow from './GitDialogWindow';
import { defaultDark } from './theme/ThemeContext';
import type { GitDialogRequest } from '../../shared/gitDialog';

const request: GitDialogRequest = {
  kind: 'createBranch',
  target: { path: '/repo', isDirectory: true, isRoot: true, status: 'clean' },
  colors: defaultDark,
  isLightTheme: false,
  activeRowBg: '#37373d',
};

describe('GitDialogWindow', () => {
  let api: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    api = {
      getGitDialogRequest: vi.fn(async () => request),
      getGitBranches: vi.fn(async () => ({ ok: true, branches: [{ name: 'main', remote: false, current: true, upstream: null }] })),
      runGitOperation: vi.fn(async () => ({ ok: true, output: "Switched to a new branch 'topic'" })),
      completeGitDialog: vi.fn(async () => {}),
      closeGitDialog: vi.fn(async () => {}),
    };
    (window as any).electronAPI = api;
  });

  it('renders the requested dialog, sets the window title, and reports success to the opener', async () => {
    render(<GitDialogWindow />);
    const input = await screen.findByTestId('git-branch-name');
    expect(document.title).toBe('Create Branch');

    fireEvent.change(input, { target: { value: 'topic' } });
    fireEvent.click(screen.getByTestId('git-branch-submit'));

    await waitFor(() =>
      expect(api.completeGitDialog).toHaveBeenCalledWith({
        summary: 'Created branch topic and switched to it.',
        output: "Switched to a new branch 'topic'",
      }),
    );
    expect(api.runGitOperation).toHaveBeenCalledWith({ kind: 'createBranch', cwd: '/repo', name: 'topic', checkout: true });
  });

  it('closes the window on Escape', async () => {
    render(<GitDialogWindow />);
    await screen.findByTestId('git-branch-name');
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(api.closeGitDialog).toHaveBeenCalledTimes(1);
    expect(api.completeGitDialog).not.toHaveBeenCalled();
  });

  it('opens a diff window when a commit file is double-clicked; clicking the name does not toggle it', async () => {
    api.getGitDialogRequest.mockResolvedValue({ ...request, kind: 'commit' });
    api.getGitChanges = vi.fn(async () => ({
      ok: true,
      repoRoot: 'C:/repo',
      branch: 'main',
      mergeInProgress: false,
      files: [{ path: 'src/gone.ts', absPath: 'C:/repo/src/gone.ts', status: 'deleted' }],
    }));
    api.openGitDialog = vi.fn(async () => null);
    render(<GitDialogWindow />);

    const checkbox = (await screen.findByTestId('git-commit-files-item-src/gone.ts')) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
    const row = screen.getByTestId('git-commit-files-row-src/gone.ts');
    fireEvent.click(screen.getByText('src/gone.ts'));
    expect(checkbox.checked).toBe(true);

    fireEvent.doubleClick(row);
    expect(api.openGitDialog).toHaveBeenCalledWith({
      ...request,
      kind: 'diff',
      target: { path: 'C:/repo/src/gone.ts', isDirectory: false, isRoot: false, status: 'deleted', cwd: 'C:/repo' },
    });

    // Double-clicking the checkbox toggles it twice but does not open a diff.
    api.openGitDialog.mockClear();
    fireEvent.doubleClick(checkbox);
    expect(api.openGitDialog).not.toHaveBeenCalled();
  });
});
