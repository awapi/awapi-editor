import React from 'react';
import { GIT_STATUS_LABELS, type GitFileStatus } from '../../shared/git';

/** Overlay colors loosely following TortoiseGit's icon set. */
export const GIT_STATUS_COLORS: Record<GitFileStatus, string> = {
  clean: '#16a34a',
  modified: '#dc2626',
  staged: '#8b5cf6',
  added: '#2563eb',
  renamed: '#0d9488',
  deleted: '#b91c1c',
  conflicted: '#e3a008',
  untracked: '#64748b',
  ignored: '#9ca3af',
};

const glyphProps = {
  fill: 'none',
  stroke: '#fff',
  strokeWidth: 1.4,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

function Glyph({ status }: { status: GitFileStatus }): React.ReactElement {
  switch (status) {
    case 'clean':
    case 'staged':
      return <path d="M2.7 5.2 4.3 6.7 7.3 3.5" {...glyphProps} />;
    case 'modified':
    case 'conflicted':
      return (
        <>
          <path d="M5 2.6V5.6" {...glyphProps} />
          <circle cx="5" cy="7.4" r="0.75" fill="#fff" />
        </>
      );
    case 'added':
      return <path d="M5 2.6V7.4M2.6 5H7.4" {...glyphProps} />;
    case 'renamed':
      return <path d="M2.6 5H7.2M5.4 3.2 7.2 5 5.4 6.8" {...glyphProps} />;
    case 'deleted':
      return <path d="M3.2 3.2 6.8 6.8M6.8 3.2 3.2 6.8" {...glyphProps} />;
    case 'untracked':
      return (
        <>
          <path d="M3.7 3.9a1.35 1.35 0 1 1 1.9 1.25c-.45.22-.6.48-.6.95" {...glyphProps} strokeWidth={1.2} />
          <circle cx="5" cy="7.6" r="0.7" fill="#fff" />
        </>
      );
    case 'ignored':
      return <path d="M2.8 5H7.2" {...glyphProps} />;
  }
}

/**
 * Small TortoiseGit-style status overlay rendered over the bottom-left corner
 * of a File Explorer icon. The parent must be `position: relative`.
 */
export const GitStatusBadge: React.FC<{ status: GitFileStatus; size?: number }> = ({ status, size = 10 }) => {
  const color = GIT_STATUS_COLORS[status];
  const label = `Git: ${GIT_STATUS_LABELS[status]}`;
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      data-testid={`git-badge-${status}`}
      style={{
        position: 'absolute',
        left: -3,
        bottom: -3,
        width: size,
        height: size,
        lineHeight: 0,
        pointerEvents: 'none',
      }}
    >
      <svg width={size} height={size} viewBox="0 0 10 10" aria-hidden="true">
        {status === 'conflicted' ? (
          <path d="M5 0.4 9.7 9.3H0.3Z" fill={color} />
        ) : (
          <circle cx="5" cy="5" r="5" fill={color} />
        )}
        <Glyph status={status} />
      </svg>
    </span>
  );
};

export default GitStatusBadge;
