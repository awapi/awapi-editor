/**
 * Find-in-preview support shared by the Markdown preview (run directly on the
 * rendered DOM) and the sandboxed HTML preview (injected into the iframe, which
 * the preview window cannot reach because it has an opaque origin).
 */

export interface PreviewFindOptions {
  matchCase: boolean;
  wholeWord: boolean;
  regex: boolean;
}

/** One match with a short single-line context, used by the Find All results list. */
export interface PreviewFindMatch {
  before: string;
  text: string;
  after: string;
}

export interface PreviewFindResult {
  matches: PreviewFindMatch[];
  /** True when the match count hit the cap and further matches were not highlighted. */
  truncated: boolean;
  /** Set when the query is an invalid regular expression. */
  error: string | null;
}

export interface PreviewFindEngine {
  /** Clears previous highlights, then highlights every match of `query` inside `root`. */
  search(
    root: Element | null,
    query: string,
    options: PreviewFindOptions,
    exclude?: string,
  ): PreviewFindResult;
  /** Marks match `index` as the current one, optionally scrolling it into view. */
  setActive(index: number, scroll: boolean): void;
  /** Removes all highlights. */
  clear(): void;
}

/**
 * Creates a find engine bound to `doc`.
 *
 * IMPORTANT: this function is serialized with `toString()` and injected into
 * HTML previews, so it must stay fully self-contained (no imports, no references
 * to module-level values, no `</script>` sequences).
 */
