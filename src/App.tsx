import { invoke } from '@tauri-apps/api/core';
import { useEffect, useRef } from 'react';
import PermissionBanner from '@/components/PermissionBanner';
import SearchOverlay from '@/components/Search/SearchOverlay';
import Settings from '@/components/Settings';
import Sidebar from '@/components/Sidebar';
import ThreadView from '@/components/ThreadView';
import ToastRack from '@/components/ui/Toast';
import { setSeedLanguage } from '@/lib/db/client';
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
  const settingsLoaded = useSettingsStore((s) => s.loaded);
  const openSettings = useSettingsStore((s) => s.openPanel);

  useCapture();
  useCollect();
  useTrayMenu();
  useSearch();
  useUndo();

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
    })();
  }, [loadSettings, loadWorkspaces, loadThreads]);

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
          background: '#faf7f0',
          color: '#1c1a16',
          fontFamily: 'Fraunces, Songti SC, serif',
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
          <Sidebar />
          <main className="min-w-0 flex-1 overflow-hidden">
            <ThreadView />
          </main>
        </div>
      </div>
      <SearchOverlay />
      <Settings />
      <ToastRack />
    </>
  );
}
