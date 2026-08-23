import { useEffect, useState } from 'react';
import type { Attachment } from '@/lib/db/attachments';
import type { Block } from '@/lib/db/blocks';
import { t } from '@/lib/i18n';
import { useBlocksStore } from '@/stores/blocksStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { selectThreadById, useThreadsStore } from '@/stores/threadsStore';
import CompressBoard from '@/components/Compress/CompressBoard';
import StaleReview from '@/components/Compress/StaleReview';
import { useCompressStore } from '@/stores/compressStore';
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
  // ⭐ R4（2026-08-22 晚，Ocean）：整理面是**项目里的一个页签**，不是一个会盖住一切的窗口。
  // 「点击退出压缩工作区就无法回去」和「进去之后就看不了别的项目」是同一个根子：
  // 一份整理稿占着整个中间区，而它又不属于任何一个项目。
  const tab = useCompressStore((s) => (activeId ? s.tabs[activeId] ?? 'content' : 'content'));
  const setTab = useCompressStore((s) => s.setTab);
  const tidyReady = useCompressStore((s) =>
    activeId ? s.sessions[activeId]?.outcome?.ok === true : false,
  );
  // ⭐ 夜里那一批压好的也算「有一份等你核对」—— 它躺在全局那张单子上，
  // ⚠️ 右栏那个按钮撤掉之后，页签上这个数就是它唯一还看得见的地方。
  const nightlyReady = useCompressStore((s) =>
    activeId ? s.results.some((r) => r.target.threadId === activeId) : false,
  );
  const tidyRunning = useCompressStore((s) => s.running && s.runningThreadId === activeId);
  const staleLeft = useCompressStore((s) => {
    const sess = activeId ? s.stale[activeId] : null;
    return sess ? sess.proposals.filter((_, i) => sess.decided[i] === undefined).length : 0;
  });
  const engineOn = useSettingsStore((s) => s.apiEngineEnabled);
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
      {/* 页签。⚠️ **压缩没开的时候整条不出现** —— 一个点了只会说「你还没配」的页签
          不如没有（和右栏那一格同一条规矩）。

          ⭐ 2026-08-23（Ocean 第 3 条「把两个功能拆出来，变成内容，压缩，和一个新的」）：
          原来是两个页签，第二个叫「整理」，里面上下摞着压缩核对面和查旧块。
          ⛔ 别再摞回去 —— 两件事没关系，摞在一起的唯一后果是核对面只剩半屏。 */}
      {engineOn && (
        <div className="flex flex-none items-center gap-4 border-b border-line px-5 text-[12px]">
          <Tab active={tab === 'content'} onClick={() => setTab(thread.id, 'content')}>
            {t('内容')}
          </Tab>
          <Tab active={tab === 'compress'} onClick={() => setTab(thread.id, 'compress')}>
            {/* ⚠️ 有一份等着核对就在页签上说出来 —— 切走之后它还在，别让人以为没了。 */}
            {tidyRunning
              ? t('压缩（在跑）')
              : tidyReady || nightlyReady
                ? t('压缩（1）')
                : t('压缩')}
          </Tab>
          <Tab active={tab === 'stale'} onClick={() => setTab(thread.id, 'stale')}>
            {staleLeft > 0 ? t('查旧块（{n}）', { n: staleLeft }) : t('查旧块')}
          </Tab>
        </div>
      )}

      {engineOn && tab === 'compress' ? (
        <div className="min-h-0 flex-1">
          <CompressBoard threadId={thread.id} />
        </div>
      ) : engineOn && tab === 'stale' ? (
        <div className="min-h-0 flex-1">
          <StaleReview threadId={thread.id} />
        </div>
      ) : viewMode === 'digest' ? (
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

function Tab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`-mb-px border-b-2 px-0.5 py-1.5 transition-colors ${
        active
          ? 'border-accent text-ink'
          : 'border-transparent text-muted hover:text-ink'
      }`}
    >
      {children}
    </button>
  );
}
