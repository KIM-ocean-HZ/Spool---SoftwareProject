import { Inbox, PanelLeftClose, Plus, Search, Settings as SettingsIcon } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { useProposalsStore } from '@/stores/proposalsStore';
import { useSearchStore } from '@/stores/searchStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useThreadsStore } from '@/stores/threadsStore';
import { useWorkspacesStore } from '@/stores/workspacesStore';
import FocusSection from './FocusSection';
import RecentSection from './RecentSection';
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
  const openSearch = useSearchStore((s) => s.openSearch);
  const openSettings = useSettingsStore((s) => s.openPanel);
  // DESIGN_MCP_WRITE_ROLE §4.3: the only way in. A badge, in the footer, absent when the
  // queue is empty — never a dialog that jumps the window to the front (the AI may have
  // queued this while the user was in another app, or asleep).
  const pendingProposals = useProposalsStore((s) => s.pendingCount);
  const openReview = useProposalsStore((s) => s.open);

  return (
    <aside className="flex h-full w-full flex-col border-r border-line bg-paper-2/40">
      <header className="flex items-start justify-between gap-2 px-5 pb-3 pt-5">
        <h1 className="min-w-0 font-serif text-2xl tracking-tight text-ink">
          Spool
          <span className="ml-2 font-serif text-base italic text-muted">思簿</span>
        </h1>
        <button
          type="button"
          onClick={onCollapse}
          title={t('收起')}
          aria-label={t('收起')}
          className="mt-1.5 flex-none rounded p-1 text-muted transition-colors hover:bg-paper-2 hover:text-ink"
        >
          <PanelLeftClose size={14} />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-2 pb-4">
        <RecentSection />
        <FocusSection />
        {workspaces.length === 0 ? (
          <div className="px-3 py-12 text-center">
            <p className="font-serif text-xl italic text-muted">empty</p>
            <p className="mt-2 text-xs text-muted">{t('点下方 + 工作区开始')}</p>
          </div>
        ) : (
          workspaces.map((ws) => (
            <WorkspaceGroup
              key={ws.id}
              workspace={ws}
              threads={threadsByWs[ws.id] ?? []}
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
              className="flex items-center gap-1 rounded border border-accent/60 bg-accent-soft px-1.5 py-0.5 text-[11px] text-accent transition-colors hover:border-accent hover:bg-accent/15"
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
    </aside>
  );
}
