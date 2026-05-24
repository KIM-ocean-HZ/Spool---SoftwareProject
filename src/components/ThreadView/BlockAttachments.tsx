import { ChevronDown, ChevronRight, File, Folder, Link as LinkIcon, X } from 'lucide-react';
import { useState } from 'react';
import type { Attachment } from '@/lib/db/attachments';
import { openTarget } from '@/lib/utils/openTarget';
import { toast } from '@/stores/toastStore';

interface Props {
  attachments: readonly Attachment[];
  // Omitted in read-only contexts (the digest view) — without it no detach control renders.
  onDetach?: (attachmentId: string) => void;
  // v2.8 §20.2: toggle per-attachment opt-in for inlining extracted_text into pack /
  // summaries. Omitted in read-only contexts; only rendered on chips with extracted text.
  onSetIncludeInPack?: (attachmentId: string, value: boolean) => void;
}

// Per PLAN_EN.md §9.6: an attachment renders as a chip on its block. Icon picked by
// kind, click opens with the OS default app / Finder / browser via the Rust
// `open_target` command; a missing target surfaces a toast (§14.4) instead of
// crashing — the block and the attachment record are kept.
//
// Beyond §9.6 (extracted text was originally pack-only "silent backing storage"): chips
// whose attachment carries auto-extracted text gain a chevron that expands an inline,
// read-only text preview below the chip row. The chip's open-in-native-app click is
// unchanged; the chevron is a separate control.
export default function BlockAttachments({ attachments, onDetach, onSetIncludeInPack }: Props) {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(() => new Set());

  if (attachments.length === 0) return null;

  const handleOpen = async (a: Attachment): Promise<void> => {
    try {
      await openTarget(a.target);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(msg || '无法打开附件');
    }
  };

  const toggle = (id: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const hasText = (a: Attachment): boolean =>
    a.extractedText !== null && a.extractedText.trim().length > 0;

  return (
    <div className="mt-1.5 space-y-1.5">
      <ul className="flex flex-wrap gap-1.5">
        {attachments.map((a) => {
          const label = a.label.trim() || a.target;
          const Icon = a.kind === 'folder' ? Folder : a.kind === 'url' ? LinkIcon : File;
          const isOpen = expanded.has(a.id);
          return (
            <li
              key={a.id}
              className="group/chip inline-flex items-center rounded-full border border-line bg-paper-2/60 font-ui text-[11px] text-ink-2 transition-colors hover:border-accent"
            >
              <button
                type="button"
                onClick={() => void handleOpen(a)}
                title={a.target}
                className="flex max-w-[260px] items-center gap-1 py-0.5 pl-1.5 pr-1 transition-colors hover:text-accent"
              >
                <Icon size={10} className="flex-none" />
                <span className="truncate">{label}</span>
              </button>
              {hasText(a) && (
                <button
                  type="button"
                  onClick={() => toggle(a.id)}
                  title={isOpen ? '收起提取的文本' : '展开提取的文本'}
                  className="flex-none px-1 py-0.5 text-muted transition-colors hover:text-accent"
                >
                  {isOpen ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                </button>
              )}
              {hasText(a) && onSetIncludeInPack && (
                <button
                  type="button"
                  onClick={() => onSetIncludeInPack(a.id, !a.includeInPack)}
                  title={
                    a.includeInPack
                      ? '已加入 Pack —— 点击移出'
                      : '加入 Pack（让提取的文本进入打包与摘要）'
                  }
                  aria-pressed={a.includeInPack}
                  className={`flex-none rounded-full px-1.5 py-0.5 text-[10px] transition-colors ${
                    a.includeInPack
                      ? 'bg-accent/15 text-accent'
                      : 'text-muted hover:bg-paper-2 hover:text-ink-2'
                  }`}
                >
                  {a.includeInPack ? '已加入 Pack' : '加入 Pack'}
                </button>
              )}
              {onDetach && (
                <button
                  type="button"
                  onClick={() => onDetach(a.id)}
                  title="移除附件"
                  className="flex-none py-0.5 pl-0.5 pr-1.5 text-muted opacity-0 transition-opacity hover:text-accent group-hover/chip:opacity-100"
                >
                  <X size={9} />
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {attachments.map((a) =>
        expanded.has(a.id) && a.extractedText !== null ? (
          <div key={a.id} className="rounded-md border border-line bg-paper-2/40 p-2">
            <div className="mb-1 flex items-center justify-between gap-2 font-ui text-[10px] text-muted">
              <span className="truncate">{a.label.trim() || a.target}</span>
              <span className="flex-none">
                {a.extractionKind} · {a.extractedText.length} 字符
              </span>
            </div>
            <pre className="max-h-64 overflow-y-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-ink-2">
              {a.extractedText}
            </pre>
          </div>
        ) : null,
      )}
    </div>
  );
}
