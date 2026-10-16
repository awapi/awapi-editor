import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import ImageViewer, { stepZoomLevel } from './ImageViewer';
import { defaultDark } from './theme/ThemeContext';

const defaultColors = defaultDark;

describe('ImageViewer', () => {
  describe('stepZoomLevel', () => {
    it('steps up and down through predefined zoom percentages and clamps at bounds', () => {
      expect(stepZoomLevel(100, 'in')).toBe(125);
      expect(stepZoomLevel(100, 'out')).toBe(75);
      expect(stepZoomLevel(800, 'in')).toBe(800);
      expect(stepZoomLevel(10, 'out')).toBe(10);
    });
  });

  it('renders a raster image using awapi-asset:// URL with format badge and file size', () => {
    render(
      <ImageViewer
        filePath="/Users/test/photo.png"
        title="photo.png"
        byteSize={2048}
        colors={defaultColors}
        themeMode="dark"
      />,
    );

    expect(screen.getByTestId('image-format-badge').textContent).toBe('PNG');
    expect(screen.getByTestId('image-file-size').textContent).toBe('2.0 KB');
    expect(screen.getByTestId('image-zoom-level').textContent).toBe('Fit');

    const img = screen.getByTestId('image-viewer-img') as HTMLImageElement;
    expect(img.getAttribute('src')).toBe('awapi-asset://local/Users/test/photo.png');
    expect(screen.queryByTestId('svg-switch-to-code-button')).toBeNull();
  });

  it('renders an SVG tab using data URL from svgContent and exposes Code View button', () => {
    const onSwitchToCodeView = vi.fn();
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="80"><rect width="120" height="80"/></svg>';

    render(
      <ImageViewer
        filePath="/Users/test/logo.svg"
        title="logo.svg"
        svgContent={svg}
        onSwitchToCodeView={onSwitchToCodeView}
        colors={defaultColors}
        themeMode="dark"
      />,
    );

    expect(screen.getByTestId('image-format-badge').textContent).toBe('SVG');
    const img = screen.getByTestId('image-viewer-img') as HTMLImageElement;
    expect(img.getAttribute('src')?.startsWith('data:image/svg+xml;utf8,')).toBe(true);

    const codeBtn = screen.getByTestId('svg-switch-to-code-button');
    fireEvent.click(codeBtn);
    expect(onSwitchToCodeView).toHaveBeenCalledTimes(1);
  });

  it('zooms in, zooms out, sets 1:1 actual size, and returns to Fit mode via toolbar buttons', () => {
    const onMetadataChange = vi.fn();
    render(
      <ImageViewer
        filePath="/Users/test/photo.jpg"
        title="photo.jpg"
        onMetadataChange={onMetadataChange}
        colors={defaultColors}
        themeMode="dark"
      />,
    );

    const img = screen.getByTestId('image-viewer-img') as HTMLImageElement;
    Object.defineProperty(img, 'naturalWidth', { value: 400, configurable: true });
    Object.defineProperty(img, 'naturalHeight', { value: 300, configurable: true });
    fireEvent.load(img);

    expect(screen.getByTestId('image-dimensions').textContent).toBe('400 × 300 px');

    // Zoom in from 100% -> 125%
    fireEvent.click(screen.getByTestId('image-zoom-in'));
    expect(screen.getByTestId('image-zoom-level').textContent).toBe('125%');
    expect(img.style.width).toBe('500px');
    expect(img.style.height).toBe('375px');

    // Zoom out -> 100% -> 75%
    fireEvent.click(screen.getByTestId('image-zoom-out'));
    fireEvent.click(screen.getByTestId('image-zoom-out'));
    expect(screen.getByTestId('image-zoom-level').textContent).toBe('75%');
    expect(img.style.width).toBe('300px');
    expect(img.style.height).toBe('225px');

    // 1:1 button -> 100%
    fireEvent.click(screen.getByTestId('image-zoom-actual'));
    expect(screen.getByTestId('image-zoom-level').textContent).toBe('100%');

    // Fit button -> Fit mode
    fireEvent.click(screen.getByTestId('image-zoom-fit'));
    expect(screen.getByTestId('image-zoom-level').textContent).toBe('Fit');
  });

  it('supports keyboard shortcuts (+, -, 0, f), Ctrl+wheel zoom, double-click toggle, and backdrop cycling', () => {
    render(
      <ImageViewer
        filePath="/Users/test/icon.png"
        title="icon.png"
        colors={defaultColors}
        themeMode="light"
      />,
    );

    const viewer = screen.getByTestId('image-viewer');
    const canvas = screen.getByTestId('image-viewer-canvas');
    const img = screen.getByTestId('image-viewer-img');

    fireEvent.keyDown(viewer, { key: '+' });
    expect(screen.getByTestId('image-zoom-level').textContent).toBe('125%');

    fireEvent.keyDown(viewer, { key: '-' });
    expect(screen.getByTestId('image-zoom-level').textContent).toBe('100%');

    fireEvent.keyDown(viewer, { key: 'f' });
    expect(screen.getByTestId('image-zoom-level').textContent).toBe('Fit');

    // Double-click image toggles Fit -> 100% -> Fit
    fireEvent.doubleClick(img);
    expect(screen.getByTestId('image-zoom-level').textContent).toBe('100%');
    fireEvent.doubleClick(img);
    expect(screen.getByTestId('image-zoom-level').textContent).toBe('Fit');

    // Ctrl + wheel zooms
    fireEvent.wheel(canvas, { deltaY: -100, ctrlKey: true });
    expect(screen.getByTestId('image-zoom-level').textContent).toBe('125%');
    fireEvent.wheel(canvas, { deltaY: 100, ctrlKey: true });
    expect(screen.getByTestId('image-zoom-level').textContent).toBe('100%');

    // Cycle backdrop
    const bgBtn = screen.getByTestId('image-backdrop-toggle');
    expect(bgBtn.textContent).toBe('Grid BG');
    fireEvent.click(bgBtn);
    expect(bgBtn.textContent).toBe('Light BG');
    fireEvent.click(bgBtn);
    expect(bgBtn.textContent).toBe('Dark BG');
    fireEvent.click(bgBtn);
    expect(bgBtn.textContent).toBe('Grid BG');
  });

  it('shows a helpful error state when the image fails to decode', () => {
    const onSwitchToCodeView = vi.fn();
    render(
      <ImageViewer
        filePath="/Users/test/broken.svg"
        title="broken.svg"
        svgContent="<svg>broken"
        onSwitchToCodeView={onSwitchToCodeView}
        colors={defaultColors}
        themeMode="dark"
      />,
    );

    fireEvent.error(screen.getByTestId('image-viewer-img'));
    expect(screen.getByTestId('image-viewer-error')).toBeTruthy();

    fireEvent.click(screen.getByTestId('image-error-code-view-button'));
    expect(onSwitchToCodeView).toHaveBeenCalledTimes(1);
  });
});
