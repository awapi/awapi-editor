import React, { useCallback, useEffect, useState } from 'react';
import type { GitChangedFile } from '../../shared/git';
import type { ThemeColors } from './theme/ThemeContext';
import { GIT_ERROR_COLOR, GitFileChecklist, GitModal, gitButtonStyle, gitInputStyle } from './GitDialogCommon';
import { getGitTargetCwd, isPathWithin, type GitTarget } from './gitMenu';

interface GitCommitDialogProps {
  target: GitTarget;
  colors: ThemeColors;
  onClose: () => void;
  /** Called after a successful commit (and push, if requested) with Git's output. */
  onDone: (summary: string, output: string) => void;
  /** Opens the HEAD vs working-tree diff of a listed file (row double-click). */
  onOpenDiff?: (file: GitChangedFile) => void;
}

/**
 * Files ticked when the commit window opens. The list always covers the whole
 * repository; the right-clicked item narrows the initial selection: a changed
 * file selects just itself (even if untracked), a folder selects the versioned
 * changes inside it, and anything else (the root, an unmodified file, or a
 * folder without changes) selects every versioned change, like TortoiseGit.
 */
export function getInitialCommitSelection(files: GitChangedFile[], target: GitTarget): Set<string> {
  const versioned = files.filter(f => f.status !== 'untracked');
  if (!target.isRoot) {
    const scoped = target.isDirectory
      ? versioned.filter(f => isPathWithin(f.absPath, target.path))
      : files.filter(f => isPathWithin(f.absPath, target.path));
    if (scoped.length > 0) return new Set(scoped.map(f => f.path));
  }
  return new Set(versioned.map(f => f.path));
}

/** TortoiseGit-style commit dialog: pick files, write a message, optionally amend and push. */
export const GitCommitDialog: React.FC<GitCommitDialogProps> = ({ target, colors, onClose, onDone, onOpenDiff }) => {
  const cwd = getGitTargetCwd(target);
  const [files, setFiles] = useState<GitChangedFile[] | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [repoRoot, setRepoRoot] = useState<string | null>(null);
  const [branch, setBranch] = useState<string | null>(null);
  const [merging, setMerging] = useState(false);
  const [message, setMessage] = useState('');
  const [amend, setAmend] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    // No scope: list every change in the repository.
    void window.electronAPI.getGitChanges(cwd).then(res => {
      if (cancelled) return;
      if (!res.ok) {
        setError(res.error);
        setFiles([]);
        return;
      }
      setFiles(res.files);
      setRepoRoot(res.repoRoot);
      setBranch(res.branch);
      setMerging(res.mergeInProgress);
      setChecked(getInitialCommitSelection(res.files, target));
    });
    return () => {
      cancelled = true;
    };
  }, [cwd, target]);

  const toggleAmend = async (next: boolean) => {
    setAmend(next);
    if (next && !message.trim()) {
      const res = await window.electronAPI.getGitCommitDetails(cwd, 'HEAD');
      if (res.ok) setMessage(prev => prev || res.message);
    }
  };

  const selected = (files ?? []).filter(f => checked.has(f.path));
  const canCommit = !busy && !!message.trim() && (selected.length > 0 || amend);

  const submit = useCallback(
    async (push: boolean) => {
      if (!canCommit) return;
      setBusy(true);
      setError(null);
      const res = await window.electronAPI.runGitOperation({
        kind: 'commit',
        cwd,
        message,
        paths: selected.map(f => f.absPath),
        amend,
        push,
      });
      setBusy(false);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onDone(push ? 'Committed and pushed.' : 'Committed.', res.output);
    },
    [canCommit, cwd, message, selected, amend, onDone],
  );

  return (
    <GitModal
      title={`Commit${branch ? ` to ${branch}` : ''}`}
      testId="git-commit-dialog"
      colors={colors}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} style={gitButtonStyle(colors)}>
            Cancel
          </button>
          <button
            type="button"
            data-testid="git-commit-push"
            disabled={!canCommit}
            onClick={() => void submit(true)}
            style={gitButtonStyle(colors, 'secondary', !canCommit)}
          >
            Commit &amp; Push
          </button>
          <button
            type="button"
            data-testid="git-commit-submit"
            disabled={!canCommit}
            onClick={() => void submit(false)}
            style={gitButtonStyle(colors, 'primary', !canCommit)}
          >
            {busy ? 'Committing…' : 'Commit'}
          </button>
        </>
      }
    >
      <div style={{ fontSize: '12px', opacity: 0.7, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={repoRoot ?? ''}>
        {repoRoot ?? ''}
      </div>
      <textarea
        data-testid="git-commit-message"
        autoFocus
        placeholder="Commit message (Ctrl+Enter to commit)"
        value={message}
        onChange={e => setMessage(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            void submit(false);
          }
        }}
        rows={5}
        style={{ ...gitInputStyle(colors), resize: 'vertical', fontFamily: 'inherit' }}
      />
      <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
        <input
          type="checkbox"
          data-testid="git-commit-amend"
          checked={amend}
          onChange={e => void toggleAmend(e.target.checked)}
        />
        Amend last commit
      </label>
      {merging && (
        <div style={{ fontSize: '12px', color: '#e3a008' }}>
          A merge is in progress: the selected files are staged and every staged change is committed.
        </div>
      )}
      {files === null ? (
        <div style={{ opacity: 0.7 }}>Loading changes…</div>
      ) : files.length === 0 && !error ? (
        <div data-testid="git-commit-empty" style={{ opacity: 0.7 }}>
          No changes to commit{amend ? '; amending only updates the message.' : '.'}
        </div>
      ) : (
        <GitFileChecklist files={files} checked={checked} onChange={setChecked} colors={colors} testId="git-commit-files" onOpenFile={onOpenDiff} />
      )}
      {error && (
        <div data-testid="git-commit-error" style={{ color: GIT_ERROR_COLOR, fontSize: '12px', whiteSpace: 'pre-wrap', maxHeight: '120px', overflow: 'auto' }}>
          {error}
        </div>
      )}
    </GitModal>
  );
};

export default GitCommitDialog;
