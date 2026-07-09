import { X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { useSettingsStore } from '@/stores/settingsStore';
import BrowserAutomation from './BrowserAutomation';
import GeneralConfig from './GeneralConfig';
import ShortcutConfig from './ShortcutConfig';
import { useT } from '@/lib/i18n';

// Settings modal (PLAN_EN.md §9.12). Opened by the sidebar gear, ⌘, , or the tray
// "设置" item.

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-t border-line px-5 py-4 first:border-t-0">
      <h3 className="text-xs font-medium tracking-wide text-muted">{title}</h3>
      <div className="mt-1">{children}</div>
    </div>
  );
}

export default function Settings() {
  const t = useT();
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

        <div className="flex-1 overflow-y-auto">
          <Section title={t('全局快捷键')}>
            <ShortcutConfig />
          </Section>
          <Section title={t('浏览器自动化权限')}>
            <BrowserAutomation />
          </Section>
          <Section title={t('通用')}>
            <GeneralConfig />
          </Section>
        </div>
      </div>
    </div>
  );
}
