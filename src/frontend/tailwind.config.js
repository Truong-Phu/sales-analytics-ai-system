/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans:     ['Inter', 'system-ui', 'sans-serif'],
        mono:     ['JetBrains Mono', 'monospace'],
        headline: ['Inter', 'sans-serif'],
        body:     ['"Be Vietnam Pro"', 'sans-serif'],
        label:    ['Inter', 'sans-serif'],
      },
      // ── Typography Scale (PROMPT 3) ──────────────────────────────────────
      fontSize: {
        'display':  ['2.25rem', { lineHeight: '2.75rem', fontWeight: '700' }],
        'title':    ['1.5rem',  { lineHeight: '2rem',    fontWeight: '600' }],
        'subtitle': ['1.125rem',{ lineHeight: '1.75rem', fontWeight: '600' }],
        'body':     ['0.875rem',{ lineHeight: '1.5rem',  fontWeight: '400' }],
        'caption':  ['0.75rem', { lineHeight: '1.25rem', fontWeight: '400' }],
      },
      // ── Spacing 8px grid (PROMPT 3) ─────────────────────────────────────
      spacing: {
        '1': '4px', '2': '8px', '3': '12px', '4': '16px',
        '6': '24px', '8': '32px', '12': '48px', '16': '64px',
      },
      colors: {
        // ── Lumina tokens ──────────────────────────────────────
        primary: {
          50:  '#EEF2FF', 100: '#E0E7FF', 200: '#C7D2FE',
          400: '#818CF8', 500: '#6366F1', 600: '#4F46E5',
          700: '#4338CA',
          DEFAULT: '#6366F1',
        },
        accent: {
          50: '#ECFDF5', 400: '#34D399',
          500: '#10B981', 600: '#059669',
          DEFAULT: '#10B981',
        },

        // ── Legacy Material Design tokens (backwards compat) ──
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
        'on-tertiary':               '#003915',
        'on-tertiary-container':     '#003111',

        'surface':                   '#FFFFFF',
        'surface-dim':               '#F8F9FC',
        'surface-bright':            '#FFFFFF',
        'surface-variant':           '#F0F2F8',
        'surface-tint':              '#6366F1',
        'surface-container-lowest':  '#FFFFFF',
        'surface-container-low':     '#F8F9FC',
        'surface-container':         '#F0F2F8',
        'surface-container-high':    '#E8EBF4',
        'surface-container-highest': '#E0E3EF',

        'background':        '#F8F9FC',
        'on-background':     '#0F1117',
        'on-surface':        '#0F1117',
        'on-surface-variant':'#4B5563',
        'inverse-surface':   '#0F1117',
        'inverse-on-surface':'#FFFFFF',

        'outline':         '#9CA3AF',
        'outline-variant': '#E5E7EB',

        'error':             '#EF4444',
        'error-container':   '#FEE2E2',
        'on-error':          '#FFFFFF',
        'on-error-container':'#991B1B',

        // ── Chart Palette (PROMPT 2 — mapped to CSS vars) ──
        'chart-1': 'var(--chart-1)',
        'chart-2': 'var(--chart-2)',
        'chart-3': 'var(--chart-3)',
        'chart-4': 'var(--chart-4)',
        'chart-5': 'var(--chart-5)',
        'chart-6': 'var(--chart-6)',
        'chart-7': 'var(--chart-7)',
        'chart-8': 'var(--chart-8)',

        // ── Brand tokens ──
        'brand': 'var(--brand-primary)',
        'brand-muted': 'var(--brand-muted)',
      },
      borderRadius: {
        DEFAULT: '0.25rem',
        sm:  '6px', md:  '10px',
        lg:  '16px', xl:  '24px',
        '2xl': '1rem', full: '9999px',
      },
      boxShadow: {
        primary: '0 8px 24px rgba(99,102,241,0.28)',
        glow:    '0 0 40px rgba(99,102,241,0.12)',
        sm:  '0 1px 3px rgba(0,0,0,0.06)',
        md:  '0 4px 16px rgba(0,0,0,0.08)',
        lg:  '0 20px 40px rgba(0,0,0,0.10)',
      },
      animation: {
        'page-enter': 'pageEnter 220ms ease forwards',
        shimmer:      'shimmer 1.4s ease infinite',
        'scale-in':   'scaleIn 180ms ease forwards',
        'slide-up':   'slideUp 240ms ease forwards',
      },
    },
  },
  plugins: [],
}
