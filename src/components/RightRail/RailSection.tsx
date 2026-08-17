import type { ReactNode } from 'react';
import SectionLabel from '@/components/Sidebar/SectionLabel';

// The one definition of what a standing section in the right rail looks like.
//
// ⚠️ Ocean 2026-08-17: 「跟进和项目文件还有 ai 写的块使用的组件完全不同，看起来很乱，字体大小
// 也不一样，需要把风格做成和左侧边栏统一」. Measured before the change, the three were:
//
//   跟进内容    a bordered card (`rounded-md border p-2.5`), 12px heading, 12px body
//   项目文件    a top rule (`border-t pt-2.5`),               11px heading, 12px body
//   AI 写的块   a top rule with the heading INSIDE a fold,    11px heading, 11px body
//
// — three containers, three heading treatments and four type sizes in one 340px column.
//
// ⚠️⚠️ That pass unified the headings and, without being asked to, took the BODIES up to
// `text-sm` (14px). Ocean 2026-08-17, next install: 「右侧边栏的字体大小和左侧边栏要一致，
// 现在字体有点大……尤其是跟进里面的内容，需要和工作区的文字一样大」. The bodies are back at
// **12px** — which is both what the table above says they were, and what a workspace name in
// the left rail is (`SectionLabel`). Rows: 跟进 (index.tsx), 项目文件 (ProjectFiles.tsx),
// AI 写的块 (index.tsx). ⭐ A pass that unifies one dimension must not quietly move another:
// nothing in 「统一风格」 asked for bigger type, and the regression outlived the window that
// caused it because the only record of the old size was this comment.
//
// ⭐ The heading is `Sidebar/SectionLabel` itself, not a copy of it. That file says in so many
// words that a fourth kind of section should use it rather than grow a fourth style, and what
// it really enforces is the LEFT EDGE: heading and rows share the row padding, so everything
// in a rail lines up on one vertical. Using it here is what makes 「和左侧边栏统一」 a fact
// about the code rather than two files that happen to agree today.
//
// ⚠️ **No frame.** The 跟进 panel had one at Ocean's request (2026-08-11: 「右侧边栏的跟进窗口
// 做成有框线的」), and the reason given for it was that everything ELSE in this column is a run
// that came and will go, while this is a standing statement. That distinction survives — the
// run cards above are still cards — but it is no longer carried by a box around one of three
// sections that are all standing statements. Boxing all three instead would land back on
// 「矩形结构太多，没有空间呼吸感」 (2026-08-11, the brief for §9.13), so the rule between
// sections carries the separation and the whitespace carries the breathing.
interface Props {
  title: string;
  /** Optional control on the heading line — 编辑 / 加文件. Right-aligned by the flex row. */
  action?: ReactNode;
  children: ReactNode;
}

export default function RailSection({ title, action, children }: Props) {
  // ⚠️ `first:` is not decoration: McpBar draws its own `border-b`, so the first standing
  // section would otherwise put a second hairline 12px under it. The rule belongs BETWEEN
  // sections, and the first one has nothing above it to be separated from — whatever
  // precedes it (a run card, the bar) already ends in an edge of its own.
  return (
    <section className="border-t border-line pt-3 first:border-t-0 first:pt-0">
      <SectionLabel>
        <span className="min-w-0 flex-1 truncate">{title}</span>
        {action}
      </SectionLabel>
      {children}
    </section>
  );
}
