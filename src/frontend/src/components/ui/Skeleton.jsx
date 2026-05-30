export function Skeleton({ className = '', style = {} }) {
  return <div className={`skeleton ${className}`} style={style} />
}

export function SkeletonCard() {
  return (
    <div className="lcard p-6 space-y-3">
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="h-8 w-1/2" />
      <Skeleton className="h-3 w-2/3" />
    </div>
  )
}

export function SkeletonTable({ rows = 5 }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-12 w-full" />
      ))}
    </div>
  )
}

/**
 * Skeleton dùng bên trong <tbody> của bảng — render đúng <tr><td>.
 * cols: số cột, widths: override độ rộng từng cột (Tailwind w-* class).
 */
export function SkeletonTableBody({ rows = 5, cols = 6, widths }) {
  const defaultWidths = ['w-24', 'w-full', 'w-32', 'w-20', 'w-28', 'w-16']
  const colWidths = widths ?? defaultWidths

  return (
    <>
      {Array.from({ length: rows }).map((_, i) => (
        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
          {Array.from({ length: cols }).map((_, j) => (
            <td key={j} className="px-4 py-3">
              <div className={`skeleton h-4 rounded ${colWidths[j % colWidths.length]}`} />
            </td>
          ))}
        </tr>
      ))}
    </>
  )
}
