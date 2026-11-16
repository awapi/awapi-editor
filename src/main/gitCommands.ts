import type {
  GitBranchesResult,
  GitChangesResult,
  GitCommandResult,
  GitCommitDetailsResult,
  GitDiffResult,
  GitLogResult,
  GitOperation,
} from '../shared/git';
import {
  GIT_BRANCH_FORMAT,
  GIT_LOG_FORMAT,
  appendGitignoreLine,
  buildGitignorePattern,
  isRestorableFromHead,
  parseGitBranches,
  parseGitLog,
  parseCommitFiles,
  parsePorcelainV1Z,
} from '../shared/git';
import { resolveRepo, type GitDeps, type GitRunResult } from './git';

// Only `import type` from Node built-ins: file access and path math are
// injected (wired up in main.ts) so the command logic is unit testable.

export interface GitCommandDeps extends GitDeps {
  /** Platform `path.relative`. */
  relativePath: (from: string, to: string) => string;
  /** Platform `path.isAbsolute`. */
  isAbsolute: (p: string) => boolean;
  /**
   * Canonical form of `p` (resolves symlinks and Windows 8.3 short names) so it
   * can be compared with the root Git reports; must tolerate missing files.
   */
  realPath: (p: string) => string;
  /** Reads a file as UTF-8, or null when it does not exist. */
  readTextFile: (filePath: string) => string | null;
  writeTextFile: (filePath: string, content: string) => void;
}

/** Network commands must never block on an interactive terminal prompt. */
const NETWORK_ENV = { GIT_TERMINAL_PROMPT: '0' };
const NETWORK_TIMEOUT_MS = 10 * 60 * 1000;
export const DEFAULT_LOG_LIMIT = 200;

type Repo = { repoRoot: string };

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

function describeFailure(res: GitRunResult): string {
  if (res.code === null) return 'Git is not installed or could not be started.';
  return (res.stderr || res.stdout).trim() || `git exited with code ${res.code}`;
}

function combineOutput(...results: GitRunResult[]): string {
  return results
    .map(r => [r.stdout, r.stderr].map(s => s.trim()).filter(Boolean).join('\n'))
    .filter(Boolean)
    .join('\n');
}

async function getRepo(cwd: unknown, deps: GitDeps): Promise<Repo | { error: string }> {
  if (typeof cwd !== 'string' || !cwd.trim()) return { error: 'Invalid folder.' };
  const repo = await resolveRepo(cwd, deps);
  if ('error' in repo) {
    return { error: repo.error === 'git-unavailable' ? 'Git is not installed or could not be started.' : 'Not a Git repository.' };
  }
  return repo;
}

/** Converts an absolute path to a repo-relative pathspec (`.` for the root); null if outside. */
export function toRepoPathspec(repoRoot: string, absPath: unknown, deps: GitCommandDeps): string | null {
  if (typeof absPath !== 'string' || !absPath.trim()) return null;
  const rel = deps.relativePath(deps.realPath(repoRoot), deps.realPath(absPath)).replace(/\\/g, '/');
  if (rel === '') return '.';
  if (rel === '..' || rel.startsWith('../') || deps.isAbsolute(rel)) return null;
  return rel;
}

function toPathspecs(repoRoot: string, paths: unknown, deps: GitCommandDeps): string[] | null {
  if (!Array.isArray(paths) || paths.length === 0) return null;
  const specs: string[] = [];
  for (const p of paths) {
    const spec = toRepoPathspec(repoRoot, p, deps);
    if (!spec) return null;
    specs.push(spec);
  }
  return specs;
}

/** Runs Git with literal (non-glob) pathspecs so names like `a[1].ts` are matched exactly. */
function git(deps: GitDeps, repo: Repo, args: string[], network = false): Promise<GitRunResult> {
  return deps.runGit(
    ['--literal-pathspecs', ...args],
    repo.repoRoot,
    network ? { env: NETWORK_ENV, timeoutMs: NETWORK_TIMEOUT_MS } : undefined,
  );
}

function isValidRefName(name: unknown): name is string {
  return typeof name === 'string' && name.trim() === name && name.length > 0 && !name.startsWith('-');
}

async function hasHead(deps: GitDeps, repo: Repo): Promise<boolean> {
  return (await git(deps, repo, ['rev-parse', '--verify', '-q', 'HEAD'])).code === 0;
}

