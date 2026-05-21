import { Check, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import type { MouseEvent } from 'react';

interface Props {
  onConfirm: () => void;
  title: string;
  size?: number;
  // Extra classes for the resting trash icon — e.g. `invisible group-hover:visible` so it
  // only appears on row hover. The armed confirm state ignores this and stays visible.
  className?: string;
}

// Two-step delete control: a trash icon that, on click, arms an inline ✓ / ✕ confirm
// (matching the GeneralConfig clear-data pattern). Stops event propagation so clicking it
// inside a clickable row (thread / workspace) never also selects that row.
export default function DeleteButton({ onConfirm, title, size = 12, className = '' }: Props) {
  const [armed, setArmed] = useState(false);

  const stop = (e: MouseEvent): void => {
    e.stopPropagation();
    e.preventDefault();
  };

  if (armed) {
    return (
      <span className="flex flex-none items-center gap-0.5" onClick={stop}>
        <button
          type="button"
          onClick={(e) => {
            stop(e);
            setArmed(false);
            onConfirm();
          }}
          className="rounded p-0.5 hover:bg-paper-2"
          style={{ color: 'var(--urgent)' }}
          aria-label="确认删除"
          title="确认删除"
        >
          <Check size={size} />
        </button>
        <button
          type="button"
          onClick={(e) => {
            stop(e);
            setArmed(false);
          }}
          className="rounded p-0.5 text-muted hover:bg-paper-2 hover:text-ink"
          aria-label="取消"
          title="取消"
        >
          <X size={size} />
        </button>
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        stop(e);
        setArmed(true);
      }}
      className={`flex-none rounded p-0.5 text-muted hover:bg-paper-2 ${className}`}
      aria-label={title}
      title={title}
    >
      <Trash2 size={size} />
    </button>
  );
}
