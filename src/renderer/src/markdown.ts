/**
 * Lightweight, zero-dependency, safe Markdown-to-HTML renderer and helpers for
 * Awapi Editor's Markdown preview popup.
 *
 * Supports:
 * - ATX headings (# .. ######) and Setext headings (=== / ---)
 * - Fenced code blocks (``` or ~~~) with optional language label
 * - Indented code blocks (4 spaces / 1 tab)
 * - Blockquotes (>), including nested blockquotes
 * - Unordered lists (-, *, +), ordered lists (1.), and GFM task lists (- [ ] / - [x])
 * - GFM pipe tables with column alignment (:---, :---:, ---:)
 * - Horizontal rules (---, ***, ___)
 * - Inline code (`code`), bold (** / __), italic (* / _), bold+italic, strikethrough (~~)
 * - Links ([text](url "title")), autolinks (<https://...>), and images (![alt](src "title"))
 * - Safe URL sanitization (blocks `javascript:`, `vbscript:`, and non-image `data:` URLs)
 * - Relative image path resolution against the Markdown file's directory (`file://`)
 */

export interface RenderMarkdownOptions {
  /** Absolute file path of the Markdown file on disk (used to resolve relative image paths). */
  baseFilePath?: string | null;
}

/**
 * Returns true when a tab should expose Markdown preview (either by `.md` / `.markdown`
 * filename extension or by explicit `markdown` language selection).
 */
export function isMarkdownTab(filename: string | null | undefined, languageId?: string): boolean {
  if (languageId === 'markdown') return true;
  if (!filename) return false;
  const base = filename.split(/[\\/]/).pop() ?? filename;
  const lower = base.toLowerCase();
  return lower.endsWith('.md') || lower.endsWith('.markdown');
}

/** Escape raw text for safe inclusion in HTML text or attribute values. */
export function escapeHtml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Validates and normalizes a link or image URL.
 * - Blocks `javascript:`, `vbscript:`, `file:` (unless resolved from relative image), and non-image `data:` URLs.
 * - Resolves relative image paths against `baseFilePath` when `isImage` is true.
 */
export function sanitizeUrl(
  rawUrl: string,
  options?: { isImage?: boolean; baseFilePath?: string | null },
): string | null {
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;

  // Strip control characters and whitespace when checking protocol
  // eslint-disable-next-line no-control-regex
  const normalizedForCheck = trimmed.replace(/[\u0000-\u0020]+/g, '').toLowerCase();

  if (
    normalizedForCheck.startsWith('javascript:') ||
    normalizedForCheck.startsWith('vbscript:')
  ) {
    return null;
  }

  if (normalizedForCheck.startsWith('data:')) {
    if (options?.isImage && /^data:image\/(png|jpe?g|gif|webp|bmp|ico);base64,/i.test(trimmed)) {
      return trimmed;
    }
    return null;
  }

  // Anchor links and standard web/mail schemes are always safe
  if (
    trimmed.startsWith('#') ||
    /^https?:\/\//i.test(trimmed) ||
    /^mailto:/i.test(trimmed)
  ) {
    return trimmed;
  }

  // Relative URL or local path: resolve against baseFilePath for images
  if (options?.isImage && options.baseFilePath) {
    return resolveRelativeFileUrl(trimmed, options.baseFilePath);
  }

  // Allow relative links/images as-is if they don't specify a dangerous scheme
  if (!/^[a-z][a-z0-9+.-]*:/i.test( normalizedForCheck )) {
    return trimmed;
  }

  return null;
}

/**
 * Resolves a relative asset path (e.g. `./img/diagram.png` or `../logo.png`)
 * against the directory containing `baseFilePath` into a `file://` URL.
 */
