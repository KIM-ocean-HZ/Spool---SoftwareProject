# Spool — Complete Product & Engineering Brief

> **What this document is.** A single, self-contained description of Spool: what it is, why it
> is shaped this way, how it is built, what has been measured, what has been decided and may not
> be silently reversed, and what is still open. It is written so that a reader arriving with no
> other context — a person or an AI — can read this one file and then reason usefully about the
> product: plan work, propose a direction, analyse the business model, or review a change.
>
> **Authority.** This file *summarises*; it is not the source of truth for anything.
> - Product definition and non-goals → `PLAN_EN.md` §2
> - Publishable figures and incident records → `docs/CASE_STUDY_LEDGER.md`
> - Per-feature design rationale → `docs/DESIGN_*.md`
> - What to work on next → `docs/BACKLOG-2026-08-19.md` (open front) and `docs/HANDOFF-2026-08-19.md` §1 (remaining debt)
>
> Where this file and one of those disagree, the other one wins and this file is stale.
>
> **As of 2026-08-19**, product version **0.6.1** (released, signed, notarised, installed).
> Figures marked *(recomputed)* were re-run against the working tree while writing this file.

---

## Table of contents

0. [Fast orientation](#0-fast-orientation)
1. [Identity and current state](#1-identity-and-current-state)
2. [The problem, and the constitution that follows from it](#2-the-problem-and-the-constitution-that-follows-from-it)
3. [The core loop](#3-the-core-loop)
4. [Complete feature inventory](#4-complete-feature-inventory)
5. [Architecture](#5-architecture)
6. [Data model](#6-data-model)
7. [The pack — the crown feature, in detail](#7-the-pack--the-crown-feature-in-detail)
8. [The MCP surface](#8-the-mcp-surface)
9. [The CLI engine slot](#9-the-cli-engine-slot)
10. [Privacy, egress and threat model](#10-privacy-egress-and-threat-model)
11. [Platforms, distribution and release](#11-platforms-distribution-and-release)
12. [Quality system and measured evidence](#12-quality-system-and-measured-evidence)
13. [Standing decisions — the red lines](#13-standing-decisions--the-red-lines)
14. [Open engineering debt](#14-open-engineering-debt)
15. [Commercial position and the four open questions](#15-commercial-position-and-the-four-open-questions)
16. [Where the seams are — reading the product for future direction](#16-where-the-seams-are--reading-the-product-for-future-direction)
17. [Document map](#17-document-map)
18. [Glossary and recompute commands](#18-glossary-and-recompute-commands)

---

## 0. Fast orientation

**One sentence.** Spool is a context hub for long-running projects: at the moment you naturally
produce a fragment of information — a good answer from an AI, a decision buried in an email, a
link, a half-formed thought — it captures that fragment with one keypress, files it under a
two-tier *Workspace → Project* structure, and packs any project into a paste-ready briefing on
demand, so you can re-enter the project, or re-brief an AI, instantly.

**The North Star.** Cut the cost of re-entering a project from "ten minutes of archaeology" to
"a single paste" — where the person re-entering may equally be you tomorrow morning or a freshly
opened AI chat that remembers nothing.

**The loop.**

```
   Capture  ──▶  Project ──▶  Pack  ──▶  (paste, re-enter)
      ▲                                       │
      └───────────── days later ──────────────┘
```

**Ten facts that constrain almost every decision:**

1. Spool itself makes **no network request, ever**. Its CSP forbids one structurally.
2. All data is one local SQLite file. No account, no cloud, no telemetry, no analytics.
3. **Pack and search never call an AI or the network.** Pack is pure string assembly — deterministic.
4. AI reaches the library only through an **opt-in MCP server** (`spool --mcp`, stdio, default OFF).
5. AI writes are **append-only, attributed, and can never overwrite the user's own words**.
6. Exactly **two tiers** of structure (Workspace → Project). Workspaces may nest; the tier count does not grow.
7. Capture is one keypress with **zero decisions** — no destination picker, no dialog.
8. macOS is signed + Apple-notarised, direct `.dmg`. **Not** on the Mac App Store — sandboxing conflicts with the global capture gesture.
9. Windows ships, but is **not code-signed** (a standing decision, not an oversight).
10. There is **no LICENSE file**, deliberately: source-available for review, all rights reserved.

**Current status.** Feature-complete and shipping on macOS and Windows. Free, no accounts, no
paywall of any kind today. Website live at `spoolapp.org` (English + Chinese, interactive demo).
The owner's assessment as of 2026-08-19 is that the product "has reached a commercially viable
stage," and the open work front is now commercialisation — see §15.

---

## 1. Identity and current state

| Field | Value |
|---|---|
| Product name | **Spool** (English) / **思簿** (Chinese, *sī bù*, "thought-ledger") |
| Bundle identifier | `com.oceanjin.spool` |
| Author | Ocean Jin · [@KIM-ocean-HZ](https://github.com/KIM-ocean-HZ) |
| Repository | `github.com/KIM-ocean-HZ/spool` (source-available; no licence — all rights reserved) |
| Website | [spoolapp.org](https://spoolapp.org) — bilingual, with an interactive walkthrough of the whole loop |
| Current version | **0.6.1**, published 2026-08-19 |
| Schema version | **v23** (unchanged since 0.5.0 — 0.6.0 and 0.6.1 run no migration) |
| Platforms | macOS 11+ (Apple Silicon, signed + notarised `.dmg`) · Windows 10/11 x64 (NSIS installer, unsigned) |
| Price | **Free**, all features, no account |
| Release history | v0.3.0 (2026-07-30, first packaged) → v0.4.0 (2026-08-08) → v0.5.0 (2026-08-18, Windows) → v0.6.0 (2026-08-19) → v0.6.1 (2026-08-19) |
| Auto-update | **None.** Direct distribution; upgrades are a manual download. |

**On the name.** A spool is an everyday object that holds a continuous thread — wound on during
capture, drawn off during pack. The metaphor maps directly onto the core loop, and the thread
between the two is always continuous. 思簿 reads as "thought-book": 簿 is specifically a
ledger or record-book, which is what Principle 3 ("a project is a log, not a chat") asks for.
Chinese-facing UI copy uses 思簿; English materials, the repo and bundle identifiers use Spool.

**Scale** *(recomputed 2026-08-19)*:

| Figure | Value |
|---|---|
| Commits | **483** |
| Development span | 2026-05-17 → 2026-08-19 (~13 weeks) |
| Application code | **54,473 lines** (TypeScript/TSX **35,324** + Rust **19,149**) |
| Design documentation | **18,992 lines** across 40 documents in `docs/` (including this one) |
| Product specification | `PLAN_EN.md` |
| Automated tests | **465 Vitest across 42 files** (all passing) + **99 cargo tests** |
| Schema migrations | **21 named steps**, walking a database from v2 to v23, each individually idempotent |
| MCP surface | **19 tools** (12 read, 7 write-gated) + **7 prompts** + `spool://thread/<id>` resources |
| Localisation | 2 languages (English / Simplified Chinese), machine-checked for gaps |

---

## 2. The problem, and the constitution that follows from it

### 2.1 The problem

LLMs do not remember your project. Every new conversation starts by re-explaining it: which
paper, which deadline, what was already ruled out and why. Do that across three chat tools, a
mail client, forty browser tabs and eleven days, and the project's context is not stored
anywhere — it is scattered, and reassembling it falls entirely on human memory.

Spool compresses "re-explaining" into "a single paste."

### 2.2 Target user

Knowledge workers running several cross-tool, cross-day workstreams at once: researchers,
developers, graduate students, solo founders.

**A stated methodological limitation.** There has been no user research. The developer is a
precise instance of the target user (a graduate applicant running several application
workstreams across several AI tools), and the product was built by using it daily and fixing
what hurt. This is written into the plan as a phase boundary — dogfood through v1, validate with
other users after release — and it is disclosed rather than hidden, because several design
decisions were reversed by dogfooding contradicting the design (see §12.2).

**Who it is explicitly not for.** Not a Notion replacement — that fight is unwinnable on Notion's
own ground, and Spool is deliberately positioned *upstream* of it, catching fragments before
they are worth filing anywhere. Not a team tool. Not a place to write documents.

### 2.3 The six non-negotiable principles

These outrank everything else in the project. Source: `PLAN_EN.md` §2.5.

1. **Capture must be zero-friction.** One keypress, no decisions, instant. Any design that makes
   the user pause at the moment of capture is a failure.
2. **Local-first, private by default.** The software ingests sensitive content. Unless the user
   explicitly invokes an external route, no data leaves the machine. Capture, pack and search
   must be fully functional with zero AI and zero network.
3. **A project is a log, not a chat.** Append-only, time-ordered, quiet. (Editing or annotating
   a block you own does not violate this — "append-only" governs the sequence of blocks, not the
   immutability of one block's text.)
4. **Retrieval is deterministic.** Pack is pure string assembly: instant, reliable, AI never in
   the hot path. AI compression is an optional enhancement, never a dependency.
5. **AI is a librarian, not an author.** It summarises, classifies, compresses. It never writes
   content for you and never decides what is related for you. AI output is always disposable
   decoration, never a structural element of any view — with AI absent, the product is intact.
6. **A block is payload, not a tier.** Attachments, annotations and source live *on* a block;
   they never become a level of their own.
   > ⛔ **This principle used to read 「Exactly two tiers of structure. Workspace → Project, no
   > deeper.」 and that half was false** — audited 2026-08-21 (§2.5). Workspaces nest to any
   > depth (`workspaces.parent_id`, no cap, recursive delete/move walks, a move menu in the
   > sidebar), and have for long enough that no one remembers shipping it. The sentence was
   > still being cited as a veto. What survives is the part above, which is what the principle
   > was protecting: structure does not grow a level every time a block gains a property.
   > ⚠️ Nesting DEPTH is now a usability question (see §9 `C5`), not a constitutional one.

### 2.4 The design bias: personal annotation amplifies pack value

Added in v2.9 as a **tiebreaker**, not a seventh principle. A pack carries blocks from four
authority bands (§7). Three of them are what other sources said. Only the *Personal* band carries
what the user actually thinks, and only the user can produce it. A pack of pure source extracts
is just a longer prompt; a pack saturated with the user's own annotations gives the receiving AI
signal it could not otherwise have.

So: **at every surface where the user is already paused, adding a personal annotation must be
the most obvious next action.** Guardrails — this never overrides Principle 1 (capture is never
paused on annotation), never overrides Principle 5 (AI does not generate annotations on the
user's behalf), and never overrides "quiet" (no modal "what do you think?" prompts). The bias is
about *affordance*, not pressure.

### 2.5 Rejected ideas (do not re-propose)

Each row has already been discussed and rejected. Source: `PLAN_EN.md` §2.6.

> ⚠️ **Audited line by line on 2026-08-21** (WORKPLAN-2026-08-20 §9 第 3 步). A rejection list
> is the one kind of document nobody re-reads critically — that is its job — so a row that has
> quietly stopped being true keeps vetoing work, and **nobody notices, because the list exists
> precisely to end the discussion**. In the round before this audit it wrongly vetoed twice.
>
> Three verdicts, and only the first means "argument closed":
>
> | | Means |
> |---|---|
> | ✅ **仍然有效** | The reasoning still holds against the current build. Do not re-propose. |
> | ⛔ **已被实现推翻** | The product already does this. The row is not a rule any more, it is a false statement about the software. |
> | ⚠️ **理由已变，需重议** | Something narrower than the row is still rejected, but the row as written now blocks work it was never about. **Read the note before citing it.** |
>
> ⛔ The verdicts are recorded, not acted on: nothing here removes a rejection. Reversing one is
> Ocean's to say out loud (§13's rule), and an audit is not a decision.

| Rejected | 2026-08-21 | Why rejected | What we do instead |
|---|---|---|---|
| Become a lightweight Notion | ✅ 仍然有效 | Unwinnable on Notion's turf; the moat is zero-friction capture | Be Notion's upstream |
| Infinite nesting | ⛔ **已被实现推翻** | Managing a tree instead of working | ~~Exactly two tiers~~ — **workspaces nest to any depth and have for a long time**: `workspaces.parent_id` with no depth cap, a recursive `descendantIds` walk behind delete and move, and the sidebar's own move menu offering any non-descendant as a parent. What was actually kept is that a BLOCK is payload, not a tier. See §2.3 principle 6 |
| Auto-link "similar" projects | ✅ 仍然有效 | 90% noise; violates Principle 5 | Full-text search + explicit @-mentions. `find_similar_blocks` only *reports* duplicates — merging stays the user's curation |
| AI writing content for you | ✅ 仍然有效 | Turns AI into an author | AI only summarises / classifies / files |
| AI-suggested annotations | ⚠️ **理由已变** | Turns Personal into Synthesis — the one band AI must not fill | The rejection itself stands: nothing suggests annotation text to the user. But **"filled only by the user's keystrokes" is no longer true** — an AI may write one through the MCP tools, and it is kept out of the Personal band instead of kept out of the slot (`annotation_by`, rendered `ai note:`, weighed 🧩). Cite the band rule, not the slot rule |
| Fully automatic capture | ✅ 仍然有效 | "100% automatic + 100% non-invasive" is a contradiction | Copy-and-remember gesture. Reaffirmed 2026-08-20 (双击 ⌥ 录屏 refused on this row) |
| Real-time collaboration | ✅ 仍然有效 | Different product; dilutes positioning | Sharing = pack hands you text |
| Cloud sync in v1 | ⚠️ **理由已变** | Sync done wrong is a privacy disaster | Local-only still stands, but **the "v2 hook" half is dead**: E2EE sync is now explicitly not being built at all (WORKPLAN §4.3). The row promises a later version that is not coming |
| Rich text editor | ✅ 仍然有效 | Complexity explosion | Plain text / Markdown source (`==spans==` are source, not formatting) |
| Kanban / calendar / table views | ⚠️ **理由已变** | Each view is forever maintenance | The cost argued here is **a NEW first-class view**. It does not cover reshaping one that already exists and is already maintained — and `ProjectBoard` is already in the build. ⛔ Do not cite this row against the v0.7 `C4` schedule-board conversion |
| Collapse every block by default | ✅ 仍然有效 | Re-entry then costs one click per block | Smart truncation per long block |
| Node-graph project view | ⚠️ **理由已变** | Violates "quiet"; linear reading is already fastest | Still true of a node graph as *the way you read a project*. It is **not** an argument against the provenance graph on the roadmap (§9 step 11), which displays citation edges that already exist in the data and never replaces the feed |
| Per-block AI summary | ✅ 仍然有效 | Low payoff per block; reliability variance | Project-level summary only (`distill`, `set_thread_summary`) |
| Manual 0–100 progress slider | ✅ 仍然有效 | Theatre; a number to *maintain*, not a signal to *trust* (rolled back after shipping) | status + deadline + `updated_at` |
| Manual `next_step` per project | ✅ 仍然有效 | Stale by re-entry; friction on exit (rolled back after shipping) | The append-only feed *is* "where you left off" |
| Colour-coded blocks by source | ✅ 仍然有效 | Violates "quiet" | Source-category icons + date dividers. Reaffirmed 2026-08-20 (colour-by-priority refused on this row) |
| User classification at capture time | ✅ 仍然有效 | Violates Principle 1; the user does not yet know the category | The pack header teaches the AI to classify |

### 2.6 The feature filter

For any new feature, ask in order. **If any answer is "no," do not build it.**

1. Does it fit one of the three actions — Capture, Project, Pack?
2. Does it make re-entering a project faster?
3. Does it conflict with any of the six principles?
4. Is it on the rejected list?
5. Without it, is the product *unusable* — or merely *not as good*? (Merely not as good → defer.)

Tiebreaker when two designs both pass: prefer the one that surfaces more opportunity for
personal annotation.

---

## 3. The core loop

### 3.1 Capture

**Gesture.** Double-tap a modifier key — **⌥ on macOS, Ctrl on Windows** — and whatever is on
the clipboard is written into the current capture-target project. It rides existing ⌘C / Ctrl+C
muscle memory: you already copied; the second gesture just says "keep it."

**Zero decisions.** No destination picker, no category, no tags. Exactly one project globally is
the capture target at any time (`threads.is_capture_target`).

**The confirmation overlay** is a separate always-on-top, non-activating window. It shows the
saved text, its destination, the detected source, and a note box **with the cursor already in
it**. Type the thought that made you save this and press Enter, or click anywhere to skip. The
main window never has to come forward. Your own note outlives the excerpt, and connected AIs
treat it as the highest-signal line in the pack.

**Source auto-detection.** On macOS a capture records the frontmost application and, for
browsers, the **active tab title** (via Automation permission, prompted once per browser). On
Windows there is no tab-title equivalent: a capture records the application only.

**Platform mechanics.**
- macOS: a CGEventTap reads the double-tap. Requires **Input Monitoring**. **Accessibility is
  optional** and buys two things: (a) *exclusivity* — when Spool captures, it deletes the second
  ⌥ press from the event stream so other apps bound to the same gesture (Claude Desktop's quick
  entry, for one) do not also fire; (b) it hands the overlay the keyboard, so the note box can be
  typed into immediately. Without it, capture still works, but the note box must be clicked first.
- Windows: **Raw Input**, not a keyboard hook — which is what lets it work while antivirus
  software is watching for hook-based keyloggers. Nothing to grant.
- Neither platform binds a key *combination* out of the box; an optional one can be recorded in
  Settings → Shortcuts, and it works without any permission.

### 3.2 Project

An append-only, time-ordered log of blocks. Two tiers: Workspace → Project. Workspaces may
nest (v23); the number of *tiers* does not grow — a nested workspace is still a workspace.

Opening a project lands at the newest blocks, which *are* "where you left off." There is no
status field to maintain — a field nobody updates is worse than no field, which is why the
manual progress slider and `next_step` note were both built, dogfooded, and rolled back.

Lifecycle: **active → parked → done**. A done project condenses to a digest view (conclusion,
pinned blocks, files and links) with a one-click path to reopen.

### 3.3 Pack

One click (⌘⇧P / Ctrl+Shift+P) assembles the project into a paste-ready Markdown briefing.
Pure string assembly. No AI, no network, deterministic — the same project packs to the same
bytes on the same day. Full format in §7.

That determinism is worth more than it sounds: the feature cannot fail slowly, cannot cost
money, and cannot behave differently on the day you need it.

---

## 4. Complete feature inventory

### 4.1 Capture and the overlay
- Double-tap modifier capture, global, with an editable source badge
- Optional user-bound capture shortcut (unbound by default)
- Note-first confirmation overlay with undo/redo, placed by the screen's *usable* area
- Browser tab-title detection (macOS)
- Capture target: exactly one project, switchable from the project header
- Permission banner while Input Monitoring is missing, with a setup action

### 4.2 The project timeline
- Append-only numbered block feed with date dividers and source badges
- Inline edit, annotations (`note:`), pinning ("core context"), smart truncation for long blocks
- Markdown rendering; `==highlight==` spans marked by selection ("Mark as key?")
- Corrections: select a sentence → "Correct this?" → the correction is pinned *underneath* the
  sentence it corrects, joined by a dashed line, opening on click (v0.6.1)
- Retirement: mark a block as no longer valid — it leaves the pack but stays in the library and
  stays searchable, and the pack says out loud that it was left out
- Merge blocks; forward/copy a block to another project
- @-mention references to other projects in the same workspace
- Composer with Enter/Shift+Enter, undo covering your own writes (⌘Z in an empty composer)
- Project files: file / folder / URL attachments at project level, with text auto-extraction
  (PDF via pdf.js, docx via mammoth, txt/md), per-file "include in my pack" and "AI may read
  this" switches
- Provenance on a block: source URL, retrieved-on date, review-by date, with reminders at two
  months / one month / one week

### 4.3 Retrieval
- Global search (⌘⇧F): SQLite FTS5 with the **trigram tokenizer** (Chinese-correct substring
  matching) plus a short-query LIKE fallback for 1–2 character queries; three-line contextual
  snippets; in-block navigation between hits
- Attachment text is searched too, and reported separately from block hits
- Pack, with a range selector: all / pinned only / last 7 days / last 30 days
- **Workspace pack**: pack an entire workspace into a real folder — `INDEX.md` plus one `.md`
  per project, sub-workspaces as sub-directories — that an AI opens a piece at a time. Nothing is
  summarised away to fit a budget.
- Cross-project digest of recent activity
- Near-duplicate detection (character-trigram overlap, threshold 0.6), read-only — Spool never merges

### 4.4 Organisation
- Sidebar: summary section + cross-workspace focus + workspace tree, multi-select, drag between
  workspaces, alphabetical project sort
- Deadlines on projects; project board (a list, deliberately not another tree)
- Project completion + digest view with a chosen conclusion
- First-day value panel: a capture meter in the left rail

### 4.5 AI surfaces (all optional)
- MCP server, 19 tools / 7 prompts (§8), with a one-click client hookup that writes the client's
  config for you (with a backup) and reports whether that client has actually connected
- Review queue: AI proposals (split writes, corrections, follow-up lines) land on a review screen,
  not in your timeline
- Follow-up: a per-project list of lines to watch, each *standing* (never auto-closes) or
  *one-off*; AIs may propose lines and close ones they answered, but a standing line refuses to close
- CLI engine slot (§9): Follow up, Weekly review, Draft follow-up goals

### 4.6 System, settings, appearance
- Settings: General, Shortcuts, MCP, Engine, Browser automation, Library transfer, Advanced
- Language: English / Simplified Chinese, following the system locale by default
- Library transfer: export the whole library and import it on another machine (import **merges**,
  it does not replace)
- System tray; close-to-tray with a first-time explanation (Windows)
- Autostart, clear data, unified toast surface
- **Break reminder** (v0.6.0): after a configurable stretch of *actual* work (30/60/120 min,
  default 60) Spool locks its own window for a fixed five minutes with a countdown. "Working" is
  narrowly defined — Spool must be the front window *and* touched in the last five minutes; time
  is credited a tick at a time so a sleeping laptop cannot manufacture a streak. The schedules and
  the five-minute dose come from a cited BJSM study (DOI `10.1136/bjsports-2025-111221`), not from
  round numbers picked by eye.
- **Appearance** (v0.6.0): *Classic* (the default, and literally the same code path the shipped
  app always used) or *Valentine's* (full palette, display serif, watercolour background, a heart
  in place of the spool meter — the capture overlay follows it too)

---

## 5. Architecture

### 5.1 Processes

```
┌──────────────────────────────────────────────────────────────────────┐
│  Spool.app                                                            │
│                                                                       │
│  ┌───────────────────────┐        ┌──────────────────────────────┐   │
│  │ Main window           │        │ Capture overlay window        │   │
│  │ React 18 + TS + Vite  │        │ separate Vite entry,          │   │
│  │ Zustand stores        │        │ always-on-top, non-activating │   │
│  └───────────┬───────────┘        └──────────────┬───────────────┘   │
│              │  Tauri IPC                        │                    │
│  ┌───────────▼────────────────────────────────────▼───────────────┐  │
│  │ Rust core (src-tauri)                                          │  │
│  │  capture.rs · double_tap.rs / double_tap_win.rs · overlay.rs   │  │
│  │  engine.rs (CLI subprocess) · transfer.rs · pack.rs · mcp.rs   │  │
│  └───────────────────────────┬────────────────────────────────────┘  │
└──────────────────────────────┼───────────────────────────────────────┘
                               │
                    ┌──────────▼──────────┐
                    │  SQLite + FTS5      │   ← the entire library, one local file
                    └──────────▲──────────┘
                               │
         ┌─────────────────────┴──────────────────────┐
         │                                            │
┌────────▼──────────────┐                 ┌───────────▼────────────────┐
│ spool --mcp           │                 │ CLI engine subprocess       │
│ stdio JSON-RPC server │                 │ claude / codex / gemini     │
│ started BY the client │                 │ spawned locally by Spool    │
│ (Claude Desktop,      │                 │ — this process, not Spool,  │
│  Codex, Cursor, …)    │                 │   is the one that goes      │
│ default OFF           │                 │   online, on the user's own │
└───────────────────────┘                 │   login and quota           │
                                          └────────────────────────────┘
```

Two things to notice in that diagram, because they are the whole privacy story:

- **The GUI has no outbound arrow at all.** Not "we don't use it" — the webview CSP forbids one.
- **Both AI routes are separate processes the user starts.** The MCP server is launched by the
  user's own AI client; the CLI engine is spawned as a local subprocess with the user's own
  login. Spool holds no API key and is never an HTTP client.

### 5.2 Stack

| Layer | Choice | Why |
|---|---|---|
| Desktop shell | **Tauri 2** | ~5–9 MB artefacts, fast start, global shortcuts, multi-window; compiles to iOS |
| Frontend | **React 18 + TypeScript (strict) + Vite** (multi-page build) | strict mode safeguards the core logic |
| Styling | **Tailwind + CSS variables** | tokens in CSS variables, Tailwind for utilities |
| State | **Zustand** | a store is 30 lines |
| Storage | **SQLite** via `tauri-plugin-sql`, **FTS5 trigram** | Chinese-correct full-text search |
| Text extraction | `pdfjs-dist`, `mammoth` | lazily imported, never sent to a network |
| Icons / fonts | `lucide-react` · Geist + Fraunces (CN fallback PingFang SC / Microsoft YaHei) | |
| Testing | **Vitest** (TS) + **cargo test** (Rust) | |
| macOS integration | `core-graphics`, `core-foundation`, `foreign-types`, Tauri `macos-private-api` | capture tap + non-activating overlay |

**Dependency policy is strict and explicit**: no UI component libraries, no Redux, no
SWR/TanStack, no rich text editors, no date libraries (use native `Intl`). Anything outside the
approved list requires the owner's approval.

### 5.3 Repository layout

```
src-tauri/src/        Rust: capture, overlay, MCP server, CLI engine, transfer, pack
  mcp.rs              12,397 lines — the entire MCP server, tools, prompts, routing text
  engine.rs            2,298 lines — CLI subprocess lifecycle, streaming, cost parsing
  capture.rs           1,462 lines — clipboard, source detection, focus handling
  double_tap.rs / double_tap_win.rs  — the gesture, per platform
src/
  overlay/            the capture overlay window (separate Vite entry)
  components/         Sidebar, ThreadView, Pack, Search, Settings, RightRail, Review, ui
  lib/                core logic: capture, pack, search, db, engine, i18n, blocks, attachments
  stores/             Zustand
  styles/             design tokens
site/                 the website (static, bilingual; zh generated by scripts/build-site-zh.mjs)
scripts/              generators, i18n check, visual regression, demo seeding
docs/                 design documents, ledger, handoffs, release notes
PLAN_EN.md            the blueprint and source of truth
```

### 5.4 The one structural duplication, and why it is safe

**The context packer exists twice** — once in TypeScript for the GUI (`src/lib/pack/assemble.ts`)
and once in Rust for the MCP server (`src-tauri/src/pack.rs`) — because the MCP server must be
able to answer without the GUI running.

They are held together by a **cross-language golden test**: one fixture is asserted from both
sides against `src/lib/pack/fixtures/golden-pack.expected.txt`, so a change to either renderer
fails the suite until the other matches. Timestamps are normalised, because raw bytes are
timezone-dependent.

⚠️ There is exactly **one deliberate divergence**: file-permission filtering. The AI-facing
renderer honours `ai_access` alone; the user-facing one honours "include in my pack." The golden
test compares the *rendering functions*, and the divergence lives in the row of data fed to
them. "Aligning" the two would re-open the hole fixed in v0.6.1. See `DESIGN_PROJECT_FILES.md` §9.

---

## 6. Data model

One SQLite file. Three tiers of content — Workspace → Project (`threads`) → Block — plus the
tables that support attachments, search, AI review and follow-up.

### 6.1 Tables

| Table | Holds |
|---|---|
| `workspaces` | Big topics. `parent_id` allows nesting (v23). Deletes are **soft** (`deleted_at`) |
| `threads` | Projects. Title, summary + `summary_source` (`user` / `mcp` / null) + `summary_at`, digest, deadline, status (`active`/`parked`/`done`), `is_capture_target`, `auto_maintain`, legacy follow-up columns |
| `follow_up_items` | One row per line a project watches. `standing` 0/1, `status` `proposed`/`open`/`answered`, `fingerprint` for dedup, `proposed_by`, `answer_block_id`, `outcome` |
| `blocks` | The fragments. Content, annotation, source, `seq`, pinned, `stale_at`, `ref_block_id` + `ref_kind` (`cites` / `supersedes` / `corrects`), corrected-quote, provenance (source URL, retrieved-at, review-by), annotation author |
| `attachments` | File / folder / URL, project-scoped since v15/v19. `extracted_text`, `extraction_kind`, `include_in_pack`, `ai_access` |
| `blocks_fts`, `attachments_fts` | FTS5 virtual tables, trigram tokenizer |
| `proposal_batches`, `proposals` | The AI review queue — writes an AI proposes, waiting on the user |
| `engine_runs` | Completed CLI engine runs (Follow up, Weekly review) |
| `file_access_requests` | An AI asking to read a locked file; queued for the user |
| `date_dismissals` | Dismissed date reminders |

### 6.2 Migration policy

A **named registry** of **21 steps**, each carrying a database exactly one version forward
(v2 → v23), each individually idempotent with guarded `ALTER`s, run sequentially, checkpointed by
`PRAGMA user_version` so a crash between steps resumes cleanly. Every step ships with SQL that
takes the database back down one level, so the next step's migration always has something to
migrate *from*.

⚠️ **Two hard rules learned from an incident (§12.3):**
1. **Never drop a column.** SQLite implements `DROP COLUMN` by rebuilding the table, and a
   rebuild branch is what emptied the live library on 2026-05-29. Dead columns are kept —
   `follow_up_brief` and its three suggestion columns are retained and unread. An unread column
   costs nothing.
2. **An unrecognised schema version must never trigger a rebuild against a populated database.**
   The code refuses and reports instead.

### 6.3 Two data rules that carry product meaning

- **`summary_source`**: an AI may never overwrite a summary a human wrote. The column is the
  enforcement, not a convention.
- **`ref_kind`**: `cites` (builds on it), `supersedes` (replaces it — that block becomes stale),
  `corrects` (one point inside it is wrong; the rest still stands). Only the third can be
  *proposed* by an AI; marking a block as no longer valid stays the user's alone.

---

## 7. The pack — the crown feature, in detail

### 7.1 Structure

```
# Project Context: <title>
Generated by Spool on <date>. <N> blocks total.

## How to Read This Context        ← the authority header (static, verbatim)
   📖 Reference · 🧩 Synthesis · 🔄 Process · 💭 Personal

## Pinned Blocks                   ← user-marked core context, timeline order
## Full Record (chronological)     ← every block, with note:, attachments, ↩ citations
## Related Files & Links           ← [extracted: yes/no, inlined: yes/no]
## Output Language                 ← respond in the user's language
```

### 7.2 The four authority bands — the genuinely unusual part

Fragments arrive from four kinds of source and do not deserve equal weight. The pack opens by
sorting them and telling the receiving model how to treat each:

| Band | What it is | How the AI is told to treat it |
|---|---|---|
| 📖 **Reference** | Institutional / official artefacts — school domains, email clients, PDFs, authoritative posts | **Ground truth.** Do not contradict, do not extrapolate. On conflict, Reference wins. |
| 🧩 **Synthesis** | Long structured explanations written by *another* AI | Someone else's synthesis. Useful framing, **correctness not guaranteed**. Never copy wholesale. |
| 🔄 **Process** | Chat traces, Q&A dialogue | **Literal content is not a reliable source of facts.** What *is* reliable is the user's evolving questions — where they got confused, what they kept circling back to. |
| 💭 **Personal** | Sourceless blocks the user typed, plus every `note:` annotation | **Highest-signal input in the pack.** Shows where the user stands and where their reasoning may be incomplete. Point out factual errors directly. |

The classification is done by the *receiving* AI; the header is static text. Assembly stays pure.

**Why this matters strategically**: this is the part of Spool that is hard to copy by adding a
button to a note-taking app. It is a claim about *how mixed-provenance context should be handed
to a model* — and it is enforced at every write path (an AI's note renders as `ai note:` and can
never be read as the user's own judgement).

### 7.3 Budgeting

Default cap 50,000 characters. An over-budget pack still returns: the reading header and Pinned
Blocks stay complete, the Full Record fills newest-first to the budget, and inlined attachment
text is squeezed if that alone overflows. **Every cut is stated in place** — how many older
blocks were omitted, how many characters of a file's text were dropped, and how to read the rest.
Nothing is silently summarised away.

---

## 8. The MCP surface

Spool ships **zero built-in AI**. Instead it speaks the [Model Context Protocol](https://modelcontextprotocol.io):
the user's own client (Claude Desktop, Codex — including a Codex conversation inside the ChatGPT
desktop app — Cursor, or any MCP-capable tool) launches `spool --mcp` over stdio.

**You do not need MCP to use Spool with an AI.** ⌘⇧P packs a project into Markdown you paste
into a browser tab. MCP buys exactly one thing: the AI fetches context itself instead of waiting
for a paste, and can file conclusions back with its name on them.

⚠️ **An ordinary ChatGPT web conversation runs remotely and cannot reach a local stdio server.**
Listing on a marketplace would not change that; only exposing Spool over public HTTPS would, and
that collides with the product's core claim.

### 8.1 The 19 tools

**Read (12)** — no consent gate beyond enabling the server:

| Tool | Answers |
|---|---|
| `list_threads` | Every workspace and project, with summaries, counts, and `approx_pack_chars` read budgets. Call this first. |
| `get_digest` | "What have I been working on" across the whole library or one workspace |
| `get_pack` | The same deterministic pack the GUI produces, for one project |
| `search_blocks` | Full-text search across blocks, annotations and extracted file text |
| `find_similar_blocks` | Near-duplicate groups (read-only; Spool never merges) |
| `get_blocks` | Page through one project's blocks; centre a page on a search hit |
| `check_library` | Library-wide hygiene checkup |
| `get_project_overview` | "How is this project doing" in one round-trip |
| `get_follow_up_brief` | What a project is currently watching for |
| `distill` | Briefing + the job: distil one project into a conclusion |
| `thread_health` | Briefing + the job: report one project's health |
| `weekly_review` | Briefing + the job: review the week across all projects |

**Write (7)** — behind a **second, separate** consent switch:

| Tool | Does | Guard |
|---|---|---|
| `create_thread` | Create a project | |
| `add_block` | Append a block, optionally citing or proposing a correction | Enforced source label; never overwrites |
| `propose_blocks` | Queue a batch of blocks for the user's review | Lands on the review screen, not the timeline |
| `set_thread_summary` | Refresh a project's one-line summary | **Refuses** if `summary_source = 'user'` |
| `suggest_follow_up_item` | Propose a new line to watch | Parked as `proposed` — never live |
| `close_follow_up_item` | Close a line it answered | **Refuses** on a `standing` line |
| `request_file_access` | Ask to read a file already in a project | **Stores nothing** — queues a request and waits |

### 8.2 The 7 prompts

`compress_pack`, `weekly_review`, `thread_health`, `distill`, `triage_conversation`, `file_this`,
`catch_up`. These are client-invocable workflows; Spool assembles the material and states the job.

Plus `spool://thread/<id>` resources for clients that consume resources.

### 8.3 What an AI can and cannot do to history

- It **may** append.
- It **may propose** that one point in an older block was corrected — the user approves or discards.
- It **may not** overwrite a human-written summary, retire a block, close a standing watch, or
  write a note that reads as the user's own.
- Every AI write carries an **enforced source label** (`Claude · MCP`, `Codex · MCP`) that the
  client cannot set, and a distinct badge in the GUI.

### 8.4 Intent routing — a non-obvious requirement

A tool that exists in `tools/list` but is named in neither the `initialize` instructions nor the
routing text **is never called by a third-party client**. Three tools once shipped and stayed
invisible for exactly this reason. The server therefore states its own rules, and the plain-language
phrasings a user is likely to say, in the `initialize` instructions it sends every client — so a
freshly connected AI opens by naming what it can do with the user's *actual* projects.

There is an assertion in the codebase that fails the build if a tool appears in `tools/list` but
in neither `OPENERS` nor `INSTRUCTION_BODY`.

⚠️ Related: **every tool must declare `annotations`**. A missing annotation has no local symptom
whatsoever, and makes the tool uncallable on some clients.

---

## 9. The CLI engine slot

Reading through a chat client is one half. Checking what changed while you were away is the
other — and for that Spool drives a coding CLI the user already owns. If `claude` (Claude Code),
`codex` (Codex CLI) or `gemini` (Gemini CLI) is installed and logged in, Spool detects it on disk
and offers three actions:

| Action | What it does | Reaches the web |
|---|---|---|
| **Follow up** | Searches against the lines *the user wrote*; findings queue for review | **yes** |
| **Weekly review** | One review across every project, in its own screen | no |
| **Draft follow-up goals** | Suggests lines worth watching for one project | no |

Three deliberate properties make this safe to leave on:

1. **Spool never becomes a network client.** It spawns the CLI as a local subprocess; the request
   leaves from there under the user's own login and quota. No API key is stored, entered or needed.
2. **Runs are visible and recorded.** Follow up runs in the right-hand rail; Weekly review has
   its own screen. Anything that would change existing notes arrives as a proposal.
3. **Only Follow up gets web tools**, and only against the user's own lines.

Requires: the MCP service, AI-write permission, one supported CLI, and a per-run time limit.

**Honest limitations stated in the UI rather than hidden**: Codex's built-in shell tool cannot be
removed the way Claude Code's can, so Spool runs it read-only sandboxed. Gemini can run Weekly
review and draft goals, but not Follow up.

⚠️ **The Gemini free tier is gone.** Google closed the free entry point on 2026-06-18. As of
2026-08 there is **no free AI tier that can run all of Spool's actions** — see §12.2.

---

## 10. Privacy, egress and threat model

### 10.1 The egress claim, stated precisely

**Spool itself makes no network request, ever.** Its CSP forbids one structurally, so this is an
architectural property rather than a promise about intent. There is no account, no telemetry, no
analytics, no crash reporting, no update check.

Content reaches another program only through a hand-off the user chooses:

| Route | Who initiates | Where the request leaves from |
|---|---|---|
| Paste a pack | The user, with ⌘C | Nowhere — it is the clipboard |
| MCP | The user's AI client launches `spool --mcp` | That client, on its own connection |
| CLI engine | Spool spawns a local subprocess | That CLI, on the user's login and quota |

MCP is opt-in, and its **write side is a second, separate switch**.

### 10.2 The prompt-injection chain, and where it is cut

The most interesting security property in the codebase concerns Follow up. The chain to worry
about is: *a fetched web page → rewrites what the project watches → steers the next run's
searches.* That would turn a page the user never vetted into a standing instruction.

The cut: an AI's proposed rewrite of a follow-up brief is written to a **separate column**
(`follow_up_brief_suggested`) and never into the live one. It sits on the review screen until the
user's click moves it across. The same shape protects follow-up *lines* (`status = 'proposed'`)
and AI block writes (the proposal queue).

The general principle: **anything that outlives this conversation and steers the next one
requires a human step.**

### 10.3 File-level AI permission

A project file has two independent switches: "include this text in the pack **I** copy" and
"an **AI** may read this." Until v0.6.1 either was enough to unlock the file — so the interface
said "AI can't read this file" while the AI could still search and inline it. **The AI switch is
now the only lock.** When locked, the AI can see that the file exists and that it has extracted
text, cannot read it, and knows how to ask (`request_file_access`).

### 10.4 What is deliberately *not* claimed

- Content handed to an MCP client or a CLI reaches **that vendor**. Spool says so rather than
  implying local-only end to end.
- No sandbox claim beyond what the OS provides.
- No auto-update, so no silent security patching — this is a real cost of direct distribution.

---

## 11. Platforms, distribution and release

### 11.1 macOS
Developer ID–signed and **Apple-notarised** `.dmg`, distributed straight from GitHub Releases.
**Not on the Mac App Store**, decided 2026-07-06: sandboxing conflicts structurally with the
global capture tap, private-API overlay behaviour, and browser AppleScript.

⚠️ A release requires **two** notarisation submissions: the build tool notarises the `.app` but
only *signs* the `.dmg` that wraps it — and Gatekeeper inspects what the user downloads. Both
must be submitted and stapled, and the check run against both artefacts.

### 11.2 Windows
NSIS x64 installer built by CI. **Not code-signed** (decided 2026-08-15) — SmartScreen warns once.
Ported features: the full app, MCP, tray, close-to-tray. Not ported: macOS-specific focus handling
and browser tab-title capture, so a Windows capture records the application only.

### 11.3 Linux
Not implemented. Feasible via Tauri, but the capture trigger, focus handling and process-group
cancellation are macOS-specific and would need rewriting rather than porting.

### 11.4 Release mechanics
- Fixed-name assets (`Spool-macOS-arm64.dmg`, `Spool-windows-x64-setup.exe`) sit beside the
  versioned ones so the website's download buttons have stable URLs. **Both names point at the
  same bytes** — which matters for any download-count metric (§15.1).
- Every release appends a row to `docs/CASE_STUDY_LEDGER.md` §1.2, including notarisation
  submission ids — **the only figures in the ledger that cannot be recomputed**, because
  `notarytool` returns them once.
- Full procedure: `docs/RELEASE.md`.

---

## 12. Quality system and measured evidence

### 12.1 The test system

**465 Vitest across 42 files + 99 cargo tests** *(both suites re-run 2026-08-19; all passing)*.
A count is not a coverage claim, and two tests matter more than the number:

- **The cross-language golden test** (§5.4) — the only thing keeping two independently written
  packers byte-identical.
- **The migration round-trip** — every schema step ships a down-migration, so the next step's
  test always has something to migrate *from*.

Also machine-checked: i18n gaps (`node scripts/i18n-check.mjs` → `(none missing)`), TypeScript
strict, and website visual regression baselines in `docs/qa/visual-baselines/`.

**Two things that cannot be automatically tested, and are escalated to a human every time**: the
capture gesture itself, and "what it looks like after you click."

### 12.2 Measured findings that changed the product

From `docs/CASE_STUDY_LEDGER.md` §2 — results from measuring a running system, not descriptions
of what was built.

| Finding | Measurement | What changed |
|---|---|---|
| **Where context overload comes from** (2026-08-07) | One real project's pack: 26,163 / 50,000 chars. **95% of the volume was the user pasting documents; 5% was AI writes.** Average block size 11× larger for user pastes | Reversed two planned features: dedup **demoted**, retirement/correction **promoted and shipped**. The design document had assumed the opposite. |
| **What dedup is worth** | One exact-duplicate pair, 3,503 chars each — 13% of the pack, and a **one-time** recovery, not a recurring saving | Merging rejected; marking one copy stale removes it from the pack while keeping it searchable |
| **First write by an external AI** (2026-08-07) | ChatGPT desktop over MCP, given one ordinary sentence: **11 blocks** into a project it created itself, unprompted tool chain `list_threads → create_thread → add_block ×12 → get_pack (self-check) → …`, **2 errors both self-recovered**, source label enforced server-side | Establishes the write path is discoverable from plain language. Does **not** establish that instructions in a tool description will be followed |
| **Cost of one live web run** | ~**$0.45** on the cheapest model — found and fixed three real bugs | Cost is per-run and visible |
| **What a free AI tier is worth** (2026-08-08) | Free tier measured at **20 requests/model/day**, against a planned-on figure of 1,500 — **wrong by 75×**. 2 of 4 actions completed; one failed follow-up consumed the entire day's allowance; 15,502 tokens to answer a one-word prompt | The free engine ships ranked last, with the web action **withheld rather than shown-and-failing**, and the real allowance stated in the UI |

⚠️ **The free tier then closed entirely** (Google, 2026-06-18). The current state of the world:
no free AI tier can power all four maintenance actions.

### 12.3 Incidents worth knowing about

`docs/CASE_STUDY_LEDGER.md` §3 records **43 failures with their fixes**, ordered by how much they
changed the system. The load-bearing ones:

- **The live database was wiped (2026-05-29)** — a schema-rebuild branch ran against a populated
  library. Produced the two migration rules in §6.2 and a backup/recovery procedure.
- **The capture gesture collided with another application** — double-tap ⌥ is also Claude
  Desktop's quick entry. Fixed by *consuming* the second press at the HID layer when Spool
  captures, and passing a bare double-tap through untouched.
- **A rule written into a prompt was broken on its first real run** — instructions in tool
  descriptions are not guarantees.
- **Three tools shipped and were invisible** — routing text, not the tool list, is what a client
  reads (§8.4).
- **A tier of the product was designed on a number wrong by 75×** — the free-tier case above.
- **Two failures whose only symptom is silence** — the class of bug this project fears most, and
  the reason several rules are enforced as build-time assertions rather than conventions.

The pattern across all of them, which is the reusable lesson: **the failures that survive testing
are the ones with no visible symptom.** Several red lines in §13 exist because the wrong version
passed every test.

---

## 13. Standing decisions — the red lines

These are owner decisions, not preferences. Each one has already cost something. **They may be
reversed only by the owner, explicitly — never as a side effect of implementing something else.**

| Decision | Date | Consequence |
|---|---|---|
| **MCP is the only AI channel** — all built-in AI removed (Gemini/Groq/Ollama) | 2026-07-09 | Spool never calls a model itself |
| **No Mac App Store**; Developer ID notarised direct distribution | 2026-07-06 | App Store subscriptions and Offer Codes are unavailable (§15.2) |
| **Zero egress from the app itself** | 2026-07-09 | Any feedback channel or licence check challenges it |
| **Email collection lives on the website only**, never in the app | 2026-07-31 | Feedback channels grow from the site |
| **No `LICENSE` file** (asked three times, answered no each time) | recurring | Source-available for review; all rights reserved |
| **Windows stays unsigned** — "do not ask about this again" | 2026-08-15 | SmartScreen warning; do not re-raise unprompted |
| **UI copy must be plain language** | recurring | The owner has said "I couldn't understand what you wrote" |
| **Real screenshots only, never renders/mockups** | 2026-08-11 | Mockups are only for comparing options that do not exist yet |
| **File readability keys on `ai_access` alone** | 2026-08-19 | Re-adding `\|\| include_in_pack` restores the lie the interface was telling |
| **The two pack renderers diverge on purpose** | 2026-08-19 | "Aligning" them re-opens the AI-side hole |
| **Break = 5 minutes, fixed**; only the interval (30/60/120) is configurable | 2026-08-19 | Five minutes was the constant across all three studied schedules — it is the dose, not the timetable |
| **Classic appearance IS the shipped app**, not a theme | 2026-08-19 | Bare `:root` tokens must not be touched; Valentine's lives only under `[data-theme='valentine']` |
| **Never drop a SQLite column** | 2026-05-29 | A rebuild branch emptied the live library once |
| **Never kill `--mcp` subprocesses by name** | — | They belong to other AI clients; stop the GUI by pid |
| **No AI attribution in git history** | recurring | Removing a `Co-Authored-By` trailer once required rewriting history, re-pointing tags and force-pushing |

---

## 14. Open engineering debt

Five items, from `docs/HANDOFF-2026-08-19.md` §1. Everything else in that document has shipped.

1. **Environment hygiene** — two obsolete artefacts to delete (an unused marketplace directory
   with zero code references, and an old 0.4.0 build).
2. **Multi-monitor `frontmost_window_owner_pid()`** — unverifiable on the current hardware (one
   display). Needs a second monitor and a documented probe.
3. **`register_undo_shortcut()` on the AXFrontmost-denied path** — the denial itself is measured
   (`kAXErrorAPIDisabled`, -25211); the successful re-registration immediately after is not.
   Lowest priority; failure is logged, not silent.
4. **Human verification of the three v0.6.1 changes** — cross-line highlight, correction folding,
   file lock. Automation proves the logic, not the feel. ⚠️ Every MCP client must be fully quit
   (⌘Q) and reopened to pick up a new binary.
5. **Windows 0.6.1 installer** — published but not yet installed by a human. Procedure in
   `docs/WINDOWS-CHECK.md`.

---

## 15. Commercial position and the four open questions

**Current position**: free, all features, no account, no gate of any kind. The owner's stated
assessment on 2026-08-19 is that the product has reached a commercially viable stage, and four
work items were opened. The record is `docs/BACKLOG-2026-08-19.md`.

⚠️ **Three of the four touch money or user data — two things this codebase has never touched.**
Every red line in §13 was built on "zero egress + local SQLite + collect nothing." Challenging
that is allowed; doing it *by accident* is not.

### 15.1 A download dashboard

Two separate problems that should not be built as one thing:

| | Download counts | User feedback |
|---|---|---|
| Where the data is | GitHub Releases asset counters | **Nowhere — no channel exists today** |
| Needs an app change | No | Depends on the route chosen |
| Touches the egress line | **No** | **Probably yes** |

Three measurement questions must be settled before "quantifiable" means anything:

- **Cumulative vs. rate.** GitHub reports a running total and keeps no history. Daily deltas
  require snapshotting from a chosen day forward — **the one item here that gets strictly worse
  the longer it waits.**
- **What counts as one download.** Each release publishes **four assets**: two versioned and two
  fixed-name aliases pointing at the same bytes, and the website's buttons use the aliases.
  Summing all four **double-counts**; counting only the versioned pair **misses most website
  traffic.**
- **Who sees the dashboard** — local-only, or public (which means hosting).

Known starting point: download counts can be read from GitHub without the app's participation and
without user consent — **the only route here that does not touch the egress line at all.** The
website already has an email/feedback slot; feedback should grow from there.

### 15.2 Subscription vs. one-time purchase, plus friend redemption codes

**This is the owner's decision to make, not an engineering choice.** What can be laid out is the
cost of each shape. The questions that must be answered first:

1. **What is being sold** — the whole app, or specific surfaces (MCP, Follow up, Weekly review)?
   Everything is free and unlocked today.
2. **What happens to existing users** who downloaded before any gate?
3. **How free is the friend code** — permanent, time-limited, how many? This decides between
   "hand out a few codes" and "build an issuing-and-validation system."
4. **Can validation be offline?** This is the pivotal one.

The structural constraints, all of them already-made decisions:

- **No Mac App Store** ⇒ no ready-made subscription billing, no Offer Codes. A subscription means
  either self-hosted billing and validation or a third-party licensing service — **and either one
  introduces a network path into an app whose entire identity is that it has none.** This is the
  central contradiction.
- **A one-time purchase with an offline signed licence is the only shape that does not conflict
  with the existing red lines** — the app can still make zero requests. It is also inherently
  unable to prevent sharing. That trade-off is the owner's to accept.
- **Windows is unsigned**, and a paid product meeting SmartScreen is a real conversion problem —
  but this was settled on 2026-08-15 with "do not ask again," so it waits for the owner to raise it.
- **There is no LICENSE file, deliberately.** Selling something eventually needs licence terms.
  Only the owner opens that.

### 15.3 Promotion

What is wanted: a few *concrete* routes — where, what to post, who reads it, roughly what it
costs — not a marketing strategy essay.

Existing material, none of which should be rebuilt: the bilingual website with its interactive
demo; the case study (a readable page plus an evidence ledger); seven real screenshots from an
isolated demo library; a demo video shot list (video deferred 2026-08-15); three sets of release
notes written in plain language.

Two binding rules: **plain language** and **real screenshots only** — no renders.

### 15.4 Future direction

What is wanted: **ambitious ideas that can still name their first step.** The explicit warning in
the backlog is that this is the item most likely to be answered with beautiful vagueness —
"ambitious" is not the same as "grandiose," and every idea should be able to answer *which file
gets touched first*, and *which red line it would need the owner to reverse*, if any.

---

## 16. Where the seams are — reading the product for future direction

This section is analysis, not decisions. It exists so a reader can reason about direction without
first re-deriving the architecture.

### 16.1 What Spool actually owns

Not "note-taking." Three things, in descending order of defensibility:

1. **The authority model.** The four-band pack header, plus enforcement at every write path
   (AI writes are labelled and cannot impersonate the user; a human summary cannot be
   overwritten; corrections are proposals). This is a position on *how mixed-provenance context
   should be handed to a model*, and it is enforced in code rather than described in a README.
2. **Zero-friction capture with zero decisions.** One keypress, no destination picker. It is
   cheap to describe and surprisingly expensive to build — the gesture, exclusivity against other
   apps' bindings, focus handling, and source detection are each platform-specific work.
3. **Determinism.** Pack and search never call a model. In a category where every competitor's
   core feature can fail, cost money, or answer differently today than yesterday, "the same bytes
   every time" is a product property, not an implementation detail.

### 16.2 The seams — places where the architecture already anticipates more

| Seam | Already exists | What it could carry |
|---|---|---|
| MCP server | 19 tools, 7 prompts, routing text proven against real clients | The AI-facing surface is where new capability costs the least — no UI, no platform work |
| Engine slot | Generalised over three CLIs, with detection, streaming, cost parsing, sandboxing | A fourth engine is a slot fill, not an architecture change |
| Workspace pack → folder | `INDEX.md` + one file per project | Any consumer that reads a directory rather than a paste |
| Attachment extraction | `extracted_text` cached per file, permissioned per file | Anything that wants document text without a new pipeline |
| `ref_kind` graph | `cites` / `supersedes` / `corrects` already stored | A real provenance graph exists in the data today and is barely surfaced |
| Overlay windows | Non-activating always-on-top window, proven twice | A floating widget is a v1.5 hook, not new groundwork |
| Tauri 2 | Compiles to iOS/Android | Mobile is a v2 hook |
| `nonce` column plan | E2EE sync sketched as a v2 hook | Sync, if privacy is preserved |

### 16.3 The tensions any ambitious plan must resolve

1. **Monetisation vs. zero egress.** The most valuable claim ("makes no network request, ever")
   is the same property that makes recurring billing awkward. Any subscription needs an answer to
   this beyond "it's just one request."
2. **Local-first vs. reach.** A local stdio server cannot be reached by cloud chat, which is where
   most people talk to AI. Today the answer is the paste, and the paste is genuinely good — but it
   caps how far MCP alone can carry the product.
3. **Single-user vs. distribution.** No accounts and no sync is a feature. It also means no
   network effects, no team seats, no viral loop. Growth must come from the artefact itself.
4. **Dogfooding vs. product-market fit.** One user, deeply served, for thirteen weeks. That is a
   legitimate v1 method and an inadequate v2 one, and it is already written down as such.
5. **No auto-update vs. shipping fast.** Every fix reaches users only if they come back and
   download it.
6. **Two platforms, two trust stories.** macOS is notarised; Windows warns. Charging money widens
   that asymmetry.

### 16.4 What the measurements already say about direction

- **AI writes are the cheapest content in the library** (5% of volume, 11× smaller blocks). The
  fear that "letting AI write will flood the library" was measured and is false. That is an
  argument for *more* AI write surface, not less.
- **Humans pasting documents is what fills a budget.** Anything that reduces the cost of large
  pasted material — extraction, scoping, the folder pack — attacks the real constraint.
- **The write path is discoverable from plain language** — an external client found it unaided
  and self-recovered from its own errors. Onboarding does not need to teach tool names.
- **Free AI tiers cannot carry the maintenance engine**, and one vanished mid-design. Any plan
  depending on somebody else's free tier should be assumed to have a fixed shelf life.

---

## 17. Document map

**Start here, in this order, depending on what you are doing:**

| If you are… | Read |
|---|---|
| Deciding what to work on | `docs/BACKLOG-2026-08-19.md` (open front) then `docs/HANDOFF-2026-08-19.md` §1 (debt) |
| About to touch code | `docs/HANDOFF-2026-08-19.md` §2 — the red-line quick reference. Every line there was once written backwards **and the tests still passed** |
| Proposing a feature | `PLAN_EN.md` §2 — constitution, rejected list, the five-question filter |
| Quoting a number publicly | `docs/CASE_STUDY_LEDGER.md` — the **only** authority for figures; append-only |
| Writing for the public | `docs/CASE_STUDY_PAGE.md` (states) + the ledger (proves) |
| Releasing | `docs/RELEASE.md` · then append a ledger row |
| Touching the database | `docs/DB_BACKUP_AND_RECOVERY.md` **first** |

**Design documents** (`docs/DESIGN_*.md`) — all shipped unless noted:

| Document | Covers |
|---|---|
| `DESIGN_AI_ENGINE.md` | The CLI engine slot; §7.8–7.9 hold the free-tier measurements |
| `DESIGN_WORKBENCH.md` | The right-hand rail, automatic maintenance, streaming progress |
| `DESIGN_CONTEXT_HYGIENE.md` | Retirement, correction, highlighting. §9 = the overload measurement; §10 = the v0.6.1 correction redesign |
| `DESIGN_FOLLOW_UP.md` | Follow-up; §8 is the list-shaped in-conversation design |
| `DESIGN_MCP_WRITE_ROLE.md` | Why AI write access exists at all, and the review queue |
| `DESIGN_MCP_INTENT_ROUTING.md` | Making the model find the door (§8.4) |
| `DESIGN_PROJECT_FILES.md` | Project-level attachments; **§9 = why file permission collapsed to one lock** |
| `DESIGN_CAPTURE_FOCUS.md` | Capture focus and typing — **required reading before touching capture** |
| `DESIGN_LIBRARY_TRANSFER.md` | Export/import (import merges) |
| `DESIGN_WORKSPACE_PACK.md` | Workspace nesting + folder pack |
| `DESIGN_WINDOWS_PORT.md` | The Windows port; unsigned is a known debt |
| `DESIGN_FIRST_DAY_VALUE.md` | The first-day value panel |
| `DESIGN_VALENTINE_EDITION.md` | Appearance + break reminder, with the study citation |
| `DESIGN_CASE_STUDY.md` | Why the public case study exists and how it is governed |

**Archive.** `docs/archive/` holds finished designs and settled investigations. Some still carry
"awaiting approval" in their headers — that is a stale title, not today's status. Do not work
from them.

**Manuals**: `RELEASE.md`, `DB_BACKUP_AND_RECOVERY.md`, `PRIVACY.md` (⚠️ three copies must change
together: the doc, `site/privacy.html`, `scripts/site-zh-privacy.html`, then rebuild the Chinese
site), `MCP_SCREENSHOT_GUIDE.md`, `DEMO_SCRIPT.md`, `WINDOWS-CHECK.md`, `MCP_LAB_PROMPT.md`.

**Not in the repository** (deliberately): `docs/ID.txt`, the Apple signing credentials. Never
commit it, never paste it into any document.

---

## 18. Glossary and recompute commands

### Glossary

| Term | Meaning |
|---|---|
| **Block** | One captured or written fragment — the atomic unit. Numbered, timed, source-labelled |
| **Thread** | The internal name for a **project**. `threads` in the schema, "project" in every user-facing surface |
| **Workspace** | The upper tier; a big topic. May nest |
| **Pack** | The assembled Markdown briefing for one project — the crown feature |
| **Capture target** | The single project a capture lands in. Exactly one globally |
| **Authority bands** | 📖 Reference / 🧩 Synthesis / 🔄 Process / 💭 Personal — how the pack tells a model to weight each fragment |
| **Pinned** | A block marked as core context; always kept in a narrowed pack |
| **Stale / retired** | A block the user marked no longer valid: out of packs, still in the library, still searchable |
| **Supersedes / corrects / cites** | The three `ref_kind` relationships between blocks |
| **Standing vs. one-off** | A follow-up line that never completes vs. one that retires when answered. An AI may never close a standing line |
| **Proposal / review queue** | Where an AI's writes wait for the user |
| **Engine slot** | The detected local CLI (`claude` / `codex` / `gemini`) Spool spawns for maintenance work |
| **Ledger** | `docs/CASE_STUDY_LEDGER.md` — append-only, the only authority for published figures |

### Recompute the figures in this document

```bash
# Scale
git rev-list --count HEAD                                    # commits
find src src-tauri/src -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.rs" \) \
  | xargs wc -l | tail -1                                    # application lines
wc -l docs/*.md | tail -1                                    # design documentation
find src scripts -name "*.test.*" | wc -l                    # test files

# Tests
npx vitest run
cargo test --manifest-path src-tauri/Cargo.toml

# i18n gaps
node scripts/i18n-check.mjs                                  # expect: (none missing)

# Schema version of a live library (read-only)
sqlite3 -readonly <spool.db> "PRAGMA user_version;"          # expect: 23

# The MCP tool surface, from the installed binary
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"probe","version":"1"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
  | /Applications/Spool.app/Contents/MacOS/spool --mcp

# Where content volume actually comes from (no content disclosed)
sqlite3 -readonly <spool.db> \
  "SELECT b.source, COUNT(*), SUM(LENGTH(b.content)), AVG(LENGTH(b.content))
     FROM blocks b GROUP BY b.source ORDER BY 3 DESC;"
```

⚠️ **Always use a probe process when verifying a newly installed binary over MCP.** Your own
existing MCP connection is still running the old binary until its client is fully quit and
reopened — a verification against it silently tests the previous version.

### A disclosure rule for anything written from this project

What may be published is **shape and count, never content**. The live library holds real
material — deadlines, personal documents. Every figure here is a number, a source label, or a
one-line description of a mechanism. If a claim cannot be stated without quoting the library, it
does not get published.
