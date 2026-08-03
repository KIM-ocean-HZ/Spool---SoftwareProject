import {
  CalendarDays,
  CheckCircle2,
  MoreHorizontal,
  Package,
  Pin,
  RotateCcw,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { isImeComposing } from '@/lib/utils/ime';
import { useT } from '@/lib/i18n';
import type { Block } from '@/lib/db/blocks';
import type { Thread } from '@/lib/db/threads';
import { isDormant } from '@/lib/threads/dormancy';
import { useBlocksStore } from '@/stores/blocksStore';
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

// Quiet "this thread is getting long" threshold, in characters (block content +
// annotations + pack-included attachment text — i.e. what actually lands in a pack).
// ~20k chars is roughly the paste size mainstream chat models digest reliably in one
// go; past it pack fidelity degrades and the range selector (§17) is the right tool,
// so the counter turns --status-parked and click opens PackDialog.
const CONTENT_WARN_THRESHOLD = 20_000;

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
  const t = useT();
  const patch = useThreadsStore((s) => s.patch);
  const setSummary = useThreadsStore((s) => s.setSummary);
  const setCaptureTarget = useThreadsStore((s) => s.setCaptureTarget);
  const attachmentsByBlock = useBlocksStore((s) => s.attachmentsByBlock);

  const [title, setTitle] = useDebouncedField(thread.title, thread.id, (v) =>
    void patch(thread.id, { title: v }),
  );

  // Status summary (§9.11) — the thread's "catalogue card". Written by hand here, or
  // by a connected MCP client via set_thread_summary; never auto-generated in-app.
  const [editingSummary, setEditingSummary] = useState(false);
  const [summaryDraft, setSummaryDraft] = useState(thread.summary ?? '');
  // 任务三 #6 (2026-07-12): resting state shows the deadline as ISO text (the pack's
  // date format); the locale-formatted native picker appears only while editing.
  const [editingDeadline, setEditingDeadline] = useState(false);
  // 任务三 #3: the ⋯ overflow menu hosting 完成/重开 and the capture-target switch.
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent): void => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);
  const summaryRef = useRef<HTMLTextAreaElement>(null);
  // Skips the trailing debounce when Esc abandons an edit.
  const summaryCanceledRef = useRef(false);

  // Total character count of what a pack of this thread would carry (see
  // CONTENT_WARN_THRESHOLD). Summing a few hundred strings is nanosecond-scale;
  // memoized only so it doesn't re-run on unrelated header re-renders.
  const charCount = useMemo(() => {
    let n = 0;
    for (const b of blocks) {
      n += b.content.length + (b.annotation?.length ?? 0);
      const atts = attachmentsByBlock[b.id];
      if (atts) {
        for (const a of atts) {
          if (a.includeInPack && a.extractedText) n += a.extractedText.length;
        }
      }
    }
    return n;
  }, [blocks, attachmentsByBlock]);

  useEffect(() => {
    setEditingSummary(false);
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
  };
  const commitSummary = (): void => {
    setEditingSummary(false);
  };
  const cancelSummary = (): void => {
    summaryCanceledRef.current = true;
    setSummaryDraft(thread.summary ?? '');
    setEditingSummary(false);
  };

  return (
    <header className="flex-none border-b border-line px-6 py-3">
      <div className="flex items-center gap-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('无标题')}
          className="min-w-0 flex-1 bg-transparent font-serif text-2xl text-ink outline-none placeholder:text-muted/50"
        />

        <button
          onClick={onPack}
          className="flex flex-none items-center gap-1 rounded-full border border-accent/60 bg-accent-soft px-3 py-1 text-xs font-medium text-accent transition-colors hover:border-accent hover:bg-accent/15"
          title={t('打包上下文（⌘⇧P）')}
        >
          <Package size={12} />
          <span>{t('打包')}</span>
        </button>

        {/* #7 (2026-07-13): folding the capture switch into ⋯ killed its
            discoverability for new users — a quiet ghost button restores it. When
            this thread IS the target it becomes a plain 捕捉中 status, not a button. */}
        {thread.status !== 'done' &&
          (thread.isCaptureTarget ? (
            <span className="flex flex-none items-center gap-1 text-[11px] text-muted">
              {t('捕捉中')}
              <span className="h-1.5 w-1.5 rounded-full bg-accent" aria-hidden />
            </span>
          ) : (
            <button
              onClick={() => void setCaptureTarget(thread.id)}
              title={t('之后的 ⌘C+双击 ⌥ 捕捉都会落进这个项目')}
              className="flex flex-none items-center rounded-full border border-line bg-paper px-2.5 py-1 text-xs text-muted transition-colors hover:border-accent hover:text-accent"
            >
              {t('捕捉到此')}
            </button>
          ))}

        {/* 任务三 #3 (2026-07-12): 打包 stays the header's only prominent action —
            完成/重开 and the capture-target switch move into this ⋯ menu. The sidebar
            row still carries the at-a-glance capture-target mark. */}
        <div ref={menuRef} className="relative flex-none">
          <button
            onClick={() => setMenuOpen((v) => !v)}
            aria-label={t('更多操作')}
            title={t('更多操作')}
            className="flex items-center rounded-full border border-line bg-paper p-1.5 text-muted transition-colors hover:border-line-strong hover:text-ink"
          >
            <MoreHorizontal size={14} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full z-20 mt-1 w-48 rounded-md border border-line-strong bg-paper py-1 shadow-[var(--shadow-toast)]">
              {thread.status === 'done' ? (
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onReopen();
                  }}
                  title={t('重新打开（清除完成时间和结论）')}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-ink-2 transition-colors hover:bg-paper-2 hover:text-ink"
                >
                  <RotateCcw size={12} className="flex-none" />
                  <span>{t('重新打开')}</span>
                </button>
              ) : (
                <button
                  onClick={() => {
                    setMenuOpen(false);
                    onComplete();
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-ink-2 transition-colors hover:bg-paper-2 hover:text-ink"
                >
                  <CheckCircle2 size={12} className="flex-none" />
                  <span>{t('完成项目')}</span>
                </button>
              )}
              <button
                onClick={() => {
                  setMenuOpen(false);
                  void setCaptureTarget(thread.id);
                }}
                disabled={thread.isCaptureTarget}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-ink-2 transition-colors hover:bg-paper-2 hover:text-ink disabled:cursor-default disabled:text-muted disabled:hover:bg-transparent"
              >
                <Pin
                  size={12}
                  className={`flex-none ${thread.isCaptureTarget ? 'fill-current' : ''}`}
                />
                <span>{thread.isCaptureTarget ? t('当前捕捉目标') : t('设为捕捉目标')}</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Status summary — visually subordinate/optional (§9.11). Click to edit; a quiet
          affordance when it's empty so the area is never just blank. Hidden for done
          threads (digest takes over). */}
      {thread.status !== 'done' && (
        <div className="mt-1.5">
          {editingSummary ? (
            <textarea
              ref={summaryRef}
              value={summaryDraft}
              onChange={(e) => setSummaryDraft(e.target.value)}
              onBlur={commitSummary}
              onKeyDown={(e) => {
                if (isImeComposing(e.nativeEvent)) return;
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  commitSummary();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  cancelSummary();
                }
              }}
              rows={2}
              placeholder={t('写一句话摘要…')}
              spellCheck={false}
              className="w-full resize-none bg-transparent text-xs italic leading-snug text-ink-2 outline-none placeholder:text-muted/50"
            />
          ) : thread.summary ? (
            <button
              onClick={enterSummaryEdit}
              className="block w-full truncate text-left text-xs italic text-muted transition-colors hover:text-ink-2"
              title={t('点击编辑摘要')}
            >
              {thread.summary}
            </button>
          ) : (
            <button
              onClick={enterSummaryEdit}
              className="text-xs italic text-muted/60 transition-colors hover:text-muted"
              title={t('写一句话摘要')}
            >
              {t('＋ 写一句话摘要')}
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
              {t('摘要')}
            </button>
            <span className="text-muted/40">/</span>
            <button
              onClick={() => onSetViewMode('log')}
              className={`rounded-full px-2 py-0.5 transition-colors ${
                viewMode === 'log' ? 'text-ink' : 'text-muted hover:text-ink-2'
              }`}
            >
              {t('全记录')}
            </button>
          </div>
        ) : (
          // #5 auto-dormancy (2026-07-13): the manual 进行中/搁置 pill pair is gone —
          // parking is derived from idleness (lib/threads/dormancy) and any new
          // activity wakes the thread by itself. The only status a live thread ever
          // states is the derived one.
          isDormant(thread, Date.now()) && (
            <span className="rounded-full border border-line px-2 py-0.5 text-muted">
              {t('沉睡')}
            </span>
          )
        )}

        <div className="flex items-center gap-1.5 text-muted">
          <CalendarDays size={12} className="flex-none" />
          {editingDeadline ? (
            <input
              type="date"
              autoFocus
              value={thread.deadline != null ? toDateInput(thread.deadline) : ''}
              onChange={(e) =>
                void patch(thread.id, {
                  deadline: e.target.value ? fromDateInput(e.target.value) : null,
                })
              }
              onBlur={() => setEditingDeadline(false)}
              className="rounded border border-line bg-paper px-1.5 py-0.5 font-mono text-[11px] text-ink outline-none focus:border-line-strong"
            />
          ) : (
            <button
              onClick={() => setEditingDeadline(true)}
              title={t('设置截止日期')}
              className={`rounded border border-line bg-paper px-1.5 py-0.5 font-mono text-[11px] transition-colors hover:border-line-strong ${
                thread.deadline != null ? 'text-ink' : 'text-muted/60'
              }`}
            >
              {thread.deadline != null ? toDateInput(thread.deadline) : t('截止日期')}
            </button>
          )}
          {thread.deadline != null && (
            <button
              onClick={() => void patch(thread.id, { deadline: null })}
              className="rounded p-0.5 hover:bg-paper-2 hover:text-ink"
              title={t('清除截止日期')}
            >
              <X size={11} />
            </button>
          )}
        </div>

        {/* Content size (2026-07-07): quiet by design (§2.5) — a mono footnote, no
            popup. Over the threshold it turns --status-parked and becomes a shortcut
            into PackDialog, where range selection solves the problem. */}
        {charCount > 0 &&
          (charCount > CONTENT_WARN_THRESHOLD ? (
            <button
              onClick={onPack}
              className="font-mono text-[11px] transition-opacity hover:opacity-80"
              style={{ color: 'var(--status-parked)' }}
              title={t('内容过多可能导致打包不准确 — 点击打包，可选择范围')}
            >
              {t('{n} 字 · 内容较多', { n: charCount.toLocaleString('en-US') })}
            </button>
          ) : (
            <span
              className="font-mono text-[11px] text-muted"
              title={t('全部块内容 + 批注 + 已加入 Pack 的附件文本')}
            >
              {t('{n} 字', { n: charCount.toLocaleString('en-US') })}
            </span>
          ))}
      </div>
    </header>
  );
}
