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
> **⚠️ One authorised exception to "never rewrite", 2026-08-09.** Thirteen dates in this file
> ran ahead of the calendar — entries written on 2026-08-07 / 08 / 09 were labelled 08-10
> through 08-13, and the v0.4.0 release was recorded as published two days after it actually
> was. They were corrected in place rather than annotated, on the owner's explicit call, because
> this file's whole purpose is that a claim can be checked: a reader comparing §1.2 against the
> git tag would have found the ledger wrong on the first thing they tested. **Every corrected
> date was taken from the commit that first recorded the claim** (`git log -S"<phrase>" --date=short
> -- docs/CASE_STUDY_LEDGER.md`) or, for the release, from the `v0.4.0` tag. One consequence
> was corrected with them: §3.11 said the withdrawn tier was re-checked "three weeks later" when
> both entries landed the same day. No figure, finding, or wording other than these was touched.
>
> **⚠️ A second authorised exception, 2026-08-09 — §5's tool counts.** §5 tells the reader to run
> a command and then states what it prints: 14 tools, 10 read and 4 write. Four tools shipped that
> day and the printed answer became 18. The correction was first appended as a superseding line
> under the stale one, which is what this file's rule asks for; on the owner's explicit call it was
> then edited in place instead, on the same reasoning as the dates above — §5 is not a historical
> claim but a *reproduction recipe*, and a recipe that disagrees with its own command fails the
> first check anyone makes. The old figure is kept as a trend line rather than deleted. **This
> remains an exception, not a repeal: a figure that changes still gets a new dated row.**
>
> **Disclosure rule.** What may be published is *shape and count*, never content. The live
> library holds real graduate-application material — deadlines, personal documents. Every figure
> below is a number, a source label, or a one-line description of a mechanism. If a row cannot be
> stated without quoting the library, it does not belong here.

---

## 1. Project scale

Measured 2026-08-07, at the v0.4.0 close-out. Run each command from the repository root.

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
| Automated tests *(2026-08-09)* | **313 Vitest + 61 cargo = 374** | same commands |
| Database schema migrations *(2026-08-09)* | **16** (schema v19) | same |
| MCP tool surface *(2026-08-09)* | **17** (11 read, 6 write-gated) | same. Two of the six write-gated ones store nothing in the library: they queue a permission request and a proposed search rule for the user to answer |

**Version history**: v0.3.0 (2026-07-30, first packaged release) → v0.4.0 (2026-08-07 close-out,
published 2026-08-08 — see §1.2).

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
| Published | **2026-08-08** |
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

### 2.5 What a free AI tier is actually worth as infrastructure

2026-08-08, evaluating whether a free API tier could power the maintenance engine for users
with no paid subscription. Run against a copy of the live library — real material, real
prompts, isolated working directory and home directory.

| Figure | Value |
|---|---|
| Free-tier allowance, measured | **20 requests per model per day** |
| Published/assumed figure the design was planned on | **1,500 per day** — wrong by **75×** |
| Actions that completed | **2 of 4** (compress, health check) — 2 requests and under 40s each |
| Actions that could not complete | **2 of 4** (web follow-up, weekly review) — the multi-turn ones |
| Requests one failed follow-up consumed | **20 — the entire day's allowance for that model** |
| Tokens to answer a one-word prompt | **15,502** (system prompt plus tool definitions) |
| Paid-engine baseline on the identical prompt | **$0.062**, one turn, same quality |

Two findings that only a real run could produce, both now load-bearing in the code:

- **The quota is metered per model**, which is the only reason the tier is usable at all: when
  one model's allowance is gone, another still answers. That turned the model picker from a
  convenience into the control that decides whether the next run happens.
- **The CLI's retry behaviour spends the allowance defending against its own rate limit**, then
  reports "you have exhausted your daily quota" — describing a tier that supports roughly one
  and a half serious runs per day as though the user had used it up.

**What was shipped as a result**: the free engine is offered, ranked last, with the web action
withheld rather than shown-and-failing, and the allowance stated in the interface in the words
above. Design rationale in `DESIGN_AI_ENGINE.md` §7.8.

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

### 3.8 A tier of the product was designed on a number that was wrong by 75× (2026-08-08)

The plan to support users without a paid AI subscription rested on one figure written into the
design document: a free API allowance of **1,500 requests per day**. It was recorded with a
warning attached — *re-check this table before building on it, it will go stale* — and four days
later the first real run measured the true figure at **20 per day**.

Nothing in the toolchain could have caught this. The number was not in the code, not in a type,
and not in any test; it was a sentence in a plan, and it was wrong in the direction that makes a
feature look viable. The design that followed from it — a free tier equal in standing to the
paid ones — would have shipped a slot where half the actions could not finish, which is the
same trap this project had already documented once for a different vendor's free tier.

**What changed structurally.** Three things, none of them "fix the number":

1. **The engine adapter now encodes measurements, not intentions.** Every non-obvious flag in
   it carries the date it was verified and what was observed. Three of them are marked as
   failing *silently* if wrong — a workspace-trust variable whose absence disables the tool
   server while the run still bills, a working directory that IS the configuration, and a
   server allow-list that is the only barrier against the user's own configuration. Each has a
   test asserting it, because none of them would produce an error.
2. **Capability became a property of the engine, not of the product.** The action that cannot
   complete on the free tier is withheld from it in both layers — the interface does not draw
   the button, and the runtime refuses the call even if something else asks for it, because the
   engine that runs is not always the one the interface was looking at.
3. **The limit is stated in the interface in plain numbers.** Not "may be rate limited" —
   "about 20 runs a day per model, enough for these two actions and not for that one".

The general form, and the reason this entry exists: **a documented figure with a warning on it
is still an unverified figure.** The warning did not prevent a design being built on top of it.
Only running the thing did.

### 3.9 One missing metadata field made two tools uncallable on one client (2026-08-08)

The user reported that a weekly review had come back saying it could not read his projects:
*"I tried to read the full records for two projects, but the reads were cancelled."*

The tool descriptor advertises fourteen tools. Twelve carried an `annotations` object declaring
whether the tool writes; **two did not** — an omission with no effect on anything the project
could test. The tools listed correctly, described correctly, and ran correctly against every
local probe.

They did not run on the user's client. A headless agent runs with approvals disabled, so a tool
whose descriptor does not declare it read-only falls into an approval path that, with no human
present, resolves as **"user cancelled"**. Measured against the real CLI, the pattern was exact:

```
list_threads  {}                      → failed · "user cancelled MCP tool call"
list_threads  {"title_contains": …}   → failed · "user cancelled MCP tool call"
check_library {}                      → completed
get_digest    {"since_days": 7}       → completed
```

The two undeclared tools were the two that mattered most: the catalogue call the server's own
instructions tell every client to make **first**, and the deep-read call the weekly-review
prompt uses to expand a project. So the feature did not degrade — it was blind on that client
from the day it shipped, and it reported that fact in prose the interface displayed as success.

Two lines of JSON fixed it. What is worth recording is the shape: **an omission in metadata,
invisible to every local check, whose only witness is a third-party client refusing the call.**
The guard added afterwards asserts the property rather than the values — every tool must
declare, and only the four writers may declare that they write.

### 3.10 A parser's complaint impersonating the program it was parsing (2026-08-08)

The same session's second report was a maintenance action failing with:

```
could not read the CLI's JSON output: EOF while parsing a value at line 1 column 0
```

That message is a JSON library describing empty input. The engine had in fact explained itself
clearly — *"Please set an Auth method … GEMINI_API_KEY, GOOGLE_GENAI_USE_VERTEXAI, …"* — but on
**stderr**, while the reader looked only at stdout.

The reader returned one error type for two different situations: *the engine reported a failure*
and *I could not read this*. The caller treated both as the engine speaking, so its fallback to
the engine's raw output could never be reached, and the useful sentence was discarded in favour
of a parser's. Splitting the two — return nothing when there is nothing to read — restored a
policy the project had already committed to in writing: **pass the tool's own words through,
never invent a message.**

The engine also prints its diagnostics above the structured output rather than only within it,
so parsing the stream as a whole fails on text the engine considers ordinary.

### 3.11 A product tier removed by its vendor between design and use (2026-06-18 → 2026-08-08)

§3.8 recorded a free allowance measured at 20 requests per day against a documented 1,500. Later
the same day the same tier was checked again, and the finding had changed category: the free
sign-in route no longer exists at all. The vendor's own response to a run:

```
IneligibleTierError: This client is no longer supported for … individuals.
```

The service was withdrawn for free and consumer-paid users on **2026-06-18** — before the
integration built against it was written, and without that being apparent from either the tool
or the third-party documentation still describing the old limits.

Recorded as its own entry because it is a different lesson from §3.8. There the published number
was wrong and measurement corrected it. Here **measurement was also correct, and then the thing
measured was withdrawn** — so a dependency on somebody else's free tier is not a figure to
verify once, but a claim with a shelf life. The feature that relied on it is retained; what
changed is that the product no longer describes it as the route for users without a
subscription.

### 3.12 Everything passed, and the typography was still wrong (2026-08-09)

A Markdown renderer was written for block bodies, in response to a user complaint that the raw
`**`, `#` and `-` markers looked untidy. It shipped with four green baselines, eighteen new
tests including four that render the component to a string and assert on the markup, and the
three indirect signs a running build is healthy (steady CPU, write-ahead log created, clean
stderr). The user's first look produced three findings, all correct, none of which any of that
could have caught:

- **the bold was too heavy** — a fixed weight 600, which on the Chinese font in use resolves to
  Semibold. In Chinese type that weight reads as shouting; Medium is the emphasis weight. The
  fix makes bold one step above whatever it sits in rather than an absolute number;
- **the heading sizes did not separate** — six levels at 17/16/15/14/13/13 px against body text
  of 15px. Level 3 was the same size as body text and level 1 was two pixels larger. Written
  down, the six levels look like a scale; on screen there were effectively two;
- **it read cramped** — 8px between paragraphs where standard Markdown uses a full line.

Every one of these is a number that was chosen without seeing it. Tests can assert that a
heading is a heading; they cannot assert that it looks like one. The project already knew the
boundary — screenshots are unavailable on this machine (§3.2 is the same boundary discovered
through a white window), so "does it look right" was documented as the user's to answer. This
entry records what that costs when the answer arrives one round trip later: a renderer that was
correct in every mechanical sense and wrong in the only sense it was built for.

The second half of the same report — that the weekly review screen showed raw `##` — is a
different shape of the same gap. The renderer was attached to the surface that prompted the
complaint, and the surface where the AI writes its *longest* Markdown was not checked, because
nobody had looked at it either.

### 3.13 The fix for §3.12 overshot, and a second invented number turned up beside it (2026-08-09)

The response to "the heading sizes did not separate" was to put them on the standard editorial
scale — the one a Markdown document on the web is set in, topping out at 1.45em for a level 1.
It passed its tests, including a new one asserting six strictly descending sizes. The user's
next look was one sentence: **the headings are far too big, put them back.**

Both settings were derived the same way: from what Markdown is supposed to look like, rather
than from what this surface is. A block is a card in a scrolling feed, a few sentences long. A
document's scale assumes a page, where a level 1 heading appears once and is a title. Dropped
into a feed, the same ratio makes every heading shout. The first attempt was too flat and the
second too loud, and neither number came from looking at the thing.

Recorded beside a second number found the same day, because it is the same mistake in different
clothing. Collapsing long blocks had been triggered at **8 lines** — a constant with no
derivation anywhere in the design record. The user's replacement was not a different number; it
was a **rule**: a block that fits on the screen is not folded, and only a block taller than the
reading area is. The implementation now measures the feed's own viewport instead of holding a
constant at all, so the threshold cannot drift from the thing it is about.

The lesson the two share: a number chosen at the desk needs a source outside the desk. "What the
convention says" and "what seemed about right" are both sources that cannot be checked, and both
produced a value that a single glance at the real screen overturned. Where a rule can be stated
instead — *fits on screen* — the rule survives contact and the constant does not.

### 3.14 The same day, a third invented number — and the probe that settled it in one run (2026-08-09)

Hours after §3.13 was written, a feature shipped with a fourth-generation instance of the same
mistake. Dates written inside a note's text had never been surfaced anywhere; the new reminder
raised any that fell **within seven days**. Seven was chosen the same way the others were: it
sounded like a reasonable amount of notice.

The user installed it and reported: *I don't see this thing.*

What is worth recording is not the mistake a third time, but the response. Rather than reason
about the interface or start editing it, a **throwaway probe** was written — a temporary test
that opened the real library read-only, fed every note's text to the *actual* detector the
feature uses, and printed each date found, how many days away it was, and whether the feature
would show it. It ran in three seconds and was deleted immediately. One screen of output
settled every open question at once:

- the detector was **not** broken — it found 31 dates, including every application deadline
  across four institutions;
- the user's **nearest upcoming date was 23 days out**;
- the deadlines the feature exists for were **114 to 170 days out**;
- so under a 7-day window, showing nothing was the *correct* behaviour, and would have stayed
  correct until sixteen days later.

A window wide enough for a 170-day deadline is not a window, so the window was deleted rather
than widened. What replaced it is again a rule with a bound that is not a date at all: a
project shows its **three nearest upcoming dates**, says how many more it holds, and every row
can be silenced individually.

The transferable part is the probe. This project cannot screenshot itself (§3.2, §3.12), so
"what does it look like" genuinely requires the user. But *"why would it show anything at
all"* is a pure function over data that is sitting right there — and that layer can always be
run against the real library, in seconds, before touching a line of interface code. The three
earlier entries were each closed by the user noticing something. This one was closed by
measurement, one round trip after the report.

### 3.15 A permission designed for a door that was already open (2026-08-09)

The project file library was specified in three phases, and the third was the only one with a
security surface: an AI may **ask** to read a file the user put in a project, the user answers
on a review screen, and a yes is a standing grant. The design document opens with a survey of
the current state, and one row of that survey read: *no tool can read an attachment's text;
`get_pack` carries the text of files the user ticked, and that is all.* Every argument for the
feature's shape rests on that row.

It had stopped being true. Phase **two**, shipped six days earlier, moved files from blocks to
projects and rebuilt how `get_blocks` reports them — and gave that tool an
`include_extracted_text` flag that returned **every file's full text, for every file, with no
condition attached**. Nothing was hidden and nothing failed: the flag was documented, tested,
and did exactly what its own description said. It simply meant the permission being built in
phase three would have guarded a door that the tool beside it had already opened.

Two things are worth separating here.

The first is the failure mode: **a design document's "current state" section ages, and it ages
against your own later work.** The row was accurate when it was written. What made it dangerous
was that it was still being *read* as accurate a week later, by the same author, while
implementing the feature that depended on it.

The second is what the fix had to weigh. The obvious repair — refuse file text unless the user
granted access — breaks the path by which an AI would ever know a file is worth asking for. If
a search hit inside an ungranted file is dropped entirely, no model can ask a question it has
no way to form, and the request tool becomes a door with no handle. The rule that shipped
splits the difference along the line that actually matters: **a locked file still reports its
name, its size, and its id; it reports no word of its contents.** A search hit inside one says
*the phrase you are looking for is in this file* and shows no snippet. That is enough to ask
with, and nothing to read.

The check that would have caught it is cheap and is now the habit: when implementing phase *n*
of a plan, re-verify the "today it works like this" claims phases 1…*n*−1 were allowed to
change — against the code, not against the document.

---

### 3.16 Three tools shipped, three tools invisible — the router nobody updated (2026-08-09)

Three new tools went out the same afternoon: ask to read a file, read what a project is
watching, propose a change to it. Each got a careful description, the mandatory annotations,
its own tests, and a live stdio run against the real binary. That evening the owner exercised
all three from a third-party client for the first time. **All three mechanisms worked. Two of
the three were never reached.**

The forensics are unusually clean, because the library records what happened: over that
half-hour the model wrote twelve blocks by direct append and queued **zero** proposals — while
the user had said, in as many words, *"put the Flux ones in Flux and the rest in the other
project,"* which is the split-and-review tool's entire reason to exist. Asked what a project
was watching, the model never read the brief; it invented a plan and appended that instead, as
two permanent blocks titled *"current follow-up."* Asked what a file said, it named the file
correctly and then told the user to go upload the PDF somewhere else.

Two separate causes, and the second is the one worth keeping.

**The affordance was written on a path the model had no reason to walk.** A locked file's "here
is how to ask for it" sentence is emitted only when the caller has already opted into
`include_extracted_text=true`. A model answering *what files are in this project* does not set
that flag — it wants the catalogue, not the contents. So it received a file marked unreadable
with no stated way in, plus, from the project briefing, the line `[extracted: yes, not
inlined]`. Its reply to the user was a faithful paraphrase of that line. §3.15 above had argued
that a locked file must still report its name and size, because otherwise the request tool
becomes *a door with no handle*. The handle was built — on one of the three corridors that lead
to that door.

**And the routing table was never updated.** The server's `initialize` instructions carry a
short list of what the user might say and which tool answers it; a comment above them notes,
correctly, that this is the one surface every client reads. Thirteen of seventeen tools are
named there. The four that are not include all three shipped that day. The full tool schemas —
thirty thousand characters of them — were complete and correct, and a model reads those as a
manual it consults *after* deciding whom to ask, not as the thing that decides.

The generalisation: **a capability is not shipped when its mechanism works; it is shipped when
the surface that routes intent to it names it.** Descriptions, tests and a protocol-level smoke
run all passed while two of three features were, in practice, unreachable. What found it was
one person talking to the tool in their own words — and the tell was in the database, not in
the transcript: the tool-call counts said plainly which doors had been opened and which had
been walked past.

A smaller, related note on honesty in error messages. `add_block`'s description says *"there is
no edit or delete tool, so a mis-written block is permanent."* True of the model's toolbox.
The model relayed it to the owner as a property of the product — *"Spool does not support
editing or deleting"* — while the app has had both, with undo, all along. A sentence about what
**you** cannot do will be repeated as a sentence about what **the software** cannot do. Write
the subject in.

### 3.17 The same rule, broken twice, made into an assertion the second time (2026-08-09)

§3.16 is the diagnosis; this is what fixing it taught, and the lesson is not the fix.

Two defects of one class have now landed in this project within two days of each other. Both
are rules that were known, written down and agreed before the code was written. Both were
broken anyway, by the person who wrote the rule. Both are **completely invisible in the
developer's own environment** and fatal in somebody else's:

| The rule | How it broke | What it cost |
|---|---|---|
| Every tool must declare `annotations` (§3.9) | One tool shipped without them | That tool was uncallable on one third-party client; local tests and a protocol smoke run were green |
| Every tool must be named in the routing text (§3.16) | Three tools shipped without a line | Two of three features unreachable in a real session; local tests, annotations and a stdio run were green |

The instinct after the first one was to write the rule down more emphatically. It was written
down. The second break happened anyway, in a window that had the first one's write-up open.

What actually changed the outcome, both times, was converting the rule into an assertion that
fails the build: one test walks the tool list and refuses any tool without a read/write
annotation; its sibling now refuses any tool whose name appears in neither routing string. The
second test is four lines long and would have caught the whole of §3.16 before it left the
machine. **A rule that only a human can enforce is a rule that gets broken on the day the work
is otherwise finished** — which is exactly when nobody re-reads the rules.

Two smaller findings from the same repair, both about affordances rather than mechanisms.

**The defect was one level of indentation.** The sentence telling a model how to ask for a
locked file sat inside `if include_extracted_text`, i.e. behind the flag a model sets only when
it has already decided to read file contents. Asked *what files are here*, it never sets that
flag, so it met the one description of the way in that it had no reason to read. The mechanism,
the permission model and the review screen were all correct; the feature was unreachable
because a true sentence was in the wrong branch.

**A renderer with two audiences cannot carry either audience's affordance.** The obvious place
to put "ask for this file with `request_file_access`" was the project briefing, next to the line
that already says the file's text exists but is not included. That briefing is also what a human
copies to their clipboard, and it is held byte-identical to a second implementation by a golden
fixture. Telling a person to call a tool is gibberish; forking the two renderers would end the
one guarantee that keeps them equal. The affordance had to ride *beside* the artifact instead of
inside it — appended after the briefing, outside its size budget, on the machine-facing path
only. When one output serves a person and a program, an affordance for one of them is noise to
the other, and the shared renderer is the wrong home for both.

### 3.18 A column nobody reads, and the test that could not see the bug (2026-08-10)

Two findings from adding one thing: a stored record of where a block came from — the page, the
day it was read, the day it stops being safe to trust (schema v20).

**The prior failure this was designed against was a column with no reader.** An earlier version
had shipped two mechanisms for marking a stored conclusion as retired or partly wrong, and
nothing anywhere that ever brought them up. Both worked. Both went unused, because using them
required the user to remember, unprompted, that they existed. So the new expiry date was not
allowed to ship until it had two places that read it back: the project briefing marks the block
once its date passes, and the per-project overview counts how many are due. The rule that came
out of it is worth stating plainly — **a written field with no read path is not a feature, it is
a liability with a schema migration attached**, and the discipline is to build the reader in the
same change as the writer, not the next one.

**The second finding is about a test that was already there and could not have caught this.**
The two renderers — one in TypeScript for the application, one in Rust for the MCP server — are
held byte-identical by a golden fixture. That comparison normalises every `YYYY-MM-DD` in both
outputs to a placeholder token before comparing, because the existing timestamps render in the
machine's local zone and the file has to hold on any machine. The new fields are *days*, not
moments, and are stored at UTC midnight so a date survives being read east or west of where it
was written. A renderer that formatted them through the local zone instead would print the wrong
day for half the world — **and the golden test would have passed, because it had already thrown
those characters away.** The normalisation that makes the fixture portable is exactly what blinds
it to this class of defect. Three assertions naming the literal date characters were added on
each side; the golden fixture keeps doing the job it can do.

Both halves generalise past this feature: *a test's exclusions are part of its specification*,
and a green suite says nothing about the axis it deliberately does not look at.

### 3.19 The routing fix, measured on the client that failed (2026-08-10)

§3.16 recorded three tools that shipped working and stayed invisible, because the two blocks of
prose that tell a client what the user is likely to say had not been updated alongside them. The
fix was prose. Prose is exactly the kind of change that cannot be shown to work by a test suite,
so the entry closed with the fix unverified — the honest state, and an uncomfortable one.

It has now been run against the client that produced the original failure, one sentence per
door, judged on the tool-call event stream rather than on how convincing the model's summary
read. Four of the five sentences were sent and all four landed on the intended tool. The one
worth a number is the sentence that had failed hardest: *"file these separately into A and B."*
Before the fix, that phrasing produced **zero** calls to the batching tool and **twelve** calls
to the single-block one — the model had reached for the tool it knew and simply done it twice.
After, the same shape of sentence produced **one** call to the batching tool and **zero** to the
other. Two more results are worth keeping: asked what was in a project's files, the model
requested access through the proper channel instead of telling the user to send the file by
some other means; asked to follow up, it read back the user's own standing brief before going
anywhere, rather than inventing a goal.

The transcript also shows what the fix does not reach. The model's *first* instinct on the file
question was to shell out and search the local filesystem for anything named like the project —
it found the right tool only after listing what it had. Routing prose moved the model to the
right door once it started looking; it did not make looking the first move.

The generalisable part is a measurement discipline, not a feature: **when the failure was
"the model never chose this", the fix is only demonstrated by the model choosing it**, on the
same client, in the user's own phrasing, read off the call log. The suite was green before the
fix and green after; it had no opinion either way.

### 3.20 A verification that silently pointed at the wrong program (2026-08-10)

Checking a build that cannot be screenshotted on this machine means assembling indirect
evidence: the process is alive and idle, it holds the library open, its error stream is clean,
its window exists at a real size. Two copies of the application were running — the one just
installed for the user, and an isolated build under a throwaway bundle identifier, seeded with
test data. They share a process name.

The window-inspection query was therefore addressed by process id, which is the one identifier
that cannot be ambiguous. It returned the *other* process. Asked to filter by numeric id, the
scripting bridge quietly ignored the filter and handed back the first matching name — and the
text it dumped was the production library's real projects, which is precisely what a passing
result would have looked like if the isolated build had rendered correctly. The check would
have certified an untested build using a screenshot of the shipped one.

What caught it was cheap and should be routine: **the target was asked to state its own
identity** — its process id and the bundle path it was launched from — and the answer named a
different application than the one requested. Only after that did the mismatch between the
listed projects and the seeded ones become legible; before it, the output looked entirely
plausible.

Two things generalise. First, **an identifier-based lookup is not self-verifying**: a filter
that is ignored fails open, and a silent narrowing failure returns a neighbour rather than an
error. Second, when two instances of the same program run side by side, every observation of
"the program" is ambiguous until something in the observation itself distinguishes them —
which is a specific instance of the rule already running through §3.4, §3.9, §3.10 and §3.16:
**the instrument is part of the experiment, and it has to be checked too.**

### 3.21 The instructions told the user to look at something that was never built (2026-08-10)

A block-level correction — *one sentence inside this older block is wrong* — had been in the
schema for several versions, rendered on both sides in the assembled briefing, and covered by
tests. It had never once been used by a real client. When the user finally exercised it, the
written test script told him what to check: *go back and see whether a line appeared under the
old block saying one point in it was corrected.*

That line existed only in the briefing text. **The application's own screen had no counterpart
and never had.** The half of the feature the user could reach — the newer block, which did
carry a visible pointer — rendered a raw preview of the older block's Markdown source, so the
one clue on screen read as `# 申请人定位… **目标。**`, and clicking it did nothing, because the
line had been deliberately specified as non-interactive under a design principle about staying
quiet.

Everything had been verified except the thing being claimed. The renderers matched each other
byte for byte; the tests asserted the marker; the acceptance script asserted the marker. All
three were checking the briefing. None of them was checking the screen, and the script was
written by the same reasoning that built the feature, so it inherited the blind spot rather
than exposing it.

Three things generalise.

First, **a correctness relation is not a footnote, and the interaction has to match**. A
citation may be ignored; a correction is an assertion *about another record*, so a pointer the
reader cannot follow costs more than the visual quiet it buys. The quiet principle was right
in general and wrong for this one case — which is only discoverable by someone using it.

Second, **an acceptance script is evidence about the author's model, not about the system.**
This one named a UI element that had never been implemented, and it survived review because
the marker string genuinely existed in the codebase — in the other renderer.

Third, the deeper fix was to stop pointing at the *record* and start pointing at the
*sentence*: the correcting party now quotes the superseded sentence verbatim, and it is marked
in place. That choice carried its own decision — store the quote, not character offsets.
Offsets are cheaper and would keep working until the moment the older record is edited, after
which they point at the wrong words **and go on rendering confidently**. A quote that no longer
matches simply stops being drawn. The failure mode was chosen for how it fails, not for how it
performs. The same reasoning put the verification at write time: the quote is checked against
the target as it is stored, because the only party able to correct a mis-transcription is the
one that is still there, and it is only still there right then.

### 3.22 A defect that was geometrically correct, and the instrument that could see it (2026-08-10)

The rework in §3.21 replaced the `#1` in front of every record with a ring around the number.
The user's next reading of the same screen was two sentences long: the number is not centred
in the ring, and the ring is not the size of the time and the text beside it.

The markup was centred. It centred with flexbox, and the typeface cooperated: in this family
the ascent minus the cap height is exactly the descent, so digits sit in the true middle of
their line box at any size. Rendered large and measured, the digit was off by 0.4% of the
diameter — nothing.

