import { useCallback, useEffect, useRef } from 'react';

// DESIGN_WORKBENCH §3 — the draggable divider between a rail and the reading column.
//
// Two things it deliberately does NOT do:
//
//  * It does not write to settings on every pointer move. The width lives in settings.json
//    through tauri-plugin-store, i.e. a file; persisting per pixel would mean a few hundred
//    writes per drag. `onCommit` fires once, on release.
//  * It does not own the width. The parent does, so the same number drives the layout and
//    the persisted value, and there is no second copy to fall out of step mid-drag.
//
// Pointer capture rather than window listeners: the drag has to survive the cursor crossing
// the webview's edge or passing over an iframe, and releasing capture is automatic if the
// element unmounts under a held button.

interface Props {
  /** Which edge of the panel this handle sits on — decides which way a drag grows it. */
  side: 'left' | 'right';
  width: number;
  min: number;
  max: number;
  onResize: (next: number) => void;
  onCommit: (next: number) => void;
  label: string;
}

export default function ResizeHandle({ side, width, min, max, onResize, onCommit, label }: Props) {
  const startX = useRef(0);
  const startWidth = useRef(0);
  const latest = useRef(width);
  latest.current = width;

  const clamp = useCallback(
    (n: number): number => Math.min(max, Math.max(min, n)),
    [min, max],
  );

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    e.preventDefault();
    startX.current = e.clientX;
    startWidth.current = width;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    // A handle on the panel's right edge grows the panel as the cursor moves right; one on
    // the left edge (the right rail) grows it as the cursor moves left.
    const delta = side === 'right' ? e.clientX - startX.current : startX.current - e.clientX;
    onResize(clamp(startWidth.current + delta));
  };

  const endDrag = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    onCommit(latest.current);
  };

  // Keyboard resizing, because a divider that only answers to a mouse is not reachable.
  // Committed on every press: one keystroke is one deliberate adjustment, not a stream.
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>): void => {
    const step = e.shiftKey ? 40 : 8;
    const dir = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
    if (dir === 0) return;
    e.preventDefault();
    const next = clamp(width + (side === 'right' ? dir : -dir) * step);
    onResize(next);
    onCommit(next);
  };

  // While dragging, the whole window should show the resize cursor and stop selecting text
  // under the pointer — otherwise a drag across the thread view highlights it.
  const dragging = useRef(false);
  useEffect(() => {
    const stop = (): void => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.removeProperty('cursor');
      document.body.style.removeProperty('user-select');
    };
    window.addEventListener('pointerup', stop);
    return () => {
      window.removeEventListener('pointerup', stop);
      stop();
    };
  }, []);

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={width}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={(e) => {
        dragging.current = true;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
        onPointerDown(e);
      }}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onKeyDown={onKeyDown}
      // 5px of grab area over a 1px line: the visible divider stays hairline-thin, but the
      // target is wide enough to hit without aiming.
      className="group relative z-10 -mx-[2px] w-[5px] flex-none cursor-col-resize outline-none"
    >
      <div className="pointer-events-none absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-line transition-colors group-hover:bg-accent group-focus-visible:bg-accent" />
    </div>
  );
}
