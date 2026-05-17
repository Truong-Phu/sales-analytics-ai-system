import { useState, useEffect } from 'react'
import MockToast from '../../components/ui/MockToast'
import { getFeedbackSummary } from '../../api/aiApi'

const MOCK = {
  total_comments: 284, positive: 168, negative: 72, neutral: 44,
  positive_pct: 59.2, negative_pct: 25.4, neutral_pct: 15.5,
  top_issues:  ['giao chậm', 'sai size', 'không phản hồi'],
  top_praises: ['giao nhanh', 'chất vải đẹp', 'đúng mô tả'],
  recent_comments: [
    { comment_id: '1', message: 'Áo đẹp lắm, chất vải mềm mại, giao hàng nhanh hơn dự kiến!',     author_name: 'Nguyễn Thị Lan', sentiment: 'positive', like_count: 12, created_at: '2026-05-15' },
    { comment_id: '2', message: 'Hàng giao chậm quá, order 5 ngày mới nhận, lần sau không mua nữa.', author_name: 'Trần Văn Minh',  sentiment: 'negative', like_count: 3,  created_at: '2026-05-14' },
    { comment_id: '3', message: 'Size hơi nhỏ hơn bình thường, nên lên 1 size.',                   author_name: 'Phạm Thị Hương', sentiment: 'neutral',  like_count: 7,  created_at: '2026-05-13' },
    { comment_id: '4', message: 'Shop nhiệt tình, đổi size nhanh, recommend shop này!',             author_name: 'Lê Quang Hùng',  sentiment: 'positive', like_count: 21, created_at: '2026-05-12' },
    { comment_id: '5', message: 'Màu hơi khác hình, nhưng chất lượng ổn, chấp nhận được.',         author_name: 'Võ Thị Mai',     sentiment: 'neutral',  like_count: 2,  created_at: '2026-05-11' },
  ],
}

function SentimentTag({ label, color }) {
  return (
    <span className={`px-3 py-1 rounded-full text-sm font-medium border ${color}`}>{label}</span>
  )
}

function CommentCard({ comment }) {
  const colors = {
    positive: 'border-l-green-500 bg-green-900/10',
    negative: 'border-l-red-500 bg-red-900/10',
    neutral:  'border-l-gray-500 bg-gray-800/50',
  }
  const icons = { positive: '😊', negative: '😞', neutral: '😐' }

  return (
    <div className={`p-4 rounded-r-lg border-l-2 ${colors[comment.sentiment] ?? colors.neutral}`}>
      <div className="flex items-start gap-3">
        <span className="text-xl shrink-0">{icons[comment.sentiment] ?? '😐'}</span>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-gray-200 leading-relaxed">{comment.message}</p>
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
            <span className="font-medium text-gray-300">{comment.author_name}</span>
            <span>{comment.created_at}</span>
            {comment.like_count > 0 && <span>👍 {comment.like_count}</span>}
          </div>
        </div>
      </div>
    </div>
  )
}

