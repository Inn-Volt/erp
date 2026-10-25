import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Identidad InnVolt
        // Identidad InnVolt (kit de marca, igual que innvolt.cl)
        innvolt: {
          DEFAULT: '#f6c21c',
          yellow: '#f6c21c',
          'yellow-dark': '#a87700',
          ink: '#1a1813',
          black: '#0b0b09',
        },
        // Tokens semánticos: cambian con el tema vía variables CSS
        surface: 'rgb(var(--surface) / <alpha-value>)',
        'surface-2': 'rgb(var(--surface-2) / <alpha-value>)',
        'surface-3': 'rgb(var(--surface-3) / <alpha-value>)',
        content: 'rgb(var(--content) / <alpha-value>)',
        'content-muted': 'rgb(var(--content-muted) / <alpha-value>)',
        line: 'rgb(var(--line) / <alpha-value>)',
        // Acento InnVolt según tema: ámbar oscuro legible sobre blanco, amarillo sobre oscuro.
        accent: 'var(--y)',
      },
      fontFamily: {
        sans: ['var(--font-body)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'var(--font-body)', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
