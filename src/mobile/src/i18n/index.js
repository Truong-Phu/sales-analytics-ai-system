import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { storage } from '../api/storage'
import vi from './vi.json'
import en from './en.json'

const LANG_KEY = 'app_language'

// Khởi tạo i18n đồng bộ trước, sau đó load language đã lưu từ storage
i18n
  .use(initReactI18next)
  .init({
    resources: {
      vi: { translation: vi },
      en: { translation: en },
    },
    lng:           'vi',
    fallbackLng:   'vi',
    interpolation: { escapeValue: false },
    compatibilityJSON: 'v3',
  })

// Load ngôn ngữ đã lưu từ AsyncStorage và áp dụng ngay
storage.getItem(LANG_KEY)
  .then(saved => { if (saved && saved !== i18n.language) i18n.changeLanguage(saved) })
  .catch(() => {})

export default i18n
