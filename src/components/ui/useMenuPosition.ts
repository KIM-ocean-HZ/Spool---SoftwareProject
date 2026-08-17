import { useLayoutEffect, useRef, useState } from 'react';

// Keeping a cursor-anchored menu inside the window.
//
// ⚠️ Both right-click menus in the rail (project rows and workspace headings) are
// `position: fixed` at the cursor. Ocean 2026-08-17: 「最底下的工作区点右键显示不全，甚至无法
// 删除」— for a row near the bottom of the screen the menu simply extended past the edge, and
// 删除 is the LAST item, so the one action that has no other route was the first to be cut off.
//
// The measure has to happen after the menu is in the DOM (its height depends on how many
// workspaces the move list holds), so it renders hidden for one layout pass and is placed
// before the browser paints — a layout effect's state update is flushed synchronously.

const MARGIN_PX = 8;

export function useMenuPosition(anchor: { x: number; y: number } | null): {
  ref: React.RefObject<HTMLDivElement>;
  style: React.CSSProperties;
} {
  const ref = useRef<HTMLDivElement>(null);
  const [placed, setPlaced] = useState<{ x: number; y: number } | null>(null);

  useLayoutEffect(() => {
    if (!anchor || !ref.current) {
      setPlaced(null);
      return;
    }
    const r = ref.current.getBoundingClientRect();
    setPlaced({
      x: Math.max(MARGIN_PX, Math.min(anchor.x, window.innerWidth - r.width - MARGIN_PX)),
      y: Math.max(MARGIN_PX, Math.min(anchor.y, window.innerHeight - r.height - MARGIN_PX)),
    });
    // The anchor object is rebuilt every render; its two numbers are what actually changed.
  }, [anchor?.x, anchor?.y]);

  return {
    ref,
    style: {
      left: placed?.x ?? anchor?.x ?? 0,
      top: placed?.y ?? anchor?.y ?? 0,
      // ⚠️ Hidden rather than unmounted: it has to be laid out to be measured.
      visibility: placed ? 'visible' : 'hidden',
    },
  };
}
