import { CalendarDays, CheckCircle2, Package, Pin, RotateCcw, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { router } from '@/lib/ai/router';
import { buildStatusPrompt } from '@/lib/ai/prompts/summarizeStatus';
import type { Block } from '@/lib/db/blocks';
import type { Thread, ThreadStatus } from '@/lib/db/threads';
import { useBlocksStore } from '@/stores/blocksStore';
import { isAiAvailable, useSettingsStore } from '@/stores/settingsStore';
import { useThreadsStore } from '@/stores/threadsStore';

export type ThreadViewMode = 'log' | 'digest';

interface Props {
  thread: Thread;
  blocks: readonly Block[];
  onPack: () => void;
  onComplete: () => void;
  onReopen: () => void;
  // Only meaningful when thread.status === 'done'.
  viewMode: ThreadViewMode;
  onSetViewMode: (m: ThreadViewMode) => void;
}

const STATUS_OPTIONS: { value: ThreadStatus; label: string; cls: string }[] = [
  { value: 'active', label: '进行中', cls: 'text-[var(--status-active)]' },
  { value: 'parked', label: '搁置', cls: 'text-[var(--status-parked)]' },
];

// Local-state mirror of the thread title with a 200ms debounced write-back (§8.3) — the
// title is the one free-form header field. While the user is typing the local value
// wins; `resetKey` (the thread id) force-resyncs on a thread switch so a mid-edit switch
// can't carry text across.
function useDebouncedField<T>(
  external: T,
  resetKey: string,
  write: (value: T) => void,
): [T, (value: T) => void] {
  const [value, setValue] = useState(external);
  const dirty = useRef(false);
  const latest = useRef(value);
  latest.current = value;
  const writeRef = useRef(write);
  writeRef.current = write;

  // Thread switch: adopt the new thread's value unconditionally and drop any edit.
  useEffect(() => {
    setValue(external);
    dirty.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  // Same thread, value changed elsewhere: adopt it only when not mid-edit.
  useEffect(() => {
    if (!dirty.current) setValue(external);
  }, [external]);

  useEffect(() => {
    if (value === external) {
      dirty.current = false;
      return;
    }
    dirty.current = true;
    const t = setTimeout(() => {
      writeRef.current(latest.current);
      dirty.current = false;
    }, 200);
    return () => clearTimeout(t);
  }, [value, external]);

  return [value, setValue];
}

// A deadline is stored as the ms epoch of the picked day's last moment, so the thread
// reads as "due today" for the whole due date rather than flipping to overdue at 00:00.
const toDateInput = (ms: number): string => {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
const fromDateInput = (s: string): number => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y!, m! - 1, d!, 23, 59, 59, 999).getTime();
};

export default function ThreadHeader({
  thread,
  blocks,
  onPack,
  onComplete,
  onReopen,
  viewMode,
  onSetViewMode,
}: Props) {
  const patch = useThreadsStore((s) => s.patch);
  const setSummary = useThreadsStore((s) => s.setSummary);
  const setCaptureTarget = useThreadsStore((s) => s.setCaptureTarget);
  const attachmentsByBlock = useBlocksStore((s) => s.attachmentsByBlock);
  const aiAvailable = useSettingsStore(isAiAvailable);

  const [title, setTitle] = useDebouncedField(thread.title, thread.id, (v) =>
    void patch(thread.id, { title: v }),
  );

  // Status summary (§9.11). Disposable decoration (§6.3): auto-generated once in the
  // background, user-editable, silently absent when it can't be produced.
  const [summarizing, setSummarizing] = useState(false);
  const [editingSummary, setEditingSummary] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState(thread.summary ?? '');
  // Shown once, inline, when the user reaches for the summary affordance but AI is off.
  const [aiHint, setAiHint] = useState(false);
  const summaryRef = useRef<HTMLTextAreaElement>(null);
  // Fires the auto-generate at most once per thread (per session) so block changes can't
  // re-trigger it mid-flight; keyed by the thread id we attempted.
  const attemptedRef = useRef<string | null>(null);
  // Skips the trailing debounce when Esc abandons an edit.
  const summaryCanceledRef = useRef(false);

  const nonRefBlockCount = blocks.reduce((n, b) => (b.kind !== 'ref' ? n + 1 : n), 0);

  useEffect(() => {
    setSummarizing(false);
    setEditingSummary(false);
    setAiHint(false);
  }, [thread.id]);

  useEffect(() => {
    if (!editingSummary) setSummaryDraft(thread.summary ?? '');
  }, [thread.summary, editingSummary]);

  useEffect(() => {
    if (editingSummary && summaryRef.current) {
      const el = summaryRef.current;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, [editingSummary]);

  // Auto-generate once on open (§9.11), background + non-blocking + silent on failure
  // (§18.9). Only when there's no summary yet, the thread is active, AI is available, and
  // there are ≥2 non-ref blocks to summarize. Routes Quality→Local with the LRU cache
  // (§6.5). Generate-once: no staleness tracking, no auto-regeneration.
  useEffect(() => {
    if (thread.status === 'done') return;
    if (thread.summary != null && thread.summary !== '') return;
    if (editingSummary) return;
    if (!aiAvailable) return;
    if (nonRefBlockCount < 2) return;
    if (attemptedRef.current === thread.id) return;
    attemptedRef.current = thread.id;
    const tid = thread.id;
    setSummarizing(true);
    void (async () => {
      try {
        const { text } = await router.quality(
          buildStatusPrompt(thread, blocks as Block[], attachmentsByBlock),
          { cache: true },
        );
        const trimmed = text.trim();
        if (trimmed) await setSummary(tid, trimmed);
      } catch {
        // §6.3 / §18.9: silent degradation — no toast, no error styling.
      } finally {
        if (attemptedRef.current === tid) setSummarizing(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [thread.id, thread.status, thread.summary, aiAvailable, nonRefBlockCount, editingSummary]);

  // Inline edit: click the summary (or the "write one" affordance) → debounced save (§8.3).
  useEffect(() => {
    if (!editingSummary || summaryCanceledRef.current) return;
    if (summaryDraft === (thread.summary ?? '')) return;
    const t = setTimeout(() => {
      const trimmed = summaryDraft.trim();
      void setSummary(thread.id, trimmed.length > 0 ? trimmed : null);
    }, 200);
    return () => clearTimeout(t);
  }, [summaryDraft, thread.summary, thread.id, editingSummary, setSummary]);

  const enterSummaryEdit = (): void => {
    summaryCanceledRef.current = false;
    setSummaryDraft(thread.summary ?? '');
    setEditingSummary(true);
    if (!aiAvailable) setAiHint(true);
  };
  const commitSummary = (): void => {
    setEditingSummary(false);
    setAiHint(false);
  };
  const cancelSummary = (): void => {
    summaryCanceledRef.current = true;
    setSummaryDraft(thread.summary ?? '');
    setEditingSummary(false);
    setAiHint(false);
  };

  return (
    <header className="flex-none border-b border-line px-6 py-3">
      <div className="flex items-center gap-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="无标题"
          className="min-w-0 flex-1 bg-transparent font-serif text-2xl text-ink outline-none placeholder:text-muted/50"
        />

        <button
          onClick={onPack}
          className="flex flex-none items-center gap-1 rounded-full border border-accent bg-accent px-3 py-1 text-xs font-medium text-paper transition-colors hover:border-[var(--accent-2)] hover:bg-[var(--accent-2)]"
          title="打包上下文（⌘⇧P）"
        >
          <Package size={12} />
          <span>打包</span>
        </button>

        {thread.status === 'done' ? (
          <button
            onClick={onReopen}
            className="flex flex-none items-center gap-1 rounded-full border border-line bg-paper px-2.5 py-1 text-xs text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
            title="重新打开（清除完成时间和结论）"
          >
            <RotateCcw size={11} />
            <span>重新打开</span>
          </button>
        ) : (
          <button
            onClick={onComplete}
            className="flex flex-none items-center gap-1 rounded-full border border-line bg-paper px-2.5 py-1 text-xs text-ink-2 transition-colors hover:border-line-strong hover:text-ink"
            title="完成项目"
          >
            <CheckCircle2 size={11} />
            <span>完成项目</span>
          </button>
        )}

        <button
          onClick={() => void setCaptureTarget(thread.id)}
          disabled={thread.isCaptureTarget}
          className={`flex flex-none items-center gap-1 rounded-full border border-line bg-paper px-2.5 py-1 text-xs transition-colors ${
            thread.isCaptureTarget
              ? 'text-ink-2'
              : 'text-muted hover:border-line-strong hover:text-ink-2'
          }`}
          title={thread.isCaptureTarget ? '当前捕捉目标' : '设为捕捉目标'}
        >
          <Pin size={11} className={thread.isCaptureTarget ? 'fill-current' : ''} />
          <span>{thread.isCaptureTarget ? '捕捉目标' : '设为目标'}</span>
          {thread.isCaptureTarget && (
            <span
              className="h-1.5 w-1.5 flex-none rounded-full bg-accent"
              aria-hidden
            />
          )}
        </button>
      </div>

      {/* Status summary — visually subordinate/optional (§9.11). Click to edit; auto-fills
          in the background when AI is available; a quiet affordance when it's empty so the
          area is never just blank. Hidden for done threads (digest takes over). */}
      {thread.status !== 'done' && (
        <div className="mt-1.5">
          {editingSummary ? (
            <>
              <textarea
                ref={summaryRef}
                value={summaryDraft}
                onChange={(e) => setSummaryDraft(e.target.value)}
                onBlur={commitSummary}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    commitSummary();
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    cancelSummary();
                  }
                }}
                rows={2}
                placeholder="写一句话摘要…"
                spellCheck={false}
                className="w-full resize-none bg-transparent text-xs italic leading-snug text-ink-2 outline-none placeholder:text-muted/50"
              />
              {aiHint && !aiAvailable && (
                <p className="text-[11px] text-muted/80">
                  未配置 AI。可到设置配置，或在此手动写一句。
                </p>
              )}
            </>
          ) : thread.summary ? (
            <button
              onClick={enterSummaryEdit}
              className="block w-full truncate text-left text-xs italic text-muted transition-colors hover:text-ink-2"
              title="点击编辑摘要"
            >
              {thread.summary}
            </button>
          ) : summarizing ? (
            <p className="text-xs italic text-muted/70">正在生成摘要…</p>
          ) : (
            <button
              onClick={enterSummaryEdit}
              className="text-xs italic text-muted/60 transition-colors hover:text-muted"
              title="写一句话摘要"
            >
              ＋ 写一句话摘要
            </button>
          )}
        </div>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
        {thread.status === 'done' ? (
          // Done threads: session-only toggle between digest and full log (§9.9).
          // The override doesn't persist — reopens default back to DigestView.
          <div className="flex items-center gap-1">
            <button
              onClick={() => onSetViewMode('digest')}
              className={`rounded-full px-2 py-0.5 transition-colors ${
                viewMode === 'digest' ? 'text-ink' : 'text-muted hover:text-ink-2'
              }`}
            >
              摘要
            </button>
            <span className="text-muted/40">/</span>
            <button
              onClick={() => onSetViewMode('log')}
              className={`rounded-full px-2 py-0.5 transition-colors ${
                viewMode === 'log' ? 'text-ink' : 'text-muted hover:text-ink-2'
              }`}
            >
              全记录
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => void patch(thread.id, { status: opt.value })}
                className={`rounded-full border px-2 py-0.5 transition-colors ${
                  thread.status === opt.value
                    ? `border-current ${opt.cls}`
                    : 'border-line text-muted hover:border-line-strong'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}

        <div className="flex items-center gap-1.5 text-muted">
          <CalendarDays size={12} className="flex-none" />
          <input
            type="date"
            value={thread.deadline != null ? toDateInput(thread.deadline) : ''}
            onChange={(e) =>
              void patch(thread.id, {
                deadline: e.target.value ? fromDateInput(e.target.value) : null,
              })
            }
            className="rounded border border-line bg-paper px-1.5 py-0.5 font-mono text-[11px] text-ink outline-none focus:border-line-strong"
          />
          {thread.deadline != null && (
            <button
              onClick={() => void patch(thread.id, { deadline: null })}
              className="rounded p-0.5 hover:bg-paper-2 hover:text-ink"
              title="清除截止日期"
            >
              <X size={11} />
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
