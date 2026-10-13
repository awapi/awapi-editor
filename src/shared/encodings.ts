/**
 * Character encodings supported by AwapiEditor.
 *
 * Shared by the main and renderer processes (pure functions, no Node or DOM-only APIs).
 * `utf-16le` / `utf-16be` are written with a byte order mark; the `-nobom`
 * variants preserve BOM-less UTF-16 files as they were.
 */
export type EncodingKind =
  | 'utf-8'
  | 'utf-8-bom'
  | 'utf-16le'
  | 'utf-16le-nobom'
  | 'utf-16be'
  | 'utf-16be-nobom'
  | 'iso-8859-1';

/** Default encoding for newly created tabs. */
export const DEFAULT_ENCODING: EncodingKind = 'utf-8';

/** Short human-readable labels displayed in the status bar. */
export const ENCODING_LABEL: Record<EncodingKind, string> = {
  'utf-8': 'UTF-8',
  'utf-8-bom': 'UTF-8 with BOM',
  'utf-16le': 'UTF-16 LE',
  'utf-16le-nobom': 'UTF-16 LE (no BOM)',
  'utf-16be': 'UTF-16 BE',
  'utf-16be-nobom': 'UTF-16 BE (no BOM)',
  'iso-8859-1': 'ISO-8859-1',
};

/** Metadata for each supported encoding option in the status bar selector. */
export const ENCODING_OPTIONS: ReadonlyArray<{
  id: EncodingKind;
  label: string;
  description: string;
}> = [
  { id: 'utf-8', label: 'UTF-8', description: 'Unicode (no BOM)' },
  { id: 'utf-8-bom', label: 'UTF-8 with BOM', description: 'EF BB BF byte order mark' },
  { id: 'utf-16le', label: 'UTF-16 LE', description: 'Little-Endian (FF FE)' },
  { id: 'utf-16le-nobom', label: 'UTF-16 LE (no BOM)', description: 'Little-Endian, no byte order mark' },
  { id: 'utf-16be', label: 'UTF-16 BE', description: 'Big-Endian (FE FF)' },
  { id: 'utf-16be-nobom', label: 'UTF-16 BE (no BOM)', description: 'Big-Endian, no byte order mark' },
  { id: 'iso-8859-1', label: 'ISO-8859-1', description: 'Western European (Latin-1)' },
];

/** Returns true if `value` is a valid `EncodingKind`. */
export function isEncodingKind(value: unknown): value is EncodingKind {
  return (
    value === 'utf-8' ||
    value === 'utf-8-bom' ||
    value === 'utf-16le' ||
    value === 'utf-16le-nobom' ||
    value === 'utf-16be' ||
    value === 'utf-16be-nobom' ||
    value === 'iso-8859-1'
  );
}

/**
 * Checks whether `bytes` is a strictly valid UTF-8 byte sequence.
 */
