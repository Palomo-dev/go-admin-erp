/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Paleta de azules para el tema principal
        primary: {
          50: '#e6f1ff',
          100: '#cce3ff',
          200: '#99c7ff',
          300: '#66aaff',
          400: '#338eff',
          500: '#0072ff', // Color azul principal
          600: '#005be6',
          700: '#0044cc',
          800: '#002e99',
          900: '#001766',
          950: '#000d33',
        },
        // Colores para tema oscuro
        dark: {
          background: '#0f172a',
          card: '#1e293b',
          border: '#334155',
          text: '#f8fafc',
        },
        // Colores para tema claro
        light: {
          background: '#f8fafc',
          card: '#ffffff',
          border: '#e2e8f0',
          text: '#0f172a',
        },
      },
    },
  },
  plugins: [],
}
