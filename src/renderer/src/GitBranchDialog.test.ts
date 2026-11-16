import { describe, it, expect } from 'vitest';
import { resolveSwitchTarget } from './GitBranchDialog';
import type { GitBranch } from '../../shared/git';

describe('resolveSwitchTarget', () => {
  const branches: GitBranch[] = [
    { name: 'main', remote: false, current: true, upstream: 'origin/main' },
    { name: 'origin/main', remote: true, current: false, upstream: null },
    { name: 'origin/feature/x', remote: true, current: false, upstream: null },
  ];

  it('switches local branches directly', () => {
    expect(resolveSwitchTarget(branches[0], branches)).toEqual({ branch: 'main', remote: false });
  });

  it('reuses an existing local branch for a remote pick, otherwise tracks the remote', () => {
    expect(resolveSwitchTarget(branches[1], branches)).toEqual({ branch: 'main', remote: false });
    expect(resolveSwitchTarget(branches[2], branches)).toEqual({ branch: 'origin/feature/x', remote: true });
  });
});
