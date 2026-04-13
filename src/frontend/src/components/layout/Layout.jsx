import Sidebar from './Sidebar'
import Header from './Header'

/**
 * Layout bọc ngoài tất cả trang web (có sidebar + header).
 * Props:
 *   title    – tiêu đề trang (hiển thị trong Header)
 *   controls – elements bên cạnh title (date picker, filter…)
 *   children – nội dung trang
 */
export default function Layout({ title, controls, children }) {
  return (
    <div className="min-h-screen bg-surface">
      <Sidebar />
      <Header title={title}>{controls}</Header>
      <main className="ml-[240px] mt-16 p-6 min-h-[calc(100vh-4rem)] overflow-y-auto">
        {children}
      </main>
    </div>
  )
}