export function resolveRelativeFileUrl(relativePath: string, baseFilePath: string): string {
  // Normalize backslashes to forward slashes
  const normalizedBase = baseFilePath.replace(/\\/g, '/');
  const lastSlash = normalizedBase.lastIndexOf('/');
  const baseDir = lastSlash >= 0 ? normalizedBase.slice(0, lastSlash) : normalizedBase;

  const cleanRel = relativePath.replace(/\\/g, '/');
  // Absolute path on Unix or Windows drive letter
  const combined =
    cleanRel.startsWith('/') || /^[a-zA-Z]:\//.test(cleanRel)
      ? cleanRel
      : `${baseDir}/${cleanRel}`;

  const parts = combined.split('/');
  const resolved: string[] = [];
  for (const part of parts) {
    if (part === '.' || part === '') {
      if (resolved.length === 0 && combined.startsWith('/')) {
        resolved.push('');
      }
      continue;
    }
    if (part === '..') {
      // Do not pop drive root (e.g. "C:") or leading root ""
      if (resolved.length > 1 || (resolved.length === 1 && !/^[a-zA-Z]:$/.test(resolved[0]) && resolved[0] !== '')) {
        resolved.pop();
      }
      continue;
    }
    resolved.push(part);
  }

  const joined = resolved.join('/');
  if (joined.startsWith('/')) {
    return `awapi-asset://local${joined}`;
  }
  return `awapi-asset://local/${joined}`;
}

/** Generate a GitHub-style slug id for a heading text. */
export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[`*_~[\]()!<>]/g, '')
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Renders inline Markdown syntax (code spans, images, links, bold, italic,
 * strikethrough, autolinks, line breaks) into safe HTML.
 */
export function renderInlineMarkdown(text: string, options?: RenderMarkdownOptions): string {
  // 1. Extract inline code spans first so their contents are never parsed as Markdown
  const tokens: string[] = [];
  const pushToken = (html: string): string => {
    const id = `\u0000TOKEN_${tokens.length}\u0000`;
    tokens.push(html);
    return id;
  };

  let working = text.replace(/(`+)([\s\S]*?)\1/g, (_match, _ticks: string, code: string) => {
    const cleaned = code.startsWith(' ') && code.endsWith(' ') && code.trim().length > 0
      ? code.slice(1, -1)
      : code;
    return pushToken(`<code>${escapeHtml(cleaned)}</code>`);
  });

  // 2. Extract images: ![alt](src "optional title")
  working = working.replace(
    /!\[([^\]]*)\]\(\s*((?:[^\s()]|\([^\s()]*\))+)(?:\s+"([^"]*)")?\s*\)/g,
    (_match, alt: string, rawSrc: string, title?: string) => {
      const safeSrc = sanitizeUrl(rawSrc, { isImage: true, baseFilePath: options?.baseFilePath });
      if (!safeSrc) return escapeHtml(alt);
      const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
      return pushToken(
        `<img src="${escapeHtml(safeSrc)}" alt="${escapeHtml(alt)}"${titleAttr} loading="lazy" />`,
      );
    },
  );

  // 3. Extract links: [label](href "optional title")
  working = working.replace(
    /\[([^\]]+)\]\(\s*((?:[^\s()]|\([^\s()]*\))+)(?:\s+"([^"]*)")?\s*\)/g,
    (_match, label: string, rawHref: string, title?: string) => {
      const safeHref = sanitizeUrl(rawHref, { isImage: false, baseFilePath: options?.baseFilePath });
      const renderedLabel = renderInlineMarkdown(label, options);
      if (!safeHref) return renderedLabel;
      const titleAttr = title ? ` title="${escapeHtml(title)}"` : '';
      return pushToken(
        `<a href="${escapeHtml(safeHref)}"${titleAttr} rel="noopener noreferrer">${renderedLabel}</a>`,
      );
    },
  );

  // 4. Extract angle-bracket autolinks: <https://example.com> or <mailto:user@example.com>
  working = working.replace(/<((?:https?:\/\/|mailto:)[^>\s]+)>/gi, (_match, rawHref: string) => {
    const safeHref = sanitizeUrl(rawHref);
    if (!safeHref) return escapeHtml(rawHref);
    const display = rawHref.replace(/^mailto:/i, '');
    return pushToken(
      `<a href="${escapeHtml(safeHref)}" rel="noopener noreferrer">${escapeHtml(display)}</a>`,
    );
  });

  // 5. Escape any remaining raw HTML characters in plain text
  working = escapeHtml(working);

  // 6. Bold + Italic (***text*** or ___text___)
  working = working.replace(/\*\*\*(\S(?:[\s\S]*?\S)?)\*\*\*/g, '<strong><em>$1</em></strong>');
  working = working.replace(/(^|[^\w])___(\S(?:[\s\S]*?\S)?)___(?=$|[^\w])/g, '$1<strong><em>$2</em></strong>');

  // 7. Bold (**text** or __text__)
  working = working.replace(/\*\*(\S(?:[\s\S]*?\S)?)\*\*/g, '<strong>$1</strong>');
  working = working.replace(/(^|[^\w])__(\S(?:[\s\S]*?\S)?)__(?=$|[^\w])/g, '$1<strong>$2</strong>');

  // 8. Italic (*text* or _text_)
  working = working.replace(/\*([^\s*](?:[\s\S]*?[^\s*])?)\*/g, '<em>$1</em>');
  working = working.replace(/(^|[^\w])_([^\s_](?:[\s\S]*?[^\s_])?)_(?=$|[^\w])/g, '$1<em>$2</em>');

  // 9. Strikethrough (~~text~~)
  working = working.replace(/~~(\S(?:[\s\S]*?\S)?)~~/g, '<del>$1</del>');

  // 10. Hard line breaks (two or more trailing spaces before newline, or backslash before newline)
  working = working.replace(/(?: {2,}|\\)\n/g, '<br />\n');

  // 11. Restore protected tokens
  // eslint-disable-next-line no-control-regex
  working = working.replace(/\u0000TOKEN_(\d+)\u0000/g, (_m, idx: string) => tokens[Number(idx)] ?? '');

  return working;
}

