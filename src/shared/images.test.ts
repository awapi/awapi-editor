import { describe, it, expect } from 'vitest';
import {
  getFileExtension,
  isRasterImagePath,
  isSvgPath,
  isImagePath,
  getImageFormatLabel,
  toAssetUrl,
  toSvgDataUrl,
  formatByteSize,
} from './images';

describe('shared/images', () => {
  describe('getFileExtension', () => {
    it('extracts lowercase extension from unix and windows paths', () => {
      expect(getFileExtension('/Users/test/photo.PNG')).toBe('png');
      expect(getFileExtension('C:\\assets\\logo.svg')).toBe('svg');
      expect(getFileExtension('archive.tar.gz')).toBe('gz');
    });

    it('returns empty string for dotfiles, trailing dots, or empty input', () => {
      expect(getFileExtension(null)).toBe('');
      expect(getFileExtension(undefined)).toBe('');
      expect(getFileExtension('')).toBe('');
      expect(getFileExtension('Untitled')).toBe('');
      expect(getFileExtension('.gitignore')).toBe('');
      expect(getFileExtension('file.')).toBe('');
    });
  });

  describe('isRasterImagePath / isSvgPath / isImagePath', () => {
    it.each(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'ico', 'avif'])(
      'recognizes .%s as a raster image and general image',
      (ext) => {
        expect(isRasterImagePath(`sample.${ext}`)).toBe(true);
        expect(isRasterImagePath(`/dir/SAMPLE.${ext.toUpperCase()}`)).toBe(true);
        expect(isSvgPath(`sample.${ext}`)).toBe(false);
        expect(isImagePath(`sample.${ext}`)).toBe(true);
      },
    );

    it('recognizes .svg as an SVG image and general image, but not raster', () => {
      expect(isSvgPath('icon.svg')).toBe(true);
      expect(isSvgPath('/path/to/ICON.SVG')).toBe(true);
      expect(isRasterImagePath('icon.svg')).toBe(false);
      expect(isImagePath('icon.svg')).toBe(true);
    });

    it('returns false for non-image files', () => {
      expect(isImagePath('notes.txt')).toBe(false);
      expect(isImagePath('index.tsx')).toBe(false);
      expect(isImagePath('data.csv')).toBe(false);
      expect(isImagePath(null)).toBe(false);
    });
  });

  describe('getImageFormatLabel', () => {
    it('returns normalized uppercase format labels', () => {
      expect(getImageFormatLabel('photo.jpg')).toBe('JPEG');
      expect(getImageFormatLabel('photo.jpeg')).toBe('JPEG');
      expect(getImageFormatLabel('logo.png')).toBe('PNG');
      expect(getImageFormatLabel('vector.svg')).toBe('SVG');
      expect(getImageFormatLabel('Untitled')).toBe('IMAGE');
    });
  });

  describe('toAssetUrl', () => {
    it('builds awapi-asset URLs for POSIX and Windows paths', () => {
      expect(toAssetUrl('/Users/alice/pic.png')).toBe('awapi-asset://local/Users/alice/pic.png');
      expect(toAssetUrl('C:\\Users\\alice\\pic.png')).toBe('awapi-asset://local/C:/Users/alice/pic.png');
    });

    it('URI-encodes special characters in segments and appends cache-buster query when provided', () => {
      expect(toAssetUrl('/Users/alice/my #1 photo?.png', 3)).toBe(
        'awapi-asset://local/Users/alice/my%20%231%20photo%3F.png?v=3',
      );
    });
  });

  describe('toSvgDataUrl', () => {
    it('encodes SVG XML content as a data URL', () => {
      const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><circle r="5"/></svg>';
      const url = toSvgDataUrl(svg);
      expect(url.startsWith('data:image/svg+xml;utf8,')).toBe(true);
      expect(decodeURIComponent(url.replace('data:image/svg+xml;utf8,', ''))).toBe(svg);
    });
  });

  describe('formatByteSize', () => {
    it('formats bytes, kilobytes, megabytes, and gigabytes cleanly', () => {
      expect(formatByteSize(null)).toBe('');
      expect(formatByteSize(-5)).toBe('');
      expect(formatByteSize(0)).toBe('0 B');
      expect(formatByteSize(512)).toBe('512 B');
      expect(formatByteSize(2048)).toBe('2.0 KB');
      expect(formatByteSize(25600)).toBe('25 KB');
      expect(formatByteSize(2 * 1024 * 1024)).toBe('2.00 MB');
      expect(formatByteSize(3 * 1024 * 1024 * 1024)).toBe('3.00 GB');
    });
  });
});
