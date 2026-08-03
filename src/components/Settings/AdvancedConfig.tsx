import { useState } from 'react';
import { clearAllData } from '@/lib/db/client';
import { useT } from '@/lib/i18n';
import BrowserAutomation from './BrowserAutomation';

// 高级 tab (任务三 #2, 2026-07-12): the low-frequency machinery — the five-browser
// automation permission rows and the destructive clear-all-data action — moves out of
// the main scroll so 通用/MCP stay short.
export default function AdvancedConfig() {
  const t = useT();
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
      <h3 className="pt-2.5 text-xs font-medium tracking-wide text-muted">
        {t('浏览器自动化权限')}
      </h3>
      <BrowserAutomation />

      <div className="mt-2 border-t border-line" />

      <div className="flex items-center justify-between gap-4 py-2.5">
        <div className="min-w-0">
          <div className="text-sm text-ink">{t('清除所有数据')}</div>
          <div className="mt-0.5 text-xs text-muted">{t('删除全部工作区、项目与信息块,不可恢复')}</div>
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
              {clearing ? t('清除中…') : t('确认清除')}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              disabled={clearing}
              className="rounded-md border border-line bg-paper px-2.5 py-1.5 text-xs text-muted transition-colors hover:border-line-strong disabled:opacity-50"
            >
              {t('取消')}
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="flex-none rounded-md border px-3 py-1.5 text-xs transition-colors"
            style={{ borderColor: 'var(--urgent)', color: 'var(--urgent)' }}
          >
            {t('清除')}
          </button>
        )}
      </div>
    </div>
  );
}
