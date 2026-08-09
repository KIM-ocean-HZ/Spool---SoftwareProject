import { useEffect, useState } from 'react';
import type { Attachment } from '@/lib/db/attachments';
import type { Block } from '@/lib/db/blocks';
import { t } from '@/lib/i18n';
import { useBlocksStore } from '@/stores/blocksStore';
import { selectThreadById, useThreadsStore } from '@/stores/threadsStore';
import DateNotices from './DateNotices';
import DigestView from './DigestView';
import LogView from './LogView';
import ThreadHeader, { type ThreadViewMode } from './ThreadHeader';

const EMPTY: readonly Block[] = [];
const EMPTY_ATTACHMENTS: readonly Attachment[] = [];

export default function ThreadView() {
  const activeId = useThreadsStore((s) => s.activeId);
  const thread = useThreadsStore(selectThreadById(activeId));
  const reopen = useThreadsStore((s) => s.reopen);

  const blocks = useBlocksStore((s) =>
    activeId ? s.byThread[activeId] ?? EMPTY : EMPTY,
  );
  const attachments = useBlocksStore((s) =>
    activeId ? s.attachmentsByThread[activeId] ?? EMPTY_ATTACHMENTS : EMPTY_ATTACHMENTS,
  );

  // DESIGN_WORKBENCH §9.4 / §9.13: both the completion panel and the pack dialog are owned
  // by App now — 项目管理 can finish or pack a project that is not the one on screen, so
  // their open flags are thread ids in the store rather than booleans here.
  const setCompleting = useThreadsStore((s) => s.setCompleting);
  const setPacking = useThreadsStore((s) => s.setPacking);
  // For `done` threads the user can flip to LogView within a session; the override
  // resets to null on thread switch so reopens default back to DigestView (§9.9).
  const [viewOverride, setViewOverride] = useState<ThreadViewMode | null>(null);
  useEffect(() => {
    setViewOverride(null);
  }, [activeId]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault();
        if (thread) setPacking(thread.id);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [thread, setPacking]);

  if (!thread) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="text-center">
          <p className="font-serif text-3xl italic text-muted">a quiet hub</p>
          <p className="mt-3 text-xs text-muted">{t('从左侧选一个项目，或按 ⌘N 新建')}</p>
        </div>
      </div>
    );
  }

  const viewMode: ThreadViewMode =
    thread.status === 'done' ? viewOverride ?? 'digest' : 'log';

  const handleReopen = (): void => {
    void reopen(thread.id);
    setViewOverride(null);
  };

  return (
    <div className="relative flex h-full flex-col">
      <ThreadHeader
        thread={thread}
        blocks={blocks}
        onPack={() => setPacking(thread.id)}
        onComplete={() => setCompleting(thread.id)}
        onReopen={handleReopen}
        viewMode={viewMode}
        onSetViewMode={setViewOverride}
      />
      {/* 旧账 §5-3: dates written inside this project's blocks. Log mode only — a finished
          project's dates are nothing to act on, and its screen is a conclusion, not a feed. */}
      {viewMode === 'log' && <DateNotices threadId={thread.id} blocks={blocks} />}
      {viewMode === 'digest' ? (
        <DigestView
          key={thread.id}
          thread={thread}
          blocks={blocks}
          attachments={attachments}
          onShowLog={() => setViewOverride('log')}
        />
      ) : (
        <LogView key={thread.id} threadId={thread.id} />
      )}
    </div>
  );
}
