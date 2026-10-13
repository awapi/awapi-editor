# Code Review TODO — Phase 1–3 Features

Findings from the code review of the uncommitted Phase 1–3 feature work (tabs, recent files, file watching, encoding, split/diff, find in tabs, text operations).

Baseline at review time: `npx vitest run` → 212/212 passed, `npx tsc --noEmit` → clean.

Each item should be fixed with accompanying unit tests (see `.github/copilot-instructions.md`).

---

## 🔴 High

- [x] **CR-01 — Diff View edits are silently lost**
  - **Where:** [App.tsx](../src/renderer/src/App.tsx) — `<DiffEditorComponent>` render block.
  - **Problem:** `DiffEditor` is rendered with `readOnly: false`, but no change handler writes edits back into `tabs`. Typed changes are discarded on the next re-render.
  - **Fix:** Either set `readOnly: true` (and `originalEditable: false`), or subscribe to the original/modified models' `onDidChangeContent` in `onMount` and update both tabs (including dirty state).
  - **Resolved:** Only the right (modified) side of the diff is editable (`originalEditable: false`), and its edits sync back to the compared tab via `onDidChangeModelContent` (`handleDiffEditorMount`). The toolbar marks the left side as read-only. Test: `App.test.tsx` (CR-01).

- [x] **CR-02 — New menu accelerators override core Monaco shortcuts**
  - **Where:** [main.ts](../src/main/main.ts) — `Keyboard Shortcuts…` (`CmdOrCtrl+/`) and `Go to Line...` (`CmdOrCtrl+G`); also [ShortcutsModal.tsx](../src/renderer/src/ShortcutsModal.tsx), [docs/features.md](./features.md), and the empty-state hint in `App.tsx`.
  - **Problem:** `Cmd/Ctrl+/` is Monaco's *Toggle Line Comment*; `Cmd+G` is Monaco's *Find Next* on macOS.
  - **Fix:** Use `Ctrl+G` for Go to Line on Windows/Linux only (macOS: e.g. `Cmd+L` or `Ctrl+G`), and choose a non-conflicting accelerator for the shortcuts sheet (or none). Update the shortcuts modal, docs, and hint text accordingly.
  - **Resolved:** Go to Line is now `Ctrl+G` on all platforms (Monaco's own binding; `Cmd+G` stays Find Next on macOS). The shortcuts sheet moved to `Shift+F1`. The accelerators live in `src/main/shortcuts.ts`, with a test that checks they don't clash with Monaco keys. Shortcuts modal, tooltip, empty-state hint and `features.md` updated.

- [x] **CR-03 — `file:read` pollutes the Open Recent list**
  - **Where:** [main.ts](../src/main/main.ts) — `ipcMain.handle('file:read', …)`.
  - **Problem:** Every `readFile` call runs `addRecentFile` + `rebuildAppMenu`, including session restore, reopen-closed-tab, and drag & drop. On each launch every restored tab is pushed to the recent list (reordering it) with one settings write and menu rebuild per tab.
  - **Fix:** Only record recents for user-initiated opens (open dialog, Open Recent, drop, OS "Open With", Save/Save As) — e.g. add an explicit `{ trackRecent?: boolean }` option to `readFile`, or a dedicated IPC.
  - **Resolved:** `file:read` now takes `{ encoding?, trackRecent? }` (validated in `src/main/readFileOptions.ts`) and records recents only when `trackRecent` is true (drag & drop). OS "Open With", CLI and Open Recent record in `sendFileToRenderer`. Session restore and reopen-closed-tab no longer touch the list. Tests: `readFileOptions.test.ts`, `App.test.tsx` (CR-03).

- [x] **CR-04 — File watcher goes stale after atomic saves**
  - **Where:** [fileWatcher.ts](../src/main/fileWatcher.ts) — `syncWatchedFiles` (`fs.watch(filePath, …)`).
  - **Problem:** `fs.watch` on a file is bound to its inode. Editors/tools that save via write-temp-then-rename (vim, VS Code, `git checkout`) leave the watcher attached to a dead inode; the path stays in `watchers`, so further external changes are never detected.
  - **Fix:** On a `rename` event, close and re-create the watcher for that path (if the file still exists), or watch the parent directory and filter by filename.
  - **Resolved:** A `rename` event re-creates the watcher for whatever file is now at the path. A missing path is re-checked once after `RENAME_RECHECK_MS` before being reported as deleted. Watcher `error`s are handled. `refreshWatchedFile()` runs after each save, so a deleted-then-saved file is watched again. Checked with unit tests and a real-filesystem atomic-save run on macOS.

- [x] **CR-05 — `Cmd/Ctrl+W` closes pop-out windows without an unsaved-changes prompt**
  - **Where:** [main.ts](../src/main/main.ts) — `Close Tab` menu item (`targetWin.close()` for pop-outs).
  - **Problem:** Pop-out windows have no dirty check on close, so one keystroke discards unsaved edits.
  - **Fix:** Send `menu:closeTab` to the pop-out renderer and let it run the same `confirmCloseTab` flow before closing its window (or add a `close` handler that asks the renderer for dirty state).
  - **Resolved:** All pop-out close paths (Cmd/Ctrl+W, Close Window, title-bar button) go through the window's `close` event, guarded by `src/main/popoutCloseGuard.ts`. Pop-outs report dirty state (`window:setDirty`); while dirty, main asks the renderer to run the Save / Don't Save / Cancel prompt, and it closes via `window:confirmClose`. Move to Main Window and crashed renderers bypass the guard. Tests: `popoutCloseGuard.test.ts`, `App.popout.test.tsx`.

## 🟠 Medium

- [x] **CR-06 — Sort Lines moves the trailing newline to the top**
  - **Where:** [textOperations.ts](../src/renderer/src/textOperations.ts) — `sortLinesAscending` / `sortLinesDescending` (and `removeEmptyLines`).
  - **Problem:** `"b\na\n"` → `["b","a",""]` → ascending sort → `"\na\nb"`. `removeEmptyLines` also strips the file's final newline.
  - **Fix:** Exclude a trailing empty segment from the operation and re-append it afterwards.
  - **Resolved:** Sort, Remove Duplicate Lines and Remove Empty Lines now leave out a single trailing newline, run the operation, then add it back (`mapLines` in `textOperations.ts`). If every line is removed, the newline is dropped too. Tests: `textOperations.test.ts` (CR-06).

- [x] **CR-07 — Regex Replace All behaves differently from the search results**
  - **Where:** [FindInTabsPanel.tsx](../src/renderer/src/FindInTabsPanel.tsx) — `replaceAllInTabs`.
  - **Problem:**
    - Search runs per line; replace runs on the whole document without the `m` flag, so `^foo` lists every line but replaces only the first.
    - Each match is re-run against the matched substring alone, so lookarounds / `\b` fail; the text is unchanged but `tabCount` still increments.
  - **Fix:** Build the replace regex with the `m` flag and use `content.replace(regex, replacement)` directly (it already supports `$1`, `$&`). Keep literal replacement for non-regex mode (escape `$`).
  - **Resolved:** Replace now runs line by line with the same regex as the search, so it replaces exactly the matches that are listed: `^`/`$` anchor to each line, and lookarounds and `\b` see the whole line. This is better than the suggested `m`-flag fix, which would still let `\s` match across lines. In regex mode, the replacement text is expanded from the real match by `expandReplacement`, which follows `String.prototype.replace` rules (`$1`–`$99`, `$&`, `` $` ``, `$'`, `$<name>`, `$$`). In literal mode, the text is inserted exactly as typed. Empty matches are skipped, as they are in the search. Tests: `FindInTabsPanel.test.tsx` (CR-07, `expandReplacement`, including checks against native `replace` output).

- [x] **CR-08 — Encoding change is lossy and there is no "Reopen with Encoding"**
  - **Where:** [App.tsx](../src/renderer/src/App.tsx) — `handleEncodingChange`; [EncodingSelector.tsx](../src/renderer/src/EncodingSelector.tsx); [main.ts](../src/main/main.ts) `file:read` `forcedEncoding`.
  - **Problem:** Selecting `ISO-8859-1` immediately replaces all non-Latin-1 characters with `?` in the buffer, without warning. `file:read`'s `forcedEncoding` is never used by the renderer, so a mis-detected file cannot be re-decoded.
  - **Fix:** Make the selector offer *Save with Encoding* (apply on save only, warn if characters can't be represented) and *Reopen with Encoding* (re-read via `readFile(path, encoding)`).
  - **Resolved:** The status-bar selector now offers **Reopen with Encoding** and **Save with Encoding**. Reopen calls `readFile(path, { encoding })` and asks first if the tab has unsaved changes (`dialog:confirmReopenWithEncoding`); it is disabled for untitled tabs. Save with Encoding switches the tab's encoding only after the save succeeds. Every save path (Save, Save As, Save All, close prompt, Save with Encoding) warns before writing characters the encoding can't represent (`countUnrepresentableCharacters` + `dialog:confirmLossyEncoding`). If the user saves anyway, the buffer is updated to match what was written. Choosing an encoding never changes the text by itself. Tests: `EncodingSelector.test.tsx`, `encodings.test.ts`, `App.test.tsx` (CR-08).

- [x] **CR-09 — External reloads ignore the tab's encoding**
  - **Where:** [fileWatcher.ts](../src/main/fileWatcher.ts) — `handleDiskEvent` / `ExternalFileChangePayload`; `onExternalFileChange` in [App.tsx](../src/renderer/src/App.tsx).
  - **Problem:** Always auto-detects and the payload has no `encoding`, so a tab opened with a specific encoding (or whose file changed encoding on disk) ends up with mismatched content/encoding.
  - **Fix:** Include the detected `encoding` in the payload and update the tab; optionally let the watcher know each path's current encoding to decode consistently.
  - **Resolved:** The renderer now sends `{ filePath, encoding }` for each open file. The watcher decodes changes with the tab's encoding as long as the bytes still fit it (`resolveDecodingEncoding`); a BOM, invalid UTF-8, an odd UTF-16 length and similar mismatches fall back to auto-detection. The payload now includes `encoding`, and the tab's encoding is updated on reload. Tests: `fileWatcher.test.ts`, `encoding.test.ts`, `encodings.test.ts`, `App.test.tsx` (CR-09).

- [x] **CR-10 — Stale closure in the `onCloseTab` IPC listener**
  - **Where:** [App.tsx](../src/renderer/src/App.tsx) — `onCloseTab` listener and `closeTabsByIds` (`secondaryTabId && closedIds.includes(...)`).
  - **Problem:** The listener is registered once and captures the first render's `closeTabsByIds`, where `secondaryTabId` is always `null`. Closing via `Cmd/Ctrl+W` never reassigns the split/diff secondary pane.
  - **Fix:** Track `secondaryTabId` in a ref (like `tabsRef`) and read it inside `closeTabsByIds`.
  - **Resolved:** `closeTabsByIds` now reads `secondaryTabIdRef`. Test: `App.test.tsx` (CR-10). It fails with the old stale closure: after Cmd/Ctrl+W and Reopen Closed Tab, the closed tab reappeared in the secondary pane.

- [x] **CR-11 — Pop-out windows don't get external-change detection**
  - **Where:** [main.ts](../src/main/main.ts) — `file:watchSync`; [App.tsx](../src/renderer/src/App.tsx) watch-sync effect (`if (isPopoutMode) return;`).
  - **Problem:** Notifications only go to `mainWindow`, and pop-outs never register their file. Contradicts [features.md](./features.md).
  - **Fix:** Track watched paths per `webContents` and route events to the owning window(s); enable the sync effect in pop-outs.
  - **Resolved:** Main keeps a `WatchRegistry` (`src/main/watchRegistry.ts`) that maps each window's `webContents.id` to its open files. The watchers run on all of those files together, and each change or delete event goes only to the windows that have that file open. A window's entries are removed when its `webContents` is destroyed. The watch-sync effect now runs in pop-outs too. Tests: `watchRegistry.test.ts`, `App.popout.test.tsx` (CR-11).

- [x] **CR-12 — One unreadable file breaks a multi-file open**
  - **Where:** [main.ts](../src/main/main.ts) — `ipcMain.handle('dialog:openFile', …)`.
  - **Problem:** `fs.readFileSync` inside `.map` without try/catch; one failure rejects the whole open.
  - **Fix:** Wrap each read, skip failures, and surface an error dialog listing the files that couldn't be opened.
  - **Resolved:** `readFilesForOpen` (`src/main/openFiles.ts`) reads each file separately. The readable files open, and a non-blocking error dialog lists each file that failed with its error (`formatOpenFailures`). If no file can be read, the dialog returns `null`. Only files that opened are added to Open Recent. Tests: `openFiles.test.ts`.

## 🟡 Low / Cleanup

- [x] **CR-13 — `openFileDialog` return type mismatch**
  - **Where:** [globals.d.ts](../src/preload/globals.d.ts).
  - **Problem:** Typed as `OpenedFileResult | OpenedFileResult[] | null`, but main always returns `{ ...files[0], files }`.
  - **Fix:** Tighten the type and simplify the renderer's normalization logic.
  - **Resolved:** `dialog:openFile` now returns `OpenedFile[] | null` (only the files that could be read). `OpenedFile` is declared once in `globals.d.ts` and also used for `readFile`/`onExternalFileChange`. The preload return is typed, and the renderer just checks for an empty list instead of handling three shapes. Tests: `App.test.tsx` (multi-file open, null/empty result).

- [x] **CR-14 — Main process imports renderer source; test-only code path in production**
  - **Where:** [main/encoding.ts](../src/main/encoding.ts).
  - **Problem:** Imports from `../renderer/src/encodings` (cross-layer coupling). `decodeRawFileInput` has a `string` branch that exists only for mocked `fs` in tests.
  - **Fix:** Move shared encoding logic to e.g. `src/shared/encodings.ts`; make tests return `Buffer`s from mocked `fs`.
  - **Resolved:** Moved to `src/shared/encodings.ts` (pure, no Node or DOM-only APIs), used by main, preload (type only) and renderer. The duplicated `EncodingKind` unions in `session.ts`, `preload/index.ts` and `globals.d.ts` now import the shared type. `decodeRawFileInput` accepts only bytes; the mocked `fs` in `fileWatcher.test.ts` returns `Buffer`s like the real one. Vitest now includes `src/shared`. Tests: `shared/encodings.test.ts`, `main/encoding.test.ts`.

- [x] **CR-15 — "Always on Top" menu checkbox reflects only the main window**
  - **Where:** [main.ts](../src/main/main.ts) — `View → Always on Top` in `rebuildAppMenu`.
  - **Problem:** On macOS the app menu is shared; with a pop-out focused the checkbox shows the main window's state.
  - **Fix:** Rebuild/update the menu item on window `focus` using the focused window's state.
  - **Resolved:** The checkbox has an id (`ALWAYS_ON_TOP_MENU_ID`) and `syncAlwaysOnTopMenuItem` updates it on `browser-window-focus` and after every toggle (`refreshAlwaysOnTopMenus`). `appMenuAlwaysOnTopWindow` chooses which window it reflects: the focused window on macOS (shared menu), and the main window elsewhere (pop-outs have their own menu bar). Tests: `alwaysOnTop.test.ts`.
  - **Follow-up:** `mainWindow` is set to `null` when the window closes, and `isWindowAlwaysOnTop` ignores destroyed windows, so rebuilding the menu (e.g. Clear Recent) on macOS with no window open no longer throws. Opening a file from Finder or Open Recent with no window open now re-creates the main window and delivers the file once it has loaded (`windowDelivery.ts`). Tests: `alwaysOnTop.test.ts`, `windowDelivery.test.ts`.

- [x] **CR-16 — Multiple reload dialogs can stack for a dirty tab**
  - **Where:** [App.tsx](../src/renderer/src/App.tsx) — `onExternalFileChange`.
  - **Fix:** Track an in-flight prompt per file path; coalesce further events and apply the latest disk content after the user decides.
  - **Resolved:** `reloadPromptsInFlightRef` tracks one open prompt per file path. Change events that arrive while it is open only replace the pending disk content. The user's choice (reload, or keep with `savedContent` updated) is applied to the newest content. Tests: `App.test.tsx` (three events → one prompt; latest content applied; a later change prompts again).

- [x] **CR-17 — Split/Diff view editor wiring**
  - **Where:** [App.tsx](../src/renderer/src/App.tsx) — split left-pane `onMount`; diff view.
  - **Problem:** Split left editor doesn't register cursor/selection listeners (status bar `Ln/Col` freezes). In diff mode `editorRef` points to an unmounted editor (Find, Go to Line, text operations act on a disposed editor).
  - **Fix:** Share one `onMount` handler for the primary editor; in diff mode set `editorRef` to the diff editor's modified/original editor or disable those actions.
  - **Resolved:** `handlePrimaryEditorMount` is shared by the single editor and the split view's left pane, so cursor/selection listeners are always registered. In diff mode, `handleDiffEditorMount` passes the original (left) editor to it, since that side shows the active tab. Find, Go to Line, text operations and the status bar then use the mounted diff editor instead of a disposed one. Tests: `App.test.tsx` (split view status bar; diff Find / Go to Line / cursor).

- [x] **CR-18 — UTF-16 edge cases**
  - **Where:** [encodings.ts](../src/renderer/src/encodings.ts).
  - **Problem:** BOM-less UTF-16 files gain a BOM on save; an odd trailing byte is silently dropped.
  - **Fix:** Track whether the source had a BOM (or add `utf-16le`/`utf-16be` no-BOM variants); warn or preserve on odd length.
  - **Resolved:** Added `utf-16le-nobom` / `utf-16be-nobom`, labelled "UTF-16 LE/BE (no BOM)" (same pattern as `utf-8` / `utf-8-bom`). BOM-less UTF-16 is detected as these variants and saved without a BOM. `resolveDecodingEncoding` reports the no-BOM variant when a file loses its BOM on disk. An odd trailing byte now decodes to U+FFFD, so the loss is visible instead of silent. Tests: `shared/encodings.test.ts`.

- [x] **CR-19 — Find in Tabs recomputes on every render**
  - **Where:** [FindInTabsPanel.tsx](../src/renderer/src/FindInTabsPanel.tsx).
  - **Problem:** Full search across all tabs on every App render (every keystroke) while open; no result cap.
  - **Fix:** `useMemo` on `(tabs, query, options)`, debounce the query, and cap displayed results.
  - **Resolved:** The query and tab content are debounced (`useDebouncedValue`, 150 ms). The search and grouping are memoized on `(tabs, query, options)`, so other App renders don't search. Results are capped at `MAX_FIND_IN_TABS_RESULTS` (1000): `searchInTabs` stops early and the panel shows a "refine your search" notice. Replace All is disabled while a search is pending. Tests: `FindInTabsPanel.test.tsx`, `useDebouncedValue.test.ts`.

- [x] **CR-20 — Personal `.vscode/settings.json` added**
  - **Where:** [.vscode/settings.json](../.vscode/settings.json).
  - **Problem:** Contains a personal Python env setting unrelated to the project.
  - **Fix:** Don't commit it (delete or add `.vscode/` to `.gitignore`).
  - **Resolved:** Removed the `!.vscode/settings.json` exception from `.gitignore`, so personal workspace settings are ignored. The shared `extensions.json`, `launch.json` and `tasks.json` are still allowed. The local file was left in place.

- [x] **CR-21 — Closing the main window discards unsaved pop-out edits** *(found while fixing CR-05; pre-existing)*
  - **Where:** [main.ts](../src/main/main.ts) — `mainWindow.on('close', …)` calls `win.destroy()` on every pop-out.
  - **Problem:** `destroy()` skips the pop-out `close` guard, and pop-out tabs aren't part of the persisted session, so unsaved pop-out edits are lost without a prompt.
  - **Fix:** Before destroying, move dirty pop-out tabs back into the main session (as with Move to Main Window), or run each dirty pop-out's close prompt first and cancel the main-window close if the user cancels.
  - **Resolved:** Closing the main window now runs each dirty pop-out's own Save / Don't Save / Cancel prompt, one at a time (`mainWindowCloseCoordinator.ts`). Once they have all closed, the main close (or a pending quit) is retried. Cancelling any prompt sends `window:cancelClose` and keeps the main window open. Tests: `mainWindowCloseCoordinator.test.ts`, `App.popout.test.tsx`.

