import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import MockToast from '../../components/ui/MockToast'
import { getRecommendations, askRecommendation } from '../../api/aiApi'
import { MOCK_RECOMMENDATIONS } from '../../mockData/recommendations'

const TYPE_ICON = {
  revenue: 'payments', channel: 'store', product: 'inventory_2',
  anomaly: 'warning',  general: 'lightbulb',
}
const PRIORITY_DOT = { high: '#EF4444', medium: '#F59E0B', low: 'var(--primary-500)' }
const TYPE_FILTER_KEYS = ['all', 'revenue', 'channel', 'product', 'anomaly', 'general']
const SAMPLE_QS_VI = [
  'Sản phẩm nào đang bán chạy nhất?',
  'Doanh thu tuần này so với tuần trước?',
  'Xu hướng thị trường hiện tại là gì?',
]
const SAMPLE_QS_EN = [
  'Which products are selling best?',
  'How does this week compare to last week?',
  'What are current market trends?',
]

function ConfidenceBadge({ level }) {
  const map = {
    high:   { bg: 'rgba(16,185,129,0.10)', border: 'rgba(16,185,129,0.30)', color: 'var(--accent-500)', label: 'Cao' },
    medium: { bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.30)', color: '#F59E0B',            label: 'Trung bình' },
    low:    { bg: 'rgba(239,68,68,0.10)',  border: 'rgba(239,68,68,0.30)',  color: '#EF4444',            label: 'Thấp' },
  }
  const c = map[level] ?? map.low
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
      style={{ background: c.bg, border: `1px solid ${c.border}`, color: c.color }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: c.color }} />
      {c.label}
    </span>
  )
}

