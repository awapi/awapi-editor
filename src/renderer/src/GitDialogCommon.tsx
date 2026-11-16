import React, { useEffect, useState } from 'react';
import { GIT_STATUS_LABELS, type GitChangedFile } from '../../shared/git';
import type { ThemeColors } from './theme/ThemeContext';
import { GitStatusBadge } from './GitStatusBadge';

export const GIT_ERROR_COLOR = '#e06c75';

export function gitButtonStyle(colors: ThemeColors, variant: 'primary' | 'secondary' | 'danger' = 'secondary', disabled = false): React.CSSProperties {
  const accent = variant === 'danger' ? '#d9534f' : variant === 'primary' ? '#0e639c' : 'transparent';
  return {
    padding: '6px 14px',
    fontSize: '13px',
    color: variant === 'secondary' ? colors.foreground : '#ffffff',
    backgroundColor: accent,
    border: `1px solid ${variant === 'secondary' ? colors.tabHover : accent}`,
    borderRadius: '3px',
    cursor: disabled ? 'default' : 'pointer',
    opacity: disabled ? 0.55 : 1,
  };
}

export function gitInputStyle(colors: ThemeColors): React.CSSProperties {
  return {
    width: '100%',
    boxSizing: 'border-box',
    padding: '6px 8px',
    fontSize: '13px',
    color: colors.foreground,
    backgroundColor: colors.tabBackground,
    border: `1px solid ${colors.tabHover}`,
    borderRadius: '3px',
    outline: 'none',
    fontFamily: 'inherit',
  };
}

interface GitModalProps {
  /** Window title (shown in the native title bar). */
  title: string;
  testId: string;
  colors: ThemeColors;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

/**
 * Layout of a Git dialog window. Each dialog runs in its own native modal
 * window (see `gitDialog:open`), so the OS provides the title bar, moving, and
 * resizing; this fills the window and closes it on Escape.
 */
export const GitModal: React.FC<GitModalProps> = ({ title, testId, colors, onClose, children, footer }) => {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    document.title = title;
  }, [title]);

  return (
    <div
      data-testid={testId}
      role="dialog"
      aria-label={title}
      style={{
        position: 'fixed',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: colors.background,
        color: colors.foreground,
        padding: '14px 18px',
        boxSizing: 'border-box',
        fontSize: '13px',
      }}
    >
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>{children}</div>
      {footer && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '8px', marginTop: '14px', flexShrink: 0 }}>
          {footer}
        </div>
      )}
    </div>
  );
};
interface GitFileChecklistProps {
  files: GitChangedFile[];
  checked: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
  colors: ThemeColors;
  testId: string;
  /** Double-click on a row (e.g. to open its diff). */
  onOpenFile?: (file: GitChangedFile) => void;
}

/**
 * Changed-file list for the Commit / Revert dialogs. Like TortoiseGit, only the
 * checkbox toggles selection; clicking a row highlights it and double-clicking
 * opens it (`onOpenFile`).
 */
export const GitFileChecklist: React.FC<GitFileChecklistProps> = ({ files, checked, onChange, colors, testId, onOpenFile }) => {
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const allChecked = files.length > 0 && files.every(f => checked.has(f.path));
  const toggle = (path: string) => {
    const next = new Set(checked);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    onChange(next);
  };

  return (
    <div
      data-testid={testId}
      role="list"
      style={{
        flex: 1,
        minHeight: '120px',
        overflow: 'auto',
        border: `1px solid ${colors.tabHover}`,
        borderRadius: '3px',
        userSelect: 'none',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '5px 8px',
          fontSize: '12px',
          fontWeight: 600,
          borderBottom: `1px solid ${colors.tabHover}`,
          backgroundColor: colors.tabBackground,
          position: 'sticky',
          top: 0,
          zIndex: 1,
        }}
      >
        <input
          type="checkbox"
          aria-label="Select all files"
          data-testid={`${testId}-all`}
          checked={allChecked}
          onChange={() => onChange(allChecked ? new Set() : new Set(files.map(f => f.path)))}
        />
        <span style={{ flex: 1 }}>
          {checked.size} of {files.length} selected
        </span>
        {onOpenFile && <span style={{ fontWeight: 400, opacity: 0.6 }}>Double-click a file to compare with HEAD</span>}
      </div>
      {files.map(file => (
        <div
          key={file.path}
          role="listitem"
          data-testid={`${testId}-row-${file.path}`}
          title={`${file.path} — ${GIT_STATUS_LABELS[file.status]}`}
          onClick={() => setHighlighted(file.path)}
          onDoubleClick={() => onOpenFile?.(file)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '3px 8px',
            cursor: onOpenFile ? 'pointer' : 'default',
            backgroundColor: highlighted === file.path ? colors.tabHover : 'transparent',
          }}
        >
          <input
            type="checkbox"
            aria-label={`Select ${file.path}`}
            data-testid={`${testId}-item-${file.path}`}
            checked={checked.has(file.path)}
            onChange={() => toggle(file.path)}
            // Toggling the checkbox must not count toward a row double-click.
            onDoubleClick={e => e.stopPropagation()}
          />
          <span style={{ position: 'relative', display: 'inline-flex', width: 10, height: 10, flexShrink: 0, transform: 'translate(3px, -3px)' }}>
            <GitStatusBadge status={file.status} />
          </span>
          <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.path}</span>
          <span style={{ opacity: 0.6, fontSize: '12px', flexShrink: 0 }}>{GIT_STATUS_LABELS[file.status]}</span>
        </div>
      ))}
    </div>
  );
};