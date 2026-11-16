import React, { useCallback, useEffect, useState } from 'react';
import type { GitDialogRequest } from '../../shared/gitDialog';
import type { GitChangedFile } from '../../shared/git';
import { GitCommitDialog } from './GitCommitDialog';
import { GitRevertDialog } from './GitRevertDialog';
import { GitDiffDialog } from './GitDiffDialog';
import { GitLogDialog, type GitLogDiffRequest } from './GitLogDialog';
import { GitBranchDialog } from './GitBranchDialog';

/**
 * Root component of a Git dialog window (`#git-dialog`). Fetches the request it
 * was opened with and renders the matching dialog; results go back to the
 * opener through the main process.
 */
const GitDialogWindow: React.FC = () => {
  const [request, setRequest] = useState<GitDialogRequest | null>(null);

  useEffect(() => {
    void window.electronAPI.getGitDialogRequest().then(setRequest);
  }, []);

  useEffect(() => {
    if (!request) return;
    document.body.style.margin = '0';
    document.body.style.backgroundColor = request.colors.background;
  }, [request]);

  const close = useCallback(() => {
    void window.electronAPI.closeGitDialog();
  }, []);

  const done = useCallback((summary: string, output: string) => {
    void window.electronAPI.completeGitDialog({ summary, output });
  }, []);

  /** Opens a read-only diff window (modal to this one) for a file listed in Commit / Revert. */
  const openDiff = useCallback(
    (file: GitChangedFile) => {
      if (!request) return;
      // `absPath` is the repo root joined with the repo-relative `path`; run Git from the
      // root since a deleted file's folder may no longer exist.
      const repoRoot = file.absPath.slice(0, file.absPath.length - file.path.length - 1);
      void window.electronAPI.openGitDialog({
        ...request,
        kind: 'diff',
        target: { path: file.absPath, isDirectory: false, isRoot: false, status: file.status, cwd: repoRoot },
      });
    },
    [request],
  );

  /** Opens a diff window for a file in the Log: a commit's change, or a working-tree change. */
  const openLogDiff = useCallback(
    (diff: GitLogDiffRequest) => {
      if (!request) return;
      void window.electronAPI.openGitDialog({
        ...request,
        kind: 'diff',
        target: {
          path: diff.absPath,
          isDirectory: false,
          isRoot: false,
          status: diff.status,
          cwd: diff.repoRoot,
          ...(diff.revision ? { revision: diff.revision } : {}),
          ...(diff.oldAbsPath ? { oldPath: diff.oldAbsPath } : {}),
        },
      });
    },
    [request],
  );

  if (!request) return null;
  const { kind, target, colors, isLightTheme, activeRowBg } = request;

  switch (kind) {
    case 'commit':
      return <GitCommitDialog target={target} colors={colors} onClose={close} onDone={done} onOpenDiff={openDiff} />;
    case 'revert':
      return <GitRevertDialog target={target} colors={colors} onClose={close} onDone={done} onOpenDiff={openDiff} />;
    case 'diff':
      return <GitDiffDialog target={target} colors={colors} isLightTheme={isLightTheme} onClose={close} />;
    case 'log':
      return <GitLogDialog target={target} colors={colors} activeRowBg={activeRowBg} onClose={close} onOpenDiff={openLogDiff} />;
    case 'switch':
    case 'createBranch':
      return (
        <GitBranchDialog
          mode={kind === 'switch' ? 'switch' : 'create'}
          target={target}
          colors={colors}
          activeRowBg={activeRowBg}
          onClose={close}
          onDone={done}
        />
      );
    default:
      return null;
  }
};

export default GitDialogWindow;
