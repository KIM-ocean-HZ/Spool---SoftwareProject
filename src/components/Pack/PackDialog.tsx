import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { Check, Copy, Sparkles, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { buildCompressPackPrompt } from '@/lib/ai/prompts/compressPack';
import { router } from '@/lib/ai/router';
import {
  assemble,
  filterBlocksForRange,
  PACK_RANGE_KEYS,
  type PackRange,
} from '@/lib/pack/assemble';
import { isAiAvailable, useSettingsStore } from '@/stores/settingsStore';
import {
  DEFAULT_PACK_TEMPLATE,
  PACK_TEMPLATES,
  PACK_TEMPLATE_KEYS,
  type PackTemplateKey,
} from '@/lib/pack/templates';
import type { Attachment } from '@/lib/db/attachments';
import type { Block } from '@/lib/db/blocks';
import type { Thread } from '@/lib/db/threads';
import { useT } from '@/lib/i18n';

const RANGE_LABELS: Record<PackRange, string> = {
  all: '全部',
  pinned: '仅置顶',
  last7: '近 7 天',
  last30: '近 30 天',
};

const RANGE_HINTS: Record<PackRange, string> = {
  all: '打包整条脉络',
  pinned: '只打包标了置顶的信息块',
  last7: '只打包最近 7 天捕捉的内容',
  last30: '只打包最近 30 天捕捉的内容',
};

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
  const t = useT();
  const [copied, setCopied] = useState(false);
  // v2.8 §20.7: per-pack task template selector. Per-pack only — no persistence across
  // sessions or per-thread defaults, by intent: we're learning which templates earn
  // their place, not building a system.
  const [template, setTemplate] = useState<PackTemplateKey>(DEFAULT_PACK_TEMPLATE);
  // §17 range selector: per-pack, defaults to everything. Like the template selector,
  // deliberately not persisted.
  const [range, setRange] = useState<PackRange>('all');
  // §17 AI compression. The deterministic pack is never replaced — the compressed text
  // is a togglable second view, produced on demand, and any failure silently disables
  // the button for this dialog (§6.3 / §14.4). Never persisted.
  const aiAvailable = useSettingsStore(isAiAvailable);
  const [compressed, setCompressed] = useState<string | null>(null);
  const [aiState, setAiState] = useState<'idle' | 'loading' | 'failed'>('idle');
  const [view, setView] = useState<'original' | 'compressed'>('original');

  // assemble is a synchronous pure function — memoize it so re-renders don't re-pack the
  // whole thread. It's still fast (<1ms on small threads) but this keeps the textarea
  // diff-free between renders. The range filter runs first; attachments narrow to the
  // surviving blocks so "Related Files & Links" never points at content the pack omitted.
  const { text, packedCount } = useMemo(() => {
    const packedBlocks = filterBlocksForRange(blocks, range);
    const ids = new Set(packedBlocks.map((b) => b.id));
    const packedAttachments =
      range === 'all' ? attachments : attachments.filter((a) => ids.has(a.blockId));
    return {
      text: assemble({ thread, blocks: packedBlocks, attachments: packedAttachments, refTitles, template }),
      packedCount: packedBlocks.length,
    };
  }, [thread, blocks, attachments, refTitles, template, range]);

  // A range/template change produces a different source text — the old compressed
  // version no longer corresponds to it, so it is dropped (recompress on demand).
  useEffect(() => {
    setCompressed(null);
    setView('original');
    setAiState('idle');
  }, [text]);

  const handleCompress = async (): Promise<void> => {
    if (aiState !== 'idle' || compressed) return;
    setAiState('loading');
    try {
      const { text: result } = await router.quality(buildCompressPackPrompt(text), {
        cache: true,
      });
      const trimmed = result.trim();
      // A meaningful compression is shorter than its input; anything else (empty,
      // refusal prose, echo) counts as failure and silently disables the button.
      if (trimmed.length === 0 || trimmed.length >= text.length) {
        setAiState('failed');
        return;
      }
      setCompressed(trimmed + '\n');
      setView('compressed');
      setAiState('idle');
    } catch {
      setAiState('failed');
    }
  };

  const shownText = view === 'compressed' && compressed ? compressed : text;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const onCopy = async () => {
    await writeText(shownText);
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
            <div className="font-serif text-lg text-ink">{t('打包上下文')}</div>
            <div className="mt-0.5 text-[11px] text-muted">
              {t('纯本地组装 · 直接粘贴给 AI 即可')}
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1 text-muted hover:bg-paper-2 hover:text-ink"
            aria-label={t('关闭')}
          >
            <X size={14} />
          </button>
        </header>

        {/* v2.8 §20.7: task-template picker. Quiet — defaults to 纯上下文 (no extra
            block), so users who don't engage see byte-identical pack output. */}
        <div className="flex flex-none items-center gap-2 border-b border-line bg-paper-2/30 px-5 py-2 text-[11px]">
          <span className="text-muted">{t('想让 AI 做什么?')}</span>
          <div className="flex flex-wrap items-center gap-1">
            {PACK_TEMPLATE_KEYS.map((k) => {
              const tpl = PACK_TEMPLATES[k];
              const active = template === k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setTemplate(k)}
                  title={t(tpl.hint)}
                  className={`rounded-md border px-2 py-0.5 transition-colors ${
                    active
                      ? 'border-accent bg-accent-soft text-accent'
                      : 'border-line bg-paper text-muted hover:border-line-strong hover:text-ink'
                  }`}
                >
                  {t(tpl.label)}
                </button>
              );
            })}
          </div>
        </div>

        {/* §17 range picker (pulled forward from v1.5): same quiet pill pattern. 全部 is
            the default and keeps output byte-identical to pre-range packs. */}
        <div className="flex flex-none items-center gap-2 border-b border-line bg-paper-2/30 px-5 py-2 text-[11px]">
          <span className="text-muted">{t('打包范围?')}</span>
          <div className="flex flex-wrap items-center gap-1">
            {PACK_RANGE_KEYS.map((k) => {
              const active = range === k;
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setRange(k)}
                  title={t(RANGE_HINTS[k])}
                  className={`rounded-md border px-2 py-0.5 transition-colors ${
                    active
                      ? 'border-accent bg-accent-soft text-accent'
                      : 'border-line bg-paper text-muted hover:border-line-strong hover:text-ink'
                  }`}
                >
                  {t(RANGE_LABELS[k])}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-[1.55] text-ink-2">
            {shownText}
          </pre>
        </div>

        <footer className="flex flex-none items-center justify-between border-t border-line bg-paper-2/40 px-5 py-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-muted">
              {t('{packed} / {total} 块 · {chars} 字符', { packed: packedCount, total: blocks.length, chars: shownText.length.toLocaleString() })}
            </span>
            {/* §17 AI 压缩 — entry hidden entirely when AI is unavailable (§9.11 gating);
                after a successful run the button becomes the 原文/压缩版 view toggle. */}
            {aiAvailable &&
              (compressed ? (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setView('original')}
                    className={`rounded-md border px-2 py-0.5 transition-colors ${
                      view === 'original'
                        ? 'border-accent bg-accent-soft text-accent'
                        : 'border-line bg-paper text-muted hover:border-line-strong hover:text-ink'
                    }`}
                  >
                    {t('原文')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setView('compressed')}
                    className={`rounded-md border px-2 py-0.5 transition-colors ${
                      view === 'compressed'
                        ? 'border-accent bg-accent-soft text-accent'
                        : 'border-line bg-paper text-muted hover:border-line-strong hover:text-ink'
                    }`}
                  >
                    {t('压缩版')}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => void handleCompress()}
                  disabled={aiState !== 'idle'}
                  title={
                    aiState === 'failed'
                      ? t('压缩未成功 — 原文仍然完整可用')
                      : t('让 AI 压缩 Full Record（置顶与批注原文保留）')
                  }
                  className="flex items-center gap-1 rounded-md border border-line bg-paper px-2 py-0.5 text-muted transition-colors enabled:hover:border-accent enabled:hover:text-accent disabled:cursor-not-allowed disabled:text-muted/50"
                >
                  <Sparkles size={11} />
                  <span>{aiState === 'loading' ? t('压缩中…') : t('AI 压缩')}</span>
                </button>
              ))}
          </div>
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
            <span>{copied ? t('已复制') : t('复制到剪贴板')}</span>
          </button>
        </footer>
      </div>
    </div>
  );
}
