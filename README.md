# AwapiEditor

[![CI](https://github.com/awapi/awapi-editor/actions/workflows/ci.yml/badge.svg)](https://github.com/awapi/awapi-editor/actions/workflows/ci.yml)
[![Release Builds](https://github.com/awapi/awapi-editor/actions/workflows/release.yml/badge.svg)](https://github.com/awapi/awapi-editor/actions/workflows/release.yml)

AwapiEditor is a fast, lightweight, universal text editor built specifically for cross-platform usage across macOS, Windows, and Linux.

## ✨ Features

- **Cross-Platform:** Runs seamlessly natively on macOS, Windows, and Linux.
- **Modern Tech Stack:** Built on top of Electron, featuring a React 19 UI layer, strictly typed with TypeScript.
- **Powerful Editor Engine:** Uses Monaco Editor (`@monaco-editor/react`) for a rich, high-performance coding experience.
- **Lightning Fast Build Tools:** Powered by Vite (`vite-plugin-electron`, `vite-plugin-electron-renderer`) for an unmatched developer experience and fast Hot Module Replacement (HMR).
- **Secure architecture:** Strict separation between the Main, Preload, and Renderer processes.

## � Installation

### macOS

1. Download the latest `.dmg` from the [Releases](https://github.com/awapi/awapi-editor/releases) page.
2. Open the `.dmg` and drag **AwapiEditor** into your `/Applications` folder.
3. Because the app is currently **not code-signed**, macOS Gatekeeper will warn on first launch. Right-click (or Control-click) **AwapiEditor.app** → **Open** → **Open** to bypass the warning.
   If that doesn't work, run this once in Terminal:
   ```bash
   xattr -cr "/Applications/AwapiEditor.app"
   ```
4. Launch AwapiEditor normally from Launchpad or Spotlight.

### Windows

1. Download the latest `.exe` installer from the [Releases](https://github.com/awapi/awapi-editor/releases) page.
2. Run the installer and follow the on-screen steps.

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
- **npm** (v10 or newer)
- [just](https://github.com/casey/just) command runner (optional, but highly recommended)

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/awapi/awapi-editor.git
   cd awapi-editor
   ```

2. Install dependencies:
   ```bash
   npm install
   # or with just:
   just install
   ```

### Running the App

Start the development server with Hot Module Replacement (HMR) for the renderer and auto-restart for the main process:
```bash
npm run dev
# or with just:
just dev
```

### Testing & Typechecking

All core application logic requires testing via Vitest. Ensure everything passes before submitting changes.
```bash
npm run test
# or with just:
just test

# Check for TypeScript issues explicitly:
npm run typecheck
# or:
just typecheck
```

### Packaging & Release

To build the application for your current operating system:
```bash
npm run package
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