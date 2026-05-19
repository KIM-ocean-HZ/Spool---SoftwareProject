import { useState } from 'react';
import Toggle from '@/components/ui/Toggle';
import { clearAllData } from '@/lib/db/client';
import { useSettingsStore } from '@/stores/settingsStore';

// General settings (PLAN_EN.md §9.12): launch at login, attachment auto-extraction,
// and the destructive clear-all-data action behind an inline two-step confirmation.
export default function GeneralConfig() {
  const launchAtLogin = useSettingsStore((s) => s.launchAtLogin);
  const setLaunchAtLogin = useSettingsStore((s) => s.setLaunchAtLogin);
  const autoExtractAttachments = useSettingsStore((s) => s.autoExtractAttachments);
  const update = useSettingsStore((s) => s.update);
  const [confirming, setConfirming] = useState(false);
  const [clearing, setClearing] = useState(false);

  const handleClear = async (): Promise<void> => {
    setClearing(true);
    try {
      await clearAllData();
      // Every store is now stale; a reload re-hydrates them from the empty DB.
      window.location.reload();
    } catch (e) {
      console.error('[settings] clear all data failed', e);
      setClearing(false);
      setConfirming(false);
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-4 py-2.5">
        <div className="min-w-0">
          <div className="text-sm text-ink">开机启动</div>
          <div className="mt-0.5 text-xs text-muted">登录时自动运行,捕捉快捷键随时可用</div>
        </div>
        <Toggle checked={launchAtLogin} onChange={(v) => void setLaunchAtLogin(v)} />
      </div>

      <div className="border-t border-line" />

      <div className="flex items-center justify-between gap-4 py-2.5">
        <div className="min-w-0">
          <div className="text-sm text-ink">自动提取附件文字内容</div>
          <div className="mt-0.5 text-xs text-muted">
            PDF / Word / 纯文本文件被附加时自动读取内容,用于 Pack 输出。完全本地操作,不上传任何数据。
          </div>
        </div>
        <Toggle
          checked={autoExtractAttachments}
          onChange={(v) => void update({ autoExtractAttachments: v })}
        />
      </div>

      <div className="border-t border-line" />

      <div className="flex items-center justify-between gap-4 py-2.5">
        <div className="min-w-0">
          <div className="text-sm text-ink">清除所有数据</div>
          <div className="mt-0.5 text-xs text-muted">删除全部工作区、脉络与信息块,不可恢复</div>
        </div>
        {confirming ? (
          <div className="flex flex-none items-center gap-1.5">
            <button
              type="button"
              onClick={() => void handleClear()}
              disabled={clearing}
              className="rounded-md border px-2.5 py-1.5 text-xs transition-colors disabled:opacity-50"
              style={{ borderColor: 'var(--urgent)', color: 'var(--urgent)' }}
            >
              {clearing ? '清除中…' : '确认清除'}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={clearing}
              className="rounded-md border border-line bg-paper px-2.5 py-1.5 text-xs text-muted transition-colors hover:border-line-strong disabled:opacity-50"
            >
              取消
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="flex-none rounded-md border px-3 py-1.5 text-xs transition-colors"
            style={{ borderColor: 'var(--urgent)', color: 'var(--urgent)' }}
          >
            清除
          </button>
        )}
      </div>
    </div>
  );
}