export function isValidUtf8(bytes: Uint8Array): boolean {
  let i = 0;
  const len = bytes.length;
  while (i < len) {
    const b0 = bytes[i];
    if (b0 <= 0x7f) {
      i += 1;
      continue;
    }

    // 2-byte sequence: 110xxxxx 10xxxxxx (0xC2..0xDF)
    if (b0 >= 0xc2 && b0 <= 0xdf) {
      if (i + 1 >= len) return false;
      const b1 = bytes[i + 1];
      if ((b1 & 0xc0) !== 0x80) return false;
      i += 2;
      continue;
    }

    // 3-byte sequences
    if (b0 === 0xe0) {
      if (i + 2 >= len) return false;
      const b1 = bytes[i + 1];
      const b2 = bytes[i + 2];
      if (b1 < 0xa0 || b1 > 0xbf || (b2 & 0xc0) !== 0x80) return false;
      i += 3;
      continue;
    }
    if ((b0 >= 0xe1 && b0 <= 0xec) || (b0 >= 0xee && b0 <= 0xef)) {
      if (i + 2 >= len) return false;
      const b1 = bytes[i + 1];
      const b2 = bytes[i + 2];
      if ((b1 & 0xc0) !== 0x80 || (b2 & 0xc0) !== 0x80) return false;
      i += 3;
      continue;
    }
    if (b0 === 0xed) {
      // Exclude UTF-16 surrogates (U+D800..U+DFFF -> ED A0..BF)
      if (i + 2 >= len) return false;
      const b1 = bytes[i + 1];
      const b2 = bytes[i + 2];
      if (b1 < 0x80 || b1 > 0x9f || (b2 & 0xc0) !== 0x80) return false;
      i += 3;
      continue;
    }

    // 4-byte sequences
    if (b0 === 0xf0) {
      if (i + 3 >= len) return false;
      const b1 = bytes[i + 1];
      const b2 = bytes[i + 2];
      const b3 = bytes[i + 3];
      if (b1 < 0x90 || b1 > 0xbf || (b2 & 0xc0) !== 0x80 || (b3 & 0xc0) !== 0x80) return false;
      i += 4;
      continue;
    }
    if (b0 >= 0xf1 && b0 <= 0xf3) {
      if (i + 3 >= len) return false;
      const b1 = bytes[i + 1];
      const b2 = bytes[i + 2];
      const b3 = bytes[i + 3];
      if ((b1 & 0xc0) !== 0x80 || (b2 & 0xc0) !== 0x80 || (b3 & 0xc0) !== 0x80) return false;
      i += 4;
      continue;
    }
    if (b0 === 0xf4) {
      if (i + 3 >= len) return false;
      const b1 = bytes[i + 1];
      const b2 = bytes[i + 2];
      const b3 = bytes[i + 3];
      if (b1 < 0x80 || b1 > 0x8f || (b2 & 0xc0) !== 0x80 || (b3 & 0xc0) !== 0x80) return false;
      i += 4;
      continue;
    }

    return false;
  }
  return true;
}

/**
 * Detects the character encoding of a raw byte buffer.
 *
 * Detection order:
 * 1. UTF-8 BOM (`EF BB BF`) -> `'utf-8-bom'`
 * 2. UTF-16 LE BOM (`FF FE`) -> `'utf-16le'`
 * 3. UTF-16 BE BOM (`FE FF`) -> `'utf-16be'`
 * 4. Heuristic BOM-less UTF-16 LE/BE check (even byte length with alternating NUL bytes)
 *    -> `'utf-16le-nobom'` / `'utf-16be-nobom'`
 * 5. Valid UTF-8 -> `'utf-8'`
 * 6. Fallback -> `'iso-8859-1'`
 */
export function detectEncoding(bytes: Uint8Array): EncodingKind {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return 'utf-8-bom';
  }
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) {
    return 'utf-16le';
  }
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) {
    return 'utf-16be';
  }

  // Check for BOM-less UTF-16 when length is even and >= 4
  if (bytes.length >= 4 && bytes.length % 2 === 0) {
    const samplePairs = Math.min(bytes.length >> 1, 512);
    let evenZeros = 0;
    let oddZeros = 0;
    for (let i = 0; i < samplePairs; i++) {
      if (bytes[i * 2] === 0x00) evenZeros++;
      if (bytes[i * 2 + 1] === 0x00) oddZeros++;
    }
    if (oddZeros > 0 && evenZeros === 0 && oddZeros >= samplePairs * 0.5) {
      return 'utf-16le-nobom';
    }
    if (evenZeros > 0 && oddZeros === 0 && evenZeros >= samplePairs * 0.5) {
      return 'utf-16be-nobom';
    }
  }

  if (isValidUtf8(bytes)) {
    return 'utf-8';
  }

  return 'iso-8859-1';
}

/**
 * Decodes BOM-less UTF-16 code units. A trailing odd byte (a truncated code
 * unit) is decoded as U+FFFD so the damage is visible instead of silently dropped.
 */
function decodeUtf16(bytes: Uint8Array, littleEndian: boolean): string {
  const pairCount = bytes.length >> 1;
  const chunks: string[] = [];
  const CHUNK_SIZE = 4096;
  for (let offset = 0; offset < pairCount; offset += CHUNK_SIZE) {
    const end = Math.min(offset + CHUNK_SIZE, pairCount);
    const codes = new Array<number>(end - offset);
    for (let i = offset; i < end; i++) {
      const lo = bytes[i * 2];
      const hi = bytes[i * 2 + 1];
      codes[i - offset] = littleEndian ? lo | (hi << 8) : (lo << 8) | hi;
    }
    chunks.push(String.fromCharCode(...codes));
  }
  if (bytes.length % 2 !== 0) chunks.push('\uFFFD');
  return chunks.join('');
}

