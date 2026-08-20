import { writeText } from '@tauri-apps/plugin-clipboard-manager';
import { Check, Copy, Shrink, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import CompressDialog from './CompressDialog';
import {
  assemble,
  filterBlocksForRange,
  PACK_RANGE_KEYS,
  type CitedBlock,
  type PackRange,
} from '@/lib/pack/assemble';
import { INSTRUCTION_HEADER } from '@/lib/pack/templates';
import { useSettingsStore } from '@/stores/settingsStore';
import type { Attachment } from '@/lib/db/attachments';
import type { Block } from '@/lib/db/blocks';
import type { Thread } from '@/lib/db/threads';
import { useLanguage, useT } from '@/lib/i18n';

const RANGE_LABELS: Record<PackRange, string> = {
  all: '全部',
  pinned: '仅置顶',
  last7: '近 7 天',
  last30: '近 30 天',
};

const RANGE_HINTS: Record<PackRange, string> = {
  all: '打包整个项目',
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
  // v2.4 (§20.13 D2): cited-block previews for blocks carrying refBlockId.
  refBlocks: Map<string, CitedBlock>;
  onClose: () => void;
}

export default function PackDialog({
  thread,
  blocks,
  attachments,
  refTitles,
  refBlocks,
  onClose,
}: Props) {
  const t = useT();
  // The pack closes with a directive telling the receiving AI which language to answer
  // in — it follows the app's own language, not a hard-coded one (2026-08-04).
  const language = useLanguage();
  const [copied, setCopied] = useState(false);
  // 形态 C（WORKPLAN §9 第 4 步）。⚠️ 只在 API 引擎被打开时才出现——默认关闭,
  // 而一个点了只会说「你还没配」的按钮不如没有。
  const apiEngineEnabled = useSettingsStore((s) => s.apiEngineEnabled);
  const [compressing, setCompressing] = useState(false);
  // §17 range selector: per-pack, defaults to everything — deliberately not persisted,
  // it is a per-task choice rather than a standing fact about this user.
  const [range, setRange] = useState<PackRange>('all');
  // §1.1, and unlike the range above this one IS persisted: the range is a per-task
  // choice, while "who am I pasting to" is a standing fact about how this user works.
  const instructions = useSettingsStore((s) => s.packInstructions);
  const updateSettings = useSettingsStore((s) => s.update);

  // assemble is a synchronous pure function — memoize it so re-renders don't re-pack the
  // whole thread. It's still fast (<1ms on small threads) but this keeps the textarea
  // diff-free between renders.
  // ⚠️ v15: narrowing the range no longer narrows the files. A file belongs to the project,
  // not to any block in it, so "the last 20 blocks" says nothing about which files the
  // project holds — dropping them from a narrowed pack would hide the project's own
  // material rather than match the slice.
  const { text, packedCount } = useMemo(() => {
    const packedBlocks = filterBlocksForRange(blocks, range);
    return {
      text: assemble({
        thread,
        blocks: packedBlocks,
        attachments,
        refTitles,
        refBlocks,
        // B-3: a narrowed pack must say so in its header, or the AI it gets pasted to
        // reads the slice as the whole project.
        scope: { range, total: blocks.length },
        instructions,
        outputLanguage: language,
      }),
      packedCount: packedBlocks.length,
    };
  }, [thread, blocks, attachments, refTitles, refBlocks, range, instructions, language]);

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

        {/* DESIGN_CONTEXT_HYGIENE §1.1: the reading instructions are ON by default
            (Ocean 2026-08-08, reversing the original OFF) — they are the one thing that
            stops a chatbot essay from being read as fact. What it costs is stated on the
            row rather than hidden in a tooltip, so a user who wants the short pack knows
            what unticking it drops. The choice is remembered. */}
        <div className="flex flex-none items-center gap-2 border-b border-line bg-paper-2/30 px-5 py-2 text-[11px]">
          <label className="flex cursor-pointer items-center gap-1.5 text-muted hover:text-ink">
            <input
              type="checkbox"
              checked={instructions}
              onChange={(e) => void updateSettings({ packInstructions: e.target.checked })}
              className="h-3 w-3 accent-[var(--accent)]"
            />
            <span>{t('带上「怎么读这份上下文」的说明')}</span>
          </label>
          <span className="text-muted/70">
            {t('告诉对方哪些是权威资料、哪些只是别的 AI 写的。会长 {n} 字符', {
              n: INSTRUCTION_HEADER.length.toLocaleString(),
            })}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          <pre className="whitespace-pre-wrap break-words font-mono text-[12px] leading-[1.55] text-ink-2">
            {text}
          </pre>
        </div>

        <footer className="flex flex-none items-center justify-between border-t border-line bg-paper-2/40 px-5 py-3 text-xs">
          <span className="text-muted">
            {t('{packed} / {total} 块 · {chars} 字符', { packed: packedCount, total: blocks.length, chars: text.length.toLocaleString() })}
          </span>
          <div className="flex items-center gap-2">
          {apiEngineEnabled && (
            <button
              onClick={() => setCompressing(true)}
              title={t('交给 AI 压短一点,压完并排给你核对')}
              className="flex items-center gap-1.5 rounded-md border border-line px-3 py-1.5 text-muted transition-colors hover:border-line-strong hover:text-ink"
            >
              <Shrink size={12} />
              <span>{t('压缩')}</span>
            </button>
          )}
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
          </div>
        </footer>
      </div>
      {compressing && (
        <CompressDialog
          packText={text}
          project={thread.title || '(untitled)'}
          onClose={() => setCompressing(false)}
        />
      )}
    </div>
  );
}
