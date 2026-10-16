import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  formatByteSize,
  getImageFormatLabel,
  isSvgPath,
  toAssetUrl,
  toSvgDataUrl,
} from '../../shared/images';
import type { ThemeColors } from './theme/ThemeContext';

export const IMAGE_ZOOM_STEPS: readonly number[] = [
  10, 25, 50, 75, 100, 125, 150, 200, 300, 400, 600, 800,
];

export type ImageBackdropMode = 'checkerboard' | 'light' | 'dark';

export interface ImageViewerMetadata {
  width: number | null;
  height: number | null;
  zoomPercent: number;
  isFit: boolean;
}

export interface ImageViewerProps {
  filePath: string | null;
  title: string;
  /** Raw SVG XML text when viewing an `.svg` tab (renders live edits even before saving). */
  svgContent?: string;
  /** File size in bytes when known from disk. */
  byteSize?: number;
  /** Incremented when the file changes on disk so the asset URL busts cache. */
  reloadToken?: number;
  /** Provided for `.svg` tabs to switch to the Monaco XML editor. */
  onSwitchToCodeView?: () => void;
  /** Reports image dimensions and zoom state to the parent (e.g. status bar). */
  onMetadataChange?: (meta: ImageViewerMetadata) => void;
  colors: ThemeColors;
  themeMode: 'light' | 'dark';
}

const BACKDROP_ORDER: readonly ImageBackdropMode[] = ['checkerboard', 'light', 'dark'];
const BACKDROP_LABELS: Record<ImageBackdropMode, string> = {
  checkerboard: 'Grid BG',
  light: 'Light BG',
  dark: 'Dark BG',
};

export function stepZoomLevel(currentPercent: number, direction: 'in' | 'out'): number {
  if (direction === 'in') {
    for (const step of IMAGE_ZOOM_STEPS) {
      if (step > currentPercent) return step;
    }
    return IMAGE_ZOOM_STEPS[IMAGE_ZOOM_STEPS.length - 1];
  }
  for (let i = IMAGE_ZOOM_STEPS.length - 1; i >= 0; i--) {
    if (IMAGE_ZOOM_STEPS[i] < currentPercent) return IMAGE_ZOOM_STEPS[i];
  }
  return IMAGE_ZOOM_STEPS[0];
}

