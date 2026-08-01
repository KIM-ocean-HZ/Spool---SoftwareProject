// The capture toast's database access, 2026-08-01 (DESIGN_CAPTURE_HELPER_PROCESS §3.3).
//
// 🚨 This process must never open SQLite. `getDb()` runs migrateSchema + seedDefaults,
// and two processes each doing that on the same file is exactly the precondition of the
// 2026-05-29 data wipe. So every call below is a request to the MAIN window, which owns
// the one connection, and the answer comes back over the same channel. Nothing here
// imports @/lib/db — the overlay's capability doesn't even grant the sql: permissions
// any more, so an accidental import would fail loudly rather than quietly become a
// second writer.
//
// The exported functions deliberately keep the signatures of the @/lib/db functions they
// replace, so the toast's call sites read the same as before.

import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import type { Block, CreateBlockArgs } from '@/lib/db/blocks';
import {
  OVERLAY_DB_REPLY_EVENT,
  OVERLAY_DB_REQUEST_COMMAND,
  type OverlayDbOp,
  type OverlayDbOps,
  type OverlayDbReply,
} from '@/lib/capture/overlayProtocol';
import type { Thread } from '@/lib/db/threads';
import type { Workspace } from '@/lib/db/workspaces';

// Generous: the round trip is four cheap hops, but the main window may be mid-render or
// mid-query. This exists only so a wedged main window rejects instead of leaking a
// promise (and so the toast's catch branches actually run).
const REQUEST_TIMEOUT_MS = 8000;

let nextId = 1;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

void listen<OverlayDbReply>(OVERLAY_DB_REPLY_EVENT, (e) => {
  const waiter = pending.get(e.payload.id);
  if (!waiter) return; // already timed out
  pending.delete(e.payload.id);
  if (e.payload.ok) waiter.resolve(e.payload.result ?? null);
  else waiter.reject(new Error(e.payload.error ?? 'overlay DB request failed'));
}).catch((e) => console.error('[overlay] db reply listener failed', e));

const call = <K extends OverlayDbOp>(
  op: K,
  args: OverlayDbOps[K]['args'],
): Promise<OverlayDbOps[K]['result']> =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    setTimeout(() => {
      if (pending.delete(id)) reject(new Error(`overlay DB request timed out: ${op}`));
    }, REQUEST_TIMEOUT_MS);
    void invoke(OVERLAY_DB_REQUEST_COMMAND, { id, op, args }).catch((e: unknown) => {
      if (pending.delete(id)) reject(e instanceof Error ? e : new Error(String(e)));
    });
  });

export const updateBlockAnnotation = async (
  blockId: string,
  annotation: string | null,
): Promise<void> => {
  await call('updateBlockAnnotation', { blockId, annotation });
};

export const deleteBlock = async (blockId: string): Promise<void> => {
  await call('deleteBlock', { blockId });
};

export const togglePin = (blockId: string): Promise<boolean> => call('togglePin', { blockId });

export const createBlock = (args: CreateBlockArgs): Promise<Block> => call('createBlock', args);

export const listWorkspaces = (): Promise<Workspace[]> => call('listWorkspaces', {});

export const listAllThreads = (): Promise<Thread[]> => call('listAllThreads', {});
