import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useEffect } from 'react';
import { useThreadsStore } from '@/stores/threadsStore';
import { useWorkspacesStore } from '@/stores/workspacesStore';

interface TrayActionPayload {
  kind: 'set_target' | 'new_thread' | 'settings';
  id?: string;
}

// Pushes the current "workspace/thread" list to the Rust tray so the menu's "switch
// capture target" submenu reflects state. Also listens for click events bouncing back.
export function useTrayMenu(): void {
  const workspaces = useWorkspacesStore((s) => s.workspaces);
  const threadsByWs = useThreadsStore((s) => s.threadsByWorkspace);
  const captureTargetId = useThreadsStore((s) => s.captureTargetId);

  useEffect(() => {
    const targets: { id: string; label: string; is_current: boolean }[] = [];
    let currentLabel = '';
    for (const ws of workspaces) {
      const list = threadsByWs[ws.id] ?? [];
      for (const t of list) {
        if (t.status === 'done') continue;
        const wsTitle = ws.title.trim() || '未命名';
        const tTitle = t.title.trim() || '无标题';
        const label = `${wsTitle} / ${tTitle}`;
        const isCurrent = t.id === captureTargetId;
        targets.push({ id: t.id, label, is_current: isCurrent });
        if (isCurrent) currentLabel = label;
      }
    }
    void invoke('set_tray_targets', { currentLabel, targets }).catch((e) => {
      console.warn('set_tray_targets failed', e);
    });
  }, [workspaces, threadsByWs, captureTargetId]);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    void (async () => {
      const dispose = await listen<TrayActionPayload>('tray-action', (e) => {
        const p = e.payload;
        if (p.kind === 'set_target' && p.id) {
          void useThreadsStore.getState().setCaptureTarget(p.id);
        } else if (p.kind === 'new_thread') {
          const activeId = useThreadsStore.getState().activeId;
          const wsId =
            (activeId
              ? Object.values(useThreadsStore.getState().threadsByWorkspace)
                  .flat()
                  .find((t) => t.id === activeId)?.workspaceId
              : undefined) ?? useWorkspacesStore.getState().workspaces[0]?.id;
          if (wsId) void useThreadsStore.getState().create(wsId);
        }
        // "settings" is wired in Phase 12 (settings panel).
      });
      if (cancelled) {
        dispose();
      } else {
        unlisten = dispose;
      }
    })();
    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, []);
}
