import { Plus, Search, Settings as SettingsIcon } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { useSearchStore } from '@/stores/searchStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useThreadsStore } from '@/stores/threadsStore';
import { useWorkspacesStore } from '@/stores/workspacesStore';
import FocusSection from './FocusSection';
import SidebarSummary from './SidebarSummary';
import WorkspaceGroup from './WorkspaceGroup';

export default function Sidebar() {
  const t = useT();
  const workspaces = useWorkspacesStore((s) => s.workspaces);
  const createWorkspace = useWorkspacesStore((s) => s.create);
  const threadsByWs = useThreadsStore((s) => s.threadsByWorkspace);
  const activeId = useThreadsStore((s) => s.activeId);
  const openSearch = useSearchStore((s) => s.openSearch);
  const openSettings = useSettingsStore((s) => s.openPanel);

  return (
    <aside className="flex h-full w-[280px] flex-none flex-col border-r border-line bg-paper-2/40">
      <header className="px-5 pb-3 pt-5">
        <h1 className="font-serif text-2xl tracking-tight text-ink">
          Spool
          <span className="ml-2 font-serif text-base italic text-muted">思簿</span>
        </h1>
      </header>

      <SidebarSummary />

      <div className="flex-1 overflow-y-auto px-2 pb-4">
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
