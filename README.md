<p align="center">
  <img src="docs/logo/spool-logo-sizes-preview.png" alt="Spool logo across sizes" width="560">
</p>

# Spool

> 思簿 — a context hub for long-running projects.
> Logo: a spool viewed from above, its thread pulling free — [watch it assemble](docs/logo/spool-logo-assembly.mp4).

<p align="center">
  <b><a href="https://spoolapp.org">spoolapp.org</a></b> ·
  <b><a href="https://github.com/KIM-ocean-HZ/spool/releases/latest/download/Spool-macOS-arm64.dmg">Download for macOS</a></b>
  <br>
  <sub>The site walks the whole loop in an interactive demo (English / 中文) — no install needed.<br>
  The download is a signed, notarized <code>.dmg</code>. Free, offline, no account.</sub>
</p>

At the moment you naturally produce a fragment of information — a good answer from an AI, a decision buried in an email, a link to a document, a half-formed thought — Spool lets you capture that fragment effortlessly, files fragments under a two-tier **Workspace → Project** structure, and packs any project into a paste-ready briefing on demand — so you can re-enter a project, or re-brief an AI, instantly.

## Why it exists

LLMs do not remember your project. Every new conversation, you re-explain the context. Across multiple AIs, multiple tabs, multiple emails, spanning many days, a project's context gets shredded — and reassembling it falls on your memory.

Spool compresses "re-explaining" into "a single paste."

## The core loop

```
   Capture  ──▶  Project ──▶  Pack  ──▶  (paste, re-enter)
      ▲                                       │
      └───────────── days later ──────────────┘
```

- **Capture** — a global shortcut grabs whatever is on your clipboard and writes it into the current project. Rides existing Cmd+C muscle memory. No decisions at capture time. The confirmation overlay opens with the cursor already in a note box — type the thought that made you save this and press Enter, or click anywhere to skip. Your own note outlives the excerpt, and connected AIs treat it as the highest-signal line. The main window never has to come forward.
- **Project** — an append-only timeline of fragments. Two tiers only: Workspace (big topic) → Project (one piece of work). No infinite nesting. On open the feed lands at the newest blocks — they ARE "where you left off," no manual status note to maintain.
- **Pack** — one click assembles a paste-ready Markdown briefing of the project. Pure string assembly, no AI in the hot path, fully deterministic.

## Status

**v0.3.0** — feature-complete and shipping. macOS primary; Windows/Linux feasible via Tauri (capture-trigger details differ).

