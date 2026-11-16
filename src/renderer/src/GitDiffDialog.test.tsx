import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { defaultDark } from './theme/ThemeContext';

const diffProps: Array<Record<string, any>> = [];
vi.mock('@monaco-editor/react', () => ({
  DiffEditor: (props: Record<string, any>) => {
    diffProps.push(props);
    return <div data-testid="mock-diff-editor" />;
  },
}));

import { GitDiffDialog, GIT_DIFF_VIEW_MODE_KEY } from './GitDiffDialog';

const target = { path: '/repo/a.ts', isDirectory: false, isRoot: false, status: 'modified' as const };

describe('GitDiffDialog', () => {
  beforeEach(() => {
    diffProps.length = 0;
    window.localStorage.clear();
    (window as any).electronAPI = {
      getGitDiff: vi.fn(async () => ({ ok: true, original: 'a\n', modified: 'b\n', binary: false })),
    };
  });

  const renderDialog = () =>
    render(<GitDiffDialog target={target} colors={defaultDark} isLightTheme={false} onClose={vi.fn()} />);

  it('defaults to side by side without Monaco falling back to inline', async () => {
    renderDialog();
    await screen.findByTestId('mock-diff-editor');
    const options = diffProps.at(-1)!.options;
    expect(options.renderSideBySide).toBe(true);
    expect(options.useInlineViewWhenSpaceIsLimited).toBe(false);
    expect(options.readOnly).toBe(true);
    expect(diffProps.at(-1)!.original).toBe('a\n');
  });

  it('switches to inline and remembers the choice for the next diff', async () => {
    const { unmount } = renderDialog();
    await screen.findByTestId('mock-diff-editor');
    fireEvent.click(screen.getByTestId('git-diff-inline'));
    expect(diffProps.at(-1)!.options.renderSideBySide).toBe(false);
    expect(screen.getByTestId('git-diff-inline').getAttribute('aria-pressed')).toBe('true');
    expect(window.localStorage.getItem(GIT_DIFF_VIEW_MODE_KEY)).toBe('inline');
    unmount();

    renderDialog();
    await screen.findByTestId('mock-diff-editor');
    expect(diffProps.at(-1)!.options.renderSideBySide).toBe(false);
    fireEvent.click(screen.getByTestId('git-diff-side-by-side'));
    expect(diffProps.at(-1)!.options.renderSideBySide).toBe(true);
  });
});
