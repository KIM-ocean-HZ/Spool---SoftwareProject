import { RotateCcw } from 'lucide-react';

// §9.13 / §13.2 — undo-confirmation card. Same look as the capture overlay's inline undo
// card. Presentational only: the parent owns visibility + auto-dismiss timing.
export interface UndoToastProps {
  label: string;
  preview?: string;
}

export default function UndoToast({ label, preview }: UndoToastProps) {
  return (
    <div
      role="status"
      className="flex items-center gap-2 rounded-lg border border-line-strong bg-paper px-3 py-2"
      style={{ boxShadow: 'var(--shadow-toast)' }}
    >
      <RotateCcw size={12} className="shrink-0 text-muted" />
      <span className="shrink-0 font-ui text-[12px] text-ink">{label}</span>
      {preview && (
        <span className="min-w-0 truncate font-ui text-[11px] text-muted">「{preview}」</span>
      )}
    </div>
  );
}
