import { invoke } from '@tauri-apps/api/core';
import { emit, listen } from '@tauri-apps/api/event';
import { Link2, Pin, Send, Trash2, X } from 'lucide-react';
import { nanoid } from 'nanoid';
import { useEffect, useRef, useState } from 'react';
import {
  COLLECT_APPEND_EVENT,
  COLLECT_CLOSED_EVENT,
  HIDE_OVERLAY_COMMAND,
  RESIZE_OVERLAY_COMMAND,
  type CollectAppendPayload,
  type CollectClosedPayload,
} from '@/lib/capture/overlayProtocol';
import { createAttachment } from '@/lib/db/attachments';
import { createBlock, togglePin as togglePinDb } from '@/lib/db/blocks';
import { getCaptureTargetThread } from '@/lib/db/threads';

// v2.8 §20 Track B — collect mode (staging toast).
//
// A persistent staging UI rendered inside the existing overlay window. While open,
// every clipboard capture (forwarded by useCapture in main) appends a transient item
// here instead of writing a block to SQLite. The user can edit each item's text and
// annotation inline, attach a single URL per item, then Send to merge everything into
// one block in the current capture target — or Close to discard.
//
// Crucial isolation invariant (§20.8 kill-criterion): nothing touches the blocks /
// attachments table until the user clicks Send. The staging items live ONLY in this
// component's state; a future revert is a clean module + hook + Rust-branch removal.

// Window heights when staging is showing. Keep STAGING_COLLAPSED close to the toast's
// collapsed height so the "just opened, empty" state doesn't waste vertical space.
const STAGING_HEIGHT_EMPTY = 140;
const STAGING_HEIGHT_PER_ITEM = 110;
const STAGING_HEIGHT_MAX = 520;

interface StagingItem {
  id: string;
  text: string;
  annotation: string;
  source: string | null;
  url: string;
  pinned: boolean;
}

const clampHeight = (n: number): number =>
  Math.max(STAGING_HEIGHT_EMPTY, Math.min(STAGING_HEIGHT_MAX, n));

