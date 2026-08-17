import type { MouseEventHandler, ReactNode } from 'react';
import { useLanguage } from '@/lib/i18n';

// The one definition of what a heading in the left rail looks like.
//
// It exists because there used to be three of them (Ocean 2026-08-11: 「左侧边栏没有严谨的
// 结构，很散乱，不整齐」). 最近/聚焦 had a 10.5px grey label over a `border-b`; 项目管理/周回顾
// had no heading at all; workspaces had a 16px serif name with a chevron in front of it — and
// because the chevron and the wrappers each added their own padding, the same thing (a project
// row) sat at three different left edges depending on which section it was in.
//
// ⚠️ So the rule this file enforces is not really the type — it is the LEFT EDGE. A heading
// carries no padding of its own beyond `px-3`, which is the row padding, so every label and
// every row in the rail line up on one vertical. Anything that needs to sit before the name
// (a chevron, an icon) goes AFTER it instead. If you add a fourth kind of section, use this;
// if it cannot use this, that is the signal to ask rather than to write a fourth style.
//
// ⚠️⚠️ ONE exception, and it is not a lapse: v23 nested workspaces are INDENTED per level
// (WorkspaceGroup's `pl-3`). Ocean 2026-08-17, after seeing the alternative installed:
// 「竖线体现不出文件夹的从属关系，尤其是项目数量多的时候」.
//
// The rule survives because of WHAT it was aimed at. 2026-08-11 the complaint was that the
// same kind of thing — a project row — stood on three different verticals depending on which
// section happened to draw it: an inconsistency that carried no information. An indent under
// a workspace carries exactly one piece of information, which is the thing the user is trying
// to read. Top level is untouched: 最近, 聚焦 and every top-level workspace still share one
// edge, and within any one level the rows still do. So: a row may only be moved off the rail's
// left edge by DEPTH. If you find yourself indenting for any other reason, that is the fourth
// style again — come ask.
interface Props {
  children: ReactNode;
  /** v23: workspace headings carry a right-click menu (move into / out of a folder). */
  onContextMenu?: MouseEventHandler<HTMLDivElement>;
  /** EN section labels go uppercase (DESIGN_EN_TYPOGRAPHY 待拍板 A): at 10.5px a lowercase
   *  Latin word reads smaller than the same-size 汉字, and tracking-wide only looks right on
   *  caps. ⚠️ Workspace headings pass false — a workspace name is the user's own text, and
   *  「Flux」 rendered as 「FLUX」 is us editing their data to suit our typography. */
  uppercaseInEn?: boolean;
  className?: string;
}

export default function SectionLabel({
  children,
  uppercaseInEn = true,
  className = '',
  onContextMenu,
}: Props) {
  const lang = useLanguage();
  return (
    <div
      onContextMenu={onContextMenu}
      className={`flex items-center gap-1.5 px-3 pb-1 text-[12px] tracking-wide text-muted ${
        uppercaseInEn && lang === 'en' ? 'uppercase' : ''
      } ${className}`}
    >
      {children}
    </div>
  );
}
