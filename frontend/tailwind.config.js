/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: "#eef2ff",
          100: "#e0e7ff",
          200: "#c7d2fe",
          300: "#a5b4fc",
          400: "#818cf8",
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
          800: "#3730a3",
          900: "#312e81",
        },
        bg: {
          surface: "rgba(255,255,255,0.95)",
          dark: "#1a1a2e",
        },
      },
      fontFamily: {
        sans: ["Noto Sans Bengali", "Noto Sans", "sans-serif"],
      },
    },
  },
  plugins: [],
};
