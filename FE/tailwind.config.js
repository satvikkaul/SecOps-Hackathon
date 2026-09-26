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
          50: '#eef7f4',
          100: '#d5ece4',
          200: '#acd9ca',
          300: '#7bbfaa',
          400: '#4ea189',
          500: '#32856e',
          600: '#256a58',
          700: '#1f5548',
          800: '#1b443b',
          900: '#173931',
        },
      },
    },
  },
  plugins: [],
};
