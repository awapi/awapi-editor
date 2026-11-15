---
name: release
description: "Cut and publish the next Awapi Editor release (/release), or package and troubleshoot cross-platform releases across macOS (.dmg), Windows (.exe, .msi), and Linux (.AppImage, .deb). Use when the user runs /release or asks to release/publish a new version, when bumping versions, modifying electron-builder configuration in package.json, updating .github/workflows/release.yml, or troubleshooting installer and Gatekeeper/SmartScreen behavior."
argument-hint: "[draft] — omit to publish; pass 'draft' to leave the GitHub Release as a draft"
---

# Packaging & Release Workflow

## `/release` — Cut and Publish the Next Version
When the user runs `/release` (or explicitly asks to release / publish a new version), that **is** the explicit request to commit, tag, and push the release. Follow these steps in order and stop with a clear explanation if any step fails. Never force-push, and never edit or delete existing tags.

**Version rule:** the next version is the highest of `package.json` and the latest `vX.Y.Z` tag on GitHub, with the last digit bumped by one and each digit rolling over after 9 (`0.4.7 → 0.4.8`, `0.4.9 → 0.5.0`, `0.9.9 → 1.0.0`). This is implemented in `scripts/next-version.mjs`; never compute it by hand.

1. **Preflight**
   - `git fetch origin --tags` and confirm the current branch is `main`.
   - The working tree must be clean (`git status --porcelain` is empty). If it isn't, stop and tell the user to commit first (e.g. with `/gitpush`). Don't commit unrelated changes as part of a release.
   - If `main` is behind `origin/main`, stop and ask the user to pull. If it is ahead, tell the user those unpushed commits will be pushed with the release.
   - For publishing, `gh auth status` must succeed.
2. **Verify:** `pnpm run typecheck` and `pnpm run test` must both pass.
3. **Show the version:** run `just next-version` and tell the user `current → next`.
4. **Release:**
   - Default (publish): `just release-next publish`. It bumps `package.json`, commits `chore: release vX.Y.Z`, pushes, pushes tag `vX.Y.Z`, waits for the **Release Builds** workflow, then publishes the GitHub Release as latest. CI takes a while, so run it as a long-running command and wait for it.
   - If the user passed `draft`: `just release-next` (leaves a draft release).
5. **Report:** the released version, the release URL `https://github.com/awapi/awapi-editor/releases/tag/vX.Y.Z`, and whether it is published or a draft. If the workflow failed, the draft is left in place; report the failing run (`gh run list --workflow='Release Builds' --limit 1`).

## Overview
Awapi Editor uses Vite + `electron-builder` to build installers for macOS (`.dmg`), Windows (`.exe` NSIS and `.msi`), and Linux (`.AppImage` and `.deb`). Multi-platform releases are built via GitHub Actions (`.github/workflows/release.yml`) and managed with `just` recipes (`justfile`).

## When to Use
- Cutting a new version release or promoting a draft release
- Updating `build` configuration in `package.json` or `.github/workflows/release.yml`
- Updating platform installation instructions in `README.md`, `docs/release-process.md`, or `scripts/install-macos.sh`

## Step-by-Step Procedure

### 1. Pre-Release Checks
1. Verify `main` is clean and all checks pass:
   ```bash
   pnpm run typecheck
   pnpm run test
   ```
2. If native dependencies (`node-pty`) or packaging scripts changed, run the smoke check:
   ```bash
   node scripts/pty-smoke.js
   ```

### 2. Local Packaging (Single OS)
To build installers locally into `release/` without publishing to GitHub:
```bash
pnpm run package
# or:
just package
```

### 3. Cutting a GitHub Release
Use the `justfile` release recipes (only run them when the user explicitly asks for a release, e.g. via `/release`):
- **Next version, automatically (preferred):**
  ```bash
  just next-version            # preview: current -> next
  just release-next            # draft release
  just release-next publish    # draft + auto-publish when CI completes
  ```
- **Explicit version, draft release only:**
  ```bash
  just release X.Y.Z
  ```
  Bumps `package.json`, commits, tags `vX.Y.Z`, and pushes to trigger `.github/workflows/release.yml`, which uploads artifacts to a draft GitHub Release.
- **Draft + auto-publish when CI completes:**
  ```bash
  just release X.Y.Z publish
  ```
- **Publish an existing draft release:**
  ```bash
  just publish X.Y.Z
  ```
  Marks `vX.Y.Z` as published and `--latest` so the in-app updater (`src/main/updater.ts`) and `scripts/install-macos.sh` can discover it via `https://api.github.com/repos/awapi/awapi-editor/releases/latest`.

### 4. Platform Signing & Installer Notes
- **macOS:** Configured in `package.json` (`build.mac`) with `identity: "-"` (ad-hoc signing), `hardenedRuntime: false`, and `gatekeeperAssess: false`. Users can install/update without Gatekeeper prompts via `scripts/install-macos.sh`.
- **Windows:** Builds both `nsis` (`-setup.exe`) and `msi` (`.msi`) targets in `package.json` (`build.win`). Shipped unsigned (users bypass SmartScreen via **More info → Run anyway**).
- **Linux:** Builds `AppImage` and `deb` targets in `package.json` (`build.linux`).
