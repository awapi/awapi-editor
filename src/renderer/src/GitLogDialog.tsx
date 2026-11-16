import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  GIT_STATUS_LABELS,
  type GitChangedFile,
  type GitCommitFile,
  type GitFileStatus,
  type GitLogCommit,
  type GitRef,
} from '../../shared/git';
import type { ThemeColors } from './theme/ThemeContext';
import { GIT_ERROR_COLOR, GitModal, gitButtonStyle, gitInputStyle } from './GitDialogCommon';
import { GitStatusBadge } from './GitStatusBadge';
import { getGitTargetCwd, isPathWithin, type GitTarget } from './gitMenu';
import { GRAPH_COLORS, computeGitGraph, type GraphRow } from './gitGraph';

/** What the Log window asks its host to diff when a file is double-clicked. */
export interface GitLogDiffRequest {
  absPath: string;
  status: GitFileStatus;
  repoRoot: string;
  /** Commit to diff against its parent; omitted for working-tree changes. */
  revision?: string;
  /** Pre-rename path (absolute) for renamed files. */
  oldAbsPath?: string;
}

interface GitLogDialogProps {
  target: GitTarget;
  colors: ThemeColors;
  activeRowBg: string;
  onClose: () => void;
  onOpenDiff?: (request: GitLogDiffRequest) => void;
}

/** Selection key of the synthetic "Working tree changes" row. */
export const WORKTREE_KEY = '__worktree__';

const ROW_HEIGHT = 22;
const LANE_WIDTH = 12;
const MAX_GRAPH_LANES = 16;
const MIN_PANE = 0.1;

const COMMIT_STATUS: Record<string, { label: string; status: GitFileStatus }> = {
  A: { label: 'Added', status: 'added' },
  M: { label: 'Modified', status: 'modified' },
  D: { label: 'Deleted', status: 'deleted' },
  R: { label: 'Renamed', status: 'renamed' },
  C: { label: 'Copied', status: 'added' },
  T: { label: 'Type changed', status: 'modified' },
};

const REF_STYLES: Record<GitRef['kind'], { bg: string; fg: string; label: string }> = {
  head: { bg: '#e5534b', fg: '#ffffff', label: 'Current branch' },
  branch: { bg: '#f0883e', fg: '#ffffff', label: 'Branch' },
  remote: { bg: '#f6c28b', fg: '#3b2a12', label: 'Remote branch' },
  tag: { bg: '#f2d64b', fg: '#3b3412', label: 'Tag' },
};

export interface DisplayFile {
  path: string;
  absPath: string;
  oldAbsPath?: string;
  statusLabel: string;
  status: GitFileStatus;
  added: number | null;
  removed: number | null;
}

type Details =
  | { key: string; kind: 'commit'; commit: GitLogCommit; message: string; files: DisplayFile[] }
  | { key: string; kind: 'worktree'; files: DisplayFile[] }
  | { key: string; kind: 'error'; error: string };

export function filterGitCommits(commits: GitLogCommit[], query: string): GitLogCommit[] {
  const q = query.trim().toLowerCase();
  if (!q) return commits;
  return commits.filter(
    c =>
      c.subject.toLowerCase().includes(q) ||
      c.author.toLowerCase().includes(q) ||
      c.hash.startsWith(q) ||
      c.refs.some(r => r.name.toLowerCase().includes(q)),
  );
}

/** Maps a commit's changed files to table rows with absolute paths. */
export function toDisplayFiles(files: GitCommitFile[], repoRoot: string): DisplayFile[] {
  return files.map(f => {
    const kind = COMMIT_STATUS[f.status] ?? { label: f.status, status: 'modified' as GitFileStatus };
    return {
      path: f.path,
      absPath: `${repoRoot}/${f.path}`,
      ...(f.oldPath ? { oldAbsPath: `${repoRoot}/${f.oldPath}` } : {}),
      statusLabel: f.oldPath ? `${kind.label} (from ${f.oldPath})` : kind.label,
      status: kind.status,
      added: f.added,
      removed: f.removed,
    };
  });
}

