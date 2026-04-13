import api from './axios'

/**
 * Xuất báo cáo PDF.
 * Trả về Blob để trigger download trên browser.
 */
export const exportPdf = async (params) => {
  const response = await api.get('/api/report/export-pdf', {
    params,
    responseType: 'blob',
  })
  // Tạo link download
  const url  = URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }))
  const link = document.createElement('a')
  link.href  = url
  link.download = `BaoCao_${params.from}_${params.to}.pdf`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
