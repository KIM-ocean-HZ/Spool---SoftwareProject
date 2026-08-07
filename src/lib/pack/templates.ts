// Pack template per PLAN_EN.md §9.5 (v2.7). The output is plain Markdown the user pastes
// into a chat tool, email, or document. The instruction header is in English on purpose
// (§19.13: receiving AIs follow English instructions — especially negative constraints
// and edge-case rules — more reliably than Chinese ones); the user's own content stays in
// its original language, and the closing directive asks for output in the user's language.

// --- Whitespace / indentation -----------------------------------------------------------
// Centralised so the sub-line layout (notes, attachments, extracted text) is easy to tweak.
export const NOTE_INDENT = '    '; // 4 spaces — annotation + attachment marker lines
export const EXTRACT_INDENT = '      '; // 6 spaces — extracted file-text body
export const PINNED_PREFIX = '📌 '; // prepended to a pinned block's time bracket
export const EXTRACT_CHAR_CAP = 8000; // max extracted chars inlined per attachment

// --- Inline markers ---------------------------------------------------------------------
export const SOURCE_MARKER = ' · from ';
export const NOTE_MARKER = 'note: ';
// v14 (DESIGN_CONTEXT_HYGIENE §9.3 拍板乙): the same slot when an AI wrote the annotation
// rather than the user. `note:` is documented in the Notation section as 💭 Personal — the
// highest authority the pack grants — and both MCP write tools accept an `annotation`, so
// without a second marker an AI's sentence wore the user's authority. English like every
// other marker: 硬规则 12's exception covers what is a contract with the receiving model
// (交接 §6.4), and this is that.
export const AI_NOTE_MARKER = 'ai note: ';
export const FILE_MARKER = '↳ attached file: ';
export const FOLDER_MARKER = '↳ attached folder: ';
export const URL_MARKER = '↳ attached URL: ';
export const REF_MARKER = '→ Referenced project: ';
// v2.4 (§20.13 D2): block-level citation sub-line — "this block builds on that one".
// English like every other pack marker (§19.13). The preview keeps the receiving AI
// from needing another lookup; a deleted citee renders the MISSING text instead.
export const REF_BLOCK_MARKER = '↩ cites: ';
export const REF_BLOCK_MISSING = '(cited block no longer exists)';
// R6 debt 3: appended to a ↩ cites: line ONLY when the cited block lives in another
// project — otherwise the citation read as if the evidence were in this pack.
export const REF_BLOCK_FROM = ' — in project: ';
// v13 (DESIGN_CONTEXT_HYGIENE §3.1): the two supersession flavours of the same sub-line.
// They replace `↩ cites:` on the NEWER block, because "builds on" and "replaces" are
// opposite instructions to whoever reads the pack next — and §2.3's whole argument is that
// silently overwriting a fact is what a memory must never do. The wording spells the
// consequence out rather than naming a relation: a receiving AI acts on "no longer holds",
// not on the word "supersedes".
export const REF_BLOCK_SUPERSEDES = '↩ replaces (that block no longer holds): ';
export const REF_BLOCK_CORRECTS = '↩ corrects one point in: ';
// The mirror image, rendered under the OLDER block — which stays in the pack in full
// (§3.1.1: correcting one sentence must not cost the other 1,900 characters). Without this
// line the correction would be invisible to anyone reading the old block top-down.
export const CORRECTED_BY_PREFIX = '⚠️ one point in this block was corrected later — see ';
export const ATTACHMENT_SEE_BELOW = ' — see Related Files & Links section below';

// --- Section headings -------------------------------------------------------------------
export const SECTION_PINNED = '## Pinned Blocks';
export const SECTION_LOG = '## Full Record (chronological)';
export const SECTION_FILES = '## Related Files & Links';

export const EMPTY_PINNED_LINE = '(no pinned blocks)';
export const EMPTY_LOG_LINE = '(no blocks yet)';
export const UNKNOWN_THREAD = '(unknown project)';
// 2026-07-09: pinned blocks render in full ONLY in the Pinned Blocks section; their
// Full Record slot is this one-line placeholder (they were duplicated verbatim before,
// inflating large packs by the size of every pinned block).
export const PINNED_SEE_ABOVE = '(pinned — full text in "Pinned Blocks" above)';

