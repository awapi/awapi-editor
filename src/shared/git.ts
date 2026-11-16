/**
 * Git status types and pure helpers shared by the main process (which runs
 * `git status`) and the renderer (which decorates File Explorer rows).
 */

/** Per-path Git state shown as a TortoiseGit-style overlay in the File Explorer. */
export type GitFileStatus =
  | 'clean'
  | 'modified'
  | 'staged'
  | 'added'
  | 'renamed'
  | 'deleted'
  | 'conflicted'
  | 'untracked'
  | 'ignored';

/** One entry from `git status`. `path` is repo-relative with `/`; folders end with `/`. */
export interface GitStatusEntry {
  path: string;
  status: GitFileStatus;
}

export type GitStatusResult =
  | {
      ok: true;
      /** Absolute repository root as reported by Git (forward slashes). */
      repoRoot: string;
      /** True on Windows/macOS where paths should be compared case-insensitively. */
      caseInsensitive: boolean;
      entries: GitStatusEntry[];
    }
  | { ok: false; reason: 'not-a-repo' | 'git-unavailable' | 'error'; error?: string };

/** Human-readable labels used for tooltips and accessible names. */
export const GIT_STATUS_LABELS: Record<GitFileStatus, string> = {
  clean: 'Unmodified',
  modified: 'Modified (not staged)',
  staged: 'Modified (staged)',
  added: 'Added (staged)',
  renamed: 'Renamed (staged)',
  deleted: 'Deleted',
  conflicted: 'Conflicted',
  untracked: 'Untracked',
  ignored: 'Ignored',
};

/** Higher wins when several descendants roll up into one folder status. */
const FOLDER_PRIORITY: Partial<Record<GitFileStatus, number>> = {
  conflicted: 6,
  modified: 5,
  deleted: 5,
  added: 4,
  renamed: 4,
  staged: 3,
  untracked: 2,
};

const CONFLICT_CODES = new Set(['DD', 'AU', 'UD', 'UA', 'DU', 'AA', 'UU']);

/**
 * Maps a porcelain v1 `XY` code to a status. Unstaged work-tree changes take
 * precedence over staged ones so "not staged yet" is always visible.
 */
export function classifyPorcelainCode(xy: string): GitFileStatus | null {
  if (xy.length !== 2) return null;
  if (xy === '??') return 'untracked';
  if (xy === '!!') return 'ignored';
  if (CONFLICT_CODES.has(xy)) return 'conflicted';
  const [x, y] = xy;
  if (y === 'M' || y === 'T') return 'modified';
  if (y === 'D') return 'deleted';
  if (x === 'A') return 'added';
  if (x === 'R' || x === 'C') return 'renamed';
  if (x === 'D') return 'deleted';
  if (x === 'M' || x === 'T') return 'staged';
  return null;
}

/** Parses `git status --porcelain=v1 -z` output. */
export function parsePorcelainV1Z(output: string): GitStatusEntry[] {
  const entries: GitStatusEntry[] = [];
  const records = output.split('\0');
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    if (record.length < 4) continue;
    const xy = record.slice(0, 2);
    const path = record.slice(3);
    // Renames/copies are followed by an extra NUL-terminated "from" path.
    if (xy[0] === 'R' || xy[0] === 'C') i++;
    const status = classifyPorcelainCode(xy);
    if (status && path) entries.push({ path, status });
  }
  return entries;
}

/** Lookup structure built once per status refresh so each tree row is O(depth). */
export interface GitStatusIndex {
  repoRoot: string;
  caseInsensitive: boolean;
  files: Map<string, GitFileStatus>;
  /** Folder roll-ups of changed descendants. */
  folders: Map<string, GitFileStatus>;
  /** Folders reported whole (`dir/`) whose entire subtree is untracked or ignored. */
  subtrees: Map<string, 'untracked' | 'ignored'>;
}

function normalizeSlashes(p: string): string {
  return p.replace(/\\/g, '/').replace(/\/+$/, '');
}

