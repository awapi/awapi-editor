import { usePreviewScrollRestore } from './usePreviewScrollRestore';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useTheme } from './theme/ThemeContext';
import {
  HTML_PREVIEW_LINK_MESSAGE,
  injectHtmlPreviewLinkHandler,
  isHtmlTab,
  isPreviewableTab,
  prepareHtmlForPreview,
  renderMarkdownToHtml,
  resolvePreviewLink,
} from './markdown';
import {
  applyMermaidResult,
  getCachedMermaidResult,
  getMermaidBlockSource,
  renderMermaidDiagram,
  type MermaidBlockHandle,
  type MermaidRenderResult,
} from './mermaidRenderer';
import type { PanZoomState } from './panZoom';
import type { DiagramRef } from '../../shared/diagram';
import {
  PREVIEW_FIND_COMMAND_MESSAGE,
  PREVIEW_FIND_KEY_MESSAGE,
  PREVIEW_FIND_RESULT_MESSAGE,
  createPreviewFindEngine,
  injectHtmlPreviewFindAgent,
  isPreviewFindShortcut,
  type PreviewFindCommand,
  type PreviewFindEngine,
  type PreviewFindOptions,
  type PreviewFindResult,
  type PreviewFindShortcut,
} from './previewFind';
import PreviewFindBar from './PreviewFindBar';

const EMPTY_FIND_RESULT: PreviewFindResult = { matches: [], truncated: false, error: null };

export interface MarkdownPreviewPayload {
  title: string;
  filePath: string | null;
  content: string;
  theme?: 'light' | 'dark';
  mode?: 'markdown' | 'html' | 'unsupported';
}

function fileBaseName(filePath: string): string {
  return filePath.split(/[\\/]/).pop() || filePath;
}

function isSameFilePath(a: string | null, b: string): boolean {
  if (!a) return false;
  const norm = (p: string) => p.replace(/\\/g, '/');
  return /^[a-zA-Z]:/.test(b) ? norm(a).toLowerCase() === norm(b).toLowerCase() : norm(a) === norm(b);
}

export interface MarkdownPreviewWindowProps {
  /**
   * Renders the preview inline inside the editor window ("Preview only" mode) instead of as
   * a popup: the content comes from `payload`, and popup-only features (pinning, document
   * title, menu Find) are disabled.
   */
  embedded?: boolean;
  /** Live content shown when embedded; ignored by the popup, which receives it over IPC. */
  payload?: MarkdownPreviewPayload;
  /** Embedded only: opens the find bar each time this number changes (e.g. from the Find menu). */
  findRequest?: number;
  /** Embedded only: identifies the tab so its scroll position is restored when re-activated. */
  scrollKey?: string;
}

const MarkdownPreviewWindow: React.FC<MarkdownPreviewWindowProps> = ({
  embedded = false,
  payload: embeddedPayload,
  findRequest,
  scrollKey,
}) => {
  const { currentTheme, colors } = useTheme();
  const [ipcPayload, setLivePayload] = useState<MarkdownPreviewPayload>({
    title: 'Markdown Preview',
    filePath: null,
    content: '',
  });
  const livePayload: MarkdownPreviewPayload =
    embedded && embeddedPayload ? embeddedPayload : ipcPayload;
  // Files reached by clicking links; the last entry is shown instead of the live tab content.
  const [navStack, setNavStack] = useState<MarkdownPreviewPayload[]>([]);
  const [navError, setNavError] = useState<string | null>(null);
  const [alwaysOnTop, setAlwaysOnTop] = useState<boolean>(false);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const contentRef = useRef<HTMLDivElement | null>(null);
  // Last result shown per diagram position, kept on screen while an edited diagram re-renders.
  const lastMermaidResults = useRef<Array<MermaidRenderResult | undefined>>([]);
  // User-adjusted zoom/pan per diagram position, restored after live re-renders.
  const inlineDiagramViews = useRef<Array<PanZoomState | null | undefined>>([]);
  const openDiagramPopouts = useRef<DiagramRef[]>([]);
  // Scroll offset of each history level (0 = live tab) so Back restores position.
  const scrollPositions = useRef<number[]>([]);
  const pendingScroll = useRef<{ top: number; fragment?: string | null } | null>(null);

  const topEntry = navStack.length > 0 ? navStack[navStack.length - 1] : null;
  const payload: MarkdownPreviewPayload = topEntry
    ? { ...topEntry, theme: livePayload.theme }
    : livePayload;
  const isNavigated = topEntry !== null;
  usePreviewScrollRestore(embedded ? scrollKey : undefined, bodyRef, !isNavigated);

  useEffect(() => {
    if (embedded) return;
    const w = window as any;
    let isMounted = true;

    if (w.electronAPI?.getMarkdownPreviewData) {
      Promise.resolve(w.electronAPI.getMarkdownPreviewData())
        .then((initial: MarkdownPreviewPayload | null) => {
          if (isMounted && initial) {
            setLivePayload(initial);
          }
        })
        .catch(() => {});
    }

    const unsubscribe = w.electronAPI?.onMarkdownPreviewUpdate?.(
      (next: MarkdownPreviewPayload) => {
        if (next) {
          setLivePayload(next);
        }
      },
    );

    if (w.electronAPI?.getAlwaysOnTop) {
      Promise.resolve(w.electronAPI.getAlwaysOnTop())
        .then((flag: boolean) => {
          if (isMounted) setAlwaysOnTop(Boolean(flag));
        })
        .catch(() => {});
    }

    w.electronAPI?.onAlwaysOnTopChanged?.((flag: boolean) => {
      if (isMounted) setAlwaysOnTop(Boolean(flag));
    });

    return () => {
      isMounted = false;
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [embedded]);

  useEffect(() => {
    if (!embedded && typeof document !== 'undefined') {
      document.title = payload.title ? `Preview — ${payload.title}` : 'Markdown Preview';
    }
  }, [embedded, payload.title]);

  const effectiveMode: 'light' | 'dark' =
    payload.theme ?? (currentTheme === 'light' ? 'light' : 'dark');

  const isLight = effectiveMode === 'light';
  const pageBg = isLight ? '#ffffff' : colors.background;
  const pageFg = isLight ? '#1f2328' : colors.foreground;
  const headerBg = isLight ? '#f6f8fa' : colors.tabBackground;
  const borderColor = isLight ? '#d0d7de' : colors.tabHover;
  const codeBg = isLight ? '#f6f8fa' : '#252526';
  const mutedFg = isLight ? '#59636e' : '#9da5b4';
  const linkColor = isLight ? '#0969da' : '#4daafc';

  const isUnsupported = payload.mode === 'unsupported';

  const isHtml = useMemo(
    () => !isUnsupported && (payload.mode === 'html' || isHtmlTab(payload.filePath ?? payload.title)),
    [isUnsupported, payload.mode, payload.filePath, payload.title],
  );

  const renderedHtml = useMemo(
    () =>
      isUnsupported
        ? ''
        : isHtml
          ? injectHtmlPreviewFindAgent(
              injectHtmlPreviewLinkHandler(
                prepareHtmlForPreview(payload.content, { baseFilePath: payload.filePath }),
              ),
            )
          : renderMarkdownToHtml(payload.content, { baseFilePath: payload.filePath }),
    [isUnsupported, isHtml, payload.content, payload.filePath],
  );

  // Diagram pop-outs are tied to the document being shown and the diagram's position in it.
  const diagramDocKey = payload.filePath ?? `untitled:${payload.title}`;
  const diagramContext = useRef({ docKey: diagramDocKey, title: payload.title, theme: effectiveMode });
  diagramContext.current = { docKey: diagramDocKey, title: payload.title, theme: effectiveMode };

  useEffect(() => {
    const api = (window as any).electronAPI;
    let isMounted = true;
    Promise.resolve(api?.getOpenDiagramPopouts?.())
      .then((refs: DiagramRef[] | undefined) => {
        if (isMounted && Array.isArray(refs)) openDiagramPopouts.current = refs;
      })
      .catch(() => {});
    const unsubscribe = api?.onDiagramPopoutsChanged?.((refs: DiagramRef[]) => {
      openDiagramPopouts.current = Array.isArray(refs) ? refs : [];
    });
    return () => {
      isMounted = false;
      if (typeof unsubscribe === 'function') unsubscribe();
      // An inline preview unmounts when its editor window switches tabs or leaves "Preview only";
      // its diagrams are gone, so close their pop-outs rather than leave them stale.
      if (embedded && openDiagramPopouts.current.length > 0) {
        const { docKey, theme } = diagramContext.current;
        void api?.syncDiagramPopouts?.({ docKey, count: 0, theme, updates: [] });
      }
    };
  }, [embedded]);

  /** Pushes re-rendered diagrams to open pop-outs; the main process closes ones whose diagram is gone. */
  const syncDiagramPopouts = useCallback(
    (count: number, results: Array<{ index: number; result: MermaidRenderResult }>, onlyIfRelevant = false) => {
      const refs = openDiagramPopouts.current;
      if (refs.length === 0) return;
      const { docKey, theme } = diagramContext.current;
      const relevant = new Set(refs.filter(r => r.docKey === docKey).map(r => r.index));
      const updates = results
        .filter(({ index, result }) => relevant.has(index) && (result.ok || !result.retryable))
        .map(({ index, result }) =>
          result.ok
            ? { index, svg: result.svg, error: null }
            : { index, svg: null, error: result.error },
        );
      if (onlyIfRelevant && updates.length === 0) return;
      void (window as any).electronAPI?.syncDiagramPopouts?.({ docKey, count, theme, updates });
    },
    [],
  );

  const openDiagramPopout = useCallback((index: number) => {
    const result = lastMermaidResults.current[index];
    if (!result?.ok) return;
    const { docKey, title, theme } = diagramContext.current;
    void (window as any).electronAPI?.openDiagramPopout?.({
      docKey,
      index,
      title,
      theme,
      svg: result.svg,
      error: null,
    });
  }, []);

  // Replace ```mermaid blocks with diagrams rendered in an isolated sandbox. Runs as a
  // layout effect so cached diagrams are swapped in before paint (no flash of source).
  useLayoutEffect(() => {
    const container = contentRef.current;
    const blocks = container
      ? Array.from(container.querySelectorAll<HTMLElement>('[data-mermaid-block]'))
      : [];
    lastMermaidResults.current.length = blocks.length;
    inlineDiagramViews.current.length = blocks.length;

    let cancelled = false;
    const handles: MermaidBlockHandle[] = [];
    const show = (block: HTMLElement, index: number, result: MermaidRenderResult | null) => {
      handles.push(
        applyMermaidResult(
          block,
          result,
          result?.ok
            ? {
                onPopout: () => openDiagramPopout(index),
                initialView: inlineDiagramViews.current[index] ?? null,
                onViewChange: view => {
                  inlineDiagramViews.current[index] = view;
                },
              }
            : {},
        ),
      );
    };

    const ready: Array<{ index: number; result: MermaidRenderResult }> = [];
    blocks.forEach((block, index) => {
      const source = getMermaidBlockSource(block);
      const cached = getCachedMermaidResult(source, effectiveMode);
      if (cached) {
        lastMermaidResults.current[index] = cached;
        show(block, index, cached);
        ready.push({ index, result: cached });
        return;
      }
      show(block, index, lastMermaidResults.current[index] ?? null);
      void renderMermaidDiagram(source, effectiveMode).then(result => {
        if (cancelled || !block.isConnected) return;
        lastMermaidResults.current[index] = result;
        show(block, index, result);
        syncDiagramPopouts(blocks.length, [{ index, result }], true);
      });
    });
    syncDiagramPopouts(blocks.length, ready);

    return () => {
      cancelled = true;
      handles.forEach(handle => handle.destroy());
    };
  }, [renderedHtml, effectiveMode, diagramDocKey, openDiagramPopout, syncDiagramPopouts]);

  // ---- Find in preview -------------------------------------------------------
  const [findOpen, setFindOpen] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [findOptions, setFindOptions] = useState<PreviewFindOptions>({
    matchCase: false,
    wholeWord: false,
    regex: false,
  });
  const [findResult, setFindResult] = useState<PreviewFindResult>(EMPTY_FIND_RESULT);
  const [activeMatch, setActiveMatch] = useState(-1);
  const [showAllMatches, setShowAllMatches] = useState(false);
  const [findFocusRequest, setFindFocusRequest] = useState(0);
  const findEngineRef = useRef<PreviewFindEngine | null>(null);
  const activeMatchRef = useRef(-1);
  const matchCountRef = useRef(0);
  const findRequestId = useRef(0);
  const pendingHtmlFind = useRef<{ requestId: number; reset: boolean; scroll: boolean } | null>(null);
  const lastFindKey = useRef('');

  const postToHtmlPreview = (command: PreviewFindCommand) => {
    iframeRef.current?.contentWindow?.postMessage(command, '*');
  };

  const activateMatch = (index: number, scroll: boolean) => {
    activeMatchRef.current = index;
    setActiveMatch(index);
    if (isHtml) {
      postToHtmlPreview({ type: PREVIEW_FIND_COMMAND_MESSAGE, action: 'activate', index, scroll });
    } else {
      findEngineRef.current?.setActive(index, scroll);
    }
  };

  const applyFindResult = (result: PreviewFindResult, reset: boolean, scroll: boolean) => {
    const count = result.matches.length;
    const previous = activeMatchRef.current;
    const index = count === 0 ? -1 : reset || previous < 0 ? 0 : Math.min(previous, count - 1);
    matchCountRef.current = count;
    setFindResult(result);
    activateMatch(index, scroll);
  };

  /** Re-runs the search; `reset` jumps back to the first match (new query or options). */
  const runFind = (reset: boolean, scroll: boolean) => {
    findEngineRef.current ??= createPreviewFindEngine(document);
    if (!findOpen || !findQuery || isUnsupported) {
      findEngineRef.current.clear();
      postToHtmlPreview({ type: PREVIEW_FIND_COMMAND_MESSAGE, action: 'clear' });
      pendingHtmlFind.current = null;
      applyFindResult(EMPTY_FIND_RESULT, true, false);
      return;
    }
    if (isHtml) {
      findEngineRef.current.clear();
      const requestId = ++findRequestId.current;
      pendingHtmlFind.current = { requestId, reset, scroll };
      postToHtmlPreview({
        type: PREVIEW_FIND_COMMAND_MESSAGE,
        action: 'search',
        requestId,
        query: findQuery,
        options: findOptions,
      });
      return;
    }
    const result = findEngineRef.current.search(
      contentRef.current,
      findQuery,
      findOptions,
      '[data-mermaid-block]',
    );
    applyFindResult(result, reset, scroll);
  };
  const runFindRef = useRef(runFind);
  runFindRef.current = runFind;
  const applyFindResultRef = useRef(applyFindResult);
  applyFindResultRef.current = applyFindResult;

  // Re-search when the query/options change, and after every Markdown re-render
  // (HTML previews are re-searched from the iframe's load event instead).
  useLayoutEffect(() => {
    const key = JSON.stringify([findOpen, findQuery, findOptions]);
    const queryChanged = key !== lastFindKey.current;
    lastFindKey.current = key;
    if (!queryChanged && isHtml) return;
    runFindRef.current(queryChanged, queryChanged);
  }, [findOpen, findQuery, findOptions, renderedHtml, isHtml, isUnsupported]);

  const openFind = () => {
    const active = document.activeElement;
    const isFindInput = active instanceof HTMLElement && active.dataset.testid === 'preview-find-input';
    const selected = isFindInput ? '' : (window.getSelection?.()?.toString() ?? '');
    if (selected && selected.length <= 200 && !/[\r\n]/.test(selected)) setFindQuery(selected);
    setFindOpen(true);
    setFindFocusRequest(n => n + 1);
  };

  const closeFind = () => {
    setFindOpen(false);
    setShowAllMatches(false);
  };

  const stepMatch = (delta: number) => {
    const count = matchCountRef.current;
    if (count === 0) return;
    const current = activeMatchRef.current < 0 ? (delta > 0 ? -1 : 0) : activeMatchRef.current;
    activateMatch((((current + delta) % count) + count) % count, true);
  };

  /** Handles find shortcuts from this window or forwarded by the HTML iframe; returns true when consumed. */
  const handleFindShortcut = (e: PreviewFindShortcut): boolean => {
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (mod && !e.altKey && key === 'f') {
      openFind();
      return true;
    }
    if ((mod && !e.altKey && key === 'g') || e.key === 'F3') {
      if (!findOpen) openFind();
      else stepMatch(e.shiftKey ? -1 : 1);
      return true;
    }
    if (e.key === 'Escape' && findOpen) {
      if (showAllMatches) setShowAllMatches(false);
      else closeFind();
      return true;
    }
    return false;
  };
  const handleFindShortcutRef = useRef(handleFindShortcut);
  handleFindShortcutRef.current = handleFindShortcut;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isPreviewFindShortcut(e) && handleFindShortcutRef.current(e)) e.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    // Embedded previews get menu Find via `findRequest`; the host window owns onFind.
    const unsubscribe = embedded
      ? undefined
      : (window as any).electronAPI?.onFind?.(() =>
          handleFindShortcutRef.current({ key: 'f', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false }),
        );
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, [embedded]);

  const lastFindRequest = useRef(findRequest);
  useEffect(() => {
    if (findRequest === lastFindRequest.current) return;
    lastFindRequest.current = findRequest;
    handleFindShortcutRef.current({ key: 'f', ctrlKey: true, metaKey: false, altKey: false, shiftKey: false });
  }, [findRequest]);

  const scrollToFragment = useCallback((id: string) => {
    const el =
      document.getElementById(id) ??
      document.getElementById(id.toLowerCase()) ??
      document.getElementsByName(id)[0];
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  // Apply scroll changes queued by navigation once the new document has rendered.
  useLayoutEffect(() => {
    const pending = pendingScroll.current;
    if (!pending) return;
    pendingScroll.current = null;
    if (bodyRef.current) bodyRef.current.scrollTop = pending.top;
    if (pending.fragment) scrollToFragment(pending.fragment);
  }, [navStack, scrollToFragment]);

  const openFileFromLink = async (filePath: string, fragment: string | null) => {
    const api = (window as any).electronAPI;
    if (isSameFilePath(payload.filePath, filePath)) {
      if (fragment) scrollToFragment(fragment);
      return;
    }

    if (!isPreviewableTab(filePath)) {
      const opened = await api?.openPreviewLinkInEditor?.(filePath);
      setNavError(opened ? null : `Could not open ${filePath}`);
      return;
    }

    let file: { filePath: string; content: string } | null = null;
    try {
      file = (await api?.readFile?.(filePath)) ?? null;
    } catch {
      file = null;
    }
    if (!file) {
      setNavError(`Could not open ${filePath}`);
      return;
    }

    scrollPositions.current[navStack.length] = bodyRef.current?.scrollTop ?? 0;
    pendingScroll.current = { top: 0, fragment };
    setNavError(null);
    setNavStack(prev => [
      ...prev,
      {
        title: fileBaseName(file!.filePath),
        filePath: file!.filePath,
        content: file!.content,
        mode: isHtmlTab(file!.filePath) ? 'html' : 'markdown',
      },
    ]);
  };

  const followLink = (href: string) => {
    const target = resolvePreviewLink(href, payload.filePath);
    if (!target) return;
    if (target.kind === 'anchor') {
      scrollToFragment(target.id);
    } else if (target.kind === 'external') {
      // Denied by the preview window's open handler and routed to the OS browser / mail client.
      window.open(target.url, '_blank');
    } else {
      void openFileFromLink(target.path, target.fragment);
    }
  };

  const followLinkRef = useRef(followLink);
  followLinkRef.current = followLink;

  const goBack = useCallback(() => {
    setNavStack(prev => {
      if (prev.length === 0) return prev;
      pendingScroll.current = { top: scrollPositions.current[prev.length - 1] ?? 0 };
      return prev.slice(0, -1);
    });
    setNavError(null);
  }, []);

  // Link clicks forwarded from the sandboxed HTML preview iframe.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      const frameWindow = iframeRef.current?.contentWindow;
      if (!frameWindow || event.source !== frameWindow) return;
      const data = event.data as { type?: unknown; href?: unknown } | null;
      if (data?.type === PREVIEW_FIND_RESULT_MESSAGE) {
        const { requestId, result } = data as { requestId?: unknown; result?: PreviewFindResult };
        const pending = pendingHtmlFind.current;
        if (!pending || pending.requestId !== requestId || !result || !Array.isArray(result.matches)) return;
        pendingHtmlFind.current = null;
        applyFindResultRef.current(result, pending.reset, pending.scroll);
        return;
      }
      if (data?.type === PREVIEW_FIND_KEY_MESSAGE) {
        const key = data as Partial<PreviewFindShortcut>;
        if (typeof key.key !== 'string') return;
        handleFindShortcutRef.current({
          key: key.key,
          shiftKey: !!key.shiftKey,
          altKey: !!key.altKey,
          ctrlKey: !!key.ctrlKey,
          metaKey: !!key.metaKey,
        });
        return;
      }
      if (data?.type !== HTML_PREVIEW_LINK_MESSAGE || typeof data.href !== 'string') return;
      followLinkRef.current(data.href);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  // Alt+Left / mouse "back" button return to the previous document.
  useEffect(() => {
    if (!isNavigated) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault();
        goBack();
      }
    };
    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 3) {
        e.preventDefault();
        goBack();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isNavigated, goBack]);

  const handleToggleAlwaysOnTop = async () => {
    const w = window as any;
    if (w.electronAPI?.toggleAlwaysOnTop) {
      try {
        const next = await w.electronAPI.toggleAlwaysOnTop();
        setAlwaysOnTop(Boolean(next));
        return;
      } catch {
        // Fall through
      }
    }
    setAlwaysOnTop(prev => !prev);
  };

  const handleContentClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement | null;
    const anchor = target?.closest?.('a') as HTMLAnchorElement | null;
    if (!anchor) return;
    const href = anchor.getAttribute('href');
    if (!href) return;

    // Never let the preview BrowserWindow itself navigate away
    e.preventDefault();
    followLink(href);
  };

  const cssText = `
    .awapi-md-preview {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif;
      font-size: 15px;
      line-height: 1.65;
      color: ${pageFg};
      word-wrap: break-word;
    }
    .awapi-md-preview > *:first-child {
      margin-top: 0 !important;
    }
    .awapi-md-preview h1,
    .awapi-md-preview h2,
    .awapi-md-preview h3,
    .awapi-md-preview h4,
    .awapi-md-preview h5,
    .awapi-md-preview h6 {
      margin-top: 24px;
      margin-bottom: 12px;
      font-weight: 600;
      line-height: 1.25;
    }
    .awapi-md-preview h1 {
      font-size: 1.85em;
      padding-bottom: 0.3em;
      border-bottom: 1px solid ${borderColor};
    }
    .awapi-md-preview h2 {
      font-size: 1.45em;
      padding-bottom: 0.3em;
      border-bottom: 1px solid ${borderColor};
    }
    .awapi-md-preview h3 { font-size: 1.2em; }
    .awapi-md-preview h4 { font-size: 1.05em; }
    .awapi-md-preview h5 { font-size: 0.95em; }
    .awapi-md-preview h6 { font-size: 0.9em; color: ${mutedFg}; }
    .awapi-md-preview p,
    .awapi-md-preview ul,
    .awapi-md-preview ol,
    .awapi-md-preview blockquote,
    .awapi-md-preview table,
    .awapi-md-preview pre {
      margin-top: 0;
      margin-bottom: 16px;
    }
    .awapi-md-preview ul,
    .awapi-md-preview ol {
      padding-left: 2em;
    }
    .awapi-md-preview ul.contains-task-list {
      list-style: none;
      padding-left: 0.5em;
    }
    .awapi-md-preview li + li {
      margin-top: 4px;
    }
    .awapi-md-preview li.task-list-item input[type="checkbox"] {
      margin-right: 6px;
      vertical-align: middle;
    }
    .awapi-md-preview code {
      font-family: ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, "Liberation Mono", monospace;
      font-size: 85%;
      background-color: ${codeBg};
      border: 1px solid ${borderColor};
      padding: 0.15em 0.4em;
      border-radius: 4px;
    }
    .awapi-md-preview pre {
      background-color: ${codeBg};
      border: 1px solid ${borderColor};
      border-radius: 6px;
      padding: 14px 16px;
      overflow-x: auto;
      line-height: 1.5;
    }
    .awapi-md-preview pre code {
      background: transparent;
      border: none;
      padding: 0;
      font-size: 85%;
    }
    .awapi-md-preview blockquote {
      margin-left: 0;
      padding: 0 1em;
      color: ${mutedFg};
      border-left: 4px solid ${borderColor};
    }
    .awapi-md-preview hr {
      border: 0;
      border-top: 1px solid ${borderColor};
      margin: 24px 0;
    }
    .awapi-md-preview table {
      border-collapse: collapse;
      width: 100%;
      overflow: auto;
    }
    .awapi-md-preview table th,
    .awapi-md-preview table td {
      padding: 6px 13px;
      border: 1px solid ${borderColor};
    }
    .awapi-md-preview table th {
      font-weight: 600;
      background-color: ${codeBg};
    }
    .awapi-md-preview a {
      color: ${linkColor};
      text-decoration: none;
    }
    .awapi-md-preview a:hover {
      text-decoration: underline;
    }
    .awapi-md-preview img {
      max-width: 100%;
      height: auto;
      border-radius: 4px;
    }
    .awapi-md-preview .awapi-mermaid {
      margin: 16px 0;
    }
    .awapi-md-preview .awapi-mermaid-output {
      position: relative;
      text-align: center;
    }
    .awapi-md-preview .awapi-mermaid-viewport {
      position: relative;
      overflow: hidden;
      cursor: grab;
      touch-action: none;
      user-select: none;
    }
    .awapi-md-preview .awapi-mermaid-viewport.is-panning {
      cursor: grabbing;
    }
    .awapi-md-preview .awapi-mermaid-output img {
      border-radius: 0;
    }
    .awapi-md-preview .awapi-mermaid-toolbar {
      position: absolute;
      top: 6px;
      right: 6px;
      display: flex;
      gap: 4px;
      padding: 3px;
      border-radius: 6px;
      border: 1px solid ${borderColor};
      background-color: ${codeBg};
      opacity: 0;
      transition: opacity 0.12s ease-in-out;
    }
    .awapi-md-preview .awapi-mermaid-output:hover .awapi-mermaid-toolbar,
    .awapi-md-preview .awapi-mermaid-toolbar:focus-within {
      opacity: 1;
    }
    .awapi-md-preview .awapi-mermaid-tool {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 26px;
      height: 26px;
      padding: 0;
      border: none;
      border-radius: 4px;
      background: transparent;
      color: ${pageFg};
      cursor: pointer;
    }
    .awapi-md-preview .awapi-mermaid-tool:hover {
      background-color: ${borderColor};
    }
    .awapi-md-preview .awapi-mermaid-output[role='alert'] {
      text-align: left;
      margin-top: 8px;
      font-size: 13px;
      color: ${isLight ? '#9a3412' : '#f0a070'};
      white-space: pre-wrap;
    }
  `;

  return (
    <div
      data-testid={embedded ? 'inline-markdown-preview' : 'markdown-preview-window'}
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: embedded ? '100%' : '100vh',
        backgroundColor: pageBg,
        color: pageFg,
      }}
    >
      <style>{cssText}</style>

      {/* Header bar */}
      <div
        data-testid="markdown-preview-header"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '6px 14px',
          backgroundColor: headerBg,
          borderBottom: `1px solid ${borderColor}`,
          flexShrink: 0,
          fontSize: '13px',
          userSelect: 'none',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', minWidth: 0, overflow: 'hidden' }}>
          {isNavigated && (
            <button
              data-testid="markdown-preview-back"
              aria-label="Back"
              title="Back (Alt+Left)"
              onClick={goBack}
              style={{
                width: '28px',
                height: '24px',
                marginRight: '8px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 0,
                cursor: 'pointer',
                borderRadius: '4px',
                border: `1px solid ${borderColor}`,
                backgroundColor: 'transparent',
                color: pageFg,
                flexShrink: 0,
              }}
            >
              <svg
                width="14"
                height="14"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                focusable="false"
              >
                <path d="M13 8H3M7 4L3 8l4 4" />
              </svg>
            </button>
          )}
          <span
            data-testid="markdown-preview-title"
            style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
          >
            {payload.title}
          </span>
          <span
            data-testid="markdown-preview-badge"
            style={{
              marginLeft: '8px',
              padding: '1px 6px',
              fontSize: '10px',
              fontWeight: 600,
              borderRadius: '3px',
              border: `1px solid ${borderColor}`,
              opacity: 0.75,
              textTransform: 'uppercase',
              letterSpacing: '0.04em',
              flexShrink: 0,
            }}
          >
            {isUnsupported ? 'N/A' : isNavigated ? 'Linked File' : 'Live Preview'}
          </span>
          {payload.filePath && (
            <span
              data-testid="markdown-preview-filepath"
              title={payload.filePath}
              style={{
                marginLeft: '10px',
                opacity: 0.55,
                fontSize: '11px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {payload.filePath}
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
        <button
          data-testid="markdown-preview-find-toggle"
          aria-label="Find in Preview"
          aria-pressed={findOpen}
          onClick={() => (findOpen ? closeFind() : openFind())}
          title="Find in Preview (Cmd/Ctrl+F)"
          style={{
            width: '28px',
            height: '24px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            cursor: 'pointer',
            borderRadius: '4px',
            border: `1px solid ${borderColor}`,
            backgroundColor: findOpen ? colors.tabActiveBackground : 'transparent',
            color: pageFg,
            opacity: findOpen ? 1 : 0.65,
            flexShrink: 0,
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            aria-hidden="true"
            focusable="false"
          >
            <circle cx="7" cy="7" r="4.5" />
            <line x1="10.5" y1="10.5" x2="14" y2="14" />
          </svg>
        </button>
        {!embedded && (
        <button
          data-testid="markdown-preview-pin-toggle"
          aria-label={alwaysOnTop ? 'Unpin Preview Window' : 'Pin Preview Window Always on Top'}
          aria-pressed={alwaysOnTop}
          onClick={handleToggleAlwaysOnTop}
          title={alwaysOnTop ? 'Unpin Window (Always on Top active)' : 'Pin Window Always on Top'}
          style={{
            width: '28px',
            height: '24px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            cursor: 'pointer',
            borderRadius: '4px',
            border: `1px solid ${borderColor}`,
            backgroundColor: alwaysOnTop ? colors.tabActiveBackground : 'transparent',
            color: pageFg,
            opacity: alwaysOnTop ? 1 : 0.65,
            flexShrink: 0,
          }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M5 2.5h6l-1 4 2 2v1H4v-1l2-2-1-4z" />
            <line x1="8" y1="9.5" x2="8" y2="14" />
          </svg>
        </button>
        )}
        </div>
      </div>

      {findOpen && (
        <PreviewFindBar
          query={findQuery}
          options={findOptions}
          matches={findResult.matches}
          activeIndex={activeMatch}
          truncated={findResult.truncated}
          error={findResult.error}
          showAll={showAllMatches}
          focusRequest={findFocusRequest}
          colors={{
            background: headerBg,
            foreground: pageFg,
            border: borderColor,
            muted: mutedFg,
            inputBackground: pageBg,
            activeToggle: isLight ? '#dbe9ff' : colors.tabActiveBackground,
            error: isLight ? '#9a3412' : '#f0a070',
          }}
          onQueryChange={setFindQuery}
          onToggleOption={option => setFindOptions(prev => ({ ...prev, [option]: !prev[option] }))}
          onNext={() => stepMatch(1)}
          onPrevious={() => stepMatch(-1)}
          onToggleShowAll={() => setShowAllMatches(prev => !prev)}
          onSelectMatch={index => activateMatch(index, true)}
          onClose={closeFind}
        />
      )}

      {navError && (
        <div
          data-testid="markdown-preview-nav-error"
          role="alert"
          style={{
            padding: '6px 14px',
            fontSize: '12px',
            color: isLight ? '#9a3412' : '#f0a070',
            backgroundColor: codeBg,
            borderBottom: `1px solid ${borderColor}`,
            flexShrink: 0,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
          title={navError}
        >
          {navError}
        </div>
      )}

      {/* Scrollable rendered Markdown or sandboxed HTML body */}
      <div
        ref={bodyRef}
        data-testid="markdown-preview-body"
        style={{
          flex: 1,
          minHeight: 0,
          display:
            isUnsupported || (isHtml && payload.content.trim().length > 0) ? 'flex' : 'block',
          flexDirection: 'column',
          overflowY: isHtml && payload.content.trim().length > 0 ? 'hidden' : 'auto',
          padding: isHtml && payload.content.trim().length > 0 ? 0 : '24px 36px',
        }}
      >
        {isUnsupported ? (
          <div
            data-testid="markdown-preview-unsupported"
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              padding: '32px 24px',
              color: mutedFg,
            }}
          >
            <div
              style={{
                maxWidth: '420px',
                padding: '28px 32px',
                borderRadius: '10px',
                border: `1px solid ${borderColor}`,
                backgroundColor: codeBg,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
                style={{ opacity: 0.75 }}
              >
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
              <div
                style={{
                  fontSize: '15px',
                  fontWeight: 600,
                  color: pageFg,
                }}
              >
                N/A — Preview Not Supported
              </div>
              <div style={{ fontSize: '13px', lineHeight: 1.55 }}>
                <strong style={{ color: pageFg }}>{payload.title}</strong> does not support Live Preview.
              </div>
              <div style={{ fontSize: '12px', opacity: 0.85, lineHeight: 1.5 }}>
                Live Preview is available for <strong>Markdown</strong> (<code>.md</code>,{' '}
                <code>.markdown</code>) and <strong>HTML</strong> (<code>.html</code>,{' '}
                <code>.htm</code>) files.
              </div>
            </div>
          </div>
        ) : payload.content.trim().length === 0 ? (
          <div
            data-testid="markdown-preview-empty"
            style={{ color: mutedFg, fontStyle: 'italic', fontSize: '14px' }}
          >
            {isHtml
              ? 'Nothing to preview yet. Start typing HTML in the editor…'
              : 'Nothing to preview yet. Start typing Markdown in the editor…'}
          </div>
        ) : isHtml ? (
          <iframe
            ref={iframeRef}
            data-testid="html-preview-iframe"
            title={payload.title ? `HTML Preview — ${payload.title}` : 'HTML Preview'}
            sandbox="allow-scripts"
            srcDoc={renderedHtml}
            onLoad={() => {
              if (findOpen) runFindRef.current(false, false);
            }}
            style={{
              flex: 1,
              width: '100%',
              height: '100%',
              border: 'none',
              backgroundColor: '#ffffff',
            }}
          />
        ) : (
          <div
            ref={contentRef}
            data-testid="markdown-preview-content"
            className="awapi-md-preview"
            onClick={handleContentClick}
            dangerouslySetInnerHTML={{ __html: renderedHtml }}
          />
        )}
      </div>
    </div>
  );
};

export default MarkdownPreviewWindow;