export default function CollectOverlay() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<StagingItem[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);

  // Stash a callback ref so the append listener can read the latest items without
  // re-subscribing on every state change (listen() returns a dispose handle, not a
  // re-subscribable handler).
  const itemsRef = useRef<StagingItem[]>([]);
  itemsRef.current = items;

  // Window-resize follows item count so the staging toast grows with content but
  // caps at STAGING_HEIGHT_MAX (the inner list scrolls past that).
  useEffect(() => {
    if (!open) return;
    const target = clampHeight(STAGING_HEIGHT_EMPTY + STAGING_HEIGHT_PER_ITEM * items.length);
    void invoke(RESIZE_OVERLAY_COMMAND, { height: target }).catch((e) => {
      console.warn('[collect] resize failed', e);
    });
  }, [open, items.length]);

  // Esc → request-close (immediate when staging is empty, confirm prompt otherwise).
  // Mounted only while staging is open so we don't shadow the CaptureOverlay's own
  // Esc handler when a normal toast is showing.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent): void => {
      if (e.key !== 'Escape') return;
      if (confirming) {
        // Inside the confirm prompt Esc means "back out of the prompt", not "discard".
        e.preventDefault();
        setConfirming(false);
        return;
      }
      e.preventDefault();
      if (itemsRef.current.length === 0) {
        // Empty staging — Esc closes silently.
        void emit(COLLECT_CLOSED_EVENT, { kind: 'discarded' } satisfies CollectClosedPayload);
        void invoke(HIDE_OVERLAY_COMMAND);
        setOpen(false);
        setItems([]);
        return;
      }
      setConfirming(true);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, confirming]);

  // Listen for `collect:open` (long-press fired) and `collect:append` (a clipboard
  // capture forwarded while staging is open).
  useEffect(() => {
    let unlistenOpen: (() => void) | null = null;
    let unlistenAppend: (() => void) | null = null;
    let cancelled = false;

    void (async () => {
      const dispose1 = await listen('collect:open', () => {
        setOpen(true);
        setItems([]);
        setConfirming(false);
      });
      if (cancelled) dispose1();
      else unlistenOpen = dispose1;

      const dispose2 = await listen<CollectAppendPayload>(COLLECT_APPEND_EVENT, (e) => {
        const incoming: StagingItem = {
          id: nanoid(),
          text: e.payload.text,
          annotation: '',
          source: e.payload.source,
          url: '',
          pinned: false,
        };
        setItems([...itemsRef.current, incoming]);
      });
      if (cancelled) dispose2();
      else unlistenAppend = dispose2;
    })();

    return () => {
      cancelled = true;
      if (unlistenOpen) unlistenOpen();
      if (unlistenAppend) unlistenAppend();
    };
  }, []);

  if (!open) return null;

  const close = (payload: CollectClosedPayload): void => {
    setOpen(false);
    setItems([]);
    setConfirming(false);
    setSending(false);
    void emit(COLLECT_CLOSED_EVENT, payload).catch((e) => {
      console.warn('[collect] emit closed failed', e);
    });
    void invoke(HIDE_OVERLAY_COMMAND).catch((e) => {
      console.warn('[collect] hide overlay failed', e);
    });
  };

  const requestClose = (): void => {
    if (items.length === 0) {
      close({ kind: 'discarded' });
      return;
    }
    setConfirming(true);
  };

  const confirmDiscard = (): void => close({ kind: 'discarded' });
  const cancelDiscard = (): void => setConfirming(false);

  const updateItem = (id: string, patch: Partial<StagingItem>): void => {
    setItems((arr) => arr.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  };

  const removeItem = (id: string): void => {
    setItems((arr) => arr.filter((it) => it.id !== id));
  };

  const send = async (): Promise<void> => {
    if (items.length === 0 || sending) return;
    setSending(true);
    let target: Awaited<ReturnType<typeof getCaptureTargetThread>>;
    try {
      target = await getCaptureTargetThread();
    } catch (e) {
      console.error('[collect] capture target lookup failed', e);
      setSending(false);
      return;
    }
    if (!target) {
      // No capture target — fall back to discard rather than guessing where to land
      // the merge. The user can set a target and try again.
      setSending(false);
      console.warn('[collect] send aborted: no capture target');
      return;
    }

    // Merge items into one block. Each item becomes a paragraph separated by a blank
    // line. When all items share a source we keep it as the block's source; when they
    // differ we prefix each segment with `[from <source>]` (same convention as the
    // merge-blocks helper). Annotations are newline-joined onto the merged block.
    const sources = items
      .map((it) => (it.source ?? '').trim())
      .filter((s) => s.length > 0);
    const allSame = sources.length === items.length && new Set(sources).size <= 1;
    const sharedSource = allSame && sources.length > 0 ? sources[0]! : null;

    const segments: string[] = items.map((it) => {
      const prefix = allSame ? '' : `[from ${it.source?.trim() || '(无来源)'}] `;
      return `${prefix}${it.text}`;
    });
    const content = segments.join('\n\n');
    const annotations = items
      .map((it) => it.annotation.trim())
      .filter((a) => a.length > 0);
    const annotation = annotations.length > 0 ? annotations.join('\n') : null;
    const hasPinned = items.some((it) => it.pinned);

    let block: Awaited<ReturnType<typeof createBlock>>;
    try {
      block = await createBlock({
        threadId: target.id,
        kind: 'text',
        content,
        annotation,
        source: sharedSource,
      });
    } catch (e) {
      console.error('[collect] createBlock failed', e);
      setSending(false);
      return;
    }

    // Pin the merged block if any staging item had its pin flag flipped.
    if (hasPinned) {
      try {
        await togglePinDb(block.id);
        block = { ...block, pinned: true };
      } catch (e) {
        console.warn('[collect] pin merged block failed', e);
      }
    }

    // Attach each staging item's URL (if any) to the new block. Errors don't block
    // the Send — the merged block is more important than a single dropped attachment.
    for (const it of items) {
      const u = it.url.trim();
      if (!u) continue;
      try {
        const u2 = new URL(u);
        await createAttachment({
          blockId: block.id,
          kind: 'url',
          target: u,
          label: u2.host || u,
        });
      } catch (e) {
        console.warn('[collect] attach url failed', it.url, e);
      }
    }

    close({ kind: 'sent', block, threadId: target.id });
  };

  return (
    <div
      className="overlay-in w-full overflow-hidden rounded-lg border border-line-strong bg-paper"
      style={{ boxShadow: 'var(--shadow-toast)' }}
    >
      <header className="flex items-center justify-between border-b border-line bg-paper-2/40 px-3 py-2">
        <div className="font-ui text-[12px] text-ink">
          <span className="font-serif">正在收集</span>
          <span className="ml-1.5 text-muted">
            {items.length === 0 ? '— 双击 ⌥ 或 ⌘⇧C 把要存的内容加入' : `· ${items.length} 项`}
          </span>
        </div>
        <button
          type="button"
          onClick={requestClose}
          title="关闭（丢弃未发送内容）"
          aria-label="关闭"
          className="rounded p-1 text-muted/70 hover:bg-paper hover:text-ink"
        >
          <X size={12} />
        </button>
      </header>

      <ul className="max-h-72 overflow-y-auto px-2 py-1.5">
        {items.length === 0 && (
          <li className="px-2 py-3 font-ui text-[11px] leading-relaxed text-muted">
            按你平时的方式继续捕捉（⌥⌥ 或 ⌘⇧C）。在这里收集成几条草稿，再发送为一块整理过的 block。
          </li>
        )}
        {items.map((it) => (
          <li
            key={it.id}
            className="mb-1.5 rounded-md border border-line bg-paper-2/30 p-2 last:mb-0"
          >
            <div className="mb-1 flex items-center gap-1.5 text-[10px] text-muted">
              {it.source && <span className="truncate">来自 {it.source}</span>}
              <button
                type="button"
                onClick={() => updateItem(it.id, { pinned: !it.pinned })}
                title={it.pinned ? '取消置顶' : '置顶'}
                aria-label={it.pinned ? '取消置顶' : '置顶'}
                className={`ml-auto rounded p-1 transition-colors ${
                  it.pinned
                    ? 'text-accent'
                    : 'text-muted/70 hover:bg-paper hover:text-ink'
                }`}
              >
                <Pin size={10} className={it.pinned ? 'fill-current' : ''} />
              </button>
              <button
                type="button"
                onClick={() => removeItem(it.id)}
                title="删除此项"
                aria-label="删除"
                className="rounded p-1 text-muted/70 hover:bg-paper hover:text-urgent"
              >
                <Trash2 size={10} />
              </button>
            </div>
            <textarea
              value={it.text}
              onChange={(e) => updateItem(it.id, { text: e.target.value })}
              rows={2}
              spellCheck={false}
              className="w-full resize-none rounded border border-line bg-paper px-2 py-1 font-ui text-[12px] leading-[1.5] text-ink outline-none focus:border-line-strong"
            />
            <textarea
              value={it.annotation}
              onChange={(e) => updateItem(it.id, { annotation: e.target.value })}
              placeholder="批注（可选）"
              rows={1}
              spellCheck={false}
              className="mt-1 w-full resize-none rounded border border-line bg-paper px-2 py-1 font-ui text-[11px] italic leading-[1.5] text-ink-2 placeholder:text-muted/70 outline-none focus:border-line-strong"
            />
            <div className="mt-1 flex items-center gap-1">
              <Link2 size={10} className="shrink-0 text-muted/70" />
              <input
                value={it.url}
                onChange={(e) => updateItem(it.id, { url: e.target.value })}
                placeholder="附一个 URL（可选）"
                spellCheck={false}
                className="flex-1 rounded border border-line bg-paper px-1.5 py-0.5 font-ui text-[11px] text-ink outline-none focus:border-line-strong"
              />
            </div>
          </li>
        ))}
      </ul>

      {confirming ? (
        <footer className="flex items-center justify-between gap-2 border-t border-line bg-paper-2/40 px-3 py-2 text-[11px]">
          <span className="text-muted">丢弃 {items.length} 条未发送的草稿？</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={cancelDiscard}
              className="rounded px-2 py-0.5 text-muted hover:bg-paper hover:text-ink"
            >
              再想想
            </button>
            <button
              type="button"
              onClick={confirmDiscard}
              className="rounded border border-urgent/60 bg-paper px-2 py-0.5 text-urgent hover:bg-urgent/10"
            >
              确认丢弃
            </button>
          </div>
        </footer>
      ) : (
        <footer className="flex items-center justify-between gap-2 border-t border-line bg-paper-2/40 px-3 py-2 text-[11px]">
          <button
            type="button"
            onClick={requestClose}
            className="rounded px-2 py-1 text-muted hover:bg-paper hover:text-ink"
          >
            关闭
          </button>
          <button
            type="button"
            onClick={() => void send()}
            disabled={items.length === 0 || sending}
            className="flex items-center gap-1 rounded-md border border-accent bg-accent-soft px-2.5 py-1 text-accent hover:bg-accent/10 disabled:cursor-not-allowed disabled:border-line disabled:bg-paper-2 disabled:text-muted/60"
          >
            <Send size={11} />
            <span>{sending ? '发送中…' : `发送（${items.length}）`}</span>
          </button>
        </footer>
      )}
    </div>
  );
}

