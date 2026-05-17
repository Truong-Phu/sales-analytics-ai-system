import { useState, useRef, useEffect } from 'react'
import { askRecommendation } from '../../api/aiApi'

const SAMPLE_QUESTIONS = [
  'Kênh nào đang bán chạy nhất trong 30 ngày qua?',
  'Sản phẩm nào có nguy cơ hết hàng trong tuần tới?',
  'Tại sao doanh thu tuần này giảm so với tuần trước?',
  'Khách hàng nào có giá trị vòng đời cao nhất?',
  'Tôi nên chạy chiến dịch nào cho mùa hè này?',
  'Phân khúc khách hàng nào đang có xu hướng churn?',
]

function ConfidenceBadge({ level }) {
  const map = {
    high:   { cls: 'bg-green-500/20 text-green-400 border border-green-500/30', label: 'Cao' },
    medium: { cls: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30', label: 'Trung bình' },
    low:    { cls: 'bg-gray-500/20 text-gray-400 border border-gray-600', label: 'Thấp' },
  }
  const { cls, label } = map[level] ?? map.low
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>Độ tin cậy: {label}</span>
}

function renderBold(text) {
  return (text ?? '').split('**').map((part, i) =>
    i % 2 === 0 ? part : <strong key={i} className="text-white font-semibold">{part}</strong>
  )
}

export default function NlqPage() {
  const [messages, setMessages] = useState([])
  const [question, setQuestion] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [lang,     setLang]     = useState('vi')
  const bottomRef = useRef(null)
  const textareaRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async (q = question) => {
    const text = q.trim()
    if (!text || loading) return

    setMessages(prev => [...prev, { role: 'user', text, ts: new Date() }])
    setQuestion('')
    setLoading(true)

    try {
      const res = await askRecommendation({ question: text, language: lang })
      setMessages(prev => [...prev, {
        role: 'ai',
        text: res.recommendation ?? 'Không có câu trả lời.',
        confidence: res.confidence ?? 'low',
        sources: res.data_sources ?? [],
        note: res.note ?? '',
        ts: new Date(),
      }])
    } catch {
      setMessages(prev => [...prev, {
        role: 'ai',
        text: 'Không thể kết nối đến AI Service. Vui lòng thử lại sau.',
        confidence: 'low',
        sources: [],
        note: '',
        ts: new Date(),
      }])
    } finally { setLoading(false) }
  }

  const handleKey = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
  }

  const clear = () => setMessages([])

  return (
    <div className="p-6 h-[calc(100vh-80px)] flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Hỏi AI</h1>
          <p className="text-sm text-gray-400 mt-1">Đặt câu hỏi bằng ngôn ngữ tự nhiên – AI trả lời dựa trên dữ liệu thực tế</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setLang(l => l === 'vi' ? 'en' : 'vi')}
            className="px-3 py-2 border border-gray-600 text-gray-300 rounded-lg text-sm hover:border-blue-500">
            {lang === 'vi' ? '🇻🇳 VI' : '🇬🇧 EN'}
          </button>
          {messages.length > 0 && (
            <button onClick={clear} className="px-3 py-2 border border-gray-600 text-gray-400 rounded-lg text-sm hover:text-red-400 hover:border-red-500">
              Xóa lịch sử
            </button>
          )}
        </div>
      </div>

      {/* Chat area */}
      <div className="flex-1 overflow-y-auto space-y-4 pr-1">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center gap-6">
            <div className="text-center">
              <div className="text-5xl mb-3">🤖</div>
              <h2 className="text-lg font-semibold text-white">Chào! Tôi là AI Assistant</h2>
              <p className="text-gray-400 text-sm mt-1">Hỏi tôi bất kỳ điều gì về dữ liệu kinh doanh của bạn</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-w-2xl w-full">
              {SAMPLE_QUESTIONS.map(q => (
                <button key={q} onClick={() => send(q)}
                  className="text-left p-3 bg-gray-800 border border-gray-700 rounded-xl text-sm text-gray-300
                             hover:border-blue-500 hover:text-white transition-colors">
                  💬 {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'user' ? (
                  <div className="max-w-[70%] bg-blue-600 text-white rounded-2xl rounded-tr-sm px-4 py-3 text-sm">
                    {msg.text}
                    <div className="text-xs text-blue-200 mt-1 text-right">
                      {msg.ts.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                ) : (
                  <div className="max-w-[80%] space-y-2">
                    <div className="bg-gray-800 border border-gray-700 rounded-2xl rounded-tl-sm px-4 py-3">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-sm">🤖</span>
                        <span className="text-xs font-semibold text-blue-400">AI Assistant</span>
                        <ConfidenceBadge level={msg.confidence} />
                      </div>
                      <p className="text-sm text-gray-200 leading-relaxed">{renderBold(msg.text)}</p>
                      {msg.note && (
                        <p className="text-xs text-gray-500 mt-2 italic">{msg.note}</p>
                      )}
                      {(msg.sources ?? []).length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          <span className="text-xs text-gray-500">Nguồn:</span>
                          {msg.sources.map(s => (
                            <span key={s} className="px-1.5 py-0.5 bg-gray-700 rounded text-xs text-gray-400">{s}</span>
                          ))}
                        </div>
                      )}
                      <div className="text-xs text-gray-500 mt-2 text-right">
                        {msg.ts.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-gray-800 border border-gray-700 rounded-2xl rounded-tl-sm px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">🤖</span>
                    <div className="flex gap-1">
                      {[0, 1, 2].map(i => (
                        <div key={i} className="w-2 h-2 bg-blue-400 rounded-full animate-bounce"
                          style={{ animationDelay: `${i * 0.15}s` }} />
                      ))}
                    </div>
                    <span className="text-xs text-gray-400">Đang phân tích dữ liệu...</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* Input area */}
      <div className="bg-gray-800 border border-gray-700 rounded-xl p-3 flex gap-3">
        <textarea
          ref={textareaRef}
          value={question}
          onChange={e => setQuestion(e.target.value)}
          onKeyDown={handleKey}
          placeholder="Nhập câu hỏi... (Enter để gửi, Shift+Enter xuống dòng)"
          rows={2}
          disabled={loading}
          className="flex-1 bg-transparent text-white text-sm resize-none outline-none
                     placeholder-gray-500 disabled:opacity-50"
        />
        <button
          onClick={() => send()}
          disabled={loading || !question.trim()}
          className="self-end px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium
                     hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors shrink-0"
        >
          {loading ? '...' : 'Gửi'}
        </button>
      </div>

      <p className="text-xs text-gray-600 text-center -mt-2">
        AI trả lời dựa trên dữ liệu thực tế trong hệ thống — không tự bịa đặt thông tin
      </p>
    </div>
  )
}
