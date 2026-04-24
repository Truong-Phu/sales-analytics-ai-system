import { useState } from 'react'
import Sidebar from './Sidebar'
import Header from './Header'

/**
 * Layout bọc ngoài tất cả trang web.
 * - Desktop: Sidebar cố định bên trái, content dịch phải
 * - Mobile (<768px): Sidebar ẩn mặc định, mở bằng hamburger button
 */
export default function Layout({ children }) {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="min-h-screen bg-surface">
      {/* Sidebar – nhận isOpen (mobile) và onClose callback */}
      <Sidebar
        isOpen={mobileOpen}
        onClose={() => setMobileOpen(false)}
      />

      {/* Header – nhận onMenuClick để mở sidebar trên mobile */}
      <Header onMenuClick={() => setMobileOpen(o => !o)} />

      {/* Main content: ml-[240px] trên md+, full-width trên mobile */}
      <main className="md:ml-[240px] mt-16 p-4 md:p-6
                       min-h-[calc(100vh-4rem)] overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