async function push(deps: GitDeps, repo: Repo): Promise<GitRunResult> {
  const upstream = await git(deps, repo, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']);
  if (upstream.code === 0) return git(deps, repo, ['push'], true);
  // No upstream yet: publish the branch to `origin` (or the only remote).
  const remotes = (await git(deps, repo, ['remote'])).stdout.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const remote = remotes.includes('origin') ? 'origin' : remotes.length === 1 ? remotes[0] : null;
  if (!remote) return git(deps, repo, ['push'], true);
  return git(deps, repo, ['push', '--set-upstream', remote, 'HEAD'], true);
}

function result(...runs: GitRunResult[]): GitCommandResult {
  const failed = runs.find(r => r.code !== 0);
  if (failed) return fail(describeFailure(failed));
  return { ok: true, output: combineOutput(...runs) };
}

/** Executes one whitelisted Git operation requested by the Explorer. */
export async function runGitOperation(op: GitOperation, deps: GitCommandDeps): Promise<GitCommandResult> {
  if (!op || typeof op !== 'object') return fail('Invalid Git operation.');
  const repo = await getRepo(op.cwd, deps);
  if ('error' in repo) return fail(repo.error);

  switch (op.kind) {
    case 'pull':
      return result(await git(deps, repo, ['pull'], true));
    case 'fetch':
      return result(await git(deps, repo, ['fetch', '--prune'], true));
    case 'push':
      return result(await push(deps, repo));

    case 'add':
    case 'resolve': {
      const specs = toPathspecs(repo.repoRoot, op.paths, deps);
      if (!specs) return fail('Invalid paths.');
      return result(await git(deps, repo, op.kind === 'add' ? ['add', '-A', '--', ...specs] : ['add', '--', ...specs]));
    }

    case 'unstage': {
      const specs = toPathspecs(repo.repoRoot, op.paths, deps);
      if (!specs) return fail('Invalid paths.');
      // Before the first commit there is no HEAD to restore the index from.
      const args = (await hasHead(deps, repo))
        ? ['restore', '--staged', '--', ...specs]
        : ['rm', '--cached', '-r', '-q', '--', ...specs];
      return result(await git(deps, repo, args));
    }

    case 'revert': {
      if (!Array.isArray(op.files) || op.files.length === 0) return fail('No files selected.');
      const restore: string[] = [];
      const unstage: string[] = [];
      for (const file of op.files) {
        const spec = toRepoPathspec(repo.repoRoot, file?.path, deps);
        if (!spec) return fail('Invalid paths.');
        (isRestorableFromHead(file.status) ? restore : unstage).push(spec);
      }
      const runs: GitRunResult[] = [];
      if (restore.length > 0) {
        runs.push(await git(deps, repo, ['restore', '--source=HEAD', '--staged', '--worktree', '--', ...restore]));
      }
      // Newly added/renamed files are not in HEAD: unstage them but keep the file on disk.
      if (unstage.length > 0 && runs.every(r => r.code === 0)) {
        runs.push(await git(deps, repo, ['rm', '--cached', '-r', '-q', '--', ...unstage]));
      }
      return result(...runs);
    }

    case 'commit': {
      const message = typeof op.message === 'string' ? op.message.trim() : '';
      if (!message) return fail('Commit message cannot be empty.');
      const amend = op.amend === true;
      const specs = Array.isArray(op.paths) && op.paths.length > 0 ? toPathspecs(repo.repoRoot, op.paths, deps) : [];
      if (!specs) return fail('Invalid paths.');
      if (specs.length === 0 && !amend) return fail('Select at least one file to commit.');

      const runs: GitRunResult[] = [];
      const commitArgs = ['commit', '-m', message, ...(amend ? ['--amend'] : [])];
      if (specs.length > 0) {
        const added = await git(deps, repo, ['add', '-A', '--', ...specs]);
        if (added.code !== 0) return result(added);
        const merging = (await git(deps, repo, ['rev-parse', '-q', '--verify', 'MERGE_HEAD'])).code === 0;
        // A merge must be committed as a whole; otherwise commit only the selected files.
        runs.push(await git(deps, repo, merging ? commitArgs : [...commitArgs, '--only', '--', ...specs]));
      } else {
        runs.push(await git(deps, repo, commitArgs));
      }
      if (op.push === true && runs[0].code === 0) runs.push(await push(deps, repo));
      return result(...runs);
    }

    case 'switch': {
      if (!isValidRefName(op.branch)) return fail('Invalid branch name.');
      const args = op.remote ? ['switch', '--track', op.branch] : ['switch', op.branch];
      return result(await git(deps, repo, args));
    }

    case 'createBranch': {
      if (!isValidRefName(op.name)) return fail('Invalid branch name.');
      const valid = await git(deps, repo, ['check-ref-format', '--branch', op.name]);
      if (valid.code !== 0) return fail(`"${op.name}" is not a valid branch name.`);
      return result(await git(deps, repo, op.checkout ? ['switch', '-c', op.name] : ['branch', op.name]));
    }

    case 'ignore': {
      const spec = toRepoPathspec(repo.repoRoot, op.path, deps);
      if (!spec || spec === '.') return fail('Invalid path.');
      const pattern = buildGitignorePattern(spec, op.isDirectory === true, op.byExtension === true);
      if (!pattern) return fail('This file has no extension to ignore.');
      const gitignorePath = `${repo.repoRoot}/.gitignore`;
      const next = appendGitignoreLine(deps.readTextFile(gitignorePath) ?? '', pattern);
      if (next !== null) {
        try {
          deps.writeTextFile(gitignorePath, next);
        } catch (err) {
          return fail(err instanceof Error ? err.message : String(err));
        }
      }
      const tracked = op.byExtension ? '' : (await git(deps, repo, ['ls-files', '--', spec])).stdout.trim();
      const note = tracked
        ? '\nNote: this path is already tracked; ignoring only affects untracked files. Remove it from the index (git rm --cached) to stop tracking it.'
        : '';
      return { ok: true, output: (next === null ? `${pattern} is already in .gitignore.` : `Added ${pattern} to .gitignore.`) + note };
    }

    default:
      return fail('Unsupported Git operation.');
  }
}

/** Lists changed files (untracked expanded to files) under `scopePath`, or the whole repository when omitted. */
export async function getGitChanges(cwd: unknown, scopePath: unknown, deps: GitCommandDeps): Promise<GitChangesResult> {
  const repo = await getRepo(cwd, deps);
  if ('error' in repo) return fail(repo.error);
  const spec = scopePath == null ? '.' : toRepoPathspec(repo.repoRoot, scopePath, deps);
  if (!spec) return fail('Invalid path.');

  const [status, branch, merge] = await Promise.all([
    git(deps, repo, ['--no-optional-locks', 'status', '--porcelain=v1', '-z', '--untracked-files=all', '--', spec]),
    git(deps, repo, ['symbolic-ref', '--short', '-q', 'HEAD']),
    git(deps, repo, ['rev-parse', '-q', '--verify', 'MERGE_HEAD']),
  ]);
  if (status.code !== 0) return fail(describeFailure(status));
  const root = repo.repoRoot.replace(/\\/g, '/').replace(/\/+$/, '');
  return {
    ok: true,
    repoRoot: repo.repoRoot,
    branch: branch.code === 0 ? branch.stdout.trim() || null : null,
    mergeInProgress: merge.code === 0,
    files: parsePorcelainV1Z(status.stdout)
      .filter(e => e.status !== 'ignored')
      .map(e => ({ ...e, absPath: `${root}/${e.path}` })),
  };
}

const REVISION_RE = /^[0-9a-f]{4,64}$/i;

/** Reads `path` at `revision` (`git show rev:path`); empty when it does not exist there. */
async function readAtRevision(deps: GitDeps, repo: Repo, revision: string, spec: string): Promise<string> {
  const res = await deps.runGit(['show', `${revision}:${spec}`], repo.repoRoot);
  return res.code === 0 ? res.stdout : '';
}

/**
 * Contents of a file for the diff window: HEAD vs the working tree, or - with
 * `revision` - the commit's first parent vs the commit. `oldPath` is the
 * pre-rename path used for the parent side.
 */
export async function getGitDiff(
  cwd: unknown,
  filePath: unknown,
  deps: GitCommandDeps,
  options: { revision?: unknown; oldPath?: unknown } = {},
): Promise<GitDiffResult> {
  const repo = await getRepo(cwd, deps);
  if ('error' in repo) return fail(repo.error);
  const spec = toRepoPathspec(repo.repoRoot, filePath, deps);
  if (!spec || spec === '.') return fail('Invalid path.');
  const { revision, oldPath } = options;
  if (revision != null && (typeof revision !== 'string' || !REVISION_RE.test(revision))) return fail('Invalid commit.');
  const oldSpec = oldPath != null ? toRepoPathspec(repo.repoRoot, oldPath, deps) : spec;
  if (!oldSpec || oldSpec === '.') return fail('Invalid path.');

  let original: string;
  let modified: string;
  if (typeof revision === 'string') {
    // A root commit has no parent: its files diff against an empty original.
    [original, modified] = await Promise.all([
      readAtRevision(deps, repo, `${revision}^`, oldSpec),
      readAtRevision(deps, repo, revision, spec),
    ]);
  } else {
    // Files that are new since HEAD diff against an empty original.
    original = await readAtRevision(deps, repo, 'HEAD', spec);
    modified = deps.readTextFile(filePath as string) ?? '';
  }
  const binary = original.includes('\0') || modified.includes('\0');
  return { ok: true, original: binary ? '' : original, modified: binary ? '' : modified, binary };
}

/** Recent commits touching `targetPath` (follows renames for single files), optionally across all branches. */
export async function getGitLog(
  cwd: unknown,
  targetPath: unknown,
  isDirectory: unknown,
  allBranches: unknown,
  deps: GitCommandDeps,
  limit = DEFAULT_LOG_LIMIT,
): Promise<GitLogResult> {
  const repo = await getRepo(cwd, deps);
  if ('error' in repo) return fail(repo.error);
  const spec = toRepoPathspec(repo.repoRoot, targetPath, deps);
  if (!spec) return fail('Invalid path.');
  const args = ['log', '--decorate=full', `-n${limit}`, `--pretty=format:${GIT_LOG_FORMAT}`];
  if (allBranches === true) args.push('--all');
  if (isDirectory !== true) args.push('--follow');
  const res = await git(deps, repo, [...args, '--', spec]);
  // A repository without commits has no log yet.
  if (res.code !== 0) {
    return (await hasHead(deps, repo)) ? fail(describeFailure(res)) : { ok: true, repoRoot: repo.repoRoot, commits: [] };
  }
  return { ok: true, repoRoot: repo.repoRoot, commits: parseGitLog(res.stdout) };
}

/** Full message and changed files (with line counts, vs the first parent) of one commit. */
export async function getGitCommitDetails(cwd: unknown, hash: unknown, deps: GitCommandDeps): Promise<GitCommitDetailsResult> {
  if (typeof hash !== 'string' || !/^([0-9a-f]{4,64}|HEAD)$/i.test(hash)) return fail('Invalid commit.');
  const repo = await getRepo(cwd, deps);
  if ('error' in repo) return fail(repo.error);
  // Diff against the first parent (so merges show what they brought in); root commits list every file as added.
  const parent = await git(deps, repo, ['rev-parse', '--verify', '-q', `${hash}^1`]);
  const range = parent.code === 0 ? [parent.stdout.trim(), hash] : ['--root', hash];
  const diffTree = ['diff-tree', '-r', '-z', '-M', '--no-commit-id'];
  const [message, nameStatus, numstat] = await Promise.all([
    git(deps, repo, ['show', '-s', '--format=%B', hash]),
    git(deps, repo, [...diffTree, '--name-status', ...range]),
    git(deps, repo, [...diffTree, '--numstat', ...range]),
  ]);
  if (message.code !== 0) return fail(describeFailure(message));
  return {
    ok: true,
    message: message.stdout.trim(),
    files: nameStatus.code === 0 ? parseCommitFiles(nameStatus.stdout, numstat.code === 0 ? numstat.stdout : '') : [],
  };
}
/** Local and remote-tracking branches. */
export async function getGitBranches(cwd: unknown, deps: GitCommandDeps): Promise<GitBranchesResult> {
  const repo = await getRepo(cwd, deps);
  if ('error' in repo) return fail(repo.error);
  const res = await git(deps, repo, ['for-each-ref', `--format=${GIT_BRANCH_FORMAT}`, 'refs/heads', 'refs/remotes']);
  if (res.code !== 0) return fail(describeFailure(res));
  return { ok: true, branches: parseGitBranches(res.stdout) };
}
