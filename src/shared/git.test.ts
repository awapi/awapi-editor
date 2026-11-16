import { describe, it, expect } from 'vitest';
import {
  buildGitStatusIndex,
  classifyPorcelainCode,
  getGitStatusForPath,
  parsePorcelainV1Z,
  parseGitLog,
  parseGitBranches,
  parseCommitFiles,
  parseGitDecorations,
  buildGitignorePattern,
  appendGitignoreLine,
  type GitStatusEntry,
} from './git';

function index(entries: GitStatusEntry[], caseInsensitive = false) {
  return buildGitStatusIndex({ ok: true, repoRoot: '/repo', caseInsensitive, entries });
}

describe('classifyPorcelainCode', () => {
  it('prioritizes conflicts, then unstaged work-tree changes over staged ones', () => {
    expect(classifyPorcelainCode('UU')).toBe('conflicted');
    expect(classifyPorcelainCode('AA')).toBe('conflicted');
    expect(classifyPorcelainCode(' M')).toBe('modified');
    expect(classifyPorcelainCode('MM')).toBe('modified');
    expect(classifyPorcelainCode('AM')).toBe('modified');
    expect(classifyPorcelainCode('M ')).toBe('staged');
    expect(classifyPorcelainCode('A ')).toBe('added');
    expect(classifyPorcelainCode('R ')).toBe('renamed');
    expect(classifyPorcelainCode(' D')).toBe('deleted');
    expect(classifyPorcelainCode('??')).toBe('untracked');
    expect(classifyPorcelainCode('!!')).toBe('ignored');
  });
});

describe('parsePorcelainV1Z', () => {
  it('parses NUL-separated records and skips the original path of renames', () => {
    const output = ' M src/a.ts\0R  new name.ts\0old name.ts\0?? tmp/\0!! dist/\0';
    expect(parsePorcelainV1Z(output)).toEqual([
      { path: 'src/a.ts', status: 'modified' },
      { path: 'new name.ts', status: 'renamed' },
      { path: 'tmp/', status: 'untracked' },
      { path: 'dist/', status: 'ignored' },
    ]);
  });
});

describe('getGitStatusForPath', () => {
  it('returns file statuses and treats unlisted repo files as clean', () => {
    const idx = index([{ path: 'src/a.ts', status: 'modified' }]);
    expect(getGitStatusForPath(idx, '/repo/src/a.ts', false)).toBe('modified');
    expect(getGitStatusForPath(idx, '/repo/src/b.ts', false)).toBe('clean');
  });

  it('returns null outside the repo, for the .git folder, and without an index', () => {
    const idx = index([]);
    expect(getGitStatusForPath(idx, '/other/file.ts', false)).toBeNull();
    expect(getGitStatusForPath(idx, '/repository/file.ts', false)).toBeNull();
    expect(getGitStatusForPath(idx, '/repo/.git', true)).toBeNull();
    expect(getGitStatusForPath(null, '/repo/a.ts', false)).toBeNull();
  });

  it('rolls the most important descendant status up to ancestor folders but not ignored ones', () => {
    const idx = index([
      { path: 'src/deep/a.ts', status: 'untracked' },
      { path: 'src/deep/b.ts', status: 'conflicted' },
      { path: 'src/c.ts', status: 'staged' },
      { path: 'docs/x.log', status: 'ignored' },
    ]);
    expect(getGitStatusForPath(idx, '/repo/src', true)).toBe('conflicted');
    expect(getGitStatusForPath(idx, '/repo/src/deep', true)).toBe('conflicted');
    expect(getGitStatusForPath(idx, '/repo/docs', true)).toBe('clean');
  });

  it('applies untracked/ignored folder entries to their whole subtree', () => {
    const idx = index([
      { path: 'node_modules/', status: 'ignored' },
      { path: 'new/', status: 'untracked' },
    ]);
    expect(getGitStatusForPath(idx, '/repo/node_modules/pkg/index.js', false)).toBe('ignored');
    expect(getGitStatusForPath(idx, '/repo/node_modules', true)).toBe('ignored');
    expect(getGitStatusForPath(idx, '/repo/new/sub', true)).toBe('untracked');
  });

  it('matches Windows paths case-insensitively regardless of separator style', () => {
    const idx = buildGitStatusIndex({
      ok: true,
      repoRoot: 'C:/Projects/Repo',
      caseInsensitive: true,
      entries: [{ path: 'Src/App.tsx', status: 'added' }],
    });
    expect(getGitStatusForPath(idx, 'c:\\projects\\repo\\src\\app.tsx', false)).toBe('added');
    expect(getGitStatusForPath(idx, 'C:\\Projects\\Repo\\Src', true)).toBe('added');
  });
});

