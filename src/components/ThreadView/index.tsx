import { useEffect, useMemo, useState } from 'react';
import PackDialog from '@/components/Pack/PackDialog';
import type { Attachment } from '@/lib/db/attachments';
import { listBlocksByIds, type Block } from '@/lib/db/blocks';
import { useBlocksStore } from '@/stores/blocksStore';
import { selectThreadById, useThreadsStore } from '@/stores/threadsStore';
import CompleteThreadPanel from './CompleteThreadPanel';
import DigestView from './DigestView';
import LogView from './LogView';
import ThreadHeader, { type ThreadViewMode } from './ThreadHeader';
import { t } from '@/lib/i18n';

const EMPTY: readonly Block[] = [];

export default function ThreadView() {
  const activeId = useThreadsStore((s) => s.activeId);
  const thread = useThreadsStore(selectThreadById(activeId));
  const patch = useThreadsStore((s) => s.patch);

  const blocks = useBlocksStore((s) =>
    activeId ? s.byThread[activeId] ?? EMPTY : EMPTY,
  );
  const attachmentsByBlock = useBlocksStore((s) => s.attachmentsByBlock);
  const threadsByWs = useThreadsStore((s) => s.threadsByWorkspace);

  // Flatten every attachment whose owning block is in this thread. PackDialog wants a
  // single array (assemble() groups by block internally), and rebuilding it lazily
  // beats keeping a parallel cache in sync.
  const attachments = useMemo<Attachment[]>(() => {
    if (!blocks.length) return [];
    const out: Attachment[] = [];
    for (const b of blocks) {
      const arr = attachmentsByBlock[b.id];
      if (arr) out.push(...arr);
    }
    return out;
  }, [blocks, attachmentsByBlock]);

  const [packOpen, setPackOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  // For `done` threads the user can flip to LogView within a session; the override
  // resets to null on thread switch so reopens default back to DigestView (§9.9).
  const [viewOverride, setViewOverride] = useState<ThreadViewMode | null>(null);
  useEffect(() => {
    setViewOverride(null);
    setCompleteOpen(false);
  }, [activeId]);

  // Pack uses ref blocks' refThreadId to look up the *current* title — that's the whole
  // point of @-mention (Phase 9). Build the lookup from the loaded threads so the
  // briefing always reflects live state, not a stale snapshot from capture time.
  const refTitles = useMemo(() => {
    const map = new Map<string, string>();
    for (const list of Object.values(threadsByWs)) {
      for (const th of list) map.set(th.id, th.title || t('（无标题）'));
    }
    return map;
  }, [threadsByWs]);

  // v2.4 (§20.13 D2): resolve blocks cited via refBlockId (MCP writers set it; the
  // citee may live in another thread) so the pack can render its ↩ cites preview.
  // Missing rows stay out of the map — assemble renders those citations as gone.
  const [refBlocks, setRefBlocks] = useState<Map<string, { content: string; createdAt: number }>>(
    () => new Map(),
  );
  useEffect(() => {
    const ids = [...new Set(blocks.map((b) => b.refBlockId).filter((id): id is string => !!id))];
    if (ids.length === 0) {
      setRefBlocks(new Map());
      return;
    }
    let stale = false;
    void listBlocksByIds(ids).then((rows) => {
      if (stale) return;
      setRefBlocks(new Map(rows.map((b) => [b.id, { content: b.content, createdAt: b.createdAt }])));
    });
    return () => {
      stale = true;
    };
  }, [blocks]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        if (thread) setPackOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [thread]);

  if (!thread) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <p className="font-serif text-3xl italic text-muted">a quiet hub</p>
          <p className="mt-3 text-xs text-muted">{t('从左侧选一条脉络，或按 ⌘N 新建')}</p>
        </div>
      </div>
    );
  }

  const viewMode: ThreadViewMode =
    thread.status === 'done' ? viewOverride ?? 'digest' : 'log';

  const handleReopen = (): void => {
    void patch(thread.id, { status: 'active', completedAt: null, digest: null });
    setViewOverride(null);
  };

  return (
    <div className="relative flex h-full flex-col">
      <ThreadHeader
        thread={thread}
        blocks={blocks}
        onPack={() => setPackOpen(true)}
        onComplete={() => setCompleteOpen(true)}
        onReopen={handleReopen}
        viewMode={viewMode}
        onSetViewMode={setViewOverride}
      />
      {viewMode === 'digest' ? (
        <DigestView
          key={thread.id}
          thread={thread}
          blocks={blocks}
          attachmentsByBlock={attachmentsByBlock}
          onShowLog={() => setViewOverride('log')}
        />
      ) : (
        <LogView key={thread.id} threadId={thread.id} />
      )}

      {packOpen && (
        <PackDialog
          thread={thread}
          blocks={blocks as Block[]}
          attachments={attachments}
          refTitles={refTitles}
          refBlocks={refBlocks}
          onClose={() => setPackOpen(false)}
        />
      )}

      {completeOpen && (
        <CompleteThreadPanel
          thread={thread}
          onClose={() => setCompleteOpen(false)}
        />
      )}
    </div>
  );
}
