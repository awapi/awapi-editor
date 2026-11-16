import { describe, it, expect } from 'vitest';
import {
  getGitDialogBounds,
  getGitDialogTitle,
  normalizeGitDialogRequest,
  normalizeGitDialogResult,
} from './gitDialog';

const colors = {
  background: '#1e1e1e',
  foreground: '#d4d4d4',
  tabBackground: '#252526',
  tabActiveBackground: '#1e1e1e',
  tabBorder: '#007acc',
  tabHover: '#2d2d2d',
};
const target = { path: '/repo/a.ts', isDirectory: false, isRoot: false, status: 'modified' };

describe('normalizeGitDialogRequest', () => {
  it('accepts a valid request and drops unknown fields', () => {
    expect(
      normalizeGitDialogRequest({ kind: 'diff', target: { ...target, extra: 1 }, colors, isLightTheme: true, activeRowBg: '#fff', evil: 'x' }),
    ).toEqual({ kind: 'diff', target, colors, isLightTheme: true, activeRowBg: '#fff' });
    expect(normalizeGitDialogRequest({ kind: 'diff', target: { ...target, cwd: '/repo' }, colors })?.target.cwd).toBe('/repo');
  });

  it('rejects unknown kinds, missing paths, and incomplete colors', () => {
    expect(normalizeGitDialogRequest({ kind: 'rm -rf', target, colors })).toBeNull();
    expect(normalizeGitDialogRequest({ kind: 'log', target: { ...target, path: '' }, colors })).toBeNull();
    expect(normalizeGitDialogRequest({ kind: 'log', target, colors: { background: '#000' } })).toBeNull();
    expect(normalizeGitDialogRequest(null)).toBeNull();
  });

  it('validates results', () => {
    expect(normalizeGitDialogResult({ summary: 'Committed.', output: 'ok' })).toEqual({ summary: 'Committed.', output: 'ok' });
    expect(normalizeGitDialogResult({ summary: 'Done.' })).toEqual({ summary: 'Done.', output: '' });
    expect(normalizeGitDialogResult({ output: 'x' })).toBeNull();
  });
});

describe('getGitDialogTitle / getGitDialogBounds', () => {
  it('includes the path for Diff and Log titles', () => {
    expect(getGitDialogTitle({ kind: 'diff', target: target as never })).toBe('Diff: /repo/a.ts');
    expect(getGitDialogTitle({ kind: 'commit', target: target as never })).toBe('Commit');
    expect(getGitDialogTitle({ kind: 'diff', target: { ...target, revision: 'abcdef1234567' } as never })).toBe(
      'Diff: /repo/a.ts @ abcdef1',
    );
  });

  it('centers fixed-size dialogs over the parent window', () => {
    expect(getGitDialogBounds('commit', { x: 100, y: 50, width: 1280, height: 800 })).toEqual({
      x: 100 + (1280 - 680) / 2,
      y: 50 + (800 - 600) / 2,
      width: 680,
      height: 600,
    });
  });

  it('sizes Diff/Log relative to the parent with a minimum, never above its top edge', () => {
    expect(getGitDialogBounds('diff', { x: 0, y: 0, width: 2000, height: 1200 })).toMatchObject({ width: 1800, height: 1020 });
    const small = getGitDialogBounds('log', { x: 10, y: 20, width: 600, height: 400 });
    expect(small).toMatchObject({ width: 900, height: 600, y: 20 });
  });
});
