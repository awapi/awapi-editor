# AwapiEditor Features & Roadmap

AwapiEditor is designed around a simple philosophy: **deliver the speed, reliability, and everyday power of editors like Notepad++ without the menu bloat.**

---

## ✅ Current Features

### Tabs & Window Management
- **Multi-Tab Editing:** Open, create (`Cmd/Ctrl+N`), and switch between multiple documents.
- **Close & Reopen Closed Tabs:** Close the active tab with `Cmd/Ctrl+W` and reopen recently closed tabs in LIFO order with `Cmd/Ctrl+Shift+T` (or via the tab right-click menu).
- **Tab Reordering:** Drag and drop tabs to rearrange them; horizontally scroll the tab strip with the mouse wheel when many tabs are open.
- **Quick Tab Creation & Closing:** Click `+` or double-click empty space on the tab bar to create a new tab; middle-click any tab to close it.
- **Tab Context Menu:**
  - Close Tab (`Cmd/Ctrl+W`), Close Other Tabs, Close All Tabs (with unsaved-change protection), and Reopen Closed Tab (`Cmd/Ctrl+Shift+T`).
  - **Rename on Disk:** Rename the underlying file directly from the tab context menu.
  - **Tab Path Utilities:** **Copy Full Path**, **Copy Filename**, **Reveal in Finder / Explorer**, **Open in Integrated Terminal**, and **Open in External Terminal** directly from the tab context menu. Both terminal actions start in the file's folder, or in your home folder for unsaved tabs (see [Terminal](#terminal)).
  - **Split & Diff Actions:** **Open in Split View** and **Compare with Active Tab** directly from the tab context menu.
  - **Per-Tab Editor Theme:** Override the editor surface theme (`Light`, `Dark`, or `Use Default`) per tab independently of the global app theme.
  - **Pop Out to New Window (`Cmd/Ctrl+Shift+N`):** Detach any tab into its own standalone window and move it back to the main window (`Cmd/Ctrl+Shift+M`) at any time.
- **Always on Top (`View -> Always on Top`):** Pin the editor window (or any pop-out window) above other applications from the `View` menu or the tab-bar pin button (`📌`) for quick note-taking.
- **Side-by-Side Split & Diff View:** View and edit two tabs side-by-side (`Split View`) or compare any two open tabs using Monaco's built-in side-by-side diff viewer (`Diff View`), with quick pane swapping and tab selection.

