/**
 * Git dialogs (Commit, Revert, Diff, Log, Switch, Create Branch) open in their
 * own native modal window, like the diagram pop-out. These types are shared by
 * the main process, the preload bridge, and both renderer windows.
 */
import type { GitFileStatus } from './git';

export type GitDialogKind = 'commit' | 'revert' | 'diff' | 'log' | 'switch' | 'createBranch';

/** File or folder a Git command targets. */
export interface GitDialogTarget {
  /** Absolute path of the file or folder. */
  path: string;
  isDirectory: boolean;
  /** True for the Explorer root (header or empty space). */
  isRoot: boolean;
  status: GitFileStatus;
  /**
   * Folder to run Git in. Defaults to the folder itself or the file's parent;
   * set it (e.g. to the repo root) when that folder may not exist, as for deleted files.
   */
  cwd?: string;
  /** Diff only: compare this commit with its first parent instead of HEAD with the working tree. */
  revision?: string;
  /** Diff only: path before a rename, for the parent side of a commit diff. */
  oldPath?: string;
}

/** Colors of the opener's theme, so the dialog window matches it (including custom themes). */
export interface GitDialogColors {
  background: string;
  foreground: string;
  tabBackground: string;
  tabActiveBackground: string;
  tabBorder: string;
  tabHover: string;
}

export interface GitDialogRequest {
  kind: GitDialogKind;
  target: GitDialogTarget;
  colors: GitDialogColors;
  isLightTheme: boolean;
  /** Background of selected list rows. */
  activeRowBg: string;
}

/** Reported back to the opener when a dialog action succeeds. */
export interface GitDialogResult {
  summary: string;
  output: string;
}

const KINDS: ReadonlySet<string> = new Set(['commit', 'revert', 'diff', 'log', 'switch', 'createBranch']);
const COLOR_KEYS: Array<keyof GitDialogColors> = [
  'background',
  'foreground',
  'tabBackground',
  'tabActiveBackground',
  'tabBorder',
  'tabHover',
];

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** Validates an untrusted `gitDialog:open` payload. */
export function normalizeGitDialogRequest(raw: unknown): GitDialogRequest | null {
  if (!isRecord(raw) || typeof raw.kind !== 'string' || !KINDS.has(raw.kind)) return null;
  const { target, colors } = raw;
  if (!isRecord(target) || typeof target.path !== 'string' || !target.path || typeof target.status !== 'string') {
    return null;
  }
  if (!isRecord(colors) || !COLOR_KEYS.every(k => typeof colors[k] === 'string')) return null;
  return {
    kind: raw.kind as GitDialogKind,
    target: {
      path: target.path,
      isDirectory: target.isDirectory === true,
      isRoot: target.isRoot === true,
      status: target.status as GitFileStatus,
      ...(typeof target.cwd === 'string' && target.cwd ? { cwd: target.cwd } : {}),
      ...(typeof target.revision === 'string' && /^[0-9a-f]{4,64}$/i.test(target.revision) ? { revision: target.revision } : {}),
      ...(typeof target.oldPath === 'string' && target.oldPath ? { oldPath: target.oldPath } : {}),
    },
    colors: Object.fromEntries(COLOR_KEYS.map(k => [k, colors[k] as string])) as unknown as GitDialogColors,
    isLightTheme: raw.isLightTheme === true,
    activeRowBg: typeof raw.activeRowBg === 'string' ? raw.activeRowBg : colors.tabHover as string,
  };
}

export function normalizeGitDialogResult(raw: unknown): GitDialogResult | null {
  if (!isRecord(raw) || typeof raw.summary !== 'string') return null;
  return { summary: raw.summary, output: typeof raw.output === 'string' ? raw.output : '' };
}

const BASE_TITLES: Record<GitDialogKind, string> = {
  commit: 'Commit',
  revert: 'Revert',
  diff: 'Diff',
  log: 'Log',
  switch: 'Switch/Checkout',
  createBranch: 'Create Branch',
};

export function getGitDialogTitle(request: Pick<GitDialogRequest, 'kind' | 'target'>): string {
  const base = BASE_TITLES[request.kind];
  if (request.kind === 'diff' && request.target.revision) {
    return `${base}: ${request.target.path} @ ${request.target.revision.slice(0, 7)}`;
  }
  return request.kind === 'diff' || request.kind === 'log' ? `${base}: ${request.target.path}` : base;
}

interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

const SIZES: Record<GitDialogKind, { width: number; height: number } | 'large'> = {
  commit: { width: 680, height: 600 },
  revert: { width: 640, height: 500 },
  switch: { width: 520, height: 520 },
  createBranch: { width: 460, height: 240 },
  diff: 'large',
  log: 'large',
};

export const GIT_DIALOG_MIN_WIDTH = 380;
export const GIT_DIALOG_MIN_HEIGHT = 220;

/** Initial bounds for a dialog window, centered over its parent window. */
export function getGitDialogBounds(kind: GitDialogKind, parent: Bounds | null): Bounds {
  const preset = SIZES[kind];
  const size =
    preset === 'large'
      ? {
          width: Math.max(900, Math.round((parent?.width ?? 1200) * 0.9)),
          height: Math.max(600, Math.round((parent?.height ?? 800) * 0.85)),
        }
      : preset;
  if (!parent) return { x: 0, y: 0, ...size };
  return {
    x: Math.round(parent.x + (parent.width - size.width) / 2),
    y: Math.round(parent.y + Math.max(0, (parent.height - size.height) / 2)),
    ...size,
  };
}
