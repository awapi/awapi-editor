import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FileIcon, FolderIcon } from './FileIcon';

describe('FileIcon & FolderIcon components', () => {
  it('renders offline SVG file icons with matching data-icon-kind attributes', () => {
    const { rerender } = render(<FileIcon filename="sample.cs" />);
    expect(screen.getByTestId('file-icon').getAttribute('data-icon-kind')).toBe('csharp');

    rerender(<FileIcon filename="sample.py" />);
    expect(screen.getByTestId('file-icon').getAttribute('data-icon-kind')).toBe('python');

    rerender(<FileIcon filename="package.json" />);
    expect(screen.getByTestId('file-icon').getAttribute('data-icon-kind')).toBe('npm');

    rerender(<FileIcon filename="pnpm-lock.yaml" />);
    expect(screen.getByTestId('file-icon').getAttribute('data-icon-kind')).toBe('pnpm');

    rerender(<FileIcon filename="vite.config.ts" />);
    expect(screen.getByTestId('file-icon').getAttribute('data-icon-kind')).toBe('vite');
  });

  it('renders offline SVG folder icons with closed and open states', () => {
    const { rerender } = render(<FolderIcon name="src" isOpen={false} />);
    const icon = screen.getByTestId('folder-icon');
    expect(icon.getAttribute('data-folder-kind')).toBe('src');
    expect(icon.getAttribute('data-folder-open')).toBe('false');

    rerender(<FolderIcon name="samples" isOpen={true} />);
    expect(screen.getByTestId('folder-icon').getAttribute('data-folder-kind')).toBe('samples');
    expect(screen.getByTestId('folder-icon').getAttribute('data-folder-open')).toBe('true');
  });
});
