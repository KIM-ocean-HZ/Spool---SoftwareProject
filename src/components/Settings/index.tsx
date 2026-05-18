import { X } from 'lucide-react';
import { useEffect, type ReactNode } from 'react';
import { DAILY_LIMITS, useQuotaStore } from '@/stores/quotaStore';
import { useSettingsStore } from '@/stores/settingsStore';
import AiConfig from './AiConfig';
import GeneralConfig from './GeneralConfig';
import ShortcutConfig from './ShortcutConfig';

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

function QuotaBar({ label, used, limit }: { label: string; used: number; limit: number }) {
  const pct = Math.min(100, Math.round((used / limit) * 100));
  return (
    <div className="py-1.5">
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-ink">{label}</span>
        <span className="font-mono text-muted">
          {used} / {limit}
        </span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-paper-2">
        <div className="h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function Settings() {
  const open = useSettingsStore((s) => s.panelOpen);
  const close = useSettingsStore((s) => s.closePanel);
  const groqUsed = useQuotaStore((s) => s.groq);
  const geminiUsed = useQuotaStore((s) => s.gemini);

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
          <h2 className="font-serif text-xl text-ink">设置</h2>
          <button
            onClick={close}
            className="rounded p-1 text-muted hover:bg-paper-2 hover:text-ink"
            aria-label="关闭"
          >
            <X size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <Section title="全局快捷键">
            <ShortcutConfig />
          </Section>
          <Section title="AI 服务">
            <AiConfig />
          </Section>
          <Section title="今日用量">
            <QuotaBar label="Groq" used={groqUsed} limit={DAILY_LIMITS.groq} />
            <QuotaBar label="Gemini" used={geminiUsed} limit={DAILY_LIMITS.gemini} />
            <p className="mt-1.5 text-xs text-muted">
              本地 Ollama 不计用量;计数仅本次运行内有效。
            </p>
          </Section>
          <Section title="通用">
            <GeneralConfig />
          </Section>
        </div>
      </div>
    </div>
  );
}
