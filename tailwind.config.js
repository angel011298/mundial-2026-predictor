/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Acentos de marca: verde esmeralda (éxito/acción) + violeta eléctrico (datos/IA)
        brand: {
          emerald: '#10b981',
          'emerald-soft': '#34d399',
          violet: '#8b5cf6',
          'violet-soft': '#a78bfa',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        // Resplandor sutil para tarjetas premium tipo "trading"
        glow: '0 0 0 1px rgba(255,255,255,0.04), 0 8px 30px -12px rgba(16,185,129,0.25)',
        'glow-violet': '0 0 0 1px rgba(255,255,255,0.04), 0 8px 30px -12px rgba(139,92,246,0.30)',
      },
      keyframes: {
        'pulse-ring': {
          '0%': { boxShadow: '0 0 0 0 rgba(16,185,129,0.45)' },
          '70%': { boxShadow: '0 0 0 12px rgba(16,185,129,0)' },
          '100%': { boxShadow: '0 0 0 0 rgba(16,185,129,0)' },
        },
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'bar-grow': {
          '0%': { transform: 'scaleX(0)' },
          '100%': { transform: 'scaleX(1)' },
        },
      },
      animation: {
        'pulse-ring': 'pulse-ring 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-up': 'fade-up 0.4s ease-out both',
        'bar-grow': 'bar-grow 0.7s cubic-bezier(0.16, 1, 0.3, 1) both',
      },
    },
  },
  plugins: [],
};