export function createPreviewFindEngine(doc: Document): PreviewFindEngine {
  const MATCH_CLASS = 'awapi-find-match';
  const ACTIVE_CLASS = 'awapi-find-active';
  const STYLE_ID = 'awapi-find-style';
  const MAX_MATCHES = 5000;
  const CONTEXT_CHARS = 40;
  const SKIP_TAGS: Record<string, true> = {
    SCRIPT: true, STYLE: true, NOSCRIPT: true, TEMPLATE: true, TEXTAREA: true,
    INPUT: true, SELECT: true, OPTION: true, IFRAME: true, OBJECT: true, svg: true, SVG: true,
  };
  const BLOCK_TAGS: Record<string, true> = {
    ADDRESS: true, ARTICLE: true, ASIDE: true, BLOCKQUOTE: true, BODY: true, CAPTION: true,
    DD: true, DETAILS: true, DIV: true, DL: true, DT: true, FIELDSET: true, FIGCAPTION: true,
    FIGURE: true, FOOTER: true, FORM: true, H1: true, H2: true, H3: true, H4: true, H5: true,
    H6: true, HEADER: true, HR: true, HTML: true, LI: true, MAIN: true, NAV: true, OL: true,
    P: true, PRE: true, SECTION: true, SUMMARY: true, TABLE: true, TBODY: true, TD: true,
    TFOOT: true, TH: true, THEAD: true, TR: true, UL: true,
  };

  let groups: HTMLElement[][] = [];
  let activeIndex = -1;

  function ensureStyle(): void {
    if (doc.getElementById(STYLE_ID)) return;
    const style = doc.createElement('style');
    style.id = STYLE_ID;
    style.textContent =
      'mark.' + MATCH_CLASS + '{background-color:rgba(255,200,0,0.45)!important;color:inherit!important;' +
      'border-radius:2px;padding:0!important;margin:0!important;}' +
      'mark.' + MATCH_CLASS + '.' + ACTIVE_CLASS + '{background-color:#ff9632!important;color:#000!important;' +
      'outline:1px solid #e07000;}';
    (doc.head || doc.documentElement).appendChild(style);
  }

  function clear(): void {
    const parents: Node[] = [];
    for (const group of groups) {
      for (const mark of group) {
        const parent = mark.parentNode;
        if (!parent) continue;
        while (mark.firstChild) parent.insertBefore(mark.firstChild, mark);
        parent.removeChild(mark);
        if (parents.indexOf(parent) < 0) parents.push(parent);
      }
    }
    for (const parent of parents) parent.normalize();
    groups = [];
    activeIndex = -1;
  }

  function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function oneLine(value: string): string {
    return value.replace(/\s+/g, ' ');
  }

  function search(
    root: Element | null,
    query: string,
    options: PreviewFindOptions,
    exclude?: string,
  ): PreviewFindResult {
    clear();
    if (!root || !query) return { matches: [], truncated: false, error: null };

    let pattern: RegExp;
    try {
      const source = options.regex ? query : escapeRegExp(query);
      pattern = new RegExp(
        options.wholeWord ? '\\b(?:' + source + ')\\b' : source,
        options.matchCase ? 'g' : 'gi',
      );
    } catch (err) {
      return {
        matches: [],
        truncated: false,
        error: err instanceof Error ? err.message : 'Invalid regular expression',
      };
    }

    // Flatten the visible text into one string so matches can span inline
    // elements (e.g. "is **bold**"); block boundaries become "\n".
    const segments: Array<{ node: Text; start: number }> = [];
    let text = '';
    let lastBlock: Element | null = null;
    const blockOf = (node: Node): Element => {
      let el = node.parentElement;
      while (el && el !== root && !BLOCK_TAGS[el.tagName]) el = el.parentElement;
      return el ?? root;
    };
    const walker = doc.createTreeWalker(root, 1 /* SHOW_ELEMENT */ | 4 /* SHOW_TEXT */, {
      acceptNode(node: Node): number {
        if (node.nodeType === 1) {
          const el = node as Element;
          if (SKIP_TAGS[el.tagName]) return 2; // FILTER_REJECT: skip the whole subtree
          if (exclude && el.matches(exclude)) return 2;
          return 3; // FILTER_SKIP: descend into children
        }
        return 1; // FILTER_ACCEPT
      },
    });
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const textNode = node as Text;
      const value = textNode.data;
      if (!value) continue;
      const block = blockOf(textNode);
      if (lastBlock && block !== lastBlock && text && text[text.length - 1] !== '\n') text += '\n';
      lastBlock = block;
      segments.push({ node: textNode, start: text.length });
      text += value;
    }

    const found: Array<{ start: number; end: number }> = [];
    let truncated = false;
    pattern.lastIndex = 0;
    for (let m = pattern.exec(text); m; m = pattern.exec(text)) {
      if (m[0].length === 0) {
        pattern.lastIndex++;
        continue;
      }
      if (found.length >= MAX_MATCHES) {
        truncated = true;
        break;
      }
      found.push({ start: m.index, end: m.index + m[0].length });
    }
    if (found.length === 0) return { matches: [], truncated: false, error: null };

    const matches: PreviewFindMatch[] = found.map(({ start, end }) => {
      let before = text.slice(Math.max(0, start - CONTEXT_CHARS), start);
      let after = text.slice(end, end + CONTEXT_CHARS);
      const nl = before.lastIndexOf('\n');
      if (nl >= 0) before = before.slice(nl + 1);
      const nlAfter = after.indexOf('\n');
      if (nlAfter >= 0) after = after.slice(0, nlAfter);
      return {
        before: oneLine(before).replace(/^\s+/, ''),
        text: oneLine(text.slice(start, end)),
        after: oneLine(after).replace(/\s+$/, ''),
      };
    });

    // Resolve each match into per-text-node ranges.
    const pieces: Array<Array<{ node: Text; from: number; to: number }>> = [];
    let seg = 0;
    for (const { start, end } of found) {
      while (seg < segments.length - 1 && segments[seg].start + segments[seg].node.data.length <= start) seg++;
      const parts: Array<{ node: Text; from: number; to: number }> = [];
      for (let i = seg; i < segments.length && segments[i].start < end; i++) {
        const s = segments[i];
        const from = Math.max(start, s.start) - s.start;
        const to = Math.min(end, s.start + s.node.data.length) - s.start;
        if (to > from) parts.push({ node: s.node, from, to });
      }
      pieces.push(parts);
    }

    // Wrap from last to first so earlier offsets stay valid while text nodes are split.
    ensureStyle();
    const wrapped: HTMLElement[][] = found.map(() => []);
    for (let i = pieces.length - 1; i >= 0; i--) {
      for (let j = pieces[i].length - 1; j >= 0; j--) {
        const { node, from, to } = pieces[i][j];
        const middle = node.splitText(from);
        middle.splitText(to - from);
        const mark = doc.createElement('mark');
        mark.className = MATCH_CLASS;
        mark.setAttribute('data-awapi-find-index', String(i));
        middle.parentNode!.insertBefore(mark, middle);
        mark.appendChild(middle);
        wrapped[i].unshift(mark);
      }
    }
    groups = wrapped;
    return { matches, truncated, error: null };
  }

  function setActive(index: number, scroll: boolean): void {
    if (activeIndex >= 0 && groups[activeIndex]) {
      for (const mark of groups[activeIndex]) mark.classList.remove(ACTIVE_CLASS);
    }
    activeIndex = index >= 0 && index < groups.length ? index : -1;
    if (activeIndex < 0) return;
    const group = groups[activeIndex];
    for (const mark of group) mark.classList.add(ACTIVE_CLASS);
    if (scroll && group[0] && typeof group[0].scrollIntoView === 'function') {
      group[0].scrollIntoView({ block: 'center', inline: 'nearest' });
    }
  }

  return { search, setActive, clear };
}

