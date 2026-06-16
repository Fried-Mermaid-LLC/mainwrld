/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './index.tsx',
    './App.tsx',
    './app/**/*.{ts,tsx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        accent: '#eb6871',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        display: ['Fredoka One', 'cursive'],
        telegraf: ['Telegraf', 'Inter', 'sans-serif'],
      },
      // iOS safe-area utilities. Tailwind doesn't ship these by default;
      // exposing them as spacing/padding utilities lets us write e.g.
      // `pt-safe-top` for `padding-top: env(safe-area-inset-top)`.
      spacing: {
        'safe-top': 'env(safe-area-inset-top)',
        'safe-bottom': 'env(safe-area-inset-bottom)',
        'safe-left': 'env(safe-area-inset-left)',
        'safe-right': 'env(safe-area-inset-right)',
      },
      height: {
        dvh: '100dvh',
      },
      minHeight: {
        dvh: '100dvh',
      },
    },
  },
  plugins: [],
}