It was sized in `em`, and `em` compounds. A 0.9em digit inside a 1.5em box, on the 11px row
where the correction appears, is a 9.9px digit inside a 14.85px circle. Neither is a whole
pixel, so the leftover space that centring divides — and the glyph raster inside it — rounds
to whichever side the row happens to land on. Measured on a 2× display the digit sat 1.5px
high, and the amount changed when the row moved. Whole-pixel values leave 0.5px, which is the
floor set by type design rather than by layout: a round-topped `2` rises past the cap line.
The same compounding was the second complaint — a 14.85px ring next to text whose letters are
7.8px tall. The replacement was chosen against the text instead of against the font size: it
bottoms out level with the descenders and clears the caps by about two pixels.

Two things generalise, and one is about instruments.

**A relative unit is a claim about ratios, not about pixels.** It is the right tool at reading
sizes, where a half-pixel disappears into a 16px letter. At 9 to 11 pixels the same half-pixel
is a tenth of the shape, and the ratio the unit preserves is no longer the property that
matters. Nothing warns about the crossover.

**Nothing in the automated apparatus can see this.** Type checking passes. All 324 unit tests
pass. The parity test that compares the two briefing renderers byte for byte passes — it never
sees the screen at all. They passed before the fix and after it, unchanged, which is the
correct behaviour for tests that assert logic about a defect that contains no logic.

What replaced them was a measurement, not an opinion. The route to a screenshot of the running
application was already known to be broken on this machine (§3.2, §3.20), but the fragment
does not need the application: rendered on its own in a headless browser with the real
typeface and the real palette, with the ring drawn in one colour and the digit in another, the
ink bounding boxes subtract into a number of device pixels. That number ranked six candidate
sizes in one pass and reported the improvement as 1.5px → 0.5px. It is a narrow instrument —
it proves nothing about the assembled screen, only about the fragment — but it converts a
question that was being settled by taste into one settled by arithmetic, in a place where the
project had assumed no instrument existed.

The pattern from §3.21 held for the second time in two days: the mechanism was right, the
screen was wrong, and the person using it found in seconds what the whole verified apparatus
is built not to notice.

> **Superseded in part, same day — see §3.23.** The instrument described above was a headless
> Chrome; the application runs on WebKit. The figure "1.5px → 0.5px" is what Chrome reported.
> Measured in the engine that ships, the defect after that fix was still 1.5px, and the user
> said so on sight. The reasoning in this entry holds; the number and the instrument do not.

### 3.23 The instrument was wrong, and it reported a number (2026-08-10)

The badge in §3.22 was measured, adjusted, measured again, and reported as improved from 1.5px
off-centre to 0.5px. The user installed it, looked at it, and said the digit was still high.

The measurement had been taken in a headless Chrome. The application is a Tauri desktop shell,
which on macOS renders in WebKit. The two engines do not place a text baseline at the same
place inside a line box: the same markup, the same font file, the same device pixel ratio,
measured 0.5px off in one and 1.5px off in the other. Every step of the analysis had been
sound — the compounding units, the whole-pixel sizing, the ranking of candidate sizes — and
all of it had been performed on a different program than the one the user runs.

The correction was cheap once the right instrument existed: WebKit can be driven from a
forty-line Objective-C program that loads a file into an offscreen `WKWebView` and writes its
snapshot as a PNG, at the display's backing scale, so a pixel in the file is a device pixel.
The project had recorded that this machine's Swift toolchain was broken and had generalised
that into "the platform cannot be scripted"; the Objective-C compiler had been available the
whole time. With it, the fix is a measured 1.5px compensation and a residue of half a pixel
that cannot be removed at all: the digit's ink is thirteen device pixels tall inside a
twenty-six pixel ring, and thirteen does not divide by two. The remainder was parked below
centre deliberately, on the evidence that a digit sitting low is the error nobody reports.

What this adds to §3.20, where a verification silently reported on the wrong process, is the
harder version of the same failure. That one could be caught by asking the target to identify
itself. This one produced a plausible, precise, decimal number, from a real rendering of the
real markup in a real browser — and precision is exactly what makes it convincing. The
question that would have caught it is not "is this measurement correct?" but **"is this
measuring the thing the user will look at?"**, and nothing in the number itself can answer it.

The instrument is now in the repository (`scripts/wk-snapshot.m`) rather than in a paragraph,
with the reason it exists written at the top, because the cost of this incident was not the
half pixel. It was reporting a fix as verified to someone who could see that it was not.

### 3.24 A plan item that had been "ready to start" for three sessions (2026-08-10)

The working handoff carried a table of what could be picked up next, and its first row —
marked as the main line of work, the thing to do first — was the remaining phases of this
case study. It had been described as unblocked, and had been copied forward through three
sessions in that state.

Asked to set the next session up, someone finally opened the design document it pointed at.
Phase four needs screenshots; the screenshots were scheduled two rows further down, after a
website redesign. Phase five publishes to a page that the owner had just decided to rebuild
from scratch. Phase six waits on a condition the owner had written himself. The design
document even stated the conclusion in its own words — *there is no work here that can be
advanced right now; it is not undone, it is waiting* — one section below the part that had
been read.

The dependency ran the other way round from the plan. The user interface work at the bottom
of the list was the only unblocked item, and everything above it — screenshots, the website,
this case study — consumed its output. Ordered correctly, the list reverses.

Two things generalise.

**A status copied forward is not a status.** "Ready to start" was true when it was written and
became false when a later decision (rebuild the website) landed in a different row of the same
table. Nothing re-evaluated the first row, because a plan is read for what to do next, not for
whether its rows still hold.

**Prerequisites are recorded in the design document, not in the plan.** The plan says what;
only the document that specifies the work says what it needs. The check that closes this gap
is one sentence long and belongs before any "this is unblocked" claim survives into a second
session: *open the document and read its dependencies section.* It was skipped three times
because the row already said unblocked, which is the same trap as §3.23 — a confident record
of an answer nobody re-derived.

### 3.25 The same rule, written twice — once in a language with two truth values, once in a language with three (2026-08-10)

A sidebar widget was added that shows, permanently, how much the library holds. Two of its
numbers already existed as rules elsewhere in the code, and both had to be re-expressed as SQL
to be affordable at that frequency. Re-expressing them cost more than it looked like it would.

**The cheap query that was only cheap because nobody looked at it.** "How many things have I
captured" was implemented as *fetch every capture row, build an object for each, return the
length of the array*. That was a defensible implementation: its only caller was a one-time hint
that fires on a library young enough for "every capture row" to be a handful, and routing it
through the list function kept a single definition of what counts as a capture. Putting the
same number on a widget that is on screen all day made it a full table read per repaint. The
comment above it said what it was for — and what it was for had quietly changed.

**A predicate is not portable between two type systems.** The second number — how many
characters in the library are the user's own words — depends on a rule that already exists in
TypeScript: an annotation belongs to the user unless a column says otherwise, and on rows
written before that column existed, the block's source decides. Translated literally into SQL,
that rule returns the wrong answer without complaining, because SQL comparisons against NULL
produce NULL rather than false, and `NOT (NULL)` is NULL, which fails a `CASE WHEN`. The rows
it drops are the rows from before the column existed — which is to say, the most common kind
of row in the library, and precisely the ones the TypeScript fallback was written to rescue.
Nothing about the literal translation looks wrong when it is read. What makes the difference
is not noticing it once: the test fixture carries two such rows, so the guard has something
holding it down rather than a comment asking the next person to remember.

Two things generalise, and the second is the one worth carrying.

**"Is this query cheap" is a question about its callers, not about the query.** The cost of the
old implementation was bounded by a condition — a young library — that lived in a different
file from the code that relied on it. Reusing a function is also inheriting its assumptions,
and the assumptions are usually in a comment rather than in the signature.

**When one rule must exist in two languages, move the values, not the words.** The tutorial's
provenance labels had to be excluded in SQL, and the honest way to do it was to bind the
existing list as query parameters rather than retype the labels inside a string. The list stays
the single source of truth; the SQL contains no copy of it to drift. Where that trick is not
available — as with the NULL-vs-false rule above — the second expression needs a test that
holds both expressions against the same rows, which is what this repository already does for
its one other duplicated predicate (§3.17).

### 3.26 A lesson that had already been paid for, and what it was worth the second time (2026-08-11)

Three sessions earlier, a one-line complaint about a panel — *the right side is empty and the
left is cramped* — was read as "this needs more room" and answered with a redesign that was
rejected on sight. The correct reading was "the words are arranged wrong". The note written
into the handoff afterwards was blunt: **next time feedback like this arrives, ask whether it
is about size or about text; do not pick one and start building.**

This session the same shape arrived. A four-item list of changes said, in item 1, *delete "I
have written N characters in total"*, and in item 2, *next to "read 2 today", add "wrote N
characters"*. Two readings: the number that was just deleted, moved down one row; or a new
number, today's. They are different pieces of work — one is moving a node, the other is a new
database query with its own boundary conditions and tests — and, more importantly, the first
reading would have half-undone the separation between historical and today's figures that the
same person had demanded one round earlier.

Asked. The answer was the second reading. One question, before any code, in place of a round
of rework.

**A companion failure in the same session, because the lesson does not generalise as far as it
looks.** The shelf of small spool marks that sits at the end of a line needed a limit: how many
fit before the line overflows. A number was chosen — three — and the comment above it said it
had been measured at the sidebar's width. It had not; it had been estimated and the comment had
been written in the voice of a measurement. Rendering the real markup in the engine the app
actually runs showed four sitting flush against the end of the column and five overflowing.

