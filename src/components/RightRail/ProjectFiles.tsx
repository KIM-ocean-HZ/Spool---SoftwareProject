import { File, Folder, Plus, X } from 'lucide-react';
import { useT } from '@/lib/i18n';
import type { Attachment } from '@/lib/db/attachments';
import { basename, openTarget, pickFiles } from '@/lib/utils/openTarget';
import { useBlocksStore } from '@/stores/blocksStore';
import { toast } from '@/stores/toastStore';

// DESIGN_PROJECT_FILES §3.2 — 「项目文件」, the place a file lives now.
//
// Ocean 2026-08-08: 「右侧边栏加一个类似项目文件库的地方，点加号可以加入相关文件……
// 现在的文件对应整个项目，而不是一个 block」.
//
// ⚠️ The one invariant this panel exists to hold (§2): **the only source of a path is the
// system file dialog**. `pickFiles` is the sole way a row is created here, and a Finder drop
// onto the timeline is the same dialog by another name. Nothing an AI writes can put a path
// in this list — which is the entire reason 「自动挂本地文件」 was rejected in
// DESIGN_CONTEXT_HYGIENE §2 and this shape was not.
//
// ⭐ 2026-08-14: the 「AI 可读」 switch (§5.1 ①) is HERE now, and it arrived with phase three
// — the thing that reads it (`request_file_access`) shipped in the same build. It was held
// back on purpose until then: a switch that flips a column nothing reads is the
// shipped-but-inert control this project already recorded once (CASE_STUDY_LEDGER §3.5).
//
// ⚠️ Why the switch has to exist at all, and not just the approve button on the review
// screen: the grant an AI asks for is STANDING (Ocean 2026-08-08 ①) — one yes and it can
// read that file from then on. §5.1 ① is explicit that the price of skipping approval
// fatigue is that the permission must be visible and revocable where the file is listed.
// This row IS that. Nothing else in the app shows what an AI may read.
//
// ⚠️ It is NOT the same thing as 「打包时带上这个文件的文字」 sitting above it, and merging
// them would be wrong in both directions: that one is the user putting text into a pack
// they are building; this one is whether an AI may go and ask for the file at all.

const EMPTY: readonly Attachment[] = [];

export default function ProjectFiles({ threadId }: { threadId: string }) {
  const t = useT();
  const files = useBlocksStore((s) => s.attachmentsByThread[threadId] ?? EMPTY);
  const attach = useBlocksStore((s) => s.attach);
  const detach = useBlocksStore((s) => s.detach);
  const setIncludeInPack = useBlocksStore((s) => s.setIncludeInPack);
  const setAiAccess = useBlocksStore((s) => s.setAiAccess);

  const add = async (): Promise<void> => {
    try {
      const paths = await pickFiles();
      for (const p of paths) {
        await attach({ threadId, kind: 'file', target: p, label: basename(p) });
      }
    } catch (e) {
      console.error('[files] picker failed', e);
      toast.error(t('添加文件失败：{msg}', { msg: e instanceof Error ? e.message : String(e) }));
    }
  };

  const open = async (target: string): Promise<void> => {
    try {
      await openTarget(target);
    } catch (e) {
      // §14.4: a file the user has since moved is not a crash — say so and carry on.
      toast.error(e instanceof Error ? e.message : t('无法打开附件'));
    }
  };

  return (
    <div className="space-y-1 border-t border-line pt-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] uppercase tracking-wide text-muted">{t('项目文件')}</span>
        <button
          type="button"
          onClick={() => void add()}
          title={t('从文件选择器里加一个文件')}
          className="flex flex-none items-center gap-0.5 text-[11px] text-muted transition-colors hover:text-accent"
        >
          <Plus size={11} />
          {t('加文件')}
        </button>
      </div>

      {files.length === 0 ? (
        <p className="px-1 text-[11px] leading-relaxed text-muted">
          {t('这个项目还没有文件。加进来的文件默认谁都不读，打包时也不会带上正文。')}
        </p>
      ) : (
        <ul className="space-y-0.5">
          {files.map((a) => {
            const Icon = a.kind === 'folder' ? Folder : File;
            // v2.8 §20.2: the opt-in only means anything once there is text to inline, so
            // the control appears only on a file that actually has some.
            const canInline = a.kind === 'file' && a.extractedText != null;
            return (
              <li key={a.id} className="group/file rounded px-1 py-0.5 hover:bg-paper-2">
                <div className="flex items-center gap-1.5">
                  <Icon size={11} className="flex-none text-muted" />
                  <button
                    type="button"
                    onClick={() => void open(a.target)}
                    title={a.target}
                    className="min-w-0 flex-1 truncate text-left text-[12px] text-ink-2 transition-colors hover:text-accent"
                  >
                    {a.label.trim() || basename(a.target)}
                  </button>
                  <button
                    type="button"
                    onClick={() => void detach(a.id, threadId)}
                    title={t('从这个项目里去掉（文件本身不动）')}
                    aria-label={t('从这个项目里去掉（文件本身不动）')}
                    className="flex-none rounded p-0.5 text-muted opacity-0 transition-opacity hover:text-ink group-hover/file:opacity-100"
                  >
                    <X size={11} />
                  </button>
                </div>
                {canInline && (
                  <div className="space-y-0.5 pl-[18px]">
                    <label className="flex cursor-pointer items-center gap-1 text-[11px] text-muted">
                      <input
                        type="checkbox"
                        checked={a.includeInPack}
                        onChange={(e) => void setIncludeInPack(a.id, threadId, e.target.checked)}
                        className="h-2.5 w-2.5 accent-[var(--accent)]"
                      />
                      {t('打包时带上这个文件的文字')}
                    </label>
                    {/* §5.1 ①: on = the AI may read it from now on, off = one click takes
                        it back. Coloured when on, because a standing permission that looks
                        exactly like a permission you never gave is the failure mode. */}
                    <label
                      className={`flex cursor-pointer items-center gap-1 text-[11px] ${
                        a.aiAccess ? 'text-accent' : 'text-muted'
                      }`}
                      title={t('关掉之后，AI 想再读它就得重新问你一次。')}
                    >
                      <input
                        type="checkbox"
                        checked={a.aiAccess}
                        onChange={(e) => void setAiAccess(a.id, threadId, e.target.checked)}
                        className="h-2.5 w-2.5 accent-[var(--accent)]"
                      />
                      {a.aiAccess ? t('AI 可以读这个文件') : t('AI 不能读这个文件')}
                    </label>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
