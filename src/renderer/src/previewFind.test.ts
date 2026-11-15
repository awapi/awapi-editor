import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  PREVIEW_FIND_COMMAND_MESSAGE,
  PREVIEW_FIND_KEY_MESSAGE,
  PREVIEW_FIND_RESULT_MESSAGE,
  createPreviewFindEngine,
  injectHtmlPreviewFindAgent,
  isPreviewFindShortcut,
  type PreviewFindOptions,
} from './previewFind';

const plain: PreviewFindOptions = { matchCase: false, wholeWord: false, regex: false };

function marks(root: Element): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>('mark.awapi-find-match'));
}

describe('createPreviewFindEngine', () => {
  let root: HTMLDivElement;

  beforeEach(() => {
    document.body.innerHTML = '';
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  it('highlights every case-insensitive match and returns context snippets', () => {
    root.innerHTML = '<p>Foo bar foo</p><p>another FOO here</p>';
    const engine = createPreviewFindEngine(document);
    const result = engine.search(root, 'foo', plain);

    expect(result.matches).toHaveLength(3);
    expect(marks(root).map(m => m.textContent)).toEqual(['Foo', 'foo', 'FOO']);
    expect(result.matches[1]).toEqual({ before: 'Foo bar ', text: 'foo', after: '' });
    expect(result.matches[2]).toEqual({ before: 'another ', text: 'FOO', after: ' here' });
    expect(document.getElementById('awapi-find-style')).not.toBeNull();
  });

  it('matches across inline elements but not across block boundaries', () => {
    root.innerHTML = '<p>This is <strong>Awapi</strong></p><p>end</p>';
    const engine = createPreviewFindEngine(document);

    const result = engine.search(root, 'is Awapi', plain);
    expect(result.matches).toHaveLength(1);
    const found = marks(root);
    expect(found.map(m => m.textContent)).toEqual(['is ', 'Awapi']);
    expect(found.every(m => m.dataset.awapiFindIndex === '0')).toBe(true);

    expect(engine.search(root, 'Awapiend', plain).matches).toHaveLength(0);
  });

  it('honors match case, whole word and regex options', () => {
    root.innerHTML = '<p>cat Cat category</p>';
    const engine = createPreviewFindEngine(document);

    expect(engine.search(root, 'Cat', { ...plain, matchCase: true }).matches).toHaveLength(1);
    expect(engine.search(root, 'cat', { ...plain, wholeWord: true }).matches).toHaveLength(2);
    expect(engine.search(root, 'c.t', { ...plain, regex: true }).matches).toHaveLength(3);
    expect(engine.search(root, 'c.t', plain).matches).toHaveLength(0);
  });

  it('reports invalid regular expressions without highlighting', () => {
    root.innerHTML = '<p>text</p>';
    const result = createPreviewFindEngine(document).search(root, '(', { ...plain, regex: true });
    expect(result.matches).toHaveLength(0);
    expect(result.error).toBeTruthy();
    expect(marks(root)).toHaveLength(0);
  });

  it('skips scripts, styles and excluded subtrees', () => {
    root.innerHTML =
      '<p>needle</p><script>var needle;</script><style>.needle{}</style><div data-skip><p>needle</p></div>';
    const result = createPreviewFindEngine(document).search(root, 'needle', plain, '[data-skip]');
    expect(result.matches).toHaveLength(1);
  });

  it('marks the active match and scrolls it into view', () => {
    root.innerHTML = '<p>a b a</p>';
    const engine = createPreviewFindEngine(document);
    engine.search(root, 'a', plain);
    const [first, second] = marks(root);
    const scroll = vi.fn();
    second.scrollIntoView = scroll;

    engine.setActive(1, true);
    expect(second.classList.contains('awapi-find-active')).toBe(true);
    expect(first.classList.contains('awapi-find-active')).toBe(false);
    expect(scroll).toHaveBeenCalledWith({ block: 'center', inline: 'nearest' });

    engine.setActive(0, false);
    expect(first.classList.contains('awapi-find-active')).toBe(true);
    expect(second.classList.contains('awapi-find-active')).toBe(false);
  });

  it('restores the original DOM when cleared or searched again', () => {
    const html = '<p>one <em>two</em> one</p>';
    root.innerHTML = html;
    const engine = createPreviewFindEngine(document);
    engine.search(root, 'one two', plain);
    engine.search(root, 'one', plain);
    expect(marks(root)).toHaveLength(2);
    engine.clear();
    expect(root.innerHTML).toBe(html);
    expect(root.querySelector('p')!.childNodes).toHaveLength(3);
  });

  it('returns no matches for an empty query or missing root', () => {
    const engine = createPreviewFindEngine(document);
    expect(engine.search(root, '', plain).matches).toEqual([]);
    expect(engine.search(null, 'x', plain).matches).toEqual([]);
  });
});

describe('isPreviewFindShortcut', () => {
  const key = (k: string, mods: Partial<Record<'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey', boolean>> = {}) => ({
    key: k,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    shiftKey: false,
    ...mods,
  });

  it('recognizes find shortcuts only', () => {
    expect(isPreviewFindShortcut(key('f', { ctrlKey: true }))).toBe(true);
    expect(isPreviewFindShortcut(key('F', { metaKey: true, shiftKey: true }))).toBe(true);
    expect(isPreviewFindShortcut(key('g', { metaKey: true }))).toBe(true);
    expect(isPreviewFindShortcut(key('F3'))).toBe(true);
    expect(isPreviewFindShortcut(key('Escape'))).toBe(true);
    expect(isPreviewFindShortcut(key('f'))).toBe(false);
    expect(isPreviewFindShortcut(key('f', { ctrlKey: true, altKey: true }))).toBe(false);
  });
});

describe('injectHtmlPreviewFindAgent', () => {
  it('inserts the agent inside <head>, or first when there is no head/html/doctype', () => {
    const withHead = injectHtmlPreviewFindAgent('<html><head><title>x</title></head><body></body></html>');
    expect(withHead).toMatch(/^<html><head><script data-awapi-preview-find>/);
    expect(injectHtmlPreviewFindAgent('<p>hi</p>').startsWith('<script data-awapi-preview-find>')).toBe(true);
  });

  it('runs inside a document and answers search, activate, and key messages', async () => {
    const html = injectHtmlPreviewFindAgent('<p>hi</p>');
    const code = /<script data-awapi-preview-find>([\s\S]*)<\/script>/.exec(html)![1];
    expect(code).not.toContain('</script');
    document.body.innerHTML = '<p>alpha beta alpha</p>';
    new Function(code)();

    const replies: any[] = [];
    const onMessage = (e: MessageEvent) => replies.push(e.data);
    window.addEventListener('message', onMessage);
    const send = (data: unknown) =>
      window.dispatchEvent(new MessageEvent('message', { data, source: window }));

    send({ type: PREVIEW_FIND_COMMAND_MESSAGE, action: 'search', requestId: 7, query: 'alpha', options: plain });
    await vi.waitFor(() => expect(replies.some(r => r?.type === PREVIEW_FIND_RESULT_MESSAGE)).toBe(true));
    const reply = replies.find(r => r?.type === PREVIEW_FIND_RESULT_MESSAGE);
    expect(reply.requestId).toBe(7);
    expect(reply.result.matches).toHaveLength(2);
    expect(marks(document.body)).toHaveLength(2);

    send({ type: PREVIEW_FIND_COMMAND_MESSAGE, action: 'activate', index: 1, scroll: false });
    expect(marks(document.body)[1].classList.contains('awapi-find-active')).toBe(true);

    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'F3', bubbles: true }));
    await vi.waitFor(() => expect(replies.some(r => r?.type === PREVIEW_FIND_KEY_MESSAGE && r.key === 'F3')).toBe(true));

    send({ type: PREVIEW_FIND_COMMAND_MESSAGE, action: 'clear' });
    expect(marks(document.body)).toHaveLength(0);
    window.removeEventListener('message', onMessage);
  });
});
