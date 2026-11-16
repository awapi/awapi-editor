import type { GitFileStatus } from '../../shared/git';
import type { GitDialogTarget } from '../../shared/gitDialog';

/** File or folder the Explorer "Git" submenu was opened on. */
export type GitTarget = GitDialogTarget;

export type GitMenuAction =
  | 'commit'
  | 'diff'
  | 'log'
  | 'pull'
  | 'fetch'
  | 'push'
  | 'switch'
  | 'createBranch'
  | 'add'
  | 'unstage'
  | 'revert'
  | 'resolve'
  | 'ignore'
  | 'ignoreExt';

export type GitMenuItem = { action: GitMenuAction; label: string } | 'separator';

const CHANGED: ReadonlySet<GitFileStatus> = new Set([
  'modified',
  'staged',
  'added',
  'renamed',
  'deleted',
  'conflicted',
]);

export function getFileExtension(filePath: string): string | null {
  const base = filePath.slice(Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\')) + 1);
  const dot = base.lastIndexOf('.');
  return dot > 0 && dot < base.length - 1 ? base.slice(dot) : null;
}

/** True when `absPath` is `target` itself or inside it (separator- and case-insensitive). */
export function isPathWithin(absPath: string, target: string): boolean {
  const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  const a = norm(absPath);
  const t = norm(target);
  return a === t || a.startsWith(t + '/');
}

/** Working folder Git commands run in for `target`. */
export function getGitTargetCwd(target: GitTarget): string {
  if (target.cwd) return target.cwd;
  if (target.isDirectory) return target.path;
  const sep = Math.max(target.path.lastIndexOf('/'), target.path.lastIndexOf('\\'));
  return sep > 0 ? target.path.slice(0, sep) : target.path;
}

/**
 * Builds the TortoiseGit-style submenu for `target`, hiding commands that do
 * not apply to its current status (e.g. Diff on an unmodified file).
 */
export function getGitMenuItems(target: GitTarget): GitMenuItem[] {
  const s = target.status;
  const changed = CHANGED.has(s);
  const isDir = target.isDirectory;
  const groups: GitMenuItem[][] = [];

  const work: GitMenuItem[] = [];
  // Commit always covers the whole repository; the target only decides what is preselected.
  work.push({ action: 'commit', label: 'Commit…' });
  if (!isDir && changed && s !== 'deleted') work.push({ action: 'diff', label: 'Diff with HEAD' });
  if (s !== 'untracked' && s !== 'ignored') work.push({ action: 'log', label: 'Show Log' });
  groups.push(work);

  groups.push([
    { action: 'pull', label: 'Pull' },
    { action: 'fetch', label: 'Fetch' },
    { action: 'push', label: 'Push' },
  ]);

  groups.push([
    { action: 'switch', label: 'Switch/Checkout…' },
    { action: 'createBranch', label: 'Create Branch…' },
  ]);

  const local: GitMenuItem[] = [];
  if (isDir || s === 'untracked' || s === 'modified' || s === 'deleted') local.push({ action: 'add', label: 'Add' });
  if (isDir || s === 'staged' || s === 'added' || s === 'renamed') local.push({ action: 'unstage', label: 'Unstage' });
  if (isDir || changed) local.push({ action: 'revert', label: 'Revert…' });
  if (s === 'conflicted') local.push({ action: 'resolve', label: 'Resolved' });
  groups.push(local);

  const ignore: GitMenuItem[] = [];
  if (!target.isRoot && s !== 'ignored') {
    ignore.push({ action: 'ignore', label: 'Add to .gitignore' });
    const ext = isDir ? null : getFileExtension(target.path);
    if (ext) ignore.push({ action: 'ignoreExt', label: `Add *${ext} to .gitignore` });
  }
  groups.push(ignore);

  const items: GitMenuItem[] = [];
  for (const group of groups) {
    if (group.length === 0) continue;
    if (items.length > 0) items.push('separator');
    items.push(...group);
  }
  return items;
}
