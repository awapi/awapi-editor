/** Line-ending kinds supported by the editor. */
export type EolKind = 'LF' | 'CRLF';

/** Human-readable label shown in the status bar. */
export const EOL_LABEL: Record<EolKind, string> = {
  LF: 'LF',
  CRLF: 'CRLF',
};

/**
 * Detects the dominant line ending used in the given content.
 *
 * Rule: if any `\r\n` sequence is present, treat the file as CRLF; otherwise
 * LF. Empty / single-line content with no line terminators falls back to LF,
 * which matches Monaco's in-memory default.
 */
export function detectEol(content: string): EolKind {
  return content.includes('\r\n') ? 'CRLF' : 'LF';
}

/**
 * Normalize any mixed line endings in `content` to `\n` (LF). Used when
 * loading a file from disk so Monaco always sees a consistent EOL in memory.
 */
export function normalizeToLF(content: string): string {
  return content.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

/**
 * Apply a target EOL to LF-normalized content. Input is expected to use `\n`
 * for line terminators; any `\r\n` already present is normalized first so the
 * output is never mixed.
 */
export function applyEol(content: string, eol: EolKind): string {
  const lf = normalizeToLF(content);
  return eol === 'CRLF' ? lf.replace(/\n/g, '\r\n') : lf;
}
