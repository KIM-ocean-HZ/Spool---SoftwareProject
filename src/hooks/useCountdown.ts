import { useEffect, useState } from 'react';

// Deadline countdown (PLAN_EN.md §9.9 / Phase 8). A thread's deadline is shown as a
// compact, day-granular badge in the sidebar; `useCountdown` keeps it live so a badge
// flips from "今天" to "逾期1天" without a reload.

export type Urgency = 'none' | 'soon' | 'overdue';

export interface Countdown {
  label: string;     // compact: "3天后" / "今天" / "逾期2天"
  urgency: Urgency;
}

const DAY = 86_400_000;
// §9.9: a thread <48h from its deadline is "on fire" (red); past it, darker red.
const SOON_MS = 48 * 3_600_000;

const startOfDay = (ts: number): number => {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

// Pure — exported so callers (and tests) can format a deadline without a live tick.
export const computeCountdown = (deadline: number, now: number): Countdown => {
  const days = Math.round((startOfDay(deadline) - startOfDay(now)) / DAY);
  const label = days > 0 ? `${days}天后` : days === 0 ? '今天' : `逾期${-days}天`;
  const urgency: Urgency =
    deadline < now ? 'overdue' : deadline - now < SOON_MS ? 'soon' : 'none';
  return { label, urgency };
};

// Re-renders once a minute — day-granular text never needs finer resolution. Returns
// null for a thread with no deadline so the caller can render nothing.
export function useCountdown(deadline: number | null): Countdown | null {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (deadline == null) return;
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, [deadline]);

  if (deadline == null) return null;
  return computeCountdown(deadline, now);
}
