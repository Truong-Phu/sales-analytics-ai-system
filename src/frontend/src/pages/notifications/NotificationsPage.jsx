import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import axios from '../../api/axios'

const TYPE_ICON  = { info: 'info', warning: 'warning', error: 'error', success: 'check_circle' }
const TYPE_COLOR = { info: 'var(--primary-500)', warning: '#F59E0B', error: '#EF4444', success: '#10B981' }

const FILTERS = ['all', 'unread', 'sync', 'subscription', 'anomaly', 'system']

function timeAgo(dateStr) {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000
  if (diff < 60)    return 'Vừa xong'
  if (diff < 3600)  return `${Math.floor(diff / 60)} phút trước`
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`
  return new Date(dateStr).toLocaleDateString('vi-VN')
}

export default function NotificationsPage() {
  const { t }   = useTranslation()
  const [items, setItems]   = useState([])
  const [total, setTotal]   = useState(0)
  const [unread, setUnread] = useState(0)
  const [page,  setPage]    = useState(1)
  const [filter, setFilter] = useState('all')
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ page, limit: 20 })
      if (filter === 'unread')                    params.set('isRead', 'false')
      else if (filter !== 'all')                  params.set('category', filter)
      const res = await axios.get(`/api/notifications?${params}`)
      if (page === 1) setItems(res.data.data ?? [])
      else            setItems(prev => [...prev, ...(res.data.data ?? [])])
      setTotal(res.data.total ?? 0)
      setUnread(res.data.unreadCount ?? 0)
    } catch {
      setItems([])
    } finally { setLoading(false) }
  }, [page, filter])

  useEffect(() => { setPage(1) }, [filter])
  useEffect(() => { fetchData() }, [fetchData])

  const markRead = async (id) => {
    try {
      await axios.patch(`/api/notifications/${id}/read`)
      setItems(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n))
      setUnread(u => Math.max(0, u - 1))
    } catch { /* silent */ }
  }

  const markAllRead = async () => {
    try {
      await axios.patch('/api/notifications/read-all')
      setItems(prev => prev.map(n => ({ ...n, isRead: true })))
      setUnread(0)
    } catch { /* silent */ }
  }

  const deleteNotif = async (id) => {
    try {
      await axios.delete(`/api/notifications/${id}`)
      setItems(prev => prev.filter(n => n.id !== id))
      setTotal(t => t - 1)
    } catch { /* silent */ }
  }

  const filterLabel = {
    all:          t('notifications.filterAll'),
    unread:       t('notifications.filterUnread'),
    sync:         t('notifications.filterSync'),
    subscription: t('notifications.filterSubscription'),
    anomaly:      t('notifications.filterAnomaly'),
    system:       t('notifications.filterSystem'),
  }

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
            {t('notifications.pageTitle')}
          </h1>
          {unread > 0 && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
              {unread} {t('notifications.unreadSuffix')}
            </p>
          )}
        </div>
        {unread > 0 && (
          <button onClick={markAllRead} className="lbtn lbtn-secondary !h-8 text-xs">
            <span className="icon text-base">done_all</span>
            {t('notifications.markAllRead')}
          </button>
        )}
      </div>

      {/* Filter dropdown */}
      <div className="flex items-center gap-2">
        <select
          value={filter}
          onChange={e => setFilter(e.target.value)}
          className="linput text-sm"
          style={{ width: 200 }}
        >
          {FILTERS.map(f => (
            <option key={f} value={f}>{filterLabel[f]}</option>
          ))}
        </select>
      </div>

      {/* List */}
      {loading && items.length === 0 ? (
        <div className="lcard p-12 flex items-center justify-center">
          <span className="w-7 h-7 border-2 rounded-full"
                style={{ borderColor: 'var(--border-strong)', borderTopColor: 'var(--primary-500)', animation: 'spin 0.8s linear infinite' }} />
        </div>
      ) : items.length === 0 ? (
        <div className="lcard p-12 flex flex-col items-center gap-3" style={{ color: 'var(--text-tertiary)' }}>
          <span className="icon" style={{ fontSize: 40, opacity: 0.3 }}>notifications_none</span>
          <p className="text-sm">{t('notifications.empty')}</p>
        </div>
      ) : (
        <div className="lcard overflow-hidden divide-y" style={{ '--tw-divide-opacity': 1 }}>
          {items.map(n => (
            <div key={n.id}
                 className="flex items-start gap-3 px-4 py-4 cursor-pointer transition-colors group"
                 style={{ background: n.isRead ? 'transparent' : 'rgba(99,102,241,0.04)' }}
                 onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
                 onMouseLeave={e => e.currentTarget.style.background = n.isRead ? 'transparent' : 'rgba(99,102,241,0.04)'}
                 onClick={() => !n.isRead && markRead(n.id)}>
              <span className="icon text-xl shrink-0 mt-0.5"
                    style={{ color: TYPE_COLOR[n.type] ?? 'var(--text-secondary)' }}>
                {TYPE_ICON[n.type] ?? 'info'}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                    {n.title}
                  </p>
                  {!n.isRead && (
                    <span className="w-2 h-2 rounded-full shrink-0"
                          style={{ background: 'var(--primary-500)' }} />
                  )}
                </div>
                {n.body && (
                  <p className="text-sm mt-0.5 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    {n.body}
                  </p>
                )}
                <div className="flex items-center gap-3 mt-1.5">
                  {n.category && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-medium"
                          style={{ background: 'var(--bg-elevated)', color: 'var(--text-tertiary)', border: '1px solid var(--border)' }}>
                      {n.category}
                    </span>
                  )}
                  <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    {timeAgo(n.createdAt)}
                  </span>
                </div>
              </div>
              <button
                onClick={e => { e.stopPropagation(); deleteNotif(n.id) }}
                className="opacity-0 group-hover:opacity-100 w-7 h-7 flex items-center justify-center rounded-lg shrink-0"
                style={{ color: 'var(--text-tertiary)' }}
                onMouseEnter={e => { e.currentTarget.style.color = '#EF4444'; e.currentTarget.style.background = 'rgba(239,68,68,0.08)' }}
                onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-tertiary)'; e.currentTarget.style.background = 'transparent' }}>
                <span className="icon text-sm">delete</span>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Load More */}
      {items.length < total && (
        <div className="flex justify-center">
          <button onClick={() => setPage(p => p + 1)} disabled={loading}
                  className="lbtn lbtn-secondary !h-9 text-sm">
            {loading ? 'Đang tải...' : t('notifications.loadMore')}
          </button>
        </div>
      )}
    </div>
  )
}
