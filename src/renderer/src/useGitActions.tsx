import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { GitOperation } from '../../shared/git';
import type { ThemeColors } from './theme/ThemeContext';
import type { GitDialogKind } from '../../shared/gitDialog';
import { GIT_ERROR_COLOR } from './GitDialogCommon';
import { getGitTargetCwd, type GitMenuAction, type GitTarget } from './gitMenu';

export const GIT_NOTICE_SUCCESS_MS = 5000;

type Notice =
  | { kind: 'busy'; text: string }
  | { kind: 'success' | 'error'; text: string; output?: string };

const BUSY_TEXT: Partial<Record<GitMenuAction, string>> = {
  pull: 'Pulling…',
  fetch: 'Fetching…',
  push: 'Pushing…',
  add: 'Adding…',
  unstage: 'Unstaging…',
  resolve: 'Marking as resolved…',
  ignore: 'Updating .gitignore…',
  ignoreExt: 'Updating .gitignore…',
};

const DONE_TEXT: Partial<Record<GitMenuAction, string>> = {
  pull: 'Pull completed.',
  fetch: 'Fetch completed.',
  push: 'Push completed.',
  add: 'Added.',
  unstage: 'Unstaged.',
  resolve: 'Marked as resolved.',
};

const DIALOG_ACTIONS: ReadonlySet<string> = new Set<GitDialogKind>(['commit', 'revert', 'diff', 'log', 'switch', 'createBranch']);

interface UseGitActionsOptions {
  colors: ThemeColors;
  isLightTheme: boolean;
  activeRowBg: string;
  /** Called after any command that may have changed files or Git state. */
  onCompleted: () => void;
}

/** Builds the operation for menu actions that run without a dialog; null when nothing to do. */
async function buildDirectOperation(action: GitMenuAction, target: GitTarget): Promise<GitOperation | string | null> {
  const cwd = getGitTargetCwd(target);
  switch (action) {
    case 'pull':
    case 'fetch':
    case 'push':
      return { kind: action, cwd };
    case 'add':
    case 'unstage':
      return { kind: action, cwd, paths: [target.path] };
    case 'resolve': {
      if (!target.isDirectory) return { kind: 'resolve', cwd, paths: [target.path] };
      // For folders, mark only the conflicted files below it (not every change).
      const res = await window.electronAPI.getGitChanges(cwd, target.path);
      if (!res.ok) return res.error;
      const conflicted = res.files.filter(f => f.status === 'conflicted').map(f => f.absPath);
      return conflicted.length > 0 ? { kind: 'resolve', cwd, paths: conflicted } : null;
    }
    case 'ignore':
    case 'ignoreExt':
      return { kind: 'ignore', cwd, path: target.path, isDirectory: target.isDirectory, byExtension: action === 'ignoreExt' };
    default:
      return null;
  }
}

/**
 * Runs Explorer Git menu actions: opens the matching dialog window or runs
 * the command directly, and renders a progress / result notice.
 */
export function useGitActions({ colors, isLightTheme, activeRowBg, onCompleted }: UseGitActionsOptions) {
  const [notice, setNotice] = useState<Notice | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onCompletedRef = useRef(onCompleted);
  onCompletedRef.current = onCompleted;

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const showNotice = useCallback((next: Notice | null) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    setNotice(next);
    if (next?.kind === 'success') {
      timerRef.current = setTimeout(() => setNotice(null), GIT_NOTICE_SUCCESS_MS);
    }
  }, []);


  const run = useCallback(
    async (action: GitMenuAction, target: GitTarget) => {
      if (DIALOG_ACTIONS.has(action)) {
        // Dialogs open in a native modal window; it resolves once the user closes it.
        const result = await window.electronAPI.openGitDialog({
          kind: action as GitDialogKind,
          target,
          colors,
          isLightTheme,
          activeRowBg,
        });
        if (result) {
          showNotice({ kind: 'success', text: result.summary, output: result.output });
          onCompletedRef.current();
        }
        return;
      }
      showNotice({ kind: 'busy', text: BUSY_TEXT[action] ?? 'Working…' });
      const op = await buildDirectOperation(action, target);
      if (op === null) {
        showNotice({ kind: 'success', text: 'Nothing to do.' });
        return;
      }
      if (typeof op === 'string') {
        showNotice({ kind: 'error', text: op });
        return;
      }
      const res = await window.electronAPI.runGitOperation(op);
      if (res.ok) {
        showNotice({ kind: 'success', text: DONE_TEXT[action] ?? res.output, output: DONE_TEXT[action] ? res.output : undefined });
      } else {
        showNotice({ kind: 'error', text: `${action.charAt(0).toUpperCase()}${action.slice(1)} failed`, output: res.error });
      }
      onCompletedRef.current();
    },
    [showNotice, colors, isLightTheme, activeRowBg],
  );

  const element = (
    <>
      {notice && (
        <div
          data-testid="git-notice"
          role={notice.kind === 'error' ? 'alert' : 'status'}
          style={{
            position: 'fixed',
            left: '12px',
            bottom: '32px',
            zIndex: 10001,
            width: '360px',
            maxWidth: '80vw',
            padding: '10px 12px',
            fontSize: '12px',
            color: colors.foreground,
            backgroundColor: colors.tabBackground,
            border: `1px solid ${notice.kind === 'error' ? GIT_ERROR_COLOR : colors.tabHover}`,
            borderRadius: '4px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.35)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ flex: 1, fontWeight: 600, color: notice.kind === 'error' ? GIT_ERROR_COLOR : undefined }}>
              {notice.text}
            </span>
            {notice.kind !== 'busy' && (
              <button
                type="button"
                aria-label="Dismiss"
                data-testid="git-notice-dismiss"
                onClick={() => showNotice(null)}
                style={{ border: 'none', background: 'transparent', color: colors.foreground, cursor: 'pointer', fontSize: '14px' }}
              >
                ×
              </button>
            )}
          </div>
          {notice.kind !== 'busy' && notice.output && (
            <pre
              data-testid="git-notice-output"
              style={{ margin: '6px 0 0', maxHeight: '160px', overflow: 'auto', whiteSpace: 'pre-wrap', fontSize: '11px', opacity: 0.85 }}
            >
              {notice.output}
            </pre>
          )}
        </div>
      )}
    </>
  );

  return { run, element };
}
