/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './overlay.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // ⚠️ `rgb(var(--x-rgb) / <alpha-value>)`, not `var(--x)`. Tailwind cannot inject an
      // alpha channel into a variable that already holds a complete color: it silently drops
      // every `bg-ink/30`-style rule instead of erroring. The paired `--x` / `--x-rgb` tokens
      // live in src/styles/tokens.css — read the comment there before touching either side.
      colors: {
        paper: 'rgb(var(--paper-rgb) / <alpha-value>)',
        'paper-2': 'rgb(var(--paper-2-rgb) / <alpha-value>)',
        ink: 'rgb(var(--ink-rgb) / <alpha-value>)',
        'ink-2': 'rgb(var(--ink-2-rgb) / <alpha-value>)',
        muted: 'rgb(var(--muted-rgb) / <alpha-value>)',
        line: 'rgb(var(--line-rgb) / <alpha-value>)',
        'line-strong': 'rgb(var(--line-strong-rgb) / <alpha-value>)',
        accent: 'rgb(var(--accent-rgb) / <alpha-value>)',
      },
      fontFamily: {
        ui: 'var(--font-ui)',
        serif: 'var(--font-serif)',
        mono: 'var(--font-mono)',
      },
    },
  },
  plugins: [],
};