- **Distribution**: Developer ID–signed, Apple-notarized `.dmg`, straight from [Releases](https://github.com/KIM-ocean-HZ/spool/releases/latest). Not on the Mac App Store — sandboxing conflicts structurally with the global capture trigger.
- **Website**: [spoolapp.org](https://spoolapp.org), with an interactive walkthrough of capture → pack → re-brief → MCP in English and Chinese.
- **No auto-update channel** yet: direct distribution means new versions are a manual download.

All twelve phases of the implementation roadmap are landed:

| Phase | Surface |
|---|---|
| 1 | Data layer (SQLite + workspaces / projects / blocks / attachments + FTS5) |
| 2 | UI skeleton + project view |
| 3 | Global shortcut capture |
| 4 | Context packer (the crown feature) — pure function, paste-ready Markdown |
| 5 | Capture hardening: always-on-top overlay window, double-tap ⌥ trigger, editable source badge, browser tab-title auto-detection |
| 6 | Block workbench: file / folder / URL attachments, inline edit, annotations, smart truncation, drag-to-attach |
| 7 | Full-text search: FTS5 trigram tokenizer (Chinese-correct) + short-query LIKE fallback, contextual three-line snippets |
| 8 | Deadlines, active / parked / done status, three-section sidebar (summary + cross-workspace focus + workspace tree), drag-between-workspaces, shortcut configuration UI |
| 9 | Project completion + digest view (conclusion · pinned blocks · files & links) |
| 10 | @-mention references between projects in the same workspace |
| 11 | ~~Optional AI layer~~ — removed 2026-07-09: Spool itself ships zero AI; cowork happens through the MCP server (below) |
| 12 | Settings panel (shortcuts, language, MCP hookup, autostart, clear data), unified toast surface, tail-window for long projects, packaging |

## Design principles (non-negotiable)

1. Capture must be zero-friction — one keypress, no decisions.
2. Local-first, private by default — Spool makes no network requests at all; the only way data leaves is your own MCP client reading it, behind two opt-in switches.
3. A project is a log, not a chat — append-only, time-ordered, quiet.
4. Retrieval is deterministic — pack and search never call AI or the network.
5. AI is a librarian, not an author — anything an AI files through MCP is attributed, append-only, and can never overwrite what you wrote by hand.
6. Exactly two tiers of structure — no infinite nesting.

The full product constitution, rejected ideas, and the feature filter are in `PLAN_EN.md` §2.

## Stack

- **Tauri 2** desktop shell, with a second non-activating overlay window for capture confirmations
- **React 18 + TypeScript** (strict mode) on **Vite** (multi-page build)
- **Tailwind CSS** for layout; design tokens in CSS variables
- **Zustand** for state
- **SQLite** via `tauri-plugin-sql`, FTS5 with the trigram tokenizer
- **MCP server** (`spool --mcp`, stdio, default OFF): the AI surface — read tools (list/search/dedup/pack) plus consented, attributed write tools

## Building from source

Requirements: Node 20+, Rust toolchain (stable), Tauri 2 system dependencies (see the Tauri docs for your OS).

```bash
npm install
npm run tauri dev     # dev with HMR
npm run tauri build   # production .dmg / installer
npm test              # vitest
```

The macOS double-tap-⌥ capture trigger requires **Input Monitoring** AND **Accessibility** permission (System Settings → Privacy & Security). Spool prompts for Input Monitoring on first launch and shows a banner until it is granted; the grant takes effect after restarting Spool. Accessibility is what makes a *consumed* double-tap exclusive: when Spool captures, it deletes the second ⌥ press from the event stream, so other apps bound to the same gesture (Claude Desktop's quick entry, for one) do not also fire. A bare double-tap with nothing freshly copied is still passed through to them untouched. A user-bound capture shortcut (Settings → 全局快捷键) works without either permission. On first capture from a browser, macOS will prompt once for **Automation** permission against that browser — granting it lets Spool tag captures with the active tab title instead of just the app name.

## AI via MCP (optional, no keys, no accounts)

Spool ships **zero built-in AI** — no API keys, no local models, nothing to configure, and the app's CSP structurally forbids any external network request. Instead, Spool speaks the [Model Context Protocol](https://modelcontextprotocol.io): your own AI client (Claude Desktop, Cursor, or any MCP-capable tool) connects to `spool --mcp` over stdio and works with your projects directly.

- **One-click hookup**: Settings → MCP → 一键接入 writes the client's config for you (with a backup). Next to it, 「复制使用提示」 is the single place the how-to lives — one short paragraph, readable by you and paste-ready for the AI.
- **Read tools**: list projects (with one-line summaries and read-budget hints), a cross-project digest of recent activity, full-text search, near-duplicate detection, block paging, the same deterministic pack the GUI produces, and a read-only library hygiene checkup.
- **Write tools** (a second, separate consent): create a project, append a block (optionally citing the block it builds on), refresh a project's one-line summary. Every AI write carries an enforced source label (e.g. `Claude · MCP`) and shows a distinct badge in the GUI; an AI can never overwrite a summary you wrote by hand.

### What to say once connected

You talk to your AI in plain language — no tool names, no menus. The how-to is kept in exactly
one place rather than repeated here: **Settings → MCP → 「复制使用提示」**, a short paragraph you
can paste to your AI or simply read yourself. The server also tells every client how you are
likely to phrase things, so a freshly connected AI opens by naming what it can do with your
actual projects.

## Keyboard shortcuts

| Key | Action |
|---|---|
| Double-tap ⌥ | Capture clipboard, then just type to leave a note (macOS only, system-global) |
| ⌘⇧F | Global search |
| ⌘⇧P | Pack the active project |
| ⌘N | New project in the current workspace |
| ⌘, | Settings |
| @ | Mention another project inside the composer |
| Enter / Shift+Enter | Send / newline in the composer |
| Esc | Dismiss any overlay, modal, or inline edit |

The global search shortcut is user-rebindable under **Settings → 全局快捷键**; an optional capture shortcut (unbound by default) can be recorded there too.

## Project structure

```
src-tauri/            # Tauri / Rust: capture, overlay window, system integration
src/
  overlay/            # the capture overlay window (separate Vite entry)
  components/         # Sidebar, ThreadView, Capture, Pack, Search, Settings, ui
  lib/                # core logic (capture, pack, search, db, i18n)
  hooks/              # React hooks
  stores/             # Zustand stores
  styles/             # design tokens + global styles
scripts/              # one-off generators (e.g. the amber-S app icon)
PLAN_EN.md            # the project blueprint and source of truth
```

`PLAN_EN.md` defines what Spool is, what it isn't, the phase-by-phase roadmap, and the explicit non-goals. Read §2 (Product Constitution) before opening a PR or proposing a feature.

## Screenshots

Taken with a library built purely for demonstration — the projects and notes in them are invented, so nothing personal appears.

**One project, five fragments.** A goal you set, a job posting you read, an answer from an AI chat, a decision of your own, an email from a recruiter — each keeping its time and its source.

![The Spool main window: workspaces and projects in the sidebar, and a project of five fragments with their times, sources and annotations](docs/screenshots/app-project.png)

**The capture confirmation**, on whatever screen you are already on — the first words of what was saved, the project it went to, a note box ready for the thought you had, and undo. The main window never comes forward.

![Spool's corner overlay: the first words of the saved fragment, the project Work / Job search it was filed under, and an undo button](docs/screenshots/capture-toast.png)

**Pack** turns the project into paste-ready Markdown: your own words first, sources kept as sources, anything an AI wrote marked so you can check it.

![The pack dialog over a project: the assembled briefing as plain text, with scope choices and a copy button](docs/screenshots/app-pack.png)

**A finished project**, condensed to its conclusion and the fragments that mattered.

![A completed project's digest: the conclusion in a box, and the two highlighted fragments below](docs/screenshots/app-digest.png)

**Through MCP, your own AI reads the library directly** — here it answers from workspaces and projects on the Mac, without a pack or a paste.

![An AI client listing the Spool library: workspaces for work, study and life, each with its projects and note counts](docs/screenshots/mcp-library.png)

**And when it files something back, it signs its name.** The AI's block is appended *below* the user's note — never over it — labelled `Claude · MCP`, with a `↩` line pointing at the exact fragment it answers.

![Close-up inside Spool: the user's own note, and directly below it a block written by an AI, marked Claude · MCP, with a reference line pointing back at the cited note](docs/screenshots/mcp-filed-detail.png)

## License

Not licensed yet — all rights reserved until a license is chosen.

## Author

Ocean Jin · [@KIM-ocean-HZ](https://github.com/KIM-ocean-HZ)