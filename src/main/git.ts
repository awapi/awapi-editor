import type { GitStatusResult } from '../shared/git';
import { parsePorcelainV1Z } from '../shared/git';

// Only `import type` from Node built-ins: process spawning and fs watching are
// injected via `GitDeps` (wired up in main.ts) so this logic is unit testable.

export interface GitRunResult {
  /** Exit code, or null when the process could not be spawned (e.g. Git not installed). */
  code: number | null;
  stdout: string;
  stderr: string;
}

export interface GitWatcherHandle {
  close: () => void;
}

export interface GitRunOptions {
  /** Extra environment variables merged over the main process environment. */
  env?: Record<string, string>;
  timeoutMs?: number;
}

export interface GitDeps {
  runGit: (args: string[], cwd: string, options?: GitRunOptions) => Promise<GitRunResult>;
  /** Watches `dirPath` (non-recursive); `onEvent` receives the changed entry name. */
  watchDir: (dirPath: string, onEvent: (filename: string | null) => void) => GitWatcherHandle | null;
  platform: NodeJS.Platform;
}

interface RepoInfo {
  repoRoot: string;
  gitDir: string;
}

export const GIT_WATCH_DEBOUNCE_MS = 300;

// `--no-optional-locks` keeps `git status` from rewriting `.git/index`, which
// would otherwise trigger our own `.git` watcher in a loop.
const STATUS_ARGS = [
  '--no-optional-locks',
  'status',
  '--porcelain=v1',
  '-z',
  '--untracked-files=normal',
  '--ignored=matching',
];

const repoCache = new Map<string, RepoInfo>();

/** Resolves the repository containing `dirPath`. Only positive results are cached. */
export async function resolveRepo(
  dirPath: string,
  deps: GitDeps,
): Promise<RepoInfo | { error: 'not-a-repo' | 'git-unavailable' }> {
  const cached = repoCache.get(dirPath);
  if (cached) return cached;
  const res = await deps.runGit(['rev-parse', '--show-toplevel', '--absolute-git-dir'], dirPath);
  if (res.code === null) return { error: 'git-unavailable' };
  const [repoRoot, gitDir] = res.stdout.split(/\r?\n/).map(s => s.trim());
  if (res.code !== 0 || !repoRoot || !gitDir) return { error: 'not-a-repo' };
  const info = { repoRoot, gitDir };
  repoCache.set(dirPath, info);
  return info;
}

/** Runs `git status` for the repository containing `dirPath`. */
export async function getGitStatus(dirPath: unknown, deps: GitDeps): Promise<GitStatusResult> {
  if (typeof dirPath !== 'string' || !dirPath.trim()) {
    return { ok: false, reason: 'error', error: 'Invalid directory path.' };
  }
  const repo = await resolveRepo(dirPath, deps);
  if ('error' in repo) return { ok: false, reason: repo.error };

  const res = await deps.runGit(STATUS_ARGS, repo.repoRoot);
  if (res.code === null) return { ok: false, reason: 'git-unavailable' };
  if (res.code !== 0) {
    repoCache.delete(dirPath);
    return { ok: false, reason: 'error', error: res.stderr.trim() || `git exited with code ${res.code}` };
  }
  return {
    ok: true,
    repoRoot: repo.repoRoot,
    caseInsensitive: deps.platform === 'win32' || deps.platform === 'darwin',
    entries: parsePorcelainV1Z(res.stdout),
  };
}

interface CoalesceState {
  current: Promise<GitStatusResult>;
  queued: Promise<GitStatusResult> | null;
}

const inFlight = new Map<string, CoalesceState>();

/**
 * Like `getGitStatus`, but at most one `git status` runs per folder at a time.
 * Requests arriving while one runs share a single follow-up run, so bursts of
 * file-system events never pile up Git processes.
 */
export function getGitStatusCoalesced(dirPath: string, deps: GitDeps): Promise<GitStatusResult> {
  const state = inFlight.get(dirPath);
  if (!state) {
    const current = getGitStatus(dirPath, deps);
    const fresh: CoalesceState = { current, queued: null };
    inFlight.set(dirPath, fresh);
    void current.finally(() => {
      if (inFlight.get(dirPath) === fresh && !fresh.queued) inFlight.delete(dirPath);
    });
    return current;
  }
  if (state.queued) return state.queued;
  const queued = state.current
    .catch(() => undefined)
    .then(() => {
      state.current = queued;
      state.queued = null;
      return getGitStatus(dirPath, deps);
    });
  state.queued = queued;
  void queued.finally(() => {
    if (inFlight.get(dirPath) === state && !state.queued) inFlight.delete(dirPath);
  });
  return queued;
}

/** Ignores transient lock files Git creates while updating the index or refs. */
export function isRelevantGitDirChange(filename: string | null): boolean {
  if (!filename) return true;
  return !filename.endsWith('.lock');
}

let activeWatch: { key: string; handle: GitWatcherHandle | null } | null = null;
let watchTimer: ReturnType<typeof setTimeout> | null = null;
let watchGeneration = 0;

function stopGitWatch(): void {
  if (watchTimer) clearTimeout(watchTimer);
  watchTimer = null;
  try {
    activeWatch?.handle?.close();
  } catch {
    // ignore close errors
  }
  activeWatch = null;
}

/**
 * Watches the `.git` folder of the repository containing `dirPath` so commits,
 * staging, checkouts, and merges made outside the editor refresh the overlays.
 * Pass null to stop watching.
 */
export async function syncGitRepoWatch(
  dirPath: unknown,
  deps: GitDeps,
  onChange: (repoRoot: string) => void,
): Promise<void> {
  const generation = ++watchGeneration;
  if (typeof dirPath !== 'string' || !dirPath.trim()) {
    stopGitWatch();
    return;
  }
  const repo = await resolveRepo(dirPath, deps);
  // A newer request superseded this one while Git was resolving the repo.
  if (generation !== watchGeneration) return;
  if ('error' in repo) {
    stopGitWatch();
    return;
  }
  if (activeWatch?.key === repo.gitDir) return;
  stopGitWatch();
  const watch = { key: repo.gitDir, handle: null as GitWatcherHandle | null };
  activeWatch = watch;
  watch.handle = deps.watchDir(repo.gitDir, filename => {
    if (activeWatch !== watch || !isRelevantGitDirChange(filename)) return;
    if (watchTimer) clearTimeout(watchTimer);
    watchTimer = setTimeout(() => {
      watchTimer = null;
      onChange(repo.repoRoot);
    }, GIT_WATCH_DEBOUNCE_MS);
  });
}

/** Clears caches, in-flight bookkeeping, and the `.git` watcher (shutdown and tests). */
export function resetGitState(): void {
  stopGitWatch();
  repoCache.clear();
  inFlight.clear();
}
