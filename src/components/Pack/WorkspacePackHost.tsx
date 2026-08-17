import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-dialog';
import { useEffect, useMemo, useState } from 'react';
import WorkspacePackDialog, { type PackTreeNode } from './WorkspacePackDialog';
import { annotationIsAi } from '@/lib/blocks/annotationAuthor';
import { listBlocksByIds } from '@/lib/db/blocks';
import { t } from '@/lib/i18n';
import type { CitedBlock } from '@/lib/pack/assemble';
import type { PackFile } from '@/lib/pack/folder';
import { openTarget } from '@/lib/utils/openTarget';
import { buildWorkspaceTree, compareWorkspaceTitles } from '@/lib/workspaces/tree';
import { useBlocksStore } from '@/stores/blocksStore';
import { useThreadsStore } from '@/stores/threadsStore';
import { toast } from '@/stores/toastStore';
import { useWorkspacesStore } from '@/stores/workspacesStore';

// Everything the workspace pack dialog needs, gathered for the workspace whose 打包 icon was
// clicked. Same division of labour as PackHost: the dialog is a pure renderer over data this
// component fetches, and it is mounted once in App so two rails cannot stack two dialogs.
//
// ⚠️ The projects of a workspace being packed have mostly never been OPENED, so their blocks
// are not in the store. They are loaded here, all of them, before the dialog renders — an
// export that quietly skipped the projects that happened not to be loaded would be the
// 「不能损失信息」 failure with a progress bar in front of it.

export default function WorkspacePackHost() {
  const packingId = useWorkspacesStore((s) => s.packingId);
  const setPacking = useWorkspacesStore((s) => s.setPacking);
  const workspaces = useWorkspacesStore((s) => s.workspaces);
  const threadsByWs = useThreadsStore((s) => s.threadsByWorkspace);
  const loadBlocks = useBlocksStore((s) => s.load);
  const byThread = useBlocksStore((s) => s.byThread);
  const attachmentsByThread = useBlocksStore((s) => s.attachmentsByThread);

  // The workspace subtree being packed, as ids — computed before any loading so the effect
  // below knows exactly which projects it has to have.
  const subtree = useMemo(() => {
    if (!packingId) return null;
    const sorted = [...workspaces].sort(compareWorkspaceTitles);
    const find = (
      nodes: ReturnType<typeof buildWorkspaceTree>,
    ): ReturnType<typeof buildWorkspaceTree>[number] | null => {
      for (const n of nodes) {
        if (n.workspace.id === packingId) return n;
        const hit = find(n.children);
        if (hit) return hit;
      }
      return null;
    };
    return find(buildWorkspaceTree(sorted));
  }, [packingId, workspaces]);

  const threadIds = useMemo(() => {
    if (!subtree) return [];
    const out: string[] = [];
    const walk = (node: typeof subtree): void => {
      for (const th of threadsByWs[node.workspace.id] ?? []) out.push(th.id);
      node.children.forEach(walk);
    };
    walk(subtree);
    return out;
  }, [subtree, threadsByWs]);

  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!packingId) return;
    const missing = threadIds.filter((id) => !useBlocksStore.getState().byThread[id]);
    if (missing.length === 0) return;
    setLoading(true);
    void Promise.all(missing.map((id) => loadBlocks(id)))
      .catch((e) => {
        console.error('[workspace-pack] loading blocks failed', e);
        toast.error(t('读不出项目内容，导出取消了'));
        setPacking(null);
      })
      .finally(() => setLoading(false));
  }, [packingId, threadIds, loadBlocks, setPacking]);

  const refTitles = useMemo(() => {
    const map = new Map<string, string>();
    for (const list of Object.values(threadsByWs)) {
      for (const th of list) map.set(th.id, th.title || t('（无标题）'));
    }
    return map;
  }, [threadsByWs]);

  // Blocks cited from anywhere in the export — including projects that are NOT being packed,
  // which is why they are fetched by id rather than read out of the store.
  const [refBlocks, setRefBlocks] = useState<Map<string, CitedBlock>>(() => new Map());
  useEffect(() => {
    if (!packingId || loading) return;
    const ids = [
      ...new Set(
        threadIds
          .flatMap((id) => byThread[id] ?? [])
          .map((b) => b.refBlockId)
          .filter((id): id is string => !!id),
      ),
    ];
    if (ids.length === 0) {
      setRefBlocks(new Map());
      return;
    }
    let stale = false;
    void listBlocksByIds(ids).then((rows) => {
      if (stale) return;
      setRefBlocks(
        new Map(
          rows.map((b) => [
            b.id,
            {
              content: b.content,
              annotation: b.annotation,
              annotationIsAi: annotationIsAi(b.annotationBy, b.source),
              createdAt: b.createdAt,
            },
          ]),
        ),
      );
    });
    return () => {
      stale = true;
    };
  }, [packingId, loading, threadIds, byThread]);

  const tree = useMemo((): PackTreeNode | null => {
    if (!subtree) return null;
    const build = (node: typeof subtree): PackTreeNode => ({
      id: node.workspace.id,
      title: node.workspace.title,
      projects: (threadsByWs[node.workspace.id] ?? []).map((thread) => ({
        thread,
        blocks: byThread[thread.id] ?? [],
        attachments: attachmentsByThread[thread.id] ?? [],
      })),
      children: node.children.map(build),
    });
    return build(subtree);
  }, [subtree, threadsByWs, byThread, attachmentsByThread]);

  if (!packingId || !tree || loading) return null;

  const onExport = async (folderName: string, files: PackFile[]): Promise<void> => {
    // Ocean 2026-08-17: the folder is going to be handed to Claude Code / Codex, so where it
    // lands is his call rather than a fixed Desktop drop.
    const parent = await open({ directory: true, multiple: false, title: t('导出到哪个文件夹？') });
    if (parent == null) return; // cancelled — not an error, and the dialog stays open
    const root = await invoke<string>('write_pack_folder', {
      parent,
      folderName,
      // ⚠️ threadId is ours, not the writer's — the command takes bytes and a path.
      files: files.map((f) => ({ path: f.path, content: f.content })),
    });
    setPacking(null);
    toast.action(t('已导出 {n} 个文件', { n: files.length }), t('打开文件夹'), () => {
      void openTarget(root).catch((e) => console.warn('[workspace-pack] reveal failed', e));
    });
  };

  return (
    <WorkspacePackDialog
      tree={tree}
      refTitles={refTitles}
      refBlocks={refBlocks}
      onExport={onExport}
      onClose={() => setPacking(null)}
    />
  );
}