function toKey(p: string, caseInsensitive: boolean): string {
  return caseInsensitive ? p.toLowerCase() : p;
}

function rollUp(folders: Map<string, GitFileStatus>, relPath: string, status: GitFileStatus): void {
  const priority = FOLDER_PRIORITY[status];
  if (!priority) return;
  let idx = relPath.lastIndexOf('/');
  while (idx > 0) {
    const parent = relPath.slice(0, idx);
    const current = folders.get(parent);
    if (current && (FOLDER_PRIORITY[current] ?? 0) >= priority) break;
    folders.set(parent, status);
    idx = parent.lastIndexOf('/');
  }
}

export function buildGitStatusIndex(
  result: Extract<GitStatusResult, { ok: true }>,
): GitStatusIndex {
  const { caseInsensitive } = result;
  const index: GitStatusIndex = {
    repoRoot: toKey(normalizeSlashes(result.repoRoot), caseInsensitive),
    caseInsensitive,
    files: new Map(),
    folders: new Map(),
    subtrees: new Map(),
  };
  for (const entry of result.entries) {
    const isDir = entry.path.endsWith('/');
    const rel = toKey(normalizeSlashes(entry.path), caseInsensitive);
    if (!rel) continue;
    if (isDir && (entry.status === 'untracked' || entry.status === 'ignored')) {
      index.subtrees.set(rel, entry.status);
    } else {
      index.files.set(rel, entry.status);
    }
    rollUp(index.folders, rel, entry.status);
  }
  return index;
}

/**
 * Resolves the Git status for an absolute file or folder path. Returns null
 * for paths outside the repository and for the `.git` folder itself.
 */
export function getGitStatusForPath(
  index: GitStatusIndex | null,
  absPath: string,
  isDirectory: boolean,
): GitFileStatus | null {
  if (!index) return null;
  const path = toKey(normalizeSlashes(absPath), index.caseInsensitive);
  if (!path.startsWith(index.repoRoot + '/')) return null;
  const rel = path.slice(index.repoRoot.length + 1);
  if (rel === '.git' || rel.startsWith('.git/')) return null;

  const fileStatus = index.files.get(rel);
  if (fileStatus) return fileStatus;

  if (index.subtrees.size > 0) {
    let candidate = rel;
    while (candidate) {
      const inherited = index.subtrees.get(candidate);
      if (inherited) return inherited;
      const sep = candidate.lastIndexOf('/');
      candidate = sep > 0 ? candidate.slice(0, sep) : '';
    }
  }

  if (isDirectory) {
    const folderStatus = index.folders.get(rel);
    if (folderStatus) return folderStatus;
  }
  return 'clean';
}

// ── Git commands (Explorer "Git" context menu) ───────────────────────────────

/** A changed file listed in the Commit / Revert dialogs. */
export interface GitChangedFile {
  /** Repo-relative path with `/` separators. */
  path: string;
  /** Absolute path (repo root joined with `path`, `/` separators). */
  absPath: string;
  status: GitFileStatus;
}

export type GitChangesResult =
  | {
      ok: true;
      repoRoot: string;
      /** Current branch name, or null when HEAD is detached. */
      branch: string | null;
      /** True while a merge is in progress (partial commits are not allowed). */
      mergeInProgress: boolean;
      files: GitChangedFile[];
    }
  | { ok: false; error: string };

/**
 * Operations the renderer may request through `git:run`. Paths are absolute;
 * the main process converts them to repo-relative literal pathspecs. Only this
 * fixed set is exposed - the renderer can never pass raw Git arguments.
 */
export type GitOperation =
  | { kind: 'pull' | 'fetch' | 'push'; cwd: string }
  | { kind: 'add' | 'unstage' | 'resolve'; cwd: string; paths: string[] }
  | { kind: 'revert'; cwd: string; files: Array<{ path: string; status: GitFileStatus }> }
  | { kind: 'commit'; cwd: string; message: string; paths: string[]; amend: boolean; push: boolean }
  | { kind: 'switch'; cwd: string; branch: string; remote: boolean }
  | { kind: 'createBranch'; cwd: string; name: string; checkout: boolean }
  | { kind: 'ignore'; cwd: string; path: string; isDirectory: boolean; byExtension: boolean };

