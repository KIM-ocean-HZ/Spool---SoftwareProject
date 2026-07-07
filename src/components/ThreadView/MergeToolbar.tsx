import { Copy, Merge, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
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
  const selectedBlockIds = useBlocksStore((s) => s.selectedBlockIds);
  const clearSelection = useBlocksStore((s) => s.clearSelection);
  const mergeBlocks = useBlocksStore((s) => s.mergeBlocks);
  const forwardToThread = useBlocksStore((s) => s.forwardToThread);
  const [merging, setMerging] = useState(false);
  // Inline two-step confirm (the DeleteButton pattern) instead of window.confirm —
  // the only native OS dialog the app had, visually foreign to everything else.
  const [confirmingMerge, setConfirmingMerge] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const pillRef = useRef<HTMLDivElement>(null);

  const count = selectedBlockIds.size;

  // Selection changed under the armed confirm (a block was added/removed): the count in
  // the question is stale, so disarm rather than confirm something the user didn't read.
  useEffect(() => {
    setConfirmingMerge(false);
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

  const handleForward = async (picked: PickedThread): Promise<void> => {
    setPickerOpen(false);
    const n = await forwardToThread([...selectedBlockIds], picked.threadId);
    if (n > 0) {
      // Empty patch = touch updated_at, so the target thread rises in the sidebar's
      // recency order (same idiom as the redirect / collect-send paths).
      void useThreadsStore.getState().patch(picked.threadId, {});
      toast.notice(`已复制 ${n} 个块到「${picked.workspaceTitle} / ${picked.threadTitle}」`);
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
          已选 <span className="font-mono text-ink">{count}</span> 个
        </span>
        <span className="h-3 w-px bg-line" />
        {confirmingMerge ? (
          <span className="flex items-center gap-1.5">
            <span className="text-ink">合并 {count} 个为一个？可 ⌘Z 撤销</span>
            <button
              type="button"
              onClick={() => void handleMerge()}
              className="rounded-full px-2 py-0.5 text-accent transition-colors hover:bg-accent/10"
            >
              确认
            </button>
            <button
              type="button"
              onClick={() => setConfirmingMerge(false)}
              className="rounded-full px-2 py-0.5 text-muted transition-colors hover:bg-paper-2 hover:text-ink"
            >
              再想想
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingMerge(true)}
            disabled={!canMerge || merging}
            className={`flex items-center gap-1 rounded-full px-2 py-0.5 transition-colors ${
              canMerge && !merging
                ? 'text-accent hover:bg-accent/10'
                : 'cursor-not-allowed text-muted'
            }`}
            title={canMerge ? '合并所选 block' : '至少选择两个 block 才能合并'}
          >
            <Merge size={12} />
            {merging ? '合并中…' : '合并'}
          </button>
        )}
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          className={`flex items-center gap-1 rounded-full px-2 py-0.5 transition-colors ${
            pickerOpen ? 'bg-accent/10 text-accent' : 'text-ink hover:bg-paper-2'
          }`}
          title="复制所选 block 到另一个脉络"
        >
          <Copy size={12} />
          复制到…
        </button>
        <button
          type="button"
          onClick={() => clearSelection()}
          className="flex items-center gap-1 rounded-full px-2 py-0.5 text-muted transition-colors hover:bg-paper-2 hover:text-ink"
          title="取消选择"
        >
          <X size={12} />
          取消
        </button>
      </div>
    </div>
  );
}
