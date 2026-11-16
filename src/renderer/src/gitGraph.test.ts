import { describe, it, expect } from 'vitest';
import { computeGitGraph } from './gitGraph';

const c = (hash: string, ...parents: string[]) => ({ hash, parents });

describe('computeGitGraph', () => {
  it('keeps a linear history in one lane with continuous lines', () => {
    const graph = computeGitGraph([c('c', 'b'), c('b', 'a'), c('a')]);
    expect(graph.laneCount).toBe(1);
    expect(graph.rows.map(r => r.col)).toEqual([0, 0, 0]);
    // Middle row: line in from above and out to its parent below.
    expect(graph.rows[1].segments).toEqual([
      { x1: 0, y1: 0, x2: 0, y2: 0.5, lane: 0 },
      { x1: 0, y1: 0.5, x2: 0, y2: 1, lane: 0 },
    ]);
    expect(graph.rows[2].segments).toEqual([{ x1: 0, y1: 0, x2: 0, y2: 0.5, lane: 0 }]);
  });

  it('opens a second lane for a merged branch and closes it at the fork point', () => {
    // m merges f (feature) into e (main); both descend from root r.
    const graph = computeGitGraph([c('m', 'e', 'f'), c('e', 'r'), c('f', 'r'), c('r')]);
    expect(graph.laneCount).toBe(2);
    expect(graph.rows.map(r => r.col)).toEqual([0, 0, 1, 0]);
    expect(graph.rows[0].isMerge).toBe(true);
    // The merge draws an edge into the new lane 1.
    expect(graph.rows[0].segments).toContainEqual({ x1: 0, y1: 0.5, x2: 1, y2: 1, lane: 1 });
    // While on lane 0, lane 1 passes through the 'e' row.
    expect(graph.rows[1].segments).toContainEqual({ x1: 1, y1: 0, x2: 1, y2: 0.5, lane: 1 });
    expect(graph.rows[1].segments).toContainEqual({ x1: 1, y1: 0.5, x2: 1, y2: 1, lane: 1 });
    // 'f' joins lane 0 (already waiting for r) diagonally.
    expect(graph.rows[2].segments).toContainEqual({ x1: 1, y1: 0.5, x2: 0, y2: 1, lane: 1 });
    // At the root both lanes converge.
    expect(graph.rows[3].segments).toEqual([{ x1: 0, y1: 0, x2: 0, y2: 0.5, lane: 0 }]);
  });

  it('ends lanes whose parents are not in the list (log limit or path filter)', () => {
    const graph = computeGitGraph([c('b', 'a'), c('a', 'outside')]);
    expect(graph.rows[1].segments).toEqual([{ x1: 0, y1: 0, x2: 0, y2: 0.5, lane: 0 }]);
  });

  it('gives unrelated branch tips their own lane', () => {
    const graph = computeGitGraph([c('x', 'r'), c('y', 'r'), c('r')]);
    expect(graph.rows.map(r => r.col)).toEqual([0, 1, 0]);
  });
});
