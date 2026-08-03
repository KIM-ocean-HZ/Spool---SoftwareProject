import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useEffect } from 'react';
import { useSettingsStore } from '@/stores/settingsStore';
import { useThreadsStore } from '@/stores/threadsStore';
import { useWorkspacesStore } from '@/stores/workspacesStore';
import { t } from '@/lib/i18n';

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
  // Language is a dependency: the fixed tray labels are pushed from here (lib/i18n), so
  // a switch re-invokes set_tray_targets with the other language's copy.
  const language = useSettingsStore((s) => s.language);

  useEffect(() => {
    const targets: { id: string; label: string; is_current: boolean }[] = [];
    let currentLabel = '';
    for (const ws of workspaces) {
      const list = threadsByWs[ws.id] ?? [];
      for (const th of list) {
        if (th.status === 'done') continue;
        const wsTitle = ws.title.trim() || t('未命名');
        const tTitle = th.title.trim() || t('无标题');
        const label = `${wsTitle} / ${tTitle}`;
        const isCurrent = th.id === captureTargetId;
        targets.push({ id: th.id, label, is_current: isCurrent });
        if (isCurrent) currentLabel = label;
      }
    }
    const labels = {
      current_none: t('当前目标：（无）'),
      current_prefix: t('当前目标:  '),
      switch_target: t('切换捕捉目标'),
      no_threads: t('（暂无项目）'),
      open: t('打开 Spool'),
      new_thread: t('新建项目'),
      settings: t('设置'),
      quit: t('退出 Spool'),
    };
    void invoke('set_tray_targets', { currentLabel, targets, labels }).catch((e) => {
      console.warn('set_tray_targets failed', e);
    });
  }, [workspaces, threadsByWs, captureTargetId, language]);

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
        } else if (p.kind === 'settings') {
          useSettingsStore.getState().openPanel();
        }
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
