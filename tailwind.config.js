/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './overlay.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        paper: 'var(--paper)',
        'paper-2': 'var(--paper-2)',
        ink: 'var(--ink)',
        'ink-2': 'var(--ink-2)',
        muted: 'var(--muted)',
        line: 'var(--line)',
        'line-strong': 'var(--line-strong)',
        accent: 'var(--accent)',
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
