import {
  CheckSquare,
  ChevronDown,
  ChevronRight,
  File,
  FileText,
  Folder,
  Link as LinkIcon,
  Square,
  X,
} from 'lucide-react';
import { useState } from 'react';
import type { Attachment } from '@/lib/db/attachments';
import { openTarget } from '@/lib/utils/openTarget';
import { toast } from '@/stores/toastStore';

interface Props {
  attachments: readonly Attachment[];
  // Omitted in read-only contexts (the digest view) — without it no detach control renders.
  onDetach?: (attachmentId: string) => void;
  // v2.8 §20.2: toggle per-attachment opt-in for inlining extracted_text into pack /
  // summaries. Omitted in read-only contexts; only rendered when extracted text exists.
  onSetIncludeInPack?: (attachmentId: string, value: boolean) => void;
}

// Per PLAN_EN.md §9.6: an attachment renders as a chip on its block. Click opens with the
// OS default app via the Rust `open_target` command; a missing target surfaces a toast
// (§14.4) instead of crashing.
//
// Layout (v2.8 cleanup): the chip is just the open action. The preview chevron and the
// detach × are SIBLINGS of the chip (not nested inside its pill) so the click targets
// aren't crowded. The "加入 Pack" toggle (§20.2) lives inside the expanded preview
// panel's header — it's semantically about the extracted text, so it belongs alongside
// the text rather than on the chip row. A subtle FileText vs File icon swap on the chip
// reflects the pack-inclusion state at a glance.
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
      <ul className="flex flex-wrap gap-x-3 gap-y-1.5">
        {attachments.map((a) => {
          const label = a.label.trim() || a.target;
          const isFile = a.kind === 'file';
          const fileHasText = isFile && hasText(a);
          // Subtle state indicator: an active "加入 Pack" attachment uses FileText (with
          // visible text lines) instead of File (outline only). Folder / URL kinds are
          // unaffected. Tooltip on the chip flags the state too.
          const Icon =
            a.kind === 'folder'
              ? Folder
              : a.kind === 'url'
                ? LinkIcon
                : fileHasText && a.includeInPack
                  ? FileText
                  : File;
          const isOpen = expanded.has(a.id);
          const chipTitle =
            fileHasText && a.includeInPack
              ? `${a.target}\n（文本已加入 Pack）`
              : a.target;
          return (
            <li
              key={a.id}
              className="group/chip inline-flex items-center gap-1"
            >
              {/* Chip body — single action, single click target. Rounded pill with the
                  icon + label; clicking opens the attachment externally. */}
              <button
                type="button"
                onClick={() => void handleOpen(a)}
                title={chipTitle}
                className="inline-flex max-w-[260px] items-center gap-1 rounded-full border border-line bg-paper-2/60 px-2 py-0.5 font-ui text-[11px] text-ink-2 transition-colors hover:border-accent hover:text-accent"
              >
                <Icon size={10} className="flex-none" />
                <span className="truncate">{label}</span>
              </button>

              {/* Preview chevron — sibling of the chip, not nested. Visually separated
                  by the parent's gap-1 so a stray click on it doesn't open the file. */}
              {fileHasText && (
                <button
                  type="button"
                  onClick={() => toggle(a.id)}
                  title={isOpen ? '收起提取的文本' : '展开提取的文本'}
                  aria-label={isOpen ? '收起提取的文本' : '展开提取的文本'}
                  className="rounded p-0.5 text-muted transition-colors hover:bg-paper-2 hover:text-accent"
                >
                  {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                </button>
              )}

              {/* Detach × — hover-revealed, outside the chip pill so it doesn't crowd
                  the open / preview targets. */}
              {onDetach && (
                <button
                  type="button"
                  onClick={() => onDetach(a.id)}
                  title="移除附件"
                  className="rounded p-0.5 text-muted opacity-0 transition-opacity hover:text-accent group-hover/chip:opacity-100"
                >
                  <X size={11} />
                </button>
              )}
            </li>
          );
        })}
      </ul>

      {/* Expanded text preview, one panel per opened chip. The header carries metadata
          (filename · kind · char count) plus the §20.2 "加入 Pack" toggle — moved out of
          the chip row so the chip stays minimal, and put here because the toggle is
          semantically about whether THIS extracted text travels with pack / summaries. */}
      {attachments.map((a) =>
        expanded.has(a.id) && a.extractedText !== null ? (
          <div key={a.id} className="rounded-md border border-line bg-paper-2/40 p-2">
            <div className="mb-1 flex items-center justify-between gap-2 font-ui text-[10px] text-muted">
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate">{a.label.trim() || a.target}</span>
                <span className="flex-none">
                  {a.extractionKind} · {a.extractedText.length} 字符
                </span>
              </div>
              {onSetIncludeInPack && (
                <button
                  type="button"
                  onClick={() => onSetIncludeInPack(a.id, !a.includeInPack)}
                  title={
                    a.includeInPack
                      ? '此文本会随打包 / 状态摘要一起发送给 AI —— 点击取消'
                      : '勾选后，此文本会随打包 / 状态摘要一起发送给 AI'
                  }
                  aria-pressed={a.includeInPack}
                  className={`flex flex-none items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-colors ${
                    a.includeInPack
                      ? 'text-accent hover:bg-accent/10'
                      : 'text-muted hover:bg-paper-2 hover:text-ink-2'
                  }`}
                >
                  {a.includeInPack ? <CheckSquare size={11} /> : <Square size={11} />}
                  <span>加入 Pack</span>
                </button>
              )}
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
