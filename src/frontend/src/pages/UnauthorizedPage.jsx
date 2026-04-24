import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export default function UnauthorizedPage() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  return (
    <div className="min-h-screen bg-surface flex items-center justify-center p-4">
      <div className="text-center max-w-md">
        <span className="icon text-6xl text-error mb-4 block">lock</span>
        <h1 className="font-headline text-2xl font-bold text-on-surface mb-2">{t('auth.accessDenied')}</h1>
        <p className="text-outline mb-6">{t('auth.unauthorized')}</p>
        <button onClick={() => navigate('/dashboard')} className="btn-primary">
          {t('auth.backHome')}
        </button>
      </div>
    </div>
  )
}
