import {
  CalendarRange,
  Inbox,
  LayoutGrid,
  PanelLeftClose,
  Plus,
  Search,
  Settings as SettingsIcon,
} from 'lucide-react';
import { useEffect, useMemo } from 'react';
import { RAIL_SCROLLER_ATTR } from '@/lib/sidebar/railDrag';
import { DUE_SOON_DAYS, dueInDays } from '@/lib/threads/deadline';
import { useT } from '@/lib/i18n';
import { buildWorkspaceTree, compareWorkspaceTitles } from '@/lib/workspaces/tree';
import { useEngineStore } from '@/stores/engineStore';
import { useProposalsStore } from '@/stores/proposalsStore';
import { useSearchStore } from '@/stores/searchStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useThreadsStore } from '@/stores/threadsStore';
import { useWorkspacesStore } from '@/stores/workspacesStore';
import FocusSection from './FocusSection';
import RailDragGhost from './RailDragGhost';
import RecentSection from './RecentSection';
import SpoolCard from './SpoolCard';
import WorkspaceGroup from './WorkspaceGroup';

interface Props {
  /** DESIGN_WORKBENCH §3: both rails collapse, so the sidebar grew a way to close itself. */
  onCollapse: () => void;
}

export default function Sidebar({ onCollapse }: Props) {
  const t = useT();
  const workspaces = useWorkspacesStore((s) => s.workspaces);
  const createWorkspace = useWorkspacesStore((s) => s.create);
  const threadsByWs = useThreadsStore((s) => s.threadsByWorkspace);
  const activeId = useThreadsStore((s) => s.activeId);
  const pinnedView = useThreadsStore((s) => s.pinnedView);
  const openPinned = useThreadsStore((s) => s.openPinned);
  // ⚠️ Flattened in a useMemo off the map, never via selectAllThreadsFlat as a hook selector
  // — that returns a fresh array each call and loops React until it gives up (threadsStore).
  const dueSoon = useMemo(() => {
    const now = Date.now();
    return Object.values(threadsByWs)
      .flat()
      .filter((th) => {
        const d = dueInDays(th, now);
        return d !== null && d <= DUE_SOON_DAYS;
      }).length;
  }, [threadsByWs]);
  // v23: workspaces nest, so the rail draws a tree rather than a list — and 首字母 ordering
  // (backlog §1.3 #1) is applied to the flat list before building, which orders every level
  // in one step. ⚠️ Sorting here rather than in listWorkspaces on purpose: this is the rail's
  // reading order, and the capture overlay's workspace picker has its own reasons for the
  // order rows arrive in.
  const tree = useMemo(
    () => buildWorkspaceTree([...workspaces].sort(compareWorkspaceTitles)),
    [workspaces],
  );
  const openSearch = useSearchStore((s) => s.openSearch);
  const openSettings = useSettingsStore((s) => s.openPanel);
  // DESIGN_MCP_WRITE_ROLE §4.3: the only way in. A badge, in the footer, absent when the
  // queue is empty — never a dialog that jumps the window to the front (the AI may have
  // queued this while the user was in another app, or asleep).
  const pendingProposals = useProposalsStore((s) => s.pendingCount);
  const openReview = useProposalsStore((s) => s.open);
  // Is there a local CLI to write a weekly review at all — the one fact that decides whether
  // 周回顾's row is a door or a dead end (see the row itself). The probe is also run by the
  // right rail, but that rail can be collapsed, and a row that stays hidden because nobody
  // asked the question would be the same bug in the other direction.
  const engineStatus = useEngineStore((s) => s.status);
  const probeEngine = useEngineStore((s) => s.probe);
  useEffect(() => {
    if (engineStatus === null) void probeEngine();
  }, [engineStatus, probeEngine]);
  const engineAvailable = engineStatus?.available === true;

  return (
    /* ⚠️ 这两条边栏**故意没有底色**，别再给它加回来。`bg-paper-2/40` 在这儿挂了很久，但
       Tailwind 一直把它整条丢掉（见 styles/tokens.css 那段注释），所以发布版里这条栏一直是
       透明的、透出 `.paper-bg`。2026-08-19 修好那个 bug 之后它第一次显形，Ocean 当场看了实机：
       「这个我不要，右栏现在也是这个状态，回退」。于是类名删掉——**保持发布版一直以来的样子**。 */
    <aside className="flex h-full w-full flex-col border-r border-line">
      {/* ⚠️ The title is deliberately larger than the panel below it, and the gap under it is
          deliberately wide. Ocean 2026-08-10, on seeing 首日价值二期 installed: 「logo 太小了,
          被面板抢占了注意力,增大一点,面板和 logo 增加距离」. The panel is a status readout; the
          name of the product is what the top of the sidebar is for. */}
      <header className="flex items-start justify-between gap-2 px-5 pb-6 pt-5">
        <h1 className="min-w-0 font-serif text-3xl tracking-tight text-ink">
          Spool
          <span className="ml-2 font-serif text-lg italic text-muted">思簿</span>
        </h1>
        <button
          type="button"
          onClick={onCollapse}
          title={t('收起')}
          aria-label={t('收起')}
          className="mt-2.5 flex-none rounded p-1 text-muted transition-colors hover:bg-paper-2 hover:text-ink"
        >
          <PanelLeftClose size={14} />
        </button>
      </header>

      {/* `data-rail-scroller`: a project drag scrolls this element when the cursor nears its
          top or bottom edge (lib/sidebar/railDrag). Without it a project could only ever be
          dropped on a workspace that already happened to be on screen. */}
      <div {...{ [RAIL_SCROLLER_ATTR]: '' }} className="flex-1 overflow-y-auto px-2 pb-4">
        {/* DESIGN_WORKBENCH §9.4 — 项目管理, pinned above everything.
            Ocean 2026-08-07: 「左侧边栏加入一个项目管理的一个总项目，显示方式和普通项目一样，
            只是置顶，然后它的工作区用来存放项目矩阵」.

            ⚠️ This replaces the folded 「N 个项目在进行」 strip that lived in the right rail —
            his verdict on that one was 「没有占据位置，用户并不会使用」, and 「和每个项目共用
            会有歧义」. Both faults are answered by moving it here: navigation is what the left
            sidebar is FOR, so a row that jumps you somewhere belongs on this side, and the
            right rail is left to mean one thing only (what the AI is doing).

            It looks like a project row on purpose — same padding, same active mark — because
            that is what it is to the user: the project whose contents are all the others.

            2026-08-11 — there are two of these now. Ocean: 「周回顾在左侧边栏的位置应该和项目
            管理一起吧，作为独立工作区出现」. Same argument, one dimension over: 项目管理 is every
            project at once, 周回顾 is every project over time. Neither is a project, and neither
            belongs inside one — which is what put a 「回顾」 project in his 升学 workspace and
            a review card in every project's rail (components/ReviewBoard). */}
        <ul>
          <li
            onClick={() => openPinned('board')}
            className={`group relative cursor-pointer rounded-md px-3 py-1.5 transition-colors ${
              pinnedView === 'board' ? 'bg-paper-2' : 'hover:bg-paper-2/60'
            }`}
          >
            {pinnedView === 'board' && (
              <span className="absolute bottom-1.5 left-0 top-1.5 w-[2px] rounded-r bg-accent" />
            )}
            <div className="flex items-center gap-2">
              <LayoutGrid size={12} className="flex-none text-muted" />
              <span className="min-w-0 flex-1 truncate text-sm text-ink">{t('项目管理')}</span>
              {/* The one number worth carrying at rest: how many are about to come due. */}
              {dueSoon > 0 && (
                <span className="flex-none text-[12px]" style={{ color: 'var(--status-parked)' }}>
                  {t('{n} 个快到期', { n: dueSoon })}
                </span>
              )}
            </div>
          </li>
          {/* ⚠️ 2026-08-17 (Ocean, after the Windows install): 「没有 Claude code 和 codex,周回顾
              和跟进都会提示无法使用……对于长期不打算使用这些功能的用户来说影响很大,不如直接选择
              不显示这些功能」 — 拍板:所有平台一样。A weekly review is written BY a local CLI; with
              no CLI on the machine this row leads to a screen whose only content is an
              instruction to install one, which is the nagging gate.ts's 安静原则 already
              rejected everywhere else. On Windows the engine is off at its front door
              (engine.rs), so the row simply never appears there.
              ⚠️ The reviews themselves are never deleted — they sit in `engine_runs`, and the
              row comes back with the CLI. What is hidden is the door, not the history. */}
          {engineAvailable && (
            <li
              onClick={() => openPinned('review')}
              className={`group relative cursor-pointer rounded-md px-3 py-1.5 transition-colors ${
                pinnedView === 'review' ? 'bg-paper-2' : 'hover:bg-paper-2/60'
              }`}
            >
              {pinnedView === 'review' && (
                <span className="absolute bottom-1.5 left-0 top-1.5 w-[2px] rounded-r bg-accent" />
              )}
              <div className="flex items-center gap-2">
                <CalendarRange size={12} className="flex-none text-muted" />
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{t('周回顾')}</span>
              </div>
            </li>
          )}
        </ul>
        {/* 首日价值 — 「我攒了多少」. Ocean 2026-08-10 put it on this side rather than over the
            block feed so it is visible whichever project is open, and 二期 (拍板 3) made it
            permanent: 一期's version vanished on a day with no captures, which took the spool
            away on the day it was most needed.

            ⚠️ It sits BELOW 项目管理/周回顾 and above 最近 — Ocean's own placement, 2026-08-11:
            「换成放在周回顾和最近中间，让项目管理和周回顾顶在最上面」. Don't move it back to the
            top of the rail: the two pinned rows are the only things here that go somewhere, and
            he wanted them first. The panel goes nowhere, so it reads as the rail's own readout
            rather than as the first item of a list. */}
        <SpoolCard />
        {/* 变体 A2 (Ocean 2026-08-11) — ONE rule in the rail's list, and it is here: under
            最近+聚焦 together, not under each of them. Both of those are lists the app derives
            for you; everything below is a workspace you made. The rule draws that boundary and
            nothing else, which is the same job the value panel's frame does — so the two lines
            in the rail mean one thing between them, and they share a left and right edge.

            ⚠️ `empty:hidden` is load-bearing, not decoration. Each section hides itself when it
            has nothing (no live threads / no deadlines), and a rule under an empty block is a
            line with nothing above it. This wrapper renders no DOM of its own when both are
            gone, so `:empty` catches exactly that case — without index.tsx having to duplicate
            either section's rule for what counts as 最近 or 聚焦. */}
        <div className="border-b border-line pb-3 empty:hidden">
          <RecentSection />
          <FocusSection />
        </div>
        {workspaces.length === 0 ? (
          <div className="px-3 py-12 text-center">
            <p className="font-serif text-xl italic text-muted">empty</p>
            <p className="mt-2 text-xs text-muted">{t('点下方 + 工作区开始')}</p>
          </div>
        ) : (
          tree.map((node) => (
            <WorkspaceGroup
              key={node.workspace.id}
              node={node}
              threadsByWorkspace={threadsByWs}
              activeThreadId={activeId}
            />
          ))
        )}
      </div>

      <footer className="flex items-center justify-between border-t border-line px-4 py-3">
        <button
          onClick={() => void createWorkspace()}
          className="flex items-center gap-1 rounded p-1 text-xs text-muted hover:bg-paper-2 hover:text-ink"
          title={t('新建工作区')}
        >
          <Plus size={12} />
          <span>{t('工作区')}</span>
        </button>
        <div className="flex items-center gap-1">
          {pendingProposals > 0 && (
            <button
              onClick={() => void openReview()}
              title={t('AI 提了 {n} 条待你过目（还没进你的库）', { n: pendingProposals })}
              className="flex items-center gap-1 rounded border border-accent/60 bg-accent-soft px-1.5 py-0.5 text-[13px] text-accent transition-colors hover:border-accent hover:bg-accent/15"
            >
              <Inbox size={12} />
              <span className="font-mono">{pendingProposals}</span>
            </button>
          )}
          <button
            onClick={openSearch}
            className="rounded p-1 text-muted hover:bg-paper-2 hover:text-ink"
            title={t('搜索全部内容 (⌘⇧F)')}
          >
            <Search size={14} />
          </button>
          <button
            onClick={openSettings}
            className="rounded p-1 text-muted hover:bg-paper-2 hover:text-ink"
            title={t('设置 (⌘,)')}
          >
            <SettingsIcon size={14} />
          </button>
        </div>
      </footer>

      {/* Outside the scroller on purpose: it is position:fixed and follows the cursor, so it
          has no business being clipped by, or scrolling with, the list it started in. */}
      <RailDragGhost />
    </aside>
  );
}
