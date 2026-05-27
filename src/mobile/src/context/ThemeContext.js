import React, { createContext, useContext, useState, useEffect } from 'react'
import { useColorScheme } from 'react-native'
import { storage } from '../api/storage'

const THEME_KEY = 'app_theme'

export const darkColors = {
  surface:                '#051424',
  surfaceContainerLow:    '#0d1c2d',
  surfaceContainer:       '#122131',
  surfaceContainerHigh:   '#1c2b3c',
  surfaceContainerHighest:'#273647',
  primary:                '#c4c0ff',
  primaryContainer:       '#8781ff',
  tertiary:               '#4ae176',
  onSurface:              '#d4e4fa',
  onSurfaceVariant:       '#c7c4d8',
  outline:                '#918fa1',
  outlineVariant:         '#464555',
  error:                  '#ffb4ab',
  secondary:              '#adc6ff',
  // Semantic extras
  card:                   '#1F2937',
  cardBorder:             '#374151',
  textPrimary:            '#F9FAFB',
  textSecondary:          '#9CA3AF',
  interactive:            '#6366F1',
  warning:                '#F59E0B',
  success:                '#4AE176',
  danger:                 '#EF4444',
}

export const lightColors = {
  surface:                '#F8FAFC',
  surfaceContainerLow:    '#FFFFFF',
  surfaceContainer:       '#F1F5F9',
  surfaceContainerHigh:   '#E2E8F0',
  surfaceContainerHighest:'#CBD5E1',
  primary:                '#6366F1',
  primaryContainer:       '#4F46E5',
  tertiary:               '#059669',
  onSurface:              '#0F172A',
  onSurfaceVariant:       '#475569',
  outline:                '#64748B',
  outlineVariant:         '#E2E8F0',
  error:                  '#DC2626',
  secondary:              '#4F46E5',
  // Semantic extras
  card:                   '#FFFFFF',
  cardBorder:             '#E2E8F0',
  textPrimary:            '#0F172A',
  textSecondary:          '#64748B',
  interactive:            '#6366F1',
  warning:                '#D97706',
  success:                '#059669',
  danger:                 '#DC2626',
}

const ThemeContext = createContext({
  isDark: true,
  colors: darkColors,
  themeMode: 'dark',
  setThemeMode: async () => {},
})

export function ThemeProvider({ children }) {
  const systemScheme = useColorScheme()
  const [themeMode, setThemeModeState] = useState('dark')

  useEffect(() => {
    storage.getItem(THEME_KEY)
      .then(saved => { if (saved) setThemeModeState(saved) })
      .catch(() => {})
  }, [])

  const setThemeMode = async (mode) => {
    setThemeModeState(mode)
    await storage.setItem(THEME_KEY, mode).catch(() => {})
  }

  const isDark = themeMode === 'system'
    ? systemScheme !== 'light'
    : themeMode === 'dark'

  const colors = isDark ? darkColors : lightColors

  return (
    <ThemeContext.Provider value={{ isDark, colors, themeMode, setThemeMode }}>
      {children}
    </ThemeContext.Provider>
  )
}

export const useTheme = () => useContext(ThemeContext)
