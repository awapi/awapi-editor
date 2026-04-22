import { describe, it, expect } from 'vitest';
import {
  inferLanguageFromFilename,
  getLanguageLabel,
  SUPPORTED_LANGUAGES,
  DEFAULT_LANGUAGE_ID,
} from './languages';

describe('inferLanguageFromFilename', () => {
  it('returns plaintext for null / undefined / empty names', () => {
    expect(inferLanguageFromFilename(null)).toBe(DEFAULT_LANGUAGE_ID);
    expect(inferLanguageFromFilename(undefined)).toBe(DEFAULT_LANGUAGE_ID);
    expect(inferLanguageFromFilename('')).toBe(DEFAULT_LANGUAGE_ID);
  });

  it('returns plaintext when there is no extension', () => {
    expect(inferLanguageFromFilename('Untitled')).toBe('plaintext');
    expect(inferLanguageFromFilename('README')).toBe('plaintext');
  });

  it('maps common extensions to Monaco ids', () => {
    expect(inferLanguageFromFilename('data.json')).toBe('json');
    expect(inferLanguageFromFilename('index.TS')).toBe('typescript');
    expect(inferLanguageFromFilename('script.js')).toBe('javascript');
    expect(inferLanguageFromFilename('notes.md')).toBe('markdown');
    expect(inferLanguageFromFilename('page.html')).toBe('html');
    expect(inferLanguageFromFilename('app.py')).toBe('python');
  });

  it('recognizes a Dockerfile by exact name (no extension)', () => {
    expect(inferLanguageFromFilename('Dockerfile')).toBe('dockerfile');
    expect(inferLanguageFromFilename('/repo/Dockerfile')).toBe('dockerfile');
  });

  it('works with full paths on both separators', () => {
    expect(inferLanguageFromFilename('/a/b/c/file.go')).toBe('go');
    expect(inferLanguageFromFilename('C:\\a\\b\\file.cs')).toBe('csharp');
  });

  it('falls back to plaintext for unknown extensions', () => {
    expect(inferLanguageFromFilename('mystery.xyz')).toBe('plaintext');
  });

  it('treats a trailing dot as no extension', () => {
    expect(inferLanguageFromFilename('weird.')).toBe('plaintext');
  });
});

describe('getLanguageLabel', () => {
  it('returns the label for a known id', () => {
    expect(getLanguageLabel('plaintext')).toBe('Plain Text');
    expect(getLanguageLabel('json')).toBe('JSON');
  });

  it('falls back to the id for unknown languages', () => {
    expect(getLanguageLabel('not-a-language')).toBe('not-a-language');
  });
});

describe('SUPPORTED_LANGUAGES', () => {
  it('includes Plain Text as the default', () => {
    expect(SUPPORTED_LANGUAGES.some(l => l.id === DEFAULT_LANGUAGE_ID)).toBe(true);
  });

  it('contains only unique ids', () => {
    const ids = SUPPORTED_LANGUAGES.map(l => l.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
