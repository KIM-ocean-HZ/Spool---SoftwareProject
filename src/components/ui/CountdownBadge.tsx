import { useCountdown, type Urgency } from '@/hooks/useCountdown';

// Deadline countdown badge (PLAN_EN.md §13.2: small text + a dot; near/overdue uses
// --urgent). Compact, day-granular; lives on the right of a sidebar ThreadListItem
// and in each FocusSection row.

interface Props {
  deadline: number;
}

const COLOR: Record<Urgency, string> = {
  none: 'var(--muted)',
  soon: 'var(--urgent)',
  overdue: 'var(--urgent-strong)',
};

export default function CountdownBadge({ deadline }: Props) {
  const countdown = useCountdown(deadline);
  if (!countdown) return null;
  const color = COLOR[countdown.urgency];
  return (
    <span
      className="flex flex-none items-center gap-1 font-mono text-[10.5px]"
      style={{ color }}
      title={new Date(deadline).toLocaleDateString('zh-CN')}
    >
      <span className="h-1 w-1 rounded-full" style={{ backgroundColor: color }} />
      {countdown.label}
    </span>
  );
}
