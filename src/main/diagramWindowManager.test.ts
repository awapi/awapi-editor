import { describe, it, expect } from 'vitest';
import { createDiagramWindowManager } from './diagramWindowManager';
import type { DiagramOpenRequest } from '../shared/diagram';

const request = (overrides: Partial<DiagramOpenRequest> = {}): DiagramOpenRequest => ({
  docKey: '/docs/a.md',
  index: 0,
  title: 'a.md',
  theme: 'dark',
  svg: '<svg id="v1"/>',
  error: null,
  ...overrides,
});

describe('createDiagramWindowManager', () => {
  it('tracks pop-outs per owner, document and diagram index', () => {
    const manager = createDiagramWindowManager();
    manager.add(10, 1, request());
    manager.add(11, 1, request({ index: 2 }));
    manager.add(12, 2, request());

    expect(manager.findWindowId(1, '/docs/a.md', 2)).toBe(11);
    expect(manager.findWindowId(2, '/docs/a.md', 2)).toBeNull();
    expect(manager.getOpenRefs(1)).toEqual([
      { docKey: '/docs/a.md', index: 0 },
      { docKey: '/docs/a.md', index: 2 },
    ]);
    expect(manager.getData(10)).toEqual({ title: 'Diagram 1 — a.md', theme: 'dark', svg: '<svg id="v1"/>', error: null });
    expect(manager.getWindowIdsForOwner(2)).toEqual([12]);

    manager.remove(10);
    expect(manager.getData(10)).toBeNull();
  });

  it('forwards updates and closes pop-outs whose diagram or document is gone', () => {
    const manager = createDiagramWindowManager();
    manager.add(10, 1, request());
    manager.add(11, 1, request({ index: 1 }));
    manager.add(12, 1, request({ index: 2 }));
    manager.add(13, 1, request({ docKey: '/docs/other.md' }));
    manager.add(14, 2, request());

    const result = manager.applySync(1, {
      docKey: '/docs/a.md',
      count: 2,
      theme: 'dark',
      updates: [{ index: 0, svg: null, error: 'Parse error' }],
    });

    expect(result.updates).toEqual([
      { windowId: 10, data: { title: 'Diagram 1 — a.md', theme: 'dark', svg: null, error: 'Parse error' } },
    ]);
    expect(result.close.sort()).toEqual([12, 13]);
    expect(manager.getWindowIdsForOwner(1).sort()).toEqual([10, 11]);
    expect(manager.getData(14)?.svg).toBe('<svg id="v1"/>');
  });

  it('pushes theme changes even when no new SVG is included', () => {
    const manager = createDiagramWindowManager();
    manager.add(10, 1, request());
    const result = manager.applySync(1, { docKey: '/docs/a.md', count: 1, theme: 'light', updates: [] });
    expect(result.updates).toEqual([
      { windowId: 10, data: { title: 'Diagram 1 — a.md', theme: 'light', svg: '<svg id="v1"/>', error: null } },
    ]);
    expect(manager.applySync(1, { docKey: '/docs/a.md', count: 1, theme: 'light', updates: [] }).updates).toEqual([]);
  });

  it('replaces the content of a re-opened pop-out', () => {
    const manager = createDiagramWindowManager();
    manager.add(10, 1, request());
    expect(manager.replace(10, request({ svg: '<svg id="v2"/>', theme: 'light' }))).toMatchObject({
      svg: '<svg id="v2"/>',
      theme: 'light',
    });
    expect(manager.replace(99, request())).toBeNull();
  });
});
