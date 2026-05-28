import { createAttachment } from '@/lib/db/attachments';
import { createBlock, togglePin, type Block } from '@/lib/db/blocks';
import type { StagingAttachment, StagingItem } from './stagingBuffer';

// The fields of the ONE block a Send produces from the staging buffer. Computed by the
// pure mergeStagingItems(); sendStaging() then writes them to the DB.
export interface MergedStaging {
  content: string;
  annotation: string | null;
  pinned: boolean;
  source: string | null;
  attachments: StagingAttachment[];
}

// Pure merge of staging items into one block's fields, per §20.9 (§20.1 semantics). The
// FIRST item is the survivor. Pure + side-effect-free so the merge contract is unit-tested
// (§18 rule 10) without a DB.
//
// - content:     each item's content joined chronologically with a blank line between.
// - annotation:  items' non-empty annotations newline-joined → the survivor's annotation
//                (the 💭 Personal field per §2.5.1); null when no item is annotated.
// - pinned:      true if ANY item is pinned.
// - source:      the common source if every item shares it, else the survivor's source.
//                Since the survivor is the first item, both cases reduce to the first
//                item's source — collect-send does NOT prepend `[from <source>]` markers
//                (that is §20.1 block-merge behaviour, not the §20.9 send contract).
// - attachments: every item's attachments, in item order, collected onto the survivor.
export const mergeStagingItems = (items: StagingItem[]): MergedStaging => {
  const content = items.map((it) => it.content).join('\n\n');
  const annotations = items.map((it) => it.annotation.trim()).filter((a) => a.length > 0);
  const annotation = annotations.length > 0 ? annotations.join('\n') : null;
  const pinned = items.some((it) => it.pinned);
  const survivor = items[0] ?? null;
  const source = survivor ? survivor.source : null;
  const attachments = items.flatMap((it) => it.attachments);
  return { content, annotation, pinned, source, attachments };
};

// Merge the staging buffer and write it as ONE block to `threadId` (the current capture
// target), with the collected attachments and the pinned state. Returns the created
// block, or null for an empty buffer (Send is a no-op then — the button is disabled too).
//
// Runs in the collect window (its own SQLite connection, per capabilities/collect.json).
// The `collect_send` undo entry is NOT pushed here: per §9.13's cross-window contract it
// belongs in the MAIN window's undo ring, which lives in a different JS context — the
// panel reports the sent block to main (via `collect:closed`) and main pushes it there.
export const sendStaging = async (
  items: StagingItem[],
  threadId: string,
): Promise<Block | null> => {
  if (items.length === 0) return null;
  const merged = mergeStagingItems(items);
  const block = await createBlock({
    threadId,
    kind: 'text',
    content: merged.content,
    annotation: merged.annotation,
    source: merged.source,
  });
  for (const a of merged.attachments) {
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
  let pinned = false;
  if (merged.pinned) {
    try {
      pinned = await togglePin(block.id);
    } catch (e) {
      console.warn('[collect] pin merged block failed', e);
    }
  }
  return { ...block, pinned };
};