### Terminal
- **Integrated Terminal (`` Ctrl+` ``):** A bottom panel running real shells (via `node-pty`, ConPTY on Windows). Toggle it with `` Ctrl+` `` on every platform, the status-bar terminal button, or `View -> Toggle Terminal`. Opening an empty panel starts a shell in the active file's folder (or your home folder for unsaved tabs).
  - **Multiple Sessions:** Add terminals with `` Ctrl+Shift+` `` (on every platform), `View -> New Terminal`, or `+`; each starts in the active file's folder (home folder for unsaved tabs). Switch between them in the panel header, and close them with `×`. Shells that exit cleanly close their session; failures stay open showing the exit code.
  - **Resizable & Persistent:** Drag the panel's top edge to resize; the height is remembered. Hiding the panel keeps sessions and scrollback.
  - **Copy & Paste:** macOS uses `Cmd+C` / `Cmd+V`. On Windows and Linux, `Ctrl+Shift+C` / `Ctrl+Shift+V` always work, `Ctrl+C` copies when text is selected (otherwise it interrupts the running command), and `Ctrl+V` pastes on Windows.
  - **Linux Requirements:** The integrated terminal needs glibc 2.34+ (Ubuntu 22.04+, Linux Mint 21+, Debian 12+). On older systems the editor still runs and the panel shows that the terminal is unavailable; **Open in External Terminal** keeps working.
- **External Terminal:** **Open in External Terminal** (tab context menu) launches a separate terminal application in the file's folder (your home folder for unsaved tabs).
- **Terminal Preferences:** Choose both in **Preferences -> Terminal**. Each setting offers **Automatic**, the options detected on your machine, or a **Custom…** path.
  - **Integrated terminal shell:** Automatic uses `$SHELL` on macOS/Linux (as a login shell on macOS so your `PATH` is loaded) and PowerShell 7 → Windows PowerShell → Command Prompt on Windows. Detected options include the shells in `/etc/shells`, and on Windows PowerShell 7, Windows PowerShell, Command Prompt, Git Bash, and WSL.
  - **External terminal:** Automatic uses Terminal on macOS; Windows Terminal → PowerShell 7 → Windows PowerShell → Command Prompt on Windows; and `$TERMINAL`, then the system default (`x-terminal-emulator`, launched as the real terminal it points to, e.g. GNOME Terminal on Ubuntu 24.04 / Linux Mint or Ptyxis on Ubuntu 25.10), then the first installed of GNOME Terminal, Ptyxis, GNOME Console, Konsole, Xfce Terminal, MATE Terminal, Tilix, Ghostty, WezTerm, Alacritty, kitty, and XTerm on Linux. Detected macOS options include iTerm2, Warp, and Ghostty.

### Session Persistence & Crash-Safe Backups
- **Automatic Session Restore:** Reopens your previous tabs and active tab on launch. Clean saved files are re-read fresh from disk.
- **Unsaved File Backups:** Unsaved and modified ("dirty") tabs are automatically backed up as individual text files (`session/unsaved/{tabId}.txt`) inside `~/Documents/AwapiEditor/Backups` (configurable in **Preferences**).
- **Smart Dirty State Tracking:** Automatically clears the dirty indicator (`*`) if you undo edits back to the last saved state on disk.

### File Operations
- **Open, Multi-File Open & Save:** Native Open (`Cmd/Ctrl+O`, supporting multi-file selection; files that can't be read are skipped and listed in an error dialog), Save (`Cmd/Ctrl+S`), Save As (`Cmd/Ctrl+Shift+S`), and Save All (`Cmd/Ctrl+Shift+Alt+S`).
- **Open Recent Files:** `File -> Open Recent` submenu tracking the 10 most recently opened/saved files (with automatic pruning of deleted files and a `Clear Recent` action).
- **External File Change Detection:** Watches open files on disk, in the main window and in pop-out windows. Clean tabs reload automatically when the file changes. Tabs with unsaved changes ask before reloading. If the file is deleted, the tab is marked unsaved. A reload keeps the tab's encoding unless the file on disk no longer fits it (for example, a BOM was added), and then the tab switches to the new encoding.
- **Drag & Drop:** Drag one or more files from the OS file manager directly into the window to open them in tabs.
- **OS "Open With" & CLI Support:** Open files passed via command-line arguments or macOS Finder / Windows Explorer "Open With", routing to the existing window via single-instance lock.
- **Print & Print Preview:** Native printing (`Cmd/Ctrl+P`) and HTML Print Preview (`Cmd/Ctrl+Shift+P`).

### Editing & View Controls
- **Monaco Editor Engine:** Syntax highlighting, minimap, bracket matching, multi-cursor editing, and Command Palette (`F1`).
- **50+ Languages Supported:** Automatic language detection from file extensions (plus `Dockerfile`), with a searchable status-bar selector to override the language per tab.
- **Character Encoding Support:** Auto-detects and displays common encodings (`UTF-8`, `UTF-8 with BOM`, `UTF-16 LE`, `UTF-16 BE` — with or without a BOM — and `ISO-8859-1`) per tab. Click the encoding in the status bar to choose one of two actions:
  - **Reopen with Encoding** reads the file from disk again using the encoding you pick. Use it when a file was detected wrongly.
  - **Save with Encoding** saves the file in the encoding you pick.

  Before saving, the editor warns you if some characters can't be stored in the chosen encoding (for example `€` in ISO-8859-1), because they would be saved as `?`.
- **Line Ending Control (`LF` / `CRLF`):** Auto-detects line endings when opening files, normalizes in memory, and lets you switch between Unix (`LF`) and Windows (`CRLF`) per tab from the status bar.
- **Find, Replace & Format:** Built-in Find (`Cmd/Ctrl+F`), Replace (`Cmd/Ctrl+H`), **Find in All Open Tabs** (`Cmd/Ctrl+Shift+F`, with multi-tab search & replace and a clickable results panel), and Format Document (`Shift+Alt+F`).
- **Go to Line (`Ctrl+G`):** Jump directly to any line (or `line:column`) from the `Edit` menu, shortcut, or by clicking `Ln X, Col Y` in the status bar. Uses the Control key on every platform (matching Monaco), so `Cmd+G` remains *Find Next* on macOS.
- **Line & Text Operations (`Edit -> Line & Text Operations`):** Sort lines ascending/descending, remove duplicate lines, remove empty lines, trim trailing whitespace, and convert selection/document to `UPPERCASE` or `lowercase`. The document's final newline stays at the end.
- **Word Wrap & Whitespace/EOL Toggles:** Quick toolbar and `View` menu toggles for Word Wrap and Show Whitespace & EOL (`¶`).
- **Per-Window Zoom:** Zoom In (`Cmd/Ctrl+=` or `Cmd/Ctrl++`), Zoom Out (`Cmd/Ctrl+-`), and Reset Zoom (`Cmd/Ctrl+0`), tracked independently per window.
- **Keyboard Shortcuts Reference (`Shift+F1`):** Built-in `Help -> Keyboard Shortcuts…` cheat-sheet modal plus hover tooltips on tab controls. (`Cmd/Ctrl+/` is left to Monaco's *Toggle Line Comment*.)
- **Live Status Bar Metrics:** Displays cursor position (`Ln`, `Col`), selection summary (`Sel lines, chars`), total character count (`Chars`), line ending, and language, plus a terminal button that toggles the [integrated terminal](#terminal).
- **Themes:** Global Dark and Light themes (synced with the native OS title bar) configurable in **Preferences** (`Cmd/Ctrl+,`).
- **Update Notifier:** Checks GitHub Releases on startup (and manually via `Help -> Check for Updates…`) and notifies when a newer version is available.

---

## 🗺️ Planned Features (Core Roadmap)

Focused on the most-used everyday workflows from Notepad++ while keeping the UI clean and fast:

### 1. File & Tab Workflow — ✅ Completed
All Phase 1 items (**Close/Reopen Tab**, **Open Recent Files**, **External File Change Detection**, **Save All**, **Tab Path Utilities**, and **Multi-File Open Dialog**) have been implemented and moved to [Current Features](#-current-features) above.

### 2. Search, Navigation & Text Manipulation — ✅ Completed
All Phase 2 items (**Find in All Open Tabs**, **Go to Line (`Ctrl+G`)**, **Show Whitespace & EOL Toggle**, and **Line & Text Operations**) have been implemented and moved to [Current Features](#-current-features) above.

### 3. View & Encoding — ✅ Completed
All Phase 3 items (**Always on Top (`View -> Always on Top`)**, **Side-by-Side Split / Diff View**, and **Character Encoding Support**) have been implemented and moved to [Current Features](#-current-features) above.
