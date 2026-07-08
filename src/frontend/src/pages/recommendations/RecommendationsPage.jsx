import { useState, useEffect, useCallback, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'
import AiEmptyState from '../../components/ui/AiEmptyState'
import { getRecommendations } from '../../api/aiApi'
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
    badgeColor: '#6366F1',
    samples: [
      'Sản phẩm nào đang có doanh thu cao nhất trong tháng này?',
      'Dự báo doanh thu tháng tới dựa trên dữ liệu lịch sử như thế nào?',
      'Đề xuất chiến lược marketing cho nhóm khách hàng tiềm năng.',
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

const PRIORITY_DOT = { high: '#EF4444', medium: '#F59E0B', low: 'var(--primary-500)' }
const TYPE_FILTER_KEYS = ['all', 'revenue', 'channel', 'product', 'anomaly', 'general']

// Map category gợi ý → trang liên quan
const CATEGORY_LINK = {
  REVENUE:   { path: '/forecast',    label: 'Xem dự báo',       icon: 'trending_up' },
  INVENTORY: { path: '/inventory',   label: 'Xem tồn kho',      icon: 'inventory_2' },
  CHANNEL:   { path: '/attribution', label: 'Xem phân bổ kênh', icon: 'store' },
  MARKETING: { path: '/price',       label: 'Xem giá thị trường', icon: 'price_change' },
}
// Map type gợi ý → trang (fallback khi không có category)
const TYPE_LINK = {
  revenue: { path: '/forecast',    label: 'Xem dự báo',       icon: 'trending_up' },
  channel: { path: '/attribution', label: 'Xem phân bổ kênh', icon: 'store' },
  product: { path: '/basket',      label: 'Xem basket',       icon: 'inventory_2' },
  anomaly: { path: '/anomaly',     label: 'Xem bất thường',   icon: 'warning' },
}

// ── Sub-components ────────────────────────────────────────────────────────────

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
  const [question,         setQuestion]         = useState('')
  const [loading,          setLoading]          = useState(false)
  const [historyLoading,   setHistoryLoading]   = useState(true)
  const [history,          setHistory]          = useState([])   // [{question, answer}]
  const [error,            setError]            = useState('')
  const [smartSuggestions, setSmartSuggestions] = useState(tab.samples.slice(0, 3))
  const bottomRef = useRef(null)

  // Load lịch sử hội thoại từ DB khi mở tab
  useEffect(() => {
    setHistoryLoading(true)
    api.get(`/api/chatbot/history?tab=${tab.id}&limit=50`)
      .then(res => {
        const rows = res.data?.data ?? []
        setHistory(rows.map(r => ({
          question: r.question,
          answer: {
            text:           r.answer,
            recommendation: r.answer,
            confidence:     r.fallbackUsed ? 'medium' : 'high',
            fallbackUsed:   r.fallbackUsed,
            isAiGenerated:  true,
            intent:         r.intent,
            modelUsed:      r.modelUsed,
            sources_used:   tab.sources,
            context_type:   tab.context,
            question:       r.question,
            timestamp:      r.createdAt,
          },
        })))
      })
      .catch(() => {}) // Giữ nguyên [] nếu lỗi
      .finally(() => setHistoryLoading(false))
  }, [tab.id, tab.context, tab.sources])

  // Load gợi ý câu hỏi từ backend theo tab
  useEffect(() => {
    api.get(`/api/chatbot/suggestions?tab=${tab.id}`)
      .then(res => {
        if (res.data?.data?.length > 0) setSmartSuggestions(res.data.data.slice(0, 3))
      })
      .catch(() => {})
  }, [tab.id])

  const clearHistory = async () => {
    try {
      await api.delete(`/api/chatbot/history?tab=${tab.id}`)
    } catch { /* ignore */ }
    setHistory([])
  }

  const handleAsk = useCallback(async () => {
    const q = question.trim()
    if (!q || loading) return
    setLoading(true)
    setError('')
    try {
      // Backend tự load lịch sử từ DB — không cần truyền history từ frontend
      const res = await api.post('/api/chatbot/chat', {
        message: q,
        tab:     tab.id,
        history: [], // backend sẽ tự query DB
      }, { timeout: 90_000 })
      const aiText      = res.data.answer ?? res.data.message ?? 'Xin lỗi, không có phản hồi.'
      const fallback    = res.data.fallbackUsed ?? false
      const isAi        = res.data.isAiGenerated ?? true
      const modelUsed   = res.data.modelUsed ?? ''
      // Groq là AI thật → medium; template_fallback → low; Gemini → high
      const confidence  = !isAi || modelUsed === 'template_fallback'
                            ? 'low'
                            : fallback ? 'medium' : 'high'
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
  }, [question, loading, tab])

  const visibleSuggestions = !historyLoading && history.length === 0
    ? smartSuggestions.slice(0, 3)
    : []

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
        {historyLoading ? (
          <div className="flex items-center justify-center py-8 gap-2" style={{ color: 'var(--text-tertiary)' }}>
            <span className="w-4 h-4 border-2 rounded-full"
                  style={{ borderColor: 'var(--border)', borderTopColor: 'var(--primary-500)', animation: 'spin 0.7s linear infinite' }} />
            <span className="text-xs">Đang tải lịch sử...</span>
          </div>
        ) : history.length === 0 && !loading && (
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
      {visibleSuggestions.length > 0 && (
        <div>
          <p className="text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>Câu hỏi gợi ý:</p>
          <div className="flex flex-col gap-1.5">
            {visibleSuggestions.map((s, i) => (
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
      )}

      {/* Input box */}
      <div className="flex gap-2 items-end">
        <textarea
          value={question}
          onChange={e => setQuestion(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAsk() } }}
          placeholder="Nhập câu hỏi... (Enter để gửi, Shift+Enter xuống dòng)"
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
          title="Gửi (Enter)"
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
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const renderActionButton = (rec) => {
    const title = rec.message || ''
    const cat = rec.category || ''

    // 1. Nhập hàng
    if (cat === 'Tồn kho' || cat === 'Sản phẩm' || title.includes('Sắp hết hàng')) {
      const getProductNameFromTitle = (t) => {
        if (t.startsWith("Sắp hết hàng: ")) return t.replace("Sắp hết hàng: ", "").trim()
        if (t.startsWith("Top sản phẩm: ")) return t.replace("Top sản phẩm: ", "").trim()
        return ""
      }
      const prodName = getProductNameFromTitle(title)
      return (
        <button
          onClick={() => navigate(`/purchase-orders?productName=${encodeURIComponent(prodName)}&returnUrl=${encodeURIComponent('/recommendations?tab=auto')}`)}
          className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all"
          style={{ borderColor: 'rgba(16,185,129,0.4)', color: '#059669', background: 'rgba(16,185,129,0.06)', cursor: 'pointer' }}
          onMouseEnter={e => {
            e.currentTarget.style.background = '#10B981'
            e.currentTarget.style.color = 'white'
            e.currentTarget.style.borderColor = '#10B981'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'rgba(16,185,129,0.06)'
            e.currentTarget.style.color = '#059669'
            e.currentTarget.style.borderColor = 'rgba(16,185,129,0.4)'
          }}
        >
          <span className="icon" style={{ fontSize: 13 }}>local_shipping</span>
          Nhập hàng ngay
          <span className="icon" style={{ fontSize: 13 }}>arrow_forward</span>
        </button>
      )
    }

    // 2. Giữ chân khách hàng
    if (cat === 'CUSTOMER' || title.includes('khách hàng At Risk') || title.includes('rời bỏ') || title.includes('ngừng mua')) {
      return (
        <button
          onClick={() => navigate('/churn')}
          className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all"
          style={{ borderColor: 'rgba(239,68,68,0.4)', color: '#EF4444', background: 'rgba(239,68,68,0.06)', cursor: 'pointer' }}
          onMouseEnter={e => {
            e.currentTarget.style.background = '#EF4444'
            e.currentTarget.style.color = 'white'
            e.currentTarget.style.borderColor = '#EF4444'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'rgba(239,68,68,0.06)'
            e.currentTarget.style.color = '#EF4444'
            e.currentTarget.style.borderColor = 'rgba(239,68,68,0.4)'
          }}
        >
          <span className="icon" style={{ fontSize: 13 }}>campaign</span>
          Chạy chiến dịch giữ chân
          <span className="icon" style={{ fontSize: 13 }}>arrow_forward</span>
        </button>
      )
    }

    // 3. Tạo combo (Marketing / Basket / Mua kèm / Bundle)
    if (
      (cat === 'MARKETING' && (title.includes('Combo') || title.includes('mua kèm') || title.includes('mua cùng') || title.toLowerCase().includes('bundle') || title.includes('→') || title.includes('→'))) ||
      title.toLowerCase().includes('bundle') ||
      title.includes('→')
    ) {
      return (
        <button
          onClick={() => navigate('/basket')}
          className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all"
          style={{ borderColor: 'rgba(236,72,153,0.4)', color: '#EC4899', background: 'rgba(236,72,153,0.06)', cursor: 'pointer' }}
          onMouseEnter={e => {
            e.currentTarget.style.background = '#EC4899'
            e.currentTarget.style.color = 'white'
            e.currentTarget.style.borderColor = '#EC4899'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'rgba(236,72,153,0.06)'
            e.currentTarget.style.color = '#EC4899'
            e.currentTarget.style.borderColor = 'rgba(236,72,153,0.4)'
          }}
        >
          <span className="icon" style={{ fontSize: 13 }}>celebration</span>
          Tạo chiến dịch Combo
          <span className="icon" style={{ fontSize: 13 }}>arrow_forward</span>
        </button>
      )
    }

    // 4. Bất thường (Anomaly / Bất thường / Bất ngờ)
    if (cat === 'ANOMALY' || cat === 'Bất thường' || title.toLowerCase().includes('bất thường') || title.toLowerCase().includes('bất ngờ')) {
      return (
        <button
          onClick={() => navigate('/anomaly')}
          className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all"
          style={{ borderColor: 'rgba(245,158,11,0.4)', color: '#D97706', background: 'rgba(245,158,11,0.06)', cursor: 'pointer' }}
          onMouseEnter={e => {
            e.currentTarget.style.background = '#F59E0B'
            e.currentTarget.style.color = 'white'
            e.currentTarget.style.borderColor = '#F59E0B'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'rgba(245,158,11,0.06)'
            e.currentTarget.style.color = '#D97706'
            e.currentTarget.style.borderColor = 'rgba(245,158,11,0.4)'
          }}
        >
          <span className="icon" style={{ fontSize: 13 }}>warning</span>
          Phân tích bất thường
          <span className="icon" style={{ fontSize: 13 }}>arrow_forward</span>
        </button>
      )
    }

    // 5. Dự báo doanh thu
    if (cat === 'FORECAST' || cat === 'REVENUE' || cat === 'Doanh thu') {
      return (
        <button
          onClick={() => navigate('/forecast')}
          className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all"
          style={{ borderColor: 'rgba(99,102,241,0.4)', color: 'var(--primary-600)', background: 'rgba(99,102,241,0.06)', cursor: 'pointer' }}
          onMouseEnter={e => {
            e.currentTarget.style.background = 'var(--primary-500)'
            e.currentTarget.style.color = 'white'
            e.currentTarget.style.borderColor = 'var(--primary-500)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'rgba(99,102,241,0.06)'
            e.currentTarget.style.color = 'var(--primary-600)'
            e.currentTarget.style.borderColor = 'rgba(99,102,241,0.4)'
          }}
        >
          <span className="icon" style={{ fontSize: 13 }}>trending_up</span>
          Xem dự báo doanh thu
          <span className="icon" style={{ fontSize: 13 }}>arrow_forward</span>
        </button>
      )
    }

    // 6. Tối ưu kênh bán
    if (cat === 'CHANNEL' || cat === 'Kênh bán hàng') {
      return (
        <button
          onClick={() => navigate('/attribution')}
          className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all"
          style={{ borderColor: 'rgba(16,185,129,0.4)', color: '#059669', background: 'rgba(16,185,129,0.06)', cursor: 'pointer' }}
          onMouseEnter={e => {
            e.currentTarget.style.background = '#10B981'
            e.currentTarget.style.color = 'white'
            e.currentTarget.style.borderColor = '#10B981'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = 'rgba(16,185,129,0.06)'
            e.currentTarget.style.color = '#059669'
            e.currentTarget.style.borderColor = 'rgba(16,185,129,0.4)'
          }}
        >
          <span className="icon" style={{ fontSize: 13 }}>store</span>
          Tối ưu kênh bán
          <span className="icon" style={{ fontSize: 13 }}>arrow_forward</span>
        </button>
      )
    }

    // Mặc định fallback
    const link = TYPE_LINK[rec.type]
    if (!link) return null
    return (
      <button
        onClick={() => navigate(link.path)}
        className="mt-3 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all"
        style={{ borderColor: 'rgba(99,102,241,0.4)', color: 'var(--primary-600)', background: 'rgba(99,102,241,0.06)', cursor: 'pointer' }}
        onMouseEnter={e => {
          e.currentTarget.style.background = 'var(--primary-500)'
          e.currentTarget.style.color = 'white'
          e.currentTarget.style.borderColor = 'var(--primary-500)'
        }}
        onMouseLeave={e => {
          e.currentTarget.style.background = 'rgba(99,102,241,0.06)'
          e.currentTarget.style.color = 'var(--primary-600)'
          e.currentTarget.style.borderColor = 'rgba(99,102,241,0.4)'
        }}
      >
        <span className="icon" style={{ fontSize: 13 }}>{link.icon}</span>
        {link.label}
        <span className="icon" style={{ fontSize: 13 }}>arrow_forward</span>
      </button>
    )
  }

  // 2 main tabs: 'chat' = Hỏi AI | 'auto' = Gợi ý AI
  const [mainTab, setMainTab] = useState(() => searchParams.get('tab') === 'auto' ? 'auto' : 'chat')

  // Sub-tab của Hỏi AI
  const [activeTab, setActiveTab] = useState('business')

  // Auto-recommendations
  const [autoData,    setAutoData]    = useState(null)
  const [autoLoading, setAutoLoading] = useState(true)
  const [filter,      setFilter]      = useState('all')

  const [showScrollTop, setShowScrollTop] = useState(false)

  useEffect(() => {
    const onScroll = () => setShowScrollTop(window.scrollY > 300)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Đồng bộ URL khi đổi main tab
  const switchMainTab = (tab) => {
    setMainTab(tab)
    setSearchParams(tab === 'auto' ? { tab: 'auto' } : {})
  }

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' })

  const fetchAutoRecs = async () => {
    setAutoLoading(true)
    try {
      setAutoData(await getRecommendations())
    } catch {
      setAutoData(null)
    } finally {
      setAutoLoading(false)
    }
  }
  useEffect(() => { fetchAutoRecs() }, [])

  const filtered = autoData?.recommendations?.filter(r => filter === 'all' || r.type === filter) ?? []
  const currentTab = TABS.find(t => t.id === activeTab)

  return (
    <div className="space-y-5 pb-24">
      {/* ── Header ── */}
      <div>
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
          {t('recommendations.title')}
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
          {t('recommendations.subtitle')}
        </p>
      </div>

      {/* ── 2 Main Tabs ── */}
      <div className="lcard overflow-hidden">
        <div className="flex border-b" style={{ borderColor: 'var(--border)' }}>
          {[
            { id: 'chat', icon: 'smart_toy',   label: 'Hỏi AI',    color: '#6366F1' },
            { id: 'auto', icon: 'auto_awesome', label: 'Gợi ý AI', color: '#10B981' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => switchMainTab(tab.id)}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-3.5 text-sm font-semibold transition-all"
              style={{
                color:        mainTab === tab.id ? tab.color : 'var(--text-secondary)',
                borderBottom: mainTab === tab.id ? `2px solid ${tab.color}` : '2px solid transparent',
                background:   mainTab === tab.id ? `${tab.color}08` : 'transparent',
              }}
            >
              <span className="icon" style={{ fontSize: 18 }}>{tab.icon}</span>
              {tab.label}
              {tab.id === 'auto' && autoData?.recommendations?.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-xs font-bold"
                      style={{ background: '#10B98118', color: '#10B981' }}>
                  {autoData.recommendations.length}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Tab: Hỏi AI ── */}
        {mainTab === 'chat' && (
          <div>
            {/* 3 sub-tabs nguồn dữ liệu */}
            <div className="flex border-b" style={{ borderColor: 'var(--border)' }}>
              {TABS.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-all"
                  style={{
                    color:       activeTab === tab.id ? tab.badgeColor : 'var(--text-secondary)',
                    borderBottom: activeTab === tab.id ? `2px solid ${tab.badgeColor}` : '2px solid transparent',
                    background:  activeTab === tab.id ? `${tab.badgeColor}08` : 'transparent',
                  }}
                >
                  <span className="icon" style={{ fontSize: 14 }}>{tab.icon}</span>
                  <span className="hidden sm:inline">{tab.label}</span>
                  <span className="sm:hidden">{tab.emoji}</span>
                </button>
              ))}
            </div>
            <div className="p-5">
              {currentTab && <ChatTab key={activeTab} tab={currentTab} />}
            </div>
          </div>
        )}

        {/* ── Tab: Gợi ý AI ── */}
        {mainTab === 'auto' && (
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <span className="icon" style={{ color: '#10B981', fontSize: 18 }}>auto_awesome</span>
                <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Gợi ý tự động từ AI
                </span>
                {autoData?.generatedAt && (
                  <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
                    · Cập nhật: {new Date(autoData.generatedAt).toLocaleString('vi-VN')}
                  </span>
                )}
              </div>
              <button onClick={fetchAutoRecs} className="lbtn lbtn-secondary !h-8 text-xs" disabled={autoLoading}>
                <span className="icon text-base" style={{ ...(autoLoading && { animation: 'spin 1s linear infinite' }) }}>
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

            {!autoData && !autoLoading && <AiEmptyState title="Chưa có dữ liệu gợi ý AI" />}

            {autoLoading ? (
              <div className="py-10 flex items-center justify-center">
                <span className="w-6 h-6 border-2 rounded-full"
                      style={{ borderColor: 'var(--border-strong)', borderTopColor: 'var(--primary-500)', animation: 'spin 0.8s linear infinite' }} />
              </div>
            ) : filtered.length === 0 ? (
              <div className="py-10 flex flex-col items-center gap-3" style={{ color: 'var(--text-tertiary)' }}>
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
                      {renderActionButton(rec)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
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
