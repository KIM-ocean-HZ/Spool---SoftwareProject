# Spool — Case Study Ledger

> **What this is.** An append-only record of every figure and every incident this project is
> willing to state publicly, each with the command or file that reproduces it. It exists so a
> claim on the website, in an application, or in an interview can be checked rather than taken
> on trust.
>
> **Language: English**, deliberately — this is outward-facing material, unlike the product
> documentation, which stays bilingual (`DESIGN_CASE_STUDY.md` §4).
>
> **How to maintain it.** Append a row when a release closes; never rewrite history. If a figure
> changes, add the new one with its date and leave the old one in place — the trend is part of
> the evidence. Design rationale, open decisions, and the plan for the public page live in
> `DESIGN_CASE_STUDY.md`; this file holds only what is settled and checkable.
>
> **Disclosure rule.** What may be published is *shape and count*, never content. The live
> library holds real graduate-application material — deadlines, personal documents. Every figure
> below is a number, a source label, or a one-line description of a mechanism. If a row cannot be
> stated without quoting the library, it does not belong here.

---

## 1. Project scale

Measured 2026-08-09, at the v0.4.0 close-out. Run each command from the repository root.

| Figure | Value | How to recompute |
|---|---|---|
| Commits | **341** | `git rev-list --count HEAD` |
| Development span | **2026-05-17 → 2026-08-09** (12 weeks) | `git log --reverse --format=%ad --date=short \| head -1` |
| Application code (TS/TSX/Rust) | **36,525 lines** | `find src src-tauri/src -type f \( -name "*.ts" -o -name "*.tsx" -o -name "*.rs" \) \| xargs wc -l \| tail -1` |
| — of which Rust | **12,759 lines** | `find src-tauri/src -name "*.rs" \| xargs wc -l \| tail -1` |
| — of which TypeScript | **23,766 lines** | `find src -type f \( -name "*.ts" -o -name "*.tsx" \) \| xargs wc -l \| tail -1` |
| Design documentation | **5,367 lines** across 16 documents | `wc -l docs/*.md \| tail -1` |
| Product specification | **1,611 lines** (`PLAN_EN.md`) | `wc -l PLAN_EN.md` |
| Automated tests | **268 Vitest + 45 cargo = 313** | `npx vitest run` · `cargo test --manifest-path src-tauri/Cargo.toml` |
| Test files | **25** | `find src scripts -name "*.test.*" \| wc -l` |
| Database schema migrations | **14**, each with a named registry entry and a pre-migration snapshot | `PRAGMA user_version` on any live database; registry in `src/lib/db/client.ts` |
| MCP tool surface | **14** (10 read, 4 write-gated) | `tools/list` against `spool --mcp`; see §5 for the exact invocation |
| Localisation | **2 languages**, machine-checked for gaps | `node scripts/i18n-check.mjs` → `(none missing)` |

**Version history**: v0.3.0 (2026-07-30, first packaged release) → v0.4.0 (2026-08-09 close-out,
published 2026-08-10 — see §1.2).

### 1.1 What the test count does and does not prove

313 is a count, not a claim of coverage, and two of those tests are worth naming individually
because they are the ones that catch the failures this codebase actually has:

- **The cross-language golden test.** The context packer exists twice — once in TypeScript for
  the GUI, once in Rust for the MCP server — and the two must produce byte-identical output. One
  fixture file is asserted from both sides (`src/lib/pack/fixtures/golden-pack.expected.txt`), so
  a change to either renderer fails the suite until the other one matches. Timestamps are
  normalised, because raw bytes are timezone-dependent.
- **The migration round-trip.** Every schema step ships with SQL that takes the database back
  down one level, so the next step's migration always has something to migrate *from*. Without
  it, a migration test can only assert on a database the migration already produced.

### 1.2 Release record

One row per published release. **Notarisation submission ids are recorded here because they are
the only figures in this ledger that cannot be recomputed** — Apple's `notarytool` returns them
once, at submission, and there is no later query that recovers them.