/** `postMessage` type the preview window sends to an HTML preview iframe. */
export const PREVIEW_FIND_COMMAND_MESSAGE = 'awapi-preview-find';
/** `postMessage` type an HTML preview iframe replies with after a search. */
export const PREVIEW_FIND_RESULT_MESSAGE = 'awapi-preview-find-result';
/** `postMessage` type an HTML preview iframe uses to forward find shortcuts to the preview window. */
export const PREVIEW_FIND_KEY_MESSAGE = 'awapi-preview-find-key';

export type PreviewFindCommand =
  | { type: typeof PREVIEW_FIND_COMMAND_MESSAGE; action: 'search'; requestId: number; query: string; options: PreviewFindOptions }
  | { type: typeof PREVIEW_FIND_COMMAND_MESSAGE; action: 'activate'; index: number; scroll: boolean }
  | { type: typeof PREVIEW_FIND_COMMAND_MESSAGE; action: 'clear' };

export interface PreviewFindShortcut {
  key: string;
  shiftKey: boolean;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
}

/** Returns true for key presses that drive the preview find bar (Ctrl/Cmd+F, Ctrl/Cmd+G, F3, Escape). */
export function isPreviewFindShortcut(e: PreviewFindShortcut): boolean {
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();
  return (mod && !e.altKey && (key === 'f' || key === 'g')) || e.key === 'F3' || e.key === 'Escape';
}

function buildHtmlPreviewFindScript(): string {
  const agent = `(function(){
var engine=(${createPreviewFindEngine.toString()})(document);
window.addEventListener('message',function(e){
if(e.source!==window.parent)return;var d=e.data;
if(!d||d.type!==${JSON.stringify(PREVIEW_FIND_COMMAND_MESSAGE)})return;
if(d.action==='search'){var r=engine.search(document.body,String(d.query||''),d.options||{});
window.parent.postMessage({type:${JSON.stringify(PREVIEW_FIND_RESULT_MESSAGE)},requestId:d.requestId,result:r},'*');}
else if(d.action==='activate'){engine.setActive(d.index,!!d.scroll);}
else if(d.action==='clear'){engine.clear();}
});
document.addEventListener('keydown',function(e){
var mod=e.ctrlKey||e.metaKey;var k=String(e.key||'').toLowerCase();
var isFind=(mod&&!e.altKey&&(k==='f'||k==='g'))||e.key==='F3';
if(!isFind&&e.key!=='Escape')return;
if(isFind)e.preventDefault();
window.parent.postMessage({type:${JSON.stringify(PREVIEW_FIND_KEY_MESSAGE)},key:e.key,shiftKey:e.shiftKey,altKey:e.altKey,ctrlKey:e.ctrlKey,metaKey:e.metaKey},'*');
},true);
})();`;
  return `<script data-awapi-preview-find>${agent}</script>`;
}

let cachedFindScript: string | null = null;

/**
 * Injects the find agent into an HTML preview document (inside `<head>` when
 * present, otherwise after `<html>` / the doctype, otherwise at the start).
 */
export function injectHtmlPreviewFindAgent(html: string): string {
  cachedFindScript ??= buildHtmlPreviewFindScript();
  for (const pattern of [/<head(?:\s[^>]*)?>/i, /<html(?:\s[^>]*)?>/i, /<!doctype[^>]*>/i]) {
    const match = pattern.exec(html);
    if (match) {
      const insertPos = match.index + match[0].length;
      return `${html.slice(0, insertPos)}${cachedFindScript}${html.slice(insertPos)}`;
    }
  }
  return `${cachedFindScript}${html}`;
}
