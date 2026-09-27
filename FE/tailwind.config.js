/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      colors: {
        brand: {
          // Built around the logo blue (#0077fc = 500). 600 is a shade darker so white button text meets WCAG AA.
          50: '#eff6ff',
          100: '#dbeafe',
          200: '#b3d4fe',
          300: '#7fb6fd',
          400: '#3d93fd',
          500: '#0077fc',
          600: '#0063d6',
          700: '#0050ad',
          800: '#06428a',
          900: '#0b3970',
        },
      },
    },
  },
  plugins: [],
};
