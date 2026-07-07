import { t } from '@/lib/i18n';
export const formatBlockTime = (ts: number): string => {
  const d = new Date(ts);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  if (sameDay) return time;
  const date = d.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
  return `${date} ${time}`;
};

export const formatRelative = (ts: number): string => {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return t('刚刚');
  if (m < 60) return t('{n} 分钟前', { n: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t('{n} 小时前', { n: h });
  const d = Math.floor(h / 24);
  if (d < 7) return t('{n} 天前', { n: d });
  return new Date(ts).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' });
};