describe('git command helpers', () => {
  it('parses log records with parents, decorations, and subjects containing the field separator', () => {
    const out =
      `aaa\x1fa\x1fppp qqq\x1fAnn\x1f2026-01-02T03:04:05Z\x1fHEAD -> refs/heads/main, tag: refs/tags/v1\x1ffix: one\x1fmore\x1e\n` +
      `bbb\x1fb\x1f\x1fBob\x1f2026-01-01T00:00:00Z\x1f\x1fsecond\x1e`;
    expect(parseGitLog(out)).toEqual([
      {
        hash: 'aaa',
        shortHash: 'a',
        parents: ['ppp', 'qqq'],
        author: 'Ann',
        date: '2026-01-02T03:04:05Z',
        refs: [
          { name: 'main', kind: 'head' },
          { name: 'v1', kind: 'tag' },
        ],
        subject: 'fix: one\x1fmore',
      },
      { hash: 'bbb', shortHash: 'b', parents: [], author: 'Bob', date: '2026-01-01T00:00:00Z', refs: [], subject: 'second' },
    ]);
  });

  it('classifies decorations into current, local, remote branches and tags', () => {
    expect(
      parseGitDecorations('HEAD -> refs/heads/main, refs/heads/feature/x, refs/remotes/origin/main, tag: refs/tags/v0.4.8'),
    ).toEqual([
      { name: 'main', kind: 'head' },
      { name: 'feature/x', kind: 'branch' },
      { name: 'origin/main', kind: 'remote' },
      { name: 'v0.4.8', kind: 'tag' },
    ]);
    expect(parseGitDecorations('HEAD')).toEqual([{ name: 'HEAD', kind: 'head' }]);
    expect(parseGitDecorations('')).toEqual([]);
  });

  it('parses branches and skips symbolic remote HEAD refs', () => {
    const out = [
      '*\x1frefs/heads/main\x1fmain\x1forigin/main',
      ' \x1frefs/heads/dev\x1fdev\x1f',
      ' \x1frefs/remotes/origin/HEAD\x1forigin\x1f',
      ' \x1frefs/remotes/origin/main\x1forigin/main\x1f',
    ].join('\n');
    expect(parseGitBranches(out)).toEqual([
      { name: 'main', remote: false, current: true, upstream: 'origin/main' },
      { name: 'dev', remote: false, current: false, upstream: null },
      { name: 'origin/main', remote: true, current: false, upstream: null },
    ]);
  });

  it('merges -z name-status and numstat output, including renames and binary files', () => {
    const nameStatus = 'M\0src/a.ts\0R100\0old.ts\0new.ts\0A\0img.png\0';
    const numstat = '3\t1\tsrc/a.ts\0' + '0\t0\t\0old.ts\0new.ts\0' + '-\t-\timg.png\0';
    expect(parseCommitFiles(nameStatus, numstat)).toEqual([
      { status: 'M', path: 'src/a.ts', added: 3, removed: 1 },
      { status: 'R', path: 'new.ts', oldPath: 'old.ts', added: 0, removed: 0 },
      { status: 'A', path: 'img.png', added: null, removed: null },
    ]);
  });

  it('builds anchored, escaped .gitignore patterns', () => {
    expect(buildGitignorePattern('src/out', true, false)).toBe('/src/out/');
    expect(buildGitignorePattern('logs/a[1].log', false, false)).toBe('/logs/a\\[1\\].log');
    expect(buildGitignorePattern('logs/a.log', false, true)).toBe('*.log');
    expect(buildGitignorePattern('Makefile', false, true)).toBeNull();
    expect(buildGitignorePattern('.env', false, true)).toBeNull();
  });

  it('appends .gitignore lines once, preserving the existing line ending', () => {
    expect(appendGitignoreLine('', '/dist/')).toBe('/dist/\n');
    expect(appendGitignoreLine('node_modules/\r\n*.log', '/dist/')).toBe('node_modules/\r\n*.log\r\n/dist/\r\n');
    expect(appendGitignoreLine('/dist/\n', '/dist/')).toBeNull();
  });
});
