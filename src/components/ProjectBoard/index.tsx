import {
  ArrowRight,
  CalendarRange,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FolderInput,
  Package,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import AskAiButton from './AskAiButton';
import StatusDot from '@/components/ui/StatusDot';
import Toggle from '@/components/ui/Toggle';
import { blockStatsByThread, type ThreadBlockStats } from '@/lib/db/blocks';
import type { Thread } from '@/lib/db/threads';
import { canShowEngineActions } from '@/lib/engine/gate';
import { DUE_SOON_DAYS, dueInDays } from '@/lib/threads/deadline';
import { dateLocale, useT } from '@/lib/i18n';
import { ACTION_LABEL, useEngineStore } from '@/stores/engineStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useThreadsStore } from '@/stores/threadsStore';
import { useWorkspacesStore } from '@/stores/workspacesStore';

// DESIGN_WORKBENCH §9.13 — 项目管理's workspace, second pass.
//
// §9.4 made this a grid of cards where clicking a card jumped to that project. Ocean, after
// using it, asked for something a card cannot hold (2026-08-07):
//
//   「点击项目管理需要展开显示 pack，然后一个重要功能：可以链接到 MCP……
//     点击跳转也单独成一键，放在展开列表里」
//
// So a card became a **row that opens**. Clicking no longer navigates — it expands, and the
// jump is one of the buttons inside. That is the trade the request makes explicit: a card
// had exactly one action, so click could BE that action; a row with five needs the click to
// mean "show me the five".
//
// The five, and why each is here rather than only inside the project:
//   * 跳转   — the old click, now labelled. Nothing else in the row navigates.
//   * 打包   — 「展开显示 pack」. Runs through PackHost, so a project that has never been
//              opened gets its blocks loaded on demand (components/Pack/PackHost).
//   * 问 AI  — the point of the whole row (AskAiButton).
//   * 完成 / 重新打开 — 「点击已完成也需要可以重新打开」. A board that could only finish
//              projects was a one-way door.
//   * 删除   — 「项目管理加入删除键」. Goes through the same soft delete + undo toast as the
//              sidebar's, so it is recoverable by the same ⌘Z the rest of the app uses.
//
// ⚠️ **This view also holds the two whole-library controls.** They were in the right rail
// (BoardRail, now deleted) and Ocean cut that: 「去掉项目汇总的右边栏」. 周回顾 reads every
// project and the automation switch governs every project, so 项目管理 — the view that IS
// every project — is where they belong.
//
// 2026-08-10 — 工作区 as a column (拍板第 7 条). Ocean's own model: 「工作区类似大文件夹，
// 项目是按照工作区文件夹分类的」. The sidebar was built on that model; this board was built on
// another one (every project in one flat table), so the dimension he sorts by simply was not
// here. ⚠️ **A column, not grouping** — §9.13 had just finished making this screen lighter and
// grouping would put the weight straight back. A column also lets the move happen in place:
// the sidebar's 移动到工作区 menu is reused verbatim as a sixth row action, so there is one
// menu and one behaviour, not two that drift.

type Sort = 'deadline' | 'created';

const EMPTY_STATS: ThreadBlockStats = { blocks: 0, chars: 0 };

export default function ProjectBoard() {
  const t = useT();
  const byWorkspace = useThreadsStore((s) => s.threadsByWorkspace);
  const select = useThreadsStore((s) => s.select);
  const setCompleting = useThreadsStore((s) => s.setCompleting);
  const setPacking = useThreadsStore((s) => s.setPacking);
  const reopen = useThreadsStore((s) => s.reopen);
  const remove = useThreadsStore((s) => s.remove);
  const patch = useThreadsStore((s) => s.patch);
  const workspaces = useWorkspacesStore((s) => s.workspaces);

  const current = useEngineStore((s) => s.current);
  const enqueue = useEngineStore((s) => s.enqueue);
  const engineStatus = useEngineStore((s) => s.status);
  const probe = useEngineStore((s) => s.probe);
  const timeoutSecs = useSettingsStore((s) => s.aiEngineTimeoutSecs);
  const autoMaintain = useSettingsStore((s) => s.aiAutoMaintain);
  const mcpEnabled = useSettingsStore((s) => s.mcpEnabled);
  const mcpWriteEnabled = useSettingsStore((s) => s.mcpWriteEnabled);
  const actionsEnabled = useSettingsStore((s) => s.aiEngineActionsEnabled);
  const update = useSettingsStore((s) => s.update);

  const [sort, setSort] = useState<Sort>('deadline');
  const [openId, setOpenId] = useState<string | null>(null);
  const [stats, setStats] = useState<Record<string, ThreadBlockStats>>({});
  // Only the open row can show it, and only one row is open, so one flag is enough.
  const [moveOpen, setMoveOpen] = useState(false);

  useEffect(() => {
    if (engineStatus === null) void probe();
  }, [engineStatus, probe]);

  useEffect(() => {
    if (!moveOpen) return;
    const close = (): void => setMoveOpen(false);
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setMoveOpen(false);
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [moveOpen]);

  // One grouped scan for the whole board. Re-read when the project list changes, which is
  // also when a block was written by anything this window knows about.
  useEffect(() => {
    void blockStatsByThread()
      .then(setStats)
      .catch((e) => console.warn('[board] block stats failed', e));
  }, [byWorkspace]);

  const engineReady = canShowEngineActions({
    cliAvailable: engineStatus?.available === true,
    mcpEnabled,
    mcpWriteEnabled,
    actionsEnabled,
  });

  const wsTitleById = useMemo(
    () => new Map(workspaces.map((w) => [w.id, w.title.trim() || t('未命名')])),
    [workspaces, t],
  );

  const now = Date.now();
  // ⚠️ Subscribe to the map and flatten here — `selectAllThreadsFlat` as a hook selector
  // returns a fresh array every call and loops React until it gives up (threadsStore's note).
  const { live, done } = useMemo(() => {
    const all = Object.values(byWorkspace).flat();
    const cmp = (a: Thread, b: Thread): number => {
      if (sort === 'deadline') {
        const da = dueInDays(a, now);
        const db = dueInDays(b, now);
        // A project with no deadline is not "due last", it is not on the clock at all — so
        // it sits below everything that is, rather than at some invented far-future date.
        if (da !== db) {
          if (da === null) return 1;
          if (db === null) return -1;
          return da - db;
        }
      }
      return b.createdAt - a.createdAt;
    };
    return {
      live: all.filter((th) => th.status !== 'done').sort(cmp),
      done: all
        .filter((th) => th.status === 'done')
        .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0)),
    };
  }, [byWorkspace, sort, now]);

  const row = (th: Thread) => {
    const days = dueInDays(th, now);
    const colour =
      days === null
        ? 'var(--muted)'
        : days < 0
          ? 'var(--urgent)'
          : days <= DUE_SOON_DAYS
            ? 'var(--status-parked)'
            : 'var(--muted)';
    const s = stats[th.id] ?? EMPTY_STATS;
    const open = openId === th.id;
    const isDone = th.status === 'done';
    const title = th.title.trim() || t('无标题');
    const summary = isDone ? th.digest || th.summary || '' : th.summary || '';

    return (
      <li key={th.id} className={isDone ? 'opacity-70' : ''}>
        <button
          type="button"
          onClick={() => {
            setMoveOpen(false);
            setOpenId(open ? null : th.id);
          }}
          className="flex w-full items-baseline gap-2 rounded px-2 py-2 text-left transition-colors hover:bg-paper-2/60"
        >
          <span className="flex-none text-muted">
            {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </span>
          <span className="flex-none translate-y-[1px]">
            <StatusDot status={th.status} />
          </span>
          <span className="min-w-0 flex-none max-w-[16rem] truncate font-serif text-base text-ink">
            {title}
          </span>
          {/* 摘要 shares the title's line rather than sitting under it — a row is a line,
              and two-line rows in a long list read as a wall (§9.13 「没有空间呼吸感」). */}
          <span className="min-w-0 flex-1 truncate text-[11px] italic text-muted">
            {summary}
          </span>
          {/* 工作区, beside the other two per-project figures rather than next to the title:
              a fixed-width column only reads as a column if its left edge lines up all the
              way down the list, and title + 摘要 are the two things that never do. */}
          <span className="w-24 flex-none truncate text-[11px] text-muted">
            {wsTitleById.get(th.workspaceId) ?? ''}
          </span>
          <span className="flex-none font-mono text-[10px] text-muted">
            {t('{n} 块', { n: s.blocks })}
          </span>
          <span className="w-20 flex-none text-right font-mono text-[10px]" style={{ color: colour }}>
            {isDone
              ? th.completedAt
                ? t('{when} 完成', {
                    when: new Date(th.completedAt).toLocaleDateString(dateLocale(), {
                      month: 'short',
                      day: 'numeric',
                    }),
                  })
                : t('已完成')
              : days === null
                ? ''
                : days < 0
                  ? t('迟 {n} 天', { n: -days })
                  : days === 0
                    ? t('今天到期')
                    : t('还有 {n} 天', { n: days })}
          </span>
        </button>

        {open && (
          <div className="mb-1 ml-6 flex flex-wrap items-center gap-x-1 gap-y-1 rounded-md border border-line bg-paper-2/40 px-2.5 py-2">
            <span className="mr-2 font-mono text-[10px] text-muted">
              {t('{n} 块 · {chars} 字', {
                n: s.blocks,
                chars: s.chars.toLocaleString('en-US'),
              })}
            </span>
            <RowAction icon={<ArrowRight size={12} />} label={t('跳转')} onClick={() => select(th.id)} />
            <RowAction
              icon={<Package size={12} />}
              label={t('打包')}
              onClick={() => setPacking(th.id)}
            />
            <AskAiButton threadTitle={title} />
            {/* Same menu as the sidebar's right-click one (Sidebar/ThreadListItem), same
                patch call — moved here because a column you cannot act on just tells you
                where the project is, and the complaint was that it was in the wrong place. */}
            <span className="relative" onMouseDown={(e) => e.stopPropagation()}>
              <RowAction
                icon={<FolderInput size={12} />}
                label={t('移动到工作区')}
                onClick={() => setMoveOpen(!moveOpen)}
              />
              {moveOpen && (
                <div
                  role="menu"
                  className="absolute left-0 top-full z-50 mt-1 min-w-[160px] rounded-md border border-line-strong bg-paper py-1 shadow-[var(--shadow-card)]"
                >
                  {workspaces.filter((w) => w.id !== th.workspaceId).length === 0 ? (
                    <div className="px-3 py-1 text-xs text-muted">{t('没有其他工作区')}</div>
                  ) : (
                    workspaces
                      .filter((w) => w.id !== th.workspaceId)
                      .map((ws) => (
                        <button
                          key={ws.id}
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            void patch(th.id, { workspaceId: ws.id });
                            setMoveOpen(false);
                          }}
                          className="block w-full px-3 py-1 text-left text-xs text-ink hover:bg-paper-2"
                        >
                          {ws.title || t('未命名')}
                        </button>
                      ))
                  )}
                </div>
              )}
            </span>
            {isDone ? (
              <RowAction
                icon={<RotateCcw size={12} />}
                label={t('重新打开')}
                onClick={() => void reopen(th.id)}
              />
            ) : (
              <RowAction
                icon={<CheckCircle2 size={12} />}
                label={t('完成')}
                onClick={() => setCompleting(th.id)}
              />
            )}
            {/* Soft delete + the ordinary undo toast (threadsStore.remove), so ⌘Z brings it
                back exactly as it does from the sidebar. No confirm dialog for the same
                reason the sidebar has none: undo IS the confirmation. */}
            <RowAction
              icon={<Trash2 size={12} />}
              label={t('删除')}
              danger
              onClick={() => {
                setOpenId(null);
                void remove(th.id);
              }}
            />
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex flex-none items-baseline justify-between gap-3 border-b border-line px-6 py-3">
        <h2 className="font-serif text-2xl text-ink">{t('项目管理')}</h2>
        <div className="flex items-center gap-1 text-xs">
          {(['deadline', 'created'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setSort(k)}
              className={`rounded-full px-2 py-0.5 transition-colors ${
                sort === k ? 'text-ink' : 'text-muted hover:text-ink-2'
              }`}
            >
              {k === 'deadline' ? t('按截止日期') : t('按新建时间')}
            </button>
          ))}
        </div>
      </header>

      {/* The whole-library controls, evicted from the right rail (§9.13). They are one line
          each and they sit above the list they govern, which is the thing 「和每个项目共用
          会有歧义」 was about: here there is no per-project panel to confuse them with. */}
      {engineReady && (
        <div className="flex flex-none flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-6 py-2">
          <button
            type="button"
            disabled={current !== null}
            onClick={() => enqueue('', '', 'weekly_review', timeoutSecs)}
            title={t('回顾最近一周——跨所有项目，存进「回顾」项目')}
            className="flex items-center gap-1.5 rounded px-1.5 py-1 text-xs text-ink-2 transition-colors enabled:hover:bg-paper-2 enabled:hover:text-accent disabled:text-muted disabled:opacity-50"
          >
            <CalendarRange size={12} className="flex-none" />
            {t(ACTION_LABEL.weekly_review)}
          </button>

          {/* §4.3 — automation, beside the projects it acts on. ⚠️ Default OFF, and that
              stays a deliberate reading of a request that pulled two ways: Ocean asked for
              automation AND for 「必须节约token」/「让用户放心」 in one breath, and this
              switch spends real money without asking again. */}
          <label className="flex cursor-pointer items-center gap-2">
            <Toggle checked={autoMaintain} onChange={(v) => void update({ aiAutoMaintain: v })} />
            <span className="text-xs text-ink-2">{t('自动维护')}</span>
            <span className="text-[10px] text-muted">
              {t('放了一阵子又有新内容的项目，自动压一次；一天最多一次')}
            </span>
          </label>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {live.length === 0 && done.length === 0 ? (
          <p className="pt-12 text-center text-sm text-muted">{t('还没有项目。按 ⌘N 新建一个。')}</p>
        ) : (
          <>
            <ul>{live.map(row)}</ul>
            {done.length > 0 && (
              <>
                <div className="mb-1 mt-5 px-2 text-[10px] uppercase tracking-wide text-muted">
                  {t('已完成')}
                </div>
                <ul>{done.map(row)}</ul>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/** One button in an expanded row. Icon + word, no border — five bordered buttons in a strip
 *  is exactly the 「矩形结构太多」 Ocean objected to in the rail. */
function RowAction({
  icon,
  label,
  onClick,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1 rounded px-2 py-1 text-[11px] transition-colors ${
        danger
          ? 'text-muted hover:bg-paper hover:text-[color:var(--urgent)]'
          : 'text-ink-2 hover:bg-paper hover:text-accent'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
