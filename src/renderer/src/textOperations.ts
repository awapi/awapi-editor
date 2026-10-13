/**
 * Line & text manipulation operations for the Edit menu.
 *
 * All functions assume LF-normalized (`\n`) content, matching Monaco's
 * in-memory document representation.
 */

export type TextOperationKind =
  | 'sortLinesAsc'
  | 'sortLinesDesc'
  | 'removeDuplicateLines'
  | 'removeEmptyLines'
  | 'trimTrailingWhitespace'
  | 'uppercase'
  | 'lowercase';

export interface TextSelectionRange {
  startLineNumber: number;
  startColumn: number;
  endLineNumber: number;
  endColumn: number;
}

/**
 * Runs `transform` over the lines of `text`, leaving a single trailing newline
 * out of the operation and re-appending it afterwards so it stays at the end
 * of the document. If the transform removes every line, the trailing newline
 * is dropped as well.
 */
function mapLines(text: string, transform: (lines: string[]) => string[]): string {
  const hasTrailingNewline = text.endsWith('\n');
  const body = hasTrailingNewline ? text.slice(0, -1) : text;
  const result = transform(body.split('\n'));
  const joined = result.join('\n');
  if (!hasTrailingNewline) return joined;
  return result.length === 0 ? '' : `${joined}\n`;
}

/**
 * Sorts lines in ascending order using locale-aware comparison.
 */
export function sortLinesAscending(text: string): string {
  if (!text) return text;
  return mapLines(text, lines => [...lines].sort((a, b) => a.localeCompare(b)));
}

/**
 * Sorts lines in descending order using locale-aware comparison.
 */
export function sortLinesDescending(text: string): string {
  if (!text) return text;
  return mapLines(text, lines => [...lines].sort((a, b) => b.localeCompare(a)));
}

/**
 * Removes duplicate lines while preserving the order of first appearance.
 */
export function removeDuplicateLines(text: string): string {
  if (!text) return text;
  return mapLines(text, lines => {
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const line of lines) {
      if (!seen.has(line)) {
        seen.add(line);
        unique.push(line);
      }
    }
    return unique;
  });
}

/**
 * Removes empty or whitespace-only lines.
 */
export function removeEmptyLines(text: string): string {
  if (!text) return text;
  return mapLines(text, lines => lines.filter(line => line.trim().length > 0));
}

/**
 * Trims trailing spaces and tabs from every line.
 */
export function trimTrailingWhitespace(text: string): string {
  if (!text) return text;
  return text
    .split('\n')
    .map(line => line.replace(/[ \t]+$/g, ''))
    .join('\n');
}

/**
 * Converts text to UPPERCASE.
 */
export function toUpperCaseText(text: string): string {
  return text.toUpperCase();
}

/**
 * Converts text to lowercase.
 */
export function toLowerCaseText(text: string): string {
  return text.toLowerCase();
}

/**
 * Helper to check whether a selection range is non-empty.
 */
function hasNonEmptySelection(selection?: TextSelectionRange | null): selection is TextSelectionRange {
  if (!selection) return false;
  return (
    selection.startLineNumber !== selection.endLineNumber ||
    selection.startColumn !== selection.endColumn
  );
}

/**
 * Converts a 1-based (lineNumber, column) position into a 0-based character
 * offset within `content`.
 */
export function positionToOffset(content: string, lineNumber: number, column: number): number {
  const lines = content.split('\n');
  const clampedLine = Math.max(1, Math.min(lineNumber, lines.length));
  let offset = 0;
  for (let i = 0; i < clampedLine - 1; i++) {
    offset += lines[i].length + 1; // +1 for '\n'
  }
  const lineLength = lines[clampedLine - 1]?.length ?? 0;
  const clampedCol = Math.max(1, Math.min(column, lineLength + 1));
  return offset + (clampedCol - 1);
}

/**
 * Applies a text or line operation to `content`, scoping to `selection` when
 * appropriate:
 * - For `uppercase` / `lowercase`: transforms only the selected character
 *   range when a non-empty selection is provided; otherwise transforms the
 *   entire document.
 * - For line-oriented operations (`sortLinesAsc`, `sortLinesDesc`,
 *   `removeDuplicateLines`, `removeEmptyLines`, `trimTrailingWhitespace`):
 *   if a selection spans multiple lines, applies the operation to the selected
 *   full lines; otherwise applies to the entire document.
 */
export function applyTextOperation(
  content: string,
  operation: TextOperationKind,
  selection?: TextSelectionRange | null,
): string {
  const runLineOp = (block: string): string => {
    switch (operation) {
      case 'sortLinesAsc':
        return sortLinesAscending(block);
      case 'sortLinesDesc':
        return sortLinesDescending(block);
      case 'removeDuplicateLines':
        return removeDuplicateLines(block);
      case 'removeEmptyLines':
        return removeEmptyLines(block);
      case 'trimTrailingWhitespace':
        return trimTrailingWhitespace(block);
      case 'uppercase':
        return toUpperCaseText(block);
      case 'lowercase':
        return toLowerCaseText(block);
    }
  };

  if (operation === 'uppercase' || operation === 'lowercase') {
    if (hasNonEmptySelection(selection)) {
      const start = positionToOffset(content, selection.startLineNumber, selection.startColumn);
      const end = positionToOffset(content, selection.endLineNumber, selection.endColumn);
      const [from, to] = start <= end ? [start, end] : [end, start];
      return content.slice(0, from) + runLineOp(content.slice(from, to)) + content.slice(to);
    }
    return runLineOp(content);
  }

  // Line-oriented operations: scope to selected lines when selection spans > 1 line.
  if (hasNonEmptySelection(selection) && selection.endLineNumber > selection.startLineNumber) {
    const lines = content.split('\n');
    const startIdx = Math.max(0, selection.startLineNumber - 1);
    // If endColumn is 1 on endLineNumber, the user selected up to the newline of the previous line.
    const effectiveEndLine =
      selection.endColumn === 1 && selection.endLineNumber > selection.startLineNumber
        ? selection.endLineNumber - 1
        : selection.endLineNumber;
    const endIdx = Math.min(lines.length, effectiveEndLine);

    if (endIdx - startIdx > 1) {
      const before = lines.slice(0, startIdx);
      const targetBlock = lines.slice(startIdx, endIdx).join('\n');
      const after = lines.slice(endIdx);
      const transformed = runLineOp(targetBlock);
      const resultLines = [
        ...before,
        ...(transformed.length === 0 && operation === 'removeEmptyLines' ? [] : transformed.split('\n')),
        ...after,
      ];
      return resultLines.join('\n');
    }
  }

  return runLineOp(content);
}
