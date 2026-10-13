import type { Config } from 'tailwindcss';

export default {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './store/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: { 50: '#eef5ff', 100: '#d9e8ff', 200: '#b6d2fb', 300: '#86b6ef', 400: '#4d8fe0', 500: '#1f6fd0', 600: '#0E4DA4', 700: '#0A3D86', 800: '#0A3577', 900: '#0b2a5c' },
        accent: { 400: '#f6a552', 500: '#F28C28', 600: '#d9731a' },
      },
      fontFamily: {
        sans: ['ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Inter', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
      boxShadow: {
        glass: '0 1px 0 0 rgba(255,255,255,.5) inset, 0 8px 24px -12px rgba(15,23,42,.18)',
      },
    },
  },
  plugins: [],
} satisfies Config;
