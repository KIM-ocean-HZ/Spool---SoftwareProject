import { invoke } from '@tauri-apps/api/core';
import { useEffect } from 'react';
import SearchOverlay from '@/components/Search/SearchOverlay';
import Settings from '@/components/Settings';
import Sidebar from '@/components/Sidebar';
import ThreadView from '@/components/ThreadView';
import ToastRack from '@/components/ui/Toast';
import { t } from '@/lib/i18n';
import { useCapture } from '@/hooks/useCapture';
import { useCollect } from '@/hooks/useCollect';
import { useSearch } from '@/hooks/useSearch';
import { useTrayMenu } from '@/hooks/useTrayMenu';
import { useUndo } from '@/hooks/useUndo';
import { useBlocksStore } from '@/stores/blocksStore';
import { useCaptureStore } from '@/stores/captureStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { selectThreadById, useThreadsStore } from '@/stores/threadsStore';
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
  const openSettings = useSettingsStore((s) => s.openPanel);

  useCapture();
  useCollect();
  useTrayMenu();
  useSearch();
  useUndo();

  useEffect(() => {
    void (async () => {
      await loadWorkspaces();
      await loadThreads();
    })();
  }, [loadWorkspaces, loadThreads]);

  useEffect(() => {
    if (!activeId && captureTargetId) {
      select(captureTargetId);
    }
  }, [activeId, captureTargetId, select]);

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

  // Load persisted settings, then push the saved shortcuts to Rust so a user's
  // re-bound capture/search keys take effect (§19.1). Rust registered the defaults at
  // setup(); set_shortcuts no-ops when the persisted pair already equals the defaults.
  useEffect(() => {
    void (async () => {
      await loadSettings();
      // AI entry points gate on whether a local model exists; probe once at startup.
      void useSettingsStore.getState().detectOllama();
      void useSettingsStore.getState().loadAutostart();
      // v2.7: backfill text extraction for legacy file attachments (§9.6). Runs after
      // settings load so it honours the auto-extract switch; background, never blocks UI.
      void useBlocksStore.getState().backfillExtractions();
      const { captureShortcut, searchShortcut } = useSettingsStore.getState();
      try {
        await invoke('set_shortcuts', { capture: captureShortcut, search: searchShortcut });
      } catch (e) {
        console.warn('[shortcuts] applying persisted shortcuts failed', e);
      }
    })();
  }, [loadSettings]);

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
          background: '#faf7f0',
          color: '#1c1a16',
          fontFamily: 'Instrument Serif, Songti SC, serif',
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
      <div className="paper-bg flex h-full w-full">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-hidden">
          <ThreadView />
        </main>
      </div>
      <SearchOverlay />
      <Settings />
      <ToastRack />
    </>
  );
}
