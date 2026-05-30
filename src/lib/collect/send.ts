import { nanoid } from 'nanoid';
import { insertAttachments, type Attachment } from '@/lib/db/attachments';
import { insertBlocks, type Block } from '@/lib/db/blocks';
import type { StagingItem } from './stagingBuffer';

// Write each staging item as its OWN block to `threadId` (the current capture target),
// keeping every item's content, annotation, pinned state, source, and attachments
// INDEPENDENT (§20.9 v2.10). Collect mode no longer merges the buffer into a single block —
// per-item annotations stay separate fields, so each shows as its own block's note in the
// feed instead of being folded into one block's text. Blocks append in staging order via a
// base+i ms created_at. Returns the created blocks (empty for an empty buffer → Send is a
// no-op, and the button is disabled too).
//
// Runs in the collect window (its own SQLite connection, per capabilities/collect.json) and
// is INSERT-only (see blocks.insertBlocks). The `collect_send` undo entry is NOT pushed here:
// per §9.13's cross-window contract it belongs in the MAIN window's undo ring, which lives in
// a different JS context — the panel reports the written blocks to main (via `collect:closed`)
// and main pushes the entry there.
export const sendStaging = async (
  items: StagingItem[],
  threadId: string,
): Promise<Block[]> => {
  if (items.length === 0) return [];
  const base = Date.now();
  const blocks: Block[] = items.map((it, i) => ({
    id: nanoid(),
    threadId,
    kind: 'text',
    content: it.content,
    annotation: it.annotation.trim() || null,
    refThreadId: null,
    source: it.source,
    pinned: it.pinned,
    createdAt: base + i,
  }));
  const attachments: Attachment[] = [];
  items.forEach((it, i) => {
    const blockId = blocks[i]!.id;
    for (const a of it.attachments) {
      attachments.push({
        id: nanoid(),
        blockId,
        kind: a.kind,
        target: a.target,
        label: a.label,
        extractedText: null,
        extractedAt: null,
        extractionKind: null,
        includeInPack: false,
        createdAt: base + i,
      });
    }
  });
  await insertBlocks(blocks);
  await insertAttachments(attachments);
  return blocks;
};
