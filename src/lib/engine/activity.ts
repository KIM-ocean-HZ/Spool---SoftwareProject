import { isMcpSource } from '@/lib/blocks/sourceIcon';
import type { Block } from '@/lib/db/blocks';

// DESIGN_AI_ENGINE §5 M3 / DESIGN_NEXT_STAGE §4.3 — "AI 活动", the trace half of the
// action → trace loop.
//
// The argument for it, in one line: VS Code dares to let an extension edit your files
// because the Source Control panel shows you what it did. Spool lets an AI append blocks
// to a project through MCP, and until now the only way to notice was to spot a different
// icon in the stream — and the round-3 client report found the other half of the problem
// from the outside: a chat client renders "read your library" and "wrote to your library"
// in the same grey text, so the user cannot tell the two apart on either side.
//
// This is derived, never stored. Everything needed is already on the block: the source
// label says an AI wrote it, and created_at says when. Adding a table for it would mean
// the panel could disagree with the blocks, which is the one thing an audit surface must
// never do.

export interface ActivityGroup {
  /** The client label the blocks carry, e.g. "Claude · MCP" — one per group. */
  source: string;
  /** Newest first, same as the group order. */
  blocks: Block[];
  /** The newest block in the group; what the group is dated by. */
  at: number;
}

// What counts as "the same visit". An MCP client writing a conclusion, then its citation
// a few seconds later, is one thing that happened; the same client writing again after
// lunch is another. Ten minutes is well past any single agentic run's write burst and
// well short of a separate sitting.
export const ACTIVITY_GAP_MS = 10 * 60 * 1000;

/**
 * Group a thread's AI-written blocks into visits, newest first.
 *
 * Only blocks carrying an MCP source label are considered: a block the user typed has no
 * source, and a captured one names the app it came from. Neither belongs in a panel whose
 * whole claim is "this is what the AI did".
 */
export const groupAiActivity = (
  blocks: readonly Block[],
  gapMs: number = ACTIVITY_GAP_MS,
): ActivityGroup[] => {
  const ai = blocks
    .filter((b) => isMcpSource(b.source))
    .slice()
    .sort((a, b) => b.createdAt - a.createdAt);
  const groups: ActivityGroup[] = [];
  for (const block of ai) {
    const open = groups[groups.length - 1];
    const sameVisit =
      open !== undefined &&
      open.source === block.source &&
      // `open.blocks` is newest-first, so the oldest so far is the last one — that is the
      // edge a new (older) block has to be close to.
      open.blocks[open.blocks.length - 1]!.createdAt - block.createdAt <= gapMs;
    if (sameVisit) open.blocks.push(block);
    else groups.push({ source: block.source ?? '', blocks: [block], at: block.createdAt });
  }
  return groups;
};

/** How many blocks in this thread an AI wrote — the number on the collapsed strip. */
export const countAiBlocks = (blocks: readonly Block[]): number =>
  blocks.reduce((n, b) => (isMcpSource(b.source) ? n + 1 : n), 0);

/**
 * Which finished runs the right rail still shows — DESIGN_WORKBENCH §9.13.
 *
 * ⚠️ Two rules, and Ocean's 「跟进没法删除，也不会消失」 was the second one missing:
 *
 *   * **Answered runs are gone.** `reviewedAt` is set the moment the user stores or
 *     dismisses a card. It used to only grey the card, so a rail you had dealt with
 *     entirely still looked full — and the pile only ever grew. The DATABASE row stays
 *     either way: it is what makes the 7-day spend figure true.
 *   * **Only this project's, plus the ones that belong to no project.** A 周回顾 reads the
 *     whole library (`threadId === null`), so it shows wherever you are; everything else
 *     belongs to one project and must not appear under another (§3.4's ambiguity).
 *
 * A pure function rather than a filter inline in the component, because "the card went
 * away when I dismissed it" is exactly the kind of thing no automated check in this project
 * can see (HANDOFF §6.2-bis: synthetic clicks do not drive the webview).
 */
export const visibleRuns = <T extends { threadId: string | null; reviewedAt: number | null }>(
  runs: readonly T[],
  threadId: string | null,
): T[] =>
  runs.filter(
    (r) =>
      r.reviewedAt === null &&
      (r.threadId === null || (threadId !== null && r.threadId === threadId)),
  );
