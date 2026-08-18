Spool is a context hub for long-running projects: capture fragments the moment they appear, keep them threaded under one project, and pack any thread into a paste-ready briefing when you need to re-enter the project — or re-brief an AI.

**v0.5.0 is the first release that runs on Windows.** Alongside it, the capture gesture became the same on both platforms, follow-up grew a real closing move, workspaces can nest and be packed whole, and a library can now move to a new machine.

## Download

**Windows** — `Spool_0.5.0_x64-setup.exe` · 5.3 MB · x64, Windows 10 or 11

**macOS** — `Spool_0.5.0_aarch64.dmg` · 7.7 MB · Apple Silicon (M1 or later), macOS 11 or newer

The macOS build is signed and notarized with a Developer ID, so it opens without the "unidentified developer" warning. **The Windows build is not code-signed in this first release** — SmartScreen will show "Windows protected your PC"; open *More info → Run anyway* if you want to install it.

`Spool-macOS-arm64.dmg` and `Spool-windows-x64-setup.exe` are the same two files under fixed names, for direct-download links — either name works.

```
sha256  f2cfb2a565aafad7c7e3fa9a2481dd342562dd9550e51e6071080a101ed88239  Spool_0.5.0_aarch64.dmg
sha256  832408a44c3d3b8f38f52f1a07bce46a6f2e56ef71977496f06b8b6348fec571  Spool_0.5.0_x64-setup.exe
```

## New in 0.5.0

### Windows

Spool now builds, installs and runs on Windows: NSIS installer, tray icon that stays visible on a dark taskbar, closing the window goes to the tray (and says so the first time, instead of leaving you to guess where the app went), and the same MCP setup as on macOS.

**Capture is triggered the same way on both platforms: double-tap a modifier key** — ⌥ on macOS, Ctrl on Windows. The Windows implementation reads the key through Raw Input rather than a keyboard hook, which is what lets it work while antivirus software is watching for hook-based keyloggers. Neither platform ships with a key combination bound out of the box; if you want one, set it in Settings.

### Capture and undo

- Capture types straight into the note box again — three separate defects were stacking up, and browsers and Spool's own windows were each hitting a different one.
- The capture card is positioned by the screen's *usable* area, so the menu bar no longer eats its top edge.
- **A block you wrote yourself can now be undone.** In an empty input box, ⌘Z / Ctrl+Z means "undo my last action" rather than nothing at all.

### Follow-up

Follow-up is a list of lines now, not a paragraph. Each line is either **standing** (keep watching this, forever) or **one-off** (close it once it has an answer), and an AI connected over MCP can both propose a new line and close one it answered — proposals wait on Spool's review screen for you to rule on, and a standing line refuses to be closed. Without that distinction, one answer would silently switch off a long-running watch.

### Workspaces

- **Workspaces nest.** Projects sort alphabetically, and the left rail supports multi-select and pointer-driven drag and drop.
- **Pack an entire workspace** — exported as a real folder (`INDEX.md` plus one `.md` per project, sub-workspaces as sub-directories) that an AI can open a piece at a time, like a codebase. Nothing is summarized away to fit a budget.

### Moving to a new machine

Settings → Advanced → **Transfer** exports the whole library and imports it on the other machine. Import **merges**; it does not replace what is already there.

### Project files and provenance

- A project holds files now, with a per-file switch for whether an AI may read the text; a locked file can be requested over MCP rather than mailed around.
- Blocks carry where they came from: **source URL, retrieved-on date, review-by date** — and the workbench reminds you at two months, one month and a week before a review date.
- Corrections got a proper interface, and a corrected block keeps its original wording.
- MCP intent routing so a connected model actually finds the right tool, one-click setup that also writes the instructions file and two everyday prompts, and the tool surface grew from 14 to 19.

### First-day value

The panel now shows what you have accumulated rather than an empty state, and it says plainly that Spool is fully functional without configuring MCP at all.

---

**Spool itself still makes no network connections, and your data never leaves your machine.** The optional maintenance jobs run in your own CLI subprocess (Claude Code, Codex CLI or Gemini CLI) — that process is the one that goes online, not Spool.
