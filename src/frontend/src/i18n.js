import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import vi from './locales/vi.json'
import en from './locales/en.json'

// Lấy ngôn ngữ đã lưu, mặc định tiếng Việt
const savedLang = localStorage.getItem('lang') ?? 'vi'

i18n
  .use(initReactI18next)
  .init({
    resources: {
      vi: { translation: vi },
      en: { translation: en },
    },
    lng: savedLang,
    fallbackLng: 'vi',
    interpolation: { escapeValue: false }, // React đã tự escape XSS
  })

export default i18n
