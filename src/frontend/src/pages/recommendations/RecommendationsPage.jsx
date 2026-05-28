import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import MockToast from '../../components/ui/MockToast'
import { getRecommendations } from '../../api/aiApi'
import { MOCK_RECOMMENDATIONS } from '../../mockData/recommendations'
import api from '../../api/axios'

// ── Cấu hình 3 tab nguồn dữ liệu ─────────────────────────────────────────────
const TABS = [
  {
    id:       'business',
    icon:     'bar_chart',
    emoji:    '📊',
    label:    'Dữ liệu Kinh doanh',
    header:   'Gợi ý từ dữ liệu bán hàng thực tế',
    sub:      'Phân tích từ đơn hàng, doanh thu, sản phẩm của doanh nghiệp',
    context:  'business_data',
    sources:  ['fact_sales', 'oltp'],
    badge:    '📊 Dữ liệu nội bộ',
    badgeColor: '#6366F1',
    samples: [
      'Sản phẩm nào đang bán chạy nhất tháng này?',
      'Kênh bán hàng nào hiệu quả nhất?',
      'Doanh thu tuần này so với tuần trước thế nào?',
    ],
  },
  {
    id:       'market',
    icon:     'public',
    emoji:    '🌐',
    label:    'Xu hướng Thị trường',
    header:   'Gợi ý từ xu hướng thị trường',
    sub:      'Phân tích từ dữ liệu thu thập Google, tin tức thị trường',
    context:  'market_trends',
    sources:  ['google', 'external'],
    badge:    '🌐 Xu hướng thị trường',
    badgeColor: '#10B981',
    samples: [
      'Sản phẩm nào đang trending trên thị trường?',
      'Xu hướng thương mại điện tử Việt Nam hiện tại?',
      'Cơ hội kinh doanh nào đang nổi bật?',
    ],
  },
  {
    id:       'feedback',
    icon:     'chat_bubble',
    emoji:    '💬',
    label:    'Phản hồi Khách hàng',
    header:   'Gợi ý từ phản hồi mạng xã hội',
    sub:      'Phân tích sentiment từ Facebook Page, bình luận khách hàng',
    context:  'customer_feedback',
    sources:  ['facebook'],
    badge:    '💬 Phản hồi KH',
    badgeColor: '#F59E0B',
    samples: [
      'Khách hàng đang phàn nàn về vấn đề gì?',
      'Sản phẩm nào được đánh giá cao nhất?',
      'Cảm xúc chung của khách hàng như thế nào?',
    ],
  },
]

const TYPE_ICON = {
  revenue: 'payments', channel: 'store', product: 'inventory_2',
  anomaly: 'warning',  general: 'lightbulb',
}

// Label hiển thị theo intent được backend phát hiện
const INTENT_LABEL = {
  top_product:             'Top sản phẩm',
  declining_product:       'SP giảm doanh số',
  trending_product:        'SP xu hướng tăng',
  revenue_summary:         'Doanh thu',
  order_summary:           'Đơn hàng',
  top_channel:             'Kênh tốt nhất',
  channel_comparison:      'So sánh kênh',
  customer_overview:       'Khách hàng',
  inventory_alert:         'Tồn kho',
  business_recommendation: 'Gợi ý chiến lược',
  performance_overview:    'Tổng quan KD',
  customer_feedback:       'Phản hồi KH',
  market:                  'Xu hướng thị trường',
}
const PRIORITY_DOT = { high: '#EF4444', medium: '#F59E0B', low: 'var(--primary-500)' }
const TYPE_FILTER_KEYS = ['all', 'revenue', 'channel', 'product', 'anomaly', 'general']

// ── Sub-components ────────────────────────────────────────────────────────────

function ConfidenceBadge({ level }) {
  const map = {
    high:   { bg: 'rgba(16,185,129,0.10)', border: 'rgba(16,185,129,0.30)', color: 'var(--accent-500)', label: 'Cao' },
    medium: { bg: 'rgba(245,158,11,0.10)', border: 'rgba(245,158,11,0.30)', color: '#F59E0B',            label: 'Trung bình' },
    low:    { bg: 'rgba(239,68,68,0.10)',  border: 'rgba(239,68,68,0.30)',  color: '#EF4444',            label: 'Thấp' },
  }
  const c = map[(level ?? '').toLowerCase()] ?? map.low
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

function LoadingSkeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      {[80, 60, 90, 50].map((w, i) => (
        <div key={i} className="h-3 rounded-full" style={{ width: `${w}%`, background: 'var(--bg-elevated)' }} />
      ))}
    </div>
  )
}

