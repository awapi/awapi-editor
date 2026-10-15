# Awapi Editor — Markdown Preview Sample

![Awapi Editor Logo](../build/icon-128x128.png "Awapi Editor")

Welcome to the **Awapi Editor** live Markdown preview! Open this file (`samples/sample.md`) and click the **Preview** button in the top-right toolbar (or press `Cmd/Ctrl + Shift + V`) to see it rendered in a popup window.

---

## Table of Contents

- [Typography & Inline Formatting](#typography-inline-formatting)
- [Lists & Task Lists](#lists-task-lists)
- [Code Blocks](#code-blocks)
- [Tables](#tables)
- [Blockquotes](#blockquotes)
- [Links](#links)
- [Hello](#hello)

---

## Typography & Inline Formatting

You can style text with **bold**, *italic*, ***bold and italic***, and ~~strikethrough~~.
Use inline code like `npm run dev` or `Cmd/Ctrl + Shift + V` for commands and shortcuts.

### Heading Level 3
#### Heading Level 4
##### Heading Level 5
###### Heading Level 6

---

## Lists & Task Lists

### Unordered List
- Fast, lightweight startup
- Cross-platform support (Windows, macOS, Linux)
- Built-in Monaco Editor with syntax highlighting
  - Split View & Diff View
  - Integrated Terminal

### Ordered List
1. Open `samples/sample.md` in Awapi Editor
2. Click **Preview** in the toolbar (or press `Ctrl+Shift+V`)
3. Edit any line in this file and watch the popup update live!

### Task List (GFM)
- [x] Create Markdown parser and HTML sanitizer
- [x] Add live-updating Markdown Preview popup window
- [x] Support light and dark themes
- [ ] Write your own notes in Markdown

---

## Code Blocks

```typescript
interface Note {
  id: string;
  title: string;
  tags: string[];
  updatedAt: Date;
}

export function formatNoteSummary(note: Note): string {
  const tagList = note.tags.map(t => `#${t}`).join(' ');
  return `${note.title} (${tagList}) — ${note.updatedAt.toISOString()}`;
}
```

```sql
SELECT id, title, created_at
FROM documents
WHERE language = 'markdown'
ORDER BY created_at DESC
LIMIT 10;
```

---

## Tables

| Feature | Shortcut (Win/Linux) | Shortcut (macOS) | Status |
| :--- | :---: | :---: | ---: |
| Open Markdown Preview | `Ctrl + Shift + V` | `Cmd + Shift + V` | Ready |
| Pop Out Active Tab | `Ctrl + Shift + N` | `Cmd + Shift + N` | Ready |
| Toggle File Explorer | `Ctrl + B` | `Cmd + B` | Ready |
| Toggle Terminal | `` Ctrl + ` `` | `` Ctrl + ` `` | Ready |

---

## Blockquotes

> "Simplicity is prerequisite for reliability."
> — Edsger W. Dijkstra

---

## Links

- Project Repository: <https://github.com/awapi/awapi-editor>
- [Jump back to top](#awapi-editor-markdown-preview-sample)
