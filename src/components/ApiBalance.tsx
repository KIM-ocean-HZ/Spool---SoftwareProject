import { RefreshCw } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { useBalanceStore } from '@/stores/balanceStore';

/**
 * 「还剩多少钱」的那一行 —— `X 批`。两处用它（设置里的 API 那一段、周回顾那根引擎条），
 * 所以它只写一遍：两处各写一遍就会变成两种说法，而这一行说的是钱。
 *
 * ⚠️ 四种状态各有各的话，⛔ 一种都不许塌成「—」：
 *   * 查到了      → `¥25.50`
 *   * 这家不报    → 「这家不报余额」（⛔ **不是 0**）
 *   * 查失败了    → 「查不到余额」+ 厂商原话挂在 title 上
 *   * 还没查过    → 只有一个「查一下」
 */
export default function ApiBalance({ className = '' }: { className?: string }) {
  const t = useT();
  const state = useBalanceStore((s) => s.state);
  const refresh = useBalanceStore((s) => s.refresh);

  return (
    <span className={`flex items-center gap-1.5 text-[11px] text-muted ${className}`}>
      {state.at === 'known' && (
        <span
          className="font-mono text-ink-2"
          title={t('这是端点自己报的余额，{time} 查的。', {
            time: new Date(state.checkedAt).toLocaleTimeString(),
          })}
        >
          {state.currency === 'CNY' ? '¥' : state.currency === 'USD' ? '$' : `${state.currency} `}
          {state.total}
        </span>
      )}
      {/* ⛔ 「不报」不是 0，也不是一次失败。说清楚是哪一种，用户才知道要不要去管它。 */}
      {state.at === 'unsupported' && <span>{t('这家不报余额')}</span>}
      {state.at === 'failed' && (
        <span title={state.message} style={{ color: 'var(--urgent)' }}>
          {t('查不到余额')}
        </span>
      )}
      <button
        type="button"
        onClick={() => void refresh()}
        disabled={state.at === 'checking'}
        title={t('去问一下端点还剩多少（查余额本身不花钱）')}
        className="flex items-center gap-1 rounded px-1 py-0.5 transition-colors enabled:hover:bg-paper-2 enabled:hover:text-ink-2 disabled:opacity-50"
      >
        <RefreshCw size={10} className={state.at === 'checking' ? 'animate-spin' : ''} />
        {state.at === 'idle' ? t('查一下余额') : null}
      </button>
    </span>
  );
}
