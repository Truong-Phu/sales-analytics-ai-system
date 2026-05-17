import { useTheme } from '../../hooks/useTheme'
import { CommandPaletteProvider } from '../ui/CommandPalette'
import TopBar from './TopBar'
import MobileBottomNav from './MobileBottomNav'

export default function AppShell({ children }) {
  const { isDark } = useTheme()

  return (
    <div
      className={`min-h-screen font-sans transition-colors duration-300 ${isDark ? 'dark' : ''}`}
      style={{
        background:  'var(--bg-base)',
        color:       'var(--text-primary)',
        fontFamily:  'var(--font-sans)',
      }}
    >
      <CommandPaletteProvider>
        <div className="flex flex-col min-h-screen">
          <TopBar />

          <main className="flex-1 px-4 py-5 md:px-8 md:py-6 pb-20 md:pb-6">
            <div className="page-enter">
              {children}
            </div>
          </main>

          <MobileBottomNav />
        </div>
      </CommandPaletteProvider>
    </div>
  )
}