| Field | v0.4.0 |
|---|---|
| Published | **2026-08-10** |
| Tagged commit | `84625db` |
| Signing identity | Developer ID Application (Apple Developer Program, Team `Q5Y5JRXZ58`) |
| **Notarisation — `.app`** | submission `89ebaceb-f883-4b1c-a6eb-86392769d132` · **Accepted** |
| **Notarisation — `.dmg`** | submission `f7a15d9a-737d-4132-a54e-578d9f41fd7f` · **Accepted** |
| Artefact | `Spool_0.4.0_aarch64.dmg`, 7,888,896 bytes |
| sha256 | `933b9a7fb10a25f72cbd922c7c0a1d89fe02ef83b6a3885fba0dc0ec08b7df54` |
| Gatekeeper verdict | `accepted` · `source=Notarized Developer ID`, **both artefacts** |

**Why two submissions for one release.** The build tool notarises the `.app` and then signs — but
does not notarise — the `.dmg` that wraps it. A user downloads the `.dmg`, and that is what
Gatekeeper inspects, so an unnotarised wrapper produces the "unidentified developer" warning even
though the application inside is fully notarised. The second submission and the stapling step are
therefore mandatory, and the acceptance check has to be run against **both** artefacts. Verified
here with `spctl -a -vv -t install` on each, and with `codesign -dvv` confirming the signing
authority resolved to the Developer ID certificate rather than the local development certificate
the build configuration names by default.

---

## 2. Measured findings

These are the rows that matter most: results obtained by measuring a running system, not
descriptions of what was built.

### 2.1 Where context overload actually comes from

Measured 2026-08-07 against the live library. The prevailing assumption — including this
project's own, written into its design documents — was that sustained AI interaction would be
what eventually overflows a project's context budget. The measurement contradicted it.

| Figure | Value |
|---|---|
| One real project's pack | **26,163 of 50,000 characters — 52% of budget** |
| Share of that volume written by the user pasting documents | **95%** |
| Share written by AI clients over MCP | **5%** |
| Ratio of average block size, user-pasted vs. AI-written | **11×** |

**The conclusion**: AI writes are the *cheapest* content in the library, by an order of
magnitude. What fills a budget is a human pasting a 3,500-word document. This reversed the
priority of two planned features — deduplication was downgraded, and retirement/correction (which
addresses staleness, not volume) was promoted and shipped.

Evidence: `DESIGN_CONTEXT_HYGIENE.md` §9.1. The table there contains character counts and source
labels only — no content. It is, deliberately, already in publishable form.

**Recompute** (any library, no content disclosed):

```bash
sqlite3 -readonly <spool.db> \
  "SELECT b.source, COUNT(*), SUM(LENGTH(b.content)), AVG(LENGTH(b.content))
     FROM blocks b GROUP BY b.source ORDER BY 3 DESC;"
```

### 2.2 What deduplication is actually worth

Measured 2026-08-07 on the same library: one exact-duplicate pair, similarity 1.0, 3,503
characters each — **13% of the pack, and a one-time recovery, not a recurring saving.** This is
the number that demoted the feature. It also produced a better answer than merging: marking one
copy as no longer valid removes it from the pack while keeping it in the library and searchable,
which costs nothing in the append-only model.

Evidence: `DESIGN_CONTEXT_HYGIENE.md` §9.2 and §9.4.

### 2.3 First write by an external AI client

2026-08-07, 16:47–17:09. The ChatGPT desktop application, connected over MCP, was given one
ordinary sentence in the user's own words — no tool names, no instructions.

| Figure | Value |
|---|---|
| Blocks written | **11**, into a project it created itself |
| Average block length | **970 characters** |
| Tool chain, unprompted | `list_threads → create_thread → add_block ×12 → get_pack (self-check) → list_threads → add_block ×2 → set_thread_summary` |
| Source label applied | `Codex · MCP` — enforced by the server, not settable by the client |
| Errors, and recoveries | **2 errors, both recovered without help** (one was a missing required field) |
| Dry-run calls | **0** |