The two halves belong in one entry because they are the same discipline pointed at two
different things. A question to a person costs one message and settles what a person alone can
settle. A question to the program costs one render and settles what only the program can
settle. What is not allowed is answering either one from inside your own head and then writing
down that it was checked — the comment claiming a measurement was worse than no comment,
because it retires the question for whoever reads it next.

### 3.27 Two requests that turned out to be one (2026-08-11)

The same list asked, separately, for two things: **guarantee only two lines of text beside the
spool**, and **make the left sidebar non-resizable, fixed at its best width**. They read as
unrelated — one is about a panel, the other about a window.

The panel's text was a flow of complete phrases that wrapped. That layout was itself the
product of three earlier rounds of feedback, and it was the right answer while the sidebar
could be dragged to any width between 200 and 480 pixels: with a variable container, a phrase
must be allowed to fall to the next line, because the alternative is truncating it. But it
means the number of lines is a function of the width and of the current numbers. "Only two
lines" cannot be promised by a layout like that; at best it happens to be true today.

Fixing the width removed the reason the flow existed. Two lines could then simply *be* two
lines — two elements, declared — which is the only form in which the guarantee is structural
rather than coincidental. The second request is what made the first one implementable.

This is worth recording because the dependency ran the wrong way round to notice. The panel
request came first and looked like the substantial one; the window request came last and looked
like a preference about drag handles. Reading them in order, the first would have been answered
with a fragile version of itself. What surfaced the connection was not cleverness but the
ordinary discipline of writing down *why* the existing code was shaped the way it was before
changing it: the comment above the wrapping flow said, in as many words, that a fixed column
count was forbidden because the rail could be dragged narrow. Once that premise was struck out
by a later item on the same list, the conclusion went with it.

### 3.28 A comment that claimed a measurement nobody had taken (2026-08-11, backfilled)

A row of small spool marks had to collapse to `×N` past whatever number stopped fitting in a
260-pixel rail. The limit went in as 3, and the comment beside it read *three is what fits,
measured*. Nothing had been measured; 3 was what looked about right while writing the line.

Rendering the component at the real width with the longest English string showed **4 fits and
5 overflows**. The constant became 4 and the comment gained the method — the width and the
string it was measured against — so the next person can re-run it rather than re-guess it.

The defect worth keeping is not the off-by-one. It is that the comment had already converted a
guess into a fact for every future reader, and a fact of exactly the kind nobody re-checks: a
measurement is the one claim a comment can make that a reader is entitled to trust without
opening the file. **Write "measured" only after measuring, and record what was measured
against.** A wrong number with an honest comment costs one render to fix; a wrong number with a
confident comment costs an argument about something else entirely.

### 3.29 When both readings are cheap to draw, draw them — do not ask (2026-08-11)

An earlier round had already produced the rule: an ambiguous complaint has two readings, and
picking one silently costs a rewrite (§3.26). The instruction here was *put a line under 最近
and 聚焦*, which reads either as one rule under each of the two sections, or as a single rule
closing both off from the workspaces beneath them.

The rule says ask. What actually happened was better: both were rendered as full-window
mockups and shown side by side, and the choice came back in three words. Asking would have
required the user to describe, in advance and in prose, a difference of one horizontal line —
to hold the two pictures in their head and translate the one they wanted into a sentence. The
pictures did that work instead.

So the rule needs its second half: **ask about the differences you cannot draw, draw the ones
you can.** The expensive readings — a new query, a different definition of what counts — are
where a question earns its interruption, because those cannot be shown without building both.
A difference in layout can almost always be shown, and showing costs the person nothing but a
glance.

### 3.30 "Three inconsistent styles" is a description; "three different left edges" is a defect (2026-08-11)

The complaint was that the left sidebar had no rigorous structure and looked scattered. The
first pass at a diagnosis wrote that down as *five sections using three different heading
styles* — true, and almost useless: it names a symptom without saying what would count as
fixed, so the only available next move is to guess which of the three styles to standardise on.

Measuring instead produced a different sentence. The same object — a project row — sat at
**28px** from the rail's edge under 最近 and 聚焦, at **40px** inside a workspace, and the
headings sat at a third position again, because each section had accumulated its own wrapper
padding and, in the workspace case, a chevron in front of the name. Four sections, three
verticals, for one kind of thing.

That sentence carries its own acceptance test: every project row on one left edge. It also
selects the design — the chevron has to move behind the name, because anything placed before
the name pushes it off that edge — and it explains why a shared `SectionLabel` component was
worth adding to a codebase that otherwise avoids abstractions for their own sake. The component
does not enforce a font size; it enforces the left edge, by owning the horizontal padding and
leaving no place to put something in front. **A described symptom admits any fix. A measured
one names the fix and knows when it is done.**

### 3.31 The preview tool broke, and the break looked like the product breaking (2026-08-11)

The mockups are generated by a hand-written Python script that emits markup copied by eye from
the components. Restructuring it to render four variants dropped three CSS rules for the
sidebar footer, and every one of the four images came out with the footer's button and icons
unstyled and overlapping — in the exact corner of the exact panel that was under discussion.

A known hazard, already recorded once: when the preview and the component disagree, suspect the
preview. The new part is where the bug came from. The earlier instance was a transcription
error in markup copied from a component; this one was introduced by *editing the preview tool
itself*, which is ordinary software and fails in ordinary ways. A measuring instrument that is
rewritten is a measuring instrument that needs re-calibrating.

Cheap and sufficient in practice: **read the output yourself before handing it over.** Every
image in this round was looked at first, which is how the footer was caught before it became a
question about a design that had nothing wrong with it.

### 3.32 The drawing was cheaper than the question, until the user said it was wrong (2026-08-11)

§3.29 argued for drawing both readings of an ambiguous instruction rather than asking about
them. It worked again the same day: *move the workspace's top bar down to line up with the
value panel* reads either as aligning the two top edges or as making the header's rule
continue the panel's bottom edge, and two mockups settled it in one reply.

The reply also ended the practice: **"install it, don't render — the rendered picture doesn't
match the real thing."**

He is right, and the reason is structural rather than a lapse. The mockups come from a script
that reproduces the components' markup by hand. Every round of component changes moves the two
apart, and the same session had already shipped one image where the sidebar footer was broken
in the script and nowhere else. A drawing is a claim about the product made in a second
codebase; its accuracy decays with every change to the first one, and the decay is invisible
until someone who knows the product looks at it.

So the rule keeps its shape but gains a precondition. **Draw the options while the choice is
between things that do not exist yet — that is what a drawing is uniquely good for.** Once the
person can name what they want, and the change is a constant and a padding value, the real
application is both faster to produce and the only artefact that cannot be wrong about itself.
Here it took minutes: edit two files, build, swap the bundle, look. Rendering would have meant
first repairing the instrument.

The general form: **a model of the thing competes with the thing, and only wins while the thing
is expensive to obtain.** Every improvement to build and install speed moves that line, and
nobody sends a notification when it moves — the user does, by saying the picture looks wrong.

### 3.33 A healthy server, a correct config, and an integration that was not there (2026-08-11)

Two acceptance sentences were run in the user's own ChatGPT: *go and find this year's deadline
for the CMU programme and file it into 〈申请规划〉*, and then *the case-study claim in
〈申请规划〉 is wrong now, record that*. Both came back with a confident "done". Neither wrote
anything to Spool. The library gained **zero blocks that day**; its last write was twenty hours
earlier.

What the model had actually done was competent work on the wrong object. It edited
`build_application_plan.py` in the working directory, regenerated a DOCX and a PDF, rendered
the pages and checked the layout. The directory it was started in is called 申研选校规划 and
contains a document whose title is the same phrase the user had used for the Spool project. Its
first action in the session was to list that directory. From there, 〈申请规划〉 had a referent
that was concrete, local, and writable, and Spool never entered the candidate set.

The forensics found a second cause underneath the first, and it is the one worth keeping. The
client's own log records every MCP server it launches; the last time it launched Spool's was
**the previous evening**. Nothing in that day's three sessions mentions a Spool tool at all.
The model did not choose the local file over the tools — **it was never offered the tools.**

Everything a normal check looks at was green. The client's config file had the right command
and the right arguments; the binary was the current build and, when driven by hand over stdio,
answered `tools/list` with all eighteen tools, annotations complete, pointed at the real
library. Spool's own settings screen showed the client as connected, because what that screen
reads is the config file — *whether an entry exists*, not whether anything is using it. Five
`--mcp` subprocesses were alive on the machine and every one of them belonged to a different
client.

Two things generalise:

**A "configured" indicator that reads configuration is a status light wired to the switch
rather than to the bulb.** The server is in a position to know the truth and was not recording
it: every client sends `clientInfo` in its `initialize` call, so a per-client last-seen
timestamp — *Claude Code · 3 minutes ago, ChatGPT · 20 hours ago* — costs one write and
converts this failure from silent to obvious.

**An integration that is not addressed does not report an error.** A tool that is called and
fails leaves a trace at both ends; a tool that is never called leaves the same evidence as a
tool that does not exist. That is why the routing text was made testable in the first place
(§3.16, §3.19) — but a test that every tool is reachable from the instructions assumes the
instructions arrive. Here they did not, and the layer below that assumption had never been
checked. **When an acceptance sentence "passes" or "fails" through someone else's client, the
first question is not which tool it chose. It is whether the tools were in the request.**

---

### 3.34 The instrument reports nothing on the day you install it (2026-08-11)

