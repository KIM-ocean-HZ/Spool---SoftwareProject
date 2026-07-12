import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSettingsStore } from '@/stores/settingsStore';
import AdvancedConfig from './AdvancedConfig';
import GeneralConfig from './GeneralConfig';
import McpConfig from './McpConfig';
import ShortcutConfig from './ShortcutConfig';
import { useT } from '@/lib/i18n';

// Settings modal (PLAN_EN.md §9.12). Opened by the sidebar gear, ⌘, , or the tray
// "设置" item. 任务三 #2 (2026-07-12): one long scroll became four tabs — MCP is the
// product's core channel, so it sits second instead of mid-scroll; the five-browser
// automation rows and clear-all-data live in 高级.

type Tab = 'general' | 'mcp' | 'shortcuts' | 'advanced';

export default function Settings() {
  const t = useT();
  const open = useSettingsStore((s) => s.panelOpen);
  const close = useSettingsStore((s) => s.closePanel);
  const [tab, setTab] = useState<Tab>('general');

  // Reopening always lands on 通用 — the dialog is transient, not a workspace.
  useEffect(() => {
    if (open) setTab('general');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [open, close]);

  if (!open) return null;

  const TABS: { key: Tab; label: string }[] = [
    { key: 'general', label: t('通用') },
    { key: 'mcp', label: 'MCP' },
    { key: 'shortcuts', label: t('快捷键') },
    { key: 'advanced', label: t('高级') },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex justify-center bg-ink/30 px-8 pt-[14vh]"
      onClick={close}
    >
      <div
        className="flex max-h-[72vh] w-[480px] flex-col overflow-hidden rounded-lg border border-line-strong bg-paper"
        style={{ boxShadow: 'var(--shadow-toast)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-none items-center justify-between border-b border-line px-5 py-3">
          <h2 className="font-serif text-xl text-ink">{t('设置')}</h2>
          <button
            onClick={close}
            className="rounded p-1 text-muted hover:bg-paper-2 hover:text-ink"
            aria-label={t('关闭')}
          >
            <X size={15} />
          </button>
        </div>

        <div className="flex flex-none items-center gap-1 border-b border-line px-3 pt-2">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`rounded-t-md border-b-2 px-3 py-1.5 text-xs transition-colors ${
                tab === key
                  ? 'border-accent text-ink'
                  : 'border-transparent text-muted hover:text-ink-2'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-2">
          {tab === 'general' && <GeneralConfig />}
          {tab === 'mcp' && <McpConfig />}
          {tab === 'shortcuts' && (
            <div className="py-2.5">
              <ShortcutConfig />
            </div>
          )}
          {tab === 'advanced' && <AdvancedConfig />}
        </div>
      </div>
    </div>
  );
}