function worktreeDisplayFiles(files: GitChangedFile[]): DisplayFile[] {
  return files.map(f => ({
    path: f.path,
    absPath: f.absPath,
    statusLabel: GIT_STATUS_LABELS[f.status],
    status: f.status,
    added: null,
    removed: null,
  }));
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function extensionOf(path: string): string {
  const base = path.slice(path.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot) : '';
}

const GraphCell: React.FC<{ row: GraphRow; lanes: number }> = ({ row, lanes }) => {
  const width = Math.max(1, Math.min(lanes, MAX_GRAPH_LANES)) * LANE_WIDTH;
  const x = (lane: number) => Math.min(lane, MAX_GRAPH_LANES - 1) * LANE_WIDTH + LANE_WIDTH / 2;
  const color = (lane: number) => GRAPH_COLORS[lane % GRAPH_COLORS.length];
  return (
    <svg width={width} height={ROW_HEIGHT} aria-hidden="true" style={{ display: 'block', flexShrink: 0 }}>
      {row.segments.map((s, i) => (
        <line
          key={i}
          x1={x(s.x1)}
          y1={s.y1 * ROW_HEIGHT}
          x2={x(s.x2)}
          y2={s.y2 * ROW_HEIGHT}
          stroke={color(s.lane)}
          strokeWidth={1.6}
        />
      ))}
      <circle
        cx={x(row.col)}
        cy={ROW_HEIGHT / 2}
        r={row.isMerge ? 3 : 3.5}
        fill={row.isMerge ? 'none' : color(row.col)}
        stroke={color(row.col)}
        strokeWidth={row.isMerge ? 1.6 : 1}
      />
    </svg>
  );
};

const RefBadge: React.FC<{ gitRef: GitRef }> = ({ gitRef }) => {
  const style = REF_STYLES[gitRef.kind];
  return (
    <span
      data-testid={`git-log-ref-${gitRef.kind}-${gitRef.name}`}
      title={`${style.label}: ${gitRef.name}`}
      style={{
        backgroundColor: style.bg,
        color: style.fg,
        borderRadius: '3px',
        padding: '0 5px',
        fontSize: '11px',
        fontWeight: 600,
        lineHeight: '16px',
        flexShrink: 0,
      }}
    >
      {gitRef.name}
    </span>
  );
};

/**
 * TortoiseGit-style "Show Log": a commit list with branch graph and ref labels,
 * the selected commit's details, and its changed files with line counts.
 * Double-clicking a file opens its diff; the three panes are resizable.
 */
export const GitLogDialog: React.FC<GitLogDialogProps> = ({ target, colors, activeRowBg, onClose, onOpenDiff }) => {
  const cwd = getGitTargetCwd(target);
  const [allBranches, setAllBranches] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const [commits, setCommits] = useState<GitLogCommit[] | null>(null);
  const [repoRoot, setRepoRoot] = useState<string | null>(null);
  const [worktree, setWorktree] = useState<GitChangedFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [details, setDetails] = useState<Details | null>(null);
  const [highlightedFile, setHighlightedFile] = useState<string | null>(null);
  /** Fractions of the pane area used by the commit list and the details; files take the rest. */
  const [sizes, setSizes] = useState({ list: 0.5, details: 0.18 });
  const panesRef = useRef<HTMLDivElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    setCommits(null);
    setError(null);
    void Promise.all([
      window.electronAPI.getGitLog(cwd, target.path, target.isDirectory, allBranches),
      window.electronAPI.getGitChanges(cwd, target.path),
    ]).then(([log, changes]) => {
      if (cancelled) return;
      if (!log.ok) {
        setError(log.error);
        setCommits([]);
        return;
      }
      setCommits(log.commits);
      setRepoRoot(log.repoRoot);
      const changed = changes.ok ? changes.files : [];
      setWorktree(changed);
      setSelected(prev => prev ?? (changed.length > 0 ? WORKTREE_KEY : log.commits[0]?.hash ?? null));
    });
    return () => {
      cancelled = true;
    };
  }, [cwd, target.path, target.isDirectory, allBranches, reloadToken]);

  useEffect(() => {
    setHighlightedFile(null);
    if (!selected || !repoRoot) return;
    if (selected === WORKTREE_KEY) {
      setDetails({ key: selected, kind: 'worktree', files: worktreeDisplayFiles(worktree) });
      return;
    }
    const commit = commits?.find(c => c.hash === selected);
    if (!commit) return;
    let cancelled = false;
    void window.electronAPI.getGitCommitDetails(cwd, selected).then(res => {
      if (cancelled) return;
      setDetails(
        res.ok
          ? { key: selected, kind: 'commit', commit, message: res.message, files: toDisplayFiles(res.files, repoRoot) }
          : { key: selected, kind: 'error', error: res.error },
      );
    });
    return () => {
      cancelled = true;
    };
  }, [cwd, selected, commits, repoRoot, worktree]);

  const filtering = query.trim().length > 0;
  const visible = useMemo(() => filterGitCommits(commits ?? [], query), [commits, query]);
  // The graph only makes sense for the unfiltered history.
  const graph = useMemo(() => (filtering ? null : computeGitGraph(visible)), [filtering, visible]);
  const showWorktree = worktree.length > 0 && !filtering;
  const rowKeys = useMemo(
    () => [...(showWorktree ? [WORKTREE_KEY] : []), ...visible.map(c => c.hash)],
    [showWorktree, visible],
  );
  const graphWidth = graph ? Math.max(1, Math.min(graph.laneCount, MAX_GRAPH_LANES)) * LANE_WIDTH : 0;

  const moveSelection = (delta: number) => {
    if (rowKeys.length === 0) return;
    const idx = selected ? rowKeys.indexOf(selected) : -1;
    const next = rowKeys[Math.max(0, Math.min(rowKeys.length - 1, idx + delta))];
    setSelected(next);
    const rows = listRef.current?.querySelectorAll<HTMLElement>('[data-key]') ?? [];
    Array.from(rows).find(el => el.dataset.key === next)?.scrollIntoView?.({ block: 'nearest' });
  };

  const startSplitDrag = (e: React.MouseEvent, which: 'list' | 'details') => {
    e.preventDefault();
    const container = panesRef.current;
    if (!container) return;
    const height = container.getBoundingClientRect().height || 1;
    const startY = e.clientY;
    const start = sizes;
    const onMove = (ev: MouseEvent) => {
      const delta = (ev.clientY - startY) / height;
      if (which === 'list') {
        // Between list and details: trade space between the two.
        const list = Math.min(Math.max(start.list + delta, MIN_PANE), start.list + start.details - MIN_PANE);
        setSizes({ list, details: start.list + start.details - list });
      } else {
        // Between details and files.
        const files = 1 - start.list - start.details;
        const details = Math.min(Math.max(start.details + delta, MIN_PANE), start.details + files - MIN_PANE);
        setSizes({ list: start.list, details });
      }
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
    };
    document.body.style.cursor = 'row-resize';
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const openDiff = (file: DisplayFile) => {
    if (!onOpenDiff || !repoRoot || !details || details.kind === 'error') return;
    onOpenDiff({
      absPath: file.absPath,
      status: file.status,
      repoRoot,
      ...(details.kind === 'commit' ? { revision: details.commit.hash } : {}),
      ...(file.oldAbsPath ? { oldAbsPath: file.oldAbsPath } : {}),
    });
  };

  const paneBorder = `1px solid ${colors.tabHover}`;
  const headerCell: React.CSSProperties = {
    position: 'sticky',
    top: 0,
    zIndex: 1,
    backgroundColor: colors.tabBackground,
    borderBottom: paneBorder,
    fontSize: '12px',
    fontWeight: 600,
  };
  const splitter = (which: 'list' | 'details') => (
    <div
      role="separator"
      aria-orientation="horizontal"
      data-testid={`git-log-splitter-${which}`}
      onMouseDown={e => startSplitDrag(e, which)}
      style={{ height: '6px', cursor: 'row-resize', flexShrink: 0 }}
    />
  );
  const isOutsideTarget = (file: DisplayFile) => !target.isRoot && !isPathWithin(file.absPath, target.path);
  const shownFiles = details && details.key === selected && details.kind !== 'error' ? details.files : [];
  const totalAdded = shownFiles.reduce((n, f) => n + (f.added ?? 0), 0);
  const totalRemoved = shownFiles.reduce((n, f) => n + (f.removed ?? 0), 0);

  return (
    <GitModal
      title={`Log: ${target.path}`}
      testId="git-log-dialog"
      colors={colors}
      onClose={onClose}
      footer={
        <>
          <span data-testid="git-log-status" style={{ flex: 1, fontSize: '12px', opacity: 0.7 }}>
            {commits === null
              ? 'Loading…'
              : `Showing ${visible.length} revision(s)${filtering ? ` of ${commits.length}` : ''}` +
                (details?.kind === 'commit' && details.key === selected
                  ? ` · ${shownFiles.length} file(s), +${totalAdded} −${totalRemoved}`
                  : '')}
          </span>
          <button type="button" data-testid="git-log-refresh" onClick={() => setReloadToken(t => t + 1)} style={gitButtonStyle(colors)}>
            Refresh
          </button>
          <button type="button" onClick={onClose} style={gitButtonStyle(colors, 'primary')}>
            Close
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <input
          data-testid="git-log-filter"
          placeholder="Filter by message, author, hash, or branch"
          value={query}
          onChange={e => setQuery(e.target.value)}
          style={{ ...gitInputStyle(colors), flex: 1 }}
        />
        <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', whiteSpace: 'nowrap' }}>
          <input
            type="checkbox"
            data-testid="git-log-all-branches"
            checked={allBranches}
            onChange={e => setAllBranches(e.target.checked)}
          />
          All branches
        </label>
      </div>
      {error && <div data-testid="git-log-error" style={{ color: GIT_ERROR_COLOR }}>{error}</div>}

      <div ref={panesRef} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {/* Commit list */}
        <div
          ref={listRef}
          data-testid="git-log-list"
          role="listbox"
          aria-label="Commits"
          tabIndex={0}
          onKeyDown={e => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              moveSelection(e.key === 'ArrowDown' ? 1 : -1);
            }
          }}
          style={{ flex: `0 0 ${sizes.list * 100}%`, minHeight: 0, overflow: 'auto', border: paneBorder, borderRadius: '3px', outline: 'none', userSelect: 'none' }}
        >
          <div style={{ ...headerCell, display: 'flex', gap: '10px', padding: '4px 8px' }}>
            {graph && <span style={{ width: graphWidth, flexShrink: 0 }}>Graph</span>}
            <span style={{ flex: 1 }}>Message</span>
            <span style={{ width: '140px', flexShrink: 0 }}>Author</span>
            <span style={{ width: '160px', flexShrink: 0, textAlign: 'right' }}>Date</span>
          </div>
          {commits === null && <div style={{ padding: '8px', opacity: 0.7 }}>Loading log…</div>}
          {commits !== null && rowKeys.length === 0 && !error && <div style={{ padding: '8px', opacity: 0.7 }}>No commits.</div>}
          {showWorktree && (
            <div
              role="option"
              data-key={WORKTREE_KEY}
              aria-selected={selected === WORKTREE_KEY}
              data-testid="git-log-worktree"
              onClick={() => setSelected(WORKTREE_KEY)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '0 8px',
                height: ROW_HEIGHT,
                cursor: 'pointer',
                fontStyle: 'italic',
                backgroundColor: selected === WORKTREE_KEY ? activeRowBg : 'transparent',
              }}
            >
              {graph && <span style={{ width: graphWidth, flexShrink: 0 }} />}
              <span style={{ flex: 1 }}>Working tree changes ({worktree.length})</span>
            </div>
          )}
          {visible.map((c, i) => (
            <div
              key={c.hash}
              role="option"
              data-key={c.hash}
              aria-selected={selected === c.hash}
              data-testid={`git-log-commit-${c.shortHash}`}
              onClick={() => setSelected(c.hash)}
              title={c.hash}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '0 8px',
                height: ROW_HEIGHT,
                cursor: 'pointer',
                backgroundColor: selected === c.hash ? activeRowBg : 'transparent',
                whiteSpace: 'nowrap',
              }}
            >
              {graph && <GraphCell row={graph.rows[i]} lanes={graph.laneCount} />}
              <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '4px', overflow: 'hidden' }}>
                {c.refs.map(r => (
                  <RefBadge key={`${r.kind}:${r.name}`} gitRef={r} />
                ))}
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.subject}</span>
              </span>
              <span style={{ width: '140px', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', opacity: 0.85 }}>{c.author}</span>
              <span style={{ width: '160px', flexShrink: 0, textAlign: 'right', opacity: 0.65 }}>{formatDate(c.date)}</span>
            </div>
          ))}
        </div>

        {splitter('list')}

        {/* Commit details */}
        <div
          data-testid="git-log-details"
          style={{
            flex: `0 0 ${sizes.details * 100}%`,
            minHeight: 0,
            overflow: 'auto',
            border: paneBorder,
            borderRadius: '3px',
            padding: '6px 8px',
            fontFamily: 'Consolas, "Courier New", monospace',
            fontSize: '12px',
            whiteSpace: 'pre-wrap',
            userSelect: 'text',
          }}
        >
          {details?.key === selected && details.kind === 'error' && <span style={{ color: GIT_ERROR_COLOR }}>{details.error}</span>}
          {details?.key === selected && details.kind === 'worktree' && 'Working tree changes (not committed yet)'}
          {details?.key === selected && details.kind === 'commit' && (
            <>
              <div>SHA-1: {details.commit.hash}</div>
              <div style={{ opacity: 0.75 }}>
                Author: {details.commit.author} · {formatDate(details.commit.date)}
              </div>
              {details.commit.parents.length > 1 && (
                <div style={{ opacity: 0.75 }}>Merge of {details.commit.parents.map(p => p.slice(0, 7)).join(', ')}</div>
              )}
              <div style={{ marginTop: '8px' }}>{details.message}</div>
            </>
          )}
        </div>

        {splitter('details')}

        {/* Changed files */}
        <div
          data-testid="git-log-files"
          role="list"
          style={{ flex: 1, minHeight: 0, overflow: 'auto', border: paneBorder, borderRadius: '3px', userSelect: 'none' }}
        >
          <div style={{ ...headerCell, display: 'flex', gap: '10px', padding: '4px 8px' }}>
            <span style={{ flex: 1 }}>Path</span>
            <span style={{ width: '70px', flexShrink: 0 }}>Extension</span>
            <span style={{ width: '150px', flexShrink: 0 }}>Status</span>
            <span style={{ width: '80px', flexShrink: 0, textAlign: 'right' }}>Lines added</span>
            <span style={{ width: '90px', flexShrink: 0, textAlign: 'right' }}>Lines removed</span>
          </div>
          {shownFiles.map(file => (
            <div
              key={file.path}
              role="listitem"
              data-testid={`git-log-file-${file.path}`}
              title={onOpenDiff ? `${file.path} — double-click to view the diff` : file.path}
              onClick={() => setHighlightedFile(file.path)}
              onDoubleClick={() => openDiff(file)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '2px 8px',
                cursor: onOpenDiff ? 'pointer' : 'default',
                opacity: isOutsideTarget(file) ? 0.5 : 1,
                backgroundColor: highlightedFile === file.path ? colors.tabHover : 'transparent',
                whiteSpace: 'nowrap',
              }}
            >
              <span style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ position: 'relative', display: 'inline-flex', width: 10, height: 10, flexShrink: 0, transform: 'translate(3px, -3px)' }}>
                  <GitStatusBadge status={file.status} />
                </span>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{file.path}</span>
              </span>
              <span style={{ width: '70px', flexShrink: 0, opacity: 0.75 }}>{extensionOf(file.path)}</span>
              <span style={{ width: '150px', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{file.statusLabel}</span>
              <span style={{ width: '80px', flexShrink: 0, textAlign: 'right', color: '#22a06b' }}>
                {file.added ?? (details?.kind === 'commit' ? 'bin' : '')}
              </span>
              <span style={{ width: '90px', flexShrink: 0, textAlign: 'right', color: '#e5534b' }}>
                {file.removed ?? (details?.kind === 'commit' ? 'bin' : '')}
              </span>
            </div>
          ))}
        </div>
      </div>
    </GitModal>
  );
};

export default GitLogDialog;
