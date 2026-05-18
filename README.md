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

v1 feature-complete and packaged. macOS primary; Windows/Linux feasible via Tauri (capture-trigger details differ).

All twelve phases of the implementation roadmap are landed:

| Phase | Surface |
|---|---|
| 1 | Data layer (SQLite + workspaces / threads / blocks / attachments + FTS5) |
| 2 | UI skeleton + thread view |
| 3 | Global shortcut capture |
| 4 | Context packer (the crown feature) — pure function, paste-ready Markdown |
| 5 | Capture hardening: always-on-top overlay window, double-tap ⌥ trigger, editable source badge, browser tab-title auto-detection |
| 6 | Block workbench: file / folder / URL attachments, inline edit, annotations, smart truncation, drag-to-attach |
| 7 | Full-text search: FTS5 trigram tokenizer (Chinese-correct) + short-query LIKE fallback, contextual three-line snippets |
| 8 | Deadlines, parked-with-next-step status, three-section sidebar (summary + cross-workspace focus + workspace tree), drag-between-workspaces, shortcut configuration UI |
| 9 | Thread completion + digest view (conclusion · pinned blocks · files & links) |
| 10 | @-mention references between threads in the same workspace |
| 11 | Optional AI layer: status summaries, conclusion drafts, capture classification — silent degradation everywhere |
| 12 | Settings panel (AI keys + test, Ollama, privacy, quotas, autostart, clear data), unified toast surface, tail-window for long threads, packaging |

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

The macOS double-tap-⌥ capture trigger requires **Input Monitoring** AND **Accessibility** permission (System Settings → Privacy & Security). The ⌘⇧C fallback works without either. On first capture from a browser, macOS will prompt once for **Automation** permission against that browser — granting it lets Spool tag captures with the active tab title instead of just the app name.

## AI keys (optional)

Spool's AI features (status summaries, conclusion drafts, capture classification) are entirely optional. The product works without any AI configured — and it must, by design. When AI is configured, Spool routes calls through three tiers with automatic fallback, and any failure silently degrades — no error popups, no broken core features.

Tiers, in fallback order:

1. **Groq** (fast tier, free). Used for capture classification (fits the latency budget).
2. **Gemini** (quality tier, free up to limits). Used for status and conclusion summaries.
3. **Ollama** (local, no quota). Used in privacy mode, and as the offline fallback for both tiers.

Configure under **Settings → AI 服务** (`⌘,`). Each online key has a "测试" button that runs a 1-token round-trip against the provider.

### Groq

1. Sign in at <https://console.groq.com>.
2. Open **API Keys** → **Create API Key**.
3. Paste the `gsk_…` string into the **Groq API Key** field, click **测试**.

### Gemini

1. Sign in at <https://aistudio.google.com/app/apikey>.
2. **Create API key** (the free tier covers normal personal use).
3. Paste the `AIza…` string into the **Gemini API Key** field, click **测试**.

### Ollama (local, fully offline)

1. Install Ollama from <https://ollama.com>.
2. Pull a model — `ollama pull qwen3:8b` is the default Spool looks for; any chat model works.
3. Make sure the daemon is running (`ollama serve` or the menu-bar app).
4. Spool auto-detects the endpoint on startup. Adjust the URL or pick a different model under **Settings → Ollama**.

### Privacy mode

Toggle **隐私模式** under Settings to force every AI call through the local Ollama tier. With privacy mode on, online providers are never contacted regardless of which keys are saved. With no local model present, AI entry points are hidden entirely — the rest of the app is unaffected.

## Keyboard shortcuts

| Key | Action |
|---|---|
| Double-tap ⌥ | Capture clipboard (macOS only, system-global) |
| ⌘⇧C | Capture clipboard (system-global, all platforms) |
| ⌘⇧F | Global search |
| ⌘⇧P | Pack the active thread |
| ⌘N | New thread in the current workspace |
| ⌘, | Settings |
| @ | Mention another thread inside the composer |
| Enter / Shift+Enter | Send / newline in the composer |
| Esc | Dismiss any overlay, modal, or inline edit |

The two global shortcuts (capture and search) are user-rebindable under **Settings → 全局快捷键**.

## Project structure

```
src-tauri/            # Tauri / Rust: capture, overlay window, system integration
src/
  overlay/            # the capture overlay window (separate Vite entry)
  components/         # Sidebar, ThreadView, Capture, Pack, Search, Settings, ui
  lib/                # core logic (capture, pack, search, ai, db)
  hooks/              # React hooks
  stores/             # Zustand stores
  styles/             # design tokens + global styles
scripts/              # one-off generators (e.g. the amber-S app icon)
PLAN_EN.md            # the project blueprint and source of truth
```

`PLAN_EN.md` defines what Spool is, what it isn't, the phase-by-phase roadmap, and the explicit non-goals. Read §2 (Product Constitution) before opening a PR or proposing a feature.

## Screenshots

Placeholder — populate after the first dogfooding pass:

- `docs/screenshots/main.png` — main window: sidebar + active thread
- `docs/screenshots/capture.png` — the corner overlay confirming a capture
- `docs/screenshots/pack.png` — the pack dialog with assembled briefing
- `docs/screenshots/digest.png` — a completed thread's digest view

## License

MIT (planned).

## Author

Ocean Jin · [@KIM-ocean-HZ](https://github.com/KIM-ocean-HZ)