import { describe, it, expect } from 'vitest';
import {
  isCsvTab,
  detectCsvSeparator,
  parseCsv,
  serializeCsv,
  getColumnLetter,
  sortCsvGridByColumn,
  compareCsvValues,
} from './csv';

describe('isCsvTab', () => {
  it('returns true for .csv and .tsv filenames (case-insensitive)', () => {
    expect(isCsvTab('data.csv')).toBe(true);
    expect(isCsvTab('REPORT.CSV')).toBe(true);
    expect(isCsvTab('/path/to/items.tsv')).toBe(true);
    expect(isCsvTab('C:\\folder\\table.TSV')).toBe(true);
  });

  it('returns true when languageId is explicitly csv', () => {
    expect(isCsvTab('Untitled', 'csv')).toBe(true);
    expect(isCsvTab('notes.txt', 'csv')).toBe(true);
  });

  it('returns false for non-csv files without csv language override', () => {
    expect(isCsvTab('script.ts', 'typescript')).toBe(false);
    expect(isCsvTab(null)).toBe(false);
    expect(isCsvTab(undefined)).toBe(false);
    expect(isCsvTab('Untitled')).toBe(false);
  });
});

describe('detectCsvSeparator', () => {
  it('defaults to comma for empty content and tab for .tsv files', () => {
    expect(detectCsvSeparator('')).toBe(',');
    expect(detectCsvSeparator('   ')).toBe(',');
    expect(detectCsvSeparator('', 'table.tsv')).toBe('\t');
  });

  it('detects comma-separated content', () => {
    expect(detectCsvSeparator('name,age,city\nAlice,30,NYC\nBob,25,LA')).toBe(',');
  });

  it('detects semicolon-separated content even when commas appear inside quotes or numbers', () => {
    expect(detectCsvSeparator('name;price;city\n"Smith, John";12,50;Paris\nJane;9,99;Berlin')).toBe(';');
  });

  it('detects tab-separated content', () => {
    expect(detectCsvSeparator('id\tname\trole\n1\tAlice\tAdmin\n2\tBob\tUser')).toBe('\t');
  });

  it('detects pipe-separated content', () => {
    expect(detectCsvSeparator('id|name|status\n1|Alice|active\n2|Bob|pending')).toBe('|');
  });
});

describe('parseCsv and serializeCsv', () => {
  it('returns a 1x1 empty grid for empty input and serializes back to empty string', () => {
    const grid = parseCsv('');
    expect(grid).toEqual([['']]);
    expect(serializeCsv(grid)).toBe('');
  });

  it('parses simple rows and normalizes ragged row lengths', () => {
    const grid = parseCsv('a,b,c\n1,2\n3,4,5,6');
    expect(grid).toEqual([
      ['a', 'b', 'c', ''],
      ['1', '2', '', ''],
      ['3', '4', '5', '6'],
    ]);
  });

  it('handles quoted fields with embedded separators, quotes, and newlines', () => {
    const raw = 'name,note\n"Alice ""The Ace""","Line 1\nLine 2, with comma"\nBob,Plain';
    const grid = parseCsv(raw, ',');
    expect(grid).toEqual([
      ['name', 'note'],
      ['Alice "The Ace"', 'Line 1\nLine 2, with comma'],
      ['Bob', 'Plain'],
    ]);
    expect(serializeCsv(grid, ',')).toBe(raw);
  });

  it('handles CRLF line endings and trailing newline without adding an extra blank row', () => {
    const raw = 'col1;col2\r\nval1;val2\r\n';
    const grid = parseCsv(raw, ';');
    expect(grid).toEqual([
      ['col1', 'col2'],
      ['val1', 'val2'],
    ]);
    expect(serializeCsv(grid, ';', '\r\n')).toBe('col1;col2\r\nval1;val2');
  });
});

describe('getColumnLetter', () => {
  it('converts 0-based column indices to spreadsheet letters', () => {
    expect(getColumnLetter(0)).toBe('A');
    expect(getColumnLetter(1)).toBe('B');
    expect(getColumnLetter(25)).toBe('Z');
    expect(getColumnLetter(26)).toBe('AA');
    expect(getColumnLetter(27)).toBe('AB');
  });
});

describe('compareCsvValues and sortCsvGridByColumn', () => {
  it('sorts numbers numerically and strings naturally, keeping empty cells at the bottom', () => {
    expect(compareCsvValues('2', '10', 'asc')).toBeLessThan(0);
    expect(compareCsvValues('10', '2', 'desc')).toBeLessThan(0);
    expect(compareCsvValues('', 'a', 'asc')).toBeGreaterThan(0);
    expect(compareCsvValues('', 'a', 'desc')).toBeGreaterThan(0);
  });

  it('preserves header row when hasHeader is true', () => {
    const rows = [
      ['Name', 'Score'],
      ['Charlie', '10'],
      ['Alice', '100'],
      ['Bob', '25'],
    ];

    const asc = sortCsvGridByColumn(rows, 1, 'asc', true);
    expect(asc).toEqual([
      ['Name', 'Score'],
      ['Charlie', '10'],
      ['Bob', '25'],
      ['Alice', '100'],
    ]);

    const desc = sortCsvGridByColumn(rows, 1, 'desc', true);
    expect(desc).toEqual([
      ['Name', 'Score'],
      ['Alice', '100'],
      ['Bob', '25'],
      ['Charlie', '10'],
    ]);
  });

  it('sorts all rows including row 0 when hasHeader is false', () => {
    const rows = [
      ['Charlie', '3'],
      ['Alice', '1'],
      ['Bob', '2'],
    ];
    expect(sortCsvGridByColumn(rows, 0, 'asc', false)).toEqual([
      ['Alice', '1'],
      ['Bob', '2'],
      ['Charlie', '3'],
    ]);
  });
});
