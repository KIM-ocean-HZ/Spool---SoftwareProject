import { Globe, Loader2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useT } from '@/lib/i18n';
import { setFollowUpBrief } from '@/lib/db/threads';
import type { Thread } from '@/lib/db/threads';
import { useEngineStore } from '@/stores/engineStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { useThreadsStore } from '@/stores/threadsStore';
import { toast } from '@/stores/toastStore';

// DESIGN_FOLLOW_UP §3.2 / §6-2 — where the user reads and settles the follow-up brief.
//
// The brief is the search rules, and Ocean's decision on 2026-08-06 was that a human must
// have read them before anything runs on them: "brief 就是搜索规则，让用户看一眼是这个功能
// 唯一能让他产生控制感的地方". So the AI drafts into this box and stops. Nothing about this
// project reaches the open web until the button below is pressed.
//
// The panel is also the off switch (§3.2): clearing the text and saving stores NULL, and a
// NULL brief means follow-up does not exist for this project.

interface Props {
  thread: Thread;
  onClose: () => void;
}

export default function FollowUpPanel({ thread, onClose }: Props) {
  const t = useT();
  const [text, setText] = useState(thread.followUpBrief ?? '');
  const [drafting, setDrafting] = useState(false);
  const [saving, setSaving] = useState(false);
  const enqueue = useEngineStore((s) => s.enqueue);
  const timeoutSecs = useSettingsStore((s) => s.aiEngineTimeoutSecs);
  const loadAll = useThreadsStore((s) => s.loadAll);

  useEffect(() => {
    const h = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const draft = (): void => {
    // Runs through the same serial queue as everything else — the engine allows exactly one
    // process at a time, so bypassing the queue here would fail whenever anything else runs.
    const queued = enqueue(thread.id, thread.title, 'follow_up_brief', timeoutSecs, (result) => {
      setDrafting(false);
      const draftText = result.trim();
      // Replacing what the user typed would lose their edits, so a draft only fills an
      // empty box; otherwise it goes underneath as something to merge by hand.
      setText((prev) => (prev.trim().length === 0 ? draftText : `${prev.trim()}\n${draftText}`));
    });
    if (queued) setDrafting(true);
  };

  const save = async (): Promise<void> => {
    setSaving(true);
    try {
      await setFollowUpBrief(thread.id, text);
      await loadAll();
      toast.notice(text.trim() ? t('跟进目标已定好') : t('已关掉这个项目的跟进'));
      onClose();
    } catch (e) {
      toast.error(t('存不下来：{msg}', { msg: e instanceof Error ? e.message : String(e) }));
    } finally {
      setSaving(false);
    }
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
              {t('这个项目要盯什么')}
            </h2>
            <p className="mt-0.5 text-xs text-muted">
              {t('写清楚要盯的几件事。以后每次「找找新进展」，AI 就照这几行出去查——它只找这几行说的东西。')}
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
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            placeholder={t('一行一件事。比如：CMU 的申请截止日期和 GRE 要求有没有变。')}
            className="w-full resize-none rounded border border-line bg-paper-2/30 px-2.5 py-2 text-xs leading-relaxed text-ink outline-none focus:border-accent"
          />
          <div className="mt-2 flex items-center gap-2">
            <button
              type="button"
              onClick={draft}
              disabled={drafting}
              className="flex items-center gap-1.5 rounded border border-line bg-paper px-2.5 py-1 text-[11px] text-ink-2 transition-colors enabled:hover:border-accent enabled:hover:text-accent disabled:text-muted"
            >
              {drafting && <Loader2 size={11} className="animate-spin" />}
              {drafting ? t('AI 在读这个项目…') : t('让 AI 起个草')}
            </button>
            <span className="text-[10px] text-muted">{t('起草只读你库里的东西，不联网。')}</span>
          </div>
        </div>

        <div className="flex flex-none items-center gap-2 border-t border-line px-5 py-3">
          <button
            type="button"
            disabled={saving}
            onClick={() => void save()}
            className="flex-1 rounded-md border border-accent/60 bg-accent-soft px-3 py-1.5 text-xs font-medium text-accent transition-colors enabled:hover:border-accent enabled:hover:bg-accent/15 disabled:opacity-40"
          >
            {t('就按这个找')}
          </button>
          {thread.followUpBrief && (
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                setText('');
                void setFollowUpBrief(thread.id, null).then(async () => {
                  await loadAll();
                  toast.notice(t('已关掉这个项目的跟进'));
                  onClose();
                });
              }}
              title={t('清空就等于关掉跟进')}
              className="flex-none rounded-md border border-line bg-paper px-3 py-1.5 text-xs text-muted transition-colors enabled:hover:border-line-strong enabled:hover:text-ink"
            >
              {t('关掉跟进')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