/** Encodes `content` as UTF-16 code units, optionally preceded by a byte order mark. */
function encodeUtf16(content: string, littleEndian: boolean, withBom: boolean): Uint8Array {
  const offset = withBom ? 2 : 0;
  const out = new Uint8Array(offset + content.length * 2);
  if (withBom) {
    out[0] = littleEndian ? 0xff : 0xfe;
    out[1] = littleEndian ? 0xfe : 0xff;
  }
  for (let i = 0; i < content.length; i++) {
    const code = content.charCodeAt(i);
    const hi = (code >> 8) & 0xff;
    const lo = code & 0xff;
    out[offset + i * 2] = littleEndian ? lo : hi;
    out[offset + i * 2 + 1] = littleEndian ? hi : lo;
  }
  return out;
}

/**
 * Decodes a raw byte buffer using the specified encoding (or auto-detects if omitted).
 * Strips any leading BOM from the returned string so Monaco edits clean text.
 */
export function decodeBytes(
  bytes: Uint8Array,
  encoding?: EncodingKind,
): { content: string; encoding: EncodingKind } {
  const effectiveEncoding = encoding ?? detectEncoding(bytes);

  switch (effectiveEncoding) {
    case 'utf-8-bom': {
      const start =
        bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
      const content = new TextDecoder('utf-8').decode(bytes.subarray(start));
      return { content, encoding: 'utf-8-bom' };
    }
    case 'utf-8': {
      const start =
        bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? 3 : 0;
      const content = new TextDecoder('utf-8').decode(bytes.subarray(start));
      return { content, encoding: 'utf-8' };
    }
    case 'utf-16le':
    case 'utf-16le-nobom': {
      const start = bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe ? 2 : 0;
      return { content: decodeUtf16(bytes.subarray(start), true), encoding: effectiveEncoding };
    }
    case 'utf-16be':
    case 'utf-16be-nobom': {
      const start = bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff ? 2 : 0;
      return { content: decodeUtf16(bytes.subarray(start), false), encoding: effectiveEncoding };
    }
    case 'iso-8859-1': {
      const chunks: string[] = [];
      const CHUNK_SIZE = 4096;
      for (let offset = 0; offset < bytes.length; offset += CHUNK_SIZE) {
        const end = Math.min(offset + CHUNK_SIZE, bytes.length);
        const codes = new Array<number>(end - offset);
        for (let i = offset; i < end; i++) {
          codes[i - offset] = bytes[i];
        }
        chunks.push(String.fromCharCode(...codes));
      }
      return { content: chunks.join(''), encoding: 'iso-8859-1' };
    }
  }
}

/**
 * Encodes a string into a `Uint8Array` for the target encoding, including
 * the appropriate BOM for `utf-8-bom`, `utf-16le`, and `utf-16be` (the
 * `-nobom` UTF-16 variants are written without one).
 */
export function encodeString(content: string, encoding: EncodingKind): Uint8Array {
  // Strip any accidental leading U+FEFF in memory so we don't double-write BOMs
  const clean = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;

  switch (encoding) {
    case 'utf-8': {
      return new TextEncoder().encode(clean);
    }
    case 'utf-8-bom': {
      const body = new TextEncoder().encode(clean);
      const out = new Uint8Array(3 + body.length);
      out[0] = 0xef;
      out[1] = 0xbb;
      out[2] = 0xbf;
      out.set(body, 3);
      return out;
    }
    case 'utf-16le':
      return encodeUtf16(clean, true, true);
    case 'utf-16le-nobom':
      return encodeUtf16(clean, true, false);
    case 'utf-16be':
      return encodeUtf16(clean, false, true);
    case 'utf-16be-nobom':
      return encodeUtf16(clean, false, false);
    case 'iso-8859-1': {
      const out = new Uint8Array(clean.length);
      for (let i = 0; i < clean.length; i++) {
        const code = clean.charCodeAt(i);
        // Characters outside Latin-1 (0x00..0xFF) are replaced with '?' (0x3F)
        out[i] = code <= 0xff ? code : 0x3f;
      }
      return out;
    }
  }
}

