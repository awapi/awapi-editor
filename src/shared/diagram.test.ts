import { describe, it, expect } from 'vitest';
import {
  MAX_DIAGRAM_ERROR_LENGTH,
  MAX_DIAGRAM_SVG_LENGTH,
  formatDiagramWindowTitle,
  normalizeDiagramOpenRequest,
  normalizeDiagramSyncRequest,
} from './diagram';

describe('normalizeDiagramOpenRequest', () => {
  const base = { docKey: '/docs/a.md', index: 1, title: 'a.md', theme: 'light', svg: '<svg viewBox="0 0 1 1"/>' };

  it('accepts a well-formed request', () => {
    expect(normalizeDiagramOpenRequest(base)).toEqual({
      docKey: '/docs/a.md',
      index: 1,
      title: 'a.md',
      theme: 'light',
      svg: '<svg viewBox="0 0 1 1"/>',
      error: null,
    });
  });

  it('rejects content that is not SVG markup or exceeds the size limit', () => {
    expect(normalizeDiagramOpenRequest({ ...base, svg: '<img src=x onerror=alert(1)>' })).toBeNull();
    expect(normalizeDiagramOpenRequest({ ...base, svg: '<svg>' + 'a'.repeat(MAX_DIAGRAM_SVG_LENGTH) })).toBeNull();
  });

  it('rejects invalid identifiers and falls back for title and theme', () => {
    expect(normalizeDiagramOpenRequest({ ...base, index: -1 })).toBeNull();
    expect(normalizeDiagramOpenRequest({ ...base, index: 1.5 })).toBeNull();
    expect(normalizeDiagramOpenRequest({ ...base, docKey: '' })).toBeNull();
    expect(normalizeDiagramOpenRequest(null)).toBeNull();
    expect(normalizeDiagramOpenRequest({ ...base, title: '  ', theme: 'neon' })).toMatchObject({
      title: 'Diagram',
      theme: 'dark',
    });
  });

  it('keeps a truncated error only when there is no SVG', () => {
    const long = 'e'.repeat(MAX_DIAGRAM_ERROR_LENGTH + 50);
    expect(normalizeDiagramOpenRequest({ ...base, svg: undefined, error: long })?.error).toHaveLength(
      MAX_DIAGRAM_ERROR_LENGTH,
    );
    expect(normalizeDiagramOpenRequest({ ...base, error: 'ignored' })?.error).toBeNull();
  });
});

describe('normalizeDiagramSyncRequest', () => {
  it('drops malformed updates and updates beyond the diagram count', () => {
    expect(
      normalizeDiagramSyncRequest({
        docKey: 'k',
        count: 2,
        theme: 'dark',
        updates: [
          { index: 0, svg: '<svg/>' },
          { index: 1, error: 'Parse error' },
          { index: 2, svg: '<svg/>' },
          { index: 0, svg: 'not svg' },
          'junk',
        ],
      }),
    ).toEqual({
      docKey: 'k',
      count: 2,
      theme: 'dark',
      updates: [
        { index: 0, svg: '<svg/>', error: null },
        { index: 1, svg: null, error: 'Parse error' },
      ],
    });
  });

  it('treats a missing count as zero and requires a document key', () => {
    expect(normalizeDiagramSyncRequest({ docKey: 'k' })).toEqual({ docKey: 'k', count: 0, theme: 'dark', updates: [] });
    expect(normalizeDiagramSyncRequest({ count: 1 })).toBeNull();
  });
});

describe('formatDiagramWindowTitle', () => {
  it('uses a 1-based diagram number', () => {
    expect(formatDiagramWindowTitle('README.md', 0)).toBe('Diagram 1 — README.md');
  });
});
