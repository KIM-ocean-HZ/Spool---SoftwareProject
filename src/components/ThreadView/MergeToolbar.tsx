import { Merge, X } from 'lucide-react';
import { useState } from 'react';
import { useBlocksStore } from '@/stores/blocksStore';

// v2.8 §20.1: floating toolbar that appears when ≥1 block is selected for merge.
// "合并" only enables at ≥2; "取消" drops the selection without merging (deliberately
// not "清除" — that label is reserved for destructive data-wipe actions and would read
// ambiguously here). A confirm gate sits in front of the actual merge — no undo in v1.
export default function MergeToolbar() {
  const selectedBlockIds = useBlocksStore((s) => s.selectedBlockIds);
  const clearSelection = useBlocksStore((s) => s.clearSelection);
  const mergeBlocks = useBlocksStore((s) => s.mergeBlocks);
  const [merging, setMerging] = useState(false);

  const count = selectedBlockIds.size;
  if (count === 0) return null;

  const canMerge = count >= 2;

  const handleMerge = async (): Promise<void> => {
    if (!canMerge || merging) return;
    if (!window.confirm(`合并 ${count} 个 block 为一个？此操作无法自动撤销。`)) return;
    setMerging(true);
    try {
      await mergeBlocks([...selectedBlockIds]);
    } finally {
      setMerging(false);
    }
  };

  return (
    <div className="pointer-events-none sticky bottom-3 z-10 flex justify-center">
      <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-line-strong bg-paper px-3 py-1.5 text-[12px] font-ui text-ink shadow-md">
        <span className="text-muted">
          已选 <span className="font-mono text-ink">{count}</span> 个
        </span>
        <span className="h-3 w-px bg-line" />
        <button
          type="button"
          onClick={() => void handleMerge()}
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
