import { invoke } from '@tauri-apps/api/core';
import { PanelLeftOpen, PanelRightOpen } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import PackHost from '@/components/Pack/PackHost';
import WorkspacePackHost from '@/components/Pack/WorkspacePackHost';
import BreakReminder from '@/components/BreakReminder';
import CloseToTrayHint from '@/components/CloseToTrayHint';
import PermissionBanner from '@/components/PermissionBanner';
import ReviewPanel from '@/components/Review/ReviewPanel';
import RightRail from '@/components/RightRail';
import SearchOverlay from '@/components/Search/SearchOverlay';
import Settings from '@/components/Settings';
import Sidebar from '@/components/Sidebar';
import ProjectBoard from '@/components/ProjectBoard';
import ReviewBoard from '@/components/ReviewBoard';
import NightlyRunner from '@/components/Compress/NightlyRunner';
import ThreadView from '@/components/ThreadView';
import CompleteThreadPanel from '@/components/ThreadView/CompleteThreadPanel';
import FollowUpPanel from '@/components/ThreadView/FollowUpPanel';
import ResizeHandle from '@/components/ui/ResizeHandle';
import ToastRack from '@/components/ui/Toast';
import { MAX_RAIL_WIDTH, resolveLayout } from '@/lib/layout';
import {
  drainMigrationNotices,
  getFirstRunThreadId,
  retranslateTutorial,
  setSeedLanguage,
} from '@/lib/db/client';
import { t } from '@/lib/i18n';
import { toast } from '@/stores/toastStore';
import { useAutoMaintain } from '@/hooks/useAutoMaintain';
import { useBreakReminder } from '@/hooks/useBreakReminder';
import { useCapture } from '@/hooks/useCapture';
import { useAppliedTheme } from '@/hooks/useTheme';
import { useOverlayDbHost } from '@/hooks/useOverlayDbHost';
import { useSearch } from '@/hooks/useSearch';
import { useTrayMenu } from '@/hooks/useTrayMenu';
import { useUndo } from '@/hooks/useUndo';
import { useBlocksStore } from '@/stores/blocksStore';
import { useBreakStore } from '@/stores/breakStore';
import { useCaptureStore } from '@/stores/captureStore';
import { useEngineStore } from '@/stores/engineStore';
import { useProposalsStore } from '@/stores/proposalsStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { selectAllThreadsFlat, selectThreadById, useThreadsStore } from '@/stores/threadsStore';
import { useWorkspacesStore } from '@/stores/workspacesStore';

