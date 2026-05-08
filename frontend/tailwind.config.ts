import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#7c3aed', foreground: '#ffffff' },
        success: '#10b981',
        warning: '#f59e0b',
        danger: '#f43f5e',
      },
      borderRadius: {
        xl: '0.75rem',
        lg: '0.5rem',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;
