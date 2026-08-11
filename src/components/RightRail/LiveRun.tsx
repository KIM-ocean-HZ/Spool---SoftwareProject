import { useEffect, useRef } from 'react';
import { useT } from '@/lib/i18n';
import { ACTION_LABEL, useEngineStore } from '@/stores/engineStore';

// DESIGN_WORKBENCH §9.3 #4 — W4, and the surface Ocean's second round put at the centre of
// the whole rail: 「整个 ui 界面应该以 ai 的流式进度……这些有用信息为主体」, and
// 「放在最底下按 block 显示，不行……要像 vscode 的 ai 插件，正在打字的效果」.
//
// It renders only while something is running, and while it runs it takes the room. Nothing
// else in this rail earns space that way — the buttons are all one click, and this is the
// several minutes in between that used to be a blank panel.
//
// The stop control lives in this card rather than in a corner: the run is what you are
// looking at, so stopping it is the one thing you might want to do to it.
export default function LiveRun() {
  const t = useT();
  const current = useEngineStore((s) => s.current);
  const progress = useEngineStore((s) => s.progress);
  const queue = useEngineStore((s) => s.queue);
  const cancel = useEngineStore((s) => s.cancel);

  // Follow the text as it arrives, the way a terminal does. Reading the tail is the point:
  // scrolling back through a half-finished draft is not something anyone wants to do while
  // it is still being written.
  const tailRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = tailRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [progress?.text]);

  if (!current) return null;
  const typed = progress?.text.trim() ?? '';

  return (
    <section className="rounded-md border border-accent/40 bg-accent-soft/40 px-2.5 py-2">
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate text-xs text-accent">
          {current.threadTitle
            ? t('{action} · {project}', {
                action: t(ACTION_LABEL[current.action]),
                project: current.threadTitle,
              })
            : t(ACTION_LABEL[current.action])}
        </span>
        <button
          type="button"
          onClick={() => void cancel()}
          title={t('点一下停下来（已经写进去的块会留着）')}
          className="flex-none rounded border border-accent/50 px-1.5 py-0.5 text-[12px] text-accent transition-colors hover:bg-accent/15"
        >
          {t('停下')}
        </button>
      </div>

      {/* The caption. Before any tool call there is nothing honest to say beyond "it is
          going", so that is what it says — the pulse carries the rest. */}
      <div className="mt-1 flex items-center gap-1.5 text-[12px] text-muted">
        <span className="h-1.5 w-1.5 flex-none animate-pulse rounded-full bg-accent" aria-hidden />
        <span className="truncate">{progress?.caption ? t(progress.caption) : t('正在想…')}</span>
        {queue.length > 0 && (
          <span className="flex-none">· {t('还排着 {n} 个', { n: queue.length })}</span>
        )}
      </div>

      {typed && (
        <div
          ref={tailRef}
          className="mt-1.5 max-h-48 overflow-y-auto whitespace-pre-wrap border-t border-accent/20 pt-1.5 text-[13px] leading-relaxed text-ink-2"
        >
          {typed}
          {/* A caret, so a pause between chunks reads as "still typing" rather than as
              "stopped halfway". */}
          <span className="ml-px inline-block h-[1em] w-[1px] animate-pulse bg-accent align-text-bottom" />
        </div>
      )}
    </section>
  );
}