/**
 * Converts in-memory string content to the representation supported by
 * `targetEncoding` by round-tripping through `encodeString` and `decodeBytes`.
 * For the Unicode encodings (UTF-8 and UTF-16, with or without BOM) all
 * characters are preserved; for `iso-8859-1`, characters above U+00FF are
 * converted to `?`.
 */
export function convertContentEncoding(content: string, targetEncoding: EncodingKind): string {
  const encoded = encodeString(content, targetEncoding);
  return decodeBytes(encoded, targetEncoding).content;
}

/**
 * Counts the characters in `content` that `encoding` cannot represent (and
 * that would therefore be written as `?`). Only `iso-8859-1` is lossy; the
 * Unicode encodings always return 0.
 */
export function countUnrepresentableCharacters(content: string, encoding: EncodingKind): number {
  if (encoding !== 'iso-8859-1') return 0;
  let count = 0;
  for (const ch of content) {
    if (ch.codePointAt(0)! > 0xff) count++;
  }
  return count;
}

/**
 * Returns `content` as it reads back after being saved in `encoding`:
 * unchanged when every character can be represented, otherwise with the
 * unrepresentable characters replaced by `?`.
 */
export function toEncodableContent(content: string, encoding: EncodingKind): string {
  return countUnrepresentableCharacters(content, encoding) > 0
    ? convertContentEncoding(content, encoding)
    : content;
}

/** Returns the encoding indicated by a leading byte order mark, or null. */
export function detectBom(bytes: Uint8Array): EncodingKind | null {
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return 'utf-8-bom';
  if (bytes.length >= 2 && bytes[0] === 0xff && bytes[1] === 0xfe) return 'utf-16le';
  if (bytes.length >= 2 && bytes[0] === 0xfe && bytes[1] === 0xff) return 'utf-16be';
  return null;
}

function hasNonAsciiByte(bytes: Uint8Array): boolean {
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] > 0x7f) return true;
  }
  return false;
}

/**
 * Chooses the encoding to decode `bytes` with when the caller already has an
 * encoding in mind (e.g. the encoding of the open tab when the file changes
 * on disk). The preferred encoding is kept while the bytes are consistent with
 * it; otherwise the encoding is auto-detected:
 * - a byte order mark always wins (the file was clearly re-encoded);
 * - `utf-8-bom` without a BOM -> detect (the BOM was removed);
 * - `utf-8` that is no longer valid UTF-8 -> detect;
 * - `utf-16le` / `utf-16be` (and their `-nobom` variants) -> detect when the
 *   byte length is odd, the bytes look like BOM-less UTF-16 (either byte
 *   order), or they are valid UTF-8;
 * - `iso-8859-1` whose bytes are now valid multi-byte UTF-8 -> detect.
 */
export function resolveDecodingEncoding(bytes: Uint8Array, preferred?: EncodingKind): EncodingKind {
  const bom = detectBom(bytes);
  if (bom) return bom;
  if (!preferred) return detectEncoding(bytes);
  switch (preferred) {
    case 'utf-8-bom':
      return detectEncoding(bytes);
    case 'utf-8':
      return isValidUtf8(bytes) ? 'utf-8' : detectEncoding(bytes);
    case 'utf-16le':
    case 'utf-16le-nobom':
    case 'utf-16be':
    case 'utf-16be-nobom': {
      const detected = detectEncoding(bytes);
      if (bytes.length % 2 !== 0 || detected === 'utf-16le-nobom' || detected === 'utf-16be-nobom') {
        return detected;
      }
      // BOM-less UTF-16 without the NUL-byte pattern (e.g. CJK text) is rarely valid UTF-8.
      // There is no BOM here (checked above), so keep the byte order without one.
      if (isValidUtf8(bytes)) return detected;
      return preferred === 'utf-16le' || preferred === 'utf-16le-nobom' ? 'utf-16le-nobom' : 'utf-16be-nobom';
    }
    case 'iso-8859-1':
      return hasNonAsciiByte(bytes) && isValidUtf8(bytes) ? 'utf-8' : 'iso-8859-1';
  }
}
