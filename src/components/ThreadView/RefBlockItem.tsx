import { AtSign, Trash2 } from 'lucide-react';
import { useT } from '@/lib/i18n';
import { useState } from 'react';
import type { Block } from '@/lib/db/blocks';
import { formatBlockTime } from '@/lib/utils/time';
import { useThreadsStore } from '@/stores/threadsStore';

interface Props {
  block: Block;
  readOnly?: boolean;
  onDelete?: () => void;
}

// Phase 10: render a kind=ref block as a clickable line to the referenced thread.
// Live title comes from the threads store so renames propagate; if the referenced
// thread is gone (deleted / outside any loaded workspace), we fall back to the
// snapshot in block.content and surface a "(已删除)" hint.
export default function RefBlockItem({ block, readOnly, onDelete }: Props) {
  const t = useT();
  const [hovered, setHovered] = useState(false);

  const liveTitle = useThreadsStore((s) => {
    if (!block.refThreadId) return null;
    for (const list of Object.values(s.threadsByWorkspace)) {
      const th = list.find((x) => x.id === block.refThreadId);
      // Untitled falls through as '' so the render layer applies the localized fallback.
      if (th) return th.title || '';
    }
    return null;
  });
  const select = useThreadsStore((s) => s.select);

  const title = liveTitle ?? block.content?.trim() ?? '';
  const missing = liveTitle === null;

  const navigate = (): void => {
    if (missing || !block.refThreadId) return;
    select(block.refThreadId);
  };

  return (
    <article
      data-block-id={block.id}
      onMouseEnter={readOnly ? undefined : () => setHovered(true)}
      onMouseLeave={readOnly ? undefined : () => setHovered(false)}
      className="group relative rounded-md border border-line/60 bg-paper/40 px-3.5 py-2"
    >
      <div className="flex items-center gap-2 text-[10px] text-muted">
        <time className="font-mono">{formatBlockTime(block.createdAt)}</time>
        <span className="text-muted">{t('引用脉络')}</span>
        {!readOnly && onDelete && (
          <div
            className={`ml-auto transition-opacity ${
              hovered ? 'opacity-100' : 'pointer-events-none opacity-0'
            }`}
          >
            <button
              type="button"
              onClick={onDelete}
              title={t('删除')}
              className="rounded p-1 text-muted hover:bg-paper-2 hover:text-accent"
            >
              <Trash2 size={11} />
            </button>
          </div>
        )}
      </div>
      <button
        type="button"
        onClick={navigate}
        disabled={missing}
        title={missing ? t('原脉络已删除') : t('跳转到这条脉络')}
        className="mt-0.5 flex items-center gap-1.5 text-left text-[15px] text-accent transition-colors hover:underline disabled:cursor-default disabled:text-muted disabled:no-underline"
      >
        <AtSign size={14} className="flex-none" />
        <span className="truncate">{title || t('（无标题）')}</span>
        {missing && <span className="text-[11px] text-muted">（已删除）</span>}
      </button>
    </article>
  );
}
