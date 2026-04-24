/** Hiển thị toast notification nhỏ ở góc trên phải — không phụ thuộc React */
export function showToast(message, type = 'error') {
  const el = document.createElement('div')
  const bg  = type === 'error'   ? '#b00020'
            : type === 'warning' ? '#7c5e00'
            : '#1b6e2a'
  Object.assign(el.style, {
    position:     'fixed',
    top:          '16px',
    right:        '16px',
    zIndex:       '99999',
    background:   bg,
    color:        '#fff',
    padding:      '10px 16px',
    borderRadius: '12px',
    fontSize:     '14px',
    fontFamily:   'Be Vietnam Pro, sans-serif',
    boxShadow:    '0 4px 20px rgba(0,0,0,0.4)',
    display:      'flex',
    alignItems:   'center',
    gap:          '8px',
    maxWidth:     '360px',
    lineHeight:   '1.4',
    opacity:      '0',
    transition:   'opacity 0.2s ease',
  })
  el.textContent = message
  document.body.appendChild(el)
  requestAnimationFrame(() => { el.style.opacity = '1' })
  setTimeout(() => {
    el.style.opacity = '0'
    setTimeout(() => el.remove(), 250)
  }, 4000)
}
