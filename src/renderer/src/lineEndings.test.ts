import { describe, it, expect } from 'vitest';
import { detectEol, normalizeToLF, applyEol } from './lineEndings';

describe('detectEol', () => {
  it('returns CRLF when any \\r\\n is present', () => {
    expect(detectEol('foo\r\nbar')).toBe('CRLF');
    expect(detectEol('mixed\nline\r\nhere')).toBe('CRLF');
  });

  it('returns LF for plain \\n content', () => {
    expect(detectEol('foo\nbar\n')).toBe('LF');
  });

  it('returns LF for content with no line terminators', () => {
    expect(detectEol('')).toBe('LF');
    expect(detectEol('single line')).toBe('LF');
  });

  it('returns LF for lone \\r (rare legacy), since we do not detect CR-only', () => {
    expect(detectEol('foo\rbar')).toBe('LF');
  });
});

describe('normalizeToLF', () => {
  it('converts CRLF to LF', () => {
    expect(normalizeToLF('a\r\nb\r\nc')).toBe('a\nb\nc');
  });

  it('converts lone CR to LF', () => {
    expect(normalizeToLF('a\rb')).toBe('a\nb');
  });

  it('leaves LF untouched', () => {
    expect(normalizeToLF('a\nb')).toBe('a\nb');
  });
});

describe('applyEol', () => {
  it('returns LF-normalized content when eol is LF', () => {
    expect(applyEol('a\r\nb\nc', 'LF')).toBe('a\nb\nc');
  });

  it('converts to CRLF when eol is CRLF, normalizing mixed input first', () => {
    expect(applyEol('a\nb\r\nc', 'CRLF')).toBe('a\r\nb\r\nc');
  });

  it('handles empty content', () => {
    expect(applyEol('', 'LF')).toBe('');
    expect(applyEol('', 'CRLF')).toBe('');
  });
});
