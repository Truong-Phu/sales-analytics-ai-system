import api from './axios'
import i18n from '../i18n'

/**
 * Xuất báo cáo PDF — truyền ngôn ngữ hiện tại để backend render đúng ngôn ngữ.
 */
export const exportPdf = async (params) => {
  const lang = (i18n.language ?? 'vi').startsWith('en') ? 'en' : 'vi'
  const response = await api.get('/api/report/export-pdf', {
    params: { ...params, lang },
    responseType: 'blob',
  })
  const prefix = lang === 'en' ? 'SalesReport' : 'BaoCao'
  const url  = URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }))
  const link = document.createElement('a')
  link.href  = url
  link.download = `${prefix}_${params.from}_${params.to}.pdf`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
