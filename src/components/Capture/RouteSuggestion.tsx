import { emit } from '@tauri-apps/api/event';
import { useEffect, useState } from 'react';
import { buildRoutePrompt } from '@/lib/ai/prompts/route';
import { parseJson } from '@/lib/ai/parseJson';
import { router } from '@/lib/ai/router';
import {
  OVERLAY_ACTION_EVENT,
  type CaptureOverlayPayload,
  type OverlayAction,
} from '@/lib/capture/overlayProtocol';
import { listBlocksByThread, updateBlockThread } from '@/lib/db/blocks';
import { INBOX_WORKSPACE_TITLE, UNSORTED_THREAD_TITLE } from '@/lib/db/client';
import { listAllThreads, type Thread } from '@/lib/db/threads';
import type { Workspace } from '@/lib/db/workspaces';
import { isAiAvailable, useSettingsStore } from '@/stores/settingsStore';
import { useT } from '@/lib/i18n';

const MAX_CANDIDATES = 20;
const SNIPPET_MAX = 200;

interface Props {
  toast: CaptureOverlayPayload;
  workspaces: Workspace[];
  onMoved: (target: {
    threadId: string;
    threadTitle: string;
    workspaceTitle: string;
  }) => void;
  onActiveChange: (active: boolean) => void;
}

interface RouteReply {
  threadId: string | null;
  confidence: string | null;
}

// Capture classification suggestion (§11.5). Lives in the overlay window. The AI
// call is fire-and-forget — capture already landed; this only ever *suggests*, and
// degrades to nothing on any failure (no keys, low confidence, parse error, request
// error) or if the toast dismisses before the call resolves.
export default function RouteSuggestion({
  toast,
  workspaces,
  onMoved,
  onActiveChange,
}: Props) {
  const t = useT();
  const [match, setMatch] = useState<Thread | null>(null);
  const [resolved, setResolved] = useState(false); // moved or dismissed

  // Runs once per capture — the parent keys this component by blockId, so the toast
  // fields are fixed for the component's life (a later source backfill won't re-fire).
  useEffect(() => {
    let cancelled = false;

    // Only the seeded Inbox "未分类" thread gets a suggestion — a capture the user
    // explicitly directed to a project thread is left alone (§11.5).
    if (
      toast.threadTitle !== UNSORTED_THREAD_TITLE ||
      toast.workspaceTitle !== INBOX_WORKSPACE_TITLE
    ) {
      return;
    }
    if (!isAiAvailable(useSettingsStore.getState())) return;

    void (async () => {
      let candidates: Thread[];
      try {
        const all = await listAllThreads();
        candidates = all
          .filter((t) => t.status === 'active' && t.id !== toast.threadId)
          .slice(0, MAX_CANDIDATES);
      } catch {
        return;
      }
      if (cancelled || candidates.length === 0) return;

      const enriched = await Promise.all(
        candidates.map(async (t) => {
          let snippet = '';
          try {
            const blocks = await listBlocksByThread(t.id);
            snippet = blocks
              .slice(-2)
              .map((b) => b.content)
              .join(' / ')
              .slice(0, SNIPPET_MAX);
          } catch {
            // a thread we can't read just gets an empty snippet
          }
          return { id: t.id, title: t.title || '(无标题)', recentSnippet: snippet };
        }),
      );
      if (cancelled) return;

      let text: string;
      try {
        const res = await router.fast(buildRoutePrompt(toast.fullContent, enriched), {
          json: true,
        });
        text = res.text;
      } catch {
        return;
      }
      if (cancelled) return;

      let reply: RouteReply;
      try {
        reply = parseJson<RouteReply>(text);
      } catch {
        return; // §12.4: parse failure → no bubble
      }
      if (reply.confidence !== 'high' && reply.confidence !== 'medium') return;
      const picked = candidates.find((t) => t.id === reply.threadId);
      if (picked && !cancelled) setMatch(picked);
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const active = match != null && !resolved;
  useEffect(() => {
    onActiveChange(active);
    return () => onActiveChange(false);
  }, [active, onActiveChange]);

  if (!match || resolved) return null;

  const handleMove = async (): Promise<void> => {
    try {
      await updateBlockThread(toast.blockId, match.id);
    } catch {
      return; // leave the bubble up; the user can retry or dismiss
    }
    const action: OverlayAction = {
      kind: 'suggestion-move',
      blockId: toast.blockId,
      oldThreadId: toast.threadId,
      newThreadId: match.id,
    };
    void emit(OVERLAY_ACTION_EVENT, action);
    const wsTitle =
      workspaces.find((w) => w.id === match.workspaceId)?.title.trim() ||
      INBOX_WORKSPACE_TITLE;
    onMoved({
      threadId: match.id,
      threadTitle: match.title.trim() || t('未命名'),
      workspaceTitle: wsTitle,
    });
    setResolved(true);
  };

  return (
    <div className="border-t border-line px-3.5 py-2 text-[11px]">
      <p className="leading-snug text-muted">
        {t('看起来这条属于「')}
        <span className="text-ink">{match.title.trim() || t('未命名')}</span>
        {t('」，移过去？')}
      </p>
      <div className="mt-1.5 flex items-center gap-1.5">
        <button
          onClick={() => void handleMove()}
          className="rounded border border-accent bg-accent/10 px-2 py-0.5 text-accent transition-colors hover:bg-accent/20"
        >
          {t('移过去')}
        </button>
        <button
          onClick={() => setResolved(true)}
          className="rounded px-2 py-0.5 text-muted transition-colors hover:bg-paper-2 hover:text-ink"
        >
          {t('不用')}
        </button>
      </div>
    </div>
  );
}
