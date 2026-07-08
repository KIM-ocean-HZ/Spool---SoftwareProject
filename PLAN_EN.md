# Spool — Implementation Blueprint v2.10

---

## 0. How to Use This Document

**This is the single source of truth for Spool. It supersedes all earlier versions.** It is both the product constitution and the build specification.

- **Claude Code**: Implement phase by phase, in the order given in §15. After completing each phase, STOP and wait for Ocean to review before starting the next. **Do not work on multiple phases in parallel. Do not pre-implement anything outside the current phase.**
- **When you hit any ambiguity, or feel tempted to add a feature**: First re-read §2 (Product Constitution) — especially §2.5 (design principles), §2.5.1 (the personal-annotation design bias, new in v2.9), §2.6 (rejected ideas), and §2.7 (the feature filter). Most ambiguity is resolved there. If still unresolved, STOP and ask Ocean. Do not improvise.
- **This document is written in English deliberately** — it is used directly as a prompt for Claude Code, and English yields more reliable instruction-following. All user-facing UI copy in the product itself, however, must be in Simplified Chinese (see §18, rule 11).

- **Version 2.9 (this revision)** is a dogfooding-informed adjustment:
  1. **Collect Mode is promoted from Strategic-Brief informality into PLAN proper** as §20.9. Ocean's confirmed frequent use (mock-exam workflow: per-question answer + analysis + AI-conversation, all annotated together) closes the "is anybody using this" question. The §20.9 spec now also fixes the window-following bug discovered in dogfooding and codifies the Send→merge contract.
  2. **§2.5.1 Design Bias — Personal Annotation Amplifies Pack Value** is added. The four-category pack header (§9.5) carries three categories from external sources (Reference / Synthesis / Process) and one — 💭 Personal — that only the user can produce. Pack value scales with Personal density: more Personal annotation means signal the receiving AI cannot otherwise have. The design bias that follows: every surface where the user is already paused (edit, complete, collect-staging) makes annotation the most obvious next action — as an affordance, never as a requirement. This is a design **bias**, not a 7th principle; the six non-negotiables in §2.5 are unchanged and still binding.
  3. **§9.13 Undo Operation** is added (Cmd+Z, ~10-deep ring, covers capture / merge / delete / collect-send; works in main window AND collect-mode panel). Promoted from "planned follow-up" in Strategic Brief §6 to formal spec.
  4. **§9.10 Search gains three functional improvements** found insufficient in real use: auto-expand the destination block on navigate, highlight all occurrences within the block, and a small vscode-style next/previous navigator (Cmd+G).
  5. **§19 backlog gains three bug entries** (19.17 search precision, 19.18 active-block visual identification, 19.19 edit-mode scroll preservation) — all surfaced in v2.9 dogfooding, all behavior-fix not architecture.
  6. Schema unchanged (SCHEMA_VERSION stays 5 — collect-mode staging lives outside the blocks table, in overlay-window memory). §1–§19 backbone and the 6 principles are unchanged.

- **Version 2.8** opened a formally-separated **Experimental Track (§20)** — Track A (merge blocks, extraction/inline split, conclusion-summary attachments, annotation-in-edit-mode) built to stay; Track B (select-to-highlight, capture-toast optional expansion, pack task templates) built to validate. Each carries a kill criterion (§20.8). Schema bumped 4→5 (additive ALTER on `attachments` for `include_in_pack`).

- **Version 2.7** was a post-dogfooding correction: (a) pack templates gain an English instruction header teaching the four-category authority hierarchy (Reference / Synthesis / Process / Personal); (b) attachments evolve from "clickable pointers" to "indexed content sources" via auto-extraction. Schema 3→4.

- **Version 2.6** was a post-Phase-8 design correction. Manual `progress` slider and manual `next_step` field rolled back. Source-category icons + date dividers. First additive `ALTER TABLE` (2→3).

- **Version 2.5** was a post-Phase-7 retrospective. Phases 1–7 marked complete; double-tap ⌥ trigger and browser tab-title source detection promoted from v1.5 into v1; FTS5 trigram tokenizer documented; §19 Improvement Backlog added; §18 rule 13 added (no Claude/Anthropic attribution).

- **Version 2.4** inserted Phase 5 Capture Hardening and Phase 6 Block Workbench; dissolved the old "File Anchors" phase into Phase 6.

> Context: This product went through one real pivot (a notes app → a context hub). That pivot is settled. Everything since has been completing and hardening that direction — not changing it. Do not re-litigate the direction.

---

## 1. Table of Contents

1. Table of Contents
2. **Product Constitution (drift-prevention core — highest priority)**
3. The Core Loop & Product Shape
4. Tech Stack & Rationale
5. Legacy Code Disposition
6. AI Orchestration Strategy
7. Repository Structure
8. Data Model (three tiers)
9. Feature Specifications
10. Design Problem I: Frictionless Capture
11. Design Problem II: Browsing a Finished Project
12. Prompt Library
13. Design System
14. Key Interaction Details
15. Implementation Roadmap (for Claude Code)
16. Acceptance Criteria
17. Out of Scope (with architectural hooks)
18. General Rules for Claude Code
19. Improvement Backlog (post-Phase 8 / v2.6, ongoing)
20. Experimental Track (v2.8 / v2.9) — Dogfood-Gated Features

---

## 2. Product Constitution

> This entire section exists to prevent scope drift. It outranks every other part of this document. Every implementation decision and every proposed feature must pass the checks here first.

### 2.1 One-Sentence Definition

**Spool is a context hub for long-running projects.** At the moment you naturally produce a fragment of information — a good answer from an AI, a decision buried in an email, a link to a document, a half-formed thought — it lets you capture that fragment effortlessly, threads fragments together under a two-tier "Workspace → Thread" structure, and can pack any thread into a paste-ready briefing on demand — so you can re-enter the project, or re-brief an AI, instantly.

**On the name**: the product is **Spool** in English and **思簿** (sī bù) in Chinese. Spool — a humble everyday object that holds a continuous thread, wound on during capture and drawn off during pack; the metaphor maps directly onto the core loop, and the thread between is always continuous. 思簿 reads as "thought-book" (思 = thought, 簿 = notebook / ledger / record-book) — pointing both at Principle 3 ("a thread is a log, not a chat" — a 簿 is exactly that, an append-only record) and at the product's origin: Ocean watched his girlfriend take notes and realized this app needed to exist. **In Chinese-facing UI copy, use 思簿; in English materials, the repo, and bundle identifiers, use Spool.**

### 2.2 The North Star

**Cut the time and mental effort of "re-entering a project" from "ten minutes of archaeology" down to "a single paste."**

That "re-entering" applies equally whether the person re-entering is you tomorrow morning, or a freshly-opened AI chat that remembers nothing. Every feature in this product must ultimately serve this one thing.

### 2.3 The Real Problem It Solves

LLMs do not remember your project. Every time you open a new conversation, you re-explain the context — and this "re-explanation tax" is a hidden cost knowledge workers pay over and over. Across multiple AIs, multiple web pages, multiple emails, spanning many days, a project's context gets shredded — and reassembling it falls entirely on the human's memory.

**Spool compresses "re-explaining" into "a single paste."**

### 2.4 Target User

Knowledge workers running several "cross-tool, cross-day" workstreams at once: researchers, developers, graduate students, solo founders. Ocean is a precise sample of this user — so during v1, do no user research. Dogfood first; validate with friends after release.

### 2.5 Six Non-Negotiable Design Principles