The heartbeat from §3.33 was built, tested, and installed. The note written for the install
said what to expect on screen: *Claude Code's row will show a time, ChatGPT's should say never
connected or a very old one.* After the install, **all six rows said never connected**, and
that was correct.

Every `--mcp` subprocess alive on the machine had been started by the *previous* build. A
heartbeat is written when a client connects, and none of them was going to connect again —
they were already connected, to a binary that did not have the code. The instrument had been
installed underneath nine live sessions it could not see, and it would stay blank until each
client was restarted.

The predicted screen and the correct screen differ in a way that reads as a bug. Someone
opening Settings expecting one row with a timestamp finds six rows saying *never connected*
and concludes the feature does not work — and the natural next move, debugging a feature that
is behaving exactly as designed, is expensive and ends in nothing.

**A measurement of connections cannot describe connections that predate it.** The same holds
for anything installed into a running system to observe it: request loggers, counters, session
trackers. The generalisation is about what the first reading means. On the day of the install,
an empty instrument is not evidence of a broken instrument, and it is not evidence of an idle
system either — it carries no information at all. What made this one verifiable anyway was
running the *installed* binary by hand against a scratch library: three fake clients, three
rows written, the unrecognised one kept under its own reported name. That proves the shipped
build carries the code, which is the part an empty screen genuinely cannot distinguish.

And the accident is worth keeping: the blank start makes the real test sharper than the one
that was planned. Restart one client, and exactly one row gets a time while the others stay
blank. A screen that had begun half-populated could never have shown that.

### 3.35 The failing assertion was not a bug, it was an undecided question (2026-08-11)

Hooking a client up now appends a marked section to that client's instruction file. The test
written alongside it hooked up twice and asserted a `.bak` had been cut. It failed: nothing
had changed, so nothing had been written, so there was no backup.

