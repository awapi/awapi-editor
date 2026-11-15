import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react';
import DiagramWindow from './DiagramWindow';
import type { DiagramWindowData } from '../../shared/diagram';

describe('DiagramWindow', () => {
  let pushUpdate: ((data: DiagramWindowData) => void) | undefined;
  let api: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    pushUpdate = undefined;
    api = {
      getDiagramPopoutData: vi.fn().mockResolvedValue({
        title: 'Diagram 1 — README.md',
        theme: 'dark',
        svg: '<svg id="v1"/>',
        error: null,
      }),
      onDiagramPopoutUpdate: vi.fn((cb: (data: DiagramWindowData) => void) => {
        pushUpdate = cb;
        return () => {};
      }),
    };
    (window as any).electronAPI = api;
  });

  const imageSrc = () => screen.getByTestId('diagram-image').getAttribute('src');

  it('shows the received SVG as an image and applies live updates', async () => {
    render(<DiagramWindow />);
    await waitFor(() => expect(screen.getByTestId('diagram-title').textContent).toBe('Diagram 1 — README.md'));
    expect(document.title).toBe('Diagram 1 — README.md');
    expect(imageSrc()).toBe(`data:image/svg+xml;charset=utf-8,${encodeURIComponent('<svg id="v1"/>')}`);

    act(() => pushUpdate!({ title: 'Diagram 1 — README.md', theme: 'light', svg: '<svg id="v2"/>', error: null }));
    expect(imageSrc()).toContain(encodeURIComponent('id="v2"'));
  });

  it('keeps the last valid diagram on screen when an update has errors', async () => {
    render(<DiagramWindow />);
    await waitFor(() => expect(screen.getByTestId('diagram-image')).toBeDefined());

    act(() => pushUpdate!({ title: 'Diagram 1 — README.md', theme: 'dark', svg: null, error: 'Parse error on line 2' }));
    expect(screen.getByTestId('diagram-error').textContent).toContain('showing the last valid version');
    expect(screen.getByTestId('diagram-error').textContent).toContain('Mermaid error: Parse error on line 2');
    expect(imageSrc()).toContain(encodeURIComponent('id="v1"'));
  });

  it('toggles full screen with the toolbar button', async () => {
    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    document.documentElement.requestFullscreen = requestFullscreen;
    render(<DiagramWindow />);
    await waitFor(() => expect(screen.getByTestId('diagram-image')).toBeDefined());

    fireEvent.click(screen.getByTestId('diagram-fullscreen'));
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
  });
});
