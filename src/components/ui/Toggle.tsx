interface Props {
  checked: boolean;
  onChange: (value: boolean) => void;
}

// A small on/off switch for the settings panel (§9.12). No label of its own — the
// caller pairs it with a description row.
export default function Toggle({ checked, onChange }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative h-5 w-9 flex-none rounded-full transition-colors ${
        checked ? 'bg-accent' : 'bg-line-strong'
      }`}
    >
      <span
        className={`absolute top-0.5 h-4 w-4 rounded-full bg-paper transition-all ${
          checked ? 'left-[18px]' : 'left-0.5'
        }`}
      />
    </button>
  );
}