export type GitCommandResult = { ok: true; output: string } | { ok: false; error: string };

export type GitDiffResult =
  | { ok: true; original: string; modified: string; binary: boolean }
  | { ok: false; error: string };

/** A branch, tag, or HEAD pointer shown as a label next to a commit in the log. */
export interface GitRef {
  /** Short name, e.g. main, origin/main, 1.0. */
  name: string;
  /** head is the checked-out branch (or a detached HEAD). */
  kind: 'head' | 'branch' | 'remote' | 'tag';
}

export interface GitLogCommit {
  hash: string;
  shortHash: string;
  /** Parent hashes (first parent first); empty for a root commit. */
  parents: string[];
  author: string;
  /** ISO-8601 author date. */
  date: string;
  refs: GitRef[];
  subject: string;
}

export type GitLogResult = { ok: true; repoRoot: string; commits: GitLogCommit[] } | { ok: false; error: string };

/** One file changed by a commit (compared with its first parent). */
export interface GitCommitFile {
  /** Single-letter Git status: A, M, D, R, C, T. */
  status: string;
  /** Repo-relative path (/ separators); the new path for renames. */
  path: string;
  /** Previous path for renames/copies. */
  oldPath?: string;
  /** Line counts; null for binary files. */
  added: number | null;
  removed: number | null;
}

export type GitCommitDetailsResult =
  | { ok: true; message: string; files: GitCommitFile[] }
  | { ok: false; error: string };

export interface GitBranch {
  /** Short name, e.g. `main` or `origin/main`. */
  name: string;
  remote: boolean;
  current: boolean;
  upstream: string | null;
}

export type GitBranchesResult = { ok: true; branches: GitBranch[] } | { ok: false; error: string };

/** Files that exist in HEAD and are reverted by restoring them; others are only unstaged. */
export function isRestorableFromHead(status: GitFileStatus): boolean {
  return status === 'modified' || status === 'staged' || status === 'deleted' || status === 'conflicted';
}

const FIELD_SEP = '\x1f';
const RECORD_SEP = '\x1e';

/**
 * Format string for `git log --decorate=full --pretty=format:` matching
 * `parseGitLog`. The subject is last so separators inside it are harmless.
 */
export const GIT_LOG_FORMAT = '%H%x1f%h%x1f%P%x1f%an%x1f%aI%x1f%D%x1f%s%x1e';

/** Parses `%D` output produced with `--decorate=full`. */
export function parseGitDecorations(decorations: string): GitRef[] {
  const refs: GitRef[] = [];
  for (const raw of decorations.split(', ')) {
    let item = raw.trim();
    if (!item) continue;
    let isHead = false;
    if (item.startsWith('HEAD -> ')) {
      isHead = true;
      item = item.slice('HEAD -> '.length);
    }
    if (item === 'HEAD') {
      refs.push({ name: 'HEAD', kind: 'head' });
    } else if (item.startsWith('tag: refs/tags/')) {
      refs.push({ name: item.slice('tag: refs/tags/'.length), kind: 'tag' });
    } else if (item.startsWith('refs/heads/')) {
      refs.push({ name: item.slice('refs/heads/'.length), kind: isHead ? 'head' : 'branch' });
    } else if (item.startsWith('refs/remotes/')) {
      refs.push({ name: item.slice('refs/remotes/'.length), kind: 'remote' });
    }
  }
  return refs;
}

export function parseGitLog(output: string): GitLogCommit[] {
  const commits: GitLogCommit[] = [];
  for (const record of output.split(RECORD_SEP)) {
    const fields = record.replace(/^\r?\n/, '').split(FIELD_SEP);
    if (fields.length < 7 || !fields[0]) continue;
    const [hash, shortHash, parents, author, date, decorations, ...subject] = fields;
    commits.push({
      hash,
      shortHash,
      parents: parents.split(' ').filter(Boolean),
      author,
      date,
      refs: parseGitDecorations(decorations),
      subject: subject.join(FIELD_SEP),
    });
  }
  return commits;
}

