import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { Check, Copy, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { assemble } from '@/lib/pack/assemble';
import {
  DEFAULT_PACK_TEMPLATE,
  PACK_TEMPLATES,
  PACK_TEMPLATE_KEYS,
  type PackTemplateKey,
} from '@/lib/pack/templates';
import type { Attachment } from '@/lib/db/attachments';
import type { Block } from '@/lib/db/blocks';
import type { Thread } from '@/lib/db/threads';

interface Props {
  thread: Thread;
  blocks: Block[];
  // Every attachment in this thread, supplied by the parent so PackDialog stays a pure
  // renderer. assemble() groups them per-block and emits the "Related Files & Links"
  // section (§9.5 / §9.6).
  attachments: Attachment[];
  refTitles: Map<string, string>;
  onClose: () => void;
}

export default function PackDialog({
  thread,
  blocks,
  attachments,
  refTitles,
  onClose,
}: Props) {
  const [copied, setCopied] = useState(false);
  // v2.8 §20.7: per-pack task template selector. Per-pack only — no persistence across
  // sessions or per-thread defaults, by intent: we're learning which templates earn
  // their place, not building a system.
  const [template, setTemplate] = useState<PackTemplateKey>(DEFAULT_PACK_TEMPLATE);

  // assemble is a synchronous pure function — memoize it so re-renders don't re-pack the
  // whole thread. It's still fast (<1ms on small threads) but this keeps the textarea
  // diff-free between renders.
  const text = useMemo(
    () => assemble({ thread, blocks, attachments, refTitles, template }),
    [thread, blocks, attachments, refTitles, template],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const onCopy = async () => {
    await writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-ink/30 p-8"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-[640px] flex-col rounded-lg border border-line-strong bg-paper"
        style={{ boxShadow: 'var(--shadow-toast)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex flex-none items-center justify-between border-b border-line px-5 py-3">
          <div>
            <div className="font-serif text-lg text-ink">打包上下文</div>
            <div className="mt-0.5 text-[11px] text-muted">
              纯本地组装 · 直接粘贴给 AI 即可
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted hover:bg-paper-2 hover:text-ink"
            aria-label="关闭"
          >
            <X size={14} />
          </button>
        </header>

        {/* v2.8 §20.7: task-template picker. Quiet — defaults to 纯上下文 (no extra
            block), so users who don't engage see byte-identical pack output. */}
        <div className="flex flex-none items-center gap-2 border-b border-line bg-paper-2/30 px-5 py-2 text-[11px]">
          <span className="text-muted">想让 AI 做什么?</span>
          <div className="flex flex-wrap items-center gap-1">
            {PACK_TEMPLATE_KEYS.map((k) => {
              const t = PACK_TEMPLATES[k];
              const active = template === k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setTemplate(k)}
                  title={t.hint}
                  className={`rounded-md border px-2 py-0.5 transition-colors ${
                    active
                      ? 'border-accent bg-accent-soft text-accent'
                      : 'border-line bg-paper text-muted hover:border-line-strong hover:text-ink'
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-[1.55] text-ink-2">
            {text}
          </pre>
        </div>

        <footer className="flex flex-none items-center justify-between border-t border-line bg-paper-2/40 px-5 py-3 text-xs">
          <span className="text-muted">{text.length.toLocaleString()} 字符</span>
          <button
            onClick={() => void onCopy()}
            autoFocus
            className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 transition-colors ${
              copied
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-line-strong bg-paper text-ink hover:border-accent hover:text-accent'
            }`}
          >
            {copied ? <Check size={12} /> : <Copy size={12} />}
            <span>{copied ? '已复制' : '复制到剪贴板'}</span>
          </button>
        </footer>
      </div>
    </div>
  );
}
