/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // UTMB-inspired electric azure accent
        brand: {
          50:  '#eaf3ff',
          100: '#d3e6ff',
          200: '#a9ccff',
          300: '#73aaff',
          400: '#4084ff',
          500: '#1f6bff',   // primary azure
          600: '#0f52e6',
          700: '#0d41bd',
          800: '#103a97',
          900: '#122f6e',
        },
        // Deep navy-tinted darks (cinematic, not flat black)
        dark: {
          900: '#070a12',
          800: '#0b101d',
          700: '#111829',
          600: '#1a2338',
        },
        surface: {
          50:  '#f8fafc',
          900: '#070a12',
          800: '#0b101d',
          700: '#111829',
          600: '#1a2338',
          500: '#232f49',
          400: '#30405f',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui'],
        display: ['Space Grotesk', 'Inter', 'ui-sans-serif', 'system-ui'],
      },
      backgroundImage: {
        'carrera':       'linear-gradient(135deg, #f97316 0%, #dc2626 100%)',
        'trail':         'linear-gradient(135deg, #1f6bff 0%, #0d41bd 100%)',
        'entrenamiento': 'linear-gradient(135deg, #3b82f6 0%, #4f46e5 100%)',
        'social':        'linear-gradient(135deg, #a855f7 0%, #ec4899 100%)',
        'hero':          'linear-gradient(120deg, #4084ff 0%, #1f6bff 45%, #103a97 100%)',
        'hero-diagonal': 'linear-gradient(135deg, #1f6bff 0%, #103a97 100%)',
        'glow-green':    'radial-gradient(ellipse at 50% 0%, rgba(31,107,255,0.18) 0%, transparent 70%)',
        // Topographic contour texture (trail/mountain feel) — tiles seamlessly
        'topo':          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400' viewBox='0 0 400 400'%3E%3Cg fill='none' stroke='%231f6bff' stroke-width='1' stroke-opacity='0.09'%3E%3Cpath d='M-20 120 Q100 60 200 120 T420 120'/%3E%3Cpath d='M-20 160 Q100 100 200 160 T420 160'/%3E%3Cpath d='M-20 200 Q100 140 200 200 T420 200'/%3E%3Cpath d='M-20 240 Q100 180 200 240 T420 240'/%3E%3Cpath d='M-20 280 Q100 220 200 280 T420 280'/%3E%3Cpath d='M-20 320 Q100 260 200 320 T420 320'/%3E%3Cpath d='M-20 80 Q100 20 200 80 T420 80'/%3E%3Cpath d='M-20 360 Q100 300 200 360 T420 360'/%3E%3C/g%3E%3C/svg%3E\")",
      },
      boxShadow: {
        'card':    '0 1px 3px rgba(0,0,0,0.5), 0 1px 2px rgba(0,0,0,0.4)',
        'glow-sm': '0 0 15px rgba(31,107,255,0.3)',
        'glow':    '0 0 30px rgba(31,107,255,0.38)',
        'glow-lg': '0 0 60px rgba(31,107,255,0.28)',
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
