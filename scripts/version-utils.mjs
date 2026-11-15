/** Pure version helpers for scripts/next-version.mjs (no Node imports, so they're unit-testable). */

const MAX_DIGIT = 9;

/** Parses `X.Y.Z` (optionally prefixed with `v`) into numbers, or null when invalid. */
export function parseVersion(text) {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(text ?? '').trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/** Compares two parsed versions: negative when a < b, 0 when equal, positive when a > b. */
export function compareVersions(a, b) {
  for (let i = 0; i < 3; i += 1) {
    if (a[i] !== b[i]) return a[i] - b[i];
  }
  return 0;
}

/** Bumps the last digit by one, carrying into the next digit once a digit passes 9. */
export function bumpVersion(version) {
  const parsed = typeof version === 'string' ? parseVersion(version) : version;
  if (!parsed) throw new Error(`Invalid version: ${version}`);
  let [major, minor, patch] = parsed;
  patch += 1;
  if (patch > MAX_DIGIT) {
    patch = 0;
    minor += 1;
  }
  if (minor > MAX_DIGIT) {
    minor = 0;
    major += 1;
  }
  return `${major}.${minor}.${patch}`;
}

/** Highest valid version among `candidates` (strings like `0.4.7` or `v0.4.7`), or null. */
export function highestVersion(candidates) {
  let best = null;
  for (const candidate of candidates) {
    const parsed = parseVersion(candidate);
    if (parsed && (!best || compareVersions(parsed, best) > 0)) best = parsed;
  }
  return best ? best.join('.') : null;
}

/** Extracts `vX.Y.Z` tag names from `git ls-remote --tags` output. */
export function parseRemoteTags(lsRemoteOutput) {
  return String(lsRemoteOutput ?? '')
    .split(/\r?\n/)
    .map(line => /refs\/tags\/(v\d+\.\d+\.\d+)$/.exec(line.trim())?.[1])
    .filter(Boolean);
}