1. **Capture must be zero-friction.** One keypress, no decisions, instant. Any design that makes the user pause at the moment of capture is a failure.
2. **Local-first, private by default.** This software ingests sensitive content the user copies (including private information from AI conversations). Unless the user explicitly invokes an online AI feature, no data leaves the machine. Capture, packing, and search must be fully functional with zero AI and zero network.
3. **A thread is a log, not a chat.** Append-only, time-ordered, quiet. No "send," no read receipts, no real-time. (Editing or annotating a block you own does not violate this — "append-only" governs the sequence of blocks, not the immutability of a block's text.)
4. **Retrieval is deterministic.** The core "pack" operation is pure string assembly: instant, reliable, with AI never in the hot path. AI compression is an optional enhancement, never a dependency.
5. **AI is a librarian, not an author.** It summarizes, classifies, compresses. It never writes content for you, and never decides "what is related" for you. **AI output is always disposable decoration, never a structural element of any view — when AI is absent, every part of the product must remain fully intact.**
6. **Exactly two tiers of structure; deadlines hang on threads.** Workspace → Thread, and no deeper. Block-level properties — attachments, annotations, source — are not a third tier; they are payload on a block.

### 2.5.1 Design Bias — Personal Annotation Amplifies Pack Value

> Added v2.9. This is a **design bias**, not a 7th principle. The six non-negotiables above are absolute; this bias informs preference between two designs that both pass the six. When in doubt between two equally-valid designs, the bias is the tiebreaker.

The four-category pack header (§9.5) carries blocks from four authority bands: 📖 Reference, 🧩 Synthesis, 🔄 Process, 💭 Personal. The first three are what other sources said — the user's job there is to capture them. **Only the 💭 Personal category carries what the user actually thinks**, and only the user can produce it. The receiving AI can be given more Reference (longer pack), more Synthesis (more captures), more Process (more conversation excerpts) — but Personal density is unique signal that no other source can supply.

**Pack value scales with Personal density.** A pack of pure source extracts is just a longer prompt. A pack saturated with the user's own annotations — "this seems wrong because…", "compare to lecture 4 slide 19", "I keep getting confused at this step" — gives the receiving AI signal it could not otherwise have, and lets it actually help with the user's reasoning rather than re-state the source.

The design bias that follows: **at every surface where the user is already paused — edit, review, complete, collect-mode staging — adding personal annotation must be the most obvious next action.** Annotation fields are visible without hover; the input is the same plain-text composer the user already knows; no field is ever required.

**What this bias does NOT mean** (guardrails against misapplication):
- It does **not** override Principle 1. Capture stays one keypress, zero decisions — capture itself is never paused on annotation.
- It does **not** override Principle 5. AI does not generate annotations on the user's behalf. The bias is about **affordance** — making the slot visible and easy — not **content generation**.
- It does **not** override Principle 3 ("quiet"). No popups, no modal "what do you think?" prompts, no nag toasts. The affordance is **presence**, not pressure.

**What this bias does mean** (concrete design tiebreakers):
- Between "hide annotation behind a hover action" and "make annotation a visible field in edit mode," favor the latter. (Already done — §20.4.)
- Between "collect-mode staging is a flat list of items" and "each staged item exposes its own annotation slot inline," favor the latter. (Encoded in §20.9.)
- Between "pack just shows the captured content" and "pack header explicitly tells the AI to weight Personal content," favor the latter. (Already done — §9.5 v2.7 header.)

**Going forward**: when any new feature is proposed (in §20 experimentation, in §19 backlog promotion, in §17 deferred items pulled forward), one question to ask alongside the §2.7 filter is: *does this design surface more opportunity for personal annotation without violating §2.5?* If yes, that is a point in favor. If neutral, no penalty. If it actively buries annotation, that is a point against.

### 2.6 Explicit Non-Goals & Rejected Ideas

> Scope drift almost always happens because someone (Ocean three months from now, or Claude Code) raises "should we add X?" and nobody remembers why X was rejected. **Every row below has already been discussed and rejected. Do not re-propose them. Do not "casually" implement them.**

| Rejected Idea | Why It's Tempting | Why Rejected | What We Do Instead |
|---|---|---|---|
| **Become a lightweight Notion** | Notion's market is huge | Unwinnable fight on Notion's turf. Spool's moat is zero-friction capture | Be Notion's upstream |
| **Infinite nesting** | Sounds "flexible" | Managing a tree instead of working | Exactly two tiers |
| **Auto-link "similar" threads** | "AI magic" | 90% noise; violates Principle 5 | FTS + explicit @-mentions |
| **AI continuation / AI writing content** | v1 did this | Turns AI into an author (Principle 5 violation) | AI only summarizes/classifies |
| **AI-suggested annotations / "do you mean…" annotation autocomplete** | After v2.9 elevated annotation, this looks tempting | Same root violation as AI continuation. The §2.5.1 bias is about affordance, not content generation. AI filling the slot turns Personal into Synthesis | Visible annotation slots; never filled by anything but the user's keystrokes |
| **Fully automatic capture** | Sounds "zero-friction" | "100% automatic + 100% non-invasive" is a contradiction | "Copy-and-remember" shortcut |
| **Real-time collaboration** | Sells well | Different product; dilutes positioning | Sharing = pack hands you text |
| **Cloud sync in v1** | Multi-device convenient | Sync done wrong = privacy disaster | v1 local-only; E2EE sync in v2 |
| **Rich text editor** | Looks "polished" | Complexity explosion | Plain text / Markdown source |
| **Kanban / calendar / table multi-views** | Notion/Things have them | Each view = forever maintenance | Sidebar is the only "view" |
| **Always-on floating widget** | Stronger presence | Window-management/occlusion overhead; v1 fails §2.7 q5 | Capture toast (§9.4); widget = v1.5 |
| **Collapse every block by default** | Tidy | Re-entry now costs one click per block | Smart truncation per long block |
| **Node-graph thread view** | Impressive | Violates "quiet"; layout engine cost; linear reading is already fastest | Linear feed |
| **Per-block AI summary** | "AI on tap" | Low payoff per block; reliability variance | Thread-level summary only |
| **Manual 0–100 progress slider (rolled back v2.6)** | Dashboard signal | Theater; nobody maintains; produced number to *maintain*, not a signal to *trust* | active\|parked\|done + deadline + updated_at |
| **Manual `next_step` per-thread (rolled back v2.6)** | "Write where you left off" | Negative dogfooding result; stale by re-entry; friction on exit | Append-only feed surfaces "where you left off" naturally |
| **Color-coded blocks by source** | Instant visual sorting | Violates "quiet"; source is free-text | Source-category icons + date dividers |
| **Per-block user-selected classification at capture time** | "Clean data" | Violates Principle 1 (zero-friction); user doesn't yet know category at capture | Pack header teaches AI to classify |
| **Modal "what do you think?" prompts after capture** | "Surface annotation aggressively per §2.5.1" — looks like the bias taken to its extreme | Violates Principle 3 (quiet) and Principle 1's spirit. The §2.5.1 bias is about affordance — visible slot, easy entry — not interruption. A modal nag every time a block lands turns a workbench into a chatbot | Visible annotation slots in edit mode (§20.4) and per-staged-item in collect mode (§20.9). Slot is present; pressure is absent |

### 2.7 The Filter: Should This Feature Be Built?

For any new feature, ask these five questions in order. **If the answer to any one is "no," do not build it:**

1. Does it fit into one of the three actions — Capture, Thread, Pack? (If not → not a feature of this product.)
2. Does it make "re-entering a project" faster? (If not → strays from the North Star.)
3. Does it conflict with any of the six principles in §2.5? (If it conflicts → rejected.)
4. Is it on the rejected list in §2.6? (If it is → rejected.)
5. Without it, is the product "unusable" or merely "not as good"? (If merely "not as good" → defer.)

**Tiebreaker** (added v2.9 with §2.5.1): when two designs both pass 1–5, prefer the one that surfaces more opportunity for personal annotation without burying any of 1–5.

---

## 3. The Core Loop & Product Shape

### 3.1 The Core Loop: Capture → Thread → Pack

```
   ┌─────────────┐      ┌──────────────┐      ┌─────────────┐
   │   Capture   │ ───▶ │   Thread     │ ───▶ │    Pack     │
   ├─────────────┤      ├──────────────┤      ├─────────────┤
   │ Global      │      │ Timeline of  │      │ One click   │
   │ shortcut.   │      │ blocks,      │      │ assembles a │
   │ Rides Cmd+C │      │ threaded by  │      │ paste-ready │
   │ muscle      │      │ project.     │      │ briefing —  │
   │ memory.     │      │ + attach     │      │ for an AI,  │
   │ Lands in    │      │ + @-mention  │      │ or for you  │
   │ 0 latency.  │      │ + deadline   │      │ to re-enter │
   └─────────────┘      └──────────────┘      └─────────────┘
         ▲                                           │
         └───────────────────────────────────────────┘
```

### 3.2 Two Tiers: Workspace → Thread

```
Workspace   ← Big topic. e.g. "COMP3074", "Dissertation"
   ├── Thread   ← Small project. e.g. "Coursework 1", "Lit review"
   │     └── Block   ← Captured fragment, handwritten draft, or @-reference.
   │                   Blocks can carry file/folder/URL attachments.
```

**Exactly two tiers, no more, no less** (Principle 6).

### 3.3 The Thread Lifecycle: Active → Done

- **Active or Parked**: workbench. `active` = in progress; `parked` = consciously set aside. Full timeline feed; every block useful. On thread open the feed **auto-scrolls to the bottom** — the newest blocks ARE "where you left off" (the v2.6 next_step rollback rationale).
- Note on use patterns: dogfooding shows multiple capture modes — (1) live capture during work (the original assumption, served by §9.4 double-tap ⌥); (2) batch retrospective dump (back-fill after a session in an external AI tool); (3) **per-unit batch staging via collect mode (§20.9, v2.9)** — Ocean's confirmed-frequent mock-exam workflow, where each exam question accumulates several captures + annotations before committing as one block. All three are first-class.
- **Done**: archive. Switches by default to digest view showing only pinned blocks, attachments, and optional conclusion summary. Full feed one click away.

### 3.4 Supporting Layers

Attachments, deadlines, FTS, @-mention, AI summaries, classification — all hang off the thread. Criterion is §2.7.

---

## 4. Tech Stack & Rationale

| Layer | Choice | Why |
|---|---|---|
| Desktop shell | **Tauri 2.0** | 5MB, fast startup, global shortcuts, multi-window. Compiles to iOS |
| Frontend | **React 18 + TypeScript + Vite** | Ocean knows it; strict mode safeguards core logic |
| Styling | **Tailwind + CSS variables** | Tokens in CSS variables; Tailwind for utilities |
| State | **Zustand** | A store is 30 lines. v2.9 adds undoStore, collectStore |
| Local storage | **SQLite via `tauri-plugin-sql`** | FTS5 needed for search |
| Timeline | **Native components + virtual scrolling (>200 blocks)** | No rich text editor |
| HTTP | **`fetch` + `AbortController`** | AI calls cancelable |
| System integration | **`tauri-plugin-global-shortcut` / `clipboard-manager` / `fs` / `dialog` + tray + multi-window** | Capture lifeline |
| Icons | **lucide-react** | Restrained line work |
| Fonts | **Geist + Fraunces** (CN fallback PingFang SC / Microsoft YaHei; 2026-07-07: Fraunces replaced Instrument Serif — too narrow) | |
| Testing | **Vitest** | Same origin as Vite |

**Full dependency list (npm)**: `tailwindcss @tailwindcss/typography zustand lucide-react nanoid @tauri-apps/plugin-sql @tauri-apps/plugin-store @tauri-apps/plugin-global-shortcut @tauri-apps/plugin-clipboard-manager @tauri-apps/plugin-fs @tauri-apps/plugin-dialog` + dev `vitest @types/node`.

**v2.7 additions** (approved): `pdfjs-dist` (PDF → text), `mammoth` (docx → text). Both lazily imported; never sent to network.

**Rust crates** (Phases 5–7, approved): `core-graphics`, `core-foundation`, `foreign-types`. Tauri feature `macos-private-api` enabled (used by both the capture overlay and the v2.9 collect-mode panel).

**Do not install**: UI component libraries, Redux, SWR/TanStack, rich text editors, date libraries (use native `Intl`). For any dependency outside this list, ask Ocean first.

> Note: capture overlay (§9.4) and collect-mode panel (§20.9, v2.9) are **additional Tauri windows** with their own Vite entry points. Multi-page build configuration, not new dependencies.

---

## 5. Legacy Code Disposition

> Keep the product-agnostic infrastructure; delete code that "knows it is a notes app." Not a full wipe, and not "modify in place."

Phase 0 forks: 0A builds from scratch / 0B strips an existing v1 repo. Both converge on the same starting point. From Phase 1 on the two paths are identical.

### 5.1 Keep / Delete List

| Disposition | Content |
|---|---|
| **Keep** | Tauri scaffold; Cargo/tauri config; Vite/Tailwind/tsconfig; `tokens.css`; **the entire `src/lib/ai/` directory**; `client.ts` wrapper pattern; `utils/`; generic UI atoms |
| **Delete** | textarea editor; AI suggestion panel; ghost text; `useSuggestions` + store; the `notes` table and CRUD; any "notes + suggestions" components |
| **Drop & recreate** | The SQLite database file (no users, no migration burden) |

---

## 6. AI Orchestration Strategy

Three-tier router infrastructure from v1 kept; the AI's job changes from "author" to "librarian" (Principle 5).

### 6.1 Three Model Tiers

| Tier | Primary Model | Speed | Free Quota |
|---|---|---|---|
| **Fast** | Groq `llama-3.3-70b-versatile` | 700+ tok/s | ~30 RPM, 14400 RPD |
| **Quality** | Google `gemini-2.5-flash` | ~150 tok/s | 1500 RPD, 1M context |
| **Local** | Ollama `qwen3:8b` | ~25 tok/s on M4 | unlimited |

### 6.2 The AI's Three Jobs in v2

| Job | Description | Primary → Fallback | When |
|---|---|---|---|
| **Thread status summary** | ~50-char sentence: where this project stands now | Quality → Local | User clicks, on-demand |
| **Thread conclusion summary** | At completion, generate digest from pinned blocks | Quality → Local | Completion time — optional, allowed to fail |
| **Capture classification suggestion** | Judge which thread a fresh block belongs to | Fast → Local | After capture, non-blocking |

### 6.3 Realistic Expectations for Local Model Quality

**Small models like Qwen3:8b can fail at summarization when input is very long or extremely fragmented.** This is not a bug to be fixed — it's a reality to be absorbed by product design:

> **An AI summary is always disposable decoration. Any UI displaying it must remain fully intact when the AI is absent / fails / is slow / produces low quality.** What is always shown first is the user's original information; AI is layered convenience.

### 6.4 Three Iron Rules

1. **Capture never waits for AI.** Pure local: read clipboard → write SQLite → toast. AI classification runs after.
2. **The core of pack and search is deterministic.** `pack/assemble.ts` is pure; FTS5 is local.
3. **In privacy mode, AI exits silently.** Entry points hidden if no local model.

### 6.5 Fallback & Quota

- Triggers: HTTP 429 / 5xx / timeout (fast 5s, quality 20s, local 30s).
- `quotaStore.ts` tracks today's usage; warns <10%; auto-switches at zero.
- Cache: LRU(100), key = sha256(prompt).

---

## 7. Repository Structure

```
spool/
├── src-tauri/
│   ├── src/
│   │   ├── main.rs              # plugins, tray, global shortcut, windows
│   │   ├── capture.rs           # capture commands + overlay window
│   │   └── collect.rs           # v2.9: long-press ⌥ + collect panel lifecycle + window-following
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── icons/
├── src/
│   ├── main.tsx                 # main window root
│   ├── App.tsx
│   ├── overlay/
│   │   ├── main.tsx             # capture overlay window root
│   │   └── CaptureOverlay.tsx
│   ├── collect/                 # v2.9
│   │   ├── main.tsx             # collect panel window root
│   │   └── CollectPanel.tsx     # persistent staging panel; in-memory items + Send/Discard
│   ├── components/
│   │   ├── Sidebar/             # SidebarSummary, FocusSection, WorkspaceGroup, ThreadListItem
│   │   ├── ThreadView/
│   │   │   ├── index.tsx
│   │   │   ├── ThreadHeader.tsx
│   │   │   ├── LogView.tsx
│   │   │   ├── DigestView.tsx
│   │   │   ├── BlockFeed.tsx
│   │   │   ├── BlockItem.tsx              # v2.9: adds active-block highlight class
│   │   │   ├── BlockAttachments.tsx
│   │   │   ├── BlockActions.tsx
│   │   │   ├── Composer.tsx
│   │   │   └── CompleteThreadPanel.tsx
│   │   ├── Capture/
│   │   │   ├── CaptureToast.tsx
│   │   │   └── RouteSuggestion.tsx
│   │   ├── Pack/PackDialog.tsx            # + v2.8 task-template selector
│   │   ├── Search/
│   │   │   ├── SearchOverlay.tsx
│   │   │   ├── SearchResultItem.tsx
│   │   │   └── InBlockNavigator.tsx       # v2.9: 1/N ▲ ▼ ✕
│   │   ├── Undo/UndoToast.tsx             # v2.9: feedback after Cmd+Z
│   │   ├── Settings/ (multiple files)
│   │   └── ui/ (Pill, IconButton, StatusDot, CountdownBadge)
│   ├── lib/
│   │   ├── capture/ (shortcut.ts, clipboard.ts, ingest.ts)
│   │   ├── collect/                       # v2.9
│   │   │   ├── stagingBuffer.ts           # in-memory items; add/remove/clear/getAll
│   │   │   └── send.ts                    # stagingItems[] -> merged block -> capture target
│   │   ├── undo/undoLog.ts                # v2.9: ring buffer of undoable ops
│   │   ├── pack/ (assemble.ts, templates.ts)
│   │   ├── search/query.ts                # v2.9: returns ALL hit offsets per block, not just hit line
│   │   ├── ai/ (router, providers, prompts, cache, parseJson)
│   │   ├── db/ (schema.sql, client.ts, workspaces.ts, threads.ts, blocks.ts, attachments.ts)
│   │   └── utils/
│   ├── hooks/
│   │   ├── (useWorkspaces, useThreads, useBlocks, useCapture, useSearch, useCountdown)
│   │   ├── useUndo.ts                     # v2.9
│   │   └── useCollectMode.ts              # v2.9
│   ├── stores/
│   │   ├── (workspacesStore, threadsStore, blocksStore, captureStore, searchStore, settingsStore, quotaStore)
│   │   ├── undoStore.ts                   # v2.9
│   │   └── collectStore.ts                # v2.9: panel open state + staging buffer mirror
│   └── styles/ (tokens.css, global.css)
├── index.html                             # main window
├── overlay.html                           # capture overlay
├── collect.html                           # v2.9: collect panel window
├── package.json
├── tsconfig.json (strict: true)
├── tailwind.config.js
├── vite.config.ts                         # multi-page: index + overlay + collect
├── PLAN_EN.md
└── README.md
```

---

## 8. Data Model

### 8.1 SQLite Schema (src/lib/db/schema.sql)

```sql
CREATE TABLE IF NOT EXISTS workspaces (
  id          TEXT PRIMARY KEY,
  title       TEXT NOT NULL DEFAULT '',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  deleted_at  INTEGER
);

-- v2.6 rollback: dropped `progress` and `next_step` via ALTER TABLE DROP COLUMN.
CREATE TABLE IF NOT EXISTS threads (
  id                 TEXT PRIMARY KEY,
  workspace_id       TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title              TEXT NOT NULL DEFAULT '',
  summary            TEXT,
  digest             TEXT,
  deadline           INTEGER,
  status             TEXT NOT NULL DEFAULT 'active', -- active | parked | done
  is_capture_target  INTEGER NOT NULL DEFAULT 0,
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL,
  completed_at       INTEGER,
  deleted_at         INTEGER
);

CREATE INDEX IF NOT EXISTS idx_threads_workspace
  ON threads(workspace_id, updated_at DESC) WHERE deleted_at IS NULL;

CREATE TABLE IF NOT EXISTS blocks (
  id            TEXT PRIMARY KEY,
  thread_id     TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL DEFAULT 'text',  -- text | ref
  content       TEXT NOT NULL DEFAULT '',
  annotation    TEXT,
  ref_thread_id TEXT,
  source        TEXT,
  pinned        INTEGER NOT NULL DEFAULT 0,
  created_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_blocks_thread
  ON blocks(thread_id, created_at ASC);

-- v2.7: extraction columns. v2.8: include_in_pack splits extract (always on) from inline (opt-in).
CREATE TABLE IF NOT EXISTS attachments (
  id              TEXT PRIMARY KEY,
  block_id        TEXT NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
  kind            TEXT NOT NULL,                   -- file | folder | url
  target          TEXT NOT NULL,
  label           TEXT NOT NULL DEFAULT '',
  extracted_text  TEXT,
  extracted_at    INTEGER,
  extraction_kind TEXT,                            -- pdf | docx | plaintext | failed | null
  include_in_pack INTEGER NOT NULL DEFAULT 0,      -- v2.8 default OFF
  created_at      INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_attachments_block
  ON attachments(block_id, created_at ASC);

-- FTS5 over content AND annotation; tokenize='trigram' required for Chinese.
CREATE VIRTUAL TABLE IF NOT EXISTS blocks_fts USING fts5(
  content, annotation, content=blocks, content_rowid=rowid, tokenize='trigram'
);
-- Triggers keep both FTS columns in sync.
```

**First-launch initialization**: Create workspace "Inbox" containing thread "Unsorted," `is_capture_target = 1`. Both undeletable.

**Schema version & migration policy.** `SCHEMA_VERSION = 5` in `client.ts`. **v2.9 does NOT bump the schema** — collect-mode staging lives in overlay-window memory; undo log lives in a ring buffer; bug fixes are behavior-only.

Migration history:
- v0 → current: fresh `schema.sql`
- v1 → v2: trigram tokenizer (DROP+recreate `blocks_fts` only)
- v2 → v3: additive `ALTER TABLE threads DROP COLUMN progress; DROP COLUMN next_step`
- v3 → v4: additive `ALTER TABLE attachments ADD COLUMN extracted_text / extracted_at / extraction_kind`. Existing rows backfilled lazily on next thread open
- v4 → v5: additive `ALTER TABLE attachments ADD COLUMN include_in_pack INTEGER NOT NULL DEFAULT 0`. Existing extracted-text rows stop auto-inlining until user toggles on (intentional)

§19.3 partially closed by these migrations; full named-registry framework still TBD before any preview release.

**Note on `blocks.source` semantics.** TEXT, but as of Phase 6 Round 2 auto-filled value is **browser tab title** for Safari/Chrome/Edge/Brave/Arc, **foreground app name** otherwise. User-editable (§9.3).

### 8.2 In-Memory Model (TypeScript)

```typescript
// src/lib/db/workspaces.ts
export interface Workspace {
  id: string;
  title: string;
  sortOrder: number;
  createdAt: number;
  updatedAt: number;
}

// src/lib/db/threads.ts
export type ThreadStatus = 'active' | 'parked' | 'done';
export interface Thread {
  id: string;
  workspaceId: string;
  title: string;
  summary: string | null;
  digest: string | null;
  deadline: number | null;
  status: ThreadStatus;
  isCaptureTarget: boolean;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
}

// src/lib/db/blocks.ts
export type BlockKind = 'text' | 'ref';
export interface Block {
  id: string;
  threadId: string;
  kind: BlockKind;
  content: string;
  annotation: string | null;
  refThreadId: string | null;
  source: string | null;
  pinned: boolean;
  createdAt: number;
}

// src/lib/db/attachments.ts
export type AttachmentKind = 'file' | 'folder' | 'url';
export type AttachmentExtractionKind = 'pdf' | 'docx' | 'plaintext' | 'image_ocr' | 'failed' | null;
export interface Attachment {
  id: string;
  blockId: string;
  kind: AttachmentKind;
  target: string;
  label: string;
  extractedText: string | null;
  extractedAt: number | null;
  extractionKind: AttachmentExtractionKind;
  includeInPack: boolean;
  createdAt: number;
}

// v2.9: src/lib/collect/stagingBuffer.ts — in-memory ONLY, never persisted.
export interface StagingItem {
  id: string;                       // local id; not a DB id
  content: string;
  annotation: string;               // visible inline per §2.5.1
  source: string | null;
  pinned: boolean;
  attachments: StagingAttachment[]; // not yet persisted; written to DB only on Send
  createdAt: number;
}
export interface StagingAttachment {
  kind: AttachmentKind;
  target: string;
  label: string;
}

// v2.9: src/lib/undo/undoLog.ts — in-memory ring buffer, ~10 deep, lost on restart.
export type UndoOpKind = 'capture' | 'merge' | 'delete' | 'collect_send';
export interface UndoEntry {
  id: string;
  kind: UndoOpKind;
  timestamp: number;
  payload: unknown;                 // sufficient to reverse the operation
  affectedBlockIds: string[];       // for invalidation when blocks edited after the op
  invalidated: boolean;
}
```

### 8.3 Auto-Save

Blocks persist immediately on creation. Workspace/thread metadata edits, block content edits, annotations: 200ms debounce-merge.

**Collect-mode staging items are NOT persisted** (§20.9). They live in the panel window's memory until Send writes them as one merged block, or Discard drops them with no DB write.

---

## 9. Feature Specifications

### 9.1 Workspace CRUD

| Operation | Trigger | Behavior |
|---|---|---|
| Create | "+ Workspace" at sidebar bottom | Empty workspace, focus title input |
| Rename | Double-click title | Inline edit, debounced |
| Reorder | Drag the workspace group | Update sort_order |
| Collapse/expand | Click arrow left of title | Frontend state only |
| Delete | Right-click + confirm | Soft-delete cascading; Inbox undeletable |

### 9.2 Thread CRUD

| Operation | Trigger | Behavior |
|---|---|---|
| Create | "+" in workspace / Cmd+N | Empty thread, focus title |
| Select | Click sidebar item | Load block feed |
| Rename | Double-click sidebar title (or header) | Inline edit, debounced; Esc cancels (v2.10) |
| Move workspace | Drag item / right-click menu | Update workspace_id |
| Edit metadata | Header controls | Debounced write |
| Set capture target | Sidebar hover button / header pin / tray | Transactional toggle (v2.10: one-click on sidebar; does not select/navigate) |
| Complete | Header button | See §9.8 |
| Delete | Header menu + confirm | Soft-delete; "Unsorted" undeletable |

### 9.3 Thread View (Active / Parked: LogView)

- Vertical timeline, oldest to newest. Read-only card stream + bottom composer. Not a chat.
- **On open: auto-scroll to bottom.** Newest blocks ARE "where you left off" (§3.3).
- `BlockItem` two kinds:
  - `text`: content, timestamp, **editable source badge**, optional **annotation** (visually distinct from captured content), zero or more **attachment chips** (§9.6). Pinned blocks carry an amber left bar.
  - `ref`: reference icon + thread title; click navigates.
- **Active-block visual treatment (v2.9, addresses §19.18).** After the user acts on a block (click, double-click to edit, expand/collapse, annotate), the block carries an active-state highlight for ~3 seconds:
  - Faint background tint via `--block-active-bg` (warm cream, distinct from `--accent-soft`).
  - Set when the action fires; fades over ~3s via CSS transition.
  - Only ONE block active at a time; a new action transfers the highlight.
  - This is the ONLY persistent visual diff between an under-attention block and siblings. Border/shadow/shape uniform — the bias is "find your place," not "this block is special."
  - Pinned-amber-bar and active-tint coexist independently.
- **Source-category icon** at the source-badge head (v2.6): single mono lucide-react glyph by source string match (Globe / Sparkles / FileText / Code2 / MessageSquare / Terminal / fallback dot). Case-insensitive contains-match on a small lookup. No colors. (v2.10: short ambiguous tokens — `ai`, `arc`, `edge`, `word` — are word-boundary anchored so they no longer mis-fire on ordinary words like "main" / "research" / "knowledge".)
- **First-line spine** (v2.10, display-only): a `text` block renders its opening line — the first paragraph if there is a blank line, else the first physical line — at a slightly heavier weight (font-weight 500, §13.4). Computed at render time from the content string; never stored, no markdown-heading parsing, not applied to `ref` blocks (§2.6).
- **Date dividers between days.** Thin horizontal divider with date in small mono ("5月17日 周六"); `1px var(--line)`; the dominant scanning aid in long threads.
- **Smart truncation** (v2.10 softened): a block collapses to ~6 lines only when it meaningfully exceeds them (> ~8 lines) — never to hide just 1–2 lines. The collapsed cut is a soft mask fade to `--paper` over the last lines (not a hard clip / ellipsis), with a quiet "展开全部 / 收起" control below. On search-navigation, the block auto-expands (§9.10, v2.9). Toggle fires the active-state highlight so the user keeps orientation.
- **Hover actions** (`BlockActions`): 📌 pin / ✎ edit / 📎 attach / ✑ annotate / copy / delete.
- `Composer`: persistent input; Enter appends a `text` block, Shift+Enter newline. `@` triggers mention (§9.7).
- **Feed sort**: chronological by default. A "by source" toggle reorders the same linear feed. This is a reordering, not a new view — growing it into grouping/filtering/separate-pane is rejected under §2.6 (§19.10). In source-sort mode date dividers are hidden.
- Virtual scrolling: enabled when blocks > 200.

### 9.4 Global Shortcut Capture (full design §10)

Three capture triggers in v1:
- **Primary**: **double-tap ⌥ within 500ms** — macOS CGEventTap on `FlagsChanged`, hardware event timestamps. 2026-07-08 copy-gate: with Input Monitoring granted, the double-tap only captures when a ⌘C/⌘X keydown was seen within the last 10s — it re-couples the trigger to the §10.2 "copy and remember" model on purpose, so Claude Desktop's identical quick-entry gesture keeps the bare double-tap. Without the grant the gate is bypassed (keyDown is invisible to an unprivileged tap and the conflict cannot occur in-app).
- **Fallback (revised 2026-07-07)**: user-bound global shortcut — **no default binding** (⌘⇧C retired per Ocean). When recorded in Settings it behaves as before: OS-level, always active.
- **Collect-mode trigger (v2.9, §20.9)**: **long-press ⌥ ≥600ms** — opens the persistent staging panel. While the panel is open, subsequent ⌥-captures append to the panel; the user-bound capture shortcut (if recorded; no default since 2026-07-07) still does direct DB-write as escape hatch.

Trigger flow (default capture): read clipboard text → get foreground app + browser tab title (`source`) → write one `text` block to capture-target thread → show capture toast. Clipboard empty/non-text: gentle toast, nothing written.

#### CaptureToast Must Deliver 100% Confidence — and Lives in Its Own Window

**Dedicated overlay window** — second Tauri window: borderless, transparent, always-on-top, non-activating (must NOT steal keyboard focus). Frontend separate Vite entry (`overlay.html` → `src/overlay/main.tsx` → `CaptureOverlay.tsx`); own SQLite access for Redirect.

`CaptureToast` spec: bottom-right of active screen, ~2.5s auto-dismiss (paused on hover or while the note editor is open). v2.10 slimmed the toast (dogfooding):
- **Content preview**: the captured content leads — full text clamped to two lines (was a ~12-char single line), so the user sees what landed, not a sliver.
- **Attribution**: one quiet, condensed, truncating line `<Workspace> / <Thread> · <source>` (mono/muted) — no longer a tall two-line `Saved to` block.
- **One-click 📌 pin** in the top-right cluster (next to ×) — a standalone toggle, NOT bundled behind any expansion.
- **Footer actions (icon-only)**: Undo (↩, also Cmd+Z anywhere per §9.13) / Redirect (⤳ dropdown grouped by workspace, across all workspaces). The old "Save as new thread" action was removed (v2.10).
- **Note**: double-click the toast body to reveal a quiet annotation editor (no visible affordance — keeps the default toast clean); Enter = newline, 「完成」 / click-away commits, Esc discards (the same annotation contract as a block, §20.4).
- AI classification suggestion runs in the background while the toast is visible.
- Appearing does NOT steal focus; setting the capture target (sidebar / header / tray) is a pure state toggle that also never pulls the window forward (§14.3).

### 9.5 Context Packer (the crown feature)

"Pack context" button on thread header (Cmd+Shift+P). v2.10: Pack is the **accent / primary action** in the header (the North Star, §2.2); 「完成项目」 stays neutral and 「捕捉目标」 is a quiet stateful toggle (filled pin + amber dot when this thread is the target, muted outline otherwise). The persistent workspace-selector dropdown was removed from the header — move a thread via sidebar drag or its right-click menu (§9.2).

- **Core assembly is the pure function `assemble.ts` — no AI, no network.**
- Template (in `templates.ts`) embeds an **English instruction header** before user content. Header in English regardless of UI language because LLMs follow English instructions more reliably (§19.13). User content stays in original language. Header's final line asks AI to respond in user's preferred language.

- Template structure:
  ```
  # Project Context: <title>

  Generated by Spool on <date>. <N> blocks total.

  ---

  ## How to Read This Context

  The blocks below come from FOUR different authority categories. Treat each category according to the rules in this section. This sorting matters — mishandling categories will produce wrong or unsafe output.

  ### 📖 Reference (authoritative)
  Blocks whose `source` looks like an institutional / official artifact (email clients, school/institutional domains, file attachments PDF/docx/slides, forum posts from authoritative figures).
  **Handling**: Treat as ground truth. Do not contradict. Do not extrapolate. If conflict with other categories, Reference wins.

  ### 🧩 Synthesis (already-formed understanding)
  Blocks whose `source` is another AI tool (Claude/ChatGPT/Gemini/etc.) AND content shape is long structured explanation (headings, formulas, multi-paragraph essays).
  **Handling**: Someone else's synthesis. May be useful as background or framing, but correctness not guaranteed. Do not treat as facts. If contradict Reference, defer to Reference. Do not copy wholesale.

  ### 🔄 Process (conversation traces)
  Blocks whose `source` is another AI tool AND content shape is question-and-answer dialogue (multiple turns, short exchanges, "User:" / "Q:" / "我:" markers, high question density).
  **Handling**: Literal content NOT a reliable source of facts. What IS reliable is the user's evolving questions — what they ask repeatedly, where they got confused, what they kept circling back to. Extract as signals of the user's cognitive gaps and address them; never quote the AI responses inside these blocks as authoritative.

  ### 💭 Personal (the user's own hypotheses and notes)
  Blocks with no `source` field — typed by user directly into Spool. Annotations attached to other blocks ALSO belong here in spirit — they are the user's framing of what the source block means.
  **Handling**: Read carefully — highest-signal input in this pack. Shows where the user currently stands, what they think the source material means, where their reasoning may be incomplete. Point out factual errors directly. (Per Spool's design bias, the user is encouraged to leave dense personal annotation; treat that density as intentional and weight accordingly.)

  ---

  ## Pinned Blocks

  Blocks explicitly marked as "core context" during work. Give them priority weight. Sorted by original timeline position.

  - 📌 [<time> · from <source>] <block content>
    note: <annotation if any>

  ## Full Record (chronological)

  [<time>] <block content>
  [<time> · from <source>] <block content>
      note: <annotation>
      ↳ attached file: <label> (kind: pdf/docx/etc.)
         <extracted text inlined here, indented, capped 8000 chars/attachment; truncation marker if exceeded>
      ↳ attached URL: <label> — <target>
  → Referenced thread: <referenced thread title>

  ## Related Files & Links

  - <attachment label> — <target>  [extracted: yes/no, inlined: yes/no]

  ---

  ## Output Language

  Respond in Simplified Chinese unless content itself dictates otherwise. Technical terms may stay in original language.
  ```

- **Assembly is still pure** — the four-category instructions are static text from `templates.ts` inlined verbatim. The receiving AI does the classification.
- **Attachment text inlining (v2.8)**: a file attachment's extracted text inlines beneath its block ONLY if `include_in_pack === true`. When inlined, capped at 8000 chars/attachment with truncation marker. When not inlined, appears in "Related Files & Links" as `[extracted: yes, inlined: no]` so the AI knows content exists but was withheld for length.
- `PackDialog` shows assembled text + Copy to clipboard. v2.8 adds a small task-template selector (§20.7); default = no task block.
- v1 scope: pack "everything." Range selector ("pinned only / last N days only") is v1.5.

### 9.6 Block Attachments — File / Folder / URL (unified, replaces "file anchors")

> A separate "file anchor" block kind and "attach to block" were the same need wearing two hats. Unified: any block can carry zero or more attachments. No `anchor` block kind.

- **Drag file/folder onto an existing block** → attach.
- **Drag file/folder into empty timeline space** → new `text` block (content = filename) carrying the attachment (the former "file anchor").
- **A URL** (dragged or via 📎) behaves the same.
- Chip = icon + label. Click opens with system default / Finder / browser. Missing target → toast, no crash.
- Attachment is a property of a block, not a structural tier (Principle 6 intact).
- v2.7: file attachments with extractable text (PDF/docx/txt/md) **auto-extract on attach** and cache `extracted_text`. Best-effort; unsupported types stay NULL. Local-only.
- v2.8: chips expand into inline preview when extracted text present. Toggle `include_in_pack` per attachment controls pack/summary inlining.
- pdf.js compat: WKWebView ships `ReadableStream` without async iteration; `extractor.ts` installs a polyfill before pdf.js loads (otherwise `getTextContent` throws).
- Images and other non-text formats: pointer-only. OCR out of scope (§17).

In pack (§9.5): a block's opted-in attachments inline beneath it; all attachments collected into "Related Files & Links."

### 9.7 @-Mention References

> The "what we do instead" for "no auto-linking" (§2.6). Explicit, lightweight, user-driven.

- Typing `@` in composer → fuzzy list of threads **in same workspace**.
- On selection → appends a `kind=ref` block, `ref_thread_id` points to referenced thread, `content` stores snapshot of title.
- `ref` block renders as clickable link; click navigates.
- **Same workspace only** — cross-workspace association is solved by full-text search (§9.10).
- v1: whole-thread reference. Specific-block reference is v1.5.

### 9.8 Thread Completion & Digest View (full design §11)

- "Complete project" → `CompleteThreadPanel`:
  - Handwritten conclusion input (primary path) + "Let AI summarize" button (optional).
  - Allow completing without writing anything — `digest` may be empty.
- On confirm: `status = done`, `completed_at = now`, `digest` written.
- `done` thread shows `DigestView` by default; can flip to `LogView` via header toggle.

### 9.9 Deadline, Status & Sidebar Structure

- Threads optionally set `deadline` + `status` (`active|parked|done`). No progress, no `next_step` (§2.6).
- `ThreadHeader`: title, status toggle, deadline picker, Pack, Complete, view toggle.
- Sidebar top to bottom:
  1. `SidebarSummary`: "X active · Y due this week · Z parked"
  2. `FocusSection`: across workspaces, deadlined not-done, sorted by countdown, ~5 max. <48h red, overdue dark red
  3. Workspace tree: collapsible groups. Within: active/parked top (deadline-urgent first then `updated_at`), done dimmed bottom. Draggable between groups
- `ThreadListItem` right side: `StatusDot` + `CountdownBadge` + capture-target pin. The `CountdownBadge` is hidden on `done` threads — a completed project is never overdue (v2.10 fix; `FocusSection` already excludes done).

### 9.10 Full-Text Search (v2.9 enhanced)

> A finished project, 90% of the time, is not for "browsing" — it is for "looking something up." Search replaces "organizing" as core retrieval. **v2.9 update**: three insufficiency findings from dogfooding addressed below.

- `Cmd/Ctrl+Shift+F` or sidebar search icon → `SearchOverlay`.
- SQLite FTS5 (`lib/search/query.ts`), searches `content` AND `annotation`. **Purely local, no AI.**
- **Tokenizer**: `trigram`. Chinese needs ≥3 chars; queries of 1-2 chars fall back to `LIKE` over the same columns. Caller doesn't pick the path.
- Ranking: bm25 on FTS5; insertion order on LIKE.
- **Result context**: `SearchResultItem` shows hit line + one line above + one line below (three lines), keyword highlighted. If block shorter than three lines, show whole block. Plus thread title, workspace title, time.

**v2.9 navigation enhancements** (closing §19.17):
- **Auto-expand on navigate**: when a search result navigates to a truncated block (>6 lines, collapsed), the block is **automatically expanded** before the highlight fires. User should never land on a collapsed block and have to manually expand.
- **Highlight all occurrences within destination block**: `query.ts` returns not just hit line offset but ALL character offsets where the query matches in content+annotation. On navigation, every occurrence wrapped in `<mark>` (using `--selection` background). The FIRST occurrence additionally gets a brief amber fade (~900ms) so the eye lands first but immediately sees the others.
- **In-block navigator (vscode-style)**: a small floating `InBlockNavigator` appears top-right of destination block: `1/N ▲ ▼ ✕`:
  - `▼` / Cmd+G / F3: next match. **v2.10**: stepping past the block's last match continues into the NEXT matching block — and its thread — instead of being trapped in one block (selects that thread + flashes the block, same as a result click).
  - `▲` / Cmd+Shift+G / Shift+F3: previous match; past the first, into the previous matching block/thread (landing on its last match).
  - `✕` / Esc: dismiss navigator (highlights remain visible).
  - Wraps around the whole result set at the ends.
  - Counter updates as user moves (per-block `index/total`).
  - **v2.10 — 全部 list**: the match-count chip opens a dropdown of every block that contains the text, across ALL workspaces (the kept result set, surviving the overlay's close); picking one jumps straight to that block/thread. The cross-block ▲/▼ and this list share one `searchStore.jumpToResult` / `goToHit` path.
- Navigator dismisses on >200px scroll away from destination, or click outside the block.
- `<mark>` wrappers are display-only — no schema change, no edit to block content. Computed in `BlockItem` when active search-hit context detected.

### 9.11 AI Summaries & Classification Suggestions

Two **optional, non-blocking** features; entry points hidden silently in privacy mode or with no model.

- **Status summary** (v2.10 — was a manual header button): **auto-generated once** on thread open — background, non-blocking, fire-and-forget, silent on failure (§18.9) — ONLY when `summary` is empty, the thread is active, AI is available, and there are ≥2 non-ref blocks. Routes `router.quality` (Quality→Local) with the LRU cache (§6.5); an attempt-ref fires it once so block changes can't re-trigger or clobber it. **Generate-once**: no staleness tracking, no auto-regeneration (the live newest-at-bottom feed is the real "where you left off", §3.3). The text is **click-to-edit** (debounced save, §8.3); a user-written summary is never overwritten (the empty guard). When AI is unavailable, a quiet "＋ 写一句话摘要" affordance shows instead of nothing, with a one-line inline hint on click (no popup/error styling, §14.4). Stays visually subordinate (italic subtitle); the `summarizeStatus` prompt body is unchanged (§18.5).
- **Conclusion summary**: §9.8 optional at completion. On failure/`NO_DIGEST` → section silently hidden; digest view still complete on pins + attachments.
- **Capture classification**: background `router.fast` after capture. Only at high/medium confidence does `RouteSuggestion` appear. One click moves; ignore leaves. **Never auto-moves.**

### 9.12 Settings Panel

Modal, entered via gear at sidebar bottom.

| Field | Type | Default | Note |
|---|---|---|---|
| Global capture shortcut | Shortcut recorder | unbound (2026-07-07: ⌘⇧C default retired) | Conflict check |
| Global search shortcut | Shortcut recorder | `Cmd/Ctrl+Shift+F` | Conflict check |
| Groq API Key | Password + test | empty | |
| Gemini API Key | Password + test | empty | |
| Ollama Endpoint | Text | `http://localhost:11434` | |
| Ollama Model | Dropdown | `qwen3:8b` | Auto-detected |
| Privacy mode | Toggle | off | AI Local-only; entry points hidden if no local |
| Today's quota | Read-only bars | — | From quotaStore |
| Launch at login | Toggle | off | |
| Clear all data | Danger button + confirm | — | |
| 图片文字提取 (Gemini) | Toggle | off | §20.10 experiment; opt-in cloud OCR for image attachments; warn that Gemini free tier trains on data; no effect in privacy mode |

Keys via `tauri-plugin-store`.

### 9.13 Undo Operation (v2.9)

> Promoted from "planned follow-up" (Strategic Brief §6) to formal spec. Closes a long-standing gap: a user who fat-fingers a delete, an unintended merge, or a stray double-tap ⌥ that captured the wrong clipboard should have a one-key way back. The mechanism is intentionally **narrow** — a small safety net, not a general undo stack — so it stays predictable and cheap to maintain.

**Shortcut**: Cmd+Z (Ctrl+Z on Win/Linux) anywhere in the main window AND inside the collect-mode panel window (§20.9). **Focus-split (v2.10)**: when focus is in a text input / textarea / contentEditable, Cmd+Z falls through to the browser's **native** text undo (per-keystroke, Word-like, IME-safe) — the operation ring runs only when focus is NOT in an editable field. (All edit textareas are pure-passthrough controlled inputs, so native undo history stays intact — no uncontrolled-ref pattern needed.)

**Scope** — last ~10 of these operations is reversible:
- **Capture** → undo deletes the most recently captured block (same effect as capture toast's existing Undo action; Cmd+Z is a global second path).
- **Merge** (§20.1) → restores source blocks at their original feed positions, deletes the survivor. Annotations, attachments, pinned state restored to original owners.
- **Delete** (BlockActions trash) → restores deleted block with attachments and annotations. Position by `created_at`.
- **Collect-mode Send** (§20.9) → deletes the block the panel just merged-and-wrote. If the panel is still open and empty, original staging items are re-staged into it; if a new panel session has started, undo only deletes the written block.
- **Highlight** (§20.5, v2.10) → restores the block's pre-gesture content. Payload `{ blockId, beforeContent }`; skipped if the block was edited since (same invalidation as below).
- **Thread delete** (v2.10) → clears the thread's soft-delete `deleted_at`; its blocks (which have no `deleted_at`) return with it. Payload `{ threadId, title }`.
- **Workspace delete** (v2.10) → clears `deleted_at` on the workspace AND only the threads that delete stamped with one shared timestamp, so threads the user had deleted earlier stay deleted. Payload `{ workspaceId, deleteTimestamp }`. (Inbox is undeletable, so it never produces this entry.)

**Out of scope** (NOT undoable via Cmd+Z):
- Block content edit / annotation edit / source-badge edit / pin-unpin — reversible by reverse action.
- Workspace/thread create / rename / move — lower-volume; recovery via reverse action. (Thread + workspace **delete** ARE undoable as of v2.10 — see Scope above.)

**Storage**: in-memory ring in `lib/undo/undoLog.ts`, capacity 10. Lost on app restart. Persisting undo across restarts is NOT a goal — this is "I just did the wrong thing, fix it now," not "yesterday I made a mistake."

**Single-direction**: no redo.

**Safety against silent data loss**:
- Each entry carries `affectedBlockIds`.
- If any affected block has been edited (content or annotation) since the op, the entry is marked `invalidated` and silently skipped by Cmd+Z (next valid entry used instead). User's most-recent edit wins.
- All entries empty or invalidated → quiet "Nothing to undo" toast.

**Feedback**: every successful undo shows `UndoToast` (in `Undo/UndoToast.tsx`) in the same corner as capture toast:
- "已撤销:捕获 / 已撤销:合并 / 已撤销:删除 / 已撤销:暂存合并" + first ~12 chars of restored block. v2.10 adds "已撤销:高亮", "已撤销:删除项目「<title>」", "已撤销:删除工作区".
- Auto-dismiss ~2.5s, paused on hover.
- Shown in the window where Cmd+Z was pressed.
- NO "redo" action.

**Cross-window contract**:
- Capture via overlay → main SQLite; main window's Cmd+Z can undo it (undo log shared via `undoStore` listening on Tauri event from `capture.rs`).
- Collect panel runs its own local sub-undo for staging ops (add/remove/edit staging item). Cmd+Z in panel first checks field-focus (→ native text undo, v2.10), then the local sub-undo, then falls through to the main undo log. A user can repeatedly undo within a staging session without affecting committed blocks. v2.10: the local sub-undo is **silent** — no `UndoToast`; the panel visibly updates, so collect-internal undo needs no feedback.
- A `collect_send` op enters the MAIN undo log (it persists a block); panel-local staging ops do not.

**Interaction with the existing toast Undo**: both reach the same `undoLog.ts` machinery. The toast Undo is discoverable; Cmd+Z is muscle-memory. Both fire identical reversal.

---

## 10. Design Problem I: Frictionless Capture

> Ocean's core demand: **let the user's habitual action be captured by the software, rather than adding a new burden.**

### 10.1 The Friction Spectrum

| Approach | Friction | Problem |
|---|---|---|
| Fully manual | High | Rejected |
| Explicit shortcut (Cmd+Shift+C) | Low | Still "conscious" |
| Passive clipboard monitoring | Minimal | Catches passwords, junk; "being watched" |
| Fully automatic linking | Zero | Doesn't exist (§2.6) |

"100% automatic + 100% non-invasive" is a contradiction.

### 10.2 The v1 Solution: "Copy and Remember"

When using an LLM / looking things up / reading email, the user already presses Cmd+C on valuable content. The shortcut **rides existing muscle memory**.

Mental model: **Cmd+Shift+C = "copy and remember."**

> 2026-07-07 revision: the chord no longer has a default binding — double-tap ⌥ (§9.4) is the "copy and remember" trigger. A user-recorded shortcut in Settings plays the same role for users who prefer a chord; everything below reads accordingly.

Paired with three zero-decision mechanisms:
- **Always a capture target.** Tray menu shows + switches with one click (a pure state toggle — never selects, navigates, or pulls the window forward, §9.2 / §14.3).
- **Classification is after-the-fact, non-blocking.**
- (v2.9) **Collect mode (§20.9)** covers per-unit batching — the user wants to consolidate several captures + annotations into ONE block before committing.
  (The old "Save as new thread" toast action was removed in v2.10 — §9.4.)

### 10.3 Capture Confirmation Is Part of Zero-Friction

Zero-friction is not only "press is fast" — it includes "the moment after, you feel safe." Without that, the user switches back to the main window to confirm, destroying the promise. The CaptureToast (§9.4) — content preview + two-tier attribution + dedicated overlay window — is a necessary component of the core promise, not a nice-to-have.

### 10.4 Engineering Detail: Simulate Copy First?

- A: Assume user already copied — reliable, requires habit.
- B: Simulate Cmd+C first, then read — smoother, but accessibility-permission and timing race.

**v1 adopts A**. B is v1.5.

**v2.5 update**: double-tap **⌥ (Option)** added — not ⌘. Rationale: ⌘+letter double-tap entangles with OS copy/cut/paste semantics on heavy apps; ⌥ alone is rarely a primary modifier, so `FlagsChanged` events are clean. Interval uses CGEvent hardware timestamps.

**v2.9 update**: **long-press ⌥ (≥600ms)** opens collect-mode panel (§20.9). Three ⌥ behaviors disambiguated by duration:
- Single press-release within ~100ms: ignored (no spurious activation).
- Two press-releases within 500ms: **double-tap** → instant capture.
- One press held ≥600ms: **long-press** → open collect panel (only if no panel currently open).

The 600ms threshold doesn't overlap with the 500ms double-tap window: a double-tap releases the first ⌥ before 600ms, so the long-press timer never fires. A held ⌥ stays past 500ms, so the double-tap detector never fires. The two paths are non-interfering by construction.

### 10.5 Source Auto-Detection

A clipboard-reading shortcut cannot obtain the source URL. That's v1.5.

What v1 *does* auto-fill into `blocks.source`:
- For Safari/Chrome/Edge/Brave/Arc: active **tab title** via per-browser AppleScript (2.2s osascript budget).
- Otherwise: foreground **app name**.
- On per-browser AppleScript failure (denied / quit / timeout): silently fall back to app name.

Permission: macOS prompts once per browser. Denied → app name; `source` editable inline.

True URL capture stays v1.5; per-browser permission settings surface is §19.7.

### 10.6 Further Approaches for v1.5 / v2

- **Desktop floating widget (v1.5 candidate)**: distinct from the **capture overlay** (transient, ~2.5s) and the **collect-mode panel** (persistent, user-controlled lifecycle). Both windows already establish multi-window + non-activating-window groundwork.
- **Passive clipboard buffer (v2)**.

---

## 11. Design Problem II: Browsing a Finished Project

> Ocean's worry: "The project info is all there, but it feels noisy." Not too much information — a **shape mismatch**: workbench-shape carrying archive-need.

### 11.1 Two Value-Density Stages

- **Active**: workbench. Every block useful.
- **Done**: archive. 90% process noise; 10% conclusions.

### 11.2 The `done` Status Unlocks a Digest View, Strict Hierarchy

- **Process view (LogView)**: full timeline, always preserved, one click away.
- **Digest view (DigestView)**: default for done threads. Strict hierarchy:

  > **1. Pinned blocks with their attachments (highest — always shown)**
  > **2. All thread attachments in one "Files & Links" section (always shown)**
  > **3. AI conclusion summary (lowest — may be absent)**

  - Pinned blocks + attachments are **structural**; no AI dependency.
  - Conclusion summary is **decoration**; if absent, hidden silently — the digest view holds up on pins + attachments.

### 11.3 Why This Holds

- Zero extra organizing cost. Pinning happens during work; conclusion is one optional sentence.
- Immune to small-model unreliability — pins and attachments alone hold up the view.

### 11.4 What "Browsing" Decomposes Into

1. **Findable** → FTS (§9.10), with context.
2. **Understandable** → digest view (§11.2), strict hierarchy.
3. **Usable** → packer (§9.5) + @-mention (§9.7).

---

## 12. Prompt Library

Each prompt is its own file. All prompts: open with a role, markdown sections, strict output format, explicit "never" wording. **Do not pile on few-shot examples** — rely on precise rules.

### 12.1 Thread Status Summary (src/lib/ai/prompts/summarizeStatus.ts)

```typescript
// v2.7: attachmentsByBlock. v2.8 update: only attachments with include_in_pack === true inlined.
export const buildStatusPrompt = (
  thread: Thread,
  blocks: Block[],
  attachmentsByBlock: Record<string, Attachment[]> = {},
) => `
你是一个项目状态摘要工具。读下面这条项目脉络里按时间排列的信息块,写一句话总结"这个项目现在到哪一步了"。

# 项目标题
${thread.title || '(无标题)'}

# 信息块(按时间从旧到新;部分信息块附带文件内容,以 📎 标出,应视为该信息块的一部分)
${blocks.map(b => `[${formatTime(b.createdAt)}] ${b.content}`).join('\n')}

# 规则
1. 只输出一句话,不超过 50 字
2. 聚焦"当前状态 / 下一步",不要复述全部历史
3. 绝对不要添加信息块(含其附件内容)里没有的内容
4. 不要前言、解释、markdown 标记——直接输出那句话
`.trim();
```

### 12.2 Thread Conclusion Summary (src/lib/ai/prompts/summarizeDigest.ts)

```typescript
// v2.8: signature gains attachmentsByBlock; pinning is the opt-in for inlining
// (pinning is a stronger "this matters" signal than include_in_pack).
export const buildDigestPrompt = (
  thread: Thread,
  pinnedBlocks: Block[],
  attachmentsByBlock: Record<string, Attachment[]> = {},
) => `
你是一个项目结论摘要工具。一个项目刚结束,下面是用户在过程中标记为"重要"的信息块。把它们提炼成一段简短的结论摘要,供日后归档查阅。

# 项目标题
${thread.title || '(无标题)'}

# 用户标记为重要的信息块
${pinnedBlocks.map(b => `- ${b.content}`).join('\n')}

# 规则
1. 输出 2-4 句话,总共不超过 120 字
2. 聚焦"最终结论 / 关键决定 / 可复用的东西",不要复述过程
3. 绝对不要添加信息块里没有的内容
4. 如果置顶内容过于零碎、无法形成有意义的结论,只输出一行:NO_DIGEST
5. 不要前言、解释、markdown 标记——直接输出摘要正文
`.trim();
```

### 12.3 Capture Classification (src/lib/ai/prompts/route.ts)

```typescript
export const buildRoutePrompt = (
  blockContent: string,
  threads: { id: string; title: string; recentSnippet: string }[]
) => `
你是一个信息归类工具。判断下面这条新捕捉的内容,最可能属于哪一条已有项目脉络。

# 新捕捉的内容
${blockContent}

# 已有项目脉络
${threads.map(t => `- id: ${t.id}\n  标题: ${t.title}\n  最近内容: ${t.recentSnippet}`).join('\n')}

# 输出(仅 JSON,无其他文字、无代码块标记)
{
  "threadId": "最匹配的脉络 id,如果都不像就填 null",
  "confidence": "high | medium | low"
}

# 规则
1. 只有内容上明确相关才给 high/medium;勉强沾边给 low
2. 宁可保守:不确定就 null 或 low,绝不硬塞
`.trim();
```

### 12.4 Engineering Notes

- `parseJson.ts` handles: code-fence wrapping, trailing commas, single quotes, unescaped newlines.
- Classification `low` or `null` → frontend doesn't show `RouteSuggestion`.
- Conclusion `NO_DIGEST` → frontend hides digest section silently.
- **Prompts are core product IP. Copy them verbatim into the implementation; do not "optimize" them.** Beyond Ocean-authorized prompt changes (v2.7 attachment-aware status, v2.8 pinning-gated digest), do not alter.

---

## 13. Design System

### 13.1 Design Tokens (src/styles/tokens.css)

```css
:root {
  --paper:        #faf7f0;
  --paper-2:      #f3eee2;
  --paper-edge:   #ebe4d2;
  --ink:          #1c1a16;
  --ink-2:        #4a463d;
  --muted:        #8c8576;

  --line:         #e6dfcc;
  --line-strong:  #d6cdb3;

  --accent:       #b45309;
  --accent-2:     #92400e;
  --accent-soft:  #fef3c7;
  --highlight:    #fbbf24;
  --selection:    #fef9c3;

  --status-active:   #6b7c5a;
  --status-parked:   #a8632c;
  --status-done:     #8c8576;
  --urgent:          #b3402f;

  /* v2.9: active-block highlight per §9.3 / §19.18 */
  --block-active-bg:           #f7f1de;  /* warm cream, distinct from --accent-soft */
  --block-active-bg-fade-ms:   3000;     /* CSS transition duration */

  --pad-page-x: 2.5rem;
  --pad-page-y: 1.75rem;

  --font-ui:    'Geist', -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif;
  --font-serif: 'Fraunces', 'Songti SC', 'STSong', serif;  /* 2026-07-07: was Instrument Serif */
  --font-mono:  'Geist Mono', ui-monospace, monospace;

  --r-sm: 4px; --r-md: 8px; --r-lg: 12px; --r-pill: 999px;

  --shadow-card:  0 4px 12px -6px rgba(120, 80, 20, 0.15);
  --shadow-toast: 0 8px 24px -8px rgba(60, 40, 10, 0.25);
}
```

### 13.2 Component Atom Conventions

- **Pill**: `padding: 5px 11px; border-radius: 999px; border: 1px solid var(--line)`.
- **IconButton**: `padding: 5px 10px; border-radius: 6px`.
- **StatusDot**: 4px filled circle, status-color.
- **CountdownBadge**: small text + dot; near/overdue uses `--urgent`.
- **Card** (block / toast / dialog): `border: 1px solid var(--line-strong); border-radius: 8px`.
- **CaptureToast**: overlay window, `--shadow-toast`, 220ms slide-in, ~2.5s fade-out, paused on hover.
- **CollectPanel** (v2.9): collect-mode window, `--shadow-toast`, persistent (no auto-dismiss). Header with Send/Discard; body is a vertical stack of `StagingItem` cards, each with a visible annotation slot.
- **StagingItem** (v2.9): Card variant — content text on top; inline source badge (Pill-styled); annotation textarea below (visible, not hover-gated, per §2.5.1); X to remove.
- **UndoToast** (v2.9): same dimensions and animations as CaptureToast.
- **InBlockNavigator** (v2.9): small pill (~80px wide) anchored top-right of destination block; `1/N ▲ ▼ ✕` in `--font-mono`.
- **Active-block highlight** (v2.9): CSS class `.block-active` on BlockItem root → `background-color: var(--block-active-bg); transition: background-color var(--block-active-bg-fade-ms) ease-out`. Removed after ~3s or when another block becomes active.

### 13.3 Animation Spec

- Block entrance: 220ms ease-out, translateY(4px→0) + opacity(0→1).
- Toast slide-in: 220ms; fade-out: 300ms.
- Successful capture: corresponding sidebar thread item flashes amber 900ms.
- Search-navigation: first matched occurrence within destination block gets 900ms amber fade; destination block gains active-block tint (§13.2) for ~3s.
- "Show more / show less": 160ms ease on height. Re-applies active-block tint so user keeps orientation.
- Workspace collapse/expand: 160ms ease.
- Active-block tint: 3000ms ease-out fade.
- **Do not do**: chat-style bubble animations, modal scaling, hover glow, slide-in sidebars.

### 13.4 Font Usage

- Sidebar logo / workspace titles / thread titles: Fraunces (2026-07-07: was Instrument Serif).
- Block body / composer / staging-item textarea: Geist, 15px, line-height 1.65.
- UI: Geist, 11–13px.
- Timestamps / source badges / attachment chips / kbd / InBlockNavigator: Geist Mono, 10.5px.

---

## 14. Key Interaction Details

### 14.1 Keyboard Shortcuts

| Key | Behavior | Scope |
|---|---|---|
| **Double-tap ⌥ (Option)** | **Global capture — primary** (macOS) | **System-global** |
| **Long-press ⌥ ≥600ms** | **Open collect-mode panel** (v2.9, macOS) | **System-global** |
| User-bound shortcut (unbound by default — 2026-07-07, ⌘⇧C retired) | **Global capture — fallback** | **System-global** |
| **Cmd/Ctrl+Shift+F** | **Global search overlay** | **System-global** |
| Cmd/Ctrl+Shift+P | Pack current thread | Main window |
| Cmd/Ctrl+N | New thread in current workspace | Main window |
| Cmd/Ctrl+, | Settings | Main window |
| **Cmd/Ctrl+Z** | **Undo last capture / merge / delete / collect-send** (v2.9) | **Main + collect panel** |
| Cmd/Ctrl+G / F3 | Next match within destination block (after search nav) | Main window |
| Cmd/Ctrl+Shift+G / Shift+F3 | Previous match | Main window |
| @ | Trigger mention in composer | Composer focused |
| Enter / Shift+Enter | Composer append / newline | Composer focused |
| Tab (in collect panel) | Next staging-item annotation field (v2.9) | Collect panel |
| Esc | Close toast/dialog/overlay/settings/collect panel/in-block navigator; cancel edit | Global |

### 14.2 System Tray

- Resident in macOS menu bar. Amber "S" icon.
- Menu: current capture target (switchable), open main window, new thread, settings, quit.
- **Closing main window hides it** (webview stays alive). Quit only via tray.

### 14.3 Focus Management

- After creating workspace/thread → focus title input.
- A capture **does not steal foreground focus**.
- A long-press ⌥ opening the collect panel **also does not steal focus** (v2.9). The panel is non-activating like the overlay; the user keeps typing in the source app and ⌥-captures more items as they go.
- Pack dialog opens → focus Copy.
- Search overlay opens → focus search field.
- **Block enters inline-edit (v2.9 fix for §19.19)**: capture block's bounding rect BEFORE the read-only-to-edit DOM swap; perform swap; restore scroll position so the block stays in the same viewport position; call `textarea.focus({ preventScroll: true })` to prevent default scroll-into-view. **Edit-mode entry MUST NEVER cause viewport shift.**

### 14.4 Error Handling

- AI calls try-catch wrapped; on failure, silently fall back, then silently skip. No error popup.
- Clipboard empty / non-text on capture: gentle toast, nothing written.
- Attachment target missing/unreachable: toast notice, block and attachment kept.
- Network down: AI auto-tries Local; if absent, silently skip. Capture/pack/search unaffected.
- **v2.9 — Undo with no undoable ops**: quiet "Nothing to undo" toast.
- **v2.9 — long-press ⌥ while a panel is already open**: no-op; panel stays as-is, no second panel spawned.

### 14.5 Empty States

- No workspaces (shouldn't happen): guide to create.
- Workspace no threads: "+ Create the first project."
- Thread no blocks: "Double-tap ⌥ to capture your first piece of info, or write below." (2026-07-07: was Cmd+Shift+C)
- Focus section empty: hidden entirely.
- Search no results: "Nothing found — try other keywords?"
- Digest view no pins/attachments/digest: "This project has no marked highlights. Look through the full record?" + jump to LogView.
- **v2.9 — Collect panel empty** (after Discard or initial open with no captures): "暂存中。下次 ⌥-捕获将加入这里。" + Send/Discard grayed until first item lands.

---

## 15. Implementation Roadmap (for Claude Code)

> Each phase is an independent unit of work. After completing one, STOP and wait for Ocean to review.
>
> **v2.9 roadmap update**: §20.9 Collect Mode, §9.13 Undo, §9.10 search enhancements, §19.18/19.19 bugfixes are tracked as **Phase 11.5 — Track B & Bug Bar Hardening**, sitting between Phase 11 (AI Layer, complete) and Phase 12 (Polish + Packaging). Phase 11.5 is the current frontier. The kill-criteria review (§20.8) for all Track B items happens at the end of Phase 11.5's 3-week dogfooding window.

### Phase 0 — Starting Point [unchanged]

0A: from scratch / 0B: strip v1 repo. Converge on Tauri + infrastructure + zero feature code.

### Phase 1 — Data Layer & CRUD [COMPLETE]
### Phase 2 — UI Skeleton & Thread View [COMPLETE]
### Phase 3 — Global Shortcut Capture [COMPLETE]
### Phase 4 — Context Packer [COMPLETE]
### Phase 5 — Capture Hardening [COMPLETE]
### Phase 6 — Block Workbench [COMPLETE]
### Phase 7 — Full-Text Search [COMPLETE]
### Phase 8 — Deadline, Status & Sidebar Structure [COMPLETE]
### Phase 9 — Thread Lifecycle & the Digest View

[Spec unchanged from v2.6 — handwritten conclusion primary, AI optional, DigestView strict hierarchy §11.2.]

### Phase 10 — @-Mention References

[Spec unchanged — composer `@`, fuzzy in-workspace title match, `kind=ref` block.]

### Phase 11 — The AI Layer [COMPLETE]

Produced the dogfooding findings that drove v2.7/v2.8/v2.9 revisions.

### Phase 11.5 — Track B & Bug Bar Hardening (NEW in v2.9, ~5–6 h)

> The frontier. Bundles §20 Track B work already in flight plus the v2.9 bug bar (§19.17/18/19) and §9.13 Undo.
>
> **Order matters within this phase** — each step leans on the prior:
>
> **Step 1 — Active-block visual identification (§19.18)** — smallest, low-risk, immediate orientation benefit. Add `--block-active-bg`, `.block-active` class, BlockItem state for "last-acted-upon," 3s CSS fade.
> **Acceptance**: double-click → edit → save → collapse → user still sees at a glance which block was just operated on.
>
> **Step 2 — Edit-mode scroll preservation (§19.19)** — surgical fix in BlockItem's edit-mode swap. Capture bounding rect before swap; restore scroll position after; `focus({ preventScroll: true })`.
> **Acceptance**: double-clicking any block to edit no longer moves it out of the viewport.
>
> **Step 3 — Search precision + in-block navigation (§9.10 v2.9 / §19.17)** — three parts:
>   (a) `query.ts` returns ALL hit offsets per block (not just one snippet position);
>   (b) BlockItem auto-expands on search navigation;
>   (c) new `InBlockNavigator` component + Cmd+G / Cmd+Shift+G shortcuts.
> **Acceptance**: search a word appearing 5× in one truncated block → click result → block auto-expands → all 5 highlighted → `▼` cycles through in order.
>
> **Step 4 — §9.13 Undo Operation** — `lib/undo/undoLog.ts` ring buffer; `undoStore`; Cmd+Z handler in both windows; `UndoToast`; integration with capture/merge/delete; collect-send hook stub (filled by Step 5).
> **Acceptance**: capture → Cmd+Z removes; merge 3 blocks → Cmd+Z restores all 3; delete a block → Cmd+Z restores. Edit the block then Cmd+Z on the original capture → silent skip with "Nothing to undo" if no other undoable ops remain.
>
> **Step 5 — §20.9 Collect Mode** — the largest piece. `src-tauri/src/collect.rs` for long-press ⌥ detection + panel window lifecycle + window-following; `collect.html` + `src/collect/main.tsx` + `CollectPanel.tsx`; `lib/collect/stagingBuffer.ts` + `lib/collect/send.ts`; `collectStore`; Tab-key annotation focus traversal; integration with Step 4's undo log for collect_send.
> **Acceptance**: long-press ⌥ opens panel; subsequent ⌥-captures append; each item has visible annotation slot; Tab cycles annotation fields; Send writes one merged block to capture target; Discard drops with no DB write; panel follows when user switches Mac space/app; Cmd+Z inside panel undoes a staging add/remove.
>
> **Step 6** — Run the §20.8 kill-criteria review at end of the 3-week dogfooding window: highlight (§20.5), toast expansion (§20.6), templates (§20.7), collect mode (§20.9). Keep / cut / tune per Ocean's observed usage. Promote survivors into §1–§19 per the graduation protocol.

### Phase 12 — Polish, Settings, Packaging (~2.5 h)

- Settings: two shortcut recorders (conflict-checked), three API keys + test, Ollama detection, privacy mode, launch at login, quota display, clear data + per-browser permission status (§19.7).
- Confirmation experiments on Phase 11.5 features.
- Virtual scrolling when blocks > 200; unify error handling; empty states.
- Build .dmg; README + screenshots + API-key acquisition guide.
- **Acceptance**: .dmg installs and runs; shortcuts changeable; privacy mode verified zero outbound; a friend can pick it up.
- Note: §20.10 (image OCR) ships its Settings toggle here, but the feature is a fenced §20 experiment (default OFF). The .dmg therefore retains "zero outbound by default"; OCR fires only on explicit opt-in.

### Phase 13 (optional) — Release

GitHub repo, MIT, Actions for macOS+Windows builds, release v0.13.0 (first packaged build under v2.9 PLAN).

---

## 16. Acceptance Criteria

After each phase, Ocean should be able to:

- **Phase 1**: console-driven CRUD; persists across restart.
- **Phase 2**: manual project log usable.
- **Phase 3**: capture with one key; toast confirms.
- **Phase 4**: pack with one click.
- **Phase 5**: capture with main window hidden, see toast on source screen.
- **Phase 6**: attach files; edit; annotate; truncation works.
- **Phase 7**: search finds blocks with context.
- **Phase 8**: sidebar shows status, deadlines, drag-between-workspaces.
- **Phase 9**: complete a thread → digest view, works even without AI.
- **Phase 10**: @-reference threads in same workspace.
- **Phase 11**: AI summarizes/classifies; product unharmed when AI fails.
- **Phase 11.5 (v2.9)**:
  - Active block stays visually identifiable through edit/collapse/annotation cycles (§19.18).
  - Double-click to edit no longer scrolls viewport (§19.19).
  - Search lands correctly even when destination block is truncated; all occurrences highlighted; ▼ cycles next match (§9.10 v2.9).
  - Cmd+Z undoes capture/merge/delete/collect-send; works in main and collect windows; safely skips if the block was edited since (§9.13).
  - Long-press ⌥ opens persistent staging panel; visible annotation slots per item; Send merges to one block; Discard drops nothing-persisted; panel follows across Mac spaces (§20.9).
- **Phase 12**: friend can install and use the .dmg.

**Overall quality bar** (v2.9 additions in bold):
- Startup < 2 seconds.
- Capture latency: keypress → toast < 200ms.
- Pack: click → dialog < 100ms.
- Search: input → results < 150ms.
- **Cmd+Z latency: key → UndoToast < 100ms.**
- **Long-press ⌥ → panel-appearance: < 200ms after the 600ms hold threshold.**
- **Edit-mode entry MUST NOT cause scroll position change beyond ±2px** (sub-pixel allowance only).
- **Collect-mode staging buffer must survive a Mac app/space switch with all items intact.**
- Any AI failure neither crashes nor pops an error — falls back or silently skips.
- Privacy mode: packet capture verifies zero outbound.
- Zero data loss: SQLite up-to-date at any force-quit.

---

## 17. Out of Scope (with architectural hooks)

Not in v1 scope, but the architecture accommodates them. Run any new feature through §2.7 first.

| Feature | When | Hook |
|---|---|---|
| Always-on desktop floating widget | v1.5 candidate | Overlay window + non-activating-window groundwork already established (capture overlay + v2.9 collect panel) |
| Pack range selector (pinned only / last N days) | ✅ shipped 2026-07-06 | `filterBlocksForRange` pre-filter in `assemble.ts`; PackDialog 打包范围 pills (全部/仅置顶/近7天/近30天) |
| Cross-session scroll memory | v1.5 if dogfooding shows gap | `threads.last_scroll_block_id` column |
| AI pack compression | ✅ shipped 2026-07-06 | `compressPack.ts` prompt (tunable, not §12-locked) + PackDialog AI 压缩 button; deterministic pack stays default, compressed text is a togglable second view. 2026-07-07 revision: Gemini-only via `noFallback` + 120s compression-specific timeout (fallback tiers truncated a 41k-char input and fabricated a ~700-char summary) + result guards (≥15% of original; every note:/sourceless line survives verbatim); button disabled with explanation when Gemini unavailable (no key / privacy mode) |
| Auto-copy selection on capture | v1.5 | settings option + branch in capture.rs |
| Source URL capture | v1.5 | same AppleScript path as tab-title; enrich `blocks.source` or add column |
| @-mention specific block | v1.5 | `ref_block_id` column |
| Node-graph thread view | v1.5+ pending demand (§2.6) | block feed is a list; graph would consume it read-only |
| Passive clipboard buffer | v2 | in-memory ring + tray review interface |
| Markdown rendering | v2 | swappable BlockItem renderer |
| Streaming AI output | v2 | `stream` option in router interface |
| Mobile | v2 | Tauri 2.0 builds iOS/Android |
| E2EE sync | v2 | per-block `nonce` column + key layer |
| Browser extension | v2 | extension talks to app over local port |
| File attachment preview UI (inline PDF viewer, image thumbs) | v2 | extracted text cached (v2.7); preview is rendering layer |
| OCR for image attachments | **§20.10 (Track B experiment, NEW)** | Now an attach-time, cached extraction (like PDF/docx) via opt-in Gemini vision — so it does NOT put AI in the pack hot path. Fenced; off by default; kill criterion in §20.8 |
| Cross-app file watch / re-extract | v2 | FSEvents/inotify watcher |
| **Trash / soft-delete recovery surface** (v2.9 addition) | v1.5 | Workspace/thread deletes are already soft. Cmd+Z intentionally does NOT cover them (low-volume, recover via reverse action). Trash view recovering ~30 days is the proper home. No schema change |
| **MCP local server — zero-paste re-brief** | **§20.12 (Track B, built 2026-07-07, experimental, default OFF)** | `spool --mcp` stdio subcommand; renderer locked to `assemble.ts` by cross-language golden test; kill criterion in §20.8/§20.12 |

> Items already promoted into v1 from this table: double-tap-modifier capture trigger (now ⌥); smarter source auto-detection via browser tab title; pack range selector and AI pack compression (both 2026-07-06).

---

## 18. General Rules for Claude Code

1. **Each phase is an independent git commit**, `feat(phase-N): ...`. Phase 11.5 sub-steps each count as a phase for this rule — one commit per sub-step.
2. **TypeScript strict mode on**.
3. **Do not install dependencies outside §4.** Ask Ocean first.
4. **Comments explain "why," not "what."**
5. **Prompt bodies under `prompts/` are verbatim §12 — not one character changed.** Beyond Ocean-authorized changes (v2.7 attachment-aware status, v2.8 pinning-gated digest), do not alter.
6. **On any ambiguity or "should we add a feature" impulse, first read §2** — especially §2.5, §2.5.1 (v2.9 personal-annotation design bias), §2.6, §2.7. If undecided, STOP and ask Ocean.
7. **No over-engineering.**
8. **Hot paths of capture, pack, and search must never contain an AI call or network request.**
9. **AI output is always disposable decoration** — write the degradation path first.
10. **Testing**: v1 does not mandate full coverage, but `pack/assemble.ts`, `search/query.ts` (incl. v2.9 all-hits-per-block return), `ai/router.ts` fallback, `ai/parseJson.ts`, `lib/undo/undoLog.ts` (v2.9 — especially the invalidation-on-edit path), `lib/collect/send.ts` (v2.9 merge contract) must have Vitest.
11. **All user-facing UI copy is written in Simplified Chinese at the call site**; obeys "silence over noise." (2026-07-07: an English UI option ships via `lib/i18n` — the Chinese string IS the dictionary key, `t()`/`useT()` translate under the `language` setting, default zh. New copy must be added in Chinese and given an EN entry.)
12. **After each phase / sub-step, STOP and wait for Ocean.**
13. **Git identity & attribution — HARD rule, no exceptions.** Zero references to Claude, Claude Code, Anthropic, or any AI tool anywhere in the repo (history, README, source, commit messages, files). No `Co-Authored-By`, no "Generated with" footers, no badges. Never modify `git config user.name`/`user.email`. Never use `git commit --author`. Commit silently under Ocean's identity.

### 18.1 Environment Constraints — Working With Claude Code (HARD)

1. **File search must exclude build output.** Use `--exclude` / `--exclude-dir`; exclude `src-tauri/target/`, `src-tauri/gen/`, `node_modules/`, `dist/`. Prefer Grep/Glob over raw Bash.
2. **Never recursively list the project tree.** No `ls -R`, unfiltered `find .`, `tree`. Use Glob with specific patterns; consult §7.
3. **Do not read PLAN_EN.md in full.** Read only the sections needed for the current sub-task. Use §1 to navigate.
4. **Keep each tool result small.** Pipe through `head`, count, narrow filter.
5. **Build / test / dev commands are permitted, with discipline.** One-shot (`npm test`, `cargo check`, `tsc -b`) run directly; long-running watchers (`npm run tauri dev`, `vite`) prefer Ocean runs interactively. Surface failures at the top of the response.

---

## 19. Improvement Backlog

> Items identified during retrospectives. Each assessed against §2.7. ✅ marks addressed; 🟡 partial; ⌫ rejected after revisit.

### 19.1 ✅ Shortcut configuration UI — DONE in Phase 8

### 19.2 ✅ Initialize git before continuing — DONE before Phase 8 (baseline `v0.7.0-phase7`)

### 19.3 🟡 Schema migration policy upgrade — PARTIAL (two additive migrations shipped; full named-registry framework still TBD before any preview release)

### 19.4 CGEventTap auto-disable does not self-heal — Target: **Phase 12 polish**

On `kCGEventTapDisabledByTimeout` / `…ByUserInput`, only logs. Recovery requires restart.
**Action**: on disable, attempt recreate once; if fails, surface one-time overlay notice ("Capture monitoring stopped — please restart Spool to re-enable double-tap"). Do not silently degrade.

### 19.5 ✅ Verify FTS5 stays in sync after inline + annotation edits — DONE in Phase 8

### 19.6 ✅ Document evolved `blocks.source` semantics — DONE (§8 + §10.5)

### 19.7 Browser-permission UX needs a settings surface — Target: **Phase 12**

Per-browser automation status (✅ granted / ❌ denied / ⚪ never used) + "Re-test" button + one-paragraph explanation block.

### 19.8 Add tests for store-level Phase 6 behaviours — Target: **opportunistic**

`blocksStore.attach/detach/setContent/setAnnotation`, `dropStore` — Vitest coverage when in those files for a feature change.

### 19.9 Capture overlay polish — Target: **post-Phase 12 dogfooding**

2.5s auto-dismiss + 340px overlay width were intuition. Dogfood for 1-2 weeks; tune from real-use signals.

### 19.10 ✅ The "by source" sort is fine — guarded against drift — DONE in v2.5 as §9.3 policy note

### 19.11 Source-category icon mapping needs tuning after dogfooding — Target: **opportunistic, after Phase 9**

Audit lookup table from real `blocks.source` data. Add/rename entries as needed.

### 19.12 "Scroll to bottom on open" needs a real-use check — Target: **after Phase 9, opportunistic**

If gap shows up, add `threads.last_scroll_block_id` (§17).

### 19.13 ✅ Pack template language strategy — DONE in v2.7 (English instruction header)

### 19.14 Track AI classification failure cases during dogfooding — Target: ongoing 4–6 weeks post-v2.7

If misclassification <5%: embedded-instruction approach sufficient. If >15%: escalate to client-side rule classifier. If 5–15%: prompt tuning. Paper log next to desk.

### 19.15 Attachment auto-extraction quality monitoring — Target: 4–6 weeks post-v2.7

Log any attachment whose extracted text is corrupted/empty/unhelpful. If a large fraction fails, v2 OCR priority rises.

### 19.16 Investigate batch-dump vs live-capture usage patterns — Target: 4–6 weeks post-v2.7

> **v2.9 update**: dogfooding has now identified at least three distinct capture modes — live (§3.3 original assumption), batch-dump (the first dogfooding session), and **per-unit batch staging via collect mode** (the v2.9 confirmed-frequent mock-exam workflow). All three are first-class. 4–6 week observation continues to refine proportions.

### 19.17 ✅ Search precision and in-block navigation — DONE in v2.9 / Phase 11.5

Folded into §9.10. Three insufficiencies addressed: (a) auto-expand truncated destination block on navigate; (b) highlight ALL occurrences within the destination block, not just the hit line position; (c) vscode-style next/previous navigator (Cmd+G / Shift+Cmd+G) anchored to destination block.

### 19.18 ✅ Active-block visual identification — DONE in v2.9 / Phase 11.5

Problem: every block looks identical. After edit / collapse / annotate, the user repeatedly loses orientation — "which block was I just on?" Direct dogfooding feedback, repeated, friction-loud.

Fix landed: new `--block-active-bg` CSS variable + `.block-active` class applied to most-recently-acted-upon BlockItem, with 3s ease-out fade. Active-state transfers to a new block when a new action fires. Pinned-amber-bar and active-tint coexist independently. Implementation: Phase 11.5 Step 1.

### 19.19 ✅ Edit-mode scroll preservation — DONE in v2.9 / Phase 11.5

Problem: double-clicking a block to enter edit mode shifts the viewport, often moving the just-clicked block off-screen. Regression of the "quiet, append-only feed" promise — losing your place every time you edit is loud.

Root cause: textarea has different intrinsic height than read-only render; layout shift triggers browser auto-scroll. `focus()` additionally triggers `scrollIntoView`.

Fix landed (§14.3): capture block's bounding rect BEFORE the swap, perform swap, restore scroll position, use `focus({ preventScroll: true })`. Implementation: Phase 11.5 Step 2.

---

**Backlog discipline.** When addressed, mark ✅ with one-line pointer to commit / phase. When rejected after revisit, mark ⌫ with one-line reason. Don't delete items — record matters more than brevity.

---

## 20. Experimental Track — Dogfood-Gated Features

> **This section is not like §1–§19.** Everything above is settled product. Everything here is provisional — built to be dogfooded, explicitly allowed to be cut. §20 features are NOT part of the Product Constitution (§2). §2.7's filter is *suspended* for them — they are being built precisely to learn whether they would pass it. Each carries a **kill criterion** (§20.8). Code for §20 features must be written behind clear boundaries so ripping one out is a clean, near-single-commit revert.
>
> **Tracks**. Track A (§20.1–§20.4): cheap, low-risk, clearly-good; built to stay unless dogfooding actively surfaces a problem. Track B (§20.5–§20.7, §20.9, §20.10): genuine interaction bets; built to learn. The honest default expectation is that **at least one Track B feature gets cut.** That is not failure — that is the track working.

### 20.1 (Track A) Merge blocks

The problem: fragmented sources (especially PPT) produce several tiny, individually-useless blocks. Capture stays zero-friction (Principle 1), so the fix is **post-hoc consolidation, not pre-commit staging** — captures land instantly; merging is optional cleanup.

- Multi-select via hover checkbox or shift-click range.
- "Merge" combines selected blocks, **keeping the earliest as survivor**:
  - Survivor `content` = chronological join with blank lines between.
  - Survivor keeps its own id, created_at, feed position (merge doesn't reorder timeline).
  - All attachments move to the survivor.
  - Annotations from merged blocks are **preserved per-segment, never silently dropped**: each segment's note is kept as a `↪ note:` marker on its own segment inside the survivor's content (segments.ts), and the survivor's top-level `annotation` column is set null (carrying both would render the note twice). `SegmentedContent` then shows each segment's annotation independently. (v2.8 §20.1 follow-up — the same mechanism collect Send uses, §20.9.)
  - pinned = true if ANY merged block was pinned.
  - source: if all share one source, keep it; if they differ, keep survivor's and prepend `[from <source>]` to each segment head.
  - Non-survivor blocks hard-deleted.
- Confirmation step ("Merge N blocks into one? This can't be auto-undone.") — but v2.9 §9.13 Cmd+Z now CAN undo merge, with the full restoration contract. The confirmation copy should be updated to reflect this.

### 20.2 (Track A) Split extraction from pack-inlining

Encoded by `include_in_pack` (§8.1, §8.2). Two layers:
- **Extraction** (unchanged, default ON): on attach, supported files (pdf/docx/txt/md) extracted and cached. Powers preview. Local, one-time, cheap.
- **Inlining** (v2.8, default OFF, per-attachment): whether an attachment's text inlines into pack (§9.5) and AI summaries (§20.3, status summary).

UI: in `BlockAttachments`, a chip with extracted_text shows the existing expand arrow (text preview) plus a small toggle "加入 Pack" reflecting include_in_pack. Off by default; flipping persists immediately.

Status summary (§12.1) must **respect include_in_pack** — only inline opted-in attachments. Also fixes the token-cost concern from v2.7.

### 20.3 (Track A) Conclusion summary reads pinned blocks + their attachments

§12.2 `buildDigestPrompt` extended to inline pinned blocks' attachment extracted text.
- 8000-char cap per attachment.
- **Pinning is the opt-in here** — a pinned block's attachments inline regardless of `include_in_pack`. Pinning is a stronger "this matters" signal than the pack-inline toggle.
- Ocean-authorized prompt change (§18 rule 5). Signature gains `attachmentsByBlock`.

### 20.4 (Track A) Annotation as a bottom area in edit mode

Dogfooding showed users don't use the separate ✑ annotate hover action — they double-click and type into content. So: make annotation part of the natural edit flow, while keeping `blocks.annotation` separate in data so pack still classifies it as 💭 Personal.

- Double-click a block → edit mode shows content textarea on top + **quiet, visually-subordinate annotation area at the bottom** ("批注(可选)" placeholder, smaller, muted, clearly secondary).
- **v2.10**: double-clicking the read-only annotation itself opens the annotation alone for editing (the ✑ hover action still does too) — you don't have to go through the content.
- **Commit contract (v2.10, shared with the capture toast §9.4)**: Enter inserts a **newline**; a 「完成」 button (or blur / click-away) commits; Esc cancels. Enter no longer commits — which also fixes a Chinese-IME bug where pressing Enter to confirm a candidate prematurely ended the note.
- Most blocks have no annotation; the bottom area is present but unobtrusive — visible enough that the user learns it exists, quiet enough that it never demands attention.
- ✑ hover action stays as alternative entry or removed — decide after dogfooding.
- Data model unchanged: still writes `blocks.annotation`; pack still renders annotation as user's note.

### 20.5 (Track B) Select-to-highlight (划词高亮)

**Gesture, not syntax.** Select text within a block; a small floating prompt appears ("标为重点?"); on confirm, the app wraps the selection in `==...==` **in the stored content string**. Resolves two failure modes: users don't memorize Markdown syntax (the gesture does it), and the highlight survives editing (stored as plain-text markers, not fragile selection offsets).

- **Read mode** (v2.10): `==...==` renders as a quiet highlight (`--selection`) in BOTH collapsed and expanded states — never literal markers — through the shared content **run-tokenizer** (the same display-only `<mark>` mechanism as search highlighting, §9.10; a run can be highlight / search-hit / spine, or any combination). Annotations render through the same path, so no read surface shows raw `==`. **Edit mode** keeps the raw `==` source (editing returns to source; no contentEditable, §2.6). This fixed the bug where an expanded block showed raw `==XXX==` while the collapsed view showed the highlight.
- Pack: `assemble.ts` recognizes `==(.+?)==`; pack header (§9.5) gains a line telling AI these are user-emphasized key points to prioritize. Relationship to pin: pin = whole block is core; highlight = sentence within a block is key. They coexist; header mentions both without double-emphasizing.
- **NOT the rejected rich-text editor (§2.6).** Storage is plain-text Markdown markers, not a rich-text document model. No toolbar, no WYSIWYG, no offset tracking. The gesture is sugar over a text mutation.

**v2.9 status**: dogfooding so far shows near-zero use. Kill criterion in §20.8 is sharpest for highlight. If Ocean's own usage stays at ~0 over 2 more weeks, cut.

### 20.6 (Track B) Capture toast — optional expansion (pin / note)

Capture toast must stay glanceable and non-activating by default (§10.3). This adds **optional** depth without breaking that: default path is still "lands, glance, gone, zero action." Pin + note let the user, if they choose, act at the freshest moment (§2.5.1).

**v2.10 split (supersedes the original single "expand" affordance — the "添加批注 · 置顶" button is gone):**
- **Pin** is a **one-click** 📌 in the toast's top-right cluster — always visible, never bundled with the note (pinning should not require, or drag along, annotation).
- **Note** is revealed by **double-clicking the toast body** — zero visible affordance so the default toast stays clean. The editor follows the §20.4 contract (Enter = newline, 「完成」 / click-away commits, Esc discards). The note commits/collapses on blur so the toast can resume its auto-dismiss.

**Hard constraint**: the toast's default rendered state stays glanceable — the note editor is never shown until the deliberate double-click, never required.

The overlay already has its own SQLite access, so writing pin/annotation back is straightforward; emit existing cross-window event so main-window stores update.

### 20.7 (Track B) Pack task templates

Orthogonal to v2.7 four-category header. Header says *how to read the input* (by authority); template says *what task to perform*. A "template" is just a different **closing task-instruction block** appended after the full record — content body (header + blocks) identical.

- `assemble.ts` takes an optional `template` parameter; `templates.ts` holds 2–3 hardcoded closing blocks:
  - **默认 / 纯上下文**: no extra task block (current behavior).
  - **复习资料**: closing block asking AI to generate revision materials, respecting four-category hierarchy.
  - **组合零散对话**: closing block asking AI to synthesize scattered fragments into one clean, de-duplicated summary.
- `PackDialog` gets a small selector "想让 AI 做什么?" with these presets. Default = 纯上下文.
- **No template engine, no editor, no management UI.** Hardcode 2–3, see which gets used. User-defined templates out of scope.

**v2.9 status update**: dogfooding observed users frequently issuing a second prompt after PackDialog to define artifact intent ("做成笔记" / "做成工作总结"). This is the very moment templates are meant to absorb. §20.7 priority is elevated for Phase 11.5 review; if the three hardcoded presets land more than 80% of artifact intents, keep all three. If only 1–2 get used, cut the unused. If real intents consistently miss the presets (e.g. one specific user-typed task keeps recurring), revisit whether to allow **a user-editable closing task block** (single text field, stored in `settings.customPackTask`, NOT a template engine — that path is still out of scope).

### 20.8 Kill criteria & review schedule

Each §20 feature reviewed at the end of Phase 11.5's 3-week dogfooding window. Kill criteria:

- **20.1 Merge**: keep unless unused (0 merges in 3 weeks) AND PPT fragmentation proves rare. (Already used frequently in v2.9 dogfooding — keep.)
- **20.2 Extraction/inline split**: keep (foundational). Only tune the default.
- **20.3 Conclusion attachments**: keep unless conclusion summaries get worse with attachments inlined → then gate same way as status summary.
- **20.4 Annotation bottom area**: keep unless still unused after the interaction change → de-emphasize further. (v2.9 dogfooding shows `↪ note:` pattern, so the user IS annotating; the bottom-area landing should keep that intent.)
- **20.5 Highlight**: **cut if Ocean's own highlight count is near zero after 2 more weeks.** Sharpest kill watch. If the creator won't use the gesture, no user will. The `==` markers are isolated; removal is clean.
- **20.6 Toast expansion**: **cut immediately if it makes the default toast heavier or slower.** Default weightlessness is non-negotiable (§10.3).
- **20.7 Templates**: keep only the templates that get used; cut the rest. If none beat 纯上下文, cut the selector entirely. Custom closing-task-block is the escape hatch — only consider if hardcoded presets prove consistently insufficient.
- **20.9 Collect mode** (NEW v2.9): **v2.9 has already collected Ocean's confirmed frequent use** (mock-exam workflow). Default disposition: keep, with a softer kill criterion than the original ("cut if long-press trigger proves flaky against double-tap → false positives where user intended one and got the other"). After 3 more weeks, if no flakiness emerges AND the window-following behavior (§20.9) lands without bugs, promote to §1–§19 properly in v3.0 and remove from §20.

**Logging**: paper log next to the desk per §19.14–§19.16. Per feature, note usage count and any friction.

**On graduation**: a §20 feature that survives review and proves clearly valuable gets *promoted* — moved into the relevant §1–§19 section and re-examined against §2 if it touches the core. Until promoted, it stays fenced. Promotion is deliberate, recorded in the changelog — not silent drift.
- **20.10 Image OCR** (NEW): cut if Gemini math/formula OCR proves poor (§19.15-style garbled-output monitoring), OR usage near zero, OR the free-tier-trains-on-data privacy tradeoff feels wrong. Off by default, Gemini-only, attach-time — removal is clean (the toggle + the image branch; PDF/docx extraction untouched).
- **20.12 MCP local server** (chartered 2026-07-06, not yet built): cut if Ocean's own zero-paste pulls stay near zero after 3 weeks, or if server lifecycle friction exceeds the paste it saves. Full charter in §20.12.

### 20.9 (Track B → graduating) Collect Mode (NEW in v2.9)

> Promoted from Strategic Brief §6 informality to PLAN spec. Ocean's confirmed frequent use in the mock-exam workflow (each question = answer + analysis + AI-conversation, all needing per-unit annotation before commit) closes the "is anyone using this" question. The dogfooding-discovered window-following bug is fixed below.

**Mechanism**

**Long-press ⌥ (≥600ms)** opens a persistent staging panel — a separate Tauri window, distinct from the capture toast in §9.4. Mechanics similar (borderless, transparent, always-on-top, non-activating) but lifecycle is different: persistent, user-controlled close, not auto-dismissing.

While the staging panel is open:
- Subsequent ⌥-based captures (double-tap OR long-press) **append to the staging panel as transient items** rather than landing as blocks in the current capture target. Double-tap-⌥ → instant-block path is suspended while panel is open.
- The user-bound capture shortcut (no default since 2026-07-07) still does instant block-write (escape hatch).
- Each staging item is editable inline (content + **visible annotation field per §2.5.1 design bias**) and pinnable.
- Items held outside the blocks table — purely in memory of the collect-window's process. **Nothing persists to DB until Send.**
- Panel shows Send and Discard actions.

**Panel UI (v2.10)**
- **Destination line**: the panel header shows where Send lands — a quiet `→ 「<Workspace> / <Thread>」` (mirrors the §9.4 two-tier attribution). Re-read on open and on a `capture-target:changed` broadcast, so it stays current if the target is toggled while the panel is open.
- **Single-tap ⌥ toggles collapse** (only while the panel is open): a clean lone ⌥ tap flips the panel between the full card and a compact pill. Detected after the double-tap window settles so the first tap of a capture double-tap can't trip it; a `COLLECT_PANEL_OPEN` flag gates it so a stray ⌥ never pokes a closed panel. The header carries a quiet "单击 ⌥ 收起" hint.
- **Collapsed pill**: hovering it reveals a Send button (commit without expanding); a capture-while-collapsed shows a transient "已加入 · 撤销" chip stacked **below** the pill (so the pill keeps its shape — never stretched by the chip). 撤销 runs the panel-local sub-undo.
- The OS window is sized to the measured content footprint (the pill's own width when collapsed, the card's when expanded), top-right anchored — so a collapsed pill leaves no transparent strip swallowing clicks beside it.
- **Append is idempotent**: a duplicate `collect:append` delivery (e.g. a dev HMR-leaked listener) stages the same capture only once.

**On Send**:
- All staging items merge into ONE block: contents joined chronologically with a blank line between, all items' attachments collected onto it, pinned if any item was pinned, source = the first item's.
- **Each item's annotation stays INDEPENDENT (v2.10 fix)**: it is preserved as that segment's own per-segment `↪ note:` marker (§20.1 segments.ts), NOT flattened into one newline-joined note. The feed's `SegmentedContent` then renders every item's annotation independently inside the single merged block. (Earlier v2.10 work briefly split items into separate blocks — wrong; collect merges into one block.)
- Merged block written to current capture target thread.
- Panel closes; items discarded from memory.
- Send is logged in the §9.13 main undo ring (undo deletes the one merged block).

**On Discard**:
- Items discarded with no DB write. A confirmation toast in the panel before closing: "已丢弃 N 条暂存内容". Discard is NOT undoable (items never persisted).

**Window-following behavior** (closes the dogfooding bug)

macOS only: when user switches active app/space, the staging panel must follow.
- Primary implementation: detect `NSWorkspaceDidActivateApplicationNotification` (or Tauri's macOS hook equivalent); on switch, reposition the panel to the active screen/space.
- Alternative (simpler): when a new capture is appended while panel is hidden in another space, reposition to active space before showing.
- Fallback (if both fail): **long-press ⌥ AGAIN while a panel exists → transfer the panel to the current active window.**
- The hard requirement: the user should never need to hunt for the staging panel.

**Personal annotation surfaces (per §2.5.1)**

- Each staging item has a visible (not hover-gated) annotation slot directly below its content.
- **Tab key moves focus between staging-item annotation fields**, so annotating a batch of staged items is single-keystroke per item.
- The "Send" button label can subtly hint at annotation density: if 0 of N items annotated, button reads "Send"; if some annotated, button reads "Send (N annotated)". This is the only "guidance" — no nag, no popup.

**Cmd+Z inside the panel (§9.13 integration)**

- Panel keeps its own local sub-undo for staging operations (add item / remove item / edit content / edit annotation).
- Cmd+Z inside panel first checks local sub-undo; if empty, falls through to main undo log.
- Send → main undo log (since it persists a block); panel-local staging ops do not enter main log.

**Kill criterion** (§20.8 update)

- Original criterion ("cut if long-press usage near zero") is **already disproven** by v2.9 dogfooding.
- Remaining concerns: (a) long-press trigger flakiness against double-tap; (b) window-following implementation reliability across all macOS versions.
- 3-week dogfooding window post-implementation. If no flakiness reports AND window-following lands clean → promote into §1–§19 in v3.0 (likely as a new §9.14, with §3.3 capture-mode list updated to formally include it).

### 20.10 (Track B) Image OCR via opt-in cloud vision (NEW)

> Dogfooding showed image attachment (screenshots of slides, handwriting, formula-heavy notes) is useful, but images are currently pointer-only (§9.6) — their text never enters search or pack. This experiment makes an image attachment's text an indexed content source, exactly like the v2.7 PDF/docx extraction — but via cloud vision, because math-formula OCR is cloud-or-nothing (local 8B models can't do it). **Built fenced; off by default; explicitly allowed to be cut.**

**Mechanism**
- A new Settings toggle **「图片文字提取(Gemini)」, default OFF** (§9.12). When OFF, images stay pointer-only (current §9.6 behavior) — zero outbound.
- When ON, and NOT in privacy mode, and a Gemini key is present: on attaching an image FILE (the existing §9.6 image-attach path), Spool reads the file, base64-encodes it, and calls Gemini vision (reusing the existing `router`/Gemini provider + quotaStore) with a transcription prompt that renders math as LaTeX. Result cached in `attachments.extracted_text`, `extraction_kind = 'image_ocr'`, `extracted_at = now`.
- **Runs at ATTACH time, cached — NEVER in the pack hot path** (§6.4 rule 2). Pack just reads the cached text, identical to PDF/docx.
- **Pack inlining flows through the existing `include_in_pack` toggle** (§20.2) — no new pack-path code. Default OFF per attachment, same as other extracted text.
- **NO local fallback** — vision needs Gemini (qwen3:8b is text-only). If Gemini is unavailable / key missing / privacy mode on, OCR simply does not run; the image stays a usable pointer attachment, silently.
- **Best-effort, like PDF extraction**: on failure → `extraction_kind = 'failed'`, image stays a pointer, no error popup (§14.4).

**Scope boundaries (so removal is a clean near-single-commit revert per §20)**
- IN scope: OCR for image FILE attachments only.
- OUT of scope (separate future items, NOT this experiment): clipboard-image-data capture (writing image bytes to disk — a binary-storage concern), collect-panel image drag, and the "pass the raw image straight to the receiving AI" route (that belongs to the deferred MCP/extension channel, §17 / Strategic Brief §8).

**Constitution compliance**
- **Principle 2**: OFF by default + privacy-mode-respecting → "local-first, private by default" intact; OCR is an explicit opt-in online feature, same category as the existing status-summary/classification calls. Settings copy MUST warn that Gemini's free tier trains on submitted data.
- **Principle 5**: transcription, not authoring — like PDF extraction. Degrades to pointer when absent. AI does not generate content; it reads what the user attached.
- This is a §20 experiment prompt, not a §12 prompt — it is tunable and NOT subject to the §12 verbatim rule.

**Kill criterion** (§20.8): cut if (a) Gemini's math/formula transcription is poor in real use (garbled LaTeX — same §19.15 monitoring), OR (b) Ocean's own usage is near zero, OR (c) the privacy/training tradeoff feels wrong. 3-week dogfooding window. If clean AND math is good → graduate into §9.6 (image attachments gain extraction) + remove the "OCR is v2" row from §17, in v3.0.

### 20.11 (Track A) Forward (copy) blocks to another thread (NEW, v2.10)

> Manual, user-driven cross-thread placement — the explicit "what we do instead" of the rejected auto-linking (§2.6). Distinct from @-mention (which makes a `ref` pointer, §9.7): forward puts the actual content in the target. COPY-only, so it is purely additive and can never mutate the user's irreplaceable source data.

- Reuses the existing merge multi-select (§20.1): with ≥1 block selected, the action bar gains a **「复制到…」** action beside 合并.
- Opens a quiet, fuzzy, keyboard-navigable thread picker grouped by workspace **across ALL workspaces** (cross-workspace allowed — unlike @-mention's same-workspace limit). Done threads and the source thread are excluded. Esc / click-outside cancel.
- **COPY semantics**: each selected block is inserted as a NEW block in the target (new id, target `thread_id`, `created_at` = now +1ms per block to keep order; `kind` / `content` / `annotation` / `source` / `pinned` / `ref_thread_id` copied verbatim), with its attachments copied too (cached extraction values copied, no re-extraction). Originals are never read-modify-written — **INSERT-only**, no schema change (SCHEMA_VERSION stays 5).
- Confirmation toast: `已复制 <N> 个块到「<Workspace> / <Thread>」`; the selection clears.
- **Undoable** (§9.13, `forward` `UndoOpKind`): undo deletes ONLY the new copies (their copied attachments cascade); it never touches the originals. UndoToast: `已撤销:复制`.

### 20.12 (Track B — BUILT 2026-07-07, experimental, default OFF) MCP local server — "zero-paste re-brief"

> Chartered 2026-07-06; Ocean delegated the four design decisions on 2026-07-07 ("lowest cost, release-grade") and implementation landed the same day. **Decisions**: (1) in-binary — `spool --mcp` subcommand, branch in main.rs before the Tauri builder; new deps rusqlite (read-only, rides the existing libsqlite3-sys 0.30 line) + libc (localtime for pack timestamps); (2) stdio transport (client-launched, no ports, works in every MCP client); (3) NO §20.7 template param — the user states the task in their own chat turn; (4) fresh read-only SQLite connection per tool call. The Rust pack renderer is a port of assemble.ts locked by a **cross-language golden test** (fixtures under src/lib/pack/fixtures/, asserted by both assemble.test.ts and mcp.rs `golden_pack_matches_fixture`, dates normalized) — any template drift fails one side until re-synced. Tools gate on the 「MCP 服务」 settings toggle (default OFF), read straight from settings.json.
>
> **2026-07-07 revision — one-click client hookup.** The copy-paste snippet proved error-prone in the field (Ocean's Claude Desktop entry pointed at a literal placeholder path → spawn failure → "Server disconnected"). Settings → MCP now shows per-client rows (Claude Desktop / Cursor) with a status badge (未检测到 / 一键接入 / ✓ 已接入 / 路径已变) and a button that: turns the MCP toggle on if needed, backs the client config up to `.bak`, and merges `mcpServers.spool = { command: <current_exe>, args: ["--mcp"] }` (`mcp_client_status` / `configure_mcp_client` commands; fs logic + unit test in mcp.rs). Never written silently — the button press is the consent. Dev builds (exe outside /Applications) get a "reconnect after installing the release app" hint. The snippet stays as the advanced fallback for other MCP clients. `resources/list` / `prompts/list` now answer with empty lists instead of -32601 (some Claude Desktop builds surface the error).

**The bet.** Pack's "single paste" becomes "zero paste": MCP-capable AI clients (Claude, Cursor, and the growing MCP ecosystem) pull thread context directly from Spool. The receiving AI asks Spool for the pack; the user just @-mentions their project inside whatever AI they're already talking to. This is §2.2 taken to its limit — and the sharpest competitive position available: notes apps have no zero-friction capture, clipboard managers have no project structure, and neither has a deterministic, AI-facing context faucet.

**Mechanism (proposed).**
- A local-only MCP server exposing exactly two **read-only** tools:
  - `list_threads` — workspaces + threads (title, status, updated_at) so the client can discover/pick.
  - `get_pack(thread_id, range?)` — returns the §9.5 pack text via the SAME pure `assemble.ts` the PackDialog uses (range values mirror the §17 selector; default `all`).
- Off by default: a Settings toggle 「MCP 服务」 (default OFF) + a copy-paste client-config snippet.
- No remote binding, ever. Localhost/stdio only.

**Constitution compliance.**
- Principle 2 (local-first): off by default; data flows only into the user's own AI client by the user's own explicit configuration — same consent category as the existing cloud-AI features.
- Principle 4 (deterministic retrieval): the server is a thin faucet over `assemble.ts`; no AI inside Spool's own path.
- Principle 5 (librarian): Spool still authors nothing; the external AI consumes.
- §6.4: not in any hot path; a passive listener.
- §2.7: fits Pack; directly cuts re-entry cost; conflicts with no principle; not on the §2.6 rejected list; the product stays complete without it (hence Track B, not core).

**Scope boundaries (clean-revert rule per §20).**
- IN: the two read-only tools, the Settings toggle, the client-config snippet, docs.
- OUT (explicitly): any write tool (capture-via-MCP is a separate future question needing its own §2 review), remote transports, per-block granularity, streaming, auth schemes beyond whatever the local transport minimally requires.

**Open design questions (resolve with Ocean before building).**
1. Rust-side MCP implementation vs. bundled sidecar — and the exact dependency budget (§4).
2. stdio vs. localhost SSE/HTTP: stdio means the AI client launches/owns the server process; SSE means Spool must be running. Client-compatibility survey first.
3. Should `get_pack` also accept the §20.7 template param?
4. Freshness: read SQLite per call (leaning yes — single source of truth, queries are already fast).

**Kill criterion (§20.8).** 3-week dogfooding window post-implementation: cut if Ocean's own zero-paste pulls stay near zero, OR if server lifecycle friction (startup, config, port conflicts) exceeds the paste it saves. Graduation target: a new §9.14 in v3.0.

### 20.13 (Track B — v1 BUILT 2026-07-08, experimental, default OFF) MCP write tools — toward "strong-MCP" Spool

> Ocean's ask (2026-07-08): open more interfaces so an AI can create threads and write back; borrow the third-party AI's own capability (e.g. compression); and weigh the bigger reframe — Spool as an MCP-first context **service**, with the GUI as the browse/curate surface while the user lives in Claude/Cursor chat.

**The reframe, assessed.** Strong-MCP is §2.2 pushed in both directions: reads were "zero-paste re-brief" (§20.12); writes make it "zero-paste capture *from the AI conversation*" — a fourth capture mode besides double-tap ⌥ / composer / collect. What it does NOT change: Spool's spine stays "user-curated context with deterministic retrieval". The GUI is already the curation surface (pin, annotate, merge, undo, complete), and chat cannot replace that because curation is exactly the part the user must own (Principle 5). Honest formulation: **MCP becomes a first-class capture + retrieval channel, and the GUI's center of gravity shifts from "where you enter data" toward "where you curate and trust what's there".** An evolution of emphasis, not an architecture change — and reversible (clean-revert rule) if dogfooding shows AI-written blocks are mostly noise.

**Constitutional line for writes (the load-bearing decision).** Principle 5 says AI never authors *the user's* content. Writes are therefore **append-only and attributed**:
- The MCP side may INSERT new threads/blocks only — structurally incapable of UPDATE/DELETE on user rows (enforced in code, not by prompt).
- Every MCP-written block carries a source label naming the client (`Claude Desktop · MCP` by default, from initialize's clientInfo) — in pack-category terms it is a **sourced quote**, never the user's own sourceless writing, so §9.5's authority sorting stays honest.
- Curation (pin, edit, merge, delete) remains GUI-only, i.e. user-only.

**v1 scope (built 2026-07-08).**
- Tools: `create_thread(title, workspace_title?, summary?)` (workspace matched by name, never implicitly created; defaults to the first workspace) and `add_block(thread_id, content, annotation?, source?)` (bumps the thread's updated_at; the tool description explicitly tells the model to store ONE distilled finding, not bulk chat logs).
- Consent: a separate 「允许 AI 写入」 sub-toggle (`mcpWriteEnabled`, default OFF) under the Settings MCP block — reading packs and letting an external AI insert rows are different trust levels. Checked per call from settings.json.
- Safety rails: the read-write connection refuses any `user_version != 5` (lockstep constant with the migration registry — the 2026-05-29 lesson), 2s busy_timeout for WAL coexistence with the live GUI, tiny transactions, nanoid-compatible ids from /dev/urandom (zero new deps).
- Borrowed-capability compression: the MCP `prompts` capability serves `compress_pack(thread_id, range?)` — Spool renders the pack and embeds the §17 compress instruction; the CLIENT's model does the compressing. No Spool-side AI, no key, no quota; complements (not replaces) the in-app Gemini path.
- GUI freshness: the main window re-pulls the thread list + active thread's blocks on window focus (throttled), so externally-written rows appear the moment the user switches back.
- Known gap, accepted for v1: MCP writes are not in the GUI undo ring (they are normal blocks — deletable in the GUI as usual).

**OUT (each needs its own review before landing):** AI-initiated edits/deletes/moves of ANY existing row; AI pinning or annotating user blocks; workspace creation; attachment writes; batch import; remote transports; notification toasts on external writes.

**Kill criterion (§20.8).** 3 weeks of dogfooding writes: cut (hide the toggle, keep read-only §20.12) if Ocean ends up deleting most AI-written blocks (curation cost > capture saved), or if two-writer SQLite contention shows up in real use. Graduation: fold into §9.4 as the fourth capture mode.

**v2 charter (designed 2026-07-08; Ocean approved all three IN items the same evening — BUILT, smoke-tested over stdio).** The loop v1 leaves open: the user meets something in chat, and the model has no way to find *which thread it belongs to* short of pulling full packs one by one. v2 closes retrieval, and draws the curation line explicitly.

- **IN (approved & built 2026-07-08 evening):**
  1. `search_blocks(query, limit?)` — read-only. Reuses §9.10's exact query shape (src/lib/search/query.ts FTS_SQL: phrase-quoted trigram MATCH on blocks_fts joined back to live rows, soft-deleted threads/workspaces excluded, rank order; LIKE fallback below trigram length). Returns per-hit snippet + block_id / thread_id / thread_title / workspace so the model can pick the destination thread before an `add_block`, or the right thread to `get_pack`. This is the missing hop in both directions of Ocean's loop ("web → which thread do I file this in" and "question → which thread has the context").
  2. `list_threads` gains a `summary` field (already in the threads table) — this serves the "get_pack is too heavy, I just want the list with one-liners" case. **No separate `get_thread_meta` tool**: it would duplicate list_threads row-for-row.
  3. Resources probe, behind the same toggle: `resources/list` exposes threads as `spool://thread/<id>` (title as name, summary — else workspace — as description) and `resources/read` returns the pack text; a `notifications/resources/list_changed` frame follows every successful MCP write. Protocol side verified over stdio; whether Claude Desktop's @-mention UX actually surfaces these usefully is the open probe question — if it proves poor, revert to the empty-list answer (kill criterion below).
- **OUT, argued (each was considered and rejected for v2):**
  - `update_thread_status` — a status flip is curation, and curation is the user's (Principle 5). "Mark X done from chat" saves one GUI click and in exchange makes the write surface no longer append-only. Not worth the invariant.
  - AI editing its own `· MCP` blocks — even self-scoped UPDATE turns "append-only, enforced structurally" into "append-mostly, enforced by matching a spoofable source string". Correction pattern instead: append a superseding block; the stale one dies in normal curation. Revisit only with a concrete dogfooding pain, not speculatively.
  - Write notifications in the GUI — §2.5 (quiet); the focus-refresh already surfaces external rows at the natural re-entry moment. The `· MCP` source label remains the audit trail.
  - Undo-ring integration — unchanged from v1: MCP blocks are normal, deletable blocks.
- **Kill criteria additions:** cut `search_blocks` if dogfooding shows the model always goes straight to list_threads → get_pack (the extra hop buys nothing); the resources probe dies quietly on poor client support (no code kept beyond the current empty-list answer).

---

Document maintainer: Ocean Jin (KIM-ocean-HZ)
Version: 2.10 (supersedes v2.9; changes in this revision, a post-v2.9 UI/UX + undo work batch: (1) §9.11 status summary — manual button replaced by auto-generate-once + inline click-to-edit + graceful no-AI "＋ 写一句话摘要" affordance; (2) §9.13 undo scope expanded — + highlight, + thread delete, + workspace delete (selective), plus Cmd+Z focus-split (native text undo when a field is focused) and a now-silent collect sub-undo; (3) §20.5 highlight renders in read mode in both collapsed and expanded states via the content run-tokenizer (edit = source, pack still carries the `==` markers); (4) ThreadHeader (§9.5) — workspace dropdown removed (move via drag / right-click), Pack is the accent action, capture-target a quiet stateful toggle; (5) §9.1 / §9.2 sidebar thread inline rename + one-click capture-target; (6) §9.3 block feed — source-glyph match hardened (word-boundary tokens), first-line spine, softened truncation (buffer + soft fade); (7) §9.9 completed threads no longer show an overdue countdown. Schema unchanged at version 5. §1–§19 backbone and the 6 principles in §2.5 unchanged.(post-v2.10: added §20.10 image-OCR experiment — opt-in Gemini vision, attach-time/cached, off by default, fenced with kill criterion; TS AttachmentExtractionKind gains 'image_ocr'; no schema change, no new dependency.))
(post-v2.10 UI/UX batch, reconciled into the sections above: capture-target toggle is a pure state change — no navigate / no focus-steal (§9.4/§10.2/§14.3); capture toast slimmed — content-led 2-line preview, condensed attribution, one-click 📌 pin, icon-only undo/redirect, "Save as new thread" removed, note via double-click (§9.4/§20.6); annotation commit unified (block + toast) — Enter = newline, 「完成」/blur commits, Esc cancels, fixing the IME Enter mis-commit; double-click a block's annotation edits it alone (§20.4); §20.1 merge and §20.9 collect Send both keep per-item annotations independent via per-segment `↪ note:` markers (collect merges into ONE block — it does not split items); collect panel — destination line, single-tap ⌥ collapse/expand, collapsed-pill Send-on-hover + 已加入/撤销 chip stacked below, window sized to content footprint, idempotent append (§20.9); search ▲/▼ continues across blocks/threads + a 全部 cross-workspace match list (§9.10); §20.11 forward/copy multi-selected blocks to another thread (additive, undoable). Schema unchanged at version 5.)
(2026-07-06 batch: release-readiness + pack utility. IME composition guard extended app-wide (composer/renames/pickers/editors + window-level Esc); overlay Redirect keeps pin+note; merge confirm inlined (no native dialog); design fonts bundled (OFL); strict CSP enabled; §19.3 named migration registry landed (sequential v2→5 walk, checkpointed, tested); distribution decided — notarized Developer ID .dmg, NOT Mac App Store (sandbox conflicts: CGEventTap / private-API windows / browser AppleScript); docs/PRIVACY.md + docs/RELEASE.md added. §17 pulls shipped: pack range selector + AI pack compression (compressPack.ts prompt is tunable, not §12-locked). §20.12 chartered: MCP local server experiment — charter only, not built. Schema unchanged at version 5.)
(2026-07-07 batch: five dogfooding fixes. (1) Double-tap ⌥ dead outside Spool — root cause: listen-only CGEventTap without the Input Monitoring TCC grant silently receives only own-process events; now preflighted + system prompt at install, quiet onboarding banner in the main window, and ⌘⇧C's default binding retired (user-recordable capture shortcut remains the §20.9 escape hatch) — §9.4/§10.2/§14.1 revised. (2) Fraunces replaces Instrument Serif (too narrow) for wordmark/titles — §4/§13.4. (3) ThreadHeader shows total pack-relevant character count; >20k turns --status-parked and click-throughs into PackDialog. (4) Pack compression is Gemini-only (noFallback) with 120s timeout, 65,536-token output cap and result guards (≥15% of original, note:/sourceless lines verbatim) — §17 table revised. (5) MCP "Server disconnected" root-caused to a placeholder command path from the copy-paste flow; Settings now has one-click Claude/Cursor hookup with .bak backup + status badges, and resources/prompts list methods answer empty — §20.12 revised. Schema unchanged at version 5.)
(2026-07-08 batch: dogfooding round two. (1) Capture shortcut recorder gains a clear (unbind) affordance. (2) Copy-gate on double-tap ⌥ — with Input Monitoring granted, capture fires only when ⌘C/⌘X was pressed within 10s, disambiguating from Claude Desktop's identical quick-entry gesture; gate bypassed without the grant (keyDown invisible to unprivileged taps) — §9.4 revised. (3) "Long-press dead in other apps" root-caused to the Input Monitoring grant being invalidated by an ad-hoc re-signed rebuild — no code change, the §9.4 permission flow already guides. (4) §20.13 chartered AND v1 built: MCP write tools (create_thread / add_block, append-only + attributed, mcpWriteEnabled default OFF) + prompts capability serving compress_pack for client-side compression + GUI focus-refresh for external writes. (5) MCP "read staleness" report diagnosed as the 07-08 13:51 data-directory reset (user-initiated), not a read path defect — live test shows WAL-consistent reads. Schema unchanged at version 5.)
(2026-07-08 evening batch: (1) "Granted Input Monitoring yet still dead + banner stuck" root-caused in the field: a STALE TCC entry — the grant binds to the code signature (csreq) and the listed entry belonged to an older ad-hoc build; Ocean confirmed the user-side fix live (remove the entry with −, fully quit via tray, re-grant the fresh prompt, restart once more; both ⌥ gestures then work everywhere). No code defect; per Ocean the fix became guidance instead: banner "restart" copy now spells out tray-quit, the denied phase carries the stale-grant recovery line, Settings' shortcut section names the two built-in ⌥ gestures incl. the 10s copy-gate window, the empty-feed hint leads with ⌘C, and the no-thread state names ⌘N — all verified on an isolated build (zh+en), i18n synced. NOTE: dev builds remain ad-hoc-signed, so the grant will invalidate again on the next rebuild until bundle.macOS.signingIdentity gets a stable local cert (pending Ocean). (2) Full review of efe6efa..HEAD: one cleanup landed (MCP connect badge identity ternary); flagged for later — compressionKeepsPersonal only guards the first line of multi-line user entries, and PackDialog's geminiKey gate duplicates the router's quality-tier knowledge; two pre-existing dead i18n dict keys noted, left in place. (3) §20.13 v2 charter written (search_blocks reusing §9.10's FTS SQL, list_threads summary field, resources probe; status writes and AI self-edits argued OUT); Ocean approved all three IN items and they were built the same evening — trigram/LIKE parity with GUI search, spool://thread/<id> resources with list_changed after writes — cargo-tested and stdio-smoke-tested; the @-mention UX check in a live Claude Desktop remains open. Schema unchanged at version 5.)

Last updated: 2026-07-08