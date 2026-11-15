/**
 * Shared types and payload validation for Mermaid diagram pop-out windows.
 *
 * A Markdown preview window renders diagrams in its Mermaid sandbox and sends the
 * resulting SVG (never Mermaid source or HTML) to the main process, which forwards
 * it to pop-out windows that display it as an inert `<img>`. Every payload crossing
 * IPC is untrusted and normalized here with size limits.
 */

export type DiagramTheme = 'light' | 'dark';

/** A rendered diagram (`svg`) or the Mermaid error message for it. */
export interface DiagramContent {
  svg: string | null;
  error: string | null;
}

/** What a diagram pop-out window displays. */
export interface DiagramWindowData extends DiagramContent {
  title: string;
  theme: DiagramTheme;
}

/** Identifies a diagram: the `index`-th Mermaid block of the document `docKey`. */
export interface DiagramRef {
  docKey: string;
  index: number;
}

export interface DiagramOpenRequest extends DiagramRef, DiagramContent {
  title: string;
  theme: DiagramTheme;
}

export interface DiagramUpdate extends DiagramContent {
  index: number;
}

/**
 * Sent by a preview window whenever its diagrams change. Pop-outs for another
 * document or for an index >= `count` are closed; listed `updates` are forwarded.
 */
export interface DiagramSyncRequest {
  docKey: string;
  count: number;
  theme: DiagramTheme;
  updates: DiagramUpdate[];
}

export const MAX_DIAGRAM_SVG_LENGTH = 20_000_000;
export const MAX_DIAGRAM_ERROR_LENGTH = 10_000;
export const MAX_DIAGRAM_TITLE_LENGTH = 300;
export const MAX_DIAGRAM_DOC_KEY_LENGTH = 4096;
export const MAX_DIAGRAMS_PER_DOCUMENT = 1000;

function asRecord(raw: unknown): Record<string, unknown> | null {
  return raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
}

function isDiagramIndex(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0 && (value as number) < MAX_DIAGRAMS_PER_DOCUMENT;
}

function normalizeTheme(value: unknown): DiagramTheme {
  return value === 'light' ? 'light' : 'dark';
}

function normalizeDocKey(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_DIAGRAM_DOC_KEY_LENGTH
    ? value
    : null;
}

/** Accepts only well-formed SVG markup within the size limit, plus a bounded error string. */
function normalizeContent(obj: Record<string, unknown>): DiagramContent | null {
  const svg =
    typeof obj.svg === 'string' &&
    obj.svg.length <= MAX_DIAGRAM_SVG_LENGTH &&
    /^\s*<svg[\s>/]/i.test(obj.svg)
      ? obj.svg
      : null;
  const error =
    svg === null && typeof obj.error === 'string'
      ? obj.error.slice(0, MAX_DIAGRAM_ERROR_LENGTH)
      : null;
  return svg !== null || error !== null ? { svg, error } : null;
}

export function normalizeDiagramOpenRequest(raw: unknown): DiagramOpenRequest | null {
  const obj = asRecord(raw);
  if (!obj) return null;
  const docKey = normalizeDocKey(obj.docKey);
  const content = normalizeContent(obj);
  if (!docKey || !isDiagramIndex(obj.index) || !content) return null;
  const title =
    typeof obj.title === 'string' && obj.title.trim()
      ? obj.title.trim().slice(0, MAX_DIAGRAM_TITLE_LENGTH)
      : 'Diagram';
  return { docKey, index: obj.index, title, theme: normalizeTheme(obj.theme), ...content };
}

export function normalizeDiagramSyncRequest(raw: unknown): DiagramSyncRequest | null {
  const obj = asRecord(raw);
  if (!obj) return null;
  const docKey = normalizeDocKey(obj.docKey);
  if (!docKey) return null;
  const count =
    Number.isInteger(obj.count) && (obj.count as number) >= 0
      ? Math.min(obj.count as number, MAX_DIAGRAMS_PER_DOCUMENT)
      : 0;
  const updates: DiagramUpdate[] = [];
  if (Array.isArray(obj.updates)) {
    for (const entry of obj.updates.slice(0, MAX_DIAGRAMS_PER_DOCUMENT)) {
      const rec = asRecord(entry);
      if (!rec || !isDiagramIndex(rec.index) || rec.index >= count) continue;
      const content = normalizeContent(rec);
      if (content) updates.push({ index: rec.index, ...content });
    }
  }
  return { docKey, count, theme: normalizeTheme(obj.theme), updates };
}

/** Pop-out window title, e.g. `Diagram 2 — README.md`. */
export function formatDiagramWindowTitle(title: string, index: number): string {
  return `Diagram ${index + 1} — ${title}`;
}