/** Format string for `git for-each-ref --format=` matching `parseGitBranches`. */
export const GIT_BRANCH_FORMAT = '%(HEAD)%1f%(refname)%1f%(refname:short)%1f%(upstream:short)';

export function parseGitBranches(output: string): GitBranch[] {
  const branches: GitBranch[] = [];
  for (const line of output.split(/\r?\n/)) {
    const [head, refname, short, upstream] = line.split(FIELD_SEP);
    if (!refname || !short) continue;
    const remote = refname.startsWith('refs/remotes/');
    // Skip symbolic `origin/HEAD` entries.
    if (remote && refname.endsWith('/HEAD')) continue;
    branches.push({ name: short, remote, current: head === '*', upstream: upstream || null });
  }
  return branches;
}

/**
 * Merges `git diff-tree -z --name-status` and `-z --numstat` output into one
 * file list with line counts (`-` counts, i.e. binary files, become null).
 */
export function parseCommitFiles(nameStatusZ: string, numstatZ: string): GitCommitFile[] {
  const files: GitCommitFile[] = [];
  const ns = nameStatusZ.split('\0');
  for (let i = 0; i < ns.length; i++) {
    const code = ns[i];
    if (!code || !/^[A-Z]/.test(code)) continue;
    const status = code.charAt(0);
    if (status === 'R' || status === 'C') {
      const oldPath = ns[++i];
      const path = ns[++i];
      if (path) files.push({ status, path, oldPath, added: null, removed: null });
    } else {
      const path = ns[++i];
      if (path) files.push({ status, path, added: null, removed: null });
    }
  }

  const counts = new Map<string, { added: number | null; removed: number | null }>();
  const nm = numstatZ.split('\0');
  for (let i = 0; i < nm.length; i++) {
    const match = /^(-|\d+)\t(-|\d+)\t(.*)$/s.exec(nm[i]);
    if (!match) continue;
    // Renames print an empty path followed by the old and new paths as separate fields.
    let path = match[3];
    if (path === '') {
      i += 2;
      path = nm[i] ?? '';
    }
    counts.set(path, {
      added: match[1] === '-' ? null : Number(match[1]),
      removed: match[2] === '-' ? null : Number(match[2]),
    });
  }
  for (const file of files) {
    const count = counts.get(file.path);
    if (count) Object.assign(file, count);
  }
  return files;
}

/** Escapes glob characters so a `.gitignore` line matches the literal name. */
export function escapeGitignorePattern(name: string): string {
  return name.replace(/[\\*?[\]!#]/g, ch => `\\${ch}`).replace(/ $/, '\\ ');
}

/** Builds the `.gitignore` line for a repo-relative path (anchored), or `*.ext`. */
export function buildGitignorePattern(relPath: string, isDirectory: boolean, byExtension: boolean): string | null {
  const rel = relPath.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
  if (!rel) return null;
  if (byExtension) {
    const base = rel.slice(rel.lastIndexOf('/') + 1);
    const dot = base.lastIndexOf('.');
    if (dot <= 0 || dot === base.length - 1) return null;
    return `*${escapeGitignorePattern(base.slice(dot))}`;
  }
  return `/${rel.split('/').map(escapeGitignorePattern).join('/')}${isDirectory ? '/' : ''}`;
}

/** Appends `pattern` to `.gitignore` content unless an identical line already exists. */
export function appendGitignoreLine(existing: string, pattern: string): string | null {
  const lines = existing.split(/\r?\n/).map(l => l.trim());
  if (lines.includes(pattern)) return null;
  const eol = existing.includes('\r\n') ? '\r\n' : '\n';
  const prefix = existing.length > 0 && !/\r?\n$/.test(existing) ? eol : '';
  return `${existing}${prefix}${pattern}${eol}`;
}