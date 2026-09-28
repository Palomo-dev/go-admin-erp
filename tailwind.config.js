const tema = require('./src/styles/tailwind-theme');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
    // Clases que viven en utilidades y catálogos (colores de organización,
    // catálogo de navegación): sin esto Tailwind no las generaba.
    './src/lib/**/*.{js,ts,jsx,tsx}',
    './src/config/**/*.{js,ts,jsx,tsx}',
  ],
  // Activamos el modo oscuro con clase para tener más control
  darkMode: 'class',
  theme: {
    extend: {
      screens: {
        'xs': '475px',  // Extra small breakpoint for better mobile responsiveness
      },
      // Colores, borde por defecto y medidas del sistema de diseño: salen de
      // src/styles/tailwind-theme.js, que a su vez lee los tokens de Figma
      // (src/styles/tokens.css). No se añaden colores sueltos aquí.
      colors: tema.colors,
      borderColor: tema.borderColor,
      spacing: tema.spacing,
      // Animaciones para notificaciones en tiempo real
      animation: {
        'slide-in-right': 'slideInRight 0.3s ease-out',
        'fade-in': 'fadeIn 0.2s ease-in',
        'bounce-gentle': 'bounceGentle 0.6s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
        'pop-in': 'scaleGlow 0.9s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'draw-check': 'drawCheck 0.5s 0.4s ease-out forwards',
        'accordion-down': 'accordionDown 0.2s ease-out',
        'accordion-up': 'accordionUp 0.2s ease-out',
      },
      keyframes: {
        slideInRight: {
          '0%': { transform: 'translateX(100%)', opacity: '0' },
          '100%': { transform: 'translateX(0)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        bounceGentle: {
          '0%, 20%, 53%, 80%, 100%': { transform: 'translateY(0)' },
          '40%, 43%': { transform: 'translateY(-4px)' },
          '70%': { transform: 'translateY(-2px)' },
        },
        slideUp: {
          '0%': { transform: 'translateY(100%)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        scaleGlow: {
          '0%': { transform: 'scale(0)', opacity: '0', filter: 'drop-shadow(0 0 0 rgba(34, 197, 94, 0))' },
          '50%': { transform: 'scale(1.1)', opacity: '1', filter: 'drop-shadow(0 0 12px rgba(34, 197, 94, 0.6))' },
          '70%': { transform: 'scale(0.97)', filter: 'drop-shadow(0 0 8px rgba(34, 197, 94, 0.4))' },
          '100%': { transform: 'scale(1)', filter: 'drop-shadow(0 0 0 rgba(34, 197, 94, 0))' },
        },
        drawCheck: {
          '0%': { strokeDashoffset: '60' },
          '100%': { strokeDashoffset: '0' },
        },
        accordionDown: {
          from: { height: '0', opacity: '0' },
          to: { height: 'var(--radix-accordion-content-height)', opacity: '1' },
        },
        accordionUp: {
          from: { height: 'var(--radix-accordion-content-height)', opacity: '1' },
          to: { height: '0', opacity: '0' },
        },
      },
    },
  },
  plugins: [],
}
