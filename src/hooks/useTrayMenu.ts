import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useEffect } from 'react';
import { useSettingsStore } from '@/stores/settingsStore';
import { useThreadsStore } from '@/stores/threadsStore';
import { useWorkspacesStore } from '@/stores/workspacesStore';
import { IS_MAC } from '@/lib/platform';
import { t } from '@/lib/i18n';

interface TrayActionPayload {
  kind: 'set_target' | 'new_thread' | 'settings' | 'capture_disabled';
  id?: string;
  // capture_disabled 专用：Rust 那侧已经把新状态应用下去了，这里带的是应用后的绝对值，
  // 不是「翻一下」。⚠️ 别改成在 JS 里 !current —— 手上那份可能是上一次点击之前的。
  value?: boolean;
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
  // ⚠️ 这个依赖看着没被用到，别删：菜单里「暂停捕捉手势」那个勾是 Rust 现读
  // CAPTURE_DISABLED 画的（capture.rs 的 build_tray_menu），所以状态一变就得让这个 effect
  // 再推一次菜单，勾才会跟着动。和上面那些 ● 标记是同一条路。
  const captureDisabled = useSettingsStore((s) => s.captureDisabled);

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
      // ⭐ D-k 的重点入口。带上按键名，人是在别的 app 里被抢的时候点开这里的，
      // 一眼要看得出松手的是哪个键。
      pause_capture: IS_MAC ? t('暂停捕捉手势（双击 ⌥）') : t('暂停捕捉手势（双击 Ctrl）'),
      open: t('打开 Spool'),
      new_thread: t('新建项目'),
      settings: t('设置'),
      quit: t('退出 Spool'),
    };
    void invoke('set_tray_targets', { currentLabel, targets, labels }).catch((e) => {
      console.warn('set_tray_targets failed', e);
    });
  }, [workspaces, threadsByWs, captureTargetId, language, captureDisabled]);

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
        } else if (p.kind === 'capture_disabled' && typeof p.value === 'boolean') {
          // Rust 那边点下去就已经生效了（手势、全局键、菜单栏图标都换过了），这里只负责
          // 把它存进 settings.json —— ⛔ 别再调 set_capture_disabled，那是把同一件事做两遍。
          void useSettingsStore.getState().update({ captureDisabled: p.value });
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
