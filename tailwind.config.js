/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Heebo', 'Rubik', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
