# Awapi Editor — Release Notes & Architecture

![Awapi Editor Icon](../build/icon-64x64.png "Awapi Editor")

This is a second Markdown sample (`samples/sample-notes.md`) so you can test **multiple Markdown preview popups** open side by side.

---

## Architecture Overview

Awapi Editor separates responsibilities across three Electron layers:

1. **Main Process (`src/main/`)**
   - Native file system I/O, encoding detection, and file watching
   - Window management (Main Window, Pop-out Tabs, and Live Markdown Preview)
   - Integrated PTY terminal sessions (`node-pty`)
2. **Preload Bridge (`src/preload/`)**
   - Exposes a minimal, strongly-typed `window.electronAPI` surface via `contextBridge`
3. **Renderer Process (`src/renderer/`)**
   - React 19 UI + Monaco Editor
   - Zero direct Node.js or `fs` access in the renderer

---

## Performance Checklist

- [x] One live preview popup per Markdown tab
- [x] Magnetic docking to the right edge of the main editor window
- [x] Local image resolution via `awapi-asset://` protocol
- [x] Automatic light/dark theme synchronization
- [ ] Export rendered Markdown to PDF

---

## Comparison Table

| Component | Process | Key Responsibility |
| :--- | :---: | :--- |
| `App.tsx` | Renderer | Multi-tab editor, split/diff views, status bar |
| `MarkdownPreviewWindow.tsx` | Renderer | Live HTML preview popup with GFM styling |
| `markdownPreviewManager.ts` | Main | Window state & magnetic right-edge docking |
| `FileExplorer.tsx` | Renderer | Sidebar workspace tree & Open Editors list |

---

## Quick Snippet

```json
{
  "app": "AwapiEditor",
  "markdownPreview": {
    "liveSync": true,
    "magneticDocking": true,
    "shortcut": "CmdOrCtrl+Shift+V"
  }
}
```

> **Tip:** Open the preview for `sample.md`, then switch to `sample-notes.md` and open its preview too—each tab gets its own preview window, and each one live-updates as you edit its file. Previews stay above other apps only when pinned.
