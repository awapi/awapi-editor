# AwapiEditor

AwapiEditor is a fast, lightweight, universal text editor built specifically for cross-platform usage across macOS, Windows, and Linux.

## ✨ Features

- **Cross-Platform:** Runs seamlessly natively on macOS, Windows, and Linux.
- **Modern Tech Stack:** Built on top of Electron, featuring a React 19 UI layer, strictly typed with TypeScript.
- **Powerful Editor Engine:** Uses Monaco Editor (`@monaco-editor/react`) for a rich, high-performance coding experience.
- **Lightning Fast Build Tools:** Powered by Vite (`vite-plugin-electron`, `vite-plugin-electron-renderer`) for an unmatched developer experience and fast Hot Module Replacement (HMR).
- **Secure architecture:** Strict separation between the Main, Preload, and Renderer processes.

## 🚀 Getting Started

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
just release 1.0.0
```

## 🤝 Contributing

We heartily welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md) for details on our code structure, development workflow, testing requirements, and how to submit pull requests.

Please also adhere to our [Code of Conduct](CODE_OF_CONDUCT.md).

## 📄 License

This project is licensed under the [Apache License 2.0](LICENSE).