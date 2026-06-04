import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import MockToast from '../../components/ui/MockToast'
import AiEmptyState from '../../components/ui/AiEmptyState'
import { getFeedbackSummary } from '../../api/aiApi'

function CommentCard({ comment }) {
  const cfg = {
    positive: { border: '#22C55E', bg: 'rgba(34,197,94,0.06)',   icon: '😊' },
    negative: { border: '#EF4444', bg: 'rgba(239,68,68,0.06)',   icon: '😞' },
    neutral:  { border: 'var(--border)', bg: 'var(--bg-elevated)', icon: '😐' },
  }[comment.sentiment] ?? { border: 'var(--border)', bg: 'var(--bg-elevated)', icon: '😐' }

  return (
    <div className="p-4 rounded-r-lg" style={{ borderLeft: `2px solid ${cfg.border}`, background: cfg.bg }}>
      <div className="flex items-start gap-3">
        <span className="text-xl shrink-0">{cfg.icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{comment.message}</p>
          <div className="flex items-center gap-3 mt-2 text-xs" style={{ color: 'var(--text-tertiary)' }}>
            <span className="font-medium" style={{ color: 'var(--text-secondary)' }}>{comment.author_name}</span>
            <span>{comment.created_at}</span>
            {comment.like_count > 0 && <span>👍 {comment.like_count}</span>}
          </div>
        </div>
      </div>
    </div>
  )
}

function DonutChart({ pos, neg, neu, total }) {
  const { t } = useTranslation()
  const r = 70, cx = 90, cy = 90, stroke = 22
  const circ = 2 * Math.PI * r
  const segs = [
    { pct: pos / total, color: '#22C55E' },
    { pct: neg / total, color: '#EF4444' },
    { pct: neu / total, color: '#9CA3AF' },
  ]
  let offset = 0
  return (
    <svg width={180} height={180} viewBox="0 0 180 180">
      {segs.map((seg, i) => {
        const len = seg.pct * circ
        const el  = (
          <circle key={i} cx={cx} cy={cy} r={r}
            fill="none" stroke={seg.color} strokeWidth={stroke}
            strokeDasharray={`${len} ${circ - len}`}
            strokeDashoffset={-offset}
            transform={`rotate(-90 ${cx} ${cy})`}
            style={{ transition: 'stroke-dasharray 0.5s ease' }}
          />
        )
        offset += len
        return el
      })}
      <text x={cx} y={cy - 6} textAnchor="middle" fill="currentColor" fontSize="22" fontWeight="bold">{total}</text>
      <text x={cx} y={cy + 14} textAnchor="middle" fill="#9CA3AF" fontSize="11">{t('sentiment.centerLabel')}</text>
    </svg>
  )
}

export default function SentimentPage() {
  const { t } = useTranslation()
  const [data,   setData]   = useState(null)
  const [loading,setLoading]= useState(true)
  const [isMock, setIsMock] = useState(false)
  const fetchedRef = useRef(false)
  const [filter, setFilter] = useState('all')

  const load = async () => {
    setLoading(true)
    try {
      const res = await getFeedbackSummary()
      setData(res)
      setIsMock(res.is_mock ?? false)
    } catch {
      setData(null)
    } finally { setLoading(false) }
  }

  useEffect(() => { if (fetchedRef.current) return; fetchedRef.current = true; load() }, [])

  const comments = (data?.recent_comments ?? []).filter(c => filter === 'all' || c.sentiment === filter)
  const total    = data ? (data.positive + data.negative + data.neutral) : 1

  const SENTIMENT_LABELS = [
    { color: '#22C55E', label: t('sentiment.positive'), key: 'positive' },
    { color: '#EF4444', label: t('sentiment.negative'), key: 'negative' },
    { color: '#9CA3AF', label: t('sentiment.neutral'),  key: 'neutral'  },
  ]

  const FILTERS = [
    { f: 'all',      label: t('sentiment.filterAll')      },
    { f: 'positive', label: t('sentiment.filterPositive') },
    { f: 'negative', label: t('sentiment.filterNegative') },
    { f: 'neutral',  label: t('sentiment.filterNeutral')  },
  ]

  return (
    <div className="space-y-5">
      <MockToast show={isMock} />
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{t('sentiment.title')}</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{t('sentiment.subtitle')}</p>
        </div>
        <button onClick={load} className="lbtn lbtn-primary text-sm">{t('common.refresh')}</button>
      </div>

      {!data && !loading && <AiEmptyState title={t('sentiment.emptyState')} />}

      {loading ? (
        <div className="lcard p-10 flex items-center justify-center">
          <span className="w-6 h-6 border-2 rounded-full animate-spin"
            style={{ borderColor: 'var(--border)', borderTopColor: 'var(--primary-500)' }} />
        </div>
      ) : data && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="lcard p-5 flex items-center justify-center gap-8 flex-wrap"
              style={{ color: 'var(--text-primary)' }}>
              <DonutChart pos={data.positive} neg={data.negative} neu={data.neutral} total={total} />
              <div className="space-y-3">
                {SENTIMENT_LABELS.map(s => (
                  <div key={s.key} className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full shrink-0" style={{ background: s.color }} />
                    <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{s.label}</span>
                    <span className="font-bold ml-auto" style={{ color: s.color }}>{data[s.key]}</span>
                    <span className="text-xs w-12 text-right" style={{ color: 'var(--text-tertiary)' }}>{data[`${s.key}_pct`]}%</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="lcard p-5 space-y-4">
              <div>
                <h3 className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>{t('sentiment.praiseSection')}</h3>
                <div className="flex flex-wrap gap-2">
                  {(data.top_praises ?? []).map(tag => (
                    <span key={tag} className="px-3 py-1 rounded-full text-sm"
                      style={{ background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.25)', color: '#059669' }}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="text-xs font-semibold mb-2" style={{ color: 'var(--text-secondary)' }}>{t('sentiment.issueSection')}</h3>
                <div className="flex flex-wrap gap-2">
                  {(data.top_issues ?? []).map(tag => (
                    <span key={tag} className="px-3 py-1 rounded-full text-sm"
                      style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.25)', color: '#991B1B' }}>
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>{t('sentiment.recentComments')}</h3>
              <div className="flex gap-2 flex-wrap">
                {FILTERS.map(({ f, label }) => (
                  <button key={f} onClick={() => setFilter(f)}
                    className="px-3 py-1 rounded-full text-xs font-medium border transition-colors"
                    style={filter === f
                      ? { background: 'var(--primary-500)', borderColor: 'var(--primary-500)', color: '#fff' }
                      : { borderColor: 'var(--border)', color: 'var(--text-tertiary)', background: 'transparent' }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2">
              {comments.map(c => <CommentCard key={c.comment_id} comment={c} />)}
              {comments.length === 0 && (
                <div className="lcard p-8 text-center" style={{ color: 'var(--text-tertiary)' }}>
                  {t('sentiment.noComments')}
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
