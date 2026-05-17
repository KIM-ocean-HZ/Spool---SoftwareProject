# Spool — Implementation Blueprint v2.5

---

## 0. How to Use This Document

**This is the single source of truth for Spool. It supersedes all earlier versions.** It is both the product constitution and the build specification.

- **Claude Code**: Implement phase by phase, in the order given in §15. After completing each phase, STOP and wait for Ocean to review before starting the next. **Do not work on multiple phases in parallel. Do not pre-implement anything outside the current phase.**
- **When you hit any ambiguity, or feel tempted to add a feature**: First re-read §2 (Product Constitution) — especially §2.5 (design principles), §2.6 (rejected ideas), and §2.7 (the feature filter). Most ambiguity is resolved there. If still unresolved, STOP and ask Ocean. Do not improvise.
- **This document is written in English deliberately** — it is used directly as a prompt for Claude Code, and English yields more reliable instruction-following. All user-facing UI copy in the product itself, however, must be in Simplified Chinese (see §18, rule 11).
- **Version 2.6 (this revision)** is a post-Phase-8 design correction. Three features that survived earlier reviews but failed Ocean's dogfooding are removed: (a) the manual `next_step` per-thread note (§3.3, §9.9) — its job is naturally done by scrolling to the bottom of an append-only feed; (b) the manual `0-100` `progress` slider (§9.9) — notorious theater; replaced by the existing `active|parked|done` status (rendered as a small status dot in the sidebar); (c) the never-shipped proposal of color-coded blocks by source — superseded by source-category icons + date dividers (§9.3), both of which uphold "quiet visuals" (§9.9 spirit). This revision forces the first additive `ALTER TABLE` migration (SCHEMA_VERSION 2→3, dropping two `threads` columns) — partial credit on §19.3. **The Product Constitution (§2), the core loop (§3), the two-tier structure, the AI orchestration strategy, and Phases 9–13 are unchanged in intent.**
- **Version 2.5** was a post-Phase-7 retrospective. Phases 1–7 marked complete; double-tap ⌥ trigger and browser tab-title source detection promoted from v1.5 into v1; FTS5 trigram tokenizer documented; §18.1 rule 4 lifted; Improvement Backlog added as §19; §18 rule 13 added (no Claude/Anthropic attribution).
- **Version 2.4** was a roadmap amendment that inserted Phase 5 Capture Hardening and Phase 6 Block Workbench, and dissolved the old "File Anchors" phase into Phase 6 — see §9.6 for the reasoning.

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
19. Improvement Backlog (post-Phase 7)

---

## 2. Product Constitution

> This entire section exists to prevent scope drift. It outranks every other part of this document. Every implementation decision and every proposed feature must pass the checks here first.

### 2.1 One-Sentence Definition

**Spool is a context hub for long-running projects.** At the moment you naturally produce a fragment of information — a good answer from an AI, a decision buried in an email, a link to a document, a half-formed thought — it lets you capture that fragment effortlessly, threads fragments together under a two-tier "Workspace → Thread" structure, and can pack any thread into a paste-ready briefing on demand — so you can re-enter the project, or re-brief an AI, instantly.

**On the name**: the product is **Spool** in English and **思簿** (sī bù) in Chinese. Spool — a humble everyday object that holds a continuous thread, wound on during capture and drawn off during pack; the metaphor maps directly onto the core loop, and the thread between is always continuous. 思簿 reads as "thought-book" (思 = thought, 簿 = notebook / ledger / record-book) — pointing both at Principle 3 ("a thread is a log, not a chat" — a 簿 is exactly that, an append-only record) and at the product's origin: Ocean watched his girlfriend take notes and realized this app needed to exist. Two names, two angles — the thread, and the book that holds it — converging on the same product. **In Chinese-facing UI copy, use 思簿; in English materials, the repo, and bundle identifiers, use Spool.**

### 2.2 The North Star

**Cut the time and mental effort of "re-entering a project" from "ten minutes of archaeology" down to "a single paste."**

That "re-entering" applies equally whether the person re-entering is you tomorrow morning, or a freshly-opened AI chat that remembers nothing. Every feature in this product must ultimately serve this one thing. A feature that does not make "re-entering" faster does not belong here.

### 2.3 The Real Problem It Solves

LLMs do not remember your project. Every time you open a new conversation, you re-explain the context — and this "re-explanation tax" is a hidden cost knowledge workers pay over and over. Across multiple AIs, multiple web pages, multiple emails, spanning many days, a project's context gets shredded — and reassembling it falls entirely on the human's memory.

**Spool compresses "re-explaining" into "a single paste."**

### 2.4 Target User

Knowledge workers running several "cross-tool, cross-day" workstreams at once: researchers, developers, graduate students, solo founders. Ocean is a precise sample of this user — so during v1, do no user research. Dogfood first; validate with friends after release.

### 2.5 Six Non-Negotiable Design Principles

