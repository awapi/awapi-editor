# Awapi Editor - Agent Instructions

## Project Overview
Awapi Editor is a fast, lightweight, universal text editor built specifically for cross-platform usage across macOS, Windows, and Linux.

## Core Tech Stack
- **Framework:** Electron (Node.js & Chromium)
- **Frontend / UI:** React 19 (Functional components, Hooks)
- **Editor Engine:** Monaco Editor (`@monaco-editor/react`)
- **Build Tool:** Vite (with `vite-plugin-electron` and `vite-plugin-electron-renderer`)
- **Language:** TypeScript
- **Testing:** Vitest, React Testing Library, JSDOM

## Architecture Constraints & Security
- **Main Process (`src/main/`):** Handles all OS-level operations natively (File system reading/writing, native dialogs, application menus).
- **Preload Script (`src/preload/`):** Acts as the secure bridge. Exposes safe, mapped IPC channels to `window.electronAPI` via `contextBridge`.
- **Renderer Process (`src/renderer/`):** Strict UI layer. Has **no** `nodeIntegration`. Cannot use `fs` or `path` directly. Must exclusively call `window.electronAPI` for backend tasks.

## Coding Style & Patterns
- Write modern, functional React components with descriptive names.
- Always use TypeScript with strict typing. Avoid `any` whenever possible.
- Keep Inter-Process Communication (IPC) calls lightweight and document both sides natively.

## Agent Customization & Skills Convention
- Use this root `AGENTS.md` file as the single vendor-neutral source of project instructions across all AI coding agents. Do not create tool-specific instruction files (such as `.github/copilot-instructions.md`).
- Store project skills in `.agents/skills/<skill-name>/SKILL.md` using the open Agent Skills specification so they remain generic and portable across agents, rather than under `.github/skills/`:
  - [electron-ipc](./.agents/skills/electron-ipc/SKILL.md) — Adding or updating Electron IPC channels across Main, Preload, and Renderer.
  - [testing](./.agents/skills/testing/SKILL.md) — Writing and running Vitest & React Testing Library unit/component tests and typechecking.
  - [release](./.agents/skills/release/SKILL.md) — Packaging, cutting, and publishing cross-platform releases (`.dmg`, `.exe`, `.msi`, `.AppImage`, `.deb`).

## 🚨 CRITICAL: Testing Requirements
- **Unit Tests are Mandatory:** Whenever you create a new method, function, or UI component—or modify an existing one—you MUST add and update the corresponding unit tests immediately.
- Use `vitest` for all logic and state testing.
- Use `@testing-library/react` and `@testing-library/jest-dom` for validating UI renders and browser events.
- Test files should be placed exactly alongside their implementation file (e.g., `[filename].test.ts` or `[filename].test.tsx` next to `[filename].ts`).
- Never leave a function untested if it contains core application logic or state transformations (e.g., file saving logic, tab parsing).

## 🚨 CRITICAL: Git Operations
- **Never run `git add`, `git commit`, or `git push` automatically.** Do not stage, commit, or push changes unless the user explicitly asks you to do so in their current request.
