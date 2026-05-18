import { File, Folder, Link as LinkIcon, X } from 'lucide-react';
import type { Attachment } from '@/lib/db/attachments';
import { openTarget } from '@/lib/utils/openTarget';
import { toast } from '@/stores/toastStore';

interface Props {
  attachments: readonly Attachment[];
  // Omitted in read-only contexts (the digest view) — without it no detach control renders.
  onDetach?: (attachmentId: string) => void;
}

// Per PLAN_EN.md §9.6: an attachment renders as a chip on its block. Icon picked by
// kind, click opens with the OS default app / Finder / browser via the Rust
// `open_target` command; a missing target surfaces a toast (§14.4) instead of
// crashing — the block and the attachment record are kept.
export default function BlockAttachments({ attachments, onDetach }: Props) {
  if (attachments.length === 0) return null;

  const handleOpen = async (a: Attachment): Promise<void> => {
    try {
      await openTarget(a.target);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg || '无法打开附件');
    }
  };

  return (
    <ul className="mt-1.5 flex flex-wrap gap-1.5">
      {attachments.map((a) => {
        const label = a.label.trim() || a.target;
        const Icon = a.kind === 'folder' ? Folder : a.kind === 'url' ? LinkIcon : File;
        return (
          <li key={a.id} className="group/chip relative">
            <button
              type="button"
              onClick={() => void handleOpen(a)}
              title={a.target}
              className={`flex max-w-[260px] items-center gap-1 rounded-full border border-line bg-paper-2/60 py-0.5 pl-1.5 font-ui text-[11px] text-ink-2 transition-colors hover:border-accent hover:text-accent ${
                onDetach ? 'pr-5' : 'pr-2.5'
              }`}
            >
              <Icon size={10} className="flex-none" />
              <span className="truncate">{label}</span>
            </button>
            {onDetach && (
              <button
                type="button"
                onClick={() => onDetach(a.id)}
                title="移除附件"
                className="absolute right-0.5 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-muted opacity-0 transition-opacity hover:text-accent group-hover/chip:opacity-100"
              >
                <X size={9} />
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}