export default function App() {
  const loadWorkspaces = useWorkspacesStore((s) => s.load);
  const loadThreads = useThreadsStore((s) => s.loadAll);
  const wsLoading = useWorkspacesStore((s) => s.loading);
  const thLoading = useThreadsStore((s) => s.loading);
  const wsError = useWorkspacesStore((s) => s.error);
  const thError = useThreadsStore((s) => s.error);

  const activeId = useThreadsStore((s) => s.activeId);
  const captureTargetId = useThreadsStore((s) => s.captureTargetId);
  const activeThread = useThreadsStore(selectThreadById(activeId));
  const workspaces = useWorkspacesStore((s) => s.workspaces);
  const select = useThreadsStore((s) => s.select);
  const createThread = useThreadsStore((s) => s.create);
  const loadSettings = useSettingsStore((s) => s.load);
  const settingsLoaded = useSettingsStore((s) => s.loaded);
  const language = useSettingsStore((s) => s.language);
  const openSettings = useSettingsStore((s) => s.openPanel);

  // DESIGN_WORKBENCH §3 — the two rails. The right one's width is driven from local state
  // during a drag and only committed to settings.json on release: the store is a file, and
  // persisting per pointer-move would be a few hundred writes per drag.
  // ⚠️ The LEFT one has no width of its own any more (Ocean 2026-08-11) — see lib/layout.ts.
  const updateSettings = useSettingsStore((s) => s.update);
  const storedRailWidth = useSettingsStore((s) => s.railWidth);
  const sidebarCollapsed = useSettingsStore((s) => s.sidebarCollapsed);
  const railCollapsed = useSettingsStore((s) => s.railCollapsed);
  const [dragRail, setDragRail] = useState<number | null>(null);
  // The follow-up brief editor is opened from two places (the rail and the ⋯ menu), so it
  // is mounted once here and its open flag lives in engineStore — a useState in each caller
  // would be two panels, and opening one from each would stack two modals.
  const briefOpen = useEngineStore((s) => s.briefOpen);
  const setBriefOpen = useEngineStore((s) => s.setBriefOpen);
  // Same shape, same reason (DESIGN_WORKBENCH §9.4): the project board can finish a project
  // that is not the one on screen, so the "这个项目结束了" panel is mounted once here and
  // addressed by thread id.
  const pinnedView = useThreadsStore((s) => s.pinnedView);
  // WORKPLAN §9.6.2：压缩的核对桌开在中间区域。
  const completingId = useThreadsStore((s) => s.completingId);
  const completingThread = useThreadsStore(selectThreadById(completingId));
  const setCompleting = useThreadsStore((s) => s.setCompleting);

  // Re-resolve on window resize: a stored width that fit the last screen may not fit this
  // one, and the clamp is what keeps the reading column from reaching zero.
  const [windowWidth, setWindowWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = (): void => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const layout = resolveLayout({
    windowWidth,
    railWidth: dragRail ?? storedRailWidth,
    sidebarCollapsed,
    railCollapsed,
  });

  useCapture();
  useOverlayDbHost();
  useTrayMenu();
  useSearch();
  useUndo();
  // DESIGN_WORKBENCH §4.3 — off unless the user turned it on; the hook checks that itself.
  useAutoMaintain();
  // 情人节限定版 (2026-08-19) — writes the theme onto <html>; the capture overlay does the same
  // from its own root, off the same settings.json.
  useAppliedTheme();
  // 休息提醒 (2026-08-19 second pass) — both appearances now; the hook's gate is the SETTING, and
  // it checks that itself: switched off, it registers no listeners and no interval. Mounted HERE
  // and not in the overlay on purpose — see the hook's header. What it produces goes into
  // breakStore, because the sidebar's countdown reads the same streak.
  useBreakReminder();
  const breakLockUntil = useBreakStore((s) => s.lockUntil);
  const unlockBreak = useBreakStore((s) => s.unlock);

  // Settings load FIRST, and the resolved language is handed to the db module before
  // anything opens the database (2026-07-31, HANDOFF §2.2/§2.3): on a fresh install the
  // tutorial threads are seeded once, in the language this launch starts in — and at
  // first launch settings.json does not exist yet, so that language comes from the
  // system locale. Loading workspaces is what opens the DB, hence the single sequence.
  useEffect(() => {
    void (async () => {
      await loadSettings();
      setSeedLanguage(useSettingsStore.getState().language);
      await loadWorkspaces();
      await loadThreads();
      // The review queue is filled by a different process entirely (an AI client's
      // `spool --mcp`), so the count is polled, never pushed. Once at startup, and again
      // on focus below.
      void useProposalsStore.getState().refresh();
      // 拍板点 5: only a launch that created the database arms the one-time closing
      // line, so an existing library never sees it (DESIGN_FIRST_RUN §4).
      if (getFirstRunThreadId()) {
        // V2 ④ rides the same first-run gate: the reading-gesture line is onboarding, and
        // onboarding that reaches an existing library is noise (§4 拍板点 5's rule).
        await useSettingsStore
          .getState()
          .update({ firstCaptureHintPending: true, blockNavHintPending: true });
      }
    })();
  }, [loadSettings, loadWorkspaces, loadThreads]);

  // 拍板点 1: a first launch opens on the tutorial thread — the 6 blocks written for
  // exactly this moment — instead of the empty Unsorted thread that used to be the
  // first thing a stranger saw. Every later launch (and this one, once the user has
  // deleted the tutorial) falls back to the capture target as before.
  useEffect(() => {
    if (activeId) return;
    const firstRun = getFirstRunThreadId();
    const stillThere =
      firstRun !== null &&
      selectAllThreadsFlat(useThreadsStore.getState()).some((th) => th.id === firstRun);
    const next = stillThere ? firstRun : captureTargetId;
    if (next) select(next);
  }, [activeId, captureTargetId, select]);

  // Ocean 2026-08-03: the tutorial threads follow the language switch. They are database
  // rows, so retranslateTutorial only rewrites what is still exactly as seeded (see its
  // comment) — and only the main window runs it, the same single-writer rule the seed
  // itself follows. Skips the first pass: `prev === null` is this window opening, not a
  // switch.
  const prevLanguage = useRef<'zh' | 'en' | null>(null);
  useEffect(() => {
    if (!settingsLoaded) return;
    const prev = prevLanguage.current;
    prevLanguage.current = language;
    if (prev === null || prev === language) return;
    void (async () => {
      try {
        if (!(await retranslateTutorial(prev, language))) return;
        await loadThreads();
        const active = useThreadsStore.getState().activeId;
        if (active) await useBlocksStore.getState().load(active);
      } catch (e) {
        console.warn('[tutorial] re-translation failed', e);
      }
    })();
  }, [language, settingsLoaded, loadThreads]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'n' && !e.shiftKey) {
        e.preventDefault();
        const wsId = activeThread?.workspaceId ?? workspaces[0]?.id ?? null;
        if (wsId) void createThread(wsId);
      } else if ((e.metaKey || e.ctrlKey) && e.key === ',') {
        e.preventDefault();
        openSettings();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeThread, workspaces, createThread, openSettings]);

  // Once settings are in, push the saved shortcuts to Rust so a user's re-bound keys
  // take effect (§19.1). Rust registered the search default at setup(); capture has no
  // default (2026-07-07) — null here means "no capture shortcut bound". set_shortcuts
  // no-ops when the persisted pair already equals what's registered. Keyed off `loaded`
  // rather than calling load() again: the boot sequence above owns that call.
  useEffect(() => {
    if (!settingsLoaded) return;
    void (async () => {
      void useSettingsStore.getState().loadAutostart();
      // v2.7: backfill text extraction for legacy file attachments (§9.6). Runs after
      // settings load so it honours the auto-extract switch; background, never blocks UI.
      void useBlocksStore.getState().backfillExtractions();
      // v15 (DESIGN_PROJECT_FILES §5.1 ③ point 2): if the migration removed the retired
      // `url` attachments, the user hears about it exactly once. Links must not evaporate
      // silently — a toast is the cheapest honest form of "I deleted something of yours".
      for (const n of drainMigrationNotices()) {
        if (n.kind === 'url-attachments-removed') {
          toast.notice(t('这次更新去掉了「附加链接」，你原来加的 {n} 个链接已经删掉了。', { n: n.count }));
        }
      }
      const { captureShortcut, searchShortcut } = useSettingsStore.getState();
      try {
        await invoke('set_shortcuts', { capture: captureShortcut, search: searchShortcut });
      } catch (e) {
        console.warn('[shortcuts] applying persisted shortcuts failed', e);
      }
    })();
  }, [settingsLoaded]);

  // §20.13: the MCP write tools insert threads/blocks from OUTSIDE this process, so
  // the stores' in-memory state can go stale while Spool is in the background. Coming
  // back to the window is the natural "show me what changed" moment — re-pull the
  // thread list and the active thread's blocks, throttled so rapid focus flips don't
  // hammer SQLite. Both loads are refresh-safe (selection preserved, rows replaced).
  const lastFocusReloadRef = useRef(0);
  useEffect(() => {
    const onFocus = (): void => {
      const now = Date.now();
      if (now - lastFocusReloadRef.current < 3000) return;
      lastFocusReloadRef.current = now;
      void useThreadsStore.getState().loadAll();
      const active = useThreadsStore.getState().activeId;
      if (active) void useBlocksStore.getState().load(active);
      void useProposalsStore.getState().refresh();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  useEffect(() => {
    (window as unknown as Record<string, unknown>).__spool = {
      workspaces: useWorkspacesStore,
      threads: useThreadsStore,
      blocks: useBlocksStore,
      capture: useCaptureStore,
    };
  }, []);

  const error = wsError ?? thError;

  if (error) {
    return (
      <div
        style={{
          minHeight: '100vh',
          padding: '64px 32px 32px',
          background: '#faf7f0',
          color: '#1c1a16',
          fontFamily: 'ui-monospace, monospace',
        }}
      >
        <div style={{ fontSize: '18px', marginBottom: '12px', color: '#b3402f' }}>
          {t('数据库初始化失败')}
        </div>
        <pre
          style={{
            background: '#f3eee2',
            border: '1px solid #d6cdb3',
            borderRadius: '6px',
            padding: '12px',
            maxHeight: '50vh',
            overflow: 'auto',
            fontSize: '11px',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
          }}
        >
          {error}
        </pre>
        <div style={{ marginTop: '12px', fontSize: '12px', color: '#8c8576' }}>
          {t('打开 DevTools（右键 → Inspect）→ Console 看完整堆栈。')}
        </div>
      </div>
    );
  }

  if (wsLoading || thLoading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          /* Tokens, not the literal hexes these used to be. The values are identical in 经典
             (tokens.css), so the shipped look is unchanged — but the 情人节 theme is applied by
             then, and hard-coded cream here meant a cream flash on every single launch of it.
             ⚠️ The fatal-error screen below/above keeps its literal hexes on purpose: it paints
             when the database failed to open, and it should not depend on anything. */
          background: 'var(--paper)',
          color: 'var(--ink)',
          fontFamily: 'var(--font-serif)',
          fontSize: '28px',
          fontStyle: 'italic',
        }}
      >
        <span className="pulse-dim">{t('加载中…')}</span>
      </div>
    );
  }

  return (
    <>
      <div className="paper-bg flex h-full w-full flex-col">
        <PermissionBanner />
        <div className="flex min-h-0 flex-1">
          {/* DESIGN_WORKBENCH §3 — VS Code's shape, which is what Ocean asked for: two
              rails, either one draggable or collapsed, and the reading column in between
              always keeping its floor (lib/layout.ts). */}
          {sidebarCollapsed ? (
            <button
              type="button"
              onClick={() => void updateSettings({ sidebarCollapsed: false })}
              title={t('展开项目列表')}
              aria-label={t('展开项目列表')}
              className="flex-none self-start rounded p-1.5 text-muted transition-colors hover:bg-paper-2 hover:text-ink"
            >
              <PanelLeftOpen size={14} />
            </button>
          ) : (
            /* ⚠️ No handle on this one (Ocean 2026-08-11: 「左侧边栏改成无法拖移，只有右边栏
               可以移动，固定成最佳显示状态」). The sidebar's own `border-r` is the divider that
               used to be drawn by the handle, so the seam looks the same — it just cannot be
               grabbed. Collapsing it is untouched. */
            <div style={{ width: layout.sidebar }} className="flex-none">
              <Sidebar onCollapse={() => void updateSettings({ sidebarCollapsed: true })} />
            </div>
          )}

          {/* DESIGN_WORKBENCH §9.4 — the pinned entries are sidebar rows whose "workspace" is
              not a set of blocks (the project matrix; the run of weekly reviews), so each
              takes the centre column the way a project does. Selecting any project leaves
              whichever one was open (threadsStore.select). */}
          <main className="min-w-0 flex-1 overflow-hidden">
            {/* ⭐ R4（2026-08-22 晚）：整理面**不再抢中间区**。它现在是项目里的一个页签
                （见 ThreadView），所以这里只剩三个同级的面。
                ⛔ 原来那句「它故意盖过 pinned 视图」连同那个行为一起撤了 —— 那正是
                Ocean 撞到的死路：整理面盖住一切，关掉才回得去，而关掉就等于扔掉那一份。 */}
            {pinnedView === 'board' ? (
              <ProjectBoard />
            ) : pinnedView === 'review' ? (
              <ReviewBoard />
            ) : (
              <ThreadView />
            )}
          </main>

          {/* DESIGN_WORKBENCH §9.13 — **a pinned view has no right rail at all.** Ocean, twice:
              「而不是在右侧边栏中和每个项目共用，这会有歧义」 and then 「去掉项目汇总的右边栏」.
              So the rail is not merely emptied while one is open, it is not mounted — the rail
              is per-project, each pinned view holds its own controls, and the centre column
              gets the whole width. */}
          {pinnedView ? null : railCollapsed ? (
            <button
              type="button"
              onClick={() => void updateSettings({ railCollapsed: false })}
              title={t('展开 AI 面板')}
              aria-label={t('展开 AI 面板')}
              className="flex-none self-start rounded p-1.5 text-muted transition-colors hover:bg-paper-2 hover:text-ink"
            >
              <PanelRightOpen size={14} />
            </button>
          ) : (
            <>
              <ResizeHandle
                side="left"
                width={layout.rail}
                /* ⚠️ From the layout, not MIN_RAIL_WIDTH: the floor is the sidebar's width plus
                   a lead now (lib/layout.ts), and a handle allowed past a floor the layout
                   enforces is a handle that moves while the rail does not. */
                min={layout.railMin}
                max={MAX_RAIL_WIDTH}
                label={t('拖动改变 AI 面板宽度')}
                onResize={setDragRail}
                onCommit={(w) => {
                  setDragRail(null);
                  void updateSettings({ railWidth: w });
                }}
              />
              <div style={{ width: layout.rail }} className="flex-none">
                <RightRail
                  thread={activeThread ?? null}
                  onCollapse={() => void updateSettings({ railCollapsed: true })}
                  onEditBrief={() => setBriefOpen(true)}
                />
              </div>
            </>
          )}
        </div>
      </div>
      <SearchOverlay />
      <ReviewPanel />
      {/* ⑥ 到点跑那一批（§9.6.4）。⛔ 没有 launchd、没有后台常驻 —— 见 NightlyRunner。 */}
      <NightlyRunner />
      <PackHost />
      <WorkspacePackHost />
      {briefOpen && activeThread && (
        <FollowUpPanel thread={activeThread} onClose={() => setBriefOpen(false)} />
      )}
      {completingThread && (
        <CompleteThreadPanel thread={completingThread} onClose={() => setCompleting(null)} />
      )}
      <Settings />
      <CloseToTrayHint />
      {breakLockUntil !== null && (
        <BreakReminder until={breakLockUntil} onDismiss={unlockBreak} />
      )}
      <ToastRack />
    </>
  );
}
