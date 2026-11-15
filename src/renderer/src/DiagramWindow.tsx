import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Fullscreen, Maximize, Minimize, Scan, ZoomIn, ZoomOut } from 'lucide-react';
import type { DiagramWindowData } from '../../shared/diagram';
import { createPanZoom, whenImageSized, type PanZoomController } from './panZoom';
import { svgToDataUrl } from './mermaidRenderer';

/**
 * Stand-alone window showing one Mermaid diagram from a Markdown preview. It only
 * ever displays the SVG it receives as an inert `<img>`; Mermaid never runs here.
 * Mouse wheel zooms around the cursor, dragging pans, double-click fits.
 */
const DiagramWindow: React.FC = () => {
  const [data, setData] = useState<DiagramWindowData | null>(null);
  // Last successfully rendered SVG, kept on screen while the source has errors.
  const [svg, setSvg] = useState<string | null>(null);
  const [zoomPercent, setZoomPercent] = useState(100);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const controllerRef = useRef<PanZoomController | null>(null);

  useEffect(() => {
    const api = (window as any).electronAPI;
    let isMounted = true;
    const receive = (next: DiagramWindowData | null) => {
      if (!isMounted || !next) return;
      setData(next);
      if (next.svg) setSvg(next.svg);
    };
    Promise.resolve(api?.getDiagramPopoutData?.()).then(receive).catch(() => {});
    const unsubscribe = api?.onDiagramPopoutUpdate?.(receive);
    return () => {
      isMounted = false;
      if (typeof unsubscribe === 'function') unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (data?.title) document.title = data.title;
  }, [data?.title]);

  // (Re)attach pan & zoom whenever a new SVG is shown; a live update keeps the user's view.
  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const img = imgRef.current;
    if (!svg || !viewport || !img) return;
    let cancelled = false;
    void whenImageSized(img).then(size => {
      if (cancelled || !size) return;
      if (controllerRef.current) {
        controllerRef.current.setContentSize(size);
        return;
      }
      controllerRef.current = createPanZoom(viewport, img, size, {
        wheel: 'always',
        fitHeight: true,
        maxScale: 4,
        padding: 24,
        onChange: state => setZoomPercent(Math.round(state.scale * 100)),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [svg]);

  useEffect(
    () => () => {
      controllerRef.current?.destroy();
      controllerRef.current = null;
    },
    [],
  );

  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else void document.documentElement.requestFullscreen?.();
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.altKey) return;
      const controller = controllerRef.current;
      if (e.key === '+' || e.key === '=') controller?.zoomIn();
      else if (e.key === '-' || e.key === '_') controller?.zoomOut();
      else if (e.key === '0') controller?.reset();
      else if (e.key === '1' && !e.ctrlKey && !e.metaKey) controller?.setScale(1);
      else if ((e.key === 'f' || e.key === 'F') && !e.ctrlKey && !e.metaKey) toggleFullscreen();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [toggleFullscreen]);

  const isLight = data?.theme === 'light';
  const bg = isLight ? '#ffffff' : '#1e1e1e';
  const fg = isLight ? '#1f2328' : '#d4d4d4';
  const barBg = isLight ? '#f6f8fa' : '#252526';
  const border = isLight ? '#d0d7de' : '#3c3c3c';

  const buttonStyle: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
    minWidth: '30px',
    height: '28px',
    padding: '0 8px',
    border: `1px solid ${border}`,
    borderRadius: '5px',
    background: bg,
    color: fg,
    cursor: 'pointer',
    fontSize: '12px',
  };

  return (
    <div
      data-testid="diagram-window"
      style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: bg, color: fg }}
    >
      <style>{`
        [data-testid="diagram-viewport"] { cursor: grab; }
        [data-testid="diagram-viewport"].is-panning { cursor: grabbing; }
      `}</style>
      <div
        role="toolbar"
        aria-label="Diagram controls"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 10px',
          background: barBg,
          borderBottom: `1px solid ${border}`,
          flexShrink: 0,
        }}
      >
        <span
          data-testid="diagram-title"
          style={{ flex: 1, minWidth: 0, fontSize: '13px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
        >
          {data?.title ?? 'Diagram'}
        </span>
        <button type="button" style={buttonStyle} data-testid="diagram-zoom-out" aria-label="Zoom out" title="Zoom out (-)" onClick={() => controllerRef.current?.zoomOut()}>
          <ZoomOut size={15} />
        </button>
        <span data-testid="diagram-zoom-level" style={{ minWidth: '48px', textAlign: 'center', fontSize: '12px' }}>
          {zoomPercent}%
        </span>
        <button type="button" style={buttonStyle} data-testid="diagram-zoom-in" aria-label="Zoom in" title="Zoom in (+)" onClick={() => controllerRef.current?.zoomIn()}>
          <ZoomIn size={15} />
        </button>
        <button type="button" style={buttonStyle} data-testid="diagram-zoom-fit" aria-label="Fit to window" title="Fit to window (0)" onClick={() => controllerRef.current?.reset()}>
          <Scan size={15} />
        </button>
        <button type="button" style={buttonStyle} data-testid="diagram-zoom-actual" aria-label="Actual size" title="Actual size (1)" onClick={() => controllerRef.current?.setScale(1)}>
          <Fullscreen size={15} />
          <span>1:1</span>
        </button>
        <button
          type="button"
          style={buttonStyle}
          data-testid="diagram-fullscreen"
          aria-label={isFullscreen ? 'Exit full screen' : 'Full screen'}
          aria-pressed={isFullscreen}
          title={isFullscreen ? 'Exit full screen (F / Esc)' : 'Full screen (F)'}
          onClick={toggleFullscreen}
        >
          {isFullscreen ? <Minimize size={15} /> : <Maximize size={15} />}
        </button>
      </div>

      {data?.error && (
        <div
          role="alert"
          data-testid="diagram-error"
          style={{
            padding: '6px 12px',
            fontSize: '12px',
            whiteSpace: 'pre-wrap',
            color: isLight ? '#9a3412' : '#f0a070',
            background: barBg,
            borderBottom: `1px solid ${border}`,
            maxHeight: '30vh',
            overflow: 'auto',
            flexShrink: 0,
          }}
        >
          {svg ? 'The diagram has errors; showing the last valid version.\n' : ''}
          Mermaid error: {data.error}
        </div>
      )}

      <div
        ref={viewportRef}
        data-testid="diagram-viewport"
        style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden', touchAction: 'none' }}
      >
        {svg && (
          <img
            ref={imgRef}
            data-testid="diagram-image"
            src={svgToDataUrl(svg)}
            alt="Mermaid diagram"
            draggable={false}
            style={{ userSelect: 'none', opacity: data?.error ? 0.55 : 1 }}
          />
        )}
      </div>
    </div>
  );
};

export default DiagramWindow;
