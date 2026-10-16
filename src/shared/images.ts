/**
 * Shared helpers for classifying image files (raster vs. SVG vector),
 * building safe `awapi-asset://` / `data:` URLs, and formatting file sizes.
 */

export const RASTER_IMAGE_EXTENSIONS: readonly string[] = [
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'bmp',
  'ico',
  'avif',
];

export const SVG_IMAGE_EXTENSIONS: readonly string[] = ['svg'];

const RASTER_SET = new Set<string>(RASTER_IMAGE_EXTENSIONS);
const SVG_SET = new Set<string>(SVG_IMAGE_EXTENSIONS);

/** Extract the lowercase file extension (without leading dot), or `''` if none. */
export function getFileExtension(filenameOrPath: string | null | undefined): string {
  if (!filenameOrPath) return '';
  const base = filenameOrPath.split(/[\\/]/).pop() ?? filenameOrPath;
  const trimmed = base.trim().toLowerCase();
  const dot = trimmed.lastIndexOf('.');
  if (dot <= 0 || dot === trimmed.length - 1) return '';
  return trimmed.slice(dot + 1);
}

/** True for binary raster image formats (PNG, JPG, JPEG, GIF, WEBP, BMP, ICO, AVIF). */
export function isRasterImagePath(filenameOrPath: string | null | undefined): boolean {
  return RASTER_SET.has(getFileExtension(filenameOrPath));
}

/** True for `.svg` vector image files (which can be viewed as an image or edited as XML). */
export function isSvgPath(filenameOrPath: string | null | undefined): boolean {
  return SVG_SET.has(getFileExtension(filenameOrPath));
}

/** True for any supported image file (raster or SVG). */
export function isImagePath(filenameOrPath: string | null | undefined): boolean {
  const ext = getFileExtension(filenameOrPath);
  return RASTER_SET.has(ext) || SVG_SET.has(ext);
}

/** Returns a short uppercase format badge label (e.g. `'PNG'`, `'JPEG'`, `'SVG'`). */
export function getImageFormatLabel(filenameOrPath: string | null | undefined): string {
  const ext = getFileExtension(filenameOrPath);
  if (!ext) return 'IMAGE';
  if (ext === 'jpg') return 'JPEG';
  return ext.toUpperCase();
}

/**
 * Converts an absolute filesystem path into a safe `awapi-asset://local/...` URL
 * so Chromium can load local disk images in both dev (`http://localhost`) and
 * packaged (`file://`) modes.
 *
 * Each path segment is URI-encoded so filenames containing `#`, `?`, `%`, or spaces
 * are preserved across URL parsing in the main process protocol handler.
 */
export function toAssetUrl(filePath: string, reloadToken?: number): string {
  const normalized = filePath.replace(/\\/g, '/');
  const segments = normalized.split('/').map((seg, index) => {
    // Preserve Windows drive root like "C:"
    if (index === 0 && /^[a-zA-Z]:$/.test(seg)) {
      return seg;
    }
    return encodeURIComponent(seg);
  });
  const joined = segments.join('/');
  const base = joined.startsWith('/')
    ? `awapi-asset://local${joined}`
    : `awapi-asset://local/${joined}`;
  if (reloadToken && reloadToken > 0) {
    return `${base}?v=${reloadToken}`;
  }
  return base;
}

/**
 * Converts raw SVG XML text into a safe `data:image/svg+xml;utf8,...` URL
 * for live previewing SVG files (including unsaved edits in Code View).
 */
export function toSvgDataUrl(svgContent: string): string {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svgContent)}`;
}

/** Formats a byte count into a human-readable string (`B`, `KB`, `MB`, `GB`). */
export function formatByteSize(bytes: number | null | undefined): string {
  if (bytes === null || bytes === undefined || !Number.isFinite(bytes) || bytes < 0) {
    return '';
  }
  if (bytes < 1024) {
    return `${Math.round(bytes)} B`;
  }
  const kb = bytes / 1024;
  if (kb < 1024) {
    return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  }
  const mb = kb / 1024;
  if (mb < 1024) {
    return `${mb.toFixed(2)} MB`;
  }
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}
