import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useEffect } from 'react';
import {
  OVERLAY_DB_REPLY_COMMAND,
  OVERLAY_DB_REQUEST_EVENT,
  type OverlayDbOps,
  type OverlayDbRequest,
} from '@/lib/capture/overlayProtocol';
import {
  createBlock,
  deleteBlock,
  togglePin,
  updateBlockAnnotation,
} from '@/lib/db/blocks';
import { listAllThreads } from '@/lib/db/threads';
import { listWorkspaces } from '@/lib/db/workspaces';

// Serves the capture toast's database calls (2026-08-01, DESIGN_CAPTURE_HELPER_PROCESS
// §3.3). The toast lives in its own process now and must never open SQLite — two
// processes running migrateSchema + seedDefaults on one file is the 2026-05-29 wipe's
// precondition rebuilt — so it asks, and this window, which holds the only connection,
// answers. Rust relays both directions (src-tauri/src/overlay.rs).

const run = async (req: OverlayDbRequest): Promise<unknown> => {
  switch (req.op) {
    case 'updateBlockAnnotation': {
      const a = req.args as OverlayDbOps['updateBlockAnnotation']['args'];
      await updateBlockAnnotation(a.blockId, a.annotation);
      return null;
    }
    case 'deleteBlock': {
      const a = req.args as OverlayDbOps['deleteBlock']['args'];
      await deleteBlock(a.blockId);
      return null;
    }
    case 'togglePin': {
      const a = req.args as OverlayDbOps['togglePin']['args'];
      return await togglePin(a.blockId);
    }
    case 'createBlock':
      return await createBlock(req.args as OverlayDbOps['createBlock']['args']);
    case 'listWorkspaces':
      return await listWorkspaces();
    case 'listAllThreads':
      return await listAllThreads();
    default:
      throw new Error(`unknown overlay DB op: ${String(req.op)}`);
  }
};

export function useOverlayDbHost(): void {
  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let cancelled = false;
    void (async () => {
      const dispose = await listen<OverlayDbRequest>(OVERLAY_DB_REQUEST_EVENT, (e) => {
        const req = e.payload;
        void run(req)
          .then((result) =>
            invoke(OVERLAY_DB_REPLY_COMMAND, { id: req.id, ok: true, result, error: null }),
          )
          .catch((err: unknown) => {
            const message = err instanceof Error ? err.message : String(err);
            console.error('[overlay-db]', req.op, 'failed', err);
            return invoke(OVERLAY_DB_REPLY_COMMAND, {
              id: req.id,
              ok: false,
              result: null,
              error: message,
            });
          })
          // A reply that can't even be handed to Rust leaves the toast waiting for its
          // timeout; nothing better is available, so just make it visible in the log.
          .catch((e) => console.error('[overlay-db] reply failed', e));
      });
      if (cancelled) dispose();
      else unlisten = dispose;
    })();
    return () => {
      cancelled = true;
      if (unlisten) unlisten();
    };
  }, []);
}
