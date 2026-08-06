import { describe, expect, it } from 'vitest';
import type { Thread } from '@/lib/db/threads';
import { DORMANT_AFTER_MS, isDormant } from './dormancy';

const NOW = 1_800_000_000_000;

const thread = (over: Partial<Thread>): Thread => ({
  id: 't1',
  workspaceId: 'w1',
  title: 'x',
  summary: null,
  digest: null,
  deadline: null,
  status: 'active',
  isCaptureTarget: false,
  followUpBrief: null,
  createdAt: NOW - 30 * 86_400_000,
  updatedAt: NOW - 30 * 86_400_000,
  completedAt: null,
  ...over,
});

describe('isDormant (#5 auto-dormancy)', () => {
  it('an idle no-deadline thread past the threshold is dormant', () => {
    expect(isDormant(thread({}), NOW)).toBe(true);
  });

  it('fresh activity keeps a thread awake (boundary exact)', () => {
    expect(isDormant(thread({ updatedAt: NOW - DORMANT_AFTER_MS }), NOW)).toBe(false);
    expect(isDormant(thread({ updatedAt: NOW - DORMANT_AFTER_MS - 1 }), NOW)).toBe(true);
  });

  it('a deadline, the capture target, and done are never dormant', () => {
    expect(isDormant(thread({ deadline: NOW + 86_400_000 }), NOW)).toBe(false);
    expect(isDormant(thread({ isCaptureTarget: true }), NOW)).toBe(false);
    expect(isDormant(thread({ status: 'done' }), NOW)).toBe(false);
  });

  it('legacy parked status follows the same idleness rule, not the stored flag', () => {
    expect(isDormant(thread({ status: 'parked' }), NOW)).toBe(true);
    expect(isDormant(thread({ status: 'parked', updatedAt: NOW - 1000 }), NOW)).toBe(false);
  });
});