const ImageViewer: React.FC<ImageViewerProps> = ({
  filePath,
  title,
  svgContent,
  byteSize,
  reloadToken = 0,
  onSwitchToCodeView,
  onMetadataChange,
  colors,
  themeMode,
}) => {
  const targetName = filePath ?? title;
  const isSvg = isSvgPath(targetName);
  const formatLabel = getImageFormatLabel(targetName);

  const [zoomMode, setZoomMode] = useState<'fit' | 'manual'>('fit');
  const [zoomPercent, setZoomPercent] = useState<number>(100);
  const [backdrop, setBackdrop] = useState<ImageBackdropMode>('checkerboard');
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [hasError, setHasError] = useState<boolean>(false);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const dragStartRef = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number } | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const prevTargetRef = useRef<{ filePath: string | null; title: string }>({ filePath, title });
  const prevReloadRef = useRef<{ reloadToken: number; svgContent?: string }>({ reloadToken, svgContent });

  // Reset zoom and dimensions only when switching to a different file (not on initial mount)
  useEffect(() => {
    const prev = prevTargetRef.current;
    if (prev.filePath !== filePath || prev.title !== title) {
      prevTargetRef.current = { filePath, title };
      setZoomMode('fit');
      setZoomPercent(100);
      setDimensions(null);
      setHasError(false);
    }
  }, [filePath, title]);

  // Clear previous load error when disk file or SVG content updates
  useEffect(() => {
    const prev = prevReloadRef.current;
    if (prev.reloadToken !== reloadToken || prev.svgContent !== svgContent) {
      prevReloadRef.current = { reloadToken, svgContent };
      setHasError(false);
    }
  }, [reloadToken, svgContent]);

  const imageSrc = useMemo(() => {
    if (isSvg && typeof svgContent === 'string' && svgContent.trim().length > 0) {
      return toSvgDataUrl(svgContent);
    }
    if (filePath) {
      return toAssetUrl(filePath, reloadToken);
    }
    if (isSvg && typeof svgContent === 'string') {
      return toSvgDataUrl(svgContent);
    }
    return '';
  }, [isSvg, svgContent, filePath, reloadToken]);

  const effectiveByteSize = useMemo(() => {
    if (isSvg && typeof svgContent === 'string' && svgContent.length > 0) {
      return new TextEncoder().encode(svgContent).byteLength;
    }
    return byteSize;
  }, [isSvg, svgContent, byteSize]);

  const formattedSize = useMemo(() => formatByteSize(effectiveByteSize), [effectiveByteSize]);

  useEffect(() => {
    onMetadataChange?.({
      width: dimensions?.width ?? null,
      height: dimensions?.height ?? null,
      zoomPercent,
      isFit: zoomMode === 'fit',
    });
  }, [dimensions, zoomPercent, zoomMode, onMetadataChange]);

  const handleZoomIn = useCallback(() => {
    setZoomMode('manual');
    setZoomPercent(prev => stepZoomLevel(prev, 'in'));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoomMode('manual');
    setZoomPercent(prev => stepZoomLevel(prev, 'out'));
  }, []);

  const handleActualSize = useCallback(() => {
    setZoomMode('manual');
    setZoomPercent(100);
  }, []);

  const handleFit = useCallback(() => {
    setZoomMode('fit');
    setZoomPercent(100);
  }, []);

  const handleCycleBackdrop = useCallback(() => {
    setBackdrop(prev => {
      const idx = BACKDROP_ORDER.indexOf(prev);
      return BACKDROP_ORDER[(idx + 1) % BACKDROP_ORDER.length];
    });
  }, []);

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        if (e.deltaY < 0) {
          handleZoomIn();
        } else if (e.deltaY > 0) {
          handleZoomOut();
        }
      }
    },
    [handleZoomIn, handleZoomOut],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.altKey) return;
      if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        handleZoomIn();
      } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        handleZoomOut();
      } else if (e.key === '0' || e.key === '1') {
        e.preventDefault();
        handleActualSize();
      } else if (e.key === 'f' || e.key === 'F') {
        if (!e.ctrlKey && !e.metaKey) {
          e.preventDefault();
          handleFit();
        }
      }
    },
    [handleZoomIn, handleZoomOut, handleActualSize, handleFit],
  );

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (zoomMode === 'fit' || e.button !== 0 || !canvasRef.current) return;
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      scrollLeft: canvasRef.current.scrollLeft,
      scrollTop: canvasRef.current.scrollTop,
    };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDragging || !dragStartRef.current || !canvasRef.current) return;
    const dx = e.clientX - dragStartRef.current.x;
    const dy = e.clientY - dragStartRef.current.y;
    canvasRef.current.scrollLeft = dragStartRef.current.scrollLeft - dx;
    canvasRef.current.scrollTop = dragStartRef.current.scrollTop - dy;
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    dragStartRef.current = null;
  };

  const handleImageDoubleClick = () => {
    if (zoomMode === 'fit') {
      handleActualSize();
    } else {
      handleFit();
    }
  };

  const borderColor = themeMode === 'light' ? '#d4d4d8' : '#38383d';

  const canvasBackgroundStyle = useMemo<React.CSSProperties>(() => {
    if (backdrop === 'light') {
      return { backgroundColor: '#f8fafc' };
    }
    if (backdrop === 'dark') {
      return { backgroundColor: '#18181b' };
    }
    const cellA = themeMode === 'light' ? '#e4e4e7' : '#27272a';
    const cellB = themeMode === 'light' ? '#f4f4f5' : '#1f1f22';
    return {
      backgroundColor: cellB,
      backgroundImage: `
        linear-gradient(45deg, ${cellA} 25%, transparent 25%),
        linear-gradient(-45deg, ${cellA} 25%, transparent 25%),
        linear-gradient(45deg, transparent 75%, ${cellA} 75%),
        linear-gradient(-45deg, transparent 75%, ${cellA} 75%)
      `,
      backgroundSize: '16px 16px',
      backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0',
    };
  }, [backdrop, themeMode]);

  const buttonStyle: React.CSSProperties = {
    padding: '3px 8px',
    fontSize: '12px',
    borderRadius: '4px',
    border: `1px solid ${borderColor}`,
    backgroundColor: colors.background,
    color: colors.foreground,
    cursor: 'pointer',
    lineHeight: 1.2,
  };

  const scaledWidth =
    zoomMode === 'manual' && dimensions
      ? Math.max(1, Math.round((dimensions.width * zoomPercent) / 100))
      : undefined;
  const scaledHeight =
    zoomMode === 'manual' && dimensions
      ? Math.max(1, Math.round((dimensions.height * zoomPercent) / 100))
      : undefined;

  return (
    <div
      data-testid="image-viewer"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: colors.background,
        color: colors.foreground,
        fontSize: '13px',
        outline: 'none',
      }}
    >
      {/* Top Toolbar */}
      <div
        data-testid="image-viewer-toolbar"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          padding: '6px 10px',
          backgroundColor: colors.tabBackground,
          borderBottom: `1px solid ${borderColor}`,
          flexShrink: 0,
        }}
      >
        {/* Left: format badge, natural dimensions, file size */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <span
            data-testid="image-format-badge"
            style={{
              padding: '2px 6px',
              fontSize: '11px',
              fontWeight: 700,
              borderRadius: '3px',
              backgroundColor: colors.tabActiveBackground,
              border: `1px solid ${borderColor}`,
              letterSpacing: '0.03em',
            }}
          >
            {formatLabel}
          </span>
          {dimensions && (
            <span data-testid="image-dimensions" style={{ fontSize: '12px', opacity: 0.85 }}>
              {dimensions.width} × {dimensions.height} px
            </span>
          )}
          {formattedSize && (
            <span data-testid="image-file-size" style={{ fontSize: '12px', opacity: 0.7 }}>
              {formattedSize}
            </span>
          )}
        </div>

        {/* Right: zoom controls, backdrop toggle, and SVG Code View toggle */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <button
            data-testid="image-zoom-out"
            aria-label="Zoom Out"
            title="Zoom Out (-)"
            onClick={handleZoomOut}
            disabled={zoomMode === 'manual' && zoomPercent <= IMAGE_ZOOM_STEPS[0]}
            style={{
              ...buttonStyle,
              opacity: zoomMode === 'manual' && zoomPercent <= IMAGE_ZOOM_STEPS[0] ? 0.45 : 1,
            }}
          >
            −
          </button>
          <span
            data-testid="image-zoom-level"
            title="Current zoom level (double-click image to toggle Fit / 100%)"
            style={{
              minWidth: '58px',
              textAlign: 'center',
              fontSize: '12px',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            {zoomMode === 'fit' ? 'Fit' : `${zoomPercent}%`}
          </span>
          <button
            data-testid="image-zoom-in"
            aria-label="Zoom In"
            title="Zoom In (+)"
            onClick={handleZoomIn}
            disabled={
              zoomMode === 'manual' &&
              zoomPercent >= IMAGE_ZOOM_STEPS[IMAGE_ZOOM_STEPS.length - 1]
            }
            style={{
              ...buttonStyle,
              opacity:
                zoomMode === 'manual' &&
                zoomPercent >= IMAGE_ZOOM_STEPS[IMAGE_ZOOM_STEPS.length - 1]
                  ? 0.45
                  : 1,
            }}
          >
            +
          </button>
          <button
            data-testid="image-zoom-actual"
            aria-label="Actual Size (100%)"
            aria-pressed={zoomMode === 'manual' && zoomPercent === 100}
            title="Actual Size 1:1 (1 or 0)"
            onClick={handleActualSize}
            style={{
              ...buttonStyle,
              backgroundColor:
                zoomMode === 'manual' && zoomPercent === 100
                  ? colors.tabActiveBackground
                  : colors.background,
              fontWeight: zoomMode === 'manual' && zoomPercent === 100 ? 600 : 400,
            }}
          >
            1:1
          </button>
          <button
            data-testid="image-zoom-fit"
            aria-label="Fit to Window"
            aria-pressed={zoomMode === 'fit'}
            title="Fit to Window (F)"
            onClick={handleFit}
            style={{
              ...buttonStyle,
              backgroundColor:
                zoomMode === 'fit' ? colors.tabActiveBackground : colors.background,
              fontWeight: zoomMode === 'fit' ? 600 : 400,
            }}
          >
            Fit
          </button>
          <button
            data-testid="image-backdrop-toggle"
            aria-label={`Change image backdrop (current: ${BACKDROP_LABELS[backdrop]})`}
            title="Cycle canvas background (Checkerboard / Light / Dark)"
            onClick={handleCycleBackdrop}
            style={buttonStyle}
          >
            {BACKDROP_LABELS[backdrop]}
          </button>
          {onSwitchToCodeView && (
            <button
              data-testid="svg-switch-to-code-button"
              onClick={onSwitchToCodeView}
              title="Edit SVG XML source code"
              style={{
                ...buttonStyle,
                fontWeight: 600,
                border: `1px solid ${colors.tabBorder}`,
              }}
            >
              Code View
            </button>
          )}
        </div>
      </div>

      {/* Image Canvas */}
      <div
        ref={canvasRef}
        data-testid="image-viewer-canvas"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        style={{
          flex: 1,
          minHeight: 0,
          overflow: 'auto',
          display: 'flex',
          alignItems: zoomMode === 'fit' ? 'center' : 'safe center',
          justifyContent: zoomMode === 'fit' ? 'center' : 'safe center',
          padding: '16px',
          boxSizing: 'border-box',
          cursor: zoomMode === 'fit' ? 'zoom-in' : isDragging ? 'grabbing' : 'grab',
          userSelect: 'none',
          ...canvasBackgroundStyle,
        }}
      >
        {hasError || !imageSrc ? (
          <div
            data-testid="image-viewer-error"
            style={{
              padding: '20px 24px',
              borderRadius: '6px',
              backgroundColor: colors.background,
              border: `1px solid ${borderColor}`,
              textAlign: 'center',
              maxWidth: '420px',
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: '6px' }}>
              Unable to display image &ldquo;{title}&rdquo;
            </div>
            <div style={{ fontSize: '12px', opacity: 0.75 }}>
              The file may be corrupted, empty, or in an unsupported format.
            </div>
            {onSwitchToCodeView && (
              <button
                data-testid="image-error-code-view-button"
                onClick={onSwitchToCodeView}
                style={{
                  ...buttonStyle,
                  marginTop: '12px',
                  fontWeight: 600,
                }}
              >
                Open in Code View
              </button>
            )}
          </div>
        ) : (
          <img
            data-testid="image-viewer-img"
            src={imageSrc}
            alt={title}
            draggable={false}
            onDoubleClick={handleImageDoubleClick}
            onLoad={e => {
              const img = e.currentTarget;
              const w = img.naturalWidth || img.width || 0;
              const h = img.naturalHeight || img.height || 0;
              if (w > 0 && h > 0) {
                setDimensions({ width: w, height: h });
              }
              setHasError(false);
            }}
            onError={() => setHasError(true)}
            style={
              zoomMode === 'fit'
                ? {
                    maxWidth: '100%',
                    maxHeight: '100%',
                    width: 'auto',
                    height: 'auto',
                    objectFit: 'contain',
                    display: 'block',
                    boxShadow: '0 2px 12px rgba(0, 0, 0, 0.18)',
                  }
                : {
                    width: scaledWidth ? `${scaledWidth}px` : undefined,
                    height: scaledHeight ? `${scaledHeight}px` : undefined,
                    transform: !dimensions ? `scale(${zoomPercent / 100})` : undefined,
                    transformOrigin: 'center center',
                    maxWidth: 'none',
                    maxHeight: 'none',
                    display: 'block',
                    imageRendering: zoomPercent >= 200 && !isSvg ? 'pixelated' : 'auto',
                    boxShadow: '0 2px 12px rgba(0, 0, 0, 0.18)',
                  }
            }
          />
        )}
      </div>
    </div>
  );
};

export default ImageViewer;
