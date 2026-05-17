import { useEffect } from 'react';
import SearchOverlay from '@/components/Search/SearchOverlay';
import Sidebar from '@/components/Sidebar';
import ThreadView from '@/components/ThreadView';
import { useCapture } from '@/hooks/useCapture';
import { useSearch } from '@/hooks/useSearch';
import { useTrayMenu } from '@/hooks/useTrayMenu';
import { useBlocksStore } from '@/stores/blocksStore';
import { useCaptureStore } from '@/stores/captureStore';
import { selectThreadById, useThreadsStore } from '@/stores/threadsStore';
import { useWorkspacesStore } from '@/stores/workspacesStore';

const SHOW_DIAGNOSTIC = import.meta.env.DEV;

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

  useCapture();
  useTrayMenu();
  useSearch();

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
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [activeThread, workspaces, createThread]);

  useEffect(() => {
    (window as unknown as Record<string, unknown>).__spool = {
      workspaces: useWorkspacesStore,
      threads: useThreadsStore,
      blocks: useBlocksStore,
      capture: useCaptureStore,
    };
  }, []);

  const error = wsError ?? thError;

  // Inline-styled because we want it visible no matter what happens to Tailwind /
  // global.css. If you don't see this strip at the top, React itself didn't mount.
  const diagnostic = SHOW_DIAGNOSTIC ? (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        padding: '4px 10px',
        background: '#1c1a16',
        color: '#faf7f0',
        fontFamily: 'ui-monospace, SFMono-Regular, monospace',
        fontSize: '11px',
        lineHeight: 1.5,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      App OK · wsLoading={String(wsLoading)} · thLoading={String(thLoading)} · err=
      {error ?? '—'} · ws={workspaces.length} · active={activeId?.slice(0, 6) ?? '—'} ·
      target={captureTargetId?.slice(0, 6) ?? '—'}
    </div>
  ) : null;

  if (error) {
    return (
      <>
        {diagnostic}
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
            数据库初始化失败
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
            打开 DevTools（右键 → Inspect）→ Console 看完整堆栈。
          </div>
        </div>
      </>
    );
  }

  if (wsLoading || thLoading) {
    return (
      <>
        {diagnostic}
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
          <span className="pulse-dim">加载中…</span>
        </div>
      </>
    );
  }

  return (
    <>
      {diagnostic}
      <div
        className="paper-bg flex h-full w-full"
        style={SHOW_DIAGNOSTIC ? { paddingTop: '22px' } : undefined}
      >
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-hidden">
          <ThreadView />
        </main>
      </div>
      <SearchOverlay />
    </>
  );
}
