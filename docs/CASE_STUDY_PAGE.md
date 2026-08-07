# Spool — Case Study

> **What this is.** The readable half of the case study: prose written for someone who has
> never seen this project, covering the eight sections Ocean specified. Its companion is
> `CASE_STUDY_LEDGER.md`, which holds every figure with the command that reproduces it —
> **this page states, that page proves.** No number appears here that the ledger cannot check.
>
> **Status.** Draft, English (`DESIGN_CASE_STUDY.md` §4, phase three). It becomes the
> spoolapp.org page in phase five, which is gated behind the architecture diagram and the
> screenshot rebuild — both scheduled for after the application code is finished. Nothing here
> is waiting on anyone.
>
> **Sections still blocked**, and on what: the **architecture diagram** (§3 has the sketch it
> gets drawn from), the **screenshots** (the current set is stale), and the **notarisation
> receipt** (captured at the first v0.4.0 release — the one figure that cannot be recovered
> afterwards).

---

## 1. Who it is for

Spool is for people running several long-lived workstreams at once, across tools that do not
talk to each other, over weeks rather than hours. Concretely: graduate students, researchers,
developers, people building something alone.

What they have in common is not that they take a lot of notes. It is a specific recurring cost:

**Every new AI conversation starts from zero.** The model does not remember the project. So the
work begins by re-explaining it — which paper, which deadline, what was already ruled out and
why. Do that across three chat tools, a mail client, a browser with forty tabs and eleven days,
and the project's context is not stored anywhere. It is scattered, and reassembling it falls
entirely on human memory.

That is the cost Spool attacks, and the target is stated as a number rather than a feeling:
**re-entering a project should cost one paste, not ten minutes of archaeology.** The person
re-entering might be you tomorrow morning or a chat window opened sixty seconds ago — the
product treats those as the same problem, because mechanically they are.

**Who it is explicitly not for.** Not a Notion replacement — that fight is unwinnable on
Notion's own ground, and Spool is deliberately positioned *upstream* of it, as the thing that
catches fragments before they are worth filing anywhere. Not a team tool: no real-time
collaboration, no sharing model beyond handing someone the packed text. Not a place to write
documents — a project is a log, append-only and quiet, not a canvas.

**One disclosure about the user research, because it is a real methodological limitation.**
There has been none. The developer is a precise instance of the target user — a graduate
applicant running several application workstreams across several AI tools — and the product was
built by using it daily and fixing what hurt. That is a legitimate method for a v1 and a poor
one for a v2, so it is written into the plan as a phase boundary: dogfood first, validate with
other users after release. Several decisions in the ledger came out of dogfooding contradicting
the design — §2.1 is the clearest case, where measurement reversed the priority of two planned
features.

---

## 2. What it actually does

Three verbs, and the whole product is the loop between them.

```
   Capture  ──▶  Project ──▶  Pack  ──▶  (paste, re-enter)
      ▲                                       │
      └───────────── days later ──────────────┘
```

**Capture.** Double-tap ⌥ and whatever you just copied is filed, with its time and where it came
from — down to the browser tab title. The confirmation appears in a corner with the cursor
already in a note box: type the thought that made you save this, or ignore it and keep working.
The main window never comes forward. This is the one part of the product that is allowed no
friction at all: one keypress, no decisions, no dialog asking where it goes.

**Project.** An append-only, time-ordered log. Exactly two tiers — Workspace, then Project — and
no deeper, because the alternative is managing a tree instead of doing the work. Opening a
project lands you at the newest fragments, which *are* "where you left off"; there is no status
field to maintain, because a field nobody updates is worse than no field.

**Pack.** One click turns the project into a Markdown briefing you paste into any AI. It is pure
string assembly — no model in the path, no network, deterministic: the same project packs to the
same bytes on the same day. That matters more than it sounds. It means the feature cannot fail
slowly, cannot cost money, and cannot behave differently on the day you need it.

**The part that is genuinely unusual** is what the briefing tells the receiving model. Fragments
arrive from four different kinds of source, and they do not deserve equal weight: an official
university page is not the same kind of thing as an essay some chatbot wrote three months ago,
which is not the same as the user's own half-formed hypothesis. So the pack opens by sorting them
into four authority bands and telling the reader how to treat each — official artefacts as ground
truth, another model's synthesis as framing rather than fact, conversation traces as evidence of
what the user keeps getting stuck on rather than as facts at all, and the user's own notes as the
highest-signal line in the document even when they are wrong.