// v13 (DESIGN_CONTEXT_HYGIENE §3.1): the closing line of the Full Record when the user has
// retired blocks. It is not optional bookkeeping — §2.3's TOKI reading is that dropping a
// retired fact WITHOUT saying so is the "silent overwrite" a temporal store exists to
// avoid. The reader has to know the gap is there and that nothing was destroyed.
export const staleOmittedLine = (n: number): string =>
  `[... ${n} block${n === 1 ? '' : 's'} the user has marked as no longer valid ` +
  `${n === 1 ? 'is' : 'are'} not shown — still in Spool, still searchable, ` +
  `readable with get_blocks(stale=true) ...]`;

// --- Top of the pack --------------------------------------------------------------------
// `scope` is set when the block list was narrowed by a range selector: the count line then
// says how many of the project's blocks this pack holds. Without it the pack claimed
// "3 blocks total" for a last7 slice of a 17-block project, and whoever it was pasted to
// believed the project had three blocks (MCP field review 2026-08-04, B-3).
export const PACK_HEADER = (
  title: string,
  dateStr: string,
  blockCount: number,
  scope?: { range: string; total: number },
): string =>
  `# Project Context: ${title || '(untitled)'}\n\n` +
  `Generated by Spool on ${dateStr}. ` +
  (scope
    ? `${blockCount} of ${scope.total} blocks in this project ` +
      `(range: ${scope.range} — ${RANGE_REST[scope.range] ?? RANGE_REST.last7}, still in Spool).`
    : `${blockCount} blocks total.`);

// Why the rest are missing depends on which range asked for them: `pinned` is not a time
// window, so the time-window wording said something false about the other blocks (MCP
// review round 2, 2026-08-04).
const RANGE_REST: Record<string, string> = {
  pinned: 'the rest are not pinned',
  last7: 'the rest are older than this window',
  last30: 'the rest are older than this window',
};

// --- The four-category instruction header (verbatim — §9.5 / §19.13) --------------------
// This static text teaches the receiving AI how to weigh the blocks below. It is core IP:
// do not reword the four categories. It opens and closes with a `---` rule so it reads as
// its own section.
//
// DESIGN_CONTEXT_HYGIENE §1.1-bis (Ocean 2026-08-06: 「目前表头是开发初期的作品,需要更新」):
// the four categories were written before the pack grew `#seq` numbers, `↩ cites:` lines,
// `📌` placeholders, the extracted-but-not-inlined distinction, and (v13) retirement. The
// header said nothing about any of them, so a receiving AI had to guess what a placeholder
// line meant — and guessing "content is missing" is the wrong guess. The Notation section
// closes that gap. What it deliberately does NOT do is add a fifth authority category:
// DESIGN_FOLLOW_UP §1.2 and DESIGN_MCP_WRITE_ROLE §4.4-bis both ruled against opening one,
// and everything below is mechanics, not authority.
//
// ⚠️ Its length is why the clipboard pack now omits the whole header by default (§1.1 —
// 60% of a small pack was reading instructions). This text is for the surface that IS a
// contract with a model: the MCP pack, and the clipboard pack when the user asks for it.
export const INSTRUCTION_HEADER = `---

## How to Read This Context

The blocks below come from FOUR different authority categories. Treat each
category according to the rules in this section. This sorting matters —
mishandling categories will produce wrong or unsafe output.

### 📖 Reference (authoritative)
Blocks whose \`source\` looks like an institutional / official artifact:
- email clients (Mail, Outlook, etc.)
- school / institutional domains
- file attachments (PDF, docx, slides)
- forum / platform posts from authoritative figures

**Handling**: Treat as ground truth. Do not contradict. Do not extrapolate
beyond what they say. If they conflict with other categories, Reference wins.

### 🧩 Synthesis (already-formed understanding)
Blocks whose \`source\` is another AI tool (Claude, ChatGPT, Gemini, etc.)
AND whose content has the shape of a long structured explanation (headings,
formulas, multi-paragraph essays).

**Handling**: These are someone else's synthesis. They may be useful as
background or framing, but their correctness is not guaranteed. Do not
treat them as facts. If they contradict Reference, defer to Reference.
Do not copy them wholesale into your output.

### 🔄 Process (conversation traces — read for evolution, not facts)
Blocks whose \`source\` is another AI tool AND whose content has the shape
of a question-and-answer dialogue (multiple turns, short exchanges,
dialogue markers like "User:" or "Q:" or "我:", high question density).

**Handling**: The literal content of these blocks is NOT a reliable source
of facts. What IS reliable is the user's evolving questions — what they
ask repeatedly, where they got confused, what they kept circling back to.
Extract these as signals of the user's cognitive gaps and address them,
but never quote the AI responses inside these blocks as if they were
authoritative.

### 💭 Personal (the user's own hypotheses and notes)
Blocks with no \`source\` field — these are typed by the user directly
into Spool. They represent the user's current understanding, often
incomplete or speculative.

**Handling**: Read these to understand where the user currently stands.
If they contain factual errors, point them out directly — do not protect
the user's feelings at the cost of correctness.

### ⭐ User-highlighted spans (\`==…==\`)
Substrings wrapped in \`==…==\` inside any block above are sentence-level key points the user emphasized at capture time — prioritize them. They coexist with pinned blocks (pin = whole block is core context; highlight = a sentence within a block is key); when a highlight sits inside a pinned block, treat it as one emphasis, not two.

## Notation

A block is one line, optionally followed by indented sub-lines:

\`📌 #12 [2026-07-02 14:30 · from Safari] the block's own text\`

- \`#12\` is this block's number inside this project. The user sees the same number in
  Spool, so it is how you point at one block — say "#12", never an internal id.
- The bracket is when it was captured and, after \`· from\`, where it came from. That
  \`from\` label is what the four categories above are decided by; no label means the
  user typed it themselves (💭 Personal).
- \`📌\` = the user pinned it as core context. Pinned blocks are printed in full ONCE, in
  "Pinned Blocks"; their slot in the timeline is a one-line placeholder ending in
  \`(pinned — full text …)\`. That placeholder is not missing content.

Indented under a block:

- \`note:\` — the user's own annotation. Their words, not the source's: weigh it as
  💭 Personal even when the block itself is 📖 Reference. Where a block is named by a
  short preview rather than printed in full, that preview is its note when it has one.
- \`ai note:\` — the same slot, written by an AI through Spool's write tools instead of by
  the user. Weigh it as 🧩 Synthesis: another model's framing of the block, useful but not
  guaranteed correct, and never evidence of what the user thinks. It is never used to name
  a block, and it never outranks the block's own source.
- \`↩ cites:\` — this block builds on the older block previewed after the marker.
- \`↩ replaces (that block no longer holds):\` — the user has retired the older block.
  It is history: do not use it, and do not go looking for it in this pack.
- \`↩ corrects one point in:\` — one point in the older block is wrong. The older block is
  still printed here in full and still stands on everything else.
- \`⚠️ one point in this block was corrected later — see #N\` — the same fact, seen from
  the older block. Read #N before using this one.
- \`↳ attached file / folder / URL:\` — an artifact belonging to that block. A file whose
  text Spool extracted is inlined here only when the user opted in; otherwise it appears
  under "Related Files & Links" marked \`[extracted: yes, not inlined]\`, which means the
  text exists and you may ask the user for it.

Any line wrapped in \`[... ...]\` is Spool speaking, not content: it states what was left
out of this pack and how to get it. Nothing Spool leaves out has been deleted.

---`;

