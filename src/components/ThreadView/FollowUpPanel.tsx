import { Check, Globe, Loader2, RotateCcw, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import EngineBar from '@/components/RightRail/EngineBar';
import { isImeComposing } from '@/lib/utils/ime';
import { useT } from '@/lib/i18n';
import type { FollowUpItem } from '@/lib/db/followUpItems';
import type { Thread } from '@/lib/db/threads';
import { useEngineStore } from '@/stores/engineStore';
import { useFollowUpStore } from '@/stores/followUpStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { toast } from '@/stores/toastStore';

// DESIGN_FOLLOW_UP §8.2 / §8.7 — where the user reads and settles what a project follows up.
//
// It was one textarea holding the whole brief until v22. Ocean decided on 2026-08-16 that
// the list stays ONE list, and rows are what let a single line be pointed at: answered,
// reopened, or dropped. Two kinds of line live in it, and the 「永久跟进」 marker is what
// keeps merging them safe (§8.2) — an AI may close a one-off line the moment it answers it,
// and may never close a standing watch, or answering "the deadline is March 1" once would
// quietly stop the project being watched at all.
//
// The panel is still the off switch (§3.2, unchanged in spirit): an empty list means this
// project follows nothing up, and nothing about it reaches the open web.

interface Props {
  thread: Thread;
  onClose: () => void;
}

export default function FollowUpPanel({ thread, onClose }: Props) {
  const t = useT();
  const [draft, setDraft] = useState('');
  const [drafting, setDrafting] = useState(false);
  const [showAnswered, setShowAnswered] = useState(false);
  const enqueue = useEngineStore((s) => s.enqueue);
  const timeoutSecs = useSettingsStore((s) => s.aiEngineTimeoutSecs);

  const load = useFollowUpStore((s) => s.load);
  const items = useFollowUpStore((s) => s.items);
  const add = useFollowUpStore((s) => s.add);
  const openItems = items.filter((i) => i.status === 'open');
  const answered = items
    .filter((i) => i.status === 'answered')
    .sort((a, b) => (b.answeredAt ?? 0) - (a.answeredAt ?? 0));

  useEffect(() => {
    void load(thread.id);
  }, [load, thread.id]);

  useEffect(() => {
    const h = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const commitDraft = (standing: boolean): void => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    void add(text, standing);
  };

  // The AI reads the project and says what is missing. It appends lines rather than
  // replacing anything: whatever the user already settled on is theirs (§6-2 — the drafting
  // step exists to give them something to react to, not to decide for them).
  const askAi = (): void => {
    const queued = enqueue(thread.id, thread.title, 'follow_up_brief', timeoutSecs, (result) => {
      setDrafting(false);
      const lines = result
        .split('\n')
        .map((l) => l.replace(/^\s*\d+[.、)]\s*/, '').trim())
        .filter((l) => l.length > 0);
      if (lines.length === 0) return;
      // Drafted lines are standing watches — that is what this action has always produced
      // ("这个项目里有哪几件事需要外部证据"), and the user can flip any of them after.
      void (async () => {
        for (const line of lines) await add(line, true);
        toast.notice(t('AI 加了 {n} 条，你可以改也可以删', { n: lines.length }));
      })();
    });
    if (queued) setDrafting(true);
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-center bg-ink/30 px-8 pt-[12vh]" onClick={onClose}>
      <div
        className="flex max-h-[70vh] w-[520px] flex-col overflow-hidden rounded-lg border border-line-strong bg-paper"
        style={{ boxShadow: 'var(--shadow-toast)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-none items-start justify-between gap-3 border-b border-line px-5 py-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-1.5 font-serif text-xl text-ink">
              <Globe size={15} className="flex-none" />
              {t('这个项目跟进什么')}
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              {t('一行一件事。AI 以后就照这几行去查——「单次跟进」查到答案就自己收起来，「永久跟进」的不会。')}
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex-none rounded p-1 text-muted hover:bg-paper-2 hover:text-ink"
            aria-label={t('关闭')}
          >
            <X size={15} />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {openItems.length === 0 && (
            <p className="rounded border border-dashed border-line px-2.5 py-3 text-center text-xs text-muted">
              {t('还没定。写一条要跟进的，之后 AI 才知道该去查什么。')}
            </p>
          )}

          <div className="space-y-1.5">
            {openItems.map((item) => (
              <ItemRow key={item.id} item={item} />
            ))}
          </div>

          <div className="mt-2 flex items-start gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                // ⚠️ Never while composing: Enter is how an IME accepts its candidate, and
                // stealing it would make the box unusable for typing Chinese (lib/utils/ime).
                if (isImeComposing(e.nativeEvent)) return;
                if (e.key !== 'Enter' || e.shiftKey) return;
                e.preventDefault();
                commitDraft(false);
              }}
              rows={2}
              placeholder={t('再加一条。比如：我在用的这个工具出没出新版本，有没有不兼容的改动。')}
              className="min-w-0 flex-1 resize-none rounded border border-line bg-paper-2/30 px-2.5 py-2 text-xs leading-relaxed text-ink outline-none focus:border-accent"
            />
            <div className="flex flex-none flex-col gap-1">
              <button
                type="button"
                onClick={() => commitDraft(false)}
                disabled={!draft.trim()}
                className="rounded border border-line bg-paper px-2 py-1 text-[11px] text-ink-2 transition-colors enabled:hover:border-accent enabled:hover:text-accent disabled:text-muted"
              >
                {t('加上')}
              </button>
              <button
                type="button"
                onClick={() => commitDraft(true)}
                disabled={!draft.trim()}
                title={t('查到一次答案也不收起来')}
                className="rounded border border-line bg-paper px-2 py-1 text-[11px] text-muted transition-colors enabled:hover:border-accent enabled:hover:text-accent disabled:opacity-40"
              >
                {t('永久跟进')}
              </button>
            </div>
          </div>
          <p className="mt-1 text-[10px] text-muted">
            {t('回车＝加一条；⇧回车在同一条里换行。')}
          </p>

          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={askAi}
              disabled={drafting}
              className="flex items-center gap-1.5 rounded border border-line bg-paper px-2.5 py-1 text-[11px] text-ink-2 transition-colors enabled:hover:border-accent enabled:hover:text-accent disabled:text-muted"
            >
              {drafting && <Loader2 size={11} className="animate-spin" />}
              {drafting ? t('AI 在读这个项目…') : t('让 AI 看看还缺什么')}
            </button>
            <span className="text-[10px] text-muted">{t('这一步只读你库里的东西，不联网。')}</span>
          </div>

          {/* §8.6 — an answered line is retired, not deleted: it stays here with one click to
              put it back. That is what makes it safe to let an AI close one without asking
              (Ocean 拍板 2026-08-16) — the worst case is a line parked where the user can see
              it, never a watch that silently disappeared. */}
          {answered.length > 0 && (
            <div className="mt-3 border-t border-line pt-2">
              <button
                type="button"
                onClick={() => setShowAnswered((v) => !v)}
                className="text-[11px] text-muted transition-colors hover:text-ink"
              >
                {showAnswered
                  ? t('收起已经答了的')
                  : t('已经答了的（{n}）', { n: answered.length })}
              </button>
              {showAnswered && (
                <div className="mt-1.5 space-y-1.5">
                  {answered.map((item) => (
                    <AnsweredRow key={item.id} item={item} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 2026-08-12 (Ocean: 「『选择跟进用的 AI』，把这个选择键放到编辑的面板里面，这个按钮
              不常用」) — it used to hold a permanent line in the right rail. It belongs here:
              this panel is where the follow-up rules are settled, and which engine carries them
              out is part of the same decision, taken about as often. It stays folded shut
              (RightRail/EngineBar) so the panel opens on the list, not on a form. */}
          <div className="mt-3 border-t border-line pt-3">
            <EngineBar />
          </div>
        </div>
      </div>
    </div>
  );
}

/** One live line: editable in place, with the marker that decides whether an AI may ever
 *  close it, and the two ways it can leave the list. */
function ItemRow({ item }: { item: FollowUpItem }) {
  const t = useT();
  const edit = useFollowUpStore((s) => s.edit);
  const setStanding = useFollowUpStore((s) => s.setStanding);
  const close = useFollowUpStore((s) => s.close);
  const remove = useFollowUpStore((s) => s.remove);
  const [text, setText] = useState(item.text);
  const ref = useRef<HTMLTextAreaElement>(null);

  // The row is the source of truth while the user is typing in it; anything else (an AI
  // rewording a line, a reload) replaces what they have not committed yet.
  useEffect(() => {
    if (document.activeElement !== ref.current) setText(item.text);
  }, [item.text]);

  const commit = (): void => {
    const next = text.trim();
    if (!next || next === item.text) {
      setText(item.text);
      return;
    }
    void edit(item.id, next);
  };

  return (
    <div className="rounded border border-line bg-paper-2/30 px-2.5 py-1.5">
      <textarea
        ref={ref}
        value={text}
        rows={1}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (isImeComposing(e.nativeEvent)) return;
          if (e.key !== 'Enter' || e.shiftKey) return;
          e.preventDefault();
          e.currentTarget.blur();
        }}
        className="w-full resize-none bg-transparent text-xs leading-relaxed text-ink outline-none"
      />
      <div className="mt-0.5 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => void setStanding(item.id, !item.standing)}
          title={
            item.standing
              ? t('永久跟进：AI 查到答案也不会把它收起来')
              : t('查到答案就收起来。点一下改成永久跟进')
          }
          className={`rounded px-1.5 py-0.5 text-[10px] transition-colors ${
            item.standing
              ? 'bg-accent-soft text-accent'
              : 'text-muted hover:bg-paper-2 hover:text-ink-2'
          }`}
        >
          {item.standing ? t('永久跟进') : t('单次跟进')}
        </button>
        <div className="flex flex-none items-center gap-1">
          <button
            type="button"
            onClick={() => void close(item.id)}
            title={t('这条已经有答案了，收起来')}
            className="rounded p-1 text-muted transition-colors hover:bg-paper-2 hover:text-ink"
          >
            <Check size={12} />
          </button>
          <button
            type="button"
            onClick={() => void remove(item.id)}
            title={t('不跟进这个了，直接删掉')}
            className="rounded p-1 text-muted transition-colors hover:bg-paper-2 hover:text-ink"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>
    </div>
  );
}

function AnsweredRow({ item }: { item: FollowUpItem }) {
  const t = useT();
  const reopen = useFollowUpStore((s) => s.reopen);
  return (
    <div className="flex items-start gap-2 rounded border border-line px-2.5 py-1.5">
      <div className="min-w-0 flex-1">
        <p className="break-words text-xs leading-relaxed text-muted line-through">{item.text}</p>
        {item.outcome && (
          <p className="mt-0.5 break-words text-[11px] leading-relaxed text-ink-2">
            {item.outcome}
          </p>
        )}
      </div>
      <button
        type="button"
        onClick={() => void reopen(item.id)}
        title={t('重新跟进')}
        className="flex-none rounded p-1 text-muted transition-colors hover:bg-paper-2 hover:text-ink"
      >
        <RotateCcw size={12} />
      </button>
    </div>
  );
}
