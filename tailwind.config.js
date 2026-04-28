/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{vue,ts,js,html}'],
  theme: {
    extend: {
      colors: {
        brand: { DEFAULT: '#e74c3c', dark: '#c0392b' },
      },
    },
  },
  plugins: [],
};