1. **Capture must be zero-friction.** One keypress, no decisions, instant. Any design that makes the user pause at the moment of capture is a failure.
2. **Local-first, private by default.** This software ingests sensitive content the user copies (including private information from AI conversations). Unless the user explicitly invokes an online AI feature, no data leaves the machine. Capture, packing, and search must be fully functional with zero AI and zero network.
3. **A thread is a log, not a chat.** Append-only, time-ordered, quiet. No "send," no read receipts, no real-time. It is an append-only timeline, not an instant messenger. (Editing or annotating a block you own does not violate this — "append-only" governs the sequence of blocks, not the immutability of a block's text.)
4. **Retrieval is deterministic.** The core "pack" operation is pure string assembly: instant, reliable, with AI never in the hot path. AI compression is an optional enhancement, never a dependency.
5. **AI is a librarian, not an author.** It summarizes, classifies, compresses. It never writes content for you, and never decides "what is related" for you. **AI output is always disposable decoration, never a structural element of any view — when AI is absent, every part of the product must remain fully intact.**
6. **Exactly two tiers of structure; deadlines hang on threads.** Workspace → Thread, and no deeper. No infinite nesting. Each thread may carry a deadline, aggregated in the sidebar. No separate dashboard — the sidebar is the dashboard. (Block-level properties — attachments, annotations, source — are not a third tier; they are payload on a block.)

### 2.6 Explicit Non-Goals & Rejected Ideas

> Scope drift almost always happens because someone (Ocean three months from now, or Claude Code) raises "should we add X?" and nobody remembers why X was rejected. This section is that record. **Every row below has already been discussed and rejected. Do not re-propose them. Do not "casually" implement them.**

| Rejected Idea | Why It's Tempting | Why Rejected | What We Do Instead |
|---|---|---|---|
| **Become a lightweight Notion / structured knowledge base** | Notion's market is huge | That means competing with Notion on its home turf — an unwinnable fight. Spool's moat is precisely what Notion lacks: zero-friction capture. Notion always demands you decide where things go first | Be Notion's **upstream**: capture the messy work process, pack out the essence; the user can then paste it into Notion to archive |
| **Infinite nesting (pages within pages)** | Sounds "flexible" | Nesting = the user spends time managing a directory tree instead of working. That is Notion's curse, not its blessing | Exactly two tiers: Workspace → Thread. Depth is fixed |
| **Auto-link "similar" threads across workspaces/projects** | Sounds like "AI magic" | Auto-detected "relatedness" is 90% noise; violates Principle 5 (AI doesn't judge for you); makes the product heavier and slower | Full-text search (so you can find it) + explicit @-mentions (so the user decides what to link) |
| **AI continuation / AI writing content for you** | v1 actually did this | Ocean validated it firsthand as a toy. It turns AI into an author, violating Principle 5 | AI does only summarization and classification suggestions |
| **Fully automatic capture (the system decides what's worth keeping)** | Sounds "zero-friction" | You cannot do it reliably without surveilling the user; surveilling the user is invasive. "100% automatic + 100% non-invasive" is a contradiction | A "copy-and-remember" shortcut (riding the Cmd+C muscle memory); a truly passive clipboard buffer is a v2 optional feature |
| **Real-time collaboration / sharing / comments** | Collaboration software sells well | This is a **personal thinking tool**; collaboration is a different product and would dilute the positioning | Not in v1; "sharing" is covered by the pack feature — it hands you text, you paste it wherever |
| **Cloud sync (in v1)** | Multi-device is convenient | This app holds sensitive captured content; sync done wrong is a privacy disaster | v1 is purely local; end-to-end encrypted sync is v2 |
| **Rich text editor** | Looks "polished" | Rich text = an explosion of complexity, and blocks are mostly pasted content that needs no formatting anyway | v1 uses plain text / Markdown source; rendering is deferred to v2 |
| **Kanban / calendar / table multi-views** | Notion and Things have them | Each view is a surface area to maintain forever | One sidebar doubles as the dashboard; the Focus section is the only "view." (Sorting the one linear feed by source is not a new "view" — it is the same feed reordered.) |
| **Always-on desktop floating widget** | Could give capture a stronger presence, and seed future quick-action features | In v1 it is only "nice to have," not a fix for something "unusable" (fails §2.7 question 5); and it is a whole new chunk of window management + occlusion annoyance + interaction surface | Solve v1's "presence" need with an extremely well-executed capture toast (§9.4); register the floating widget as an explicit v1.5 candidate (§17) |
| **Collapse every block to a chip by default** | Looks tidy; seems to fight "information overload" | It optimizes capture-side tidiness but taxes the North Star — on re-entry, rehydrating context now costs one click *per block*, making the exact moment we measure slower | Smart truncation: a long block shows its first ~6 lines + a "show more" toggle (§9.3). Manual, user-initiated collapse is fine; collapse-*by-default* is not |
| **Horizontal node-graph / "chain of thought" view of a thread** | Looks impressive | Visually loud (violates "quiet"); needs a layout engine + custom interaction; and linear chronological reading is already the fastest re-entry path — a graph *adds* navigation cost | Keep the linear feed. Optional sort-by-source is the only reordering. Revisit only with real demand (→ §17) |
| **Per-block AI summary** | "AI on tap" for every block | A block is already a small unit; summarizing it has low payoff, and the local-model dependency adds setup + reliability variance that fights "quiet / frictionless" | AI summarization stays at the *thread* level — the §9.11 status summary is the "catch me up" surface |
| **Manual 0–100 progress slider (rolled back in v2.6)** | Looks like a "% done" dashboard signal | Notorious theater — users either set it once and never update, or pick round numbers without thought. The slider produces a number to *maintain*, not a signal to *trust*. Linear, GitHub Issues, Things all reject continuous manual progress for the same reason; the pattern's failure is well-documented | Use `active \| parked \| done` status as the only completion signal (rendered as a status dot in the sidebar), `deadline` (data the user gives once) for urgency, and `updated_at` (system-tracked) for freshness. Nothing the user has to "remember to update" |
| **Manual `next_step` per-thread note (rolled back in v2.6)** | "Write down where you left off" sounds like the perfect re-entry aid | Negative dogfooding result. Requires past-Ocean to predict future-Ocean's needs; cognitive cost at write time, frequently stale by re-entry time. Violates the spirit of Principle 1 (zero-friction) on the *exit* side — Spool's promise is that exit needs no ceremony either | Append-only feeds naturally surface "where you left off" — the newest blocks at the bottom ARE the re-entry cue. Default behavior: scroll to bottom on thread open. If a real gap surfaces in future dogfooding, cross-session scroll memory (one column: `threads.last_scroll_block_id`) is the cheap architectural fix (§17) |
| **Color-coded blocks by source** | Sounds like instant visual sorting in long threads | Violates "visuals must stay quiet" (§9.9 spirit). `source` is free-text and user-editable — no clean mapping for "ChatGPT" vs "Gemini" vs "面试笔记". 5–10 source colors turn a long feed into a color-block collage, making review *worse*, not better. The product's whole palette is paper + ink + amber + urgent on purpose | Source-category **icons** (single mono lucide-react glyph per source family) at the head of the source badge + **date dividers** between days. Visual rhythm without color-noise palette explosion (§9.3) |

### 2.7 The Filter: Should This Feature Be Built?

For any new feature, ask these five questions in order. **If the answer to any one is "no," do not build it:**

1. Does it fit into one of the three actions — Capture, Thread, Pack? (If not → it is not a feature of this product.)
2. Does it make "re-entering a project" faster? (If not → it strays from the North Star.)
3. Does it conflict with any of the six principles in §2.5? (If it conflicts → rejected.)
4. Is it on the rejected list in §2.6? (If it is → rejected.)
5. Without it, is the product "unusable" or merely "not as good"? (If merely "not as good" → defer to Out of Scope.)

---

## 3. The Core Loop & Product Shape

### 3.1 The Core Loop: Capture → Thread → Pack

The entire product is a loop of three actions. **The first filter in §2.7 is exactly: which action does this feature serve?**

```
   ┌─────────────┐      ┌──────────────┐      ┌─────────────┐
   │   Capture   │ ───▶ │   Thread     │ ───▶ │    Pack     │
   ├─────────────┤      ├──────────────┤      ├─────────────┤
   │ Global      │      │ A timeline   │      │ One click   │
   │ shortcut.   │      │ of blocks,   │      │ assembles a │
   │ Rides the   │      │ threaded by  │      │ paste-ready │
   │ Cmd+C       │      │ project.     │      │ briefing —  │
   │ muscle      │      │ + attach-    │      │ for an AI,  │
   │ memory.     │      │   ments      │      │ or for you  │
   │ Lands in    │      │ + @-mention  │      │ to re-enter │
   │ 0 latency.  │      │ + progress   │      │ the project │
   └─────────────┘      └──────────────┘      └─────────────┘
         ▲                                           │
         └───────────────────────────────────────────┘
              Days later, return to the project, keep
              capturing — the loop continues.
```

### 3.2 Two Tiers: Workspace → Thread

The user's real work structure is two-tiered — one "big topic" with many "small projects" hanging under it. A flat thread list turns the sidebar into a junkyard, so we introduce the workspace tier.

```
Workspace   ← Big topic. e.g. "COMP3074", "AI-music grad apps", "Dissertation"
   ├── Thread   ← Small project. e.g. "Coursework 1", "NYU MARL outreach", "Lit review"
   │     └── Block   ← Information block: captured content, a handwritten draft, or an
   │                   @-reference. Any block can also carry file/folder/URL attachments.
   ├── Thread
   └── Thread
```

**Exactly two tiers, no more, no less** (Principle 6). The workspace gives you "categorization"; the thread gives you "focus." Attachments and annotations are payload on a block — not a third navigable tier.

### 3.3 The Thread Lifecycle: Active → Done

A thread has wildly different value density at different stages, so it has two shapes (full design in §11):

- **Active or Parked (status `active` / `parked`)**: The thread is a **workbench**. `active` = in progress; `parked` = consciously set aside (waiting on something, or just not now). A full timeline feed; every block is useful. Both use the `LogView`. On thread open the feed **auto-scrolls to the bottom** — the newest blocks ARE "where you left off." (The earlier manual `next_step` note was rolled back in v2.6 — §2.6.)
- **Done (status `done`)**: The thread is an **archive**. 90% of the blocks are process noise; only a few are conclusions. Completing a thread triggers a one-time "wrap-up action," and the thread switches by default to the "digest view" — showing only pinned blocks, their attachments, and an (optional) conclusion summary. The raw feed is still one click away.

This transition is the core noise-reduction mechanism, and it **requires no extra organizing from the user**: pinning is something they do during work anyway; the conclusion summary is a single optional sentence at completion time.

### 3.4 Supporting Layers

The following all hang off the "Thread" — they are supporting layers, **not pillars co-equal with the core loop**: block attachments, progress & deadline, full-text search, @-mention references, AI summaries, AI classification suggestions. The criterion is §2.7.

---

## 4. Tech Stack & Rationale

| Layer | Choice | Why |
|---|---|---|
| Desktop shell | **Tauri 2.0** | 5MB vs Electron's 100MB+, 3× faster startup. **v2 depends heavily on Tauri's global shortcuts, clipboard, system tray, multi-window, and file drag-and-drop** — exactly what the core loop needs. Also compiles to iOS, leaving a path for v2 |
| Frontend | **React 18 + TypeScript + Vite** | Ocean already knows it. TS strict mode safeguards core logic like the router and capture |
| Styling | **Tailwind CSS + CSS variables** | Design tokens centralized in CSS variables; Tailwind only does layout utilities. No UI component library |
| State | **Zustand** | A store is 30 lines. v2 has workspaces / threads / blocks / capture / search / settings / quota stores |
| Local storage | **SQLite via `tauri-plugin-sql`** | The block feed needs per-thread queries, time ordering, and full-text search. SQLite's FTS5 is the natural foundation |
| Timeline | **Native components + virtual scrolling (when >200 blocks)** | No rich text editor. Blocks are plain text, rendered as read-only cards + a bottom composer |
| HTTP | **Native `fetch` + `AbortController`** | All AI calls must be cancelable |
| System integration | **`tauri-plugin-global-shortcut` / `tauri-plugin-clipboard-manager` / `tauri-plugin-fs` / `tauri-plugin-dialog` / built-in tray + multi-window** | The lifeline of capture, attachments, file picker, and the capture overlay |
| Icons | **lucide-react** | Restrained line work |
| Fonts | **Geist + Instrument Serif** | Chinese fallback: PingFang SC / Microsoft YaHei |
| Testing | **Vitest** | Same origin as Vite. v1 does not mandate full coverage, but pure functions and core logic must be tested |

**Full dependency list (npm)**: `tailwindcss @tailwindcss/typography zustand lucide-react nanoid @tauri-apps/plugin-sql @tauri-apps/plugin-store @tauri-apps/plugin-global-shortcut @tauri-apps/plugin-clipboard-manager @tauri-apps/plugin-fs @tauri-apps/plugin-dialog` + `vitest @types/node` (dev).

**Rust crates (Cargo)** added in Phases 5–7 (all approved): `core-graphics`, `core-foundation`, `foreign-types`. Tauri feature `macos-private-api` is enabled (needed by the transparent always-on-top capture overlay).

**Do not install**: any all-in-one UI component library, Redux, state-query libraries (SWR/TanStack), rich text editors, date libraries (native `Intl` is enough). For any dependency outside this list, ask Ocean first.

> Note: the capture overlay (§9.4) is a **second Tauri window** with its own Vite entry point. This is multi-page build configuration, not a new dependency.

---

## 5. Legacy Code Disposition

> Ocean's question: should the old notes-app code be abandoned, or carried forward and modified?
>
> Answer: **Keep the product-agnostic infrastructure; delete any code that "knows it is a notes app."** Not a full wipe, and not "modify in place."

**Why not "modify the old code in place"**: The old code's component tree, hooks, and stores all grew around the "notes + AI suggestions" shape. The new product's shape is completely different. Modifying on top of the wrong shape means constantly fighting that shape — slower and more painful than a rewrite. **When in doubt, delete — rewriting a component is cheaper than fighting a misshapen abstraction.**

**Why not "delete everything"**: A few things are pure, product-agnostic infrastructure; rebuilding them is pure waste.

**This is an unreleased personal tool**: no users, no production data, no compatibility burden. So the database is dropped and recreated with zero migration; the cost of "delete" — or of a schema change — is zero.

### 5.1 Keep / Delete List

| Disposition | Content | Note |
|---|---|---|
| **Keep** | Tauri scaffold, `Cargo.toml`, `tauri.conf.json` | Base shell. tray/shortcut permissions get added later in Phase 3 |
| **Keep** | Vite / Tailwind / `tsconfig.json` config | Ensure `strict: true` is on |
| **Keep** | `src/styles/tokens.css` | Design variables reused; just add the new status colors from §13 |
| **Keep** | The entire `src/lib/ai/` directory | router / providers / cache / parseJson / quota — **the most valuable reuse for v2**; only the prompts change |
| **Keep** | The wrapper pattern of `src/lib/db/client.ts` | Keep the `Database.load` wrapper style; the schema is fully rewritten |
| **Keep** | `src/lib/utils/` (debounce / hash / time) | Generic functions |
| **Keep** | Generic atoms in `src/components/ui/` (Pill / IconButton, etc.) | Product-agnostic visual atoms |
| **Delete** | The textarea editor, AI suggestion panel, branches, ghost text | Feature code that "knows it is a notes app" |
| **Delete** | `useSuggestions` and its store, suggestion-related prompts | Same as above |
| **Delete** | The flat `notes` table, `notes.ts` CRUD, `notesStore` | The data model is entirely replaced |
| **Delete** | Any component that grew around "notes + suggestions" | Wrong shape — rebuild |
| **Drop & recreate** | The SQLite database file | No migration. Schema in §8; reinitialized on first launch |

### 5.2 How to Land It

Phase 0 is a conditional fork (see §15): **0A builds from scratch** / **0B strips the existing repo down to a "clean scaffold" state.** Both paths converge on the same starting point — a Tauri project with infrastructure installed and zero feature code. From Phase 1 on, the two paths are identical.

---

## 6. AI Orchestration Strategy

The three-tier router infrastructure from v1 is **kept** (see §5); only the AI's job changes — from "author" to "librarian" (Principle 5).

### 6.1 Three Model Tiers

| Tier | Primary Model | Speed | Free Quota |
|---|---|---|---|
| **Fast** | Groq `llama-3.3-70b-versatile` | 700+ tok/s | ~30 RPM, 14400 RPD |
| **Quality** | Google `gemini-2.5-flash` | ~150 tok/s | 1500 RPD, 1M context |
| **Local** | Ollama `qwen3:8b` | ~25 tok/s on M4 | unlimited |

### 6.2 The AI's Three Jobs in v2

| Job | Description | Primary → Fallback | When |
|---|---|---|---|
| **Thread status summary** | Compress an active thread's blocks into one ~50-character sentence: "where this project stands now" | Quality → Local | User clicks a button, on-demand |
| **Thread conclusion summary (wrap-up)** | On thread completion, generate a conclusion from pinned blocks, written into the digest view | Quality → Local | At completion time — **optional, allowed to fail, disposable** |
| **Capture classification suggestion** | After a block lands, judge which thread it most likely belongs to | Fast → Local | **After** capture, non-blocking |

Pack compression (AI tightening the briefing further) is deferred to v1.5, see §17.

### 6.3 Realistic Expectations for Local Model Quality (Important)

**Small models like Qwen3:8b can fail at summarization when the input is very long or extremely fragmented — producing meaningless filler or hallucinations.** This is a known reality that must be absorbed by the product design — it is not a bug to be fixed.

From this follows a hard rule that runs through every AI summarization feature:

> **An AI summary is always disposable decoration. Any UI that displays an AI summary must remain fully intact and degrade gracefully when the AI is absent / fails / is slow / produces low quality.** What is always shown first is the user's original information (their own words, pinned blocks, attachments); the AI summary is merely an optional convenience layered on top.

The concrete landing of this is in §11.2 (the hierarchy of the digest view) and §9.11.

### 6.4 Three Iron Rules

1. **Capture never waits for AI.** Capture is a pure local operation: read clipboard → write SQLite → show toast. AI classification happens asynchronously afterward; its failure has zero effect on capture.
2. **The core of pack and search is deterministic.** `lib/pack/assemble.ts` is a pure function; full-text search goes through SQLite FTS5. Neither calls AI nor touches the network.
3. **In privacy mode, AI exits silently.** With privacy mode on → summaries and classification go Local-only; with no local model available, those features' entry points are simply hidden, while capture, pack, and search work as normal.

### 6.5 Fallback & Quota

- Fallback triggers: HTTP 429 / 5xx / timeout (fast 5s, quality 20s, local 30s).
- `quotaStore.ts` tracks today's usage in memory; warns in settings at <10% remaining; auto-switches to the next tier at zero.
- Cache: `lib/ai/cache.ts` LRU(100), key = sha256(prompt). Thread summaries are cached until content changes (stored in `threads.summary`).

---

## 7. Repository Structure

```
spool/
├── src-tauri/
│   ├── src/
│   │   ├── main.rs              # register plugins, tray, global shortcut, windows
│   │   └── capture.rs           # capture native commands + creates/positions the overlay window
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── icons/
├── src/
│   ├── main.tsx                 # main window root
│   ├── App.tsx                  # main layout: Sidebar + ThreadView
│   ├── overlay/
│   │   ├── main.tsx             # capture overlay window root (separate Vite entry)
│   │   └── CaptureOverlay.tsx   # hosts the capture toast in its own always-on-top window
│   ├── components/
│   │   ├── Sidebar/
│   │   │   ├── index.tsx
│   │   │   ├── SidebarSummary.tsx     # top aggregate line
│   │   │   ├── FocusSection.tsx       # threads near deadline, across all workspaces
│   │   │   ├── WorkspaceGroup.tsx     # collapsible workspace group, drag-and-drop target
│   │   │   ├── ThreadListItem.tsx     # title + status dot + countdown; draggable
│   │   │   └── NewWorkspaceButton.tsx
│   │   ├── ThreadView/
│   │   │   ├── index.tsx              # picks Log / Digest view by status
│   │   │   ├── ThreadHeader.tsx       # title, status, deadline, pack, complete, view toggle
│   │   │   ├── LogView.tsx            # active/parked: full timeline
│   │   │   ├── DigestView.tsx         # done: pinned blocks + attachments + conclusion summary
│   │   │   ├── BlockFeed.tsx          # timeline, virtual scrolling
│   │   │   ├── BlockItem.tsx          # kinds text / ref; renders attachments, annotation, truncation
│   │   │   ├── BlockAttachments.tsx   # attachment chips on a block
│   │   │   ├── BlockActions.tsx       # hover actions: pin / edit / attach / annotate / copy / delete
│   │   │   ├── Composer.tsx           # bottom block composer, supports @-mention
│   │   │   └── CompleteThreadPanel.tsx # the "wrap-up" panel
│   │   ├── Capture/
│   │   │   ├── CaptureToast.tsx       # the toast UI (mounted inside the overlay window)
│   │   │   └── RouteSuggestion.tsx    # AI classification suggestion bubble
│   │   ├── Pack/
│   │   │   └── PackDialog.tsx         # pack preview + copy
│   │   ├── Search/
│   │   │   ├── SearchOverlay.tsx      # global search overlay
│   │   │   └── SearchResultItem.tsx   # hit line + one line of context above and below
│   │   ├── Settings/
│   │   │   ├── index.tsx
│   │   │   ├── ShortcutConfig.tsx
│   │   │   ├── ApiKeyInput.tsx
│   │   │   ├── QuotaDisplay.tsx
│   │   │   └── PrivacyToggle.tsx
│   │   └── ui/
│   │       ├── Pill.tsx
│   │       ├── IconButton.tsx
│   │       ├── StatusDot.tsx
│   │       └── CountdownBadge.tsx
│   ├── lib/
│   │   ├── capture/
│   │   │   ├── shortcut.ts
│   │   │   ├── clipboard.ts
│   │   │   └── ingest.ts
│   │   ├── pack/
│   │   │   ├── assemble.ts            # pure function: thread + blocks → Markdown
│   │   │   └── templates.ts
│   │   ├── search/
│   │   │   └── query.ts               # FTS5 query wrapper; returns hit line + context
│   │   ├── ai/
│   │   │   ├── router.ts
│   │   │   ├── providers/{groq,gemini,ollama,types}.ts
│   │   │   ├── prompts/{summarizeStatus,summarizeDigest,route}.ts
│   │   │   ├── cache.ts
│   │   │   └── parseJson.ts
│   │   ├── db/
│   │   │   ├── schema.sql
│   │   │   ├── client.ts
│   │   │   ├── workspaces.ts
│   │   │   ├── threads.ts
│   │   │   ├── blocks.ts
│   │   │   └── attachments.ts
│   │   └── utils/{debounce,hash,time}.ts
│   ├── hooks/
│   │   ├── useWorkspaces.ts
│   │   ├── useThreads.ts
│   │   ├── useBlocks.ts
│   │   ├── useCapture.ts
│   │   ├── useSearch.ts
│   │   └── useCountdown.ts
│   ├── stores/
│   │   ├── workspacesStore.ts
│   │   ├── threadsStore.ts
│   │   ├── blocksStore.ts
│   │   ├── captureStore.ts
│   │   ├── searchStore.ts
│   │   ├── settingsStore.ts
│   │   └── quotaStore.ts
│   └── styles/{tokens,global}.css
├── index.html                         # main window entry
├── overlay.html                       # capture overlay window entry
├── package.json
├── tsconfig.json                      # strict: true
├── tailwind.config.js
├── vite.config.ts                     # multi-page: index.html + overlay.html
├── PLAN.md
└── README.md
```

---

## 8. Data Model (three tiers)

### 8.1 SQLite Schema (src/lib/db/schema.sql)

```sql
-- Workspace: big topic. The thinnest tier — just a grouping container.
CREATE TABLE IF NOT EXISTS workspaces (
  id          TEXT PRIMARY KEY,            -- nanoid
  title       TEXT NOT NULL DEFAULT '',
  sort_order  INTEGER NOT NULL DEFAULT 0,  -- manual sidebar ordering
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  deleted_at  INTEGER
);

-- Thread: small project.
-- v2.6 rollback: dropped `progress` (manual % theater) and `next_step` (manual note that
-- failed dogfooding) — see §2.6. Schema migrates via ALTER TABLE DROP COLUMN (SQLite 3.35+).
CREATE TABLE IF NOT EXISTS threads (
  id                 TEXT PRIMARY KEY,
  workspace_id       TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  title              TEXT NOT NULL DEFAULT '',
  summary            TEXT,                        -- active-stage AI status summary (optional)
  digest             TEXT,                        -- conclusion summary at completion (optional, may be empty)
  deadline           INTEGER,                     -- optional, ms epoch
  status             TEXT NOT NULL DEFAULT 'active', -- active | parked | done
  is_capture_target  INTEGER NOT NULL DEFAULT 0,  -- exactly one row globally may be 1
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL,
  completed_at       INTEGER,                     -- time status became done
  deleted_at         INTEGER
);

CREATE INDEX IF NOT EXISTS idx_threads_workspace
  ON threads(workspace_id, updated_at DESC) WHERE deleted_at IS NULL;

-- Block: a captured fragment, a handwritten draft, or an @-reference.
-- There is no "anchor" kind — a file becomes an attachment on a block (see §9.6).
CREATE TABLE IF NOT EXISTS blocks (
  id            TEXT PRIMARY KEY,
  thread_id     TEXT NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
  kind          TEXT NOT NULL DEFAULT 'text',  -- text | ref
  content       TEXT NOT NULL DEFAULT '',       -- the block's main text (captured or written) / ref display name
  annotation    TEXT,                           -- the user's own note about this block (optional)
  ref_thread_id TEXT,                           -- kind=ref: the thread pointed to
  source        TEXT,                           -- provenance label; auto-filled at capture, user-editable
  pinned        INTEGER NOT NULL DEFAULT 0,      -- marked as core context
  created_at    INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_blocks_thread
  ON blocks(thread_id, created_at ASC);

-- Attachment: a file, folder, or URL linked to a block. Replaces the old kind=anchor block.
CREATE TABLE IF NOT EXISTS attachments (
  id         TEXT PRIMARY KEY,
  block_id   TEXT NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
  kind       TEXT NOT NULL,                   -- file | folder | url
  target     TEXT NOT NULL,                   -- absolute path (file/folder) or the URL
  label      TEXT NOT NULL DEFAULT '',        -- display name; defaults to basename / domain
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_attachments_block
  ON attachments(block_id, created_at ASC);

-- Full-text search over block text AND the user's annotations (enabled in v1).
-- IMPORTANT: tokenize='trigram' is required for Chinese (and any non-whitespace-delimited
-- script). The default unicode61 tokenizer cannot index continuous Han text. Trigger this
-- with SCHEMA_VERSION 2 (decided in Phase 7).
CREATE VIRTUAL TABLE IF NOT EXISTS blocks_fts USING fts5(
  content, annotation, content=blocks, content_rowid=rowid, tokenize='trigram'
);
-- Companion triggers: keep both FTS columns in sync on blocks insert/update/delete.
```

**First-launch initialization**: Create a workspace "Inbox" containing one thread "Unsorted," with `is_capture_target = 1`. Both are undeletable — they are the default destination for captures.

**Capture-target uniqueness**: `threads.ts`'s `setCaptureTarget(id)` uses a transaction to zero all rows first, then set one.

**Schema version & migration policy.** `SCHEMA_VERSION` is held in `client.ts` and currently equals `3` (bumped in v2.6 to drop `threads.progress` and `threads.next_step`).

- For v0 → current: run `schema.sql` fresh.
- For v1 → v2: the trigram tokenizer change (still a DROP+recreate of the `blocks_fts` virtual table only; user data untouched).
- For v2 → v3: **additive migration**, the first true ALTER TABLE in this project's history:
  ```sql
  ALTER TABLE threads DROP COLUMN progress;
  ALTER TABLE threads DROP COLUMN next_step;
  PRAGMA user_version = 3;
  ```
  SQLite 3.35+ supports `ALTER TABLE ... DROP COLUMN`; Tauri's `plugin-sql` ships a modern SQLite, so this is portable.

§19.3 is partially closed by this migration — the pattern is proven; a fuller migration framework (named scripts, transaction-wrapped, dry-run preview) is still TBD before any real preview release.

**Note on `blocks.source` semantics.** The column stays TEXT, but as of Phase 6 Round 2 the auto-filled value is **the browser's active-tab title** for Safari / Chrome / Edge / Brave / Arc, and the **foreground app name** for everything else. Either way the user can edit it freely (§9.3). See §10.5 for the permission model.

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
  summary: string | null;     // active-stage status summary
  digest: string | null;      // conclusion summary at completion; may be empty
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
  annotation: string | null;   // the user's own note about this block
  refThreadId: string | null;  // kind=ref
  source: string | null;       // provenance label, editable
  pinned: boolean;
  createdAt: number;
}

// src/lib/db/attachments.ts
export type AttachmentKind = 'file' | 'folder' | 'url';

export interface Attachment {
  id: string;
  blockId: string;
  kind: AttachmentKind;
  target: string;              // absolute path or URL
  label: string;               // display name
  createdAt: number;
}
```

### 8.3 Auto-Save

A block is written to the database the moment it is created (capture, composer, file/URL drop, @-mention, attachment — all persist immediately). Workspace and thread metadata edits, block text edits, and annotations are written via a 200ms debounce-merge.

---

## 9. Feature Specifications

### 9.1 Workspace CRUD

| Operation | Trigger | Behavior |
|---|---|---|
| Create | "+ Workspace" at sidebar bottom | Create an empty workspace, focus the title input |
| Rename | Double-click the workspace title | Inline edit, debounced write |
| Reorder | Drag the workspace group | Update `sort_order` |
| Collapse/expand | Click the arrow left of the workspace title | Pure frontend state, not persisted |
| Delete | Workspace right-click menu, with confirmation | Soft-delete, cascade soft-delete all threads under it; Inbox is undeletable |

### 9.2 Thread CRUD

| Operation | Trigger | Behavior |
|---|---|---|
| Create | "+" within a workspace group / Cmd+N (in the current workspace) | Create an empty thread, focus the title |
| Select | Click a sidebar thread item | Load the block feed |
| Move to another workspace | Drag the thread item in the sidebar / right-click menu | Update `workspace_id` |
| Edit metadata | Header controls | Title, status, deadline — debounced write |
| Set as capture target | Header pin / tray menu | Transactionally toggle `is_capture_target` |
| Complete | Header "Complete project" button | See §9.8 |
| Delete | Header menu, with confirmation | Soft-delete; the Inbox's "Unsorted" is undeletable |

### 9.3 Thread View (Active / Parked: LogView)

- Shape: a vertical timeline, oldest to newest. **A read-only card stream + a bottom composer.** It is not a chat — no "send" animation, no left/right bubbles.
- **On open: auto-scroll to the bottom.** The newest blocks ARE "where you left off" (§3.3). The user never has to remember a manual location.
- `BlockItem`, two kinds:
  - `text`: the block's content (plain text / Markdown source, not rendered in v1), a timestamp, an **editable source badge** (if any), an optional **annotation** (the user's own note, rendered visually distinct from the captured content), and zero or more **attachment chips** (§9.6).
  - `ref`: a reference icon + the referenced thread's title; click to navigate there.
  - A pinned block has an amber vertical bar on its left.
- **Source-category icon on the source badge** (new in v2.6 — what we do instead of color-coding, §2.6). A single mono lucide-react glyph at the head of the source badge, chosen from a small lookup table by source-string match. Initial mapping (extend opportunistically as new sources show up in dogfooding):
  - Browsers (Safari / Chrome / Edge / Brave / Arc, or sources that look like URLs / page titles) → `Globe`
  - AI tools (ChatGPT / Gemini / Claude / Copilot / "AI助手" / etc.) → `Sparkles`
  - Files & PDFs (Preview / Word / PDF apps / typeset readers) → `FileText`
  - Code editors (VS Code / Xcode / JetBrains) → `Code2`
  - Mail / messaging (Mail / WeChat / Slack / Messages / Discord) → `MessageSquare`
  - Terminal / shell → `Terminal`
  - Unknown / no match → a small filled dot (`Circle` 4px, muted)
  Mapping is **case-insensitive contains-match** on a small in-memory list. No colors — visual rhythm comes from shape, not hue.
- **Date dividers between days.** When the next block's `created_at` falls on a different calendar day from the previous, render a thin horizontal divider with the date in small monospace type ("5月17日" / "5月17日 周六"). 1px `var(--line)`, label centered, no background fill. This is the dominant scanning aid for long threads.
- **Smart truncation**: a `text` block whose content exceeds ~6 lines is truncated, with a "show more / show less" toggle. (Collapsing every block to a chip by default is rejected — §2.6.)
- **Hover actions** (`BlockActions`, revealed on hover — no always-on side panel, which would violate "quiet"):
  - 📌 pin
  - ✎ edit — the block's content becomes editable inline; blur/Esc saves
  - 📎 attach — attach a file/folder/URL to this block (§9.6)
  - ✑ annotate — add/edit the block's annotation
  - copy
  - delete
- `Composer`: a persistent input at the bottom; Enter appends a `text` block, Shift+Enter for a newline. Typing `@` triggers mention (see §9.7).
- **Feed sort**: by default chronological (oldest to newest). A "by source" toggle reorders the same linear feed grouped by `source`, with sourceless blocks at the end. **This is a reordering of the one feed, not a new view** — growing it into grouping headers, filters, or a separate pane would be a new view and is rejected under §2.6 (§19.10). In source-sort mode the date dividers are hidden (they're meaningless when blocks aren't time-ordered) — the source icon does the work instead.
- Virtual scrolling: enabled when blocks > 200.

### 9.4 Global Shortcut Capture (Core — full design in §10)

- Two capture triggers ship in v1, both hardcoded for now (configuration UI is §19.1, scheduled for Phase 8 or pulled-forward from Phase 12):
  - **Primary**: **double-tap ⌥ (Option) within 500ms** — implemented via a macOS CGEventTap on `FlagsChanged` events, using hardware event timestamps (not callback wall-clock) so heavy foreground apps cannot perturb interval measurement. Decoupled from any copy command, so it never collides with `⌘C` semantics.
  - **Fallback**: `Cmd/Ctrl+Shift+C` — the OS-level global shortcut. Always active. If the CGEventTap fails to install, the user can still capture via this shortcut.
- Trigger flow: read clipboard text → get foreground app name + browser tab title (→ the block's `source`) → write one `text` block to the current capture-target thread → show the capture toast.
- Clipboard empty / non-text: a gentle toast "Nothing to capture," nothing written.

#### CaptureToast Must Deliver "100% Confidence" — and It Lives in Its Own Window

> This is a key item, hardened in v2.4. Because the product removed the interactivity of AI continuation, the user's single most frequent operation is capture. If that action lacks reassurance, the user will be tempted to switch back to the main window to confirm — which destroys "zero-friction." The toast must give the user **100% confirmation right on their current screen** (e.g. still in the browser), without switching windows.

**The toast is rendered in a dedicated overlay window** — a second Tauri window: small, borderless, transparent, always-on-top, and **non-activating** (its appearance must NOT steal keyboard focus from whatever app the user is in). This is what lets the confirmation appear over a browser / an AI chat / a PDF even when the main Spool window is hidden. The overlay's frontend is a separate Vite entry (`overlay.html` → `src/overlay/main.tsx` → `CaptureOverlay.tsx`), and it has its own SQLite access (so its Redirect action can list threads).

`CaptureToast` spec (positioned bottom-right of the active screen, auto-dismiss ~2.5s, **paused while the pointer is over it** so the actions are usable):

- **Content preview**: the first ~12 characters of the just-captured content (leading/trailing whitespace and newlines stripped), so the user recognizes at a glance "yes, that's the thing I just copied." Ellipsize overflow.
- **Attribution**: clearly show `Saved to 「<Workspace> / <Thread>」` — two-tier attribution, because with a workspace structure, naming only the thread is not enough.
- **Three inline actions**:
  - **Undo**: delete the block just written.
  - **Redirect**: a dropdown to pick another thread (the list grouped by workspace).
  - **Save as new thread**: turn this capture into the first block of a new thread (created under the "Inbox" workspace, prompting the user to fill in a title). **This is the zero-cost entry point for Ocean's flow of "a brand-new piece of work → open a new thread directly."**
- While the toast is visible, the capture classification suggestion runs asynchronously in the background (§9.11).
- Appearing must not steal foreground focus; *clicking* an action in the toast is a deliberate act and may focus the overlay.

### 9.5 Context Packer (the crown feature)

A "Pack context" button on the thread header (Cmd+Shift+P).

- **The core assembly is the pure function `assemble.ts` — it calls no AI and touches no network.**
- The Markdown template in `templates.ts`:
  ```
  # Project: <title>
  Context as of <date>, <N> entries total.

  ## Key Information
  - <pinned block content>

  ## Full Record
  [<time>] <block content>
  [<time> · from <source>] <block content>
      note: <annotation>
      attached: <attachment label>
  → Referenced thread: <referenced thread title>

  ## Related Files & Links
  - <attachment label> — <target>
  ```
- `PackDialog` shows the assembled full text (scrollable) + a "Copy to clipboard" button + a toast.
- v1 scope: pack "everything." A range selector ("pinned only / last N days only") is v1.5.

### 9.6 Block Attachments — File / Folder / URL (replaces "file anchors")

> **A design decision Ocean asked us to make.** The original roadmap had a separate "file anchor" block kind, and idea #8 proposed "attach files to a block." These are the same need wearing two hats — *put a concrete artifact next to the thinking it belongs to*. Shipping both would mean two mechanisms for one job, which taxes the user and fails the §2.7 filter. So they are **unified**: there is no `anchor` block kind. Instead, **any block can carry zero or more attachments** (a file, a folder, or a URL).

How it behaves:

- **Drag a file/folder onto an existing block** → it attaches to that block. The artifact now lives next to the thought it relates to — which is faster re-entry than a file floating separately.
- **Drag a file/folder into empty timeline space** → a new `text` block is created (its `content` defaults to the filename) carrying that one attachment. *This is exactly what a "file anchor" used to be* — it is just the degenerate case of "a block whose payload is the attachment."
- **A URL** (dragged in, or added via the 📎 hover action) behaves the same way.
- An attachment renders as a small chip on its block (an icon by `kind` + the `label`). Click → open the file/folder with the system default app / Finder, or the URL in the browser. Missing target → a toast notice, no crash.
- An attachment is a **property of a block**, not a new structural tier — Principle 6 (exactly two tiers) is intact. An attachment is payload on a block, like `pinned` or `source`.
- v1 does not read file contents or preview them. An attachment is a clickable pointer (the original "anchor" promise).

In the pack output (§9.5), a block's attachments are listed inline beneath it, and every attachment in the thread is also collected into a "Related Files & Links" section.

### 9.7 @-Mention References (the only mechanism for in-workspace linking)

> This is the "what we do instead" corresponding to "no auto-linking" in §2.6. **Explicit, lightweight, user-driven.**

- Typing `@` in the composer → pops up a list of other threads **within the same workspace** (fuzzy title match).
- On selection, append a `kind=ref` block; `ref_thread_id` points to the referenced thread, `content` stores a snapshot of the referenced thread's title.
- A `ref` block renders in the feed as a clickable link; clicking navigates to the referenced thread.
- **Only threads within the same workspace can be referenced** — cross-workspace association is not solved by @-mention; it is solved by full-text search (§9.10).
- v1 supports referencing a whole thread only; referencing a specific block is v1.5.

### 9.8 Thread Completion & the Digest View (full design in §11)

- A "Complete project" button on `ThreadHeader` → opens `CompleteThreadPanel`:
  - Copy: "This project is done. Add a conclusion?"
  - An input field for the user to handwrite a one-line conclusion; plus a "Let AI summarize" button (generates from pinned blocks via the conclusion summary in §6.2).
  - **The handwritten conclusion is the primary path; the AI summary is an optional convenience.** The user can complete without writing anything — `digest` is allowed to be empty.
  - On confirm: `status = done`, `completed_at = now`, `digest` written (possibly empty).
- A `done` thread shows `DigestView` by default; `active/parked` threads have only `LogView`. `ThreadHeader` has a view toggle; a `done` thread can flip back to `LogView` to see the full process with one click.

### 9.9 Deadline, Status & Sidebar Structure

- Each thread optionally sets: `deadline` (date picker) and `status` (`active` / `parked` / `done`). **No manual progress slider** (rolled back in v2.6 — §2.6). **No `next_step` field** (rolled back in v2.6 — §2.6).
- `ThreadHeader` carries: title (inline edit), status toggle, deadline picker, the "Pack context" button (§9.5), the "Complete project" button (§9.8), and the LogView/DigestView toggle (only meaningful for `done` threads).
- The sidebar, top to bottom, has three sections:
  1. **`SidebarSummary`**: a one-line aggregate "X active · Y due this week · Z parked." This is the presentation of "global state."
  2. **`FocusSection`**: **across all workspaces**, all threads with a deadline and not done, sorted ascending by countdown, showing ~5 at most. Threads <48h from deadline are marked red, overdue ones dark red. It answers "what is on fire."
  3. **The workspace tree**: a list of `WorkspaceGroup`s, each collapsible. Thread ordering within a group: active/parked on top (those with a deadline sorted by urgency, the rest by `updated_at`), done threads at the bottom and dimmed. It answers "where is everything." Threads can be dragged between groups (§9.2).
- Right side of `ThreadListItem`: a small **`StatusDot`** (4px filled circle: `--status-active` moss green / `--status-parked` ochre / `--status-done` gray) + a `CountdownBadge` ("3 days left" / "due today" / "2 days overdue") if there's a deadline. The dot replaces the v2.5 `ProgressRing`.
- **Why no progress visualization at all**: continuous progress is theater (§2.6). Discrete status + deadline countdown carry the signal you can actually trust. `updated_at` ordering carries "what's recently active." Nothing in this sidebar requires the user to maintain a field.
- **The sidebar has hierarchy, but its visuals must stay quiet**: handle levels with collapsing, indentation, and dimming — not with a pile of colors and borders.

### 9.10 Full-Text Search (how "no information lost across projects" is delivered)

> This is the other half of "what we do instead" for "no auto-linking" in §2.6. **A finished project, 90% of the time, is not for "browsing" — it is for "looking something up."** Since search replaces "organizing" as the core means of retrieval, how search results are displayed is what makes or breaks the experience.

- Global shortcut `Cmd/Ctrl+Shift+F`, or the sidebar search icon → opens the `SearchOverlay` overlay.
- Goes through SQLite FTS5 (`lib/search/query.ts`), searching the `content` and `annotation` of blocks. **Purely local, no AI.**
- **Tokenizer**: `trigram` (see §8.1). For Chinese, trigram needs the query to be **≥3 characters** — queries of 1 or 2 characters fall back to a `LIKE` scan over the same columns. The fallback is slower but stays correct on short CJK queries. The router lives inside `query.ts`; callers do not pick the path.
- Result ranking: bm25 on the FTS5 path; insertion order on the LIKE path.
- **Search results must carry context — never just an isolated hit snippet**: many fragments (a snippet of code, a single term) are meaningless on their own; the user must see the surrounding content to judge whether this is the thread they want. `SearchResultItem` shows:
  - **The hit line plus one line above and one line below** (three lines total), with the keyword highlighted. If the block content is shorter than three lines, show the entire block.
  - The owning thread's title, the owning workspace's title, the time.
- Click a result → navigate to the corresponding thread and scroll to that block; the block briefly highlights.
- This lets any "dead" thread be found precisely when the user needs it, then "revived" into useful context via @-mention or pack.

### 9.11 AI Summaries & Classification Suggestions

Two **optional, non-blocking** features; entry points hidden silently in privacy mode or with no model. **All AI summaries obey the hard rule in §6.3: disposable decoration; degrade silently on failure/slowness/low quality; never leave the user waiting.**

- **Thread status summary**: a "Summarize current status" button on an active thread's header → `router.quality` → ~50 characters written into `threads.summary` and displayed. After a new block is added, mark it "may be stale." On generation failure → silently not shown, no error popup.
- **Thread conclusion summary**: see §9.8, optional at completion. On failure or slowness → silently hide that section; the user's handwritten conclusion and the pinned blocks display as normal.
- **Capture classification suggestion**: after a block lands in the Inbox, a background `router.fast` judges which thread it most resembles. Only at high/medium confidence does a `RouteSuggestion` bubble appear in the `CaptureToast` (or at the top of the Inbox next time the app is opened): "This looks like it belongs to 「<Thread>」 — move it?" The user clicks to move, or ignores to leave it. **Never moves automatically.**

### 9.12 Settings Panel

A modal, entered via the gear at the sidebar bottom.

| Field | Type | Default | Note |
|---|---|---|---|
| Global capture shortcut | Shortcut recorder | `Cmd/Ctrl+Shift+C` | Real-time conflict check |
| Global search shortcut | Shortcut recorder | `Cmd/Ctrl+Shift+F` | Real-time conflict check |
| Groq API Key | Password field + test | empty | console.groq.com |
| Gemini API Key | Password field + test | empty | aistudio.google.com |
| Ollama Endpoint | Text field | `http://localhost:11434` | |
| Ollama Model | Dropdown | `qwen3:8b` | Auto-detected via `/api/tags` |
| Privacy mode | toggle | off | All AI goes Local-only; AI entry points hidden when no local model |
| Today's quota | Read-only progress bars | — | Read from quotaStore |
| Launch at login | toggle | off | Capture should always be available; recommend on |
| Clear all data | Danger button | — | With confirmation |

API keys are persisted via `tauri-plugin-store` (switch to secure-store / Keychain in v1.5).

---

## 10. Design Problem I: Frictionless Capture

Ocean's core demand: **let the user's habitual action be captured by the software, rather than adding a new burden.**

### 10.1 The Friction Spectrum

| Approach | Friction | Problem |
|---|---|---|
| Fully manual (open app → find thread → paste) | High | Already rejected |
| Explicit shortcut (select → Cmd+Shift+C) | Low | Still a "conscious" action |
| Passive clipboard monitoring | Minimal | Catches passwords, verification codes, junk; psychologically "being watched" |
| Fully automatic linking | Zero | Does not exist (see §2.6) |

**"100% automatic + 100% non-invasive" is a contradiction.** The job of design is to approximate "habit" as closely as possible while leaving control with the user.

### 10.2 The v1 Solution: Design the Shortcut as "Copy and Remember"

The key insight: when a person uses an LLM / looks something up / reads email, **they already press Cmd+C on valuable content.** If the capture shortcut simply is "copy, but also remember it," it rides existing muscle memory.

The mental model for the user is one sentence: **Cmd+Shift+C = "copy and remember." The same action as copying, except it lands in your project thread.**

Paired with three "zero-decision" mechanisms:
- **There is always a capture target.** The tray menu always shows the current target and can switch it with one click. Capture picks no destination — it goes straight to the current target; when unsure, the Inbox.
- **Classification is after-the-fact and non-blocking.** Capture lands instantly; the AI classification suggestion appears in the toast or next time the app opens. The user never pauses over "where does this go."
- **"Save as new thread" covers the "brand-new work" startup scenario** (§9.4).

### 10.3 Capture's Sense of Confirmation Is Part of "Zero-Friction"

Zero-friction is not only "the press is fast" — it also includes "the moment after the press, you feel safe." If the user has to switch back to the main window every time to confirm a capture succeeded, then "zero-friction" is a lie. So the `CaptureToast` — its content preview, its two-tier attribution, and crucially the fact that it renders in a **dedicated always-on-top overlay window** (§9.4) — is not a nice-to-have. It is a necessary component of the core promise of "frictionless capture": it keeps the sense of confirmation on the user's current screen, over whatever app they are in, with the main Spool window never needing to come forward.

### 10.4 An Engineering Detail: Should the Shortcut Simulate Copy First?

- **A. Assume the user already copied**: the shortcut only reads the clipboard. Simple and reliable; requires the habit of "Cmd+C first, then Cmd+Shift+C."
- **B. The shortcut simulates Cmd+C first, then reads**: the user only needs to select + press once. Smoother, but involves macOS accessibility permissions and a timing race.

**v1 adopts A**, prioritizing reliability. B is deferred to v1.5 as a settings option, "auto-copy selection on capture," off by default.

**Update for v2.5**: a double-tap-of-a-modifier trigger is now **in v1**, using **⌥ (Option)** — not ⌘. The rationale for picking ⌥ over ⌘:

- ⌘+letter double-tap entangles with OS copy/cut/paste semantics on heavy-handed apps (especially Word). When the OS is busy dispatching a `⌘C`, the second-tap callback can arrive >500ms after the first, breaking interval detection.
- ⌥ alone, by contrast, is rarely a primary modifier command — `FlagsChanged` events for ⌥-only press/release are clean.
- Interval measurement uses **CGEvent hardware timestamps**, not callback time, so a busy main thread cannot break the window.

Known trade-off: any two ⌥-involving actions within 500ms (e.g. two successive ⌥-clicks) can in principle trigger one capture. In practice this is rare; the shortcut is still **user-configurable in roadmap** (§19.1) so a user who hits this can switch back to `⌘⇧C` once settings UI ships.

Note on **shortcut configurability**: v2.4 said the shortcut "is fully user-configurable (§9.12), which already addresses the cumbersome-default complaint." That is **aspirational, not shipped** — both triggers are currently hardcoded. §19.1 elevates the shortcut-recorder UI from Phase 12 to "before Phase 9" so this gap closes.

### 10.5 Source Auto-Detection and Source URLs

A global shortcut reading the clipboard **cannot obtain the source URL**. That remains a v1.5 enhancement (a browser extension or per-browser AppleScript for the actual URL).

**What v1 *does* auto-fill into `blocks.source`** (pulled forward from v1.5 in Phase 6 Round 2):

- For **Safari, Chrome, Edge, Brave, and Arc**, the active **tab title** (e.g. "Stack Overflow — How to use FTS5 trigram"), obtained via per-browser AppleScript with a 2.2-second osascript budget.
- For every other foreground app, the **app name** (e.g. "Visual Studio Code", "Preview").
- If the per-browser AppleScript fails (denied automation permission, browser quit between the keypress and the AppleScript, timeout), v1 silently falls back to the app name. No error popup.

**Permission model**: on first capture from each supported browser, macOS prompts the user once for "Spool wants to control [Browser]." Denying it is fine — the user just gets the app name in `source`, and `source` is freely editable inline anyway (§9.3, §15 Phase 5).

True URL capture (the URL itself, not just the title) remains v1.5. So does a settings surface that shows per-browser permission status (§19.7).

### 10.6 Further Approaches for v1.5 / v2

- **Desktop floating widget (v1.5 candidate)**: a small, always-on-desktop floating window giving capture a stronger presence and potentially hosting future quick-action entry points. It is distinct from the **capture overlay window** (§9.4): the overlay is *transient* (appears for ~2.5s after a capture, then gone), the floating widget is *always-on*. The reason the widget is not in v1 is in §2.6 — v1 solves the sense of confirmation with the overlay toast. Note: building the overlay window already establishes the multi-window + non-activating-window groundwork, which makes the v1.5 floating widget cheaper.
- **Passive clipboard buffer (v2)**: the app keeps the last ~20 clipboard entries in memory (transient — **never persisted to the database before the user "keeps" one**), visible in a tray dropdown; the user glances over and "keeps" the worthwhile ones into a thread. It needs a review interface and a clearly-articulated privacy model, so it is v2.

---

## 11. Design Problem II: Browsing a Finished Project

Ocean's worry: "The project info is all there, but it feels noisy." This is not too much information — it is a **shape mismatch**: using "the shape of a workbench" to carry "the need of an archive."

### 11.1 A Thread Has Different Value Density at Two Stages

- **Active stage**: the thread is a workbench. Every block is useful, because you are using them right now. Noise does not exist.
- **After completion**: the thread is an archive. 90% of the blocks are process noise (trial and error, intermediate Q&A, abandoned ideas); only 10% are conclusions.

### 11.2 The Solution: The `done` Status Unlocks a "Digest View," With a Strict Hierarchy

On thread completion (the wrap-up action in §9.8), the thread goes from one view to two:

- **Process view (LogView)**: the full timeline feed. Always preserved, always one click away for archaeology.
- **Digest view (DigestView)**: shown by default for a `done` thread. Its content is organized **strictly by the priority hierarchy below** — this ordering is the direct landing of the hard rule in §6.3:

  > **1. User-pinned blocks, with their attachments (highest — always shown)**
  > **2. Every attachment in the thread, collected into one "Files & Links" section (always shown)**
  > **3. AI conclusion summary (lowest — may be absent)**

  - Pinned blocks and attachments are the **structural elements** of the digest view — they come directly from the user's original information, are always present, and depend on no AI. The aggregated Files & Links section answers "where are the deliverables" on re-entry.
  - The AI conclusion summary (`digest`) is **decoration** — it gives a one-line overview at the top of the view, but **if the digest is empty (the user neither wrote one nor generated one), or generation failed, or it is still generating, that section is simply hidden silently**, and the digest view remains fully usable on pinned blocks + attachments.
  - Both the user's handwritten conclusion and the AI-generated one live in the `digest` field, but **the user's handwritten one takes priority**: in `CompleteThreadPanel`, the handwrite field is the primary path and the AI button is an optional convenience.

### 11.3 Why This Design Holds

**It requires no extra organizing from the user.** Pinning is something they do during work anyway; the conclusion summary is a single optional sentence at completion (and they can skip it). The user pays no "organizing cost" but receives the "organized result" — which is exactly "simple and practical."

**It is immune to the unreliability of local small models.** Because the AI summary is mere decoration and may be absent, even if Qwen3:8b fails at summarizing some thread, all the user loses is "that one line at the top" — not the entire digest view, which is held up by the user's own pinned blocks and attachments.

### 11.4 What "Browsing" Really Decomposes Into

For a finished project, the real need is not "browsing" — it is three things:
1. **Findable** → full-text search (§9.10), with results carrying context
2. **Understandable** → the digest view (this section), strict hierarchy, AI may be absent
3. **Usable** → the packer (§9.5) + @-mention (§9.7)

No fancy notes browser is needed. These three together let a dead thread be "revived" into useful context when needed.

---

## 12. Prompt Library

Each prompt is its own file. All prompts: open with a role, use markdown sections, keep output format strict, state forbidden behavior with explicit "never" wording, use concrete examples over abstract description. **Do not pile on few-shot examples** (they slow things down) — rely on precise rules.

### 12.1 Thread Status Summary (src/lib/ai/prompts/summarizeStatus.ts)

```typescript
export const buildStatusPrompt = (thread: Thread, blocks: Block[]) => `
你是一个项目状态摘要工具。读下面这条项目脉络里按时间排列的信息块,写一句话总结"这个项目现在到哪一步了"。

# 项目标题
${thread.title || '(无标题)'}

# 信息块(按时间从旧到新)
${blocks.map(b => `[${formatTime(b.createdAt)}] ${b.content}`).join('\n')}

# 规则
1. 只输出一句话,不超过 50 字
2. 聚焦"当前状态 / 下一步",不要复述全部历史
3. 绝对不要添加信息块里没有的内容
4. 不要前言、解释、markdown 标记——直接输出那句话
`.trim();
```

### 12.2 Thread Conclusion Summary (src/lib/ai/prompts/summarizeDigest.ts)

```typescript
export const buildDigestPrompt = (thread: Thread, pinnedBlocks: Block[]) => `
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

> Note rule 4: it gives the small model an explicit "give-up exit." When the frontend receives `NO_DIGEST`, treat it as a generation failure — silently hide the digest section (see §11.2). This is better than forcing a small model to squeeze meaningless filler out of fragmentary content.

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

> Note: the prompt **bodies are intentionally in Chinese** — the product's content and users are Chinese, and the prompts are core product IP. Keep them in Chinese exactly as written. Only the surrounding TypeScript and this document's explanations are in English.

### 12.4 Engineering Notes

- `parseJson.ts` must handle: code-fence wrapping, trailing commas, single quotes, unescaped newlines inside strings.
- When classification returns `low` or `null`, the frontend **does not show** `RouteSuggestion`.
- When the conclusion summary returns `NO_DIGEST`, the frontend treats it as "no digest" and silently hides that section.
- Prompts are core product IP. Copy them verbatim into the implementation; do not "optimize" them. If Ocean wants to change a prompt, Ocean will do it.

---

## 13. Design System

### 13.1 Design Tokens (src/styles/tokens.css)

Carries over the paper-ink-amber palette. **The v1 `tokens.css` is kept; just add the new status colors below.**

```css
:root {
  /* paper & ink */
  --paper:        #faf7f0;
  --paper-2:      #f3eee2;
  --paper-edge:   #ebe4d2;
  --ink:          #1c1a16;
  --ink-2:        #4a463d;
  --muted:        #8c8576;

  /* lines */
  --line:         #e6dfcc;
  --line-strong:  #d6cdb3;

  /* accent (amber family) */
  --accent:       #b45309;
  --accent-2:     #92400e;
  --accent-soft:  #fef3c7;
  --highlight:    #fbbf24;
  --selection:    #fef9c3;

  /* status colors */
  --status-active:   #6b7c5a;   /* moss green: active */
  --status-parked:   #a8632c;   /* ochre: parked */
  --status-done:     #8c8576;   /* gray: done */
  --urgent:          #b3402f;   /* brick red: near/overdue */

  /* spacing */
  --pad-page-x: 2.5rem;
  --pad-page-y: 1.75rem;

  /* fonts */
  --font-ui:    'Geist', -apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif;
  --font-serif: 'Instrument Serif', 'Songti SC', 'STSong', serif;
  --font-mono:  'Geist Mono', ui-monospace, monospace;

  /* radii */
  --r-sm: 4px; --r-md: 8px; --r-lg: 12px; --r-pill: 999px;

  /* shadows */
  --shadow-card:  0 4px 12px -6px rgba(120, 80, 20, 0.15);
  --shadow-toast: 0 8px 24px -8px rgba(60, 40, 10, 0.25);
}
```

### 13.2 Component Atom Conventions

- **Pill**: `padding: 5px 11px; border-radius: 999px; border: 1px solid var(--line)`. (Attachment chips and the source badge are Pill-based.)
- **IconButton**: `padding: 5px 10px; border-radius: 6px`.
- **StatusDot**: a 4px filled circle. `--status-active` / `--status-parked` / `--status-done` per the thread's status. Replaces the v2.5 ProgressRing — discrete signal, no manual maintenance.
- **CountdownBadge**: small text + a dot; near/overdue uses `--urgent`.
- **Card** (block / toast / dialog): `border: 1px solid var(--line-strong); border-radius: 8px`.
- **CaptureToast**: in the overlay window, `--shadow-toast`, 220ms slide-in, fade out after ~2.5s (paused while hovered). The overlay window's body background is transparent.

### 13.3 Animation Spec

- Block entrance: 220ms ease-out, translateY(4px→0) + opacity(0→1).
- Toast slide-in: 220ms ease-out; fade-out: 300ms.
- On a successful capture, the corresponding sidebar thread item flashes an amber background once (900ms) — so the user knows where it went even without looking at the toast.
- After clicking a search result and navigating, the target block briefly highlights (900ms amber background fading out).
- A block's "show more / show less" truncation toggle: 160ms ease on height.
- Workspace collapse/expand: 160ms ease.
- **Do not do**: chat-style bubble animations, modal scaling, hover glow, slide-in sidebars.

### 13.4 Font Usage

- Sidebar logo / workspace titles / thread titles: Instrument Serif.
- Block body / composer: Geist, 15px, line-height 1.65.
- UI elements: Geist, 11–13px.
- Timestamps / source badges / attachment chips / kbd: Geist Mono, 10.5px.
- The Chinese fallback always follows the English font: `PingFang SC / Microsoft YaHei`; serif fallback `Songti SC / STSong`.

---

## 14. Key Interaction Details

### 14.1 Keyboard Shortcuts

| Key | Behavior | Scope |
|---|---|---|
| **Double-tap ⌥ (Option)** | **Global capture — primary trigger** (macOS only; hardware-timestamp-based, within 500ms window) | **System-global** |
| **Cmd/Ctrl+Shift+C** | **Global capture — fallback trigger** (always active; the only trigger on Windows/Linux) | **System-global** |
| **Cmd/Ctrl+Shift+F** | **Global search overlay** | **System-global** |
| Cmd/Ctrl+Shift+P | Pack the current thread | Main window |
| Cmd/Ctrl+N | New thread in the current workspace | Main window |
| Cmd/Ctrl+, | Settings | Main window |
| @ | Trigger mention inside the composer | Composer focused |
| Enter / Shift+Enter | Composer append block / newline | Composer focused |
| Esc | Close toast / dialog / overlay / settings; cancel a block edit | Global |

### 14.2 System Tray

- The app stays resident in the tray (macOS menu bar). Icon: an amber "S."
- Tray menu: current capture target (switchable), open main window, new thread, settings, quit.
- **Closing the main window hides it** (the webview stays alive, so capture and the AI pipeline keep running) — it does not quit. Quitting is only via the tray. Capture depends on this residency.

### 14.3 Focus Management

- After creating a workspace/thread, focus its title input.
- A capture **does not steal foreground focus** — the user is still in the browser/AI; the capture overlay window appears non-activating, and the toast is only a corner notice. *Clicking* an action in the toast is a deliberate act and may then focus the overlay.
- When the pack dialog opens, focus the "Copy" button.
- When the search overlay opens, focus the search field.
- When a block enters inline-edit, focus its text; blur or Esc commits/cancels.

### 14.4 Error Handling

- All AI calls are try-catch wrapped; on failure, silently fall back to the next tier; if all fail, that AI feature simply does not appear this time — no error popup.
- Clipboard empty / non-text on capture: a gentle toast, nothing written.
- Attachment target (file/folder/URL) missing or unreachable: a toast notice, the block and the attachment are kept.
- Network down: summaries/classification automatically try Local; if Local is also absent, silently skip. Capture, pack, and search are entirely unaffected.

### 14.5 Empty States

- No workspaces (shouldn't happen — the Inbox exists): the sidebar guides creating one.
- A workspace with no threads: the group shows "+ Create the first project."
- A thread with no blocks: the feed area shows "Press Cmd+Shift+C to save your first piece of info, or just write below."
- The Focus section empty: the whole section is not shown.
- Search with no results: the overlay shows "Nothing found — try other keywords?"
- A digest view with no pinned blocks and no attachments and no digest: shows "This project has no marked highlights. Look through the full record?" + a one-click jump to LogView.

---

## 15. Implementation Roadmap (for Claude Code)

> Each phase is an independent unit of work. After completing one, STOP and wait for Ocean to review. **Do not parallelize. Do not pre-implement anything out of scope.**
>
> Ordering logic: the core loop (Phase 3→4) is the highest-value and the assumption most worth validating first, so it comes before the supporting layers. After Phase 2 the product is a usable "manual project log"; after Phase 4 the core loop is proven; everything after is supporting layers, stacked one at a time.

> **v2.4 roadmap amendment.** Eight proposed UX ideas were evaluated against §2 and the North Star. The outcome reshaped the roadmap:
> - **Two new phases inserted** — Phase 5 (Capture Hardening) and Phase 6 (Block Workbench).
> - **The old "File Anchors" phase is dissolved.** File anchors and "attach files to a block" were one need; they are unified into the block-attachment model (§9.6) and built in Phase 6. There is no separate file-anchors phase.
> - Phases that were 6–12 are renumbered 7–13.
> - **Accepted into the roadmap**: capture overlay window (idea #1), editable source (#6), block attachments unifying file anchors (#8), edit block text (#8), block annotations (#8), status-model cleanup `active/parked` + `next_step` (#4), sidebar drag-and-drop (#3), smart truncation (the reshaped #5).
> - **Rejected / deferred**: collapse-to-chip-by-default (#5 → §2.6), node-graph thread view (#7 → §2.6 + §17), per-block AI summary (#8 → §2.6). Idea #2 (simpler shortcut): the shortcut is already user-configurable; a double-tap trigger is deferred (§10.4, §17).
> - Each accepted idea passed the §2.7 filter; each rejected one failed it. Phases 0–4 are unchanged in intent (Phase 1's schema and Phase 4's `assemble.ts` pick up the new fields).

### Phase 0 — Starting Point (conditional, ~40 min)

**First decide: does the repo already contain v1 code?**

**0A — Build from scratch (no v1 code)**:
- [ ] `npm create tauri-app@latest spool`, choose React + TypeScript
- [ ] Install the full dependency list from §4
- [ ] Configure Tailwind; turn on `strict: true` in `tsconfig.json`
- [ ] Create the directory skeleton from §7 (empty files + placeholder exports), including `overlay.html` + `src/overlay/` and `lib/db/attachments.ts`
- [ ] Write `src/styles/tokens.css` (copy §13.1)
- [ ] `tauri.conf.json`: main window 1100×720, minimum 860×560, title "Spool"; enable tray; add sql/store/global-shortcut/clipboard/fs to the allowlist
- [ ] `vite.config.ts`: multi-page input (`index.html` + `overlay.html`)

**0B — Strip v1 code (v1 code exists)**:
- [ ] Per the §5.1 keep/delete list, **delete** every "Delete" item (the textarea editor, suggestion panel, `useSuggestions`, the `notes` table and CRUD, related components and prompts)
- [ ] **Keep** the §5.1 "Keep" items (Tauri scaffold, `tokens.css`, `lib/ai/`, the `client.ts` wrapper, `utils/`, generic ui atoms)
- [ ] Delete the old SQLite database file
- [ ] Confirm `tsconfig.json` has `strict: true`; add the dependencies from §4 that are missing; add the new status colors from §13.1 to `tokens.css`
- [ ] Fill in the directory skeleton per §7 (including `overlay.html` + `src/overlay/`, `lib/db/attachments.ts`, multi-page `vite.config.ts`)

**Convergence point of both paths**: a Tauri project with infrastructure installed and zero feature code.
- **Acceptance**: `npm run tauri dev` launches an empty window, the tray has an icon, Tailwind works, DevTools opens.

### Phase 1 — Data Layer & CRUD (~2.5 h)

- [ ] `src-tauri/src/main.rs` registers the sql / store plugins
- [ ] `src/lib/db/schema.sql` copies §8.1 **in full** — workspaces, threads, blocks, attachments, and the FTS5 table over `content` + `annotation` with its sync triggers
- [ ] `src/lib/db/client.ts`: `Database.load("sqlite:spool.db")`, run the schema on startup; **on first launch create the "Inbox" workspace + "Unsorted" thread and set it as the capture target**
- [ ] `workspaces.ts` / `threads.ts` / `blocks.ts`: three-tier CRUD, all parameterized queries; `threads.ts` includes `setCaptureTarget` (transactional) and covers the `active|parked|done` status; `blocks.ts` covers `annotation` + `source`. (`attachments.ts` CRUD is built in Phase 6.)
- [ ] `workspacesStore` / `threadsStore` / `blocksStore` / `captureStore` (Zustand)
- [ ] App startup `useEffect` loads workspaces and threads
- **Acceptance**: manually calling store actions from the console can create workspaces, threads, blocks, move threads, set the capture target; data persists across restart; the Inbox and "Unsorted" are undeletable.

### Phase 2 — UI Skeleton & Thread View (~3.5 h)

- [ ] `App.tsx`: left Sidebar (280px) + right ThreadView
- [ ] `Sidebar`: logo, the workspace tree (`WorkspaceGroup` collapsible + `ThreadListItem` within), bottom "+ Workspace" and gear (skip Summary/Focus for Phase 2, lay workspaces flat)
- [ ] `ThreadView/ThreadHeader`: title input, status toggle (pack/complete/view-toggle buttons as placeholders)
- [ ] `ThreadView/LogView` + `BlockFeed` + `BlockItem`: render the read-only card stream of `text` blocks
- [ ] `ThreadView/Composer`: Enter appends a `text` block, Shift+Enter for newline (@-mention wired in Phase 10)
- [ ] Write the paper-bg background into `global.css`
- [ ] Wire end to end: create workspace, create thread, move thread, edit title, manually add block, delete block, pin block, switch thread
- **Acceptance**: can create workspaces and threads, can manually append text blocks to a thread like writing a draft, can pin, can move a thread between workspaces, data persists across restart — **at this point the product is already a usable manual project log**.

### Phase 3 — Global Shortcut Capture (Core, ~4 h)

- [ ] `src-tauri` registers the global shortcut; `capture.rs` reads clipboard text + gets the foreground app name, emits an event to the frontend
- [ ] Tray menu: show/switch the current capture target, open main window, new thread, settings, quit; **closing the main window hides it** (webview stays alive)
- [ ] The three `lib/capture/` files: `clipboard.ts` / `shortcut.ts` / `ingest.ts`, writing captured content as a `text` block to the capture target, with `source` set to the foreground app name
- [ ] `hooks/useCapture.ts` listens for capture events → drives the toast
- [ ] `Capture/CaptureToast.tsx`: **content preview (first ~12 chars) + two-tier attribution `Saved to 「<Workspace>/<Thread>」`**, three inline actions "Undo / Redirect / Save as new thread," auto-dismiss ~2.5s. In Phase 3 it is mounted in the main window (corner); the dedicated overlay window comes in Phase 5.
- [ ] On successful capture, the corresponding sidebar thread item flashes an amber background
- [ ] Clipboard empty/non-text: a gentle toast, nothing written
- **Acceptance**: select text in a browser and press the shortcut → a toast pops in the corner of the Spool window showing a preview of what was captured and which workspace/thread it went into; "Undo" deletes the just-saved block; "Redirect" changes thread; "Save as new thread" creates a new thread under the Inbox. (Showing the toast *over other apps with Spool hidden* is delivered in Phase 5.)

### Phase 4 — Context Packer (the crown, ~2 h)

- [ ] `lib/pack/templates.ts`: the Markdown template (§9.5)
- [ ] `lib/pack/assemble.ts`: a **pure function**, thread + blocks → Markdown; pinned blocks go into "Key Information"; refs rendered as reference lines; `source` annotated inline. (Attachments + annotations are wired into `assemble.ts` in Phase 6.)
- [ ] `Pack/PackDialog.tsx`: show the assembled full text + a "Copy to clipboard" button + a toast
- [ ] `ThreadHeader` wires up the "Pack context" button + Cmd+Shift+P
- [ ] Write Vitest for `assemble.ts`: empty thread, plain text, with pinned, with refs — several cases
- **Acceptance**: clicking "Pack" on a thread with several blocks pops a clean Markdown briefing; after copying it pastes straight into Claude/ChatGPT; the pack process makes zero network requests.

### Phase 5 — Capture Hardening ✅ COMPLETE (originally ~3 h, actual ~larger due to scope expansion)

> Delivered the planned overlay window + editable source, **plus** four user-approved additions: (1) double-tap ⌘C as a primary trigger (originally deferred — later retuned to ⌥ in Phase 7, see §10.4); (2) failure notices routed through the overlay window so they show even when the main window is hidden; (3) osascript-based focus restoration to the source app after a failed capture; (4) macOS sleep/wake `⌘⇧C` re-registration on window focus. Dependencies added (all approved): `core-graphics`, `core-foundation`, Tauri `macos-private-api` feature. The original Phase 5 task list still describes the planned surface; the additions are documented in §10.4 and the §10.5 update.

> Goal: the capture moment delivers total confidence on the user's *source* screen, and provenance is first-class. Idea #1 + #6 (and the §10.4 settling of #2).

- [ ] Create the **capture overlay window**: a second Tauri window — small, borderless, transparent, always-on-top, and **non-activating** (its appearance must NOT steal keyboard focus from the user's current app). Declared in `tauri.conf.json` / created and positioned by `capture.rs`. Its frontend is the separate Vite entry `overlay.html` → `src/overlay/main.tsx` → `CaptureOverlay.tsx`.
- [ ] Move the `CaptureToast` UI into the overlay window (`CaptureOverlay` hosts it). On capture, `capture.rs` positions the overlay at the bottom-right of the active screen and passes it the capture info (preview text, workspace + thread names); the overlay shows the toast for ~2.5s, **paused while the pointer is over it**.
- [ ] The toast's three actions (Undo / Redirect / Save as new thread) work from the overlay window — give the overlay its own SQLite access for the Redirect thread list.
- [ ] Editable `source`: clicking a block's source badge opens a small inline editor; the user can override "Google Chrome" with "Gemini", "University portal", "PPT", etc. (Smarter auto-detection — browser tab title — is **not** in v1; it shares the AppleScript fragility of URL capture, see §10.5.)
- [ ] Settings/shortcut review: confirm the capture shortcut recorder UX (§9.12) is solid. The shortcut stays user-configurable; do **not** add a double-tap-modifier trigger (deferred — §10.4, §17).
- **Acceptance**: trigger a capture while in a browser with the main Spool window hidden → the toast appears over the browser, on the same screen, without taking keyboard focus (you can keep typing in the browser); it shows the preview + "Saved to Workspace/Thread"; Undo/Redirect/Save-as-new all work from it. On any block, the source badge can be edited and the new label persists.

### Phase 6 — Block Workbench ✅ COMPLETE (originally ~4 h, three follow-up rounds)

> Delivered the planned attachments/edit/annotate/truncation surface. Three follow-up rounds (all user-approved) added: Round 1 — JS-controlled hover bar; double-click block body to edit; drag-target highlighting via a new `dropStore`; "by time / by source" feed sort (was marked optional in the original Phase 6); native file picker via `@tauri-apps/plugin-dialog`. Round 2 — **browser tab-title detection** for the five major browsers in `blocks.source` (pulled forward from v1.5, see §10.5). Round 3 — drag-coordinate hit-testing rewritten to use cursor coordinates via a new Rust command `cursor_in_main_webview` (titlebar offset was breaking hit-testing); clearer drag feedback (ring-2 highlight, dashed "release to create new block" empty-zone). Verifications: the "by source" sort is a reordering of the one feed, not a new view — it passes §2.6 (§19.10 will guard against it growing into grouping/filtering).

> Goal: a block is a small workbench — you can attach artifacts to it, edit it, annotate it, and long blocks stay readable. This phase resolves the file-anchor / attach-to-block question by unifying them (§9.6).

- [ ] `lib/db/attachments.ts`: attachment CRUD, parameterized queries
- [ ] **Block attachments — the unified model (§9.6)**:
  - [ ] Drag a file/folder **onto a block** → attach it to that block
  - [ ] Drag a file/folder **into empty timeline space** → create a new `text` block (content = filename) carrying that one attachment — this is the former "file anchor"
  - [ ] A URL dragged in, or added via the 📎 hover action, behaves the same way
  - [ ] `BlockAttachments.tsx` renders attachment chips (icon by kind + label); click opens the file/folder with the system default app / Finder, or the URL in the browser; missing target → toast, no crash
- [ ] `BlockActions.tsx`: hover actions on a block — pin / **edit** / **attach** / **annotate** / copy / delete (no always-on side panel)
- [ ] **Edit block text** inline: the ✎ action makes `content` editable; blur/Esc commits
- [ ] **Block annotations**: the ✑ action adds/edits the block's `annotation`, rendered visually distinct from the captured content
- [ ] **Smart truncation**: a `text` block whose content exceeds ~6 lines is truncated with a "show more / show less" toggle (collapse-to-chip-by-default is rejected — §2.6)
- [ ] Extend `lib/pack/assemble.ts`: a block's attachments listed inline beneath it; annotations included; all attachments also collected into a "Related Files & Links" section
- [ ] (Optional, only if phase capacity remains) sort the feed by `source` as an alternative to chronological order
- [ ] Vitest: `assemble.ts` cases with attachments and with annotations
- **Acceptance**: drag a PDF onto a captured block → it attaches and opens on click; drag a file into empty timeline space → a new block appears carrying it; edit a block's text inline; add an annotation that displays distinctly; a very long block is truncated with a working "show more" toggle; packing lists attachments under their blocks and in a final "Related Files & Links" section.

### Phase 7 — Full-Text Search ✅ COMPLETE (~2.5 h)

> Delivered as planned, with one engineering decision worth memorializing: FTS5 uses the **trigram tokenizer** (the default `unicode61` cannot index continuous Han text), and queries shorter than 3 characters fall back to a `LIKE` scan over `content` + `annotation`. `SCHEMA_VERSION` bumped 1→2 (schema is drop-and-recreate on mismatch — §19.3 flags this as the one thing that must change before any preview release). The capture-trigger key was retuned this phase: **double-tap ⌘C → double-tap ⌥** (rationale in §10.4). `@types/node` added as a devDependency to silence a `tsc -b` error on `vite.config.ts`.

- [ ] Confirm the Phase 1 FTS5 triggers stay correctly synced on block insert/update/delete (over both `content` and `annotation`)
- [ ] `lib/search/query.ts`: an FTS5 query wrapper that, **along with each hit block, returns a "hit line + one line above and below" context snippet** with the keyword position marked
- [ ] `searchStore.ts` / `hooks/useSearch.ts`
- [ ] `Search/SearchOverlay.tsx` + `SearchResultItem.tsx`: the overlay; each result shows **three lines of context (hit line highlighted)**, the owning thread, the owning workspace, the time
- [ ] The global shortcut `Cmd/Ctrl+Shift+F` opens it; clicking a result navigates to the corresponding thread and scrolls to the block, which briefly highlights
- **Acceptance**: searching a keyword finds blocks (by content or annotation) in any thread of any workspace; **each result shows context around the keyword (not an isolated snippet)**; clicking a result navigates accurately and highlights the target; search makes zero network requests.

### Phase 8 — Deadline, Status & Sidebar Structure ✅ COMPLETE (~3.5 h)

> **Delivered (v2.5)**: planned surface (deadline, progress, parked + next_step, three-section sidebar, drag-between-workspaces). Two backlog items were folded in as planned: §19.1 (shortcut configuration UI) shipped with two recorders + conflict detection, Rust-side runtime shortcut swap with rollback on registration failure, persisted via `tauri-plugin-store`, wired to the gear / ⌘, / tray. §19.5 (FTS sync verification) shipped as Vitest cases via `node:sqlite` — INSERT, content edit, annotation edit all sync to FTS; no bugs found.
>
> **v2.6 rollback (post-dogfooding)**: the manual `progress` slider and the manual `next_step` field are removed (§2.6). `ProgressRing` deleted from the UI and replaced with `StatusDot`. The ThreadHeader collapses to title + status + deadline + pack/complete/view-toggle. The sidebar `ThreadListItem` now shows just a `StatusDot` + `CountdownBadge` on the right. Schema migrates 2→3 via additive `ALTER TABLE DROP COLUMN` — first true additive migration, partial close on §19.3.

- [x] `ThreadHeader`: deadline date picker + `active|parked|done` status toggle (the v2.5 progress slider and `next_step` input are removed in v2.6)
- [x] `ui/CountdownBadge.tsx`; `hooks/useCountdown.ts` updates in real time
- [x] `ui/StatusDot.tsx` (replaces v2.5 `ProgressRing` in v2.6)
- [x] `ThreadListItem` wires up `StatusDot` + `CountdownBadge`
- [x] **Sidebar drag-and-drop**: drag a `ThreadListItem` from one `WorkspaceGroup` to another → updates `workspace_id`; the right-click "move to workspace" stays as a fallback
- [x] `Sidebar` three-section structure: `SidebarSummary` ("X active · Y due this week · Z parked") + `FocusSection` (across workspaces, near deadline, ~5 max) + the workspace tree
- [x] Thread ordering within a workspace group: active/parked on top, done at the bottom and dimmed
- **Acceptance**: after setting a deadline on a thread it appears in the Focus section sorted by urgency; near ones are red; the aggregate numbers at the sidebar top are correct; the `StatusDot` reflects status; a thread can be dragged between workspaces.

### Phase 9 — Thread Lifecycle & the Digest View (~2.5 h)

- [ ] `ThreadView/CompleteThreadPanel.tsx`: pops on "Complete project"; **the handwritten conclusion input is the primary path**, the "Let AI summarize" button is a placeholder for now (AI part wired in Phase 11); allow completing without writing anything
- [ ] The completion action: `status = done`, `completed_at`, `digest` written (may be empty)
- [ ] `ThreadView/DigestView.tsx`: **strictly by the §11.2 hierarchy** — pinned blocks with their attachments (structural) + an aggregated "Files & Links" section (structural) + digest (decoration; if empty, that section is hidden)
- [ ] `ThreadView/index.tsx`: pick `LogView` / `DigestView` by status; `ThreadHeader` gets a view toggle, a done thread can flip back to LogView
- [ ] The empty state of a digest view with no pins, no attachments, and no digest (§14.5)
- **Acceptance**: completing a thread and writing a one-line conclusion switches it to a digest view showing only pinned blocks + attachments + conclusion; completing without a conclusion still works, and the digest view is still complete on pins + attachments; can flip back to the full process in one click; done threads are dimmed and sink in the sidebar.

### Phase 10 — @-Mention References (~2 h)

- [ ] Typing `@` in the `Composer` → pops up a list of other threads in the same workspace (fuzzy title match)
- [ ] On selection → append a `kind=ref` block, `ref_thread_id` pointing to the referenced thread
- [ ] `BlockItem` renders `ref`: reference icon + referenced thread title, click navigates there
- [ ] `assemble.ts` already handles ref in Phase 4; here just confirm the rendering is correct
- **Acceptance**: @-referencing another thread in the same workspace from within a thread creates a clickable reference block that navigates accurately on click; the reference line appears in the briefing when packing.

### Phase 11 — The AI Layer (~3 h)

- [ ] Confirm the `lib/ai/` infrastructure ported from v1 works (router / providers / cache / parseJson / quotaStore)
- [ ] `prompts/summarizeStatus.ts` / `summarizeDigest.ts` / `route.ts` copy §12
- [ ] An active thread's header "Summarize current status" button → `router.quality` → writes `summary` and displays it; mark "may be stale" after a new block; **silently not shown on generation failure**
- [ ] Wire up `CompleteThreadPanel`'s "Let AI summarize" → `router.quality` generates `digest` from pinned blocks; **on `NO_DIGEST` or failure, leave digest empty and the digest view still holds up on pinned blocks + attachments**
- [ ] `Capture/RouteSuggestion.tsx`: a background `router.fast` classification after capture; the bubble shows only at high/medium confidence; one click to move, ignore to leave
- [ ] In privacy mode / with no model, all AI entry points are hidden silently
- **Acceptance**: with keys filled in, an active thread can "Summarize current status"; on thread completion the AI can generate a conclusion from pinned blocks, and **the digest view is unaffected when generation fails**; capturing content clearly belonging to some thread produces a "move it?" suggestion; with privacy mode on the AI entry points disappear and capture/pack/search work as normal.

### Phase 12 — Polish, Settings, Packaging (~2.5 h)

- [ ] `Settings`: two shortcut recorders (conflict-checked), three API keys + test, Ollama detection, privacy mode, launch at login, quota display, clear data (with confirmation)
- [ ] Run through all shortcuts (§14.1); unify error handling (§14.4); empty states (§14.5)
- [ ] Performance: enable virtual scrolling when blocks > 200
- [ ] App icon: an amber "S"
- [ ] `npm run tauri build` produces a .dmg
- [ ] README, screenshots, an API-key acquisition guide
- **Acceptance**: the built .dmg installs and runs; shortcuts are changeable; privacy mode verified with a packet capture showing zero outbound; a friend can pick it up and use it.

### Phase 13 (optional) — Release

- [ ] GitHub repo, MIT LICENSE
- [ ] GitHub Actions auto-builds macOS + Windows
- [ ] Release v2.4.0

---

## 16. Acceptance Criteria

After each phase, Ocean should be able to:

- **Phase 1**: manually create workspaces/threads/blocks from the console; they persist across restart.
- **Phase 2**: use it as a purely manual project log — usable without capture, without AI.
- **Phase 3**: select text in any app and save it to a thread with one key; a toast in the Spool window confirms what and where.
- **Phase 4**: pack a thread with one click and paste it into Claude to keep working immediately.
- **Phase 5**: capture with the main window hidden and see a confirmation toast **on the source screen itself**, without focus being stolen; edit a block's source label.
- **Phase 6**: attach files/folders/URLs to a block (and drop a file into empty space to anchor it as its own block); edit and annotate blocks; long blocks stay readable via "show more."
- **Phase 7**: search a keyword and find some piece of info in any old project, **with context**.
- **Phase 8**: see at a glance in the sidebar which projects are near deadline and which are parked / active / done; drag a thread between workspaces.
- **Phase 9**: after completing a project, it auto-wraps into a one-page archive — **complete even without a written conclusion and with AI absent**.
- **Phase 10**: reference another project under the same topic from within a project.
- **Phase 11**: have AI help summarize status, generate conclusions, suggest classification — **with the product unharmed when AI fails**.
- **Phase 12**: a friend can install and use the .dmg.

**Overall quality bar**:

- Startup < 2 seconds.
- Capture latency: from keypress to toast appearing < 200ms (pure local, no AI involved).
- Pack: from click to dialog showing < 100ms (pure-function assembly).
- Search: from input to results showing < 150ms (local FTS5).
- Any AI failure neither crashes nor pops an error — it falls back or skips silently.
- In privacy mode, a packet capture verifies zero outbound requests.
- Zero data loss: SQLite is up to date at any point of a force-quit.

---

## 17. Out of Scope (with architectural hooks)

Not in v1 scope, but the architecture must be able to accommodate them. Claude Code should not implement them proactively, and should not cut off these paths while writing code. **Run any new feature through the §2.7 filter first.**

| Feature | When | Architectural Hook |
|---|---|---|
| **Always-on desktop floating widget** (stronger capture presence + a seed for future quick actions) | **Explicit v1.5 candidate** | The capture overlay window (§9.4) already establishes multi-window + non-activating-window groundwork; the capture event bus exists — the widget is just another subscriber |
| Pack range selector (pinned only / last N days) | v1.5 | `assemble.ts` takes a filter parameter |
| Cross-session "where I was reading" scroll memory | v1.5 if dogfooding shows a real gap | Add one column `threads.last_scroll_block_id`; `LogView` reads it on mount and scrolls to that block. This is the cheap escape hatch for the v2.6 `next_step` rollback (§2.6) if "scroll to bottom on open" turns out to be insufficient |
| AI pack compression | v1.5 | `router` is ready; add a compress prompt |
| Auto-copy selection on capture | v1.5 | A settings option + a branch in `capture.rs` |
| Source URL capture | v1.5 | Same AppleScript path as the tab-title detection that already ships; enrich `blocks.source` or add a column (the DB is drop-and-recreate, §5 — no migration cost) |
| @-mention referencing a specific block | v1.5 | Add a `ref_block_id` column to `blocks` |
| Node-graph / "chain of thought" thread view | v1.5+ — validate real demand first (§2.6) | The block feed is already a list; a graph view would consume it read-only |
| Passive clipboard buffer | v2 | An in-memory ring buffer + a tray review interface; reuse `ingest.ts` |
| Markdown rendering | v2 | Abstract `BlockItem` into a swappable renderer |
| Streaming AI output | v2 | Add a `stream` option to the `router` interface |
| Mobile | v2 | Tauri 2.0 builds iOS/Android directly |
| End-to-end encrypted sync | v2 | Add a `nonce` column to each block; add a key layer to the database |
| Browser extension (precise URL grab + one-click capture) | v2 | The extension communicates with the app over a local port |

> Items promoted *out* of this table in v2.5 (now shipped in v1): double-tap-modifier capture trigger (now ⌥ — §10.4); smarter source auto-detection via browser tab title (§10.5).

---

## 18. General Rules for Claude Code

1. **Each phase is an independent git commit**, message format `feat(phase-N): ...`.
2. **TypeScript strict mode must be on**: `noImplicitAny`, `strictNullChecks` all true.
3. **Do not install dependencies outside the §4 list.** For any new dependency, ask Ocean first.
4. **Comments explain "why," not "what."** The code itself must be clear.
5. **The prompt bodies under `prompts/` are copied verbatim from §12 — not one character changed.** They are core product IP; do not "optimize" them in implementation. If Ocean wants to change a prompt, Ocean will do it.
6. **On any ambiguity or any "should we add a feature" impulse, first read §2 (Product Constitution)** — especially §2.5 principles, §2.6 the rejected list, §2.7 the filter. If still undecided, STOP and ask Ocean. Do not improvise.
7. **No over-engineering**: no premature abstraction, no "might-need-it-later" utility libraries, no interfaces left "for the future." Every line of code serves the current phase.
8. **The hot paths of capture, pack, and search must never contain an AI call or a network request** — this is a hard requirement of Principles 2 and 4; self-check repeatedly during implementation.
9. **Always treat AI output as disposable decoration** — anywhere an AI summary is displayed, write the "AI absent / failed / slow / returned NO_DIGEST" degradation path first, then the normal path.
10. **Testing**: v1 does not mandate full coverage, but `pack/assemble.ts` (a pure function, the crown feature — its cases must cover pinned blocks, refs, attachments, and annotations), `search/query.ts` (including the context-extraction logic), the fallback logic of `ai/router.ts`, and `ai/parseJson.ts` must have Vitest.
11. **All user-facing UI copy is in Simplified Chinese**, and obeys "silence over noise" — if three words will do, do not use five. (This document and code comments are in English; the product's interface is in Chinese.)
12. **After each phase, STOP and wait for Ocean to review.** Do not push through multiple phases in a row.

13. **Git identity & attribution — HARD rule, no exceptions.** The git history, README, and every committed file in this repository must contain **zero references to Claude, Claude Code, Anthropic, or any AI tool**. Concretely:
    - Never add `Co-Authored-By: Claude` (or any variant) to a commit message.
    - Never add "🤖 Generated with Claude Code" / similar tool-attribution footer or emoji.
    - Never modify `git config user.name` or `git config user.email`. If they are unset on the machine, STOP and ask Ocean — do not set them yourself.
    - Never use `git commit --author` to override the author identity.
    - Never write "Claude" / "Claude Code" / "Anthropic" into README.md, any source comment, any commit message body, or any other committed file.
    - Never add a "made with" / "powered by" badge to the repo.

    The fact that an AI tool helped write the code is private to Ocean's workflow and is not part of the public record of this project. Treat any urge to add attribution as the failure case — the correct behavior is to commit silently under Ocean's git identity, exactly as any other contributor would. This rule applies to every commit, not just the initial baseline.

### 18.1 Environment Constraints — Working With Claude Code (HARD)

> These rules are not about code quality. They exist because violating them
> floods Claude Code's context or crashes its plugin UI. They override
> convenience every time.

1. **File search must exclude build output.** Any Bash command that searches or
   lists files (`find`, `grep`, etc.) MUST exclude `src-tauri/target/`,
   `src-tauri/gen/`, `node_modules/`, and `dist/` — use `--exclude` /
   `--exclude-dir` / `-not -path`, or a prefilter. Those directories hold tens of
   thousands of files; an unfiltered search dumps an enormous result and
   destabilizes the session. Prefer the dedicated search tools (Grep / Glob) over
   raw Bash whenever possible.

2. **Never recursively list the project tree.** Do NOT run `ls -R`, `find .`
   without a path filter, `tree`, or any command that enumerates the whole repo.
   A full tree dump (the `icons/` folder alone has ~60 files) floods the context
   and has already stalled a session. When you need to know what files exist,
   target a single known directory (e.g. `ls src/components/ThreadView/`) or use
   Glob with a specific pattern. The repository layout is already specified in §7
   — consult it instead of discovering the tree at runtime.

3. **Do not read PLAN_EN.md in full.** This blueprint is ~95KB; a full read
   consumes a large share of the context window every time. Read only the
   section(s) you currently need, using offset/limit or a section search. §1 is
   the table of contents — use it to jump. Re-read §2 (the Product Constitution)
   when a design decision is in doubt; you do not need the rest of the document
   in context to write code for one phase.

4. **Keep each tool result small.** If a command might produce a large output,
   add `| head`, a count (`wc -l`), or a narrow filter. A response that streams
   tens of thousands of lines into the chat can stall the connection at the next
   request. When in doubt, ask for less. This is the same principle that gates
   rules 1 and 2 — large outputs are the failure mode, not specific commands.

5. **Build / test / dev commands are permitted, with discipline.** Claude Code
   MAY run `npm`, `npx`, `cargo`, `tauri`, `vite`, `vitest`, etc. when needed
   for verification. Practice that goes with this permission:
   - For long-running watchers (`npm run tauri dev`, `vite`, `cargo watch`),
     still prefer to write the command and let Ocean run it interactively —
     a watcher's output is unbounded.
   - For one-shot commands (`npm test`, `cargo check`, `npm run build`,
     `tsc -b`), run them directly when verification is the goal, and apply
     rule 4 to the output.
   - Build failures and test failures are not silent: surface them at the top
     of the response, not buried in a tool result.

   (Earlier versions of this document forbade these commands; that restriction
   is lifted in v2.5 — see §0.)

---

## 19. Improvement Backlog (post-Phase 8 / v2.6)

> Items identified during the v2.4 → v2.5 → v2.6 retrospectives. Each was assessed against §2.7 (the filter). Everything here either tightens the v1 surface or pays down engineering debt — none adds a new feature. Items are tagged with a target phase; "opportunistic" means *fold in when you're already in that file*. ✅ marks items already addressed.

### 19.1 ✅ Shortcut configuration UI is overdue — DONE in Phase 8 (folded in as a sidecar; no separate mini-phase needed)

The capture trigger has churned through Phases 3 → 5 → 7: `⌘⇧C` → +double-tap `⌘C` → +double-tap `⌥`. All values are hardcoded. §9.12 and §10.4 both promised "user-configurable shortcut"; the promise is unfulfilled. Any further trigger experiment without settings UI compounds debt.

**Action**: pull the shortcut-recorder UI (originally Phase 12 §9.12) forward — either into Phase 8 as a sidecar, or as a small "Settings UI v0" phase between Phase 8 and Phase 9. Scope is just the two shortcut recorders + conflict check; API keys and quota display can stay in Phase 12.

### 19.2 ✅ Initialize git before continuing — DONE before Phase 8 (baseline at `v0.7.0-phase7`)

§18 rule 1 says "each phase is an independent git commit." The repo wasn't git-initialized through Phase 7; Phases 1–7 exist as one snapshot. This violates our own constitution and forfeits rollback safety.

**Action**: `git init` against the GitHub repo at `git@github.com:KIM-ocean-HZ/Spool---SoftwareProject.git` (SSH preferred over HTTPS for frictionless per-phase pushes), commit current state as a baseline tagged `v0.7.0-phase7`, then continue with per-phase commits going forward. Add a `.gitignore` covering `src-tauri/target/`, `src-tauri/gen/`, `node_modules/`, `dist/` per §18.1 rule 1.

**Every commit — including the baseline — must observe §18 rule 13**: no Claude / Anthropic / AI-tool attribution anywhere in git history, README, source comments, or commit message bodies. Git identity stays as Ocean's; `Co-Authored-By:` Claude lines and "Generated with Claude Code" footers are forbidden.

### 19.3 🟡 Schema migration policy needs upgrading before any preview release — PARTIAL: first additive migration shipped in v2.6; full framework still TBD

v2.6's `ALTER TABLE threads DROP COLUMN progress; DROP COLUMN next_step;` is the first additive migration in this project's history — the pattern is proven (see §8.1 migration policy paragraph). What's still pending before any preview release:

- A named, ordered migration registry (currently it's an if-else ladder in `client.ts`).
- Transaction wrapping per migration (today's `ALTER TABLE` is auto-transactional, but multi-statement migrations won't be).
- A no-op dry-run mode so we can preview what a migration would do before running it.
- Migration tests against a v0 / v1 / v2 fixture database.

**Action**: build the above before Phase 12 packaging. The full work is small (~half a day) and the v2.6 migration gives us a concrete first user of the framework.

### 19.4 CGEventTap auto-disable does not self-heal — Target: **Phase 12 polish**

When macOS sends `kCGEventTapDisabledByTimeout` or `…ByUserInput`, the handler only logs. Recovery requires restarting Spool. The `⌘⇧C` fallback still works, so it's not catastrophic — but a capture trigger that silently dies is the exact failure §10 says we cannot tolerate.

**Action**: on a disable event, attempt to recreate the tap once; if that fails, surface a one-time overlay notice ("Capture monitoring stopped — please restart Spool to re-enable double-tap"). Do not silently degrade without telling the user.

### 19.5 ✅ Verify FTS5 stays in sync after inline edits & annotation edits — DONE in Phase 8 via `query.test.ts` using `node:sqlite`; no bugs found

Phase 6 added inline `content` editing and `annotation` editing. The FTS5 triggers from Phase 1 cover INSERT/UPDATE/DELETE on `blocks` — on paper they handle this — but the path was never explicitly tested after Phase 6 landed. §9.10 (search over `content` AND `annotation`) is meaningless if edits don't reach the index.

**Action**: a Vitest case in `query.test.ts`: insert a block, run a query that misses, update content via `updateBlockContent`, run the same query — must hit. Repeat for `annotation`. If a case fails, audit the triggers.

### 19.6 Document the evolved semantics of `blocks.source` — Target: **already in this v2.5 patch (done)**

`blocks.source` schema is unchanged (TEXT), but Phase 6 Round 2 changed its meaning — for major browsers it's the active tab title, with app-name as fallback. Already updated in §8 (the "Note on `blocks.source` semantics" paragraph) and §10.5. Listed here for traceability.

### 19.7 Browser-permission UX needs a settings surface — Target: **Phase 12**

First capture from each of Safari/Chrome/Edge/Brave/Arc prompts macOS automation permission; denial silently falls back to app name. A user who denies (then forgets) will wonder why their browser captures are labeled "Safari" instead of the page title.

**Action**: in the Phase 12 settings panel, show per-browser automation status (✅ granted / ❌ denied / ⚪ never used), with a "Re-test" button that triggers a no-op osascript call to force the permission prompt again. Add a one-paragraph explanation block — this is the kind of friction-causing detail that benefits from documentation in the UI itself.

### 19.8 Add tests for store-level Phase 6 behaviours — Target: **opportunistic**

`blocksStore.attach / detach / setContent / setAnnotation` have no unit tests; `dropStore` likewise. Store actions sit between UI and DB so regressions here are hard to spot from the UI alone, and they are pure-ish (testable).

**Action**: add Vitest coverage when you're already in those files for a feature change. Not worth a standalone phase, but should not slide indefinitely.

### 19.9 Capture overlay polish — Target: **post-Phase 12 dogfooding**

The 2.5s auto-dismiss and 340px overlay width were picked on intuition. §10.3 says the toast is the felt half of "zero-friction"; if real usage shows the preview is too short or the dismiss too fast, the promise erodes.

**Action**: after Phase 12 packaging, dogfood the app for a week or two with quiet logging on how often Undo / Redirect / Save-as-new are clicked, and how often the user re-opens the main window within 30s of a capture (that latter event signals "the toast didn't give them enough confidence"). Tune from there.

### 19.10 The "By source" sort is fine — guard against it drifting into multi-view territory — Target: **policy note, in this patch**

Phase 6 Round 1 added a "By time / By source" feed sort. §2.6 rejected "multi-views" outright. The sort passes §2.6 because it's the same linear feed reordered, not a new layout. But if anyone proposes "group by source with collapsible sections" or "filter to one source only," that becomes a view and must be rejected.

**Action**: §9.3's `LogView` description now states explicitly: source-sort is a *reordering* of the one feed; growing it into grouping/filtering/separate-pane UI is rejected under §2.6. (Done in v2.5 — see the "Feed sort" bullet in §9.3.)

### 19.11 Source-category icon mapping needs tuning after dogfooding — Target: **opportunistic, after Phase 9**

v2.6 introduces a small `source → lucide icon` lookup table at the head of the source badge (§9.3). The initial mapping covers browsers, AI tools, files/PDFs, code editors, mail/messaging, terminal, and a fallback dot. Real usage will reveal:

- Which sources fall through to the fallback often enough that they deserve their own entry.
- Whether `Globe` / `Sparkles` / `FileText` are visually distinct enough at the badge's small size (~14px), or whether the choice needs revisiting.
- Whether the case-insensitive contains-match collides badly with any user-edited custom sources.

**Action**: after a week of v2.6 dogfooding, audit the lookup table from real `blocks.source` data. Add or rename entries as needed. No urgency — fallback behavior is fine in the meantime.

### 19.12 "Scroll to bottom on open" needs a real-use check — Target: **after Phase 9, opportunistic**

v2.6 removed `next_step` on the bet that "the newest blocks at the bottom of an append-only feed are *naturally* where you left off." This is theory; it needs validation.

**Action**: dogfood for a week. If a real gap shows up — specifically, if Ocean repeatedly finds himself scrolling away from the bottom to find "where I actually was" — add the cross-session scroll-position memory hooked in §17 (one column, ~30 lines of code). If no gap shows up, the rollback was correct and the architectural hook stays in §17 unused.

---

**Backlog discipline.** When you address an item, mark it ✅ here and add a one-line note pointing at the commit / phase. When you reject an item after revisiting, mark it ⌫ with a one-line reason. Don't delete items — the record matters more than the brevity.

---

Document maintainer: Ocean Jin (KIM-ocean-HZ)
Version: 2.6 (supersedes v2.5; change in this revision: post-Phase-8 design correction — manual `progress` slider and manual `next_step` field rolled back; rejected proposal of color-coded blocks superseded by source-category icons + date dividers; first additive `ALTER TABLE` schema migration (SCHEMA_VERSION 2→3); §19 backlog markers updated to reality through Phase 8)
Last updated: 2026-05-18