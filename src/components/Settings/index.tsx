import { X } from 'lucide-react';
import { useEffect } from 'react';
import { useSettingsStore } from '@/stores/settingsStore';
import ShortcutConfig from './ShortcutConfig';

// Settings modal (PLAN_EN.md §9.12). Phase 8 / §19.1 ships the shortcut recorders
// only; API keys, privacy mode and quota stay for Phase 12. Opened by the sidebar
// gear, ⌘, , or the tray "设置" item.
export default function Settings() {
  const open = useSettingsStore((s) => s.panelOpen);
  const close = useSettingsStore((s) => s.closePanel);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, close]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex justify-center bg-ink/30 px-8 pt-[14vh]"
      onClick={close}
    >
      <div
        className="flex h-fit w-[480px] flex-col overflow-hidden rounded-lg border border-line-strong bg-paper"
        style={{ boxShadow: 'var(--shadow-toast)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-none items-center justify-between border-b border-line px-5 py-3">
          <h2 className="font-serif text-xl text-ink">设置</h2>
          <button
            onClick={close}
            className="rounded p-1 text-muted hover:bg-paper-2 hover:text-ink"
            aria-label="关闭"
          >
            <X size={15} />
          </button>
        </div>

        <div className="px-5 py-4">
          <h3 className="text-xs font-medium tracking-wide text-muted">全局快捷键</h3>
          <div className="mt-1">
            <ShortcutConfig />
          </div>
        </div>

        <div className="flex-none border-t border-line bg-paper-2/40 px-5 py-2.5 text-[11px] text-muted">
          API 密钥、隐私模式、开机启动等设置将在后续版本加入。
        </div>
      </div>
    </div>
  );
}
