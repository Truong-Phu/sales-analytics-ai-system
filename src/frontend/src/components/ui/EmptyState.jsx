export default function EmptyState({ icon = 'inbox', title, description, action, onAction }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div
        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
        style={{ background: 'var(--bg-elevated)' }}
      >
        <span className="icon" style={{ fontSize: 28, color: 'var(--text-tertiary)' }}>{icon}</span>
      </div>
      <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>{title}</h3>
      {description && (
        <p className="text-sm mt-1 max-w-xs" style={{ color: 'var(--text-tertiary)' }}>{description}</p>
      )}
      {action && (
        <button
          onClick={onAction}
          className="lbtn lbtn-primary mt-4"
        >
          {action}
        </button>
      )}
    </div>
  )
}
