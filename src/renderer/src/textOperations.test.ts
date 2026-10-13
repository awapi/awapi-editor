import { describe, it, expect } from 'vitest';
import {
  sortLinesAscending,
  sortLinesDescending,
  removeDuplicateLines,
  removeEmptyLines,
  trimTrailingWhitespace,
  toUpperCaseText,
  toLowerCaseText,
  positionToOffset,
  applyTextOperation,
} from './textOperations';

describe('textOperations', () => {
  describe('sortLinesAscending / sortLinesDescending', () => {
    it('sorts lines in ascending order', () => {
      expect(sortLinesAscending('banana\napple\ncherry')).toBe('apple\nbanana\ncherry');
    });

    it('sorts lines in descending order', () => {
      expect(sortLinesDescending('banana\napple\ncherry')).toBe('cherry\nbanana\napple');
    });

    it('returns empty string unchanged', () => {
      expect(sortLinesAscending('')).toBe('');
      expect(sortLinesDescending('')).toBe('');
    });

    it('keeps the trailing newline at the end of the document (CR-06)', () => {
      expect(sortLinesAscending('b\na\n')).toBe('a\nb\n');
      expect(sortLinesDescending('a\nb\n')).toBe('b\na\n');
      expect(sortLinesAscending('\n')).toBe('\n');
    });

    it('still sorts interior empty lines', () => {
      expect(sortLinesAscending('b\n\na\n')).toBe('\na\nb\n');
    });
  });

  describe('removeDuplicateLines', () => {
    it('removes duplicate lines preserving first occurrence order', () => {
      expect(removeDuplicateLines('a\nb\na\nc\nb\nd')).toBe('a\nb\nc\nd');
    });

    it('handles single line and empty text', () => {
      expect(removeDuplicateLines('only')).toBe('only');
      expect(removeDuplicateLines('')).toBe('');
    });

    it('preserves the final newline of the document (CR-06)', () => {
      expect(removeDuplicateLines('a\n\nb\n\na\n')).toBe('a\n\nb\n');
    });
  });

  describe('removeEmptyLines', () => {
    it('removes empty and whitespace-only lines', () => {
      expect(removeEmptyLines('first\n\n   \nsecond\n\t\nthird')).toBe('first\nsecond\nthird');
    });

    it('returns empty string when all lines are blank', () => {
      expect(removeEmptyLines('   \n\t\n')).toBe('');
    });

    it('preserves the final newline of the document (CR-06)', () => {
      expect(removeEmptyLines('a\n\nb\n')).toBe('a\nb\n');
      expect(removeEmptyLines('a\n\n\n')).toBe('a\n');
    });
  });

  describe('trimTrailingWhitespace', () => {
    it('strips spaces and tabs at the end of each line while preserving leading indentation', () => {
      const input = '  hello   \n\tworld\t\t\nkeep';
      expect(trimTrailingWhitespace(input)).toBe('  hello\n\tworld\nkeep');
    });
  });

  describe('toUpperCaseText / toLowerCaseText', () => {
    it('converts text case', () => {
      expect(toUpperCaseText('Hello World')).toBe('HELLO WORLD');
      expect(toLowerCaseText('Hello World')).toBe('hello world');
    });
  });

  describe('positionToOffset', () => {
    it('computes 0-based character offset from 1-based line and column', () => {
      const text = 'abc\ndefg\nhi';
      expect(positionToOffset(text, 1, 1)).toBe(0);
      expect(positionToOffset(text, 1, 3)).toBe(2);
      expect(positionToOffset(text, 2, 1)).toBe(4);
      expect(positionToOffset(text, 2, 5)).toBe(8);
      expect(positionToOffset(text, 3, 2)).toBe(10);
    });
  });

  describe('applyTextOperation', () => {
    it('transforms only the selected text for uppercase and lowercase', () => {
      const content = 'hello world\nfoo bar';
      const selection = { startLineNumber: 1, startColumn: 7, endLineNumber: 1, endColumn: 12 };
      expect(applyTextOperation(content, 'uppercase', selection)).toBe('hello WORLD\nfoo bar');

      const upperContent = 'HELLO WORLD\nFOO BAR';
      expect(applyTextOperation(upperContent, 'lowercase', selection)).toBe('HELLO world\nFOO BAR');
    });

    it('transforms the entire document for uppercase/lowercase when selection is empty', () => {
      const content = 'Hello World';
      const emptySelection = { startLineNumber: 1, startColumn: 3, endLineNumber: 1, endColumn: 3 };
      expect(applyTextOperation(content, 'uppercase', emptySelection)).toBe('HELLO WORLD');
      expect(applyTextOperation(content, 'lowercase', null)).toBe('hello world');
    });

    it('applies line operations to only selected lines when multi-line selection is active', () => {
      const content = 'header\nc\na\nb\nfooter';
      const selection = { startLineNumber: 2, startColumn: 1, endLineNumber: 4, endColumn: 2 };
      expect(applyTextOperation(content, 'sortLinesAsc', selection)).toBe('header\na\nb\nc\nfooter');
    });

    it('applies line operations to the entire document when no multi-line selection is active', () => {
      const content = 'c\na\nb';
      expect(applyTextOperation(content, 'sortLinesAsc')).toBe('a\nb\nc');
      expect(applyTextOperation(content, 'sortLinesDesc')).toBe('c\nb\na');
      expect(applyTextOperation('a\na\nb', 'removeDuplicateLines')).toBe('a\nb');
      expect(applyTextOperation('a\n\nb', 'removeEmptyLines')).toBe('a\nb');
      expect(applyTextOperation('a  \nb\t', 'trimTrailingWhitespace')).toBe('a\nb');
    });

    it('keeps the document trailing newline for whole-document line operations (CR-06)', () => {
      expect(applyTextOperation('c\na\nb\n', 'sortLinesAsc')).toBe('a\nb\nc\n');
      expect(applyTextOperation('a\nb\nc\n', 'sortLinesDesc')).toBe('c\nb\na\n');
      expect(applyTextOperation('a\n\nb\n', 'removeEmptyLines')).toBe('a\nb\n');
    });
  });
});
