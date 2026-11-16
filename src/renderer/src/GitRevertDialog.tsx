import React, { useEffect, useState } from 'react';
import type { GitChangedFile } from '../../shared/git';
import type { ThemeColors } from './theme/ThemeContext';
import { GIT_ERROR_COLOR, GitFileChecklist, GitModal, gitButtonStyle } from './GitDialogCommon';
import { getGitTargetCwd, type GitTarget } from './gitMenu';

interface GitRevertDialogProps {
  target: GitTarget;
  colors: ThemeColors;
  onClose: () => void;
  onDone: (summary: string, output: string) => void;
  /** Opens the HEAD vs working-tree diff of a listed file (row double-click). */
  onOpenDiff?: (file: GitChangedFile) => void;
}

/** Confirms which changed files to revert to HEAD (discarding local edits). */
export const GitRevertDialog: React.FC<GitRevertDialogProps> = ({ target, colors, onClose, onDone, onOpenDiff }) => {
  const cwd = getGitTargetCwd(target);
  const [files, setFiles] = useState<GitChangedFile[] | null>(null);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void window.electronAPI.getGitChanges(cwd, target.path).then(res => {
      if (cancelled) return;
      if (!res.ok) {
        setError(res.error);
        setFiles([]);
        return;
      }
      // Untracked files have nothing to revert to.
      const revertible = res.files.filter(f => f.status !== 'untracked');
      setFiles(revertible);
      setChecked(new Set(revertible.map(f => f.path)));
    });
    return () => {
      cancelled = true;
    };
  }, [cwd, target.path]);

  const selected = (files ?? []).filter(f => checked.has(f.path));
  const canRevert = !busy && selected.length > 0;

  const submit = async () => {
    if (!canRevert) return;
    setBusy(true);
    setError(null);
    const res = await window.electronAPI.runGitOperation({
      kind: 'revert',
      cwd,
      files: selected.map(f => ({ path: f.absPath, status: f.status })),
    });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onDone(`Reverted ${selected.length} file${selected.length === 1 ? '' : 's'}.`, res.output);
  };

  return (
    <GitModal
      title="Revert"
      testId="git-revert-dialog"
      colors={colors}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} style={gitButtonStyle(colors)}>
            Cancel
          </button>
          <button
            type="button"
            data-testid="git-revert-submit"
            disabled={!canRevert}
            onClick={() => void submit()}
            style={gitButtonStyle(colors, 'danger', !canRevert)}
          >
            {busy ? 'Reverting…' : 'Revert'}
          </button>
        </>
      }
    >
      <div style={{ fontSize: '12px', lineHeight: 1.5 }}>
        Local changes to the selected files will be <strong>permanently discarded</strong>. Newly added files are only
        unstaged and kept on disk.
      </div>
      {files === null ? (
        <div style={{ opacity: 0.7 }}>Loading changes…</div>
      ) : files.length === 0 && !error ? (
        <div data-testid="git-revert-empty" style={{ opacity: 0.7 }}>
          Nothing to revert.
        </div>
      ) : (
        <GitFileChecklist files={files} checked={checked} onChange={setChecked} colors={colors} testId="git-revert-files" onOpenFile={onOpenDiff} />
      )}
      {error && (
        <div data-testid="git-revert-error" style={{ color: GIT_ERROR_COLOR, fontSize: '12px', whiteSpace: 'pre-wrap' }}>
          {error}
        </div>
      )}
    </GitModal>
  );
};

export default GitRevertDialog;
