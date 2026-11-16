import React, { useEffect, useMemo, useState } from 'react';
import type { GitBranch } from '../../shared/git';
import type { ThemeColors } from './theme/ThemeContext';
import { GIT_ERROR_COLOR, GitModal, gitButtonStyle, gitInputStyle } from './GitDialogCommon';
import { getGitTargetCwd, type GitTarget } from './gitMenu';

interface GitBranchDialogProps {
  mode: 'switch' | 'create';
  target: GitTarget;
  colors: ThemeColors;
  activeRowBg: string;
  onClose: () => void;
  onDone: (summary: string, output: string) => void;
}

/**
 * Maps a picked branch to the `switch` operation. Picking `origin/x` switches
 * to an existing local `x`, otherwise creates `x` tracking the remote branch.
 */
export function resolveSwitchTarget(branch: GitBranch, branches: GitBranch[]): { branch: string; remote: boolean } {
  if (!branch.remote) return { branch: branch.name, remote: false };
  const localName = branch.name.slice(branch.name.indexOf('/') + 1);
  const local = branches.find(b => !b.remote && b.name === localName);
  return local ? { branch: local.name, remote: false } : { branch: branch.name, remote: true };
}

export const GitBranchDialog: React.FC<GitBranchDialogProps> = ({ mode, target, colors, activeRowBg, onClose, onDone }) => {
  const cwd = getGitTargetCwd(target);
  const [branches, setBranches] = useState<GitBranch[] | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<GitBranch | null>(null);
  const [name, setName] = useState('');
  const [checkout, setCheckout] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void window.electronAPI.getGitBranches(cwd).then(res => {
      if (cancelled) return;
      if (!res.ok) {
        setError(res.error);
        setBranches([]);
        return;
      }
      setBranches(res.branches);
    });
    return () => {
      cancelled = true;
    };
  }, [cwd]);

  const current = branches?.find(b => b.current) ?? null;
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (branches ?? []).filter(b => !q || b.name.toLowerCase().includes(q));
  }, [branches, query]);

  const canSubmit =
    !busy && (mode === 'create' ? name.trim().length > 0 : !!selected && !selected.current);

  const submit = async () => {
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    const switchTarget = mode === 'switch' && selected ? resolveSwitchTarget(selected, branches ?? []) : null;
    const res = switchTarget
      ? await window.electronAPI.runGitOperation({ kind: 'switch', cwd, ...switchTarget })
      : await window.electronAPI.runGitOperation({ kind: 'createBranch', cwd, name: name.trim(), checkout });
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onDone(
      switchTarget
        ? `Switched to ${switchTarget.remote ? switchTarget.branch.slice(switchTarget.branch.indexOf('/') + 1) : switchTarget.branch}.`
        : `Created branch ${name.trim()}${checkout ? ' and switched to it' : ''}.`,
      res.output,
    );
  };

  const isCreate = mode === 'create';

  return (
    <GitModal
      title={isCreate ? 'Create Branch' : 'Switch/Checkout'}
      testId="git-branch-dialog"
      colors={colors}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} style={gitButtonStyle(colors)}>
            Cancel
          </button>
          <button
            type="button"
            data-testid="git-branch-submit"
            disabled={!canSubmit}
            onClick={() => void submit()}
            style={gitButtonStyle(colors, 'primary', !canSubmit)}
          >
            {busy ? 'Working…' : isCreate ? 'Create' : 'Switch'}
          </button>
        </>
      }
    >
      <div style={{ fontSize: '12px', opacity: 0.75 }}>
        Current branch: <strong>{current?.name ?? (branches ? 'detached HEAD' : '…')}</strong>
      </div>
      {isCreate ? (
        <>
          <input
            data-testid="git-branch-name"
            autoFocus
            placeholder="New branch name"
            value={name}
            onChange={e => setName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') void submit();
            }}
            style={gitInputStyle(colors)}
          />
          <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
            <input
              type="checkbox"
              data-testid="git-branch-checkout"
              checked={checkout}
              onChange={e => setCheckout(e.target.checked)}
            />
            Switch to the new branch
          </label>
        </>
      ) : (
        <>
          <input
            data-testid="git-branch-filter"
            autoFocus
            placeholder="Filter branches"
            value={query}
            onChange={e => setQuery(e.target.value)}
            style={gitInputStyle(colors)}
          />
          <div
            role="listbox"
            aria-label="Branches"
            style={{ flex: 1, minHeight: 0, overflow: 'auto', border: `1px solid ${colors.tabHover}`, borderRadius: '3px' }}
          >
            {branches === null && <div style={{ padding: '8px', opacity: 0.7 }}>Loading branches…</div>}
            {visible.map(b => (
              <div
                key={`${b.remote ? 'r' : 'l'}:${b.name}`}
                role="option"
                aria-selected={selected === b}
                data-testid={`git-branch-item-${b.name}`}
                onClick={() => setSelected(b)}
                style={{
                  display: 'flex',
                  gap: '8px',
                  padding: '4px 8px',
                  cursor: 'pointer',
                  backgroundColor: selected === b ? activeRowBg : 'transparent',
                }}
              >
                <span style={{ flex: 1, fontWeight: b.current ? 600 : 400 }}>
                  {b.current ? '● ' : ''}
                  {b.name}
                </span>
                <span style={{ opacity: 0.6, fontSize: '12px' }}>{b.remote ? 'remote' : b.upstream ?? 'local'}</span>
              </div>
            ))}
          </div>
        </>
      )}
      {error && (
        <div data-testid="git-branch-error" style={{ color: GIT_ERROR_COLOR, fontSize: '12px', whiteSpace: 'pre-wrap' }}>
          {error}
        </div>
      )}
    </GitModal>
  );
};

export default GitBranchDialog;
