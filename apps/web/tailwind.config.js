/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  future: { hoverOnlyWhenSupported: true },
  theme: {
    extend: {
      screens: {
        md: '744px',
        short: { raw: '(max-height: 500px) and (orientation: landscape)' },
        touch: { raw: '(pointer: coarse)' },
      },
      colors: {
        primary: {
          DEFAULT: '#881337',
          hover: '#9f1239',
          tint: '#fda4af',
        },
        'on-primary': '#ffffff',
        'focus-ring': '#ff3366',
        'light-bg': '#f8fafc',
        'light-surface': '#ffffff',
        'light-surface-hover': '#f1f5f9',
        'light-border': '#e2e8f0',
        'light-text': '#0f172a',
        'light-text-muted': '#64748b',
        'dark-bg': '#0e111a',
        'dark-surface': '#151928',
        'dark-surface-hover': '#1d233a',
        'dark-border': '#242b45',
        'dark-text': '#ffffff',
        'dark-text-muted': '#929bb4',
        success: '#10b981',
        'success-text-light': '#047857',
        warning: '#f59e0b',
        'warning-text-light': '#b45309',
        danger: '#f43f5e',
        'danger-text-light': '#be123c',
        info: '#6366f1',
        'info-text-light': '#4338ca',
        'info-text-dark': '#a5b4fc',
      },
    },
  },
  plugins: [],
};

