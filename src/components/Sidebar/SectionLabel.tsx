import type { ReactNode } from 'react';
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
interface Props {
  children: ReactNode;
  /** EN section labels go uppercase (DESIGN_EN_TYPOGRAPHY 待拍板 A): at 10.5px a lowercase
   *  Latin word reads smaller than the same-size 汉字, and tracking-wide only looks right on
   *  caps. ⚠️ Workspace headings pass false — a workspace name is the user's own text, and
   *  「Flux」 rendered as 「FLUX」 is us editing their data to suit our typography. */
  uppercaseInEn?: boolean;
  className?: string;
}

export default function SectionLabel({ children, uppercaseInEn = true, className = '' }: Props) {
  const lang = useLanguage();
  return (
    <div
      className={`flex items-center gap-1.5 px-3 pb-1 text-[10.5px] tracking-wide text-muted ${
        uppercaseInEn && lang === 'en' ? 'uppercase' : ''
      } ${className}`}
    >
      {children}
    </div>
  );
}
