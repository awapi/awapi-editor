---
name: release
description: "Package, cut, and publish cross-platform releases for Awapi Editor across macOS (.dmg), Windows (.exe, .msi), and Linux (.AppImage, .deb). Use when bumping versions, modifying electron-builder configuration in package.json, updating .github/workflows/release.yml, or troubleshooting installer and Gatekeeper/SmartScreen behavior."
---

# Packaging & Release Workflow

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
Use the `justfile` release recipes (note: only run git tag/push commands when explicitly requested by the user):
- **Draft release only (default):**
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
