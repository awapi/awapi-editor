---
name: electron-ipc
description: "Add or modify Electron IPC channels across Main, Preload, and Renderer in Awapi Editor. Use when exposing new OS/filesystem capabilities, native dialogs, menus, or window events between src/main, src/preload, and src/renderer."
---

# Electron IPC Channel Workflow

## Overview
Awapi Editor enforces strict process isolation: the Renderer (`src/renderer/`) has `nodeIntegration` disabled and cannot access Node.js (`fs`, `path`, `child_process`) or Electron main-process APIs directly. All cross-process communication goes through typed IPC channels bridged onto `window.electronAPI`.

## When to Use
- Adding a new `ipcMain.handle` (request/response) or `webContents.send` / `ipcMain.on` (event) channel
- Exposing a new method or event listener on `window.electronAPI`
- Sharing payload types between Main, Preload, and Renderer

## Step-by-Step Procedure

### 1. Define Shared Types (if needed)
If the IPC payload or return type is non-trivial, define it in `src/shared/` (e.g. `src/shared/terminal.ts`, `src/shared/encodings.ts`, `src/shared/images.ts`) so Main, Preload, and Renderer import the exact same TypeScript interface without `any`.

### 2. Implement Main Process Handler (`src/main/`)
1. Extract pure or testable business logic into a dedicated module in `src/main/` (e.g. `src/main/explorer.ts`, `src/main/openFiles.ts`, `src/main/zoom.ts`) with a matching unit test file `src/main/<module>.test.ts`.
2. Register the handler in `src/main/main.ts` using a namespaced channel name (`<domain>:<action>`, such as `file:read`, `explorer:readDir`, `dialog:openFile`):
   - **Request/Response:** `ipcMain.handle('domain:action', async (event, ...args) => { ... })`
   - **Main-to-Renderer Event:** `mainWindow.webContents.send('domain:event', payload)` (use `sendWhenLoaded` from `src/main/windowDelivery.ts` when sending during window startup).

### 3. Expose Channel in Preload Bridge (`src/preload/index.ts`)
Add the wrapper method to `electronAPI` in `src/preload/index.ts`:
- For `invoke` calls:
  ```ts
  myAction: (arg: string) => ipcRenderer.invoke('domain:action', arg) as Promise<MyResult>,
  ```
- For event subscriptions, return an unsubscribe function when appropriate:
  ```ts
  onMyEvent: (callback: (payload: MyPayload) => void) => {
    const listener = (_: unknown, payload: MyPayload) => callback(payload);
    ipcRenderer.on('domain:event', listener);
    return () => {
      ipcRenderer.removeListener('domain:event', listener);
    };
  },
  ```
- If the listener is registered via `App.tsx`'s global listener cleanup, also include the channel in `removeListeners()` in `src/preload/index.ts`.

### 4. Declare Global Window Types (`src/preload/globals.d.ts`)
Add the exact method signature and JSDoc comment to `Window['electronAPI']` in `src/preload/globals.d.ts`.

### 5. Mock in Renderer Tests & Verify
1. If `App.tsx` calls or subscribes to the new `window.electronAPI` method on mount, add a default `vi.fn()` mock for it in `beforeEach` inside `src/renderer/src/App.test.tsx`.
2. Add unit tests for both the Main module (`src/main/<module>.test.ts`) and Renderer usage (`src/renderer/src/<Component>.test.tsx`).
3. Run `pnpm run typecheck` and `pnpm run test` to validate end-to-end type safety and test coverage.
