import { useEffect, useMemo, useState } from 'react';
import PackDialog from './PackDialog';
import { annotationIsAi } from '@/lib/blocks/annotationAuthor';
import type { Attachment } from '@/lib/db/attachments';

const EMPTY_ATTACHMENTS: Attachment[] = [];
import { listBlocksByIds, type Block } from '@/lib/db/blocks';
import { t } from '@/lib/i18n';
import type { CitedBlock } from '@/lib/pack/assemble';
import { useBlocksStore } from '@/stores/blocksStore';
import { selectThreadById, useThreadsStore } from '@/stores/threadsStore';

// DESIGN_WORKBENCH §9.13 — everything PackDialog needs, gathered for ANY project.
//
// The dialog is a pure renderer: it wants the thread, its blocks, every attachment on those
// blocks, and two lookup maps. ThreadView used to assemble all of that inline, which was
// fine while the only way to open a pack was from the project you were reading.
//
// 项目管理 broke that assumption (Ocean 2026-08-07: 「点击项目管理需要展开显示 pack」) — a row
// in the board can pack a project that is not open, whose blocks are therefore not in the
// store. So the assembly moved here, behind a thread id, and the dialog is mounted once in
// App. Same shape and same reason as `threadsStore.completingId` and `engineStore.briefOpen`:
// two surfaces can open it, and two local `useState`s would be two stacked dialogs.

const EMPTY: readonly Block[] = [];

export default function PackHost() {
  const packingId = useThreadsStore((s) => s.packingId);
  const thread = useThreadsStore(selectThreadById(packingId));
  const setPacking = useThreadsStore((s) => s.setPacking);
  const threadsByWs = useThreadsStore((s) => s.threadsByWorkspace);

  const blocks = useBlocksStore((s) =>
    packingId ? s.byThread[packingId] ?? EMPTY : EMPTY,
  );
  // v15: the project's files, read straight off the by-thread index — there is nothing
  // left to flatten. ⚠️ Never build the array inside the selector (交接 §6.2-bis).
  const attachments = useBlocksStore((s) =>
    packingId ? s.attachmentsByThread[packingId] ?? EMPTY_ATTACHMENTS : EMPTY_ATTACHMENTS,
  );
  const loadBlocks = useBlocksStore((s) => s.load);

  // A project reached from the board has never been opened, so its blocks are not in the
  // store. Loading is keyed by thread id and additive (blocksStore.load), so this cannot
  // disturb whatever the centre column is reading.
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!packingId) return;
    if (useBlocksStore.getState().byThread[packingId]) return;
    setLoading(true);
    void loadBlocks(packingId)
      .catch((e) => console.warn('[pack] loading blocks failed', e))
      .finally(() => setLoading(false));
  }, [packingId, loadBlocks]);

  // Pack uses ref blocks' refThreadId to look up the *current* title — that's the whole
  // point of @-mention (Phase 9). Built from the loaded threads so the briefing always
  // reflects live state, not a stale snapshot from capture time.
  const refTitles = useMemo(() => {
    const map = new Map<string, string>();
    for (const list of Object.values(threadsByWs)) {
      for (const th of list) map.set(th.id, th.title || t('（无标题）'));
    }
    return map;
  }, [threadsByWs]);

  // v2.4 (§20.13 D2): resolve blocks cited via refBlockId (MCP writers set it; the citee
  // may live in another thread) so the pack can render its ↩ cites preview. Missing rows
  // stay out of the map — assemble renders those citations as gone. Fetched only while the
  // dialog is open: the data has no other consumer.
  const [refBlocks, setRefBlocks] = useState<Map<string, CitedBlock>>(() => new Map());
  useEffect(() => {
    if (!packingId) return;
    const ids = [...new Set(blocks.map((b) => b.refBlockId).filter((id): id is string => !!id))];
    if (ids.length === 0) {
      setRefBlocks(new Map());
      return;
    }
    let stale = false;
    void listBlocksByIds(ids).then((rows) => {
      if (stale) return;
      setRefBlocks(
        new Map(
          rows.map((b) => [
            b.id,
            {
              content: b.content,
              annotation: b.annotation,
              // v14 (§9.3 拍板乙): carried so the ↩ preview applies the same rule the pack
              // does — an AI-written note never names the block it sits on.
              annotationIsAi: annotationIsAi(b.annotationBy, b.source),
              createdAt: b.createdAt,
            },
          ]),
        ),
      );
    });
    return () => {
      stale = true;
    };
  }, [packingId, blocks]);

  if (!thread || loading) return null;

  return (
    <PackDialog
      thread={thread}
      blocks={blocks as Block[]}
      attachments={attachments}
      refTitles={refTitles}
      refBlocks={refBlocks}
      onClose={() => setPacking(null)}
    />
  );
}