export default function RecommendationsPage() {
  const { t, i18n } = useTranslation()
  const lang = i18n.language === 'en' ? 'en' : 'vi'
  const sampleQs = lang === 'en' ? SAMPLE_QS_EN : SAMPLE_QS_VI

  const [autoData,    setAutoData]    = useState(null)
  const [autoLoading, setAutoLoading] = useState(true)
  const [isMock,      setIsMock]      = useState(false)
  const [filter,      setFilter]      = useState('all')
  const [question,    setQuestion]    = useState('')
  const [answerLang,  setAnswerLang]  = useState(lang)
  const [askLoading,  setAskLoading]  = useState(false)
  const [lastAnswer,  setLastAnswer]  = useState(null)
  const [askError,    setAskError]    = useState('')
  const [history,     setHistory]     = useState([])
  const [ctxOpen,     setCtxOpen]     = useState(false)
  const answerRef = useRef(null)

  const fetchAutoRecs = async () => {
    setAutoLoading(true)
    setIsMock(false)
    try {
      setAutoData(await getRecommendations())
    } catch {
      setAutoData(MOCK_RECOMMENDATIONS)
      setIsMock(true)
    } finally {
      setAutoLoading(false)
    }
  }
  useEffect(() => { fetchAutoRecs() }, [])

  const handleAsk = async () => {
    const q = question.trim()
    if (!q) return
    setAskLoading(true)
    setAskError('')
    setLastAnswer(null)
    setCtxOpen(false)
    try {
      const res = await askRecommendation({ question: q, language: answerLang })
      setLastAnswer(res)
      setHistory(prev => [{ question: q, answer: res }, ...prev.filter(h => h.question !== q)].slice(0, 5))
      setTimeout(() => answerRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    } catch {
      setAskError('AI Service tạm thời không khả dụng. Vui lòng thử lại sau.')
    } finally {
      setAskLoading(false)
    }
  }

  const filtered = autoData?.recommendations?.filter(r => filter === 'all' || r.type === filter) ?? []

  return (
    <div className="space-y-5">
      <MockToast show={isMock} />

      {/* Header */}
      <div>
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
          {t('recommendations.title')}
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
          {t('recommendations.subtitle')}
        </p>
      </div>

      {/* ── AI Chat 2-col ── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">

        {/* LEFT: Input */}
        <div className="lcard p-5 space-y-4">
          <div className="flex items-center gap-2">
            <span className="icon" style={{ fontSize: 20, color: 'var(--primary-500)' }}>forum</span>
            <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
              {t('recommendations.askTitle')}
            </h2>
          </div>

          <div className="relative">
            <textarea
              value={question}
              onChange={e => setQuestion(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleAsk() }}
              placeholder={t('recommendations.questionPlaceholder')}
              rows={4}
              className="w-full rounded-xl border text-sm resize-none px-4 py-3 transition-colors"
              style={{
                background: 'var(--bg-base)',
                borderColor: 'var(--border)',
                color: 'var(--text-primary)',
                outline: 'none',
              }}
              onFocus={e => e.target.style.borderColor = 'var(--primary-500)'}
              onBlur={e => e.target.style.borderColor = 'var(--border)'}
            />
            <span className="absolute bottom-2.5 right-3 text-xs" style={{ color: 'var(--text-tertiary)' }}>
              Ctrl+Enter
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>
              {t('recommendations.answerLang')}:
            </span>
            <select
              value={answerLang}
              onChange={e => setAnswerLang(e.target.value)}
              className="linput flex-1 text-sm !h-8"
            >
              <option value="vi">{t('common.vietnamese')}</option>
              <option value="en">{t('common.english')}</option>
            </select>
          </div>

          <button
            onClick={handleAsk}
            disabled={askLoading || !question.trim()}
            className="lbtn lbtn-primary w-full justify-center"
            style={{ height: 40, opacity: (!question.trim() && !askLoading) ? 0.5 : 1 }}
          >
            {askLoading ? (
              <>
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full"
                      style={{ animation: 'spin 0.7s linear infinite' }} />
                {t('recommendations.thinking')}
              </>
            ) : (
              <>
                <span className="icon text-base">send</span>
                {t('recommendations.askBtn')}
              </>
            )}
          </button>

          {/* Sample question chips */}
          <div>
            <p className="text-xs mb-2" style={{ color: 'var(--text-tertiary)' }}>
              {t('recommendations.sampleQuestions')}:
            </p>
            <div className="flex flex-col gap-1.5">
              {sampleQs.map((q, i) => (
                <button
                  key={i}
                  onClick={() => setQuestion(q)}
                  className="text-left px-3 py-2 rounded-lg text-xs border transition-all"
                  style={{
                    borderColor: 'var(--border)',
                    background: 'var(--bg-elevated)',
                    color: 'var(--text-secondary)',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--primary-500)'; e.currentTarget.style.color = 'var(--text-primary)' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>

          {/* History */}
          {history.length > 0 && (
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              <p className="text-xs mb-1.5" style={{ color: 'var(--text-tertiary)' }}>
                {t('recommendations.history')}:
              </p>
              {history.map((h, i) => (
                <button
                  key={i}
                  onClick={() => { setQuestion(h.question); setLastAnswer(h.answer) }}
                  className="w-full text-left text-xs px-2 py-1.5 rounded-lg truncate transition-colors"
                  style={{ color: 'var(--text-secondary)' }}
                  onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-elevated)'; e.currentTarget.style.color = 'var(--text-primary)' }}
                  onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-secondary)' }}
                >
                  <span className="icon mr-1" style={{ fontSize: 12 }}>history</span>
                  {h.question}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* RIGHT: Answer */}
        <div ref={answerRef} className="lcard p-5 space-y-4">
          <div className="flex items-center gap-2">
            <span className="icon" style={{ fontSize: 20, color: 'var(--primary-500)' }}>auto_awesome</span>
            <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
              {t('recommendations.answerTitle')}
            </h2>
          </div>

          {!lastAnswer && !askLoading && !askError && (
            <div className="flex flex-col items-center justify-center py-16 gap-3"
                 style={{ color: 'var(--text-tertiary)' }}>
              <span className="icon" style={{ fontSize: 48, opacity: 0.3 }}>chat_bubble_outline</span>
              <p className="text-sm">{t('recommendations.noAnswer')}</p>
            </div>
          )}

          {askLoading && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="flex gap-1">
                {[0, 0.15, 0.3].map((d, i) => (
                  <span key={i} className="w-2 h-2 rounded-full"
                        style={{ background: 'var(--primary-500)', animation: `bounce 1s ${d}s infinite` }} />
                ))}
              </div>
              <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>{t('recommendations.thinking')}</p>
            </div>
          )}

          {askError && !lastAnswer && !askLoading && (
            <div className="flex items-start gap-2 px-4 py-3 rounded-xl text-sm"
                 style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.30)', color: '#EF4444' }}>
              <span className="icon shrink-0" style={{ fontSize: 18 }}>error_outline</span>
              {askError}
            </div>
          )}

          {lastAnswer && !askLoading && (
            <div className="space-y-3">
              {/* Question bubble */}
              <div className="px-4 py-3 rounded-xl rounded-tl-sm"
                   style={{ background: 'var(--primary-50, rgba(99,102,241,0.08))', border: '1px solid rgba(99,102,241,0.15)' }}>
                <p className="text-sm" style={{ color: 'var(--text-primary)' }}>
                  <span className="icon mr-1 align-middle" style={{ fontSize: 14, color: 'var(--primary-500)' }}>person</span>
                  {lastAnswer.question}
                </p>
              </div>

              {/* Answer bubble */}
              <div className="px-4 py-3 rounded-xl rounded-tl-sm"
                   style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                <pre className="text-sm whitespace-pre-wrap font-sans leading-relaxed"
                     style={{ color: 'var(--text-primary)' }}>
                  {lastAnswer.recommendation}
                </pre>
              </div>

              {/* Meta badges */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Độ tin cậy:</span>
                <ConfidenceBadge level={lastAnswer.confidence} />
                {(lastAnswer.data_sources ?? []).map(src => (
                  <span key={src} className="lbadge lbadge-neutral text-xs">{src}</span>
                ))}
              </div>

              {lastAnswer.confidence === 'low' && (
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl text-xs"
                     style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', color: '#F59E0B' }}>
                  <span className="icon shrink-0 mt-0.5" style={{ fontSize: 14 }}>warning</span>
                  {t('recommendations.level1Warning')}
                </div>
              )}

              {lastAnswer.note && (
                <p className="text-xs italic" style={{ color: 'var(--text-tertiary)' }}>{lastAnswer.note}</p>
              )}

              {lastAnswer._context && (
                <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
                  <button
                    onClick={() => setCtxOpen(v => !v)}
                    className="w-full flex items-center justify-between px-4 py-2.5 text-sm transition-colors"
                    style={{ color: 'var(--text-secondary)' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <span>{t('recommendations.viewContext')}</span>
                    <span className="icon" style={{ fontSize: 18, transform: ctxOpen ? 'rotate(180deg)' : '', transition: 'transform 0.2s' }}>expand_more</span>
                  </button>
                  {ctxOpen && (
                    <div className="px-4 py-3 text-xs overflow-x-auto"
                         style={{ background: 'var(--bg-elevated)', borderTop: '1px solid var(--border)', color: 'var(--text-tertiary)' }}>
                      <pre className="whitespace-pre-wrap">{JSON.stringify(lastAnswer._context, null, 2)}</pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Auto recommendations list ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
            Gợi ý tự động từ AI
          </h2>
          <button onClick={fetchAutoRecs} className="lbtn lbtn-secondary !h-8 text-xs" disabled={autoLoading}>
            <span className="icon text-base" style={{ ...(autoLoading && { animation: 'spin 1s linear infinite' }) }}>refresh</span>
            {t('common.refresh')}
          </button>
        </div>

        {/* Type filter */}
        <div className="flex flex-wrap gap-2">
          {TYPE_FILTER_KEYS.map(type => (
            <button
              key={type}
              onClick={() => setFilter(type)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-all"
              style={{
                background: filter === type ? 'var(--primary-500)' : 'transparent',
                borderColor: filter === type ? 'var(--primary-500)' : 'var(--border)',
                color: filter === type ? 'white' : 'var(--text-secondary)',
              }}
            >
              {type === 'all' ? t('common.all') : t(`recommendations.type.${type}`)}
            </button>
          ))}
        </div>

        {autoLoading ? (
          <div className="lcard p-10 flex items-center justify-center">
            <span className="w-6 h-6 border-2 rounded-full"
                  style={{ borderColor: 'var(--border-strong)', borderTopColor: 'var(--primary-500)', animation: 'spin 0.8s linear infinite' }} />
          </div>
        ) : filtered.length === 0 ? (
          <div className="lcard p-10 flex flex-col items-center gap-3" style={{ color: 'var(--text-tertiary)' }}>
            <span className="icon" style={{ fontSize: 40, opacity: 0.4 }}>sentiment_satisfied</span>
            <p className="text-sm">{t('recommendations.noItems')}</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((rec, i) => (
              <div
                key={i}
                className="lcard p-4 flex items-start gap-4"
                style={{
                  borderLeft: `3px solid ${PRIORITY_DOT[rec.priority] ?? PRIORITY_DOT.low}`,
                }}
              >
                <span
                  className="icon w-9 h-9 flex items-center justify-center rounded-xl shrink-0"
                  style={{ fontSize: 20, background: 'var(--bg-elevated)', color: 'var(--primary-500)' }}
                >
                  {TYPE_ICON[rec.type] ?? 'lightbulb'}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <span
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                      style={{
                        background: `${PRIORITY_DOT[rec.priority]}18`,
                        color: PRIORITY_DOT[rec.priority],
                        border: `1px solid ${PRIORITY_DOT[rec.priority]}40`,
                      }}
                    >
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: PRIORITY_DOT[rec.priority] }} />
                      {t(`recommendations.priority.${rec.priority}`)}
                    </span>
                    <span className="lbadge lbadge-neutral text-xs">
                      {t(`recommendations.type.${rec.type}`)}
                    </span>
                  </div>
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{rec.message}</p>
                  {rec.detail && (
                    <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>{rec.detail}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {autoData?.generatedAt && (
          <p className="text-xs text-center" style={{ color: 'var(--text-tertiary)' }}>
            Cập nhật: {new Date(autoData.generatedAt).toLocaleString('vi-VN')}
          </p>
        )}
      </div>
    </div>
  )
}
