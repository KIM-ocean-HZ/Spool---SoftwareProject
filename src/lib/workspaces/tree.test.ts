import { describe, expect, it } from 'vitest';
import type { Workspace } from '@/lib/db/workspaces';
import { buildWorkspaceTree, compareWorkspaceTitles } from './tree';

const ws = (id: string, parentId: string | null = null): Workspace => ({
  id,
  title: id,
  parentId,
  sortOrder: 0,
  createdAt: 0,
  updatedAt: 0,
});

// Flattened back to `id@depth` — what the rail would draw, top to bottom.
const outline = (workspaces: Workspace[]): string[] => {
  const out: string[] = [];
  const walk = (nodes: ReturnType<typeof buildWorkspaceTree>): void => {
    for (const n of nodes) {
      out.push(`${n.workspace.id}@${n.depth}`);
      walk(n.children);
    }
  };
  walk(buildWorkspaceTree(workspaces));
  return out;
};

describe('buildWorkspaceTree (DESIGN_WORKSPACE_PACK §4)', () => {
  it('nests each workspace under the one it names, at any depth', () => {
    expect(outline([ws('升学'), ws('材料准备', '升学'), ws('文书', '材料准备'), ws('求职')])).toEqual([
      '升学@0',
      '材料准备@1',
      '文书@2',
      '求职@0',
    ]);
  });

  it('keeps the order the rows arrived in, level by level', () => {
    expect(outline([ws('b'), ws('a'), ws('b2', 'b'), ws('b1', 'b')])).toEqual([
      'b@0',
      'b2@1',
      'b1@1',
      'a@0',
    ]);
  });

  // ⚠️ The failure being prevented is silent: a row the tree drops is a workspace the user
  // can no longer see or reach, with its projects still in the database. Coming back at the
  // top level is visibly wrong; vanishing is not visible at all.
  it('shows a workspace whose parent is gone instead of dropping it', () => {
    expect(outline([ws('材料准备', '升学-已删')])).toEqual(['材料准备@0']);
  });

  it('shows every workspace in a ring instead of looping', () => {
    expect(outline([ws('a', 'b'), ws('b', 'a')])).toEqual(['a@0', 'b@0']);
  });

  // The rule is「nested only if the chain above it reaches the top」, so a workspace hanging
  // off a ring surfaces too. Its nesting is lost, which is visible and fixable; the
  // alternative — drawing it inside a parent that is itself drawn out of place — hides that
  // the data is broken.
  it('surfaces a workspace whose chain never reaches the top', () => {
    expect(outline([ws('a', 'b'), ws('b', 'a'), ws('c', 'a')])).toEqual(['a@0', 'b@0', 'c@0']);
  });

  it('has nothing to draw for an empty library', () => {
    expect(buildWorkspaceTree([])).toEqual([]);
  });

  // Sorting the flat list sorts every level at once, because the tree keeps input order.
  it('sorts each level when the list arrives sorted', () => {
    const flat = [ws('求职'), ws('升学'), ws('文书', '升学'), ws('材料准备', '升学')].sort(
      compareWorkspaceTitles,
    );
    expect(outline(flat)).toEqual(['求职@0', '升学@0', '材料准备@1', '文书@1']);
  });
});

describe('compareWorkspaceTitles (backlog §1.3 #1)', () => {
  const sorted = (titles: string[]): string[] =>
    [...titles].sort((a, b) => compareWorkspaceTitles({ title: a }, { title: b }));

  // ⚠️⚠️ Only WITHIN one script. Whether 汉字 sort before or after Latin is the collation's
  // call, and this suite runs on node's ICU while the app runs on the macOS WebView's —
  // pinning a mixed-script order here would be asserting the platform, and it can differ
  // between the two without anything in Spool changing.
  it('orders 汉字 by pinyin', () => {
    expect(sorted(['求职', '升学', '材料准备'])).toEqual(['材料准备', '求职', '升学']);
  });

  it('orders Latin by letter, ignoring case', () => {
    expect(sorted(['Flux', 'apply', 'Zebra'])).toEqual(['apply', 'Flux', 'Zebra']);
  });

  // ⚠️ The ＋ at the bottom of the rail makes an untitled workspace. Sorting '' first would
  // land the new row at the top of the list, nowhere near the button that made it.
  it('keeps a workspace with no name yet at the bottom', () => {
    expect(sorted(['求职', '', '材料准备'])).toEqual(['材料准备', '求职', '']);
  });
});