function isHorizontalRule(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed.length < 3) return false;
  return /^(?:-\s*){3,}$/.test(trimmed) || /^(?:\*\s*){3,}$/.test(trimmed) || /^(?:_\s*){3,}$/.test(trimmed);
}

function isTableDelimiterRow(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes('-')) return false;
  const cells = splitTableRow(trimmed);
  if (cells.length === 0) return false;
  return cells.every(c => /^:?-+:?$/.test(c.trim()));
}

function splitTableRow(line: string): string[] {
  let trimmed = line.trim();
  if (trimmed.startsWith('|')) trimmed = trimmed.slice(1);
  if (trimmed.endsWith('|')) trimmed = trimmed.slice(0, -1);
  // Split on unescaped pipes
  const cells: string[] = [];
  let current = '';
  for (let i = 0; i < trimmed.length; i++) {
    if (trimmed[i] === '\\' && trimmed[i + 1] === '|') {
      current += '|';
      i++;
    } else if (trimmed[i] === '|') {
      cells.push(current.trim());
      current = '';
    } else {
      current += trimmed[i];
    }
  }
  cells.push(current.trim());
  return cells;
}

function parseTableAlignments(delimiterLine: string): Array<'left' | 'center' | 'right' | null> {
  return splitTableRow(delimiterLine).map(cell => {
    const c = cell.trim();
    const left = c.startsWith(':');
    const right = c.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';
    if (left) return 'left';
    return null;
  });
}

/**
 * Converts a Markdown document into a sanitized HTML string suitable for
 * rendering inside the Markdown preview window.
 */
