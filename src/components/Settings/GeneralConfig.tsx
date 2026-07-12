import Toggle from '@/components/ui/Toggle';
import { useSettingsStore } from '@/stores/settingsStore';
import { useT } from '@/lib/i18n';

// General settings (PLAN_EN.md §9.12): language, launch at login, attachment
// auto-extraction. 任务三 #2 (2026-07-12): the MCP block moved to its own tab and
// clear-all-data to 高级 — this tab is the short everyday page.
export default function GeneralConfig() {
  const t = useT();
  const launchAtLogin = useSettingsStore((s) => s.launchAtLogin);
  const setLaunchAtLogin = useSettingsStore((s) => s.setLaunchAtLogin);
  const autoExtractAttachments = useSettingsStore((s) => s.autoExtractAttachments);
  const language = useSettingsStore((s) => s.language);
  const update = useSettingsStore((s) => s.update);

  return (
    <div>
      {/* Language switch (2026-07-07): zh is the product default; en flips every surface
          via lib/i18n. Rendered bilingually on purpose so it's findable in either. */}
      <div className="flex items-center justify-between gap-4 py-2.5">
        <div className="min-w-0">
          <div className="text-sm text-ink">语言 / Language</div>
          <div className="mt-0.5 text-xs text-muted">{t('界面语言。切换立即生效。')}</div>
        </div>
        <div className="flex flex-none items-center gap-1">
          {(['zh', 'en'] as const).map((lang) => (
            <button
              key={lang}
              type="button"
              onClick={() => void update({ language: lang })}
              className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                language === lang
                  ? 'border-accent bg-accent-soft text-accent'
                  : 'border-line bg-paper text-muted hover:border-line-strong hover:text-ink'
              }`}
            >
              {lang === 'zh' ? '中文' : 'English'}
            </button>
          ))}
        </div>
      </div>

      <div className="border-t border-line" />

      <div className="flex items-center justify-between gap-4 py-2.5">
        <div className="min-w-0">
          <div className="text-sm text-ink">{t('开机启动')}</div>
          <div className="mt-0.5 text-xs text-muted">{t('登录时自动运行,捕捉快捷键随时可用')}</div>
        </div>
        <Toggle checked={launchAtLogin} onChange={(v) => void setLaunchAtLogin(v)} />
      </div>

      <div className="border-t border-line" />

      <div className="flex items-center justify-between gap-4 py-2.5">
        <div className="min-w-0">
          <div className="text-sm text-ink">{t('自动提取附件文字内容')}</div>
          <div className="mt-0.5 text-xs text-muted">
            {t('PDF / Word / 纯文本文件被附加时自动读取内容,用于 Pack 输出。完全本地操作,不上传任何数据。')}
          </div>
        </div>
        <Toggle
          checked={autoExtractAttachments}
          onChange={(v) => void update({ autoExtractAttachments: v })}
        />
      </div>
    </div>
  );
}
