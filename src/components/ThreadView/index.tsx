import { useEffect, useState } from 'react';
import type { Attachment } from '@/lib/db/attachments';
import type { Block } from '@/lib/db/blocks';
import { t } from '@/lib/i18n';
import { useBlocksStore } from '@/stores/blocksStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { selectThreadById, useThreadsStore } from '@/stores/threadsStore';
import CompressBoard from '@/components/Compress/CompressBoard';
import StaleReview from '@/components/Compress/StaleReview';
import GistBoard, { staleGistCount } from '@/components/Gist/GistBoard';
import { useCompressStore } from '@/stores/compressStore';
import { useSearchStore } from '@/stores/searchStore';
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
  // ⛔⛔ 2026-08-23（Ocean：「点击查旧块会把运行信息写在压缩里面，显示『压缩（在跑）』」）：
  // 这里原来只问了 `running && runningThreadId === activeId` —— **没问跑的是哪一件事**。
  // 两件事共用一把 sidecar 的锁，于是过期检测一跑，压缩那个页签跟着写「（在跑）」。
  const runningKind = useCompressStore((s) =>
    s.running && s.runningThreadId === activeId ? s.runningKind : null,
  );
  const staleLeft = useCompressStore((s) => {
    const sess = activeId ? s.stale[activeId] : null;
    return sess ? sess.proposals.filter((_, i) => sess.decided[i] === undefined).length : 0;
  });
  const engineOn = useSettingsStore((s) => s.apiEngineEnabled);
  const loadProposedStale = useCompressStore((s) => s.loadProposedStale);
  /** 这个项目那张卡上一共有几条（**含已经决定过的**）。
   *  ⚠️ 用它而不是 `staleLeft` 决定页签条出不出：决定完最后一条的那一刻 `staleLeft` 归零，
   *  ⛔ 页签会在用户眼皮底下消失，而他刚刚才点了那一下、还想看到「已换 / 已合并」那句回执。
   *  已决定的那几条留在单子上（划掉，不删）——那是 E3 定的，这里跟着它。 */
  const staleAny = useCompressStore((s) =>
    activeId ? (s.stale[activeId]?.proposals.length ?? 0) : 0,
  );
  /** 「压缩」和「过期检测」这两个出不出。⭐ S2：压缩没开、但 AI 提了东西在等，也要出。 */
  const showTabs = engineOn || staleAny > 0;
  // ⭐⭐ Q4（2026-08-25）：**页签条从此永远画。**
  // 「摘要」是 AI 通过 MCP 写进来的，和本地引擎开没开**毫无关系** —— 一个从没开过引擎的
  // 用户照样会有一库摘要，而在这之前 `showTabs` 是整条页签排的总闸，`false` 的时候
  // 一个页签都不画，那一库摘要就永远看不见。
  // ⛔ 别顺手把 `showTabs` 删了：它仍然挡着「压缩」和「过期检测」—— 那两个点进去
  // 确实只会说「你还没配」，而这正是它当初存在的理由。
  const highlight = useSearchStore((s) => s.highlight);
  /** 「摘要」页签上那个数：**只数「这一块挂着更正，而摘要还是更正之前那句」**。
   *  ⛔ 不数「没有摘要」—— 大多数块本来就没有摘要，那个数字会永远是个大数，
   *  三天之后没有人再看它一眼。 */
  const gistStale = staleGistCount(blocks);
  // For `done` threads the user can flip to LogView within a session; the override
  // resets to null on thread switch so reopens default back to DigestView (§9.9).
  const [viewOverride, setViewOverride] = useState<ThreadViewMode | null>(null);
  useEffect(() => {
    setViewOverride(null);
  }, [activeId]);

  // ⭐ S2（2026-08-24）：AI 提的「整条取代」在**打开项目**的时候就读进来，
  // ⛔ 不是等用户切到那个页签才读 —— 页签上那个数（`staleLeft`）是他唯一会注意到
  // 「有东西在等」的地方，而它读的就是这一份。等切过去才读，等于**提案没人看得见**。
  // ⚠️ 只读库，不花钱、不起 sidecar。
  useEffect(() => {
    if (activeId) void loadProposedStale(activeId);
  }, [activeId, loadProposedStale]);

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
      {/* ⭐⭐ S2（2026-08-24）：**压缩没开，也可能有东西在等。**
          `propose_supersede` 归「允许 AI 写入」管，和「压缩引擎」是两个开关 ——
          只按 `engineOn` 出页签的话，关着压缩的用户永远看不到 AI 提的那一条。
          ⛔ 一条看不见的提案等于没提过。所以有东西等着的时候这一条照出，
          ⚠️ 但「压缩」那个页签仍然只跟着 `engineOn` 走：那一个点进去确实只会说「你还没配」。 */}
      <div className="flex flex-none items-center gap-4 border-b border-line px-5 text-[12px]">
          <Tab active={tab === 'content'} onClick={() => setTab(thread.id, 'content')}>
            {t('内容')}
          </Tab>
          {engineOn && (
          <Tab active={tab === 'compress'} onClick={() => setTab(thread.id, 'compress')}>
            {/* ⚠️ 有一份等着核对就在页签上说出来 —— 切走之后它还在，别让人以为没了。 */}
            {runningKind === 'compress'
              ? t('压缩（在跑）')
              : tidyReady || nightlyReady
                ? t('压缩（1）')
                : t('压缩')}
          </Tab>
          )}
          {/* ⭐ 2026-08-23 Ocean 改的名：「『查旧块』名字改成『过期检测』，更加贴切」。
              ⛔ 仍然不许出现「作废」两个字（§2.E3 写死的）——「过期」不是「作废」。 */}
          {showTabs && (
          <Tab active={tab === 'stale'} onClick={() => setTab(thread.id, 'stale')}>
            {runningKind === 'stale'
              ? t('过期检测（在跑）')
              : staleLeft > 0
                ? t('过期检测（{n}）', { n: staleLeft })
                : t('过期检测')}
          </Tab>
          )}
          {/* ⭐ Q4：和「内容」一样永远在。 */}
          <Tab active={tab === 'gist'} onClick={() => setTab(thread.id, 'gist')}>
            {gistStale > 0 ? t('块摘要（{n}）', { n: gistStale }) : t('块摘要')}
          </Tab>
        </div>

      {tab === 'gist' ? (
        <div className="min-h-0 flex-1">
          {/* ⚠️ 跳转在这一层做：先切回「内容」，再点亮那一块。只调 `highlight` 的话，
              用户还停在「摘要」这一页上，什么都不会发生。 */}
          <GistBoard
            key={thread.id}
            threadId={thread.id}
            onJump={(blockId) => {
              setTab(thread.id, 'content');
              highlight(blockId);
            }}
          />
        </div>
      ) : engineOn && tab === 'compress' ? (
        <div className="min-h-0 flex-1">
          <CompressBoard threadId={thread.id} />
        </div>
      ) : showTabs && tab === 'stale' ? (
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
