/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // ── Exact tokens from Stitch AI design ──
        'primary':                   '#c4c0ff',
        'primary-container':         '#8781ff',
        'primary-fixed':             '#e3dfff',
        'primary-fixed-dim':         '#c4c0ff',
        'on-primary':                '#2000a4',
        'on-primary-container':      '#1b0091',
        'on-primary-fixed':          '#100069',
        'on-primary-fixed-variant':  '#3622ca',
        'inverse-primary':           '#4f44e2',

        'secondary':                 '#adc6ff',
        'secondary-container':       '#0566d9',
        'secondary-fixed':           '#d8e2ff',
        'secondary-fixed-dim':       '#adc6ff',
        'on-secondary':              '#002e6a',
        'on-secondary-container':    '#e6ecff',
        'on-secondary-fixed':        '#001a42',
        'on-secondary-fixed-variant':'#004395',

        'tertiary':                  '#4ae176',
        'tertiary-container':        '#00a74b',
        'tertiary-fixed':            '#6bff8f',
        'tertiary-fixed-dim':        '#4ae176',
        'on-tertiary':               '#003915',
        'on-tertiary-container':     '#003111',
        'on-tertiary-fixed':         '#002109',
        'on-tertiary-fixed-variant': '#005321',

        'surface':                   '#051424',
        'surface-dim':               '#051424',
        'surface-bright':            '#2c3a4c',
        'surface-variant':           '#273647',
        'surface-tint':              '#c4c0ff',
        'surface-container-lowest':  '#010f1f',
        'surface-container-low':     '#0d1c2d',
        'surface-container':         '#122131',
        'surface-container-high':    '#1c2b3c',
        'surface-container-highest': '#273647',

        'background':                '#051424',
        'on-background':             '#d4e4fa',
        'on-surface':                '#d4e4fa',
        'on-surface-variant':        '#c7c4d8',
        'inverse-surface':           '#d4e4fa',
        'inverse-on-surface':        '#233143',

        'outline':                   '#918fa1',
        'outline-variant':           '#464555',

        'error':                     '#ffb4ab',
        'error-container':           '#93000a',
        'on-error':                  '#690005',
        'on-error-container':        '#ffdad6',
      },
      borderRadius: {
        DEFAULT: '0.25rem',
        sm:      '0.125rem',
        lg:      '0.5rem',
        xl:      '0.75rem',
        '2xl':   '1rem',
        full:    '9999px',
      },
      fontFamily: {
        headline: ['Inter', 'sans-serif'],
        body:     ['"Be Vietnam Pro"', 'sans-serif'],
        label:    ['Inter', 'sans-serif'],
      },
      boxShadow: {
        glow:       '0 0 15px rgba(196,192,255,0.25)',
        'glow-lg':  '0 0 30px rgba(196,192,255,0.3)',
        'glow-err': '0 0 15px rgba(255,180,171,0.25)',
      },
    },
  },
  plugins: [],
}
