import { useT } from '@/lib/i18n';
import { useRailDragStore } from '@/stores/railDragStore';

// What follows the cursor during a rail drag. The browser drew this for free while the row
// was `draggable`; it is not draggable any more (see lib/sidebar/railDrag for why), and a
// drag with nothing under the cursor reads as 「没反应」 — which is exactly the complaint
// that started this.
//
// ⚠️ `pointer-events-none` is load-bearing: the drag hit-tests with elementFromPoint, and a
// ghost sitting under the cursor would be the only thing it ever found.
export default function RailDragGhost() {
  const t = useT();
  const ids = useRailDragStore((s) => s.ids);
  const label = useRailDragStore((s) => s.label);
  const x = useRailDragStore((s) => s.x);
  const y = useRailDragStore((s) => s.y);

  if (ids.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed z-50 max-w-[220px] truncate rounded-md border border-accent/60 bg-paper px-2 py-1 text-xs text-ink shadow-[var(--shadow-card)]"
      style={{ left: x + 12, top: y + 10 }}
    >
      {ids.length > 1 ? t('{n} 个项目', { n: ids.length }) : label}
    </div>
  );
}
