// Design tokens — export darkColors as default `colors` for backwards compat
// New code should use useTheme() from ThemeContext instead
import { darkColors, lightColors } from '../context/ThemeContext'

export { darkColors, lightColors }

// Backwards-compatible default export (dark palette)
export const colors = darkColors

export const fonts = {
  headline: { fontWeight: '700' },
  body:     { fontWeight: '400' },
  label:    { fontWeight: '600', fontSize: 12 },
}

export const radius = {
  sm:  8,
  md:  12,
  lg:  16,
  xl:  20,
  full: 9999,
}
