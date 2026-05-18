import { File, Folder, Link as LinkIcon } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useEffect } from 'react';
import type { Attachment, AttachmentKind } from '@/lib/db/attachments';
import type { Block } from '@/lib/db/blocks';
import type { Thread } from '@/lib/db/threads';
import { openTarget } from '@/lib/utils/openTarget';
import { useBlocksStore } from '@/stores/blocksStore';
import { toast } from '@/stores/toastStore';
import BlockItem from './BlockItem';

const EMPTY_ATTACHMENTS: readonly Attachment[] = [];

interface Props {
  thread: Thread;
  blocks: readonly Block[];
  attachmentsByBlock: Record<string, Attachment[]>;
  onShowLog: () => void;
}

// Files & Links is grouped by kind in a fixed order (PLAN_EN.md §11.2).
const KIND_ORDER: AttachmentKind[] = ['file', 'folder', 'url'];
const KIND_ICON: Record<AttachmentKind, LucideIcon> = {
  file: File,
  folder: Folder,
  url: LinkIcon,
};

// The `done`-thread view (PLAN_EN.md §11.2). Strict hierarchy, top to bottom:
//   1. the conclusion summary — decoration, shown only when present;
//   2. pinned blocks with their attachments — structural, always shown, read-only;
//   3. every attachment in the thread, aggregated into one Files & Links list.
export default function DigestView({ thread, blocks, attachmentsByBlock, onShowLog }: Props) {
  const load = useBlocksStore((s) => s.load);

  // A `done` thread routes straight here, so DigestView — not BlockFeed — is what
  // hydrates this thread's blocks + attachments on open.
  useEffect(() => {
    void load(thread.id);
  }, [thread.id, load]);

  const digest = thread.digest?.trim() || null;
  const pinned = blocks.filter((b) => b.pinned);
  const attachments = blocks.flatMap((b) => attachmentsByBlock[b.id] ?? []);

  // §14.5: no pins, no attachments, no conclusion — there is nothing to digest.
  if (pinned.length === 0 && attachments.length === 0 && !digest) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="max-w-sm text-center">
          <p className="text-sm text-muted">这个项目没有标记重点。要看完整记录吗？</p>
          <button
            type="button"
            onClick={onShowLog}
            className="mt-3 rounded-md border border-line-strong bg-paper px-3 py-1.5 text-xs text-ink transition-colors hover:border-accent hover:text-accent"
          >
            看完整记录
          </button>
        </div>
      </div>
    );
  }

  const sortedAttachments = KIND_ORDER.flatMap((kind) =>
    attachments.filter((a) => a.kind === kind),
  );

  const handleOpen = async (target: string): Promise<void> => {
    try {
      await openTarget(target);
    } catch (e) {
      // §14.4: a missing target is non-fatal — surface a toast and keep going.
      toast.error(e instanceof Error ? e.message : '无法打开附件');
    }
  };

  return (
    <div className="flex-1 overflow-y-auto px-6 py-4">
      <div className="flex flex-col gap-6">
        {/* 1. Conclusion — decoration; rendered only when present, never a placeholder. */}
        {digest && (
          <section>
            <div className="mb-1 text-[11px] text-muted">结论</div>
            <p className="whitespace-pre-wrap rounded-md border border-line bg-paper-2/50 px-4 py-3 font-ui text-sm leading-[1.6] text-ink">
              {digest}
            </p>
          </section>
        )}

        {/* 2. Pinned blocks — structural, always shown, read-only. */}
        {pinned.length > 0 && (
          <section>
            <div className="mb-2 text-[11px] text-muted">重点</div>
            <div className="space-y-2">
              {pinned.map((b) => (
                <BlockItem
                  key={b.id}
                  block={b}
                  attachments={attachmentsByBlock[b.id] ?? EMPTY_ATTACHMENTS}
                  readOnly
                />
              ))}
            </div>
          </section>
        )}

        {/* 3. Files & Links — every attachment in the thread, files → folders → URLs. */}
        {sortedAttachments.length > 0 && (
          <section>
            <div className="mb-2 text-[11px] text-muted">文件与链接</div>
            <ul className="flex flex-col gap-1">
              {sortedAttachments.map((a) => {
                const Icon = KIND_ICON[a.kind];
                return (
                  <li key={a.id}>
                    <button
                      type="button"
                      onClick={() => void handleOpen(a.target)}
                      title={a.target}
                      className="flex w-full items-center gap-2 rounded-md border border-line bg-paper px-3 py-1.5 text-left text-[13px] text-ink-2 transition-colors hover:border-accent hover:text-accent"
                    >
                      <Icon size={13} className="flex-none" />
                      <span className="truncate">{a.label.trim() || a.target}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}
