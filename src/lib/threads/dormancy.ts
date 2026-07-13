import type { Thread } from '@/lib/db/threads';

// #5 自动沉睡 (Ocean 2026-07-13): parking is derived, never clicked — real threads
// don't get parked, they get left alone. A live thread with no deadline that hasn't
// moved in DORMANT_AFTER_MS sinks into the group-tail 沉睡 row; any new activity
// (capture / edit / MCP write) bumps updatedAt and floats it back on its own. The
// stored status='parked' value is legacy: nothing writes it anymore and it no longer
// affects grouping — a deadline (聚焦 material) or being the capture target keeps a
// thread awake regardless of idle time.
export const DORMANT_AFTER_MS = 14 * 86_400_000;

export const isDormant = (t: Thread, now: number): boolean =>
  t.status !== 'done' &&
  !t.isCaptureTarget &&
  t.deadline == null &&
  now - t.updatedAt > DORMANT_AFTER_MS;
