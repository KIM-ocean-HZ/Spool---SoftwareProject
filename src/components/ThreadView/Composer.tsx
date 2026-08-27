import { useEffect, useMemo, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { isImeComposing } from '@/lib/utils/ime';
import { useT } from '@/lib/i18n';
import { useBlocksStore } from '@/stores/blocksStore';
import { selectDraft, useDraftStore } from '@/stores/draftStore';
import { selectThreadById, useThreadsStore } from '@/stores/threadsStore';

interface Props {
  threadId: string;
  /** ⑦（2026-08-27，Ocean:「发完一条自动定位到最底下刚输入的位置」）——刚存下的那一块。
   *  ⚠️ 滚动交给 LogView 做：滚动容器是它的，⛔ 别在这里塞一个全局的「滚到哪儿」状态。 */
  onSubmitted?: (blockId: string) => void;
}

// Match a trailing `@query` token at the end of the draft (Phase 10). The leading
// boundary is start-of-string or whitespace, so "email@x" stays plain text. We only
// detect at the end of the value — keeping detection cursor-aware would need extra
// caret tracking and a 2-row composer means the cursor sits at the end anyway.
const MENTION_RE = /(?:^|\s)@([^\s@]*)$/;

const MENTION_LIMIT = 8;

export default function Composer({ threadId, onSubmitted }: Props) {
  const t = useT();
  // ⚠️⚠️ 草稿存在 store 里，**不是** useState —— LogView 是 `key={thread.id}` 挂的，
  // 查找跳到别的项目会把这个组件整个卸载重建，本地 state 跟着没。见 stores/draftStore.ts。
  const value = useDraftStore(selectDraft(threadId));
  const setValue = (next: string): void => useDraftStore.getState().setDraft(threadId, next);
  const [activeIdx, setActiveIdx] = useState(0);

  const append = useBlocksStore((s) => s.append);
  const thread = useThreadsStore(selectThreadById(threadId));
  const threadsByWs = useThreadsStore((s) => s.threadsByWorkspace);

  const mention = useMemo(() => {
    const m = MENTION_RE.exec(value);
    if (!m) return null;
    const query = m[1] ?? '';
    return { query, start: value.length - query.length - 1, end: value.length };
  }, [value]);

  // Same-workspace threads, current excluded, case-insensitive substring match on the
  // query. Earlier match index ranks higher; ties break alphabetically.
  const candidates = useMemo(() => {
    if (!mention || !thread) return [];
    const sameWs = threadsByWs[thread.workspaceId] ?? [];
    const q = mention.query.toLowerCase();
    return sameWs
      .filter((t) => t.id !== thread.id)
      .map((th) => {
        const title = th.title || t('（无标题）');
        const idx = q ? title.toLowerCase().indexOf(q) : 0;
        return { t: th, title, idx };
      })
      .filter((c) => c.idx >= 0)
      .sort((a, b) => a.idx - b.idx || a.title.localeCompare(b.title))
      .slice(0, MENTION_LIMIT);
  }, [mention, thread, threadsByWs]);

  useEffect(() => {
    setActiveIdx(0);
  }, [mention?.query, candidates.length]);

  const submit = async (): Promise<void> => {
    const content = value.trim();
    if (!content) return;
    useDraftStore.getState().clearDraft(threadId);
    const block = await append({ threadId, kind: 'text', content });
    onSubmitted?.(block.id);
  };

  const pickMention = async (i: number): Promise<void> => {
    const c = candidates[i];
    if (!c || !mention) return;
    // Strip the @query fragment from the draft (any remaining text is preserved) and
    // append a ref block. Snapshot the title into content so the assemble fallback
    // still has something if the referenced thread is later deleted.
    setValue(value.slice(0, mention.start) + value.slice(mention.end));
    const block = await append({ threadId, kind: 'ref', content: c.title, refThreadId: c.t.id });
    onSubmitted?.(block.id);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>): void => {
    if (isImeComposing(e.nativeEvent)) return;
    if (mention && candidates.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIdx((i) => (i + 1) % candidates.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIdx((i) => (i - 1 + candidates.length) % candidates.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        void pickMention(activeIdx);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        // Drop the @ fragment so the popover closes; whatever the user typed before
        // is preserved as draft text.
        setValue(value.slice(0, mention.start) + value.slice(mention.end));
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  };

  const showPopover = mention !== null && candidates.length > 0;

  return (
    <div className="relative flex-none border-t border-line bg-paper-2/30 px-6 py-3">
      {showPopover && (
        <div className="absolute bottom-full left-6 right-6 mb-2 max-h-60 overflow-y-auto rounded-md border border-line bg-paper shadow-lg">
          {candidates.map((c, i) => (
            <button
              key={c.t.id}
              type="button"
              // mousedown (not click) so the textarea doesn't blur first and clear the
              // mention state before the handler runs.
              onMouseDown={(e) => {
                e.preventDefault();
                void pickMention(i);
              }}
              onMouseEnter={() => setActiveIdx(i)}
              className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] ${
                i === activeIdx ? 'bg-accent/10 text-accent' : 'text-ink hover:bg-paper-2'
              }`}
            >
              <span className="font-mono text-muted">@</span>
              <span className="truncate">{c.title}</span>
            </button>
          ))}
        </div>
      )}
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={t('写一条草稿…（Enter 发送，Shift+Enter 换行，@ 引用项目）')}
        rows={2}
        className="w-full resize-none rounded-md border border-line bg-paper px-3 py-2 text-[15px] leading-[1.6] text-ink outline-none focus:border-line-strong"
        spellCheck={false}
      />
    </div>
  );
}