// Khung chat 1 tab
function ChatTab({ tab }) {
  const [question,        setQuestion]        = useState('')
  const [loading,         setLoading]         = useState(false)
  const [history,         setHistory]         = useState([])    // [{question, answer}]
  const [error,           setError]           = useState('')
  const [smartSuggestions, setSmartSuggestions] = useState(tab.samples)
  const bottomRef = useRef(null)

  // Load gợi ý câu hỏi từ backend theo tab
  useEffect(() => {
    api.get(`/api/chatbot/suggestions?tab=${tab.id}`)
      .then(res => {
        if (res.data?.data?.length > 0) setSmartSuggestions(res.data.data)
      })
      .catch(() => {}) // Fallback: giữ nguyên tab.samples nếu lỗi
  }, [tab.id])

  const clearHistory = () => setHistory([])

  const handleAsk = useCallback(async () => {
    const q = question.trim()
    if (!q || loading) return
    setLoading(true)
    setError('')
    try {
      // Gọi backend ASP.NET → Gemini API
      const res = await api.post('/api/chatbot/chat', {
        message: q,
        tab:     tab.id,
        history: history.flatMap(item => ([
          { role: 'user',  content: item.question },
          { role: 'model', content: item.answer?.text ?? item.answer?.recommendation ?? '' },
        ])),
      })
      const aiText      = res.data.answer ?? res.data.message ?? 'Xin lỗi, không có phản hồi.'
      const fallback    = res.data.fallbackUsed ?? false
      const isAi        = res.data.isAiGenerated ?? true
      const confidence  = (!isAi || fallback) ? 'low' : 'high'
      setHistory(prev => [
        ...prev,
        {
          question: q,
          answer: {
            text:           aiText,
            recommendation: aiText,
            confidence,
            fallbackUsed:   fallback,
            isAiGenerated:  isAi,
            intent:         res.data.intent,
            sources_used:   tab.sources,
            context_type:   tab.context,
            question:       q,
            timestamp:      new Date().toISOString(),
          },
        },
      ])
      setQuestion('')
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 100)
    } catch {
      try {
        // Fallback mock khi backend lỗi
        const mockAnswer = {
          recommendation: `[Dữ liệu mẫu] Dựa trên phân tích ${tab.label.toLowerCase()}: đây là gợi ý mẫu khi AI Service chưa khả dụng.`,
          text:           `[Dữ liệu mẫu] Dựa trên phân tích ${tab.label.toLowerCase()}: đây là gợi ý mẫu khi AI Service chưa khả dụng.`,
          confidence:     'low',
          sources_used:   tab.sources,
          context_type:   tab.context,
          question:       q,
        }
        setHistory(prev => [...prev, { question: q, answer: mockAnswer }])
        setQuestion('')
      } catch {
        setError('AI Service tạm thời không khả dụng. Vui lòng thử lại sau.')
      }
    } finally {
      setLoading(false)
    }
  }, [question, loading, tab, history])

  return (
    <div className="space-y-4">
      {/* Header tab */}
      <div>
        <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          {tab.header}
        </p>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
          {tab.sub}
        </p>
      </div>

      {/* Lịch sử chat */}
      <div className="space-y-3 min-h-[120px]">
        {history.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center py-10 gap-2"
               style={{ color: 'var(--text-tertiary)' }}>
            <span className="icon" style={{ fontSize: 36, opacity: 0.25 }}>chat_bubble_outline</span>
            <p className="text-xs">Nhập câu hỏi bên dưới để nhận gợi ý</p>
          </div>
        )}

        {history.map((item, i) => (
          <div key={i} className="space-y-2">
            {/* Câu hỏi */}
            <div className="flex justify-end">
              <div className="max-w-[85%] px-3 py-2 rounded-2xl rounded-tr-sm text-sm"
                   style={{ background: 'var(--primary-500)', color: 'white' }}>
                {item.question}
              </div>
            </div>

            {/* Câu trả lời */}
            <div className="flex gap-2">
              <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                   style={{ background: `${tab.badgeColor}20` }}>
                <span className="icon" style={{ fontSize: 14, color: tab.badgeColor }}>smart_toy</span>
              </div>
              <div className="flex-1 space-y-2">
                <div className="px-3 py-2 rounded-2xl rounded-tl-sm text-sm"
                     style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
                  <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">
                    {item.answer.text ?? item.answer.recommendation}
                  </pre>
                </div>
                {/* Badges nguồn */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                    style={{
                      background: `${tab.badgeColor}18`,
                      border:     `1px solid ${tab.badgeColor}40`,
                      color:       tab.badgeColor,
                    }}
                  >
                    {tab.badge}
                  </span>
                  <ConfidenceBadge level={item.answer.confidence} />
                  {item.answer.intent && INTENT_LABEL[item.answer.intent] && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
                      style={{ background: 'var(--bg-base)', border: '1px solid var(--border)', color: 'var(--text-tertiary)' }}>
                      <span className="icon" style={{ fontSize: 11 }}>psychology</span>
                      {INTENT_LABEL[item.answer.intent]}
                    </span>
                  )}
                  {item.answer.fallbackUsed && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs"
                      style={{ background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.30)', color: '#F59E0B' }}>
                      <span className="icon" style={{ fontSize: 11 }}>warning</span>
                      AI dự phòng
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}

        {/* Loading skeleton */}
        {loading && (
          <div className="flex gap-2">
            <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 mt-0.5"
                 style={{ background: `${tab.badgeColor}20` }}>
              <span className="icon" style={{ fontSize: 14, color: tab.badgeColor }}>smart_toy</span>
            </div>
            <div className="flex-1 px-3 py-3 rounded-2xl"
                 style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
              <LoadingSkeleton />
            </div>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs"
               style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)', color: '#EF4444' }}>
            <span className="icon" style={{ fontSize: 14 }}>error_outline</span>
            {error}
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Sample questions */}
      <div>
        <p className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>Câu hỏi gợi ý:</p>
        <div className="flex flex-col gap-1.5">
          {smartSuggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => setQuestion(s)}
              className="text-left px-3 py-2 rounded-lg text-xs border transition-all"
              style={{ borderColor: 'var(--border)', background: 'var(--bg-elevated)', color: 'var(--text-secondary)' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = tab.badgeColor; e.currentTarget.style.color = 'var(--text-primary)' }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Input box */}
      <div className="flex gap-2 items-end">
        <textarea
          value={question}
          onChange={e => setQuestion(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleAsk() }}
          placeholder="Nhập câu hỏi... (Ctrl+Enter để gửi)"
          rows={2}
          className="flex-1 rounded-xl border text-sm resize-none px-3 py-2.5 transition-colors"
          style={{
            background: 'var(--bg-base)',
            borderColor: 'var(--border)',
            color: 'var(--text-primary)',
            outline: 'none',
          }}
          onFocus={e => e.target.style.borderColor = tab.badgeColor}
          onBlur={e => e.target.style.borderColor = 'var(--border)'}
        />
        <button
          onClick={handleAsk}
          disabled={!question.trim() || loading}
          className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 transition-all"
          style={{
            background: question.trim() && !loading ? tab.badgeColor : 'var(--bg-elevated)',
            color: question.trim() && !loading ? 'white' : 'var(--text-tertiary)',
          }}
          title="Gửi (Ctrl+Enter)"
        >
          {loading
            ? <span className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full"
                    style={{ animation: 'spin 0.7s linear infinite' }} />
            : <span className="icon" style={{ fontSize: 18 }}>send</span>
          }
        </button>
      </div>

      {/* Xóa lịch sử */}
      {history.length > 0 && (
        <div className="flex justify-end">
          <button
            onClick={clearHistory}
            className="text-xs flex items-center gap-1 transition-colors"
            style={{ color: 'var(--text-tertiary)' }}
            onMouseEnter={e => e.currentTarget.style.color = '#EF4444'}
            onMouseLeave={e => e.currentTarget.style.color = 'var(--text-tertiary)'}
          >
            <span className="icon" style={{ fontSize: 12 }}>delete_sweep</span>
            Xóa lịch sử
          </button>
        </div>
      )}
    </div>
  )
}

// ── Trang chính ───────────────────────────────────────────────────────────────

export default function RecommendationsPage() {
  const { t } = useTranslation()

  // Trạng thái tab đang active
  const [activeTab, setActiveTab] = useState('business')

  // Auto-recommendations (danh sách bên dưới)
  const [autoData,    setAutoData]    = useState(null)
  const [autoLoading, setAutoLoading] = useState(true)
  const [isMock,      setIsMock]      = useState(false)
  const [filter,      setFilter]      = useState('all')

  // Scroll to top
  const [showScrollTop, setShowScrollTop] = useState(false)


  // Scroll tracking
  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 300)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' })

  // Fetch auto-recommendations
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

  const filtered = autoData?.recommendations?.filter(r => filter === 'all' || r.type === filter) ?? []
  const chatbotOpen = false  // chatbot đã được xóa
  const currentTab = TABS.find(t => t.id === activeTab)

  return (
    <div className="space-y-5 pb-24">
      <MockToast show={isMock} />

      {/* ── Header ── */}
      <div>
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
          {t('recommendations.title')}
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
          {t('recommendations.subtitle')}
        </p>
      </div>

      {/* ── 3 Tab Chat ── */}
      <div className="lcard overflow-hidden">
        {/* Tab headers */}
        <div className="flex border-b" style={{ borderColor: 'var(--border)' }}>
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-3 text-xs font-medium transition-all"
              style={{
                color:       activeTab === tab.id ? tab.badgeColor : 'var(--text-secondary)',
                borderBottom: activeTab === tab.id ? `2px solid ${tab.badgeColor}` : '2px solid transparent',
                background:  activeTab === tab.id ? `${tab.badgeColor}08` : 'transparent',
              }}
            >
              <span className="icon" style={{ fontSize: 15 }}>{tab.icon}</span>
              <span className="hidden sm:inline">{tab.label}</span>
              <span className="sm:hidden">{tab.emoji}</span>
            </button>
          ))}
        </div>

        {/* Tab body */}
        <div className="p-5">
          {currentTab && (
            <ChatTab
              key={activeTab}
              tab={currentTab}
            />
          )}
        </div>
      </div>

      {/* ── Auto recommendations ── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
            Gợi ý tự động từ AI
          </h2>
          <button onClick={fetchAutoRecs} className="lbtn lbtn-secondary !h-8 text-xs" disabled={autoLoading}>
            <span className="icon text-base"
                  style={{ ...(autoLoading && { animation: 'spin 1s linear infinite' }) }}>
              refresh
            </span>
            {t('common.refresh')}
          </button>
        </div>

        {/* Bộ lọc loại */}
        <div className="flex flex-wrap gap-2">
          {TYPE_FILTER_KEYS.map(type => (
            <button
              key={type}
              onClick={() => setFilter(type)}
              className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-all"
              style={{
                background:  filter === type ? 'var(--primary-500)' : 'transparent',
                borderColor: filter === type ? 'var(--primary-500)' : 'var(--border)',
                color:       filter === type ? 'white' : 'var(--text-secondary)',
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
              <div key={i} className="lcard p-4 flex items-start gap-4"
                   style={{ borderLeft: `3px solid ${PRIORITY_DOT[rec.priority] ?? PRIORITY_DOT.low}` }}>
                <span className="icon w-9 h-9 flex items-center justify-center rounded-xl shrink-0"
                      style={{ fontSize: 20, background: 'var(--bg-elevated)', color: 'var(--primary-500)' }}>
                  {TYPE_ICON[rec.type] ?? 'lightbulb'}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1.5">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                          style={{
                            background: `${PRIORITY_DOT[rec.priority]}18`,
                            color: PRIORITY_DOT[rec.priority],
                            border: `1px solid ${PRIORITY_DOT[rec.priority]}40`,
                          }}>
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

      {/* ── SCROLL TO TOP ── */}
      {showScrollTop && (
        <button
          onClick={scrollToTop}
          className="fixed right-6 bottom-6 flex items-center justify-center w-10 h-10 rounded-full shadow-lg transition-all"
          style={{
            background: 'var(--bg-card)',
            border:     '1px solid var(--border)',
            color:      'var(--text-secondary)',
            zIndex:     40,
          }}
          title="Lên đầu trang"
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--primary-500)'; e.currentTarget.style.color = 'white' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'var(--bg-card)'; e.currentTarget.style.color = 'var(--text-secondary)' }}
        >
          <span className="icon" style={{ fontSize: 20 }}>keyboard_arrow_up</span>
        </button>
      )}
    </div>
  )
}
