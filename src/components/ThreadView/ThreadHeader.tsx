import { CalendarDays, CheckCircle2, Package, RotateCcw, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { isImeComposing } from '@/lib/utils/ime';
import { useT } from '@/lib/i18n';
import type { Block } from '@/lib/db/blocks';
import type { Thread } from '@/lib/db/threads';
import { isDormant } from '@/lib/threads/dormancy';
import { useBlocksStore } from '@/stores/blocksStore';
import type { Attachment } from '@/lib/db/attachments';
import { ACTION_LABEL, useEngineStore } from '@/stores/engineStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useThreadsStore } from '@/stores/threadsStore';

const EMPTY_ATTACHMENTS: readonly Attachment[] = [];

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

// DESIGN_WORKBENCH §9.2 R3 — this header used to carry a ⋯ menu holding 完成/重开, the
// capture-target switch, the three AI maintenance actions and the follow-up pair. Ocean,
// after using it: 「主视图 ⋯ 菜单里还留着 ai 维护和 follow up，冗余……只留三个按钮:
// 打包 / 捕捉 / 完成项目」.
//
// ⚠️ That **overturns §3.2's** 「保留 ⋯ 菜单入口，已经习惯的路不要断」. §9.5 decided it: he is
// the person that rule was protecting, and he used both paths and called the second one
// redundant. Everything AI now lives in the right rail and nowhere else.
//
// With the menu down to a single item, the menu itself went too — three plain buttons is
// what he asked for, and it is one fewer click to each of them. The capture-target switch
// was already a top-level button here; the menu's copy of it was the same redundancy.

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
  const attachments = useBlocksStore(
    (s) => s.attachmentsByThread[thread.id] ?? EMPTY_ATTACHMENTS,
  );

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
  const summaryRef = useRef<HTMLTextAreaElement>(null);
  // Skips the trailing debounce when Esc abandons an edit.
  const summaryCanceledRef = useRef(false);

  // The running pill is all that is left of the engine on this header (§9.2 R3 moved the
  // actions out). It stays because the rail ships COLLAPSED by default: without it, a run
  // the user started would be doing minutes of billed work behind a closed panel with no
  // sign of it anywhere on screen. Clicking it opens the rail, where the live text is.
  const engineCurrent = useEngineStore((s) => s.current);
  const engineQueue = useEngineStore((s) => s.queue);
  const updateSettings = useSettingsStore((s) => s.update);
  const runningHere = engineCurrent?.threadId === thread.id;

  // Total character count of what a pack of this thread would carry (see
  // CONTENT_WARN_THRESHOLD). Summing a few hundred strings is nanosecond-scale;
  // memoized only so it doesn't re-run on unrelated header re-renders.
  const charCount = useMemo(() => {
    let n = 0;
    for (const b of blocks) n += b.content.length + (b.annotation?.length ?? 0);
    // v15: the files are the project's, so they are counted once for the project rather
    // than walked per block.
    for (const a of attachments) {
      if (a.includeInPack && a.extractedText) n += a.extractedText.length;
    }
    return n;
  }, [blocks, attachments]);

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

        {/* The running pill. Same shape as 捕捉中 so the two read as one system. Ocean could
            not tell it was the cancel button (#4) — so it is not one any more: it is a status
            that OPENS THE RAIL, where the live text and the stop button now are. */}
        {runningHere && engineCurrent && (
          <button
            onClick={() => void updateSettings({ railCollapsed: false })}
            title={t('点一下打开右边，看它在写什么')}
            className="flex flex-none items-center gap-1 rounded-full border border-accent/60 bg-accent-soft px-2.5 py-1 text-[11px] text-accent transition-colors hover:border-accent hover:bg-accent/15"
          >
            <span>
              {engineQueue.length > 0
                ? t('{action}中 · 还排着 {n} 个', {
                    action: t(ACTION_LABEL[engineCurrent.action]),
                    n: engineQueue.length,
                  })
                : t('{action}中', { action: t(ACTION_LABEL[engineCurrent.action]) })}
            </span>
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" aria-hidden />
          </button>
        )}

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

        {/* §9.2 R3 — the third and last button. It used to be the only item worth keeping
            in the ⋯ menu, and a menu holding one item is a click in front of a button. */}
        {thread.status === 'done' ? (
          <button
            onClick={onReopen}
            title={t('重新打开（清除完成时间和结论）')}
            className="flex flex-none items-center gap-1 rounded-full border border-line bg-paper px-2.5 py-1 text-xs text-muted transition-colors hover:border-accent hover:text-accent"
          >
            <RotateCcw size={12} />
            <span>{t('重新打开')}</span>
          </button>
        ) : (
          <button
            onClick={onComplete}
            title={t('完成项目')}
            className="flex flex-none items-center gap-1 rounded-full border border-line bg-paper px-2.5 py-1 text-xs text-muted transition-colors hover:border-accent hover:text-accent"
          >
            <CheckCircle2 size={12} />
            <span>{t('完成项目')}</span>
          </button>
        )}
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
