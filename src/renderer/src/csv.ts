export type CsvSeparator = ',' | ';' | '\t' | '|';

export interface CsvSeparatorOption {
  value: CsvSeparator;
  label: string;
  shortLabel: string;
}

export const CSV_SEPARATORS: CsvSeparatorOption[] = [
  { value: ',', label: 'Comma (,)', shortLabel: ',' },
  { value: ';', label: 'Semicolon (;)', shortLabel: ';' },
  { value: '\t', label: 'Tab (\\t)', shortLabel: 'TAB' },
  { value: '|', label: 'Pipe (|)', shortLabel: '|' },
];

/**
 * Returns true when a tab should expose CSV/TSV grid editing (either by
 * `.csv`/`.tsv` filename extension or by explicit `csv` language selection).
 */
export function isCsvTab(filename: string | null | undefined, languageId?: string): boolean {
  if (languageId === 'csv') return true;
  if (!filename) return false;
  const base = filename.split(/[\\/]/).pop() ?? filename;
  const lower = base.toLowerCase();
  return lower.endsWith('.csv') || lower.endsWith('.tsv');
}

/**
 * Splits up to `maxLines` logical records from raw text, respecting quotes.
 */
function sampleLogicalLines(content: string, maxLines = 10): string[] {
  const lines: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];
    if (ch === '"') {
      if (inQuotes && content[i + 1] === '"') {
        current += '""';
        i++;
      } else {
        inQuotes = !inQuotes;
        current += ch;
      }
      continue;
    }

    if (!inQuotes && (ch === '\n' || ch === '\r')) {
      if (ch === '\r' && content[i + 1] === '\n') i++;
      if (current.trim().length > 0) {
        lines.push(current);
        if (lines.length >= maxLines) break;
      }
      current = '';
      continue;
    }

    current += ch;
  }

  if (lines.length < maxLines && current.trim().length > 0) {
    lines.push(current);
  }

  return lines;
}

function countSeparatorOutsideQuotes(line: string, sep: CsvSeparator): number {
  let count = 0;
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (!inQuotes && ch === sep) {
      count++;
    }
  }
  return count;
}

/**
 * Auto-detects the most likely separator (`,`, `;`, `\t`, `|`) by checking
 * consistency and frequency across the first few logical rows.
 */
export function detectCsvSeparator(content: string, filename?: string | null): CsvSeparator {
  const defaultSep: CsvSeparator =
    filename && filename.toLowerCase().endsWith('.tsv') ? '\t' : ',';

  if (!content || !content.trim()) {
    return defaultSep;
  }

  const lines = sampleLogicalLines(content, 10);
  if (lines.length === 0) return defaultSep;

  const candidates: CsvSeparator[] = [',', ';', '\t', '|'];
  let bestSep: CsvSeparator = defaultSep;
  let bestScore = -1;

  for (const sep of candidates) {
    const counts = lines.map(l => countSeparatorOutsideQuotes(l, sep));
    const nonZeroLines = counts.filter(c => c > 0).length;
    if (nonZeroLines === 0) continue;

    const total = counts.reduce((a, b) => a + b, 0);
    const first = counts[0];
    const allConsistent = counts.length > 1 && counts.every(c => c === first && c > 0);
    // Reward consistent column counts across rows, then total occurrences
    const score = (allConsistent ? 1000 : 0) + nonZeroLines * 25 + total;
    if (score > bestScore) {
      bestScore = score;
      bestSep = sep;
    }
  }

  return bestSep;
}

/**
 * RFC-4180 compliant parser that supports configurable field separators and
 * normalizes ragged rows to a rectangular 2D string array.
 */
export function parseCsv(content: string, separator: CsvSeparator = ','): string[][] {
  if (!content) return [['']];

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;

  for (let i = 0; i < content.length; i++) {
    const ch = content[i];

    if (inQuotes) {
      if (ch === '"') {
        if (content[i + 1] === '"') {
          currentField += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        currentField += ch;
      }
      continue;
    }

    if (ch === '"' && currentField.length === 0) {
      inQuotes = true;
      continue;
    }

    if (ch === separator) {
      currentRow.push(currentField);
      currentField = '';
      continue;
    }

    if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && content[i + 1] === '\n') {
        i++;
      }
      currentRow.push(currentField);
      rows.push(currentRow);
      currentRow = [];
      currentField = '';
      continue;
    }

    currentField += ch;
  }

  // Push final field/row unless the file ended with a trailing newline
  if (inQuotes || currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  if (rows.length === 0) {
    return [['']];
  }

  const maxCols = Math.max(1, ...rows.map(r => r.length));
  return rows.map(r => {
    if (r.length === maxCols) return r;
    const padded = [...r];
    while (padded.length < maxCols) padded.push('');
    return padded;
  });
}

function formatCsvField(value: string, separator: CsvSeparator): string {
  const needsQuotes =
    value.includes(separator) ||
    value.includes('"') ||
    value.includes('\n') ||
    value.includes('\r');
  if (!needsQuotes) return value;
  return `"${value.replace(/"/g, '""')}"`;
}

/**
 * Serializes a 2D rectangular grid of strings back to CSV/TSV text.
 */
export function serializeCsv(
  rows: string[][],
  separator: CsvSeparator = ',',
  eol: '\n' | '\r\n' = '\n',
): string {
  if (rows.length === 0) return '';
  if (rows.length === 1 && rows[0].length === 1 && rows[0][0] === '') return '';
  return rows
    .map(row => row.map(cell => formatCsvField(cell ?? '', separator)).join(separator))
    .join(eol);
}

/**
 * Converts a 0-based column index to spreadsheet column letters (0 -> A, 25 -> Z, 26 -> AA).
 */
export function getColumnLetter(colIndex: number): string {
  let n = colIndex;
  let label = '';
  while (n >= 0) {
    label = String.fromCharCode((n % 26) + 65) + label;
    n = Math.floor(n / 26) - 1;
  }
  return label;
}

/**
 * Compares two CSV cell values for sorting:
 * - Empty values always sort last regardless of direction.
 * - Numeric values are compared numerically when both cells are valid numbers.
 * - Otherwise uses case-insensitive natural string comparison.
 */
export function compareCsvValues(a: string, b: string, direction: 'asc' | 'desc'): number {
  const trimA = (a ?? '').trim();
  const trimB = (b ?? '').trim();

  if (trimA === '' && trimB === '') return 0;
  if (trimA === '') return 1;
  if (trimB === '') return -1;

  const numA = Number(trimA);
  const numB = Number(trimB);
  const bothNumeric = !Number.isNaN(numA) && !Number.isNaN(numB);

  const cmp = bothNumeric
    ? numA - numB
    : trimA.localeCompare(trimB, undefined, { numeric: true, sensitivity: 'base' });

  return direction === 'asc' ? cmp : -cmp;
}

/**
 * Returns a new grid with rows sorted by `colIndex`. When `hasHeader` is true,
 * row 0 stays pinned at the top and only rows 1..N are sorted.
 */
export function sortCsvGridByColumn(
  rows: string[][],
  colIndex: number,
  direction: 'asc' | 'desc',
  hasHeader: boolean,
): string[][] {
  if (rows.length <= (hasHeader ? 2 : 1)) {
    return rows.map(r => [...r]);
  }
  const header = hasHeader ? [rows[0]] : [];
  const body = (hasHeader ? rows.slice(1) : rows).map(r => [...r]);

  body.sort((rowA, rowB) =>
    compareCsvValues(rowA[colIndex] ?? '', rowB[colIndex] ?? '', direction),
  );

  return [...header.map(r => [...r]), ...body];
}
