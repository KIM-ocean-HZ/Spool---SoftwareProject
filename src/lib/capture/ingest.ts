import type { Block } from '@/lib/db/blocks';
import { createBlock } from '@/lib/db/blocks';
import { getCaptureTargetThread } from '@/lib/db/threads';

export interface IngestResult {
  block: Block;
  threadId: string;
  workspaceId: string;
  threadTitle: string;
}

// Pure local write path. AI classification (§9.11) runs asynchronously after this
// returns and is wired up in Phase 10 — never in the capture hot path (Principle 4).
export const ingestCapture = async (
  content: string,
  source: string | null,
): Promise<IngestResult | null> => {
  const trimmed = content.trim();
  if (!trimmed) return null;
  const target = await getCaptureTargetThread();
  if (!target) return null;
  const block = await createBlock({
    threadId: target.id,
    kind: 'text',
    content: trimmed,
    source: source ?? null,
  });
  return {
    block,
    threadId: target.id,
    workspaceId: target.workspaceId,
    threadTitle: target.title,
  };
};
