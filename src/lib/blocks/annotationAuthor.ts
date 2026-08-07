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
export type AnnotationAuthor = 'user' | 'ai';

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
): boolean => (annotationBy ? annotationBy === 'ai' : isMcpSource(source));
