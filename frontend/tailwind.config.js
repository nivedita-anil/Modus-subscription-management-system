/** @type {import('tailwindcss').Config} */
// Dark plum theme. The slate scale is inverted on purpose: existing classes such as
// text-slate-900 (headings) and bg-slate-50 (table heads) now resolve to light text and
// dark surfaces, so every screen follows the theme without being rewritten.
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["DM Sans", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["Space Grotesk", "DM Sans", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      colors: {
        slate: {
          50: "#26151f",
          100: "#2d1925",
          200: "#3a2530",
          300: "#4a3340",
          400: "#9a8491",
          500: "#aa929f",
          600: "#b9a4b1",
          700: "#d9ccd3",
          800: "#eee9ec",
          900: "#f7f2f5",
        },
        brand: {
          50: "#3a1b2d",
          100: "#5a2342",
          500: "#dc459a",
          600: "#c43584",
          700: "#ea63aa",
          900: "#772353",
        },
      },
    },
  },
  plugins: [],
};
