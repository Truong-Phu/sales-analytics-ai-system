import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

/**
 * Hiển thị màn hình yêu cầu nâng cấp Pro khi người dùng Free cố truy cập tính năng Pro.
 * Dùng trong AppRouter như <PlanRoute minPlan="pro"> hoặc trực tiếp trong page component.
 */
export default function ProGate({ feature = '' }) {
  const { t } = useTranslation()
  const navigate = useNavigate()

  const features = [
    { icon: 'trending_up',   text: t('pro.feature.forecast',    'Dự báo doanh thu AI (Prophet)') },
    { icon: 'crisis_alert',  text: t('pro.feature.anomaly',     'Phát hiện bất thường tự động') },
    { icon: 'psychology',    text: t('pro.feature.ai',          'Gợi ý AI & phân tích nâng cao') },
    { icon: 'picture_as_pdf',text: t('pro.feature.reports',     'Báo cáo nâng cao & xuất PDF') },
    { icon: 'people',        text: t('pro.feature.customers',   'Phân tích khách hàng & RFM') },
  ]

  return (
    <div
      className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center"
    >
      <div
        className="rounded-2xl p-8 max-w-md w-full"
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}
      >
        <div
          className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
          style={{ background: 'linear-gradient(135deg, var(--primary-400), var(--accent-500))' }}
        >
          <span className="icon text-white" style={{ fontSize: 32 }}>workspace_premium</span>
        </div>

        <h2 className="text-xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>
          {t('pro.title', 'Tính năng Pro')}
        </h2>
        <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
          {feature
            ? t('pro.gateMsg', `"${feature}" yêu cầu gói Pro trở lên`, { feature })
            : t('pro.defaultMsg', 'Tính năng này yêu cầu gói Pro trở lên.')
          }
        </p>

        <div className="text-left space-y-2 mb-6">
          {features.map(f => (
            <div key={f.icon} className="flex items-center gap-2">
              <span className="icon icon-sm" style={{ color: 'var(--primary-500)' }}>{f.icon}</span>
              <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{f.text}</span>
            </div>
          ))}
        </div>

        <button
          onClick={() => navigate('/settings?tab=subscription')}
          className="lbtn lbtn-primary w-full mb-2"
        >
          <span className="icon icon-sm">upgrade</span>
          {t('pro.upgradeBtn', 'Nâng cấp Pro ngay')}
        </button>
        <button
          onClick={() => navigate(-1)}
          className="lbtn lbtn-secondary w-full"
        >
          {t('common.goBack', 'Quay lại')}
        </button>
      </div>
    </div>
  )
}