That last one is the design bias the whole product leans on. The first three bands are what other
people said, and any amount of them is just a longer prompt. **Only the user can produce the
fourth**, and a briefing dense with "this seems wrong because…" is one an AI can actually help
with, instead of one it can only summarise back.

---

## 3. How the three surfaces relate

Spool is one binary that runs in three modes, over local channels only.

```
        ┌────────────────────────────────────────────────────────────┐
        │  YOUR MAC                                                  │
        │                                                            │
        │   ┌──────────────────┐        ┌──────────────────────┐      │
        │   │  Spool desktop   │        │  Overlay window      │      │
        │   │  Tauri + React   │◀──────▶│  capture confirm     │      │
        │   └────────┬─────────┘        └──────────────────────┘      │
        │            │                                               │
        │            ▼                                               │
        │   ┌──────────────────────────────┐                         │
        │   │  SQLite  (spool.db, WAL)     │  ← the only source      │
        │   │  + FTS5 trigram index        │    of truth             │
        │   └───────┬──────────────┬───────┘                         │
        │           │              │                                 │
        │   ┌───────▼──────┐  ┌────▼──────────────┐                  │
        │   │ spool --mcp  │  │ CLI engine slot   │                  │
        │   │ stdio server │  │ spawns claude /   │                  │
        │   │ 14 tools     │  │ codex subprocess  │                  │
        │   └───────┬──────┘  └────┬──────────────┘                  │
        └───────────┼──────────────┼─────────────────────────────────┘
                    │ stdio        │ stdio
                    ▼              ▼
          ┌───────────────────┐  ┌────────────────────┐
          │ Your AI client    │  │ Your logged-in CLI │
          │ Claude Desktop,   │  │ Claude Code,       │
          │ ChatGPT desktop,  │  │ Codex CLI          │
          │ Cursor, …         │  │                    │
          └─────────┬─────────┘  └─────────┬──────────┘
                    │                      │
                    ▼                      ▼
             (their provider)       (their provider)
                    ↑                      ↑
        ══════════════ the network ══════════════
        Spool itself never crosses this line.
```

Read it as three claims, each of which is checkable:

**One database, no server.** Everything is in one local SQLite file. There is no Spool server, no
account, no sync, no telemetry. Deleting one directory deletes the product's entire memory of
you.

**The MCP server is the same binary, not a bridge.** `spool --mcp` speaks the Model Context
Protocol over stdio to whatever AI client you already use — fourteen tools, ten of them read-only.
It listens on no network port, so there is nothing to expose or misconfigure. What it hands the
model is the *same* deterministic pack the GUI produces, from a renderer that exists twice — once
in TypeScript, once in Rust — with a test that fails unless both produce identical bytes.

**The CLI engine slot is a subprocess, not an integration.** For the four maintenance jobs (distil
a project, flag duplicates, follow up on things you asked it to watch, write a weekly review),
Spool starts a coding CLI you already installed and logged into. No API key is stored, entered, or
needed, because Spool is never the thing making the request. This is also why the feature can
exist at all: an ordinary user cannot obtain an API key or run a local model, and every built-in
provider would have weakened the privacy story. Mid-project, the built-in AI layer was removed
entirely for exactly that reason — the guiding analogy being that Spool is the editor and the AI
is the plugin, not the other way round.

The web-facing consequence: **Spool makes no network request, ever**, and its content-security
policy forbids one structurally rather than by policy. Content leaves this machine only inside a
program you installed and authorised — and which of those two programs, and when, is the subject
of the next section.

---

## 4. Privacy, and the limits on what an AI may do

Two questions get answered separately here, because they are separate: *can it read* and *can it
write*.

### What can leave, and how

| Path | Default | What crosses | Who is the network client |
|---|---|---|---|
| MCP service | **off** | Whatever your AI client reads | Your AI client |
| CLI engine actions | **off** | The blocks the chosen action needs | The CLI, on your own subscription |
| Anything else | — | **nothing** | — |

