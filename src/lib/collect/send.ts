import { joinSegments } from '@/lib/blocks/segments';
import { createAttachment } from '@/lib/db/attachments';
import { createBlock, togglePin, type Block } from '@/lib/db/blocks';
import type { StagingItem } from './stagingBuffer';

// Merge the staging buffer into ONE block written to `threadId` (the current capture
// target). Each item becomes a SEGMENT: contents joined with a blank line between, and each
// item's own annotation preserved as a per-segment `↪ note:` marker (§20.1 segments.ts).
// The feed's SegmentedContent then renders every item's note INDEPENDENTLY inside the single
// merged block (§20.9 v2.10) — collect merges into one block, it does NOT split items into
// separate blocks, and per-item annotations are no longer flattened into one note.
//
// pinned = true if any item is pinned; source = the first item's; attachments from every
// item are collected onto the block. The top-level `annotation` column stays null because the
// per-segment notes live in the content (carrying both would render twice — §20.1 contract).
//
// Returns the created block, or null for an empty buffer (Send is a no-op then — the button
// is disabled too). Runs in the collect window (its own SQLite connection). The `collect_send`
// undo entry is NOT pushed here: per §9.13's cross-window contract it belongs in the MAIN
// window's undo ring (a different JS context) — the panel reports the block via `collect:closed`
// and main pushes it there.
export const sendStaging = async (
  items: StagingItem[],
  threadId: string,
): Promise<Block | null> => {
  if (items.length === 0) return null;
  const content = joinSegments(
    items.map((it) => ({ text: it.content, annotation: it.annotation.trim() || null })),
  );
  const block = await createBlock({
    threadId,
    kind: 'text',
    content,
    annotation: null,
    source: items[0]!.source,
  });
  for (const it of items) {
    for (const a of it.attachments) {
      try {
        await createAttachment({
          blockId: block.id,
          kind: a.kind,
          target: a.target,
          label: a.label,
        });
      } catch (e) {
        console.warn('[collect] attach on send failed', a, e);
      }
    }
  }
  let pinned = false;
  if (items.some((it) => it.pinned)) {
    try {
      pinned = await togglePin(block.id);
    } catch (e) {
      console.warn('[collect] pin merged block failed', e);
    }
  }
  return { ...block, pinned };
};