The code was right and the test was wrong, but the useful part is that neither had *decided*
anything. Writing the assertion forced three questions that the feature had been silently
answering by accident: does a second hookup rewrite an unchanged file (no — a repeat click
should not churn the user's file, and a fresh `.bak` would bury the one that mattered); what
counts as *our* section; and what happens when someone hand-edits the file and leaves half a
marker behind.

The third has a real asymmetry in it. Replacing from the first opening marker to the last
closing one is the obvious implementation, and against a half-edited file it deletes whatever
sits between someone else's marker and ours — silently, in a file the user shares with other
tools. Appending instead leaves a visible duplicate. **A duplicate is something the user can
see and delete; a deletion is something they find out about later, if ever.** So exactly one
well-formed pair is treated as ours and replaced in place; every other shape appends. The rule
is now three lines of code and a test, and it exists because an assertion about backups
happened to point at it.

The general form: when a test fails on new code, the first question is which of the two is
wrong — and the answer is sometimes *neither, the behaviour was never chosen*. Those are the
valuable failures. The assertion was about `.bak` files and what it actually bought was a
written-down rule that this feature will never delete text it did not write.

### 3.36 The feature was in the protocol, in the client's binary, and in neither client (2026-08-12)

Two prompts were added so that filing something into a project would need no judgement from the
model: the user picks the command, and the target stops being ambiguous. The design called this
the cheapest fix available, on the grounds that MCP prompts surface as slash commands and the
protocol provides them.

They did not appear. Not in the desktop app, and not in the terminal client either.

The reasoning that followed is worth recording because the first two steps were both wrong. The
initial guess was a UI gap — the desktop composer not exposing what the terminal did — which the
terminal disproved. The second was worse: the client binary was searched for `prompts/list`,
found twenty-two times, and read as *the capability is there, so the problem is display*. Those
strings come from the protocol SDK the client links against. **An SDK implements the whole
protocol whether or not the program using it calls any given method, so a string in a binary is
evidence about the library, not about the behaviour.**

What settled it was refusing to infer at all. A proxy was put between client and server that
forwarded every byte unchanged and wrote down each message. Both the terminal client and the
non-interactive one sent exactly three things: `initialize`, `notifications/initialized`,
`tools/list`. No `prompts/list`, ever. The client's own `initialize` declares one capability,
and it is not prompts.

The generalisation is not "that client is missing a feature". It is that **three different
places can all say a capability exists — the specification, the SDK in the binary, the server
advertising it — while the one thing that matters, whether the client asks, is recorded
nowhere except on the wire.** This is the second time the same shape has cost real work here:
§3.33 was a routing text sent through `initialize.instructions`, a field the specification
defines and some clients simply ignore. Both times the fix was built on a documented mechanism
and neither reached the model. A proxy that logs traffic is about thirty lines and answers the
question outright; both of these would have been caught before they were built.

The disposal matters too. The prompts were not deleted — they work on clients that do fetch
them — and the replacement is the client's *own* affordance rather than a new one: an `@`
mention that addresses the connector. That distinction had already been written down (a mention
is a reference, not a name, so it cannot be ambiguous) and had already been ruled on: a
convention the user must learn is friction moved, not removed, while an affordance they already
use is free. The mention is only emitted for the one client where it was seen to work — in two
of the others `@` opens a file path, and prefixing those would send the client hunting for a
file that does not exist.

### 3.37 One measurement retired a mechanism that was only dead in one client (2026-08-12)

§3.36 ends with a fix: a mention that addresses the connector, emitted for the one client where
it was seen to work. That was right, and it quietly became the whole answer. The prompts it
replaced were kept but written off, and the mention was the only way any client got told which
project a question was about.

Asking the obvious next question — *what is the equivalent in the other five?* — produced three
different answers and no convention:

* The terminal client from the other vendor **documents a typed slash command for exactly this**:
  server name, prompt name, arguments after it. So the prompts §3.36 retired have a first-class
  entry point there, and a better one than the mention — the prompt arrives carrying the
  project's overview, which no sentence on a clipboard can.
* Its desktop sibling has **nothing you can type at all**. Prompts and resources are attached
  through a ＋ menu.
* The editor client's current documentation and its older documentation **disagree with each
  other** about whether the prefix is `/mcp.<server>.<prompt>` or `/<server>.<prompt>`.

The generalisation: **how a user names a connector is not a property of the protocol. It is a
product decision each client makes on its own, and they have not converged.** The protocol
standardises what the server offers; it says nothing about the characters a human types to reach
it, and reasoning from one client to another is guessing.

Two things follow, and the second is the one that cost something.

First, the shipped form is a **table keyed by client**, where a row exists only when the vendor
documents the syntax or somebody watched it work, and everything else falls back to plain
language that names the project in words. The dangerous state was not the missing rows — it was
the table with one row, which reads like a convention and invites the next person to extend it
by analogy. `@` in three of these clients opens a file path; extending by analogy would send
them hunting for a file called `spool`, which is worse than not naming the server at all.

Second: **the measurement in §3.36 was about one client, and it had been generalised into a
verdict about a mechanism.** The prompts were nearly deleted on the strength of it. Nothing was
wrong with the evidence — the traffic log is exact — only with how far it was carried. A
negative result travels the same distance as the thing that produced it: one client's wire, not
the feature everywhere.

⚠️ And the honest limit on this entry itself: the new row is **documented, not measured** —
precisely the class of claim §3.36 says to distrust. It is marked as such where it lives, and
the acceptance step is a human typing it once and watching what happens. Writing it down is not
the same as having seen it.

### 3.38 The clipboard can carry the characters but not the reference (2026-08-12)

§3.36 chose a mention over a notation on the grounds that a mention is the client's own
affordance — already used for everything else, so free. §3.37 built a table of those mentions
per client. Both entries assumed that putting `@server` on the clipboard puts a mention in the
user's chat box.

The user, having used it: **it pastes as plain text.** It becomes a reference to the connector
only after the user re-types the `@` and picks the entry with the server's icon out of the
client's own menu. The characters are identical either way; what differs is that the client
built an internal reference at selection time, and pasted text has no selection behind it.

The correction that matters is not about one client's composer. It is that **an affordance
delivered by selection cannot be delivered by a clipboard.** A clipboard carries characters;
a mention, a file attachment, a tool toggle — anything the receiving app constructs when the
user picks it — is state inside that app, and no amount of getting the characters right
produces it. §3.36's reasoning was sound about *cost to the user* and wrong about *mechanism*,
and the two look alike right up until somebody pastes.

⚠️ The failure mode is the expensive kind: it looks like it worked. The text reads correctly,
the message sends, and the model answers from nothing — which the user experiences as their
notes not being handed over. Nothing errors. So the fix is in what the product **says**: the
one client where the mention is inert now gets copy that names the picker step, and the shape
of the thing on the clipboard changed to admit what it really is.

Which the same conversation forced anyway: **the pasted question was one user's need written
into everybody's clipboard.** It asked three fixed things — where am I stuck, what is settled,
what next — and the longer it was, the more of it had to be deleted before it could become
anyone else's question. What is left is the part no user should have to type and only Spool
knows how to say: which project, in this client's syntax, ending on a colon. The rest is
theirs. **A default that has to be deleted is worse than no default; a default that has to be
finished is a head start.**

### 3.39 The mention resolved, to somebody else's mechanism (2026-08-12)

§3.38 concluded that a clipboard cannot carry a mention, because the client builds the
reference when the user picks it. The user then found a way around exactly that: ChatGPT's
composer serialises its own chips as markdown, and pasting that markdown back **does** rebuild
a live chip. One ⌘V, no picker, the icon renders. The workaround was real.

It delivered nothing. Asked to read the project it named, the model answered
「没有获得 Spool 内部内容的读取/操作接口」 — it knew which app was meant and had no way into it.

The link the chip carries says why:
`plugin://computer-use@openai-bundled?app=com.oceanjin.spool`. That is OpenAI's **Computer
Use** plugin — "reading the screen and performing UI actions", shipped inside
`ChatGPT.app/Contents/Resources/plugins/openai-bundled/plugins/computer-use` — aimed at the
Spool app by bundle identifier. The entry in the picker wearing Spool's icon was never this
project's MCP server. It was an offer to look at Spool's window.

The structural cause is two registries with one namespace. That picker lists **plugins**
(`[plugins."name@marketplace"]` in `~/.codex/config.toml`, each able to declare its own MCP
servers); Spool installs itself as a plain `[mcp_servers.spool]` entry, which the local tool
host loads and the picker never sees. Both are "connected to ChatGPT". Only one of them has a
name the user can type. And an ordinary chat did not even load the other: that turn spawned no
codex session and no `spool --mcp` child — every live one on the machine belonged to a
different client.

Three lessons, in the order they cost something:

* **A name resolving is not a name resolving to you.** The check is never "did the reference
  survive the paste"; it is "which mechanism did it bind to". §3.38's rule survived contact —
  the exception it now carries (an app's own serialisation can round-trip) made the failure
  *more* convincing, not less.
* **The model naming your project back is not evidence of integration.** It restated the
  title, the icon rendered, nothing errored. Proof is the tool being *called* — the
  authorisation prompt, a line in the session log, a child process — and all three said no.
  This is §3.33 again, one layer up: there the config was right and the integration absent;
  here the mention was right and the integration absent.
* **Removing a route is a result.** `@spool` had shipped on one measurement that turned out to
  be a measurement of something else. It is gone from `HOW_TO_ADDRESS`, with the three
  measurements written where the next person would otherwise re-add it, and ChatGPT now gets
  the plain sentence — which is what routes in the conversations where the tools do exist.

### 3.40 One row said two products, and every measurement had come from one of them (2026-08-12)

After §3.39, the user said the thing that reorganised all of it: **everything he had used until
that day was Codex. That day was the first time he had tried it in ChatGPT.**

The client row reads 「ChatGPT / Codex」, and it reads that way for a defensible reason — one
config file (`~/.codex/config.toml`) backs both, so one entry connects both. But the evidence
behind the row was not from both. The 2026-08-07 tool-call traces, the 2026-08-11 probe that
proved the client never asks for prompts, the 「@spool 可以指定使用 spool」 that put a mention on
the clipboard: all Codex. The row's other half had never been exercised, and it inherited the
confidence anyway.

What that half turned out to be is in §3.39: a different registry, and no Spool tool at all in
an ordinary chat. Both statements — "the integration works" and "the integration is absent" —
were true, of different products wearing one label.

**A row that names two products needs evidence from two products, or a label that admits which
one was measured.** Shared plumbing underneath is exactly what makes the mistake easy: the
config file really is shared, the binary really is shared, and the conclusion still does not
transfer. The same shape is waiting in every other merged row — 「Cursor / Windsurf」 style
groupings, or one heartbeat key standing for a family of clients.

⚠️ And note where the correction came from. It was not in the logs, the config, or the code;
the machine could show that today's turn spawned no session, but only the user knew that
yesterday's turns had been a different app. **Some premises are only recoverable by asking.**

### 3.41 The cause was real, the fix worked, and the symptom did not move (2026-08-12)

§3.39 found that the entry in ChatGPT's `@` picker wearing Spool's icon was OpenAI's Computer
Use plugin aimed at the Spool app, not this project's MCP server, because the picker lists
**plugins** and Spool installed itself as a plain `[mcp_servers.spool]` entry. The fix follows
from the diagnosis: ship Spool *as* a plugin. It was built, installed, and the user restarted
ChatGPT and typed `@spool`.

**The entry is now ours.** The chip the composer produced reads `plugin://spool@spool` —
plugin `spool` from marketplace `spool`, the one installed that morning — where it used to
read `plugin://computer-use@openai-bundled?app=com.oceanjin.spool`. The manifest parsed without
a single warning while four other plugins on the same machine were logged for oversized default
prompts and `..` in icon paths. The identity defect §3.39 described is closed.

**The model answered exactly what it answered last time**: it named the project and said it had
no interface to read it.

Four measurements say the model was telling the truth, and that the plugin was not the thing
that failed:

* After the restart, the only `spool --mcp` that ChatGPT started was a **status probe** —
  `mcpServerStatus/list` → `initialize` → catalogue → `SIGTERM` one second later. Nothing was
  alive to answer a tool call.
* The next `spool --mcp` came minutes later, attached to a `thread/resume`, with `node_repl`
  starting in the same second — a *different*, local conversation with a working directory.
  **The tool host is bound to the local thread, not to the app.**
* That ordinary chat left no local thread at all: no row in `~/.codex/state_5.sqlite:threads`,
  no rollout file. A conversation that never becomes a local thread never gets a host.
* Spool's own heartbeat refreshes on every `tools/call`; its `codex` timestamp still equals the
  instant of that unrelated connect. **No Spool tool has been called since the restart.**

**And the plugin route itself works.** In a `CODEX_HOME` built from nothing but `auth.json` and
the plugin — no `[mcp_servers.spool]` anywhere — `codex exec` had the model call
`spool/list_threads` and read back the three real project titles. That is the first time a model
has been *seen* reaching Spool through a plugin rather than through the config file.

* **A cause being real does not make it the only cause.** The picker really was pointing at
  somebody else's mechanism; correcting it changed the chip and nothing else, because a second,
  independent cause sat behind it. §3.33 was a healthy server with an absent integration; this
  is a correct plugin, a correct chip, and an absent host. **Verify the fix by the symptom, not
  by the mechanism you repaired** — the mechanism can be repaired and the symptom stay put.
* **Build the smallest world where only your thing exists.** Everything on the real machine
  reads "spool": the config entry, the plugin, the process name. The isolated home was the only
  instrument that could separate *our plugin is broken* from *this surface cannot host it*, and
  it took one file and one command.
* ⚠️ **The misleading entry is now branded.** Before this change, the picker entry that looked
  like it worked and delivered nothing belonged to OpenAI. Now it carries Spool's name, Spool's
  logo, and three suggested prompts that cannot be answered. §3.38's worst property — *it looks
  like it succeeded, nothing errors, the user concludes Spool did not hand anything over* — is
  unchanged in kind and worse in attribution. **Shipping a real entry into a surface that cannot
  honour it is not neutral.**
* Small honest gap found alongside: the client asks for `resources/templates/list` and Spool
  answers `-32601`, logged as a warning. Harmless here; noted so it is not rediscovered as a
  cause.

---

### 3.42 The name the menu shows is not the name it answers to (2026-08-12)

One item had been waiting on the user for a day, because only he had a terminal: paste
`/mcp__spool__catch_up "项目名"` into Claude Code and see whether it lands. He ran it, typed
`/mcp`, and sent back what the menu listed: `/spool:catch_up (MCP)`, with its arguments and
description — a different name from the one Spool puts on the clipboard.

The obvious reading is that the client renamed its prompt commands and Spool is behind. Acting
on it would have shipped a string that does not work at all.

A throwaway MCP server — one that answers `prompts/list` with a single `catch_up` prompt and
logs every `prompts/get` it receives — was mounted through `--mcp-config` with
`--strict-mcp-config`, and driven both in print mode and in a **real interactive session on a
pty**, because the clipboard string is pasted into a terminal and no other surface counts.
Three results, none of them what was being looked for:

* **The displayed name is not typeable.** Typing `/probe:catch_up …` returns `Unknown command`.
  Pressing Tab on that same row inserts `/mcp__probe__catch_up [project]`. The menu shows a
  prettified alias; the parser knows only the long form. **Spool's name was right.**
* **Arguments are split on whitespace, and quotes are not special.** `catch_up "申请规划"`
  arrives as `project: "申请规划"` — quote marks included. The vendor docs show the quoted form
  (`create_issue "Bug in login flow" high`), and that is where Spool's quoting came from.
* Fed straight to the shipped binary, the two forms separate cleanly: bare returns the prompt
  with the project's overview; quoted returns `No project whose title contains ""Machine
  learning""`. The string being verified would have failed on its first use, loudly.

Also measured, and unfixable from here: `机器学习 课` arrives as `机器学习`. Nothing on a
clipboard can stop that. It survives only because `resolve_thread` matches substrings and a
title's first word is always a substring of it — so the quoting that was there to keep the
title whole was trading a recoverable case for a certain failure.

* **A user's report is evidence about the surface they were standing on.** He reported what the
  picker *displays*; that is true, and it is not what the parser *accepts*. Both facts describe
  the same client. Only one of them can be pasted. The question to carry back is not "is the
  name different" but "which of these two does the machine consume".
* **The verification found a different defect than the one it was aimed at.** It was aimed at
  the command name (documented, never run — the §3.36 trap). The name was fine; the argument
  quoting, written from the same documentation page in the same commit, was not. **When a claim
  is unverified, so is everything else that arrived with it.**
* Three surfaces of one client disagreed: the docs, the picker, the parser. **Only the parser
  is not a description of the software.**
* **A step only the user can perform still deserves an instrument.** The probe took a few
  minutes and answered questions no screenshot from his terminal could — and it kept the
  measurement off the real library and nearly off his account.

### 3.43 The plan said "one constant"; the number had four copies written into prose (2026-08-12)

The site revision list had ten remaining items and one of them was costed as the cheapest:
the interactive walkthrough gates on saving three notes before it will let you continue, and
the list proposed lowering that to one — "a copy change plus one constant."

The constant is real: `state.captured` is compared against a literal. What is not in the
constant is everything the walkthrough says afterwards. The pack dialog reports
`'3 notes · ' + n + ' characters'`. `packText` is a fixed document containing three specific
notes. The pre-written AI reply opens "Three notes, three sources." The discard branch says
"your three notes are untouched." Those strings do not read the counter; they were written
next to it.

So the change as specified would have let a visitor save one note, click Pack, and be shown a
document containing two notes they never saved — while the page's own argument is that Spool
hands over your notes and nothing else. The item was left undone and handed back with the two
options that are actually available: leave it, or first make the walkthrough's second half
independent of the count.

The same day's other item went the opposite way. Two open questions were queued for the user's
judgement about the first screenshot — whether four strangers' faces and the words "Anthropic
sandbox breach" should appear in the hero image, and whether to break the build script's
"lossless is cheapest for UI shots" rule because the photograph had pushed that one file to
491K. He replaced the screenshot. Both questions stopped existing: no faces, and 491K → 141K
without touching the encoder.

* **"Change the constant" is a claim about coupling, and coupling to prose is invisible to the
  reader of the code.** The literal `3` had one home in logic and four in sentences. Grep found
  them in seconds — but only because the estimate was distrusted enough to look.
* **A cost estimate written while reading one file is an estimate of that file.** The revision
  list was produced by reading the page; the gate lives in the page's script, and the strings
  that depend on it live 200 lines further down the same script.
* **Some "which tradeoff do we accept" questions are "the input is wrong" questions.** Two
  items had been escalated as judgement calls with real costs on both sides. A new source image
  dissolved both. Escalate the decision, but re-ask whether it is still a decision after any
  upstream change.
* **Alt text describes the pixels, not the intention.** The replacement shot had no selected
  sentence in it, so `alt="…with one sentence selected…"` — correct for the previous image in
  the same slot, written the same day — became a false description. Swapping an image is not
  done when the file is swapped.

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

**18 tools as of 2026-08-09** (the count this command prints today; see the correction note
in the header for why this was edited in place rather than appended).

Read tools (12): `list_threads`, `get_digest`, `get_pack`, `search_blocks`,
`find_similar_blocks`, `get_blocks`, `check_library`, `weekly_review`, `thread_health`,
`distill`, `get_follow_up_brief`, `get_project_overview`.
Write tools (6, behind a second consent switch): `create_thread`, `add_block`,
`propose_blocks`, `request_file_access`, `suggest_follow_up_brief`, `set_thread_summary`.

Two of the six writes store nothing in the library at all: `request_file_access` queues a
permission request and `suggest_follow_up_brief` parks a text, both for the user to answer on
the review screen. They are still declared as writes, because they change durable state and
need the same consent — which is what the annotation means to a client, and what keeps them
out of any "safe to run unasked" path.

Growth, for the trend: **14 tools at v0.4.0 (2026-08-08) → 18 (2026-08-09).**

---

## 6. Still to gather

Tracked here so the gaps are visible rather than discovered late. Plan and sequencing in
`DESIGN_CASE_STUDY.md` §4.

- [ ] **Architecture diagram** — desktop shell / MCP stdio server / CLI engine slot / local
      SQLite. Scheduled after the application code is finished, alongside the demo video.
- [ ] **Screenshots** — the current set is stale: the block feed, the right-hand rail, and the
      project board all changed appearance in v0.4.0. Each replacement has to depict a real
      usage scenario, not a feature.
- [x] **Notarisation receipt** — captured 2026-08-08 at the v0.4.0 release; both submission ids
      are in §1.2.
- [ ] **Target-user section** — the only part of the public page with no existing source
      material; it has to be written from scratch.
- [ ] **MCP / CLI / desktop relationship** — the material exists across three design documents
      and needs condensing into one page a non-specialist can read.

---

## 7. Repository and Story close-out (2026-08-13)

This section supersedes the open-state checklist in §6 without rewriting it. The §6 lines remain
as the historical state captured when they were written; the dated evidence below records what
was actually completed in the later repository pass.

### 7.1 Scope and safety boundary

- Worktree: `main`, `HEAD = origin/main = 242e7519b2d17720e49edd8498486e573c5170fe`.
- Product scenes were captured only from the isolated verify installation with bundle identifier
  `com.oceanjin.spool.verify` and its own database. The installed verify app was checked for zero
  handles to `~/Library/Application Support/com.oceanjin.spool/spool.db`; the formal library was
  never launched into an app or edited. Its only inspection was a read-only integrity/handle
  safety check; the final two verify `spool` processes each had zero handles to the formal DB.
- No product source under `src/**` or `src-tauri/**` was changed for this close-out. No commit,
  push, deployment, release, repository-description edit, Apple credential access, or generated
  product mockup was performed.

### 7.2 §6 evidence gaps now closed

- [x] **Architecture diagram** — `site/story.html` now draws GUI/capture overlay → Rust/Tauri core
  → one SQLite file, the `spool --mcp` stdio route to an external MCP client, the separate local
  CLI-engine subprocess, and the only two network paths. It explicitly shows that Spool itself
  has no HTTP path and listens on no network port.
- [x] **Screenshots** — README now contains seven current, real isolated-library scenes: capture,
  project timeline, project management, Pack, digest, MCP read, and attributed MCP write-back.
  The release checklist's screenshot item is closed with the same dated provenance.
- [x] **Target-user section** — the public Story retains the target-user disclosure and frames the
  problem as long-running work repeatedly re-explained across tools, rather than as generic note
  taking.
- [x] **MCP / CLI / desktop relationship** — both the readable case-study source and rendered
  Story explain the single local database, stdio boundary, external-client route, CLI-subprocess
  route, supported engines, and distinct write consent.
- [x] **Notarisation presentation** — the previously complete §1.2 receipt is rendered as semantic
  HTML evidence, not as a simulated terminal. Exact preserved fields: app submission
  `89ebaceb-f883-4b1c-a6eb-86392769d132` Accepted; DMG submission
  `f7a15d9a-737d-4132-a54e-578d9f41fd7f` Accepted; tag `84625db`; artifact
  `Spool_0.4.0_aarch64.dmg`; SHA-256
  `933b9a7fb10a25f72cbd922c7c0a1d89fe02ef83b6a3885fba0dc0ec08b7df54`; Gatekeeper accepted
  both app and DMG with `source=Notarized Developer ID`. Source capture date: 2026-08-08.

### 7.3 Public Story evidence chain

The eight-section Story uses three generated, traceable scenes rather than repeating the whole
README gallery:

| Claim | Story file | Source | Intrinsic size |
|---|---|---|---:|
| capture without foregrounding the main app | `site/assets/shots/story-capture.png` | `docs/screenshots/app-capture.png` | 3600 × 2260 |
| a numbered project log with both side rails | `site/assets/shots/story-project.png` | `docs/screenshots/app-project.png` | 1229 × 734 |
| AI conclusion filed with source badge and citation | `site/assets/shots/story-ai-writeback.png` | `docs/screenshots/mcp-filed-detail.png` | 990 × 170 |

`scripts/build-site-shots.sh` owns the PNG/WebP derivation. The old unrecorded-video promise is
gone; Story links honestly to the existing interactive browser demo.

### 7.4 Verification recorded at close-out

- Full-page visual regression: five routes × 390/768/1440 = **15 / 15**, with zero pixels over
  the configured delta. The only nonzero sub-threshold variation was max channel diff 2 on the
  768px English Privacy page. CDP fixes the CSS viewport explicitly, avoiding Chrome's 500px
  minimum-window crop at the 390px breakpoint.
- Local Lighthouse 13.4.1 mobile defaults: `/` **66/100/100/100**, `/zh/`
  **65/100/100/100**, `/story.html` **66/100/100/100** (Performance / Accessibility / Best
  Practices / SEO). These are local throttled figures, not production scores.
- Focused WCAG review: semantic heading order, real keyboard skip-link/focus traversal, named
  local scroll regions, keyboard horizontal scrolling, image alt/captions, and actual Chrome 200%
  page zoom on `/`, `/zh/`, and `/story.html` passed. VoiceOver was not run; this is not a complete
  formal audit. Full detail is in
  `docs/QA_SITE_2026-08-13.md`.
- Browser matrix: all five static routes at 390, 768, and 1440px had no page-level horizontal
  overflow; Story images decoded and every figure had a caption.
- Automated baseline: Vitest **361 / 361**, TypeScript clean, Rust **72 / 72**, Chinese site test
  **9 / 9**, i18n `(none missing)`, `git diff --check` clean. Generated shots and Chinese pages
  were byte-identical across the determinism rerun.

### 7.5 Publication boundary and description suggestion

Repository sources are ready for review, but publication is not implied by this ledger entry.
Commit, push, deployment, and repository description remain four separately authorised actions.
Suggested GitHub description (not applied):

> Local-first project memory for macOS — capture context once, carry it across AI tools, and keep
> every AI write attributed.
