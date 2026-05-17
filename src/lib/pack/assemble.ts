import type { Attachment } from '@/lib/db/attachments';
import type { Block } from '@/lib/db/blocks';
import type { Thread } from '@/lib/db/threads';
import {
  EMPTY_DIGEST_LINE,
  EMPTY_LOG_LINE,
  EMPTY_NEXT_STEP_LINE,
  PACK_HEADER,
  SECTION_FILES,
  SECTION_KEY,
  SECTION_LOG,
  SECTION_NEXT_STEP,
} from './templates';

export interface AssembleArgs {
  thread: Thread;
  blocks: Block[];
  // Every attachment belonging to this thread's blocks. The caller supplies them;
  // an empty array is fine. Grouped by blockId internally.
  attachments?: Attachment[];
  // Map of referenced thread id → title; used to render `kind=ref` blocks. The caller
  // (Phase 9 @-mention) supplies this. Empty map is fine for Phase 4.
  refTitles?: Map<string, string>;
  // For deterministic output in tests.
  now?: number;
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

// Local-time formatter — Spool data has no timezone metadata, just unix ms. Output is
// always 24h "YYYY-MM-DD HH:mm" so the briefing is unambiguous when pasted into a foreign
// timezone.
export const formatPackTime = (ts: number): string => {
  const d = new Date(ts);
  return (
    `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ` +
    `${pad2(d.getHours())}:${pad2(d.getMinutes())}`
  );
};

export const formatPackDate = (ts: number): string => {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

const oneLine = (s: string): string => s.replace(/\s+/g, ' ').trim();

// An attachment's display text falls back to its target when the label is empty.
const attachmentLabel = (a: Attachment): string => a.label.trim() || a.target;

// Pure function. No await, no fetch, no DB calls — this is the §6.4 hot path.
export function assemble({ thread, blocks, attachments, refTitles, now }: AssembleArgs): string {
  const dateStr = formatPackDate(now ?? Date.now());
  const out: string[] = [];

  out.push(PACK_HEADER(thread.title, dateStr, blocks.length));

  // Next step: where the user left off. Shown right after the header so a re-entry
  // briefing leads with what to do next.
  out.push('');
  out.push(SECTION_NEXT_STEP);
  out.push(thread.nextStep?.trim() ? thread.nextStep.trim() : EMPTY_NEXT_STEP_LINE);

  // Key Information: pinned text blocks only. Attachments and refs aren't "key info" —
  // they have their own rendering.
  const pinned = blocks.filter((b) => b.pinned && b.kind === 'text');
  out.push('');
  out.push(SECTION_KEY);
  if (pinned.length === 0) {
    out.push(EMPTY_DIGEST_LINE);
  } else {
    for (const b of pinned) {
      out.push(`- ${oneLine(b.content)}`);
    }
  }

  // Group attachments by their owning block so each block lists its own inline.
  const byBlock = new Map<string, Attachment[]>();
  for (const a of attachments ?? []) {
    const list = byBlock.get(a.blockId);
    if (list) list.push(a);
    else byBlock.set(a.blockId, [a]);
  }

  // Full Record: every block in chronological order. text/ref render differently so a
  // downstream reader (human or AI) can tell them apart; a block's annotation and its
  // attachments are listed indented beneath it.
  out.push('');
  out.push(SECTION_LOG);
  if (blocks.length === 0) {
    out.push(EMPTY_LOG_LINE);
  } else {
    for (const b of blocks) {
      const time = formatPackTime(b.createdAt);
      if (b.kind === 'text') {
        const header = b.source ? `[${time} · 来自 ${b.source}]` : `[${time}]`;
        out.push(`${header} ${b.content.trim()}`);
      } else if (b.kind === 'ref') {
        const title =
          (b.refThreadId ? refTitles?.get(b.refThreadId) : null) || b.content || '（未知脉络）';
        out.push(`[${time}] → 引用脉络：${title}`);
      }
      if (b.annotation?.trim()) {
        out.push(`    备注：${oneLine(b.annotation)}`);
      }
      for (const a of byBlock.get(b.id) ?? []) {
        out.push(`    附件：${attachmentLabel(a)}`);
      }
    }
  }

  // Related Files & Links: every attachment in the thread, collected so the user can
  // scan at a glance what artifacts belong to the project.
  const all = attachments ?? [];
  if (all.length > 0) {
    out.push('');
    out.push(SECTION_FILES);
    for (const a of all) {
      out.push(`- ${attachmentLabel(a)} — ${a.target}`);
    }
  }

  // Trailing newline so consecutive paste actions don't run together.
  return out.join('\n') + '\n';
}
