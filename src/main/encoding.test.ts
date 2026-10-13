import { describe, it, expect } from 'vitest';
import {
  decodeRawFileInput,
  encodeTextToBuffer,
} from './encoding';

describe('main encoding helpers', () => {
  it('decodes Buffer input and detects BOMs accurately', () => {
    const buf = encodeTextToBuffer('Hello\r\nWorld', 'utf-16le');
    const decoded = decodeRawFileInput(buf);
    expect(decoded.encoding).toBe('utf-16le');
    expect(decoded.content).toBe('Hello\r\nWorld');
  });

  it('strips a UTF-8 BOM and reports utf-8-bom', () => {
    expect(decodeRawFileInput(Buffer.from('\uFEFFbom text', 'utf-8'))).toEqual({
      content: 'bom text',
      encoding: 'utf-8-bom',
    });
    expect(decodeRawFileInput(Buffer.from('plain text', 'utf-8'))).toEqual({
      content: 'plain text',
      encoding: 'utf-8',
    });
  });

  it('encodes and decodes ISO-8859-1 buffers', () => {
    const buf = encodeTextToBuffer('Résumé', 'iso-8859-1');
    const decoded = decodeRawFileInput(buf);
    expect(decoded.encoding).toBe('iso-8859-1');
    expect(decoded.content).toBe('Résumé');
  });

  it('keeps the preferred encoding while the bytes fit it (CR-09)', () => {
    const ascii = Buffer.from('plain', 'latin1');
    expect(decodeRawFileInput(ascii, undefined, 'iso-8859-1').encoding).toBe('iso-8859-1');
    expect(decodeRawFileInput(ascii).encoding).toBe('utf-8');

    const utf8 = Buffer.from('café', 'utf-8');
    expect(decodeRawFileInput(utf8, undefined, 'iso-8859-1')).toEqual({ content: 'café', encoding: 'utf-8' });
  });

  it('lets a forced encoding override the preferred one', () => {
    const utf8 = Buffer.from('café', 'utf-8');
    expect(decodeRawFileInput(utf8, 'iso-8859-1', 'utf-8')).toEqual({ content: 'cafÃ©', encoding: 'iso-8859-1' });
  });

  it('re-detects when the preferred encoding is utf-8-bom but the BOM is gone', () => {
    expect(decodeRawFileInput(Buffer.from('text', 'utf-8'), undefined, 'utf-8-bom').encoding).toBe('utf-8');
  });
});
