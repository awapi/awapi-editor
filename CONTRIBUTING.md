# Contributing to Awapi Editor

Thanks for your interest in contributing to Awapi Editor! This document explains how to get started.

## Prerequisites

- **Node.js** (v22 or newer)
- **Vite**, **Electron** & **React** knowledge
- [just](https://github.com/casey/just) command runner (optional but recommended)

## Getting Started

```sh
# Clone the repo
git clone https://github.com/awapi/awapi-editor.git
cd awapi-editor

# Install dependencies
just install

# Run the app in development mode
just dev
```

## Development Workflow

1. **Fork** the repository and create a branch from `main`.
2. Make your changes.
3. Run checks before submitting:

```sh
just typecheck    # TypeScript type-check
just test         # Frontend unit tests
```

4. Open a **Pull Request** against `main`.

## Project Structure

| Directory | Purpose |
|---|---|
| `src/main/` | Electron main process (native OS integrations, file system) |
| `src/preload/` | Preload scripts (secure bridge between main and renderer) |
| `src/renderer/`| React frontend (UI layer strictly without nodeIntegration) |
| `src/renderer/src/` | React components, hooks, and core logic |
| `build/` | App icons and packaging artifacts |
| `scripts/` | Helper scripts (e.g. icon generation) |

## Code Style

### TypeScript / React

- Functional components with hooks — no class components.
- Use `useCallback` and `useMemo` for optimizations where necessary.
- Strict typing is mandatory. Avoid `any`.
- Keep Inter-Process Communication (IPC) calls lightweight and document both sides in `src/main` and `src/preload`.

## Testing

- **Unit tests are mandatory** testing for all new or updated files, UI components, and state logic.
- Tests (Vitest & React Testing Library) should be placed exactly alongside their implementation file (e.g., `App.test.tsx` next to `App.tsx`).
- Never leave a core application logic untested.
- Run tests (`just test`) to ensure everything passes before submitting.

## Reporting Issues

- Use [GitHub Issues](https://github.com/awapi/awapi-editor/issues) to report bugs or request features.
- Include steps to reproduce, expected behaviour, and your OS/version.

## Pull Request Guidelines

- Keep PRs focused — one feature or fix per PR.
- Write a clear title and description of what changed and why.
- Reference any related issues (e.g. `Fixes #42`).
- Make sure all CI checks pass before requesting review.

## License

By contributing, you agree that your contributions will be licensed under the [Apache License 2.0](LICENSE).
