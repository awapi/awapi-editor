import React, { useEffect, useMemo, useState } from 'react';
import { useTheme } from './theme/ThemeContext';
import { renderMarkdownToHtml } from './markdown';

export interface MarkdownPreviewPayload {
  title: string;
  filePath: string | null;
  content: string;
  theme?: 'light' | 'dark';
}

const MarkdownPreviewWindow: React.FC = () => {
  const { currentTheme, colors } = useTheme();
  const [payload, setPayload] = useState<MarkdownPreviewPayload>({
    title: 'Markdown Preview',
    filePath: null,
    content: '',
  });
  const [alwaysOnTop, setAlwaysOnTop] = useState<boolean>(false);

  useEffect(() => {
    const w = window as any;
    let isMounted = true;

    if (w.electronAPI?.getMarkdownPreviewData) {
      Promise.resolve(w.electronAPI.getMarkdownPreviewData())
        .then((initial: MarkdownPreviewPayload | null) => {
          if (isMounted && initial) {
            setPayload(initial);
          }
        })
        .catch(() => {});
    }

    const unsubscribe = w.electronAPI?.onMarkdownPreviewUpdate?.(
      (next: MarkdownPreviewPayload) => {
        if (next) {
          setPayload(next);
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
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.title = payload.title ? `Preview — ${payload.title}` : 'Markdown Preview';
    }
  }, [payload.title]);

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

  const renderedHtml = useMemo(
    () => renderMarkdownToHtml(payload.content, { baseFilePath: payload.filePath }),
    [payload.content, payload.filePath],
  );

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

    // In-page heading anchor (#section-name)
    if (href.startsWith('#')) {
      e.preventDefault();
      const id = href.slice(1);
      if (!id) return;
      const heading = document.getElementById(id);
      if (heading && typeof heading.scrollIntoView === 'function') {
        heading.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      return;
    }

    // Prevent the preview BrowserWindow from navigating away
    e.preventDefault();
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
  `;

  return (
    <div
      data-testid="markdown-preview-window"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
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
          <span
            data-testid="markdown-preview-title"
            style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
          >
            {payload.title}
          </span>
          <span
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
            Live Preview
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
      </div>

      {/* Scrollable rendered Markdown body */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          padding: '24px 36px',
        }}
      >
        {payload.content.trim().length === 0 ? (
          <div
            data-testid="markdown-preview-empty"
            style={{ color: mutedFg, fontStyle: 'italic', fontSize: '14px' }}
          >
            Nothing to preview yet. Start typing Markdown in the editor…
          </div>
        ) : (
          <div
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
