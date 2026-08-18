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
  const [draftStanding, setDraftStanding] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [showAnswered, setShowAnswered] = useState(false);
  const enqueue = useEngineStore((s) => s.enqueue);
  const timeoutSecs = useSettingsStore((s) => s.aiEngineTimeoutSecs);
  // ⚠️ Ocean, Windows 验收 2026-08-18 #5: 「ai 定一个问题的按键不应该存在，点击会报错没有 CLI,
  // 应该跟随 AI 引擎的判断」. Drafting runs a local CLI, and on a machine without one the
  // button was a control whose only outcome was an error — the same shape as the 周回顾 entry
  // he had removed the day before. Withheld, not disabled: a greyed button sends people
  // hunting for a switch that turns it on, and there is none.
  const engineStatus = useEngineStore((s) => s.status);
  const probeEngine = useEngineStore((s) => s.probe);
  const engineAvailable = engineStatus?.available === true;

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

  // The rail is where detection usually runs, and the rail is collapsed by default — so this
  // panel can be the first thing to ask. Without it 「没有引擎」 would be indistinguishable
  // from 「还没查过」, and the drafting button would be missing on a machine that has one.
  useEffect(() => {
    if (engineStatus === null) void probeEngine();
  }, [engineStatus, probeEngine]);

  useEffect(() => {
    const h = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const commitDraft = (): void => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    void add(text, draftStanding);
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
              {t('一行一件事，AI 以后就照这几行去查。「单次跟进」查到答案就结束；「永久跟进」会一直查下去，只有你能结束。')}
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
              // Opening the retired group on a close is the whole feedback for the action:
              // without it a row the user just clicked simply vanishes, and where it went is
              // behind a collapsed summary they have no reason to open.
              <ItemRow key={item.id} item={item} onClosed={() => setShowAnswered(true)} />
            ))}
          </div>

          {/* Adding uses the SAME picker the rows use, and that is the point of it being here:
              it used to be two buttons, 「加上」 and 「永久跟进」 — one an action, the other a
              kind — so the kind read as a second way to save rather than as a property of the
              line. Choosing it here is what teaches that the same control on a row is
              something you can press. */}
          <div className="mt-2 rounded border border-line bg-paper-2/30 px-2.5 py-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                // ⚠️ Never while composing: Enter is how an IME accepts its candidate, and
                // stealing it would make the box unusable for typing Chinese (lib/utils/ime).
                if (isImeComposing(e.nativeEvent)) return;
                if (e.key !== 'Enter' || e.shiftKey) return;
                e.preventDefault();
                commitDraft();
              }}
              rows={2}
              placeholder={t('再加一条。比如：我在用的这个工具出没出新版本，有没有不兼容的改动。')}
              className="w-full resize-none bg-transparent text-xs leading-relaxed text-ink outline-none"
            />
            <div className="mt-1 flex items-center justify-between gap-2">
              <KindPicker standing={draftStanding} onPick={setDraftStanding} />
              <button
                type="button"
                onClick={commitDraft}
                disabled={!draft.trim()}
                className="flex-none rounded border border-line bg-paper px-2.5 py-1 text-[11px] text-ink-2 transition-colors enabled:hover:border-accent enabled:hover:text-accent disabled:text-muted"
              >
                {t('加上')}
              </button>
            </div>
          </div>
          <p className="mt-1 text-[10px] text-muted">
            {t('回车＝加一条；⇧回车在同一条里换行。')}
          </p>

          {/* The drafting step is a LOCAL-CLI action. With no engine on the machine there is
              nothing to withhold it from doing — the lines still work, they are just carried
              out by whatever AI the user talks to through MCP, which is what the sentence
              below says instead of leaving the absence unexplained. */}
          {engineAvailable ? (
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
          ) : (
            <p className="mt-2 text-[10px] leading-relaxed text-muted">
              {t('这台电脑上没有本机 AI 引擎，所以 Spool 自己不会去查这几行。接了 MCP 的 AI（Claude、ChatGPT 里的 Codex 等）读得到它们，也能替你加一条、结束一条。')}
            </p>
          )}

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
                  ? t('收起不再跟进的')
                  : t('不再跟进的（{n}）', { n: answered.length })}
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
          {/* Same rule one level up: with no engine detected this row could only say
              「没检测到引擎」 — a picker for a choice that does not exist. */}
          {engineAvailable && (
            <div className="mt-3 border-t border-line pt-3">
              <EngineBar />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** 单次 / 永久 as a two-option picker, in both places a kind is chosen.
 *
 *  ⚠️ Ocean 2026-08-17: 「我根本没看出来单次跟进是个按钮可以点击」. It used to be one chip
 *  showing the CURRENT kind, and a lone label naming a state cannot also say that it is
 *  pressable — worse, the half it hid (that a line can be permanent) is the half that
 *  explains the feature. Showing both options costs one row and removes the guess: what is
 *  highlighted is what this line IS, the other one is what pressing would make it.
 */
function KindPicker({
  standing,
  onPick,
}: {
  standing: boolean;
  onPick: (standing: boolean) => void;
}) {
  const t = useT();
  const option = (value: boolean, label: string, title: string) => (
    <button
      type="button"
      role="radio"
      aria-checked={standing === value}
      title={title}
      onClick={() => {
        if (standing !== value) onPick(value);
      }}
      className={`px-1.5 py-0.5 text-[10px] transition-colors ${value ? 'border-l border-line' : ''} ${
        standing === value
          ? 'bg-accent-soft text-accent'
          : 'bg-paper text-muted hover:bg-paper-2 hover:text-ink-2'
      }`}
    >
      {label}
    </button>
  );
  return (
    <div
      role="radiogroup"
      aria-label={t('这一条跟进到什么时候')}
      className="flex flex-none overflow-hidden rounded border border-line"
    >
      {option(false, t('单次跟进'), t('查到答案就结束——AI 替你查到了，也可以替你结束它'))}
      {option(true, t('永久跟进'), t('一直查下去。AI 结束不了它，只有你能'))}
    </div>
  );
}

/** One live line: editable in place, with the kind that decides whether an AI may ever
 *  close it, and the two ways it can leave the list. */
function ItemRow({ item, onClosed }: { item: FollowUpItem; onClosed: () => void }) {
  const t = useT();
  const edit = useFollowUpStore((s) => s.edit);
  const setStanding = useFollowUpStore((s) => s.setStanding);
  const close = useFollowUpStore((s) => s.close);
  const remove = useFollowUpStore((s) => s.remove);
  const restore = useFollowUpStore((s) => s.restore);
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
      <div className="mt-1 flex items-center justify-between gap-2">
        <KindPicker standing={item.standing} onPick={(v) => void setStanding(item.id, v)} />
        <div className="flex flex-none items-center gap-1">
          {/* ⚠️ Ocean 2026-08-17: 「用户无法意识到这是任务被解决了」. A bare ✓ was carrying the
              one action in the panel nobody expects to exist, behind a tooltip. It says what
              it does now — and says it differently per kind, because 「已解决」 is a lie on a
              standing watch: what that kind watches is whether something CHANGES, so finding
              out today's answer never finishes it. Both still retire the row; only the
              sentence the user is agreeing to differs. */}
          <button
            type="button"
            onClick={() => {
              void close(item.id);
              onClosed();
            }}
            title={
              item.standing
                ? t('不用再跟进了，收进下面「不再跟进的」，随时能重新跟进')
                : t('这条已经有答案了，收进下面「不再跟进的」，随时能重新跟进')
            }
            className="flex items-center gap-1 rounded border border-line bg-paper px-1.5 py-0.5 text-[10px] text-ink-2 transition-colors hover:border-accent hover:text-accent"
          >
            <Check size={11} className="flex-none" />
            {item.standing ? t('结束跟进') : t('已解决')}
          </button>
          {/* Deleting is the one thing here that leaves nothing behind, so it is the one
              thing that gets a way back (Ocean 2026-08-17). A confirmation dialog was the
              other option and it is the worse one: it charges every deletion for the one
              that was a mistake, on a list meant to be pruned freely. */}
          <button
            type="button"
            onClick={() =>
              void (async () => {
                const gone = await remove(item.id);
                if (gone) toast.undo(t('删掉了'), t('撤销'), () => void restore(gone));
              })()
            }
            title={t('不跟进这个了，直接删掉')}
            aria-label={t('不跟进这个了，直接删掉')}
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
      {/* Same reason the close button carries words now: this is the way back, and a bare
          ↺ leaves the user guessing whether retiring a line was reversible at all. */}
      <button
        type="button"
        onClick={() => void reopen(item.id)}
        className="flex flex-none items-center gap-1 rounded border border-line bg-paper px-1.5 py-0.5 text-[10px] text-muted transition-colors hover:border-accent hover:text-accent"
      >
        <RotateCcw size={11} className="flex-none" />
        {t('重新跟进')}
      </button>
    </div>
  );
}
