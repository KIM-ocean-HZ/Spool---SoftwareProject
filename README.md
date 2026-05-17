# Spool

> 思簿 — a context hub for long-running projects.

At the moment you naturally produce a fragment of information — a good answer from an AI, a decision buried in an email, a link to a document, a half-formed thought — Spool lets you capture that fragment effortlessly, threads fragments together under a two-tier **Workspace → Thread** structure, and packs any thread into a paste-ready briefing on demand — so you can re-enter a project, or re-brief an AI, instantly.

## Why it exists

LLMs do not remember your project. Every new conversation, you re-explain the context. Across multiple AIs, multiple tabs, multiple emails, spanning many days, a project's context gets shredded — and reassembling it falls on your memory.

Spool compresses "re-explaining" into "a single paste."

## The core loop

```
   Capture  ──▶  Thread  ──▶  Pack  ──▶  (paste, re-enter)
      ▲                                       │
      └───────────── days later ──────────────┘
```

- **Capture** — a global shortcut grabs whatever is on your clipboard and writes it into the current thread. Rides existing Cmd+C muscle memory. No decisions at capture time. A non-activating overlay confirms the save on whatever screen you're on, so the main window never has to come forward.
- **Thread** — an append-only timeline of fragments under one project. Two tiers only: Workspace (big topic) → Thread (small project). No infinite nesting. Each thread carries an optional `next_step` note — the single most useful thing to see when re-entering days later.
- **Pack** — one click assembles a paste-ready Markdown briefing of the thread. Pure string assembly, no AI in the hot path, fully deterministic.

## Status

Under active development. macOS primary; Windows/Linux feasible via Tauri (capture-trigger details differ). Not yet released.

Phases 1–8 of the implementation roadmap are complete:

| Phase | Surface |
|---|---|
| 1 | Data layer (SQLite + workspaces / threads / blocks / attachments + FTS5) |
| 2 | UI skeleton + thread view |
| 3 | Global shortcut capture |
| 4 | Context packer (the crown feature) — pure function, paste-ready Markdown |
| 5 | Capture hardening: always-on-top overlay window, double-tap ⌥ trigger, editable source badge, browser tab-title auto-detection |
| 6 | Block workbench: file / folder / URL attachments, inline edit, annotations, smart truncation, drag-to-attach |
| 7 | Full-text search: FTS5 trigram tokenizer (Chinese-correct) + short-query LIKE fallback, contextual three-line snippets |
| 8 | Deadlines, progress, parked-with-next-step status, three-section sidebar (summary + cross-workspace focus + workspace tree), drag-between-workspaces, shortcut configuration UI |

Phases 9–12 next: digest view, @-mention references, the optional AI layer, settings / packaging.

## Design principles (non-negotiable)

1. Capture must be zero-friction — one keypress, no decisions.
2. Local-first, private by default — no data leaves the machine unless an online AI feature is explicitly invoked.
3. A thread is a log, not a chat — append-only, time-ordered, quiet.
4. Retrieval is deterministic — pack and search never call AI or the network.
5. AI is a librarian, not an author — it summarizes and classifies; it never writes content for you.
6. Exactly two tiers of structure — no infinite nesting.

The full product constitution, rejected ideas, and the feature filter are in `PLAN_EN.md` §2.

## Stack

- **Tauri 2** desktop shell, with a second non-activating overlay window for capture confirmations
- **React 18 + TypeScript** (strict mode) on **Vite** (multi-page build)
- **Tailwind CSS** for layout; design tokens in CSS variables
- **Zustand** for state
- **SQLite** via `tauri-plugin-sql`, FTS5 with the trigram tokenizer
- **AI orchestration** (optional, never in capture / pack / search hot paths): Groq → Gemini → local Ollama, with cache and quota

## Building from source

Requirements: Node 20+, Rust toolchain (stable), Tauri 2 system dependencies (see the Tauri docs for your OS).

```bash
npm install
npm run tauri dev     # dev with HMR
npm run tauri build   # production .dmg / installer
npm test              # vitest
```

The macOS double-tap-⌥ capture trigger requires Input Monitoring permission (System Settings → Privacy & Security → Input Monitoring). The Cmd+Shift+C fallback works without it.

## Project structure

```
src-tauri/            # Tauri / Rust: capture, overlay window, system integration
src/
  overlay/            # the capture overlay window (separate Vite entry)
  components/         # Sidebar, ThreadView, Capture, Pack, Search, Settings
  lib/                # core logic (capture, pack, search, ai, db)
  hooks/              # React hooks
  stores/             # Zustand stores
  styles/             # design tokens + global styles
PLAN_EN.md            # the project blueprint and source of truth
```

`PLAN_EN.md` defines what Spool is, what it isn't, the phase-by-phase roadmap, and the explicit non-goals. Read §2 (Product Constitution) before opening a PR or proposing a feature.

## License

MIT (planned).

## Author

Ocean Jin · [@KIM-ocean-HZ](https://github.com/KIM-ocean-HZ)