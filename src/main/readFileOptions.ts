import { type EncodingKind, isEncodingKind } from './encoding';

export interface ReadFileOptions {
  /** Decode with this encoding instead of auto-detecting. */
  encoding?: EncodingKind;
  /**
   * Record the file in "Open Recent". Only user-initiated opens (e.g. drag & drop)
   * should set this; background reads such as session restore or reopening a
   * closed tab must not reorder the recent list.
   */
  trackRecent: boolean;
}

/**
 * Validates the untrusted options argument of the `file:read` IPC handler.
 * A bare encoding string is accepted for backward compatibility.
 */
export function parseReadFileOptions(raw: unknown): ReadFileOptions {
  if (isEncodingKind(raw)) {
    return { encoding: raw, trackRecent: false };
  }
  if (!raw || typeof raw !== 'object') {
    return { trackRecent: false };
  }
  const { encoding, trackRecent } = raw as { encoding?: unknown; trackRecent?: unknown };
  return {
    encoding: isEncodingKind(encoding) ? encoding : undefined,
    trackRecent: trackRecent === true,
  };
}
