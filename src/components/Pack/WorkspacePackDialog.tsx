import { FolderDown, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { PACK_RANGE_KEYS, type CitedBlock, type PackRange } from '@/lib/pack/assemble';
import { buildPackFolder, type PackProject, type PackWorkspaceNode } from '@/lib/pack/folder';
import { useLanguage, useT } from '@/lib/i18n';

// 打包整个工作区 (DESIGN_WORKSPACE_PACK §1.1). ⭐ 「整个文件夹」 and 「挑几个」 are the SAME
// action, which is why there is one dialog and not two features: every row starts ticked, so
// doing nothing exports the whole folder and unticking is how you pick.

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

/** The workspace subtree, with every project in it — ticked or not. */
export interface PackTreeNode {
  id: string;
  title: string;
  projects: PackProject[];
  children: PackTreeNode[];
}

interface Props {
  tree: PackTreeNode;
  refTitles: Map<string, string>;
  refBlocks: Map<string, CitedBlock>;
  /** Resolves to the folder that was written, or null when the user cancelled the picker. */
  onExport: (folderName: string, files: { path: string; content: string }[]) => Promise<void>;
  onClose: () => void;
}

const collectThreadIds = (node: PackTreeNode, into: string[] = []): string[] => {
  for (const p of node.projects) into.push(p.thread.id);
  for (const c of node.children) collectThreadIds(c, into);
  return into;
};

/** The ticked subtree, in the shape buildPackFolder wants. ⚠️ A sub-workspace with nothing
 *  ticked anywhere under it is dropped entirely — an empty directory in the export would be
 *  a folder the receiving AI opens for nothing. */
const pruneToSelection = (node: PackTreeNode, selected: Set<string>): PackWorkspaceNode | null => {
  const projects = node.projects.filter((p) => selected.has(p.thread.id));
  const children = node.children
    .map((c) => pruneToSelection(c, selected))
    .filter((c): c is PackWorkspaceNode => c !== null);
  if (projects.length === 0 && children.length === 0) return null;
  return { title: node.title, projects, children };
};

export default function WorkspacePackDialog({
  tree,
  refTitles,
  refBlocks,
  onExport,
  onClose,
}: Props) {
  const t = useT();
  const language = useLanguage();
  const [range, setRange] = useState<PackRange>('all');
  const [selected, setSelected] = useState<Set<string>>(() => new Set(collectThreadIds(tree)));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  // Ticking a sub-workspace's heading takes everything under it — that is what clicking the
  // folder means, and doing it row by row for seven projects is the reason people give up.
  const toggleSubtree = (node: PackTreeNode) => {
    const ids = collectThreadIds(node);
    const allOn = ids.every((id) => selected.has(id));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (allOn) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  };

  // The whole export, built on every change. It is what the footer counts and what the
  // button writes — one calculation, so the number on screen cannot disagree with the bytes.
  const built = useMemo(() => {
    const pruned = pruneToSelection(tree, selected);
    if (!pruned) return null;
    return buildPackFolder({
      root: pruned,
      range,
      refTitles,
      refBlocks,
      outputLanguage: language,
    });
  }, [tree, selected, range, refTitles, refBlocks, language]);

  const totals = useMemo(() => {
    const chars = built?.files.reduce((sum, f) => sum + f.content.length, 0) ?? 0;
    return { projects: selected.size, files: built?.files.length ?? 0, chars };
  }, [built, selected]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  const doExport = async () => {
    if (!built) return;
    setBusy(true);
    setError(null);
    try {
      await onExport(built.folderName, built.files);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  // Per-project char count, read off the file that project actually produced.
  const charsByThread = useMemo(() => {
    const map = new Map<string, number>();
    for (const f of built?.files ?? []) {
      if (f.threadId) map.set(f.threadId, f.content.length);
    }
    return map;
  }, [built]);

  const renderNode = (node: PackTreeNode, depth: number) => (
    <div key={node.id} style={{ paddingLeft: depth === 0 ? 0 : 12 }}>
      {depth > 0 && (
        <label className="flex cursor-pointer items-center gap-2 py-1 text-xs text-ink">
          <input
            type="checkbox"
            checked={collectThreadIds(node).every((id) => selected.has(id))}
            onChange={() => toggleSubtree(node)}
            className="h-3 w-3 accent-[var(--accent)]"
          />
          <span className="truncate">
            {node.title.trim() || t('未命名')}
            <span className="ml-1 text-muted">{t('（子工作区）')}</span>
          </span>
        </label>
      )}
      {node.projects.map((p) => (
        <label
          key={p.thread.id}
          className="flex cursor-pointer items-center gap-2 py-1 text-xs text-ink"
          style={{ paddingLeft: depth > 0 ? 12 : 0 }}
        >
          <input
            type="checkbox"
            checked={selected.has(p.thread.id)}
            onChange={() => toggle(p.thread.id)}
            className="h-3 w-3 accent-[var(--accent)]"
          />
          <span className="min-w-0 flex-1 truncate">{p.thread.title.trim() || t('无标题')}</span>
          <span className="flex-none text-[11px] text-muted">
            {t('{n} 块', { n: p.blocks.filter((b) => b.staleAt == null).length })}
            {selected.has(p.thread.id) && charsByThread.has(p.thread.id)
              ? ` · ${charsByThread.get(p.thread.id)!.toLocaleString()}`
              : ''}
          </span>
        </label>
      ))}
      {node.children.map((c) => renderNode(c, depth + 1))}
    </div>
  );

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-ink/30 p-8" onClick={onClose}>
      <div
        className="flex max-h-[80vh] w-[560px] flex-col rounded-lg border border-line-strong bg-paper"
        style={{ boxShadow: 'var(--shadow-toast)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex flex-none items-start justify-between border-b border-line px-5 py-3">
          <div>
            <div className="font-serif text-lg text-ink">
              {t('打包「{name}」', { name: tree.title.trim() || t('未命名') })}
            </div>
            {/* ⚠️ Not 「直接粘贴给 AI 即可」 any more: this one produces a FOLDER, and §2.3
                says out loud that handing the AI one .md out of it walks straight past the
                rules in INDEX.md. The half of that bet we control is this sentence. */}
            <div className="mt-0.5 text-[11px] text-muted">
              {t('纯本地组装 · 导出成一个文件夹，整个交给 AI')}
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

        <div className="flex-1 overflow-y-auto px-5 py-3">{renderNode(tree, 0)}</div>

        <div className="flex flex-none items-center gap-2 border-t border-line bg-paper-2/30 px-5 py-2 text-[11px]">
          <span className="text-muted">{t('打包范围?')}</span>
          <div className="flex flex-wrap items-center gap-1">
            {PACK_RANGE_KEYS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setRange(k)}
                title={t(RANGE_HINTS[k])}
                className={`rounded-md border px-2 py-0.5 transition-colors ${
                  range === k
                    ? 'border-accent bg-accent-soft text-accent'
                    : 'border-line bg-paper text-muted hover:border-line-strong hover:text-ink'
                }`}
              >
                {t(RANGE_LABELS[k])}
              </button>
            ))}
          </div>
        </div>

        <footer className="flex flex-none items-center justify-between border-t border-line bg-paper-2/40 px-5 py-3 text-xs">
          <span className="text-muted">
            {error
              ? error
              : t('{projects} 个项目 / {files} 个文件 · {chars} 字符', {
                  projects: totals.projects,
                  files: totals.files,
                  chars: totals.chars.toLocaleString(),
                })}
          </span>
          <button
            onClick={() => void doExport()}
            disabled={!built || busy}
            autoFocus
            className="flex items-center gap-1.5 rounded-md border border-line-strong bg-paper px-3 py-1.5 text-ink transition-colors hover:border-accent hover:text-accent disabled:opacity-40"
          >
            <FolderDown size={12} />
            <span>{busy ? t('正在导出…') : t('导出文件夹')}</span>
          </button>
        </footer>
      </div>
    </div>
  );
}