Three switches, not one: MCP reading, AI writing, and the engine actions — and the engine
requires the first two. Of the four engine actions, exactly one (Follow up) is given web tools,
and only against lines the user wrote themselves describing what to watch. The other three run
with the web switched off.

### What an AI may do to the library

This is the part the design spends most of its care on, because a memory an AI can edit has two
failure modes a notebook does not have.

**It may append. It may not overwrite.** Every AI-written block carries a source label the client
cannot set for itself, and shows a distinct badge in the interface. A summary you wrote by hand
cannot be replaced by a machine-written one.

**It may not wear your authority.** An annotation records who wrote it. A note an AI filed renders
in a pack as `ai note:` and is weighted as another model's framing — never as evidence of what the
user thinks. This was a real hole, found by looking: both write tools accepted an annotation, and
the pack rendered it in the slot documented as the user's own words. The fix records authorship in
the database rather than inferring it, because inference got a specific case backwards — a user
adding their own note to an AI-written block would have had their sentence classified as the
machine's.

**It may not decide something is obsolete.** Retiring a block is the user's alone. An AI can
*propose* that one point in an older block was corrected by a newer one; the user approves or
discards it. Even then, correction never rewrites: the older block stays printed in full, still
standing on everything else, with a line pointing at what changed. Nothing is ever silently
overwritten, and when a pack omits retired material it says so, along with how to read it anyway.

**Why the paranoia is proportionate.** The Follow up feature reads web pages and writes into the
library, which is the shape of a privilege-escalation chain: a page injects text, the text edits
what to search for next, and the next search is under the attacker's control. That is why the
write half of every proposal goes through a human gate that cannot be turned off, and why a
proposed feature to let an AI attach arbitrary local files was rejected outright — the walkable
version of that chain ends with a private key in the library and then in the next pack. The
replacement design, specified but not yet built, narrows it so paths can only originate in a file
dialog the user opened: the AI may request access within a set the user chose, and nothing else.
That breaks the chain rather than mitigating it.

---

## 5. Getting it, and how it is signed

