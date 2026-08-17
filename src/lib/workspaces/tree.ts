import type { Workspace } from '@/lib/db/workspaces';

// backlog §1.3 #1 (Ocean 2026-08-15「左侧边栏按首字母排序」, scoped to workspaces on
// 2026-08-17 — project rows keep 「快到期的排最前」, which is the more valuable signal).
//
// `localeCompare(…, 'zh')` is pinyin order for 汉字 and A–Z for Latin, which is what 首字母
// means for a library holding both. ⚠️ Whether a 汉字 name sorts before or after a Latin one
// is the collation's call, not ours, and it can differ between node (the test runtime) and
// the macOS WebView (the app) — so nothing depends on that half, and the tests do not pin it.
// ⚠️ A workspace with no name yet sorts LAST, not first:
// the ＋ button at the bottom of the rail creates an empty one, and an empty string sorts
// before everything — the new row would appear at the top, nowhere near the click.
export const compareWorkspaceTitles = (a: { title: string }, b: { title: string }): number => {
  const at = a.title.trim();
  const bt = b.title.trim();
  if (at === '' || bt === '') return at === bt ? 0 : at === '' ? 1 : -1;
  return at.localeCompare(bt, 'zh');
};

export interface WorkspaceNode {
  workspace: Workspace;
  children: WorkspaceNode[];
  /** 0 at the top level. The rail uses it to decide how deep a group is drawn. */
  depth: number;
}

// DESIGN_WORKSPACE_PACK §4 (v23) — turn the flat row list into the tree the rail draws.
//
// ⚠️ The whole job of this function is that NOTHING FALLS OUT. `listWorkspaces` is the only
// thing the sidebar renders, so a workspace this function drops is a workspace the user can
// no longer see or reach, while its projects sit in the database looking fine. Two ways a
// row can lose its place, and both end with it back at the top level rather than gone:
//
//   - **orphan** — `parentId` names a row that is not in the list (soft-deleted out from
//     under it, or a library edited by hand). The delete cascade is supposed to make this
//     impossible; if it ever happens anyway, the user still gets their workspace back.
//   - **ring** — a workspace nested inside its own descendant. `setWorkspaceParent` refuses
//     to build one, so this is the second line of defence, not the first.
//
// Sibling order is the order the rows arrive in (sort_order, then created_at — see
// listWorkspaces), so ordering stays one decision made in SQL.
export const buildWorkspaceTree = (workspaces: Workspace[]): WorkspaceNode[] => {
  const byId = new Map(workspaces.map((w) => [w.id, w]));

  // Which rows actually hang off the root. Walking up from each row settles orphans and
  // rings in one pass: a walk that runs out of parents is an orphan, a walk that revisits a
  // row it already stepped through is a ring. Either way the row it started from is treated
  // as top-level.
  const isRooted = (w: Workspace): boolean => {
    const seen = new Set<string>([w.id]);
    let cur = w;
    while (cur.parentId !== null) {
      const parent = byId.get(cur.parentId);
      if (!parent) return false; // orphan
      if (seen.has(parent.id)) return false; // ring
      seen.add(parent.id);
      cur = parent;
    }
    return true;
  };

  const nodes = new Map<string, WorkspaceNode>(
    workspaces.map((w) => [w.id, { workspace: w, children: [], depth: 0 }]),
  );
  const roots: WorkspaceNode[] = [];

  for (const w of workspaces) {
    const node = nodes.get(w.id)!;
    const parent = w.parentId === null ? null : nodes.get(w.parentId);
    if (parent && isRooted(w)) {
      parent.children.push(node);
    } else {
      roots.push(node);
    }
  }

  const stamp = (node: WorkspaceNode, depth: number): void => {
    node.depth = depth;
    for (const c of node.children) stamp(c, depth + 1);
  };
  for (const r of roots) stamp(r, 0);

  return roots;
};
