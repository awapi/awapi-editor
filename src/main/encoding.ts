import {
  type EncodingKind,
  DEFAULT_ENCODING,
  isEncodingKind,
  detectEncoding,
  decodeBytes,
  encodeString,
  resolveDecodingEncoding,
} from '../shared/encodings';

export {
  type EncodingKind,
  DEFAULT_ENCODING,
  isEncodingKind,
  detectEncoding,
  decodeBytes,
  encodeString,
};

/**
 * Decodes the bytes returned by `fs.readFileSync(path)`.
 *
 * `forcedEncoding` always wins. Otherwise `preferredEncoding` (e.g. the open
 * tab's encoding) is used while the bytes are consistent with it, falling back
 * to auto-detection (see `resolveDecodingEncoding`).
 */
export function decodeRawFileInput(
  raw: Uint8Array,
  forcedEncoding?: EncodingKind,
  preferredEncoding?: EncodingKind,
): { content: string; encoding: EncodingKind } {
  return decodeBytes(raw, forcedEncoding ?? resolveDecodingEncoding(raw, preferredEncoding));
}

/**
 * Encodes string content into a Node `Buffer` using the requested encoding.
 */
export function encodeTextToBuffer(content: string, encoding: EncodingKind = DEFAULT_ENCODING): Buffer {
  const bytes = encodeString(content, encoding);
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}