// --- Closing language directive (verbatim — §9.5) ---------------------------------------
// 2026-08-04 (Ocean): this used to hard-code Simplified Chinese in every pack, in every
// locale — an English user with an English app pasted a pack and got answered in Chinese.
// It now follows Spool's UI language. The rest of the pack skeleton stays English on
// purpose (§19.13: receiving AIs follow English instructions more reliably); this one
// directive is different, because it is the only line whose whole job is to decide what
// language the USER is answered in.
export const OUTPUT_LANGUAGE_BY_LANG = {
  zh: `## Output Language

Respond in Simplified Chinese unless content itself dictates otherwise
(e.g. don't translate quoted English source material). Technical terms
may stay in their original language.`,
  en: `## Output Language

Respond in English unless content itself dictates otherwise
(e.g. don't translate quoted source material). Technical terms
may stay in their original language.`,
} as const;

export const OUTPUT_LANGUAGE = OUTPUT_LANGUAGE_BY_LANG.zh;

// --- Truncation marker for over-long extracted text -------------------------------------
export const truncationMarker = (remainder: number): string =>
  `[... truncated, ${remainder} more chars not shown ...]`;

// --- Pack task templates: removed (2026-08-09, Ocean 决定 6) -----------------------------
// v2.8 §20.7 shipped three "what should the AI do" types — 纯上下文 (no extra block),
// 复习资料, 组合零散对话 — as an experiment to learn from dogfooding which earned their
// place. Ocean's answer after using it: 「打包类型只留『纯上下文』」. The other two are gone,
// and with only the no-op one left the whole mechanism (selector row, `template` option,
// per-template closing block) had nothing to switch between, so it went with them.
//
// A pack is now always context-only: the receiving AI gets the four-category header (when
// the user ticks it) plus the blocks, and the user states the task themselves in the chat
// they paste into — which is what MCP packs always did (mcp.rs §963, design decision Q3).