Two things this establishes, and one it does not. It establishes that the write path is
discoverable from plain language, and that the refusal messages are actionable enough for a model
to correct itself unaided. It does **not** establish that any instruction written into a tool
description will be followed — see §3.4.

Evidence: `DESIGN_MCP_WRITE_ROLE.md` §9. Raw client-side trace:
`~/.codex/sessions/2026/08/**/rollout-*.jsonl`, tool calls identifiable as
`payload.type == "custom_tool_call"` containing `tools.mcp__spool__`. **Publishing requires
redaction** — the project name and every block body are real application material.

### 2.4 Cost of one live web-search run

2026-08-07: **approximately $0.45** for a single Follow up run on the cheapest available model,
which found and produced fixes for three bugs (see §3.4). Recorded in the run's own cost field,
which the engine layer parses from the CLI's output.

---

## 3. Failures and fixes

Each entry: what broke, why, and — the part that matters — what became structurally different
afterwards. Ordered by how much they changed the system, not by date.

### 3.1 The live database was wiped (2026-05-29)

**What happened.** Every block in the live library was destroyed at approximately 15:11.

**Root cause.** The schema-migration function had an unconditional `else` branch that dropped and
rebuilt all tables whenever the on-disk `user_version` was one it did not recognise. Development
happened by switching between git builds against the *same* live database — so running an older
build, whose schema constant was *below* the database's version, took that branch and silently
destroyed real data. The trigger was the development workflow, not a code path anyone would call
by hand.

**Recovery.** SQLite with `secure_delete` off leaves deleted rows in free pages. `sqlite3
.recover` plus a purpose-written free-page carver recovered **33 blocks** spanning 5/24–5/29;
anything older had already been overwritten. Blocks kept their `thread_id`, so grouping survived,
but deleted thread and workspace *titles* were unrecoverable — small metadata pages are reused
first.

**What changed structurally** — this is the load-bearing engineering in the data layer, and all of
it exists because of this one day:

1. A populated database on an unrecognised schema version now **throws instead of rebuilding**
   (`1892a78`, committed the same day).
2. Migrations walk a **named registry** with version constants asserted on both the TypeScript
   and the Rust side (`7c07bdd`), so a build and a database can never disagree silently.
3. A **`VACUUM INTO` snapshot is written automatically before any migration runs**, next to the
   database.
4. The fresh-install tutorial seed lives **only** in the empty-rebuild path and must never be
   made reachable for a populated database.
5. On-device verification moved to an **isolated build workflow** under a throwaway bundle
   identifier, so a development build cannot open the production file by accident.
6. Anything that runs at launch and touches project tables is treated as this bug's shape. A
   later feature that needed a project of its own creates it on a real user-visible outcome, never
   at startup.

**Why it is in a public ledger.** A data-loss incident is not a line anyone wants on a project
page. It is on this one because the guards it produced are the most consequential engineering in
the product, and they are only legible next to the failure that motivated them.

Evidence: `1892a78`; `7c07bdd`; `src/lib/db/client.ts` migration registry;
`docs/DB_BACKUP_AND_RECOVERY.md`.

### 3.2 A single state selector turned the main window white (2026-08-05)

**What happened.** Types checked, all tests passed, the build signed and packaged — and the
installed application showed a blank main window.

