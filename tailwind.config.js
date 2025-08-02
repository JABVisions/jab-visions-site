/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",     // For app dir structure
    "./pages/**/*.{js,ts,jsx,tsx}",   // If using /pages
    "./components/**/*.{js,ts,jsx,tsx}", // Optional: if you have components
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