function DonutChart({ pos, neg, neu, total }) {
  const r = 70, cx = 90, cy = 90, stroke = 22
  const circ = 2 * Math.PI * r

  const segments = [
    { pct: pos / total, color: '#22C55E' },
    { pct: neg / total, color: '#EF4444' },
    { pct: neu / total, color: '#6B7280' },
  ]

  let offset = 0
  return (
    <svg width={180} height={180} viewBox="0 0 180 180">
      {segments.map((seg, i) => {
        const len = seg.pct * circ
        const el = (
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
      <text x={cx} y={cy - 6} textAnchor="middle" fill="white" fontSize="22" fontWeight="bold">{total}</text>
      <text x={cx} y={cy + 14} textAnchor="middle" fill="#9CA3AF" fontSize="11">bình luận</text>
    </svg>
  )
}

export default function SentimentPage() {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [isMock,  setIsMock]  = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await getFeedbackSummary()
      if (!res || res.total_comments === 0) {
        setData({ ...MOCK, is_mock: true })
        setIsMock(true)
      } else {
        setData(res)
        setIsMock(false)
      }
    } catch {
      setData({ ...MOCK, is_mock: true })
      setIsMock(true)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  if (loading) return <div className="p-8 text-center text-gray-400">Đang phân tích cảm xúc...</div>

  const d = data ?? MOCK
  const total = d.total_comments || 1

  return (
    <div className="p-6 space-y-6">
      {isMock && <MockToast />}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Cảm xúc Đánh giá</h1>
          <p className="text-sm text-gray-400 mt-1">Phân tích cảm xúc từ bình luận mạng xã hội và sàn TMĐT</p>
        </div>
        <button onClick={load} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">
          Làm mới
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Donut chart */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 flex flex-col items-center">
          <h3 className="text-sm font-semibold text-gray-300 mb-4 self-start">Phân bổ cảm xúc</h3>
          <DonutChart pos={d.positive} neg={d.negative} neu={d.neutral} total={total} />
          <div className="flex gap-4 mt-4 text-sm">
            {[
              { label: 'Tích cực', pct: d.positive_pct, color: 'text-green-400', dot: 'bg-green-500' },
              { label: 'Tiêu cực', pct: d.negative_pct, color: 'text-red-400',   dot: 'bg-red-500'   },
              { label: 'Trung lập',pct: d.neutral_pct,  color: 'text-gray-400',  dot: 'bg-gray-500'  },
            ].map(s => (
              <div key={s.label} className="flex flex-col items-center gap-1">
                <div className={`w-3 h-3 rounded-full ${s.dot}`} />
                <span className={`font-bold ${s.color}`}>{s.pct?.toFixed(1) ?? '–'}%</span>
                <span className="text-xs text-gray-400">{s.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Issues & Praises */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-6 space-y-5">
          <div>
            <h3 className="text-sm font-semibold text-red-400 mb-3">😞 Vấn đề hay gặp</h3>
            <div className="flex flex-wrap gap-2">
              {(d.top_issues ?? []).length > 0
                ? d.top_issues.map(t => <SentimentTag key={t} label={t} color="border-red-500/50 text-red-300" />)
                : <span className="text-gray-500 text-sm">Không có vấn đề nổi bật</span>
              }
            </div>
          </div>
          <div>
            <h3 className="text-sm font-semibold text-green-400 mb-3">😊 Điểm được khen</h3>
            <div className="flex flex-wrap gap-2">
              {(d.top_praises ?? []).length > 0
                ? d.top_praises.map(t => <SentimentTag key={t} label={t} color="border-green-500/50 text-green-300" />)
                : <span className="text-gray-500 text-sm">Chưa có dữ liệu</span>
              }
            </div>
          </div>
          <div className="pt-3 border-t border-gray-700 grid grid-cols-3 gap-2 text-center">
            {[
              { label: 'Tích cực', value: d.positive, color: 'text-green-400' },
              { label: 'Tiêu cực', value: d.negative, color: 'text-red-400'   },
              { label: 'Trung lập', value: d.neutral,  color: 'text-gray-400' },
            ].map(k => (
              <div key={k.label}>
                <div className={`text-xl font-bold ${k.color}`}>{k.value}</div>
                <div className="text-xs text-gray-500">{k.label}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Insight card */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 p-6">
          <h3 className="text-sm font-semibold text-gray-300 mb-4">💡 Nhận xét tự động</h3>
          <div className="space-y-3 text-sm text-gray-300 leading-relaxed">
            {d.positive_pct >= 60 && (
              <p>✅ Khách hàng đang <strong className="text-green-400">hài lòng cao</strong> — tỷ lệ tích cực {d.positive_pct?.toFixed(0)}%.</p>
            )}
            {d.negative_pct >= 30 && (
              <p>⚠️ Tỷ lệ phản hồi tiêu cực {d.negative_pct?.toFixed(0)}% cần được chú ý và xử lý.</p>
            )}
            {(d.top_issues ?? []).includes('giao chậm') && (
              <p>🚚 <strong className="text-yellow-400">Thời gian giao hàng</strong> là vấn đề được nhắc đến nhiều nhất — cần tối ưu với đơn vị vận chuyển.</p>
            )}
            {(d.top_praises ?? []).includes('giao nhanh') && (
              <p>⭐ Khách hàng <strong className="text-green-400">đánh giá cao tốc độ giao hàng</strong> — đây là lợi thế cạnh tranh cần duy trì.</p>
            )}
            <p className="text-gray-500 text-xs">Dữ liệu từ {d.total_comments} bình luận được phân tích.</p>
          </div>
        </div>
      </div>

      {/* Recent comments */}
      <div className="bg-gray-800 rounded-xl border border-gray-700 p-5">
        <h3 className="text-sm font-semibold text-gray-300 mb-4">💬 Bình luận gần đây</h3>
        <div className="space-y-3">
          {(d.recent_comments ?? []).map(c => <CommentCard key={c.comment_id} comment={c} />)}
          {(d.recent_comments ?? []).length === 0 && (
            <p className="text-gray-400 text-sm text-center py-4">Chưa có bình luận nào</p>
          )}
        </div>
      </div>

      <div className="text-xs text-gray-500 bg-gray-800/50 rounded-lg p-3 border border-gray-700">
        💡 Dữ liệu được thu thập từ bình luận Facebook và đánh giá sàn TMĐT.
        Phân tích cảm xúc sử dụng rule-based keyword matching kết hợp từ điển tiếng Việt.
      </div>
    </div>
  )
}
