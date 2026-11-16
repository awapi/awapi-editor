import { describe, it, expect } from 'vitest';
import { getFileExtension, getGitMenuItems, getGitTargetCwd, type GitTarget } from './gitMenu';

const actions = (target: GitTarget) =>
  getGitMenuItems(target).flatMap(item => (item === 'separator' ? [] : [item.action]));

describe('getGitMenuItems', () => {
  it('offers the full folder menu, without .gitignore for the Explorer root', () => {
    const folder: GitTarget = { path: '/repo/src', isDirectory: true, isRoot: false, status: 'clean' };
    expect(actions(folder)).toEqual([
      'commit', 'log', 'pull', 'fetch', 'push', 'switch', 'createBranch', 'add', 'unstage', 'revert', 'ignore',
    ]);
    expect(actions({ ...folder, isRoot: true })).not.toContain('ignore');
    expect(actions({ ...folder, status: 'conflicted' })).toContain('resolve');
  });

  it('only shows file commands that apply to the file status', () => {
    const file = (status: GitTarget['status']): GitTarget => ({ path: '/repo/a.ts', isDirectory: false, isRoot: false, status });
    expect(actions(file('clean'))).toEqual(['commit', 'log', 'pull', 'fetch', 'push', 'switch', 'createBranch', 'ignore', 'ignoreExt']);
    expect(actions(file('modified'))).toEqual(
      expect.arrayContaining(['commit', 'diff', 'log', 'add', 'revert']),
    );
    expect(actions(file('modified'))).not.toContain('unstage');
    expect(actions(file('staged'))).toEqual(expect.arrayContaining(['unstage', 'revert', 'diff']));
    expect(actions(file('untracked'))).toEqual(expect.arrayContaining(['commit', 'add']));
    expect(actions(file('untracked'))).not.toContain('log');
    expect(actions(file('conflicted'))).toEqual(expect.arrayContaining(['resolve', 'diff', 'revert']));
    expect(actions(file('ignored'))).not.toContain('ignore');
  });

  it('never starts or ends with a separator', () => {
    const items = getGitMenuItems({ path: '/repo/x', isDirectory: false, isRoot: false, status: 'ignored' });
    expect(items[0]).not.toBe('separator');
    expect(items.at(-1)).not.toBe('separator');
  });
});

describe('gitMenu helpers', () => {
  it('resolves the working folder and file extension', () => {
    expect(getGitTargetCwd({ path: 'C:\\repo\\src\\a.ts', isDirectory: false, isRoot: false, status: 'clean' })).toBe('C:\\repo\\src');
    expect(getGitTargetCwd({ path: '/repo/src', isDirectory: true, isRoot: false, status: 'clean' })).toBe('/repo/src');
    expect(getFileExtension('/repo/app.test.ts')).toBe('.ts');
    expect(getFileExtension('/repo/.env')).toBeNull();
    expect(getFileExtension('/repo/Makefile')).toBeNull();
  });
});