Download: **[spoolapp.org](https://spoolapp.org)** · [Releases](https://github.com/KIM-ocean-HZ/spool/releases/latest)
· Source: [github.com/KIM-ocean-HZ/spool](https://github.com/KIM-ocean-HZ/spool)

Distribution is a **Developer ID–signed, Apple-notarised `.dmg`, direct** — deliberately not the
Mac App Store. That is not a preference; sandboxing conflicts structurally with the product's
core gesture, which needs a system-wide event tap. Choosing the store would have meant removing
the feature the product exists for, so the store was dropped instead.

Three things learned doing it, all of which cost time once:

- **The build tool notarises the `.app` but not the `.dmg`.** Users download the dmg, and
  Gatekeeper checks the dmg — so it needs a second, explicit notarisation pass. Skip it and every
  user sees "cannot verify the developer."
- **Every release needs a fixed-name asset.** The download button points at a stable URL, which
  resolves only for an exact filename — while the build tool emits the version in the name. So
  each release uploads the same file twice, once versioned and once as a stable name. Forgetting
  it 404s the website's download button immediately, which is why the release checklist ends with
  a command that verifies the URL.
- **Development builds are signed with a fixed self-signed certificate, on purpose.** macOS ties
  permission grants to a binary's signing identity; ad-hoc signing changes identity on every
  recompile, so every new build silently lost the input-monitoring grant — the settings toggle
  still looked enabled while the check returned false.

**Verification, both artefacts** (`spctl -a -vv -t install`): each must report
`Notarized Developer ID`. The signing authority is checked too, because the release path overrides
the development certificate via environment variables and a failed override is silent.

*The notarisation receipt — submission id and timestamp — goes here, captured at the first v0.4.0
release. It is the only figure in this case study that cannot be recomputed later.*

---

## 6. What the numbers say

Full table with reproduction commands: **`CASE_STUDY_LEDGER.md` §1–§2.** Four findings are worth
stating here, because they are results rather than descriptions.

**Context overload does not come from AI interaction.** Everyone's assumption — including this
project's own design documents — was that sustained AI use would eventually overflow a project's
context budget. Measured against a real library: of one project's 26,163 characters, **95% was the
user pasting documents and 5% was written by AI clients, with individual AI-written blocks 11×
smaller.** AI writes are the cheapest content in the library by an order of magnitude. This
reversed two planned features: deduplication was demoted, and staleness handling was promoted and
shipped.

**Deduplication is worth 13%, once.** The same library held one exact-duplicate pair — 3,503
characters each, 13% of the pack. That is a one-time recovery, not a recurring saving, and it is
the number that demoted the feature. It also produced a better answer than merging: mark one copy
as no longer valid, and it leaves the pack while staying in the library and staying searchable,
which costs nothing in an append-only model.

**An external AI found the write path from one plain sentence.** Given one ordinary request with no
tool names, the ChatGPT desktop app created a project and filed **11 blocks** averaging 970
characters, walking a seven-step chain unprompted — including calling the pack tool on itself to
check its own work. It hit two errors and recovered from both unaided, which says the refusal
messages are actionable enough to be read by a model, not just by a person.

**One live web-search run cost about $0.45** — and found three bugs, which is the next section.

---

## 7. What broke, and what changed because of it

Seven incidents with full postmortems: **`CASE_STUDY_LEDGER.md` §3.** Each is written to answer
what became structurally different, not what got patched. Three are worth naming here.

**The live database was wiped (2026-05-29).** Every block, gone. The migration code had an
unconditional fallback that dropped and rebuilt all tables whenever it met a schema version it did
not recognise — and the development workflow, switching between builds against the same live
database, walked into it. Deleted rows were carved back out of SQLite's free pages: 33 blocks
recovered, thread titles unrecoverable.

Six guards exist because of that one day: a populated database on an unknown version now throws
instead of rebuilding; migrations walk a named registry with version constants asserted from both
the TypeScript and the Rust side; a snapshot is written automatically before any migration; the
first-run seed is reachable only from the empty-database path; on-device verification happens under
a throwaway bundle identifier; and anything that runs at startup and touches project tables is
treated as this bug's shape. A data-loss incident is not a line anyone wants on a project page. It
is here because those guards are the most load-bearing engineering in the product, and they are
only legible next to the failure that produced them.

**A rule written in a prompt is not a rule in effect.** Follow up must never propose a finding
without a source link. That rule was in the specification and in the prompt from the start; on its
first real run, **2 of 3 proposals had no link** — the model had put them in its closing message
instead. Naming the field explicitly and stating where the link must *not* go took the next run to
5 of 5, verified by measurement rather than by reading the output. Three separate features have now
been built, tested, wired up correctly, and been entirely non-functional in reality. Reading a
binary's strings proves a word is present; it cannot prove the behaviour is live. Only a real run
answers that.

**A feature that does nothing, kept and switched off.** An effort-level control was implemented end
to end — plumbing, test, UI — and does not work: every model the installed CLI can reach rejects
the parameter. The plumbing and its test stay, the UI is off behind one constant, and the condition
for re-enabling is written down. A model picker that could select a failing option was removed
rather than left to fail in front of a user. Shipping a control that silently fails is worse than
shipping no control.

---

## 8. What it does not do

Stated here rather than discovered later. Full list: **`CASE_STUDY_LEDGER.md` §4.**

- **No licence.** The source is public and readable; it is not licensed for reuse. *Source-available
  for review; all rights reserved.* Adding a permissive licence is a one-way door — a version
  shipped under it stays licensed forever — so it is a deliberate non-decision, not an oversight.
- **No auto-update.** Direct distribution means new versions are a manual download.
- **macOS only in practice.** Cross-platform is feasible, but the capture trigger, the focus
  handling, and process-group cancellation are all platform-specific and would need rewriting
  rather than porting.
- **Two things cannot be automatically tested, and are escalated to a human every time**: the
  capture gesture (with both permissions granted, the event tap sits upstream of where synthetic
  events are injected, so it cannot see them) and anything whose failure mode is "what it looks like
  after you click" (synthetic clicks do not drive the webview).
- **One CLI limitation is stated in the interface rather than hidden**: Codex's built-in shell tool
  cannot be removed the way Claude Code's can, so Spool runs it read-only sandboxed instead.

---

*Built by Ocean ([@KIM-ocean-HZ](https://github.com/KIM-ocean-HZ)). Every figure on this page is
reproducible from `CASE_STUDY_LEDGER.md`.*
