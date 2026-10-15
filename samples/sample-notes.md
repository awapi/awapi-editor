# Awapi Editor — Release Notes & Architecture

![Awapi Editor Icon](../build/icon-64x64.png "Awapi Editor")

This is a second Markdown sample (`samples/sample-notes.md`) so you can test **switching between multiple Markdown tabs** while the live preview popup is open.

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

- [x] Instant tab switching with live Markdown preview updates
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

> **Tip:** Click back and forth between `sample.md` and `sample-notes.md` in the editor tab bar—the preview window automatically updates to display whichever Markdown tab is active!
