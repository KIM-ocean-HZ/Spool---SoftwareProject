import { Copy, Merge, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useT } from '@/lib/i18n';
import { useBlocksStore } from '@/stores/blocksStore';
import { useThreadsStore } from '@/stores/threadsStore';
import { toast } from '@/stores/toastStore';
import ThreadPicker, { type PickedThread } from './ThreadPicker';

interface Props {
  // The currently-viewed thread — the source of the selection, excluded from the forward
  // picker so a copy always lands in another thread.
  threadId: string;
}

// v2.8 §20.1: floating toolbar that appears when ≥1 block is selected. "合并" only enables at
// ≥2; "复制到…" (§20.1 forward) is available at ≥1 — it COPIES the selection into another
// thread (additive; originals untouched). "取消" drops the selection without merging
// (deliberately not "清除" — that label is reserved for destructive data-wipe actions). A
// confirm gate sits in front of the merge; v2.9 §9.13 makes both merge and forward reversible
// via Cmd+Z, so the merge confirm copy advertises it.
export default function MergeToolbar({ threadId }: Props) {
  const t = useT();
  const selectedBlockIds = useBlocksStore((s) => s.selectedBlockIds);
  const clearSelection = useBlocksStore((s) => s.clearSelection);
  const mergeBlocks = useBlocksStore((s) => s.mergeBlocks);
  const forwardToThread = useBlocksStore((s) => s.forwardToThread);
  const removeBlock = useBlocksStore((s) => s.remove);
  const [merging, setMerging] = useState(false);
  const [deleting, setDeleting] = useState(false);
  // Inline two-step confirm (the DeleteButton pattern) instead of window.confirm —
  // the only native OS dialog the app had, visually foreign to everything else.
  const [confirmingMerge, setConfirmingMerge] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pillRef = useRef<HTMLDivElement>(null);

  const count = selectedBlockIds.size;

  // Selection changed under an armed confirm (a block was added/removed): the count in
  // the question is stale, so disarm rather than confirm something the user didn't read.
  useEffect(() => {
    setConfirmingMerge(false);
    setConfirmingDelete(false);
  }, [count]);

  // Close the picker on a click outside the toolbar pill (the picker renders inside it, so a
  // click on the picker or its toggle never closes it; Esc inside the picker also closes).
  useEffect(() => {
    if (!pickerOpen) return;
    const onDown = (e: MouseEvent): void => {
      if (pillRef.current && !pillRef.current.contains(e.target as Node)) setPickerOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [pickerOpen]);

  if (count === 0) return null;

  const canMerge = count >= 2;

  const handleMerge = async (): Promise<void> => {
    if (!canMerge || merging) return;
    setConfirmingMerge(false);
    setMerging(true);
    try {
      await mergeBlocks([...selectedBlockIds]);
    } finally {
      setMerging(false);
    }
  };

  // Batch delete = the single-block remove per id, so each block gets its own §9.13
  // delete-undo entry — ⌘Z walks them back newest-first, one at a time.
  const handleDelete = async (): Promise<void> => {
    if (deleting) return;
    setConfirmingDelete(false);
    setDeleting(true);
    try {
      const ids = [...selectedBlockIds];
      for (const id of ids) await removeBlock(id);
      clearSelection();
      toast.notice(t('已删除 {n} 个块', { n: ids.length }));
    } finally {
      setDeleting(false);
    }
  };

  const handleForward = async (picked: PickedThread): Promise<void> => {
    setPickerOpen(false);
    const n = await forwardToThread([...selectedBlockIds], picked.threadId);
    if (n > 0) {
      // Empty patch = touch updated_at, so the target thread rises in the sidebar's
      // recency order (same idiom as the redirect path).
      void useThreadsStore.getState().patch(picked.threadId, {});
      toast.notice(t('已复制 {n} 个块到「{target}」', { n, target: `${picked.workspaceTitle} / ${picked.threadTitle}` }));
    }
  };

  return (
    <div className="pointer-events-none sticky bottom-3 z-10 flex justify-center">
      <div
        ref={pillRef}
        className="pointer-events-auto relative flex items-center gap-2 rounded-full border border-line-strong bg-paper px-3 py-1.5 text-[12px] font-ui text-ink shadow-md"
      >
        {pickerOpen && (
          <div className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2">
            <ThreadPicker
              excludeThreadId={threadId}
              onPick={(p) => void handleForward(p)}
              onCancel={() => setPickerOpen(false)}
            />
          </div>
        )}
        <span className="text-muted">
          {t('已选')} <span className="font-mono text-ink">{count}</span>{t('个')}
        </span>
        <span className="h-3 w-px bg-line" />
        {confirmingMerge ? (
          <span className="flex items-center gap-1.5">
            <span className="text-ink">{t('合并 {n} 个为一个？可 ⌘Z 撤销', { n: count })}</span>
            <button
              type="button"
              onClick={() => void handleMerge()}
              className="rounded-full px-2 py-0.5 text-accent transition-colors hover:bg-accent/10"
            >
              {t('确认')}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingMerge(false)}
              className="rounded-full px-2 py-0.5 text-muted transition-colors hover:bg-paper-2 hover:text-ink"
            >
              {t('再想想')}
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => {
              setConfirmingDelete(false);
              setConfirmingMerge(true);
            }}
            disabled={!canMerge || merging}
            className={`flex items-center gap-1 rounded-full px-2 py-0.5 transition-colors ${
              canMerge && !merging
                ? 'text-accent hover:bg-accent/10'
                : 'cursor-not-allowed text-muted'
            }`}
            title={canMerge ? t('合并所选 block') : t('至少选择两个 block 才能合并')}
          >
            <Merge size={12} />
            {merging ? t('合并中…') : t('合并')}
          </button>
        )}
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          className={`flex items-center gap-1 rounded-full px-2 py-0.5 transition-colors ${
            pickerOpen ? 'bg-accent/10 text-accent' : 'text-ink hover:bg-paper-2'
          }`}
          title={t('复制所选 block 到另一个脉络')}
        >
          <Copy size={12} />
          {t('复制到…')}
        </button>
        {confirmingDelete ? (
          <span className="flex items-center gap-1.5">
            <span className="text-ink">{t('删除 {n} 个块？⌘Z 可逐个撤回', { n: count })}</span>
            <button
              type="button"
              onClick={() => void handleDelete()}
              className="rounded-full px-2 py-0.5 transition-colors hover:bg-paper-2"
              style={{ color: 'var(--urgent)' }}
            >
              {t('确认')}
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(false)}
              className="rounded-full px-2 py-0.5 text-muted transition-colors hover:bg-paper-2 hover:text-ink"
            >
              {t('再想想')}
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => {
              setConfirmingMerge(false);
              setConfirmingDelete(true);
            }}
            disabled={deleting}
            className={`flex items-center gap-1 rounded-full px-2 py-0.5 transition-colors ${
              deleting ? 'cursor-not-allowed text-muted' : 'text-muted hover:bg-paper-2 hover:text-ink'
            }`}
            title={t('删除所选 block')}
          >
            <Trash2 size={12} />
            {deleting ? t('删除中…') : t('删除')}
          </button>
        )}
        <button
          type="button"
          onClick={() => clearSelection()}
          className="flex items-center gap-1 rounded-full px-2 py-0.5 text-muted transition-colors hover:bg-paper-2 hover:text-ink"
          title={t('取消选择')}
        >
          <X size={12} />
          {t('取消')}
        </button>
      </div>
    </div>
  );
}
