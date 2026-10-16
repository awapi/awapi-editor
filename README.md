# AwapiEditor

[![CI](https://github.com/awapi/awapi-editor/actions/workflows/ci.yml/badge.svg)](https://github.com/awapi/awapi-editor/actions/workflows/ci.yml)
[![Release Builds](https://github.com/awapi/awapi-editor/actions/workflows/release.yml/badge.svg)](https://github.com/awapi/awapi-editor/actions/workflows/release.yml)

AwapiEditor is a fast, lightweight, universal text editor built specifically for cross-platform usage across macOS, Windows, and Linux.

## ✨ Features

- **Cross-Platform:** Runs seamlessly natively on macOS, Windows, and Linux.
- **Modern Tech Stack:** Built on top of Electron, featuring a React 19 UI layer, strictly typed with TypeScript.
- **Powerful Editor Engine:** Uses Monaco Editor (`@monaco-editor/react`) for a rich, high-performance coding experience.
- **Integrated & External Terminals:** A built-in terminal panel (`` Ctrl+` `` to toggle, `` Ctrl+Shift+` `` for a new one) and **Open in External Terminal**, both starting in the current file's folder, with your choice of shell and terminal app in **Preferences**.
- **Lightning Fast Build Tools:** Powered by Vite (`vite-plugin-electron`, `vite-plugin-electron-renderer`) for an unmatched developer experience and fast Hot Module Replacement (HMR).
- **Secure architecture:** Strict separation between the Main, Preload, and Renderer processes.

👉 See the full [Features & Roadmap](docs/features.md) for a complete list of current capabilities and planned enhancements.

## � Installation

### macOS

**Option 1 — One-line install / update (no Gatekeeper prompt):**

Run this in Terminal to automatically download the latest release, install **AwapiEditor** to `/Applications`, and clear macOS quarantine attributes:
```bash
curl -fsSL https://raw.githubusercontent.com/awapi/awapi-editor/main/scripts/install-macos.sh | bash
```

**Option 2 — Manual `.dmg` download:**

1. Download the latest `.dmg` from the [Releases](https://github.com/awapi/awapi-editor/releases) page.
2. Open the `.dmg` and drag **AwapiEditor** into your `/Applications` folder.
3. Because the app is ad-hoc signed without an Apple Developer certificate, macOS Gatekeeper will warn on first launch. Right-click (or Control-click) **AwapiEditor.app** → **Open** → **Open** (or go to **System Settings → Privacy & Security → Open Anyway**).
   Alternatively, run this once in Terminal:
   ```bash
   xattr -cr "/Applications/AwapiEditor.app"
   ```
4. Launch AwapiEditor normally from Launchpad or Spotlight.

### Windows

1. Download the latest `.msi` or `.exe` installer from the [Releases](https://github.com/awapi/awapi-editor/releases) page.
2. Because the app is currently **not code-signed**, Windows Defender SmartScreen will show a *"Windows protected your PC"* warning on first run. Click **More info** → **Run anyway** to proceed.
3. Follow the on-screen installer steps.

### Linux

**Option 1 — AppImage (portable, no install required):**

1. Download the latest `.AppImage` from the [Releases](https://github.com/awapi/awapi-editor/releases) page.
2. Make it executable and run it:
   ```bash
   chmod +x AwapiEditor-*.AppImage
   ./AwapiEditor-*.AppImage
   ```

**Option 2 — Debian/Ubuntu installer (`.deb`):**

1. Download the latest `.deb` from the [Releases](https://github.com/awapi/awapi-editor/releases) page.
2. Install it:
   ```bash
   sudo dpkg -i AwapiEditor-*.deb
   ```
3. Launch AwapiEditor from your application menu or run `awapi-editor` in a terminal.

---

## �🚀 Getting Started

### Prerequisites

- **Node.js** (v22 or newer)
- **pnpm** (v10 or newer)
- [just](https://github.com/casey/just) command runner (optional, but highly recommended)
- **Linux only:** a C/C++ toolchain and Python 3 (e.g. `sudo apt install build-essential python3`). The integrated terminal's `node-pty` module ships prebuilt binaries for macOS and Windows but is compiled during `pnpm install` on Linux.

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/awapi/awapi-editor.git
   cd awapi-editor
   ```

2. Install dependencies:
   ```bash
   pnpm install
   # or with just:
   just install
   ```

### Running the App

Start the development server with Hot Module Replacement (HMR) for the renderer and auto-restart for the main process:
```bash
pnpm run dev
# or with just:
just dev
```

### Testing & Typechecking

All core application logic requires testing via Vitest. Ensure everything passes before submitting changes.
```bash
pnpm run test
# or with just:
just test

# Check for TypeScript issues explicitly:
pnpm run typecheck
# or:
just typecheck
```

### Packaging & Release

To build the application for your current operating system:
```bash
pnpm run package
# or:
just build
```

To automatically trigger a version tag and GitHub Actions build:
```bash
just release 0.2.0
```

## 🤝 Contributing

We heartily welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md) for details on our code structure, development workflow, testing requirements, and how to submit pull requests.

Please also adhere to our [Code of Conduct](CODE_OF_CONDUCT.md).

## 📄 License

This project is licensed under the [Apache License 2.0](LICENSE).