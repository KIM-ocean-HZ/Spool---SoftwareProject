import { useState } from 'react';
import { useT } from '@/lib/i18n';

interface Props {
  /** Says exactly what goes, counted when it is more than one. */
  label: string;
  onConfirm: () => void;
}

// Two-step delete as a MENU ROW, for the context menus that took over from the hover 🗑
// (Ocean 2026-08-17: 「把删除键放到右键点击之后，左侧边栏不直接显示」).
//
// Same two steps as ui/DeleteButton — arm, then confirm — and deliberately not a dialog: the
// second step has to be cheap, because the first one now costs a right-click. What it adds
// over the icon is WORDS: an icon cannot say 「这 5 个」, and with multi-select that is the
// whole question the user needs answered before clicking.
export default function MenuDeleteItem({ label, onConfirm }: Props) {
  const t = useT();
  const [armed, setArmed] = useState(false);

  if (armed) {
    return (
      <div className="flex items-center gap-2 px-3 py-1">
        <button
          type="button"
          role="menuitem"
          onClick={onConfirm}
          className="text-xs font-medium"
          style={{ color: 'var(--urgent)' }}
        >
          {t('确认删除')}
        </button>
        <button
          type="button"
          onClick={() => setArmed(false)}
          className="text-xs text-muted hover:text-ink"
        >
          {t('取消')}
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      role="menuitem"
      onClick={() => setArmed(true)}
      className="block w-full px-3 py-1 text-left text-xs hover:bg-paper-2"
      style={{ color: 'var(--urgent)' }}
    >
      {label}
    </button>
  );
}
