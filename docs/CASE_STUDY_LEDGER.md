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

### 2.5 What a free AI tier is actually worth as infrastructure

2026-08-10, evaluating whether a free API tier could power the maintenance engine for users
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

### 3.8 A tier of the product was designed on a number that was wrong by 75× (2026-08-10)

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

### 3.9 One missing metadata field made two tools uncallable on one client (2026-08-11)

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

### 3.10 A parser's complaint impersonating the program it was parsing (2026-08-11)

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

### 3.11 A product tier removed by its vendor between design and use (2026-06-18 → 2026-08-11)

§3.8 recorded a free allowance measured at 20 requests per day against a documented 1,500. Three
weeks later the same tier was checked again, and the finding had changed category: the free
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

### 3.12 Everything passed, and the typography was still wrong (2026-08-12)

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

### 3.13 The fix for §3.12 overshot, and a second invented number turned up beside it (2026-08-13)

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
