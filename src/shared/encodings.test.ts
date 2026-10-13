import { describe, it, expect } from 'vitest';
import {
  ENCODING_LABEL,
  ENCODING_OPTIONS,
  DEFAULT_ENCODING,
  isEncodingKind,
  isValidUtf8,
  detectEncoding,
  decodeBytes,
  encodeString,
  convertContentEncoding,
  countUnrepresentableCharacters,
  toEncodableContent,
  detectBom,
  resolveDecodingEncoding,
} from './encodings';

describe('encodings utility', () => {
  it('exposes labels and options for all supported encodings', () => {
    expect(DEFAULT_ENCODING).toBe('utf-8');
    expect(ENCODING_LABEL['utf-8']).toBe('UTF-8');
    expect(ENCODING_LABEL['utf-8-bom']).toBe('UTF-8 with BOM');
    expect(ENCODING_LABEL['utf-16le']).toBe('UTF-16 LE');
    expect(ENCODING_LABEL['utf-16be']).toBe('UTF-16 BE');
    expect(ENCODING_LABEL['utf-16le-nobom']).toBe('UTF-16 LE (no BOM)');
    expect(ENCODING_LABEL['utf-16be-nobom']).toBe('UTF-16 BE (no BOM)');
    expect(ENCODING_LABEL['iso-8859-1']).toBe('ISO-8859-1');
    expect(ENCODING_OPTIONS.map(o => o.id)).toEqual([
      'utf-8',
      'utf-8-bom',
      'utf-16le',
      'utf-16le-nobom',
      'utf-16be',
      'utf-16be-nobom',
      'iso-8859-1',
    ]);
  });

  it('validates encoding kind values with isEncodingKind', () => {
    expect(isEncodingKind('utf-8')).toBe(true);
    expect(isEncodingKind('utf-8-bom')).toBe(true);
    expect(isEncodingKind('utf-16le')).toBe(true);
    expect(isEncodingKind('utf-16be')).toBe(true);
    expect(isEncodingKind('utf-16le-nobom')).toBe(true);
    expect(isEncodingKind('utf-16be-nobom')).toBe(true);
    expect(isEncodingKind('iso-8859-1')).toBe(true);
    expect(isEncodingKind('ascii')).toBe(false);
    expect(isEncodingKind(null)).toBe(false);
  });

  it('detects UTF-8 with BOM, UTF-16 LE BOM, and UTF-16 BE BOM', () => {
    const utf8Bom = new Uint8Array([0xef, 0xbb, 0xbf, 0x68, 0x69]);
    expect(detectEncoding(utf8Bom)).toBe('utf-8-bom');

    const utf16Le = new Uint8Array([0xff, 0xfe, 0x68, 0x00, 0x69, 0x00]);
    expect(detectEncoding(utf16Le)).toBe('utf-16le');

    const utf16Be = new Uint8Array([0xfe, 0xff, 0x00, 0x68, 0x00, 0x69]);
    expect(detectEncoding(utf16Be)).toBe('utf-16be');
  });

  it('detects BOM-less UTF-16 LE and BE from alternating NUL bytes', () => {
    const bomlessLe = new Uint8Array([0x41, 0x00, 0x42, 0x00, 0x43, 0x00]);
    expect(detectEncoding(bomlessLe)).toBe('utf-16le-nobom');

    const bomlessBe = new Uint8Array([0x00, 0x41, 0x00, 0x42, 0x00, 0x43]);
    expect(detectEncoding(bomlessBe)).toBe('utf-16be-nobom');
  });

  it('preserves the absence of a BOM when re-saving BOM-less UTF-16 (CR-18)', () => {
    const bomlessLe = new Uint8Array([0x41, 0x00, 0x42, 0x00]);
    const decodedLe = decodeBytes(bomlessLe);
    expect(decodedLe).toEqual({ content: 'AB', encoding: 'utf-16le-nobom' });
    expect(Array.from(encodeString(decodedLe.content, decodedLe.encoding))).toEqual(Array.from(bomlessLe));

    const bomlessBe = new Uint8Array([0x00, 0x41, 0x00, 0x42]);
    const decodedBe = decodeBytes(bomlessBe);
    expect(decodedBe).toEqual({ content: 'AB', encoding: 'utf-16be-nobom' });
    expect(Array.from(encodeString(decodedBe.content, decodedBe.encoding))).toEqual(Array.from(bomlessBe));
  });

  it('strips a BOM when decoding with a forced -nobom encoding', () => {
    expect(decodeBytes(new Uint8Array([0xff, 0xfe, 0x41, 0x00]), 'utf-16le-nobom')).toEqual({
      content: 'A',
      encoding: 'utf-16le-nobom',
    });
    expect(decodeBytes(new Uint8Array([0xfe, 0xff, 0x00, 0x41]), 'utf-16be-nobom')).toEqual({
      content: 'A',
      encoding: 'utf-16be-nobom',
    });
  });

  it('decodes an odd trailing UTF-16 byte as U+FFFD instead of dropping it (CR-18)', () => {
    expect(decodeBytes(new Uint8Array([0xff, 0xfe, 0x41, 0x00, 0x42]), 'utf-16le').content).toBe('A\uFFFD');
    expect(decodeBytes(new Uint8Array([0xfe, 0xff, 0x00, 0x41, 0x42]), 'utf-16be').content).toBe('A\uFFFD');
    expect(decodeBytes(new Uint8Array([0x41]), 'utf-16le-nobom').content).toBe('\uFFFD');
    expect(decodeBytes(new Uint8Array([0x41, 0x00]), 'utf-16le-nobom').content).toBe('A');
  });

  it('distinguishes valid UTF-8 from ISO-8859-1 high-byte sequences', () => {
    const utf8Bytes = new TextEncoder().encode('Café — 🚀');
    expect(isValidUtf8(utf8Bytes)).toBe(true);
    expect(detectEncoding(utf8Bytes)).toBe('utf-8');

    // 0xE9 ('é' in ISO-8859-1) followed by ASCII 'a' is invalid UTF-8
    const latin1Bytes = new Uint8Array([0x43, 0x61, 0x66, 0xe9, 0x21]);
    expect(isValidUtf8(latin1Bytes)).toBe(false);
    expect(detectEncoding(latin1Bytes)).toBe('iso-8859-1');
  });

  it('round-trips encodeString and decodeBytes for all supported encodings', () => {
    const sample = 'Hello, World! Ümlaut café';

    for (const enc of [
      'utf-8',
      'utf-8-bom',
      'utf-16le',
      'utf-16le-nobom',
      'utf-16be',
      'utf-16be-nobom',
      'iso-8859-1',
    ] as const) {
      const bytes = encodeString(sample, enc);
      expect(detectEncoding(bytes)).toBe(enc === 'iso-8859-1' ? 'iso-8859-1' : enc);
      const decoded = decodeBytes(bytes);
      expect(decoded.encoding).toBe(enc);
      expect(decoded.content).toBe(sample);
    }
  });

  it('adds appropriate BOM bytes when encoding utf-8-bom, utf-16le, and utf-16be', () => {
    const utf8BomBytes = encodeString('A', 'utf-8-bom');
    expect(Array.from(utf8BomBytes)).toEqual([0xef, 0xbb, 0xbf, 0x41]);

    const utf16LeBytes = encodeString('A', 'utf-16le');
    expect(Array.from(utf16LeBytes)).toEqual([0xff, 0xfe, 0x41, 0x00]);

    const utf16BeBytes = encodeString('A', 'utf-16be');
    expect(Array.from(utf16BeBytes)).toEqual([0xfe, 0xff, 0x00, 0x41]);

    expect(Array.from(encodeString('A', 'utf-16le-nobom'))).toEqual([0x41, 0x00]);
    expect(Array.from(encodeString('A', 'utf-16be-nobom'))).toEqual([0x00, 0x41]);
    // An in-memory U+FEFF is never written as a second BOM.
    expect(Array.from(encodeString('\uFEFFA', 'utf-16le'))).toEqual([0xff, 0xfe, 0x41, 0x00]);
  });

  it('replaces non-Latin-1 code points with ? when converting to iso-8859-1', () => {
    const converted = convertContentEncoding('Price: €100 / £80', 'iso-8859-1');
    // € (U+20AC) is outside 0x00..0xFF -> '?', while £ (U+00A3) is preserved
    expect(converted).toBe('Price: ?100 / £80');
  });

  it('counts characters that cannot be represented in the target encoding (CR-08)', () => {
    expect(countUnrepresentableCharacters('Price: €100 / £80', 'iso-8859-1')).toBe(1);
    // An astral character counts once, even though it is two UTF-16 code units.
    expect(countUnrepresentableCharacters('a😀b€', 'iso-8859-1')).toBe(2);
    expect(countUnrepresentableCharacters('café £', 'iso-8859-1')).toBe(0);
    for (const enc of ['utf-8', 'utf-8-bom', 'utf-16le', 'utf-16le-nobom', 'utf-16be', 'utf-16be-nobom'] as const) {
      expect(countUnrepresentableCharacters('€😀', enc)).toBe(0);
    }
  });

  it('returns content unchanged unless saving would replace characters (CR-08)', () => {
    expect(toEncodableContent('€100', 'utf-8')).toBe('€100');
    expect(toEncodableContent('café', 'iso-8859-1')).toBe('café');
    expect(toEncodableContent('€100', 'iso-8859-1')).toBe('?100');
  });

  it('detects byte order marks', () => {
    expect(detectBom(new Uint8Array([0xef, 0xbb, 0xbf, 0x41]))).toBe('utf-8-bom');
    expect(detectBom(new Uint8Array([0xff, 0xfe, 0x41, 0x00]))).toBe('utf-16le');
    expect(detectBom(new Uint8Array([0xfe, 0xff, 0x00, 0x41]))).toBe('utf-16be');
    expect(detectBom(new Uint8Array([0x41]))).toBeNull();
  });

  describe('resolveDecodingEncoding (CR-09)', () => {
    const utf8 = new TextEncoder().encode('café');
    const latin1 = new Uint8Array([0x63, 0x61, 0x66, 0xe9]); // "café" in ISO-8859-1
    const ascii = new TextEncoder().encode('plain');

    it('auto-detects when no encoding is preferred', () => {
      expect(resolveDecodingEncoding(utf8)).toBe('utf-8');
      expect(resolveDecodingEncoding(latin1)).toBe('iso-8859-1');
    });

    it('lets a byte order mark override the preferred encoding', () => {
      expect(resolveDecodingEncoding(new Uint8Array([0xef, 0xbb, 0xbf, 0x41]), 'iso-8859-1')).toBe('utf-8-bom');
      expect(resolveDecodingEncoding(new Uint8Array([0xff, 0xfe, 0x41, 0x00]), 'utf-8')).toBe('utf-16le');
    });

    it('keeps the preferred encoding while the bytes are consistent with it', () => {
      expect(resolveDecodingEncoding(ascii, 'iso-8859-1')).toBe('iso-8859-1');
      expect(resolveDecodingEncoding(latin1, 'iso-8859-1')).toBe('iso-8859-1');
      expect(resolveDecodingEncoding(utf8, 'utf-8')).toBe('utf-8');
      expect(resolveDecodingEncoding(new Uint8Array([0x41, 0x00, 0x42, 0x00]), 'utf-16le-nobom')).toBe('utf-16le-nobom');
      expect(resolveDecodingEncoding(new Uint8Array([0x00, 0x41, 0x00, 0x42]), 'utf-16be-nobom')).toBe('utf-16be-nobom');
      // BOM-less UTF-16 LE "中文" has no NUL bytes and is not valid UTF-8.
      expect(resolveDecodingEncoding(new Uint8Array([0x2d, 0x4e, 0x87, 0x65]), 'utf-16le-nobom')).toBe('utf-16le-nobom');
      expect(resolveDecodingEncoding(new Uint8Array([0x4e, 0x2d, 0x65, 0x87]), 'utf-16be-nobom')).toBe('utf-16be-nobom');
    });

    it('reports the -nobom variant when a UTF-16 file loses its BOM on disk (CR-18)', () => {
      expect(resolveDecodingEncoding(new Uint8Array([0x41, 0x00, 0x42, 0x00]), 'utf-16le')).toBe('utf-16le-nobom');
      expect(resolveDecodingEncoding(new Uint8Array([0x00, 0x41, 0x00, 0x42]), 'utf-16be')).toBe('utf-16be-nobom');
      expect(resolveDecodingEncoding(new Uint8Array([0x2d, 0x4e, 0x87, 0x65]), 'utf-16le')).toBe('utf-16le-nobom');
      // A BOM-less file that gains a BOM switches back to the BOM variant.
      expect(resolveDecodingEncoding(new Uint8Array([0xff, 0xfe, 0x41, 0x00]), 'utf-16le-nobom')).toBe('utf-16le');
    });

    it('falls back to detection when the bytes no longer fit the preferred encoding', () => {
      expect(resolveDecodingEncoding(ascii, 'utf-8-bom')).toBe('utf-8');
      expect(resolveDecodingEncoding(latin1, 'utf-8')).toBe('iso-8859-1');
      expect(resolveDecodingEncoding(new TextEncoder().encode('abc'), 'utf-16le')).toBe('utf-8');
      expect(resolveDecodingEncoding(new TextEncoder().encode('abcd'), 'utf-16be')).toBe('utf-8');
      expect(resolveDecodingEncoding(new Uint8Array([0x41, 0x00, 0x42, 0x00]), 'utf-16be')).toBe('utf-16le-nobom');
      expect(resolveDecodingEncoding(new Uint8Array([0x41, 0x00, 0x42]), 'utf-16le-nobom')).toBe('utf-8');
      expect(resolveDecodingEncoding(utf8, 'iso-8859-1')).toBe('utf-8');
    });
  });
});
