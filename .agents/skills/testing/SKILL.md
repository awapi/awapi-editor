---
name: testing
description: "Write and run unit and component tests in Awapi Editor using Vitest and React Testing Library. Use when adding or modifying functions, hooks, IPC handlers, or React components, or when diagnosing test/typecheck failures."
---

# Testing & Verification Workflow

## Overview
Unit tests are mandatory in Awapi Editor. Every new or modified function, hook, main-process helper, or React component must have corresponding unit test coverage alongside the implementation file.

## When to Use
- Creating or modifying any `.ts` or `.tsx` file in `src/main/`, `src/shared/`, or `src/renderer/src/`
- Running targeted or full test suites and TypeScript typechecking
- Fixing test failures or flaky async UI assertions

## Step-by-Step Procedure

### 1. Place Test Files Alongside Implementation
Always co-locate test files next to the source file they test:
- `src/main/<name>.ts` → `src/main/<name>.test.ts`
- `src/shared/<name>.ts` → `src/shared/<name>.test.ts`
- `src/renderer/src/<Component>.tsx` → `src/renderer/src/<Component>.test.tsx`

### 2. Follow Project Testing Patterns
- **Main & Shared tests (`src/main/*.test.ts`, `src/shared/*.test.ts`):**
  - Keep core logic pure or accept dependency-injected interfaces so tests run quickly without launching a live Electron binary.
- **Renderer component tests (`src/renderer/src/*.test.tsx`):**
  - Use `@testing-library/react` (`render`, `screen`, `fireEvent`, `waitFor`, `act`).
  - Wrap components that consume theme context in `<ThemeProvider>`.
  - Prefer `data-testid` attributes for stable element queries.
  - Mock `window.electronAPI` methods with `vi.fn()`.
  - When testing state updates triggered by async promises (such as `loadSession()` or `readFile()`), use `await waitFor(...)` for assertions that depend on effects flushing across parent/child components.

### 3. Run Targeted Tests First
Run the smallest test command covering your changes from the repository root:
```bash
pnpm vitest run src/renderer/src/<Component>.test.tsx
# or for main/shared tests:
pnpm vitest run ../main/<module>.test.ts
```

### 4. Run Full Typecheck & Test Suite When Needed
Before finishing a cross-cutting change:
```bash
pnpm run typecheck
pnpm run test
```