**Root cause.** One Zustand selector returned a freshly allocated array on every call. Used as a
hook selector, that is an infinite re-render (React error #185).

**Why no test caught it.** Nothing in the automated suite opens a window. The failure is only
observable in a running application, and every layer of automation above it was green.

**What changed structurally.** The verification workflow now requires **looking at the window**
after packaging, under an isolated bundle identifier, before anything is called done. The specific
selector is documented as imperative-use-only, with a known-good pattern to copy — subscribe to
the grouped map and flatten in a memo.

**A second, permanent limitation found the same way**: synthetic mouse clicks cannot drive this
webview. Anything whose failure mode is "what it looks like after you click" cannot be verified
by automation at all, and is escalated to a human rather than assumed.

Evidence: `54241e5`; `src/components/ProjectBoard/index.tsx` (the pattern to copy).

### 3.3 The capture gesture collided with another application (2026-07 → 2026-07-31)

**What happened.** Double-tap ⌥ is also Claude Desktop's quick-entry shortcut — and as an MCP
host, that application is always running. Every capture fired both.

**The fix, in two layers.** First, a **copy gate**: only a double-tap within 10 seconds of a
⌘C/⌘X counts as a capture, so a bare double-tap still belongs to whoever else wants it. Second,
when Spool *does* consume the gesture, it **deletes the second key-down and its key-up from the
event stream**, so the other application sees a single tap.

**Three findings worth more than the fix itself:**

1. **Tap layer decides the outcome, and ordering is not under your control.** Session-level event
   taps are served in creation order, so whichever application launched later is served first —
   a race that cannot be won. Installing at the HID layer, upstream of every session tap, makes
   launch order irrelevant.
2. **The obvious library could not express the fix.** The Rust `core-graphics` wrapper for event
   taps structurally *cannot* delete an event — returning `None` from its callback is mapped back
   to the original event. Deletion required the raw C API with a hand-written trampoline.
3. **A partial-authorisation state inverted the feature.** With Accessibility granted but Input
   Monitoring not, the copy gate switched off while the deleting tap stayed active — so *every*
   bare double-tap was swallowed, the exact opposite of the gate's purpose. Fixed by making
   suppression require both permissions (`4b68f33`).

**And one hard limit, stated rather than hidden.** With both permissions granted the tap installs
at the HID layer, where synthetically posted events are invisible — they enter at the session
layer. So the shipping gesture **cannot be script-tested at all**; earlier synthetic tests only
worked because those unauthorised builds fell back to a session-level tap. Verifying the gesture
on a real build requires a human finger. Documented as a limitation, not worked around.

Evidence: `b5e1bd6`; `a0c6954`; `4b68f33`; `18dbcb4`; `src-tauri/src/double_tap.rs`.

### 3.4 A rule written in the prompt was broken on its first real run (2026-08-07)

**What happened.** Follow up must never propose a finding without a source URL. The rule was in
the design document and in the prompt from the start. On the first real run, **2 of 3 proposals
had no URL in the block body** — the model had put the links in its closing message to the user
instead.

**The fix and the proof.** The prompt was changed to name the field explicitly and to state where
the URL must *not* go. On the next run, **5 of 5 proposals carried a URL**, verified by
measurement rather than by reading the output.

**What changed structurally.** A standing rule for anything involving a subprocess or an external
client: *a rule written in a prompt is not a rule in effect.* Only a real run answers whether a
model complies. Three separate features have now been built, tested, and wired up correctly while
being entirely non-functional in reality — this one, an effort-level control (§3.5), and one
earlier prompt rule. Reading a binary's strings proves a word is present; it cannot prove the
behaviour is live.

Two unrelated bugs surfaced in the same run and were fixed with it: a TTL implemented on the
TypeScript side but not the Rust side, and full-width punctuation being absorbed into parsed URLs.

Evidence: `HANDOFF` history §3.3; `DESIGN_FOLLOW_UP.md`.

### 3.5 A shipped feature that does nothing, kept and disabled (2026-08-07)

An effort-level control for the Claude Code engine was implemented end to end: environment
variable plumbed through, Rust test asserting it, UI wired. It does not work — every model the
installed CLI can reach returns HTTP 400, *"This model does not support the effort parameter."*
The variable is forwarded correctly; the API rejects it. A separate bug found in the same session:
the CLI's `opus` alias resolves to a snapshot that 404s.

**What was done about it.** The UI is switched off behind a single constant, the plumbing and its
test stay, and the condition for re-enabling is written down: retest after the CLI updates. A
model picker that could select a failing option was removed rather than left to fail in front of
a user.

**Why it is in the ledger.** It is the clearest case of the §3.4 lesson, and of a judgement worth
being able to point at: shipping a control that silently fails is worse than shipping no control.

Evidence: `EngineBar.tsx` (`EFFORT_PICKER_ENABLED = false`); Rust test `claude_effort_env`.

### 3.6 A free tier that measured as unusable (2026-08-06)

The design assumed the Codex CLI's free tier made the engine slot reachable without a
subscription. Testing it: the free allowance is exhausted in roughly two runs and then locked for
a month. The plan was corrected rather than the finding — the engine slot is documented as serving
subscribers only, and a genuinely free option remains an open item instead of a claimed feature.

Evidence: `DESIGN_AI_ENGINE.md` §7.7.

### 3.7 Two failures whose only symptom is silence

Both are documented because neither would ever surface as an error, and both cost real time:

- **A golden fixture regenerated in the wrong timezone.** The expected files were generated under
  UTC+1; regenerating on a UTC+8 machine shifts every timestamp by seven hours. Date
  normalisation means **the tests pass either way** — so the fixture must be regenerated with
  `TZ=Europe/London` explicitly, and the tests cannot be trusted to catch it.
- **A raw-string delimiter closed early.** The instruction header is a Rust `r##"…"##` literal,
  not `r#"…"#`, because the text itself contains `"#12"` — and `"#` would terminate `r#"`.

---

## 4. Boundaries stated on purpose

Where a case study is normally silent, and where the honest answer is more useful than the
flattering one.

| Boundary | The position |
|---|---|
| **Licence** | There is **no `LICENSE` file**, and that is a decision, not an oversight. A public repository without one means all rights reserved: the code may be read and reviewed, not copied, modified, or redistributed. Adding a permissive licence is a one-way door — once a version ships under it, that version stays licensed forever. Wording for the public page: *"Source-available for review; all rights reserved. Not licensed for reuse."* |
| **Auto-update** | None. Direct notarised `.dmg` distribution means new versions are a manual download. |
| **Mac App Store** | Not submitted, and cannot be without removing the product's core gesture — sandboxing conflicts structurally with the global event tap. |
| **Platform** | macOS only in practice. Cross-platform is feasible via Tauri, but the capture trigger, the focus handling, and process-group cancellation are all macOS-specific and would need rewriting rather than porting. |
| **The gesture cannot be automatically tested** | See §3.3. Stated as a limitation. |
| **"What it looks like after you click" cannot be automatically tested** | See §3.2. Escalated to a human every time. |
| **Codex's shell tool cannot be removed** | Claude Code's tool whitelist can deny shell access outright; the Codex CLI has no equivalent switch. Spool runs it read-only sandboxed instead, and says so in the interface rather than papering over the difference. |

---

## 5. Reproducing the tool-surface count

```bash
printf '%s\n' \
  '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"probe","version":"1"}}}' \
  '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
  '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
  | /Applications/Spool.app/Contents/MacOS/spool --mcp
```

Read tools (10): `list_threads`, `get_digest`, `get_pack`, `search_blocks`,
`find_similar_blocks`, `get_blocks`, `check_library`, `weekly_review`, `thread_health`,
`distill`.
Write tools (4, behind a second consent switch): `create_thread`, `add_block`,
`propose_blocks`, `set_thread_summary`.

---

## 6. Still to gather

Tracked here so the gaps are visible rather than discovered late. Plan and sequencing in
`DESIGN_CASE_STUDY.md` §4.

- [ ] **Architecture diagram** — desktop shell / MCP stdio server / CLI engine slot / local
      SQLite. Scheduled after the application code is finished, alongside the demo video.
- [ ] **Screenshots** — the current set is stale: the block feed, the right-hand rail, and the
      project board all changed appearance in v0.4.0. Each replacement has to depict a real
      usage scenario, not a feature.
- [x] **Notarisation receipt** — captured 2026-08-10 at the v0.4.0 release; both submission ids
      are in §1.2.
- [ ] **Target-user section** — the only part of the public page with no existing source
      material; it has to be written from scratch.
- [ ] **MCP / CLI / desktop relationship** — the material exists across three design documents
      and needs condensing into one page a non-specialist can read.
