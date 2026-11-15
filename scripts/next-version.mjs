#!/usr/bin/env node
/**
 * Prints the next release version for Awapi Editor.
 *
 * The current version is the highest of `package.json` and the `vX.Y.Z` tags
 * published on GitHub (`origin`). The next version bumps the last digit by one,
 * and each digit rolls over after 9:
 *
 *   0.4.7 -> 0.4.8,  0.4.9 -> 0.5.0,  0.9.9 -> 1.0.0
 *
 * Usage:
 *   node scripts/next-version.mjs            # prints e.g. 0.4.8
 *   node scripts/next-version.mjs --verbose  # also explains where the base came from (stderr)
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { bumpVersion, highestVersion, parseRemoteTags } from './version-utils.mjs';

function main() {
  const verbose = process.argv.includes('--verbose');
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const pkgVersion = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;

  let remoteTags = [];
  try {
    remoteTags = parseRemoteTags(
      execFileSync('git', ['ls-remote', '--tags', 'origin'], { cwd: root, encoding: 'utf8' }),
    );
  } catch {
    if (verbose) console.error('Could not read tags from origin; using package.json only.');
  }

  const current = highestVersion([pkgVersion, ...remoteTags]);
  if (!current) throw new Error(`No valid version found (package.json: ${pkgVersion})`);
  const next = bumpVersion(current);
  if (verbose) {
    const latestTag = highestVersion(remoteTags);
    console.error(`package.json: ${pkgVersion}, latest GitHub tag: ${latestTag ? `v${latestTag}` : 'none'}`);
    console.error(`current: ${current} -> next: ${next}`);
  }
  console.log(next);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
