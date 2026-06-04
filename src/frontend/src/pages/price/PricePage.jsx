import { useTranslation } from 'react-i18next'
import DevEmptyState from '../../components/ui/DevEmptyState'

export default function PricePage() {
  const { t } = useTranslation()
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{t('price.title')}</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{t('price.subtitle')}</p>
      </div>
      <div className="lcard">
        <DevEmptyState title={t('price.devTitle')} desc={t('price.devDesc')} />
      </div>
    </div>
  )
}
