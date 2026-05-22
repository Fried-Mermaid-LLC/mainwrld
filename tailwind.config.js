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
    },
  },
  plugins: [],
}
