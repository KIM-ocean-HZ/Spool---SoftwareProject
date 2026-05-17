import type { ThreadStatus } from '@/lib/db/threads';

// Thin SVG progress ring (PLAN_EN.md §13.2: 16px, stroke-width 2.5, colour follows
// status). Shown on the right of a sidebar ThreadListItem.

interface Props {
  progress: number; // 0-100
  status: ThreadStatus;
}

const SIZE = 16;
const STROKE = 2.5;
const R = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * R;

const STATUS_VAR: Record<ThreadStatus, string> = {
  active: 'var(--status-active)',
  parked: 'var(--status-parked)',
  done: 'var(--status-done)',
};

export default function ProgressRing({ progress, status }: Props) {
  const pct = Math.max(0, Math.min(100, progress));
  return (
    <svg
      width={SIZE}
      height={SIZE}
      viewBox={`0 0 ${SIZE} ${SIZE}`}
      className="flex-none"
      role="img"
      aria-label={`进度 ${pct}%`}
    >
      <circle
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={R}
        fill="none"
        stroke="var(--line)"
        strokeWidth={STROKE}
      />
      <circle
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={R}
        fill="none"
        stroke={STATUS_VAR[status]}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeDasharray={CIRC}
        strokeDashoffset={CIRC * (1 - pct / 100)}
        transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
      />
    </svg>
  );
}
