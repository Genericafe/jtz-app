/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50:  '#f0fef4',
          100: '#dcfce8',
          200: '#bbf7d1',
          300: '#6ee89a',
          400: '#3dd870',
          500: '#00c940',   // JTZ Trail green
          600: '#00a834',
          700: '#008a2a',
          800: '#006e21',
          900: '#005519',
        },
        dark: {
          900: '#060608',
          800: '#0c0d10',
          700: '#121418',
          600: '#191c22',
        },
        surface: {
          50:  '#f8fafc',
          900: '#060608',
          800: '#0c0d10',
          700: '#121418',
          600: '#191c22',
          500: '#21252d',
          400: '#2c3039',
        },
      },
      fontFamily: { sans: ['Inter', 'ui-sans-serif', 'system-ui'] },
      backgroundImage: {
        'carrera':       'linear-gradient(135deg, #f97316 0%, #dc2626 100%)',
        'trail':         'linear-gradient(135deg, #00c940 0%, #009e32 100%)',
        'entrenamiento': 'linear-gradient(135deg, #3b82f6 0%, #4f46e5 100%)',
        'social':        'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)',
        'hero':          'linear-gradient(135deg, #00c940 0%, #00a834 50%, #007a26 100%)',
        'hero-diagonal': 'linear-gradient(135deg, #00c940 0%, #007a26 100%)',
        'glow-green':    'radial-gradient(ellipse at 50% 0%, rgba(0,201,64,0.15) 0%, transparent 70%)',
      },
      boxShadow: {
        'card':    '0 1px 3px rgba(0,0,0,0.5), 0 1px 2px rgba(0,0,0,0.4)',
        'glow-sm': '0 0 15px rgba(0,201,64,0.3)',
        'glow':    '0 0 30px rgba(0,201,64,0.35)',
        'glow-lg': '0 0 60px rgba(0,201,64,0.25)',
      },
      animation: {
        'fade-in':  'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.3s ease-out',
      },
      keyframes: {
        fadeIn:  { from: { opacity: '0' }, to: { opacity: '1' } },
        slideUp: { from: { opacity: '0', transform: 'translateY(10px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
      },
    },
  },
  plugins: [],
};
