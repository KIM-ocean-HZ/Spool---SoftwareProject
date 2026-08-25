import { isMcpSource } from './sourceIcon';

// DESIGN_CONTEXT_HYGIENE §9.3 (拍板乙, Ocean 2026-08-08) — who wrote a block's annotation.
//
// The hole this closes: the pack's Notation section tells the receiving AI that `note:` is
// the user's own words and to weigh it as 💭 Personal *even when the block itself is
// 📖 Reference* — the highest authority the pack grants anything. Both `add_block` and
// `propose_blocks` let an AI supply `annotation`. So an AI-written sentence could wear the
// user's authority, and W7 (§3.2, annotation-as-title) doubled the damage by letting it
// become the block's NAME wherever the body is not printed. Measured on the real library
// 2026-08-08: 14 of 31 blocks were MCP-written with an annotation — the hole was live at
// scale, not hypothetical.
//
// ⚠️ Ocean chose the recorded column over the cheap source-only proxy for one reason: the
// proxy is wrong in the direction that costs the most. A note the USER writes on an
// AI-written block is exactly the signal §2.2 calls Spool's strongest asset (salience the
// user gave by hand, which no competitor can do better than guess), and the proxy demotes
// it. §0.5.1 makes that worse over time, not better: as more blocks arrive through MCP, the
// user's own annotations increasingly land ON AI-written blocks.
// ⭐ 2026-08-25 (Ocean, V3 验收):「AI 批注后加入人为修改仍然是 AI 批注,需要做区分,
// AI 批注可以人为修改,不能人为新增。」Three states, not two:
//
//   'user'      —— the user wrote it. 💭 Personal in the pack, highest signal.
//   'ai'        —— an AI wrote it, untouched.
//   'ai-edited' —— an AI wrote it and the user has since corrected it BY HAND.
//
// ⚠️ Why the third one exists rather than flipping to 'user' on edit (which is what the
// code did until today): the sentence did not become the user's just because they fixed a
// word in it. Ocean's rule is that it 「仍然是 AI 批注」 — so it keeps AI authority in the
// pack, and the interface says so, while still being editable.
// ⛔ There is deliberately no way to CREATE an 'ai' / 'ai-edited' note from the interface —
// 「不能人为新增」. A note the user types on a block with no note is always 'user'.
export type AnnotationAuthor = 'user' | 'ai' | 'ai-edited';

/** True when this block's annotation was written by an AI rather than the user.
 *
 *  `annotationBy` is authoritative when set. NULL is every row written before v14: those
 *  fall back to the block's `source`, since an MCP-labelled block's annotation arrived from
 *  that client in the same call that created the block. The fallback is a proxy and can be
 *  wrong the one way described above — which is why any GUI edit stamps an explicit
 *  'user' and retires the guess for that row for good. */
export const annotationIsAi = (
  annotationBy: AnnotationAuthor | null | undefined,
  source: string | null,
): boolean =>
  // ⚠️ 'ai-edited' counts as AI here, and that is the whole point of Ocean's rule: a note an
  // AI wrote does not acquire 💭 Personal authority in the pack because the user tidied it.
  // ⛔ Anything reading this to mean "untouched AI text" wants `annotationEdited` below.
  annotationBy ? annotationBy === 'ai' || annotationBy === 'ai-edited' : isMcpSource(source);

/** True when an AI wrote this note and the user has since edited it — the state the
 *  interface has to show apart from a clean AI note, so a reader is never told an AI said
 *  something in words the AI did not choose. */
export const annotationEdited = (annotationBy: AnnotationAuthor | null | undefined): boolean =>
  annotationBy === 'ai-edited';

/** What `annotation_by` becomes when the USER saves a note from the interface. Editing an
 *  AI note keeps it an AI note (marked as edited); everything else is the user's own. */
export const nextAnnotationAuthor = (
  current: AnnotationAuthor | null | undefined,
  source: string | null,
): AnnotationAuthor => (annotationIsAi(current, source) ? 'ai-edited' : 'user');

/** 「只看我写的」(archived DESIGN_NEXT_STAGE §4.4 — 「我的思考」凸显) — is this block one the
 *  user put something of their own into?
 *
 *  ⚠️ The rule is not invented for the filter: it is the pack's own 💭 Personal category,
 *  which counts a sourceless entry AND a `note:` line the user wrote. Both halves matter.
 *  Dropping the second one would hide a note the user wrote ON an AI-written block —
 *  precisely the signal the comment above calls Spool's strongest, and precisely the one
 *  that gets more common as more blocks arrive through MCP. */
export const isUserWritten = (b: {
  source: string | null;
  annotation: string | null;
  annotationBy: AnnotationAuthor | null;
}): boolean =>
  !b.source?.trim() || (!!b.annotation?.trim() && !annotationIsAi(b.annotationBy, b.source));
