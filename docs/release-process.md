# Release Process

## Cutting a release

1. Ensure `main` is green (CI passes).
2. Run `just release X.Y.Z` — bumps the version, commits, tags, and pushes.
   CI picks up the tag and builds installers on all three platforms.

## Packaging targets

| OS      | Target              | Notes                |
| ------- | ------------------- | -------------------- |
| macOS   | `.dmg`              | x64 and arm64 via CI |
| Windows | `.exe` (NSIS), `.msi` | x64 and arm64 via CI |
| Linux   | `.AppImage`, `.deb` | x64 and arm64 via CI |

Local packaging (current OS only):
```bash
pnpm run package
# or:
just build
```

Artifacts land in `release/`.

## Code signing

**Status: not yet provisioned — TODO when certificates are obtained.**

The app is currently shipped without paid Apple/Microsoft certificates. The
`package.json` mac config sets `hardenedRuntime: false`,
`gatekeeperAssess: false`, and `identity: "-"` (ad-hoc signature) so that
Apple Silicon Macs have a valid bundle signature seal and macOS Gatekeeper
shows a dismissible warning rather than a "damaged app" block.

### User-facing workaround (until signing is in place)

- **macOS (automatic):** `curl -fsSL https://raw.githubusercontent.com/awapi/awapi-editor/main/scripts/install-macos.sh | bash`
- **macOS (manual `.dmg`):** Right-click → **Open** → **Open** (or **System Settings → Privacy & Security → Open Anyway**) on first launch, or run `xattr -cr "/Applications/AwapiEditor.app"`.
- **Windows:** SmartScreen "Windows protected your PC" → **More info → Run anyway**.
- **Linux:** No warning for `.AppImage` (after `chmod +x`) or `.deb`.

### When certificates are provisioned

1. Obtain an **Apple Developer ID** certificate and enroll in notarization.
2. In `package.json`, update the `mac` section:
   - Set `"hardenedRuntime": true`
   - Remove `"gatekeeperAssess": false` and `"identity": "-"`
3. Set the following environment variables in CI (GitHub Actions secrets):
   - `CSC_LINK` — base64-encoded `.p12` certificate
   - `CSC_KEY_PASSWORD` — certificate password
   - `APPLE_ID` — Apple ID used for notarization
   - `APPLE_TEAM_ID` — Apple Developer Team ID
   - `APPLE_APP_SPECIFIC_PASSWORD` — app-specific password for notarization
4. For Windows (optional EV/OV cert):
   - `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD`

See [electron-builder code signing docs](https://www.electron.build/code-signing) for full details.