export function renderMarkdownToHtml(markdown: string, options?: RenderMarkdownOptions): string {
  const normalized = markdown.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');
  const blocks: string[] = [];
  let i = 0;

  const isBlockStarter = (idx: number): boolean => {
    if (idx >= lines.length) return false;
    const line = lines[idx];
    if (/^\s*$/.test(line)) return true;
    if (/^ {0,3}(`{3,}|~{3,})/.test(line)) return true;
    if (/^ {0,3}#{1,6}(?:\s|$)/.test(line)) return true;
    if (/^ {0,3}>/.test(line)) return true;
    if (isHorizontalRule(line)) return true;
    if (/^ {0,3}(?:[-*+]|\d+\.)\s+/.test(line)) return true;
    if (
      idx + 1 < lines.length &&
      line.includes('|') &&
      isTableDelimiterRow(lines[idx + 1])
    ) {
      return true;
    }
    return false;
  };

  while (i < lines.length) {
    const line = lines[i];

    // 1. Blank line
    if (/^\s*$/.test(line)) {
      i++;
      continue;
    }

    // 2. Fenced code block (``` or ~~~)
    const fenceMatch = line.match(/^ {0,3}(`{3,}|~{3,})\s*([^\s`~]*)/);
    if (fenceMatch) {
      const fence = fenceMatch[1];
      const fenceChar = fence[0];
      const fenceLen = fence.length;
      const lang = fenceMatch[2]?.trim() || '';
      i++;
      const codeLines: string[] = [];
      const closeRegex = new RegExp(`^ {0,3}${fenceChar}{${fenceLen},}\\s*$`);
      while (i < lines.length && !closeRegex.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // consume closing fence
      const langClass = lang ? ` class="language-${escapeHtml(lang)}"` : '';
      const langBadge = lang ? ` data-language="${escapeHtml(lang)}"` : '';
      blocks.push(`<pre${langBadge}><code${langClass}>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
      continue;
    }

    // 3. ATX Heading (# .. ######)
    const atxMatch = line.match(/^ {0,3}(#{1,6})(?:\s+(.*?))?\s*#*\s*$/);
    if (atxMatch) {
      const level = atxMatch[1].length;
      const rawHeading = atxMatch[2] ?? '';
      const slug = slugifyHeading(rawHeading);
      const idAttr = slug ? ` id="${escapeHtml(slug)}"` : '';
      blocks.push(`<h${level}${idAttr}>${renderInlineMarkdown(rawHeading, options)}</h${level}>`);
      i++;
      continue;
    }

    // 4. Setext Heading (line followed by === or ---)
    if (
      i + 1 < lines.length &&
      !/^\s*$/.test(line) &&
      !/^ {0,3}(?:[-*+]|\d+\.|>)/.test(line) &&
      /^ {0,3}(?:=+|-+)\s*$/.test(lines[i + 1])
    ) {
      const underline = lines[i + 1].trim();
      const level = underline.startsWith('=') ? 1 : 2;
      const rawHeading = line.trim();
      const slug = slugifyHeading(rawHeading);
      const idAttr = slug ? ` id="${escapeHtml(slug)}"` : '';
      blocks.push(`<h${level}${idAttr}>${renderInlineMarkdown(rawHeading, options)}</h${level}>`);
      i += 2;
      continue;
    }

    // 5. Horizontal rule
    if (isHorizontalRule(line)) {
      blocks.push('<hr />');
      i++;
      continue;
    }

    // 6. Blockquote
    if (/^ {0,3}>/.test(line)) {
      const quoteLines: string[] = [];
      while (i < lines.length && (/^ {0,3}>/.test(lines[i]) || (!/^\s*$/.test(lines[i]) && quoteLines.length > 0 && !isBlockStarter(i)))) {
        quoteLines.push(lines[i].replace(/^ {0,3}>\s?/, ''));
        i++;
      }
      blocks.push(`<blockquote>${renderMarkdownToHtml(quoteLines.join('\n'), options)}</blockquote>`);
      continue;
    }

    // 7. GFM Pipe Table
    if (
      i + 1 < lines.length &&
      line.includes('|') &&
      isTableDelimiterRow(lines[i + 1])
    ) {
      const headers = splitTableRow(line);
      const alignments = parseTableAlignments(lines[i + 1]);
      i += 2;

      const alignAttr = (colIdx: number): string => {
        const align = alignments[colIdx];
        return align ? ` style="text-align: ${align}"` : '';
      };

      const theadCells = headers
        .map((h, idx) => `<th${alignAttr(idx)}>${renderInlineMarkdown(h, options)}</th>`)
        .join('');

      const bodyRows: string[] = [];
      while (i < lines.length && !/^\s*$/.test(lines[i]) && lines[i].includes('|')) {
        const rowCells = splitTableRow(lines[i]);
        const tds = headers
          .map((_h, idx) => `<td${alignAttr(idx)}>${renderInlineMarkdown(rowCells[idx] ?? '', options)}</td>`)
          .join('');
        bodyRows.push(`<tr>${tds}</tr>`);
        i++;
      }

      const tbody = bodyRows.length > 0 ? `<tbody>${bodyRows.join('')}</tbody>` : '';
      blocks.push(`<table><thead><tr>${theadCells}</tr></thead>${tbody}</table>`);
      continue;
    }

    // 8. Lists (unordered -, *, + and ordered 1.)
    const listMatch = line.match(/^( {0,3})([-*+]|\d+\.)\s+(.*)$/);
    if (listMatch) {
      const isOrdered = /^\d+\.$/.test(listMatch[2]);
      const tag = isOrdered ? 'ol' : 'ul';
      const items: string[] = [];
      let hasTaskItems = false;

      while (i < lines.length) {
        const itemMatch = lines[i].match(/^( {0,3})([-*+]|\d+\.)\s+(.*)$/);
        if (!itemMatch) break;
        const itemIsOrdered = /^\d+\.$/.test(itemMatch[2]);
        if (itemIsOrdered !== isOrdered) break;

        const itemLines: string[] = [itemMatch[3]];
        i++;

        // Collect continuation lines indented by at least 2 spaces
        while (i < lines.length) {
          if (/^\s*$/.test(lines[i])) {
            // Check if the next non-empty line is an indented continuation
            if (i + 1 < lines.length && /^ {2,}\S/.test(lines[i + 1]) && !/^ {0,3}([-*+]|\d+\.)\s+/.test(lines[i + 1])) {
              itemLines.push('');
              i++;
              continue;
            }
            break;
          }
          if (/^ {0,3}([-*+]|\d+\.)\s+/.test(lines[i])) break;
          if (/^ {2,}/.test(lines[i]) || /^\t/.test(lines[i])) {
            itemLines.push(lines[i].replace(/^(?: {2}|\t)/, ''));
            i++;
          } else {
            break;
          }
        }

        const firstLine = itemLines[0];
        const taskMatch = firstLine.match(/^\[([ xX])\]\s+(.*)$/);
        if (taskMatch) {
          hasTaskItems = true;
          const checked = taskMatch[1].toLowerCase() === 'x';
          const restFirst = taskMatch[2];
          const restContent = [restFirst, ...itemLines.slice(1)].join('\n');
          const checkbox = `<input type="checkbox" disabled${checked ? ' checked' : ''} /> `;
          items.push(`<li class="task-list-item">${checkbox}${renderInlineMarkdown(restContent, options)}</li>`);
        } else {
          const rawItem = itemLines.join('\n');
          // If the item has nested lists or multiple lines with block syntax, render nested
          const hasNestedList = itemLines.slice(1).some(l => /^\s*(?:[-*+]|\d+\.)\s+/.test(l));
          if (hasNestedList) {
            const firstHtml = renderInlineMarkdown(firstLine, options);
            const nestedHtml = renderMarkdownToHtml(itemLines.slice(1).join('\n'), options);
            items.push(`<li>${firstHtml}${nestedHtml}</li>`);
          } else {
            items.push(`<li>${renderInlineMarkdown(rawItem, options)}</li>`);
          }
        }

        // Consume a single blank line between loose list items if next line continues the same list
        if (i < lines.length && /^\s*$/.test(lines[i])) {
          const nextMatch = i + 1 < lines.length ? lines[i + 1].match(/^( {0,3})([-*+]|\d+\.)\s+/) : null;
          if (nextMatch && (/^\d+\.$/.test(nextMatch[2]) === isOrdered)) {
            i++;
          }
        }
      }

      const listClass = hasTaskItems ? ' class="contains-task-list"' : '';
      blocks.push(`<${tag}${listClass}>${items.join('')}</${tag}>`);
      continue;
    }

    // 9. Indented code block (4 spaces or tab)
    if (/^(?: {4}|\t)/.test(line)) {
      const codeLines: string[] = [];
      while (i < lines.length && (/^(?: {4}|\t)/.test(lines[i]) || /^\s*$/.test(lines[i]))) {
        codeLines.push(lines[i].replace(/^(?: {4}|\t)/, ''));
        i++;
      }
      // Trim trailing blank lines inside the code block
      while (codeLines.length > 0 && /^\s*$/.test(codeLines[codeLines.length - 1])) {
        codeLines.pop();
      }
      blocks.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
      continue;
    }

    // 10. Paragraph (collect consecutive non-block-starter lines)
    const paraLines: string[] = [line];
    i++;
    while (i < lines.length && !isBlockStarter(i)) {
      // Stop if current line + next line forms a Setext heading
      if (
        i + 1 < lines.length &&
        !/^\s*$/.test(lines[i]) &&
        /^ {0,3}(?:=+|-+)\s*$/.test(lines[i + 1])
      ) {
        break;
      }
      paraLines.push(lines[i]);
      i++;
    }
    blocks.push(`<p>${renderInlineMarkdown(paraLines.join('\n'), options)}</p>`);
  }

  return blocks.join('\n');
}
