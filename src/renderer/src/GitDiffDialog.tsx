import React, { useEffect, useState } from 'react';
import * as MonacoReact from '@monaco-editor/react';
import type { ThemeColors } from './theme/ThemeContext';
import { GIT_ERROR_COLOR, GitModal, gitButtonStyle } from './GitDialogCommon';
import { inferLanguageFromFilename } from './languages';
import { getGitTargetCwd, type GitTarget } from './gitMenu';
import { getGitDialogTitle } from '../../shared/gitDialog';

const DiffEditorComponent: React.ComponentType<Record<string, unknown>> | undefined = (
  MonacoReact as unknown as { DiffEditor?: React.ComponentType<Record<string, unknown>> }
).DiffEditor;

interface GitDiffDialogProps {
  target: GitTarget;
  colors: ThemeColors;
  isLightTheme: boolean;
  onClose: () => void;
}

type DiffState =
  | { kind: 'loading' }
  | { kind: 'error'; error: string }
  | { kind: 'ready'; original: string; modified: string; binary: boolean };

export type GitDiffViewMode = 'sideBySide' | 'inline';

/** localStorage key remembering the last chosen diff layout. */
export const GIT_DIFF_VIEW_MODE_KEY = 'awapi.gitDiffViewMode';

function loadViewMode(): GitDiffViewMode {
  try {
    return window.localStorage.getItem(GIT_DIFF_VIEW_MODE_KEY) === 'inline' ? 'inline' : 'sideBySide';
  } catch {
    return 'sideBySide';
  }
}

/** Read-only diff of a file's HEAD revision against the working tree, side by side or inline. */
export const GitDiffDialog: React.FC<GitDiffDialogProps> = ({ target, colors, isLightTheme, onClose }) => {
  const [state, setState] = useState<DiffState>({ kind: 'loading' });
  const [viewMode, setViewMode] = useState<GitDiffViewMode>(loadViewMode);

  const changeViewMode = (mode: GitDiffViewMode) => {
    setViewMode(mode);
    try {
      window.localStorage.setItem(GIT_DIFF_VIEW_MODE_KEY, mode);
    } catch {
      // Storage unavailable: the choice just isn't remembered.
    }
  };

  const toggleStyle = (active: boolean): React.CSSProperties => ({
    ...gitButtonStyle(colors, active ? 'primary' : 'secondary'),
    padding: '3px 10px',
    fontSize: '12px',
  });

  useEffect(() => {
    let cancelled = false;
    const options = target.revision ? { revision: target.revision, oldPath: target.oldPath } : undefined;
    void window.electronAPI.getGitDiff(getGitTargetCwd(target), target.path, options).then(res => {
      if (cancelled) return;
      setState(res.ok ? { kind: 'ready', ...res } : { kind: 'error', error: res.error });
    });
    return () => {
      cancelled = true;
    };
  }, [target]);

  const language = inferLanguageFromFilename(target.path);
  const shortRev = target.revision?.slice(0, 7);
  const originalLabel = shortRev ? `${shortRev}^ (parent)` : 'HEAD';
  const modifiedLabel = shortRev ?? 'Working tree';

  return (
    <GitModal
      title={getGitDialogTitle({ kind: 'diff', target })}
      testId="git-diff-dialog"
      colors={colors}
      onClose={onClose}
      footer={
        <button type="button" onClick={onClose} style={gitButtonStyle(colors)}>
          Close
        </button>
      }
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px' }}>
        {viewMode === 'sideBySide' ? (
          <>
            <span style={{ flex: 1, opacity: 0.7 }}>{originalLabel}</span>
            <span style={{ flex: 1, opacity: 0.7 }}>{modifiedLabel}</span>
          </>
        ) : (
          <span style={{ flex: 1, opacity: 0.7 }}>{originalLabel} → {modifiedLabel}</span>
        )}
        <div role="group" aria-label="Diff layout" style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
          <button
            type="button"
            data-testid="git-diff-side-by-side"
            aria-pressed={viewMode === 'sideBySide'}
            onClick={() => changeViewMode('sideBySide')}
            style={toggleStyle(viewMode === 'sideBySide')}
          >
            Side by side
          </button>
          <button
            type="button"
            data-testid="git-diff-inline"
            aria-pressed={viewMode === 'inline'}
            onClick={() => changeViewMode('inline')}
            style={toggleStyle(viewMode === 'inline')}
          >
            Inline
          </button>
        </div>
      </div>
      <div style={{ flex: 1, minHeight: 0, border: `1px solid ${colors.tabHover}` }}>
        {state.kind === 'loading' && <div style={{ padding: '10px', opacity: 0.7 }}>Loading diff…</div>}
        {state.kind === 'error' && (
          <div data-testid="git-diff-error" style={{ padding: '10px', color: GIT_ERROR_COLOR }}>
            {state.error}
          </div>
        )}
        {state.kind === 'ready' && state.binary && (
          <div data-testid="git-diff-binary" style={{ padding: '10px', opacity: 0.7 }}>
            Binary file — no text diff available.
          </div>
        )}
        {state.kind === 'ready' && !state.binary && DiffEditorComponent && (
          <DiffEditorComponent
            height="100%"
            theme={isLightTheme ? 'light' : 'vs-dark'}
            original={state.original}
            modified={state.modified}
            originalLanguage={language}
            modifiedLanguage={language}
            options={{
              renderSideBySide: viewMode === 'sideBySide',
              // Monaco otherwise silently falls back to inline below ~900px wide.
              useInlineViewWhenSpaceIsLimited: false,
              readOnly: true,
              originalEditable: false,
              minimap: { enabled: false },
              fontSize: 13,
              // Re-layout when the dialog is resized.
              automaticLayout: true,
            }}
          />
        )}
      </div>
    </GitModal>
  );
};

export default GitDiffDialog;
