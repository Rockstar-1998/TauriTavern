import type { Config } from 'tailwindcss';

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: '#0f172a',
        panel: '#111827',
        card: '#1f2937',
        border: '#334155',
        brand: '#22c55e',
        accent: '#38bdf8',
      },
      boxShadow: {
        soft: '0 10px 30px rgba(15, 23, 42, 0.35)',
      },
      borderRadius: {
        xl: '1rem',
      },
    },
  },
  plugins: [],
} satisfies Config;
