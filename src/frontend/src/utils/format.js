/**
 * Định dạng tiền/số theo ngôn ngữ hiện tại (i18n-aware).
 * Đọc i18n.language từ singleton tại thời điểm gọi → tự động cập nhật khi đổi ngôn ngữ.
 *
 * vi: 12,5 triệu / 1,2 tỷ / 500 nghìn
 * en: 12.5M     / 1.2B  / 500K
 */
import i18n from '../i18n'

function isVi() { return i18n.language !== 'en' }

/** Định dạng số tiền rút gọn, dùng cho biểu đồ và bảng phụ cần tiết kiệm không gian. */
export function fmtM(v) {
  if (v == null || !Number.isFinite(Number(v))) return '₫0'
  const n = Number(v)
  if (isVi()) {
    if (n >= 1_000_000_000) return `₫${(n / 1_000_000_000).toFixed(1)} tỷ`
    if (n >= 1_000_000)     return `₫${(n / 1_000_000).toFixed(1)} triệu`
    if (n >= 1_000)         return `₫${(n / 1_000).toFixed(0)} nghìn`
    return `₫${n.toLocaleString('vi-VN')}`
  }
  if (n >= 1_000_000_000) return `₫${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000)     return `₫${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)         return `₫${(n / 1_000).toFixed(0)}K`
  return `₫${n.toLocaleString('en-US')}`
}

/** Định dạng số tiền đầy đủ, dùng cho KPI kinh doanh cần đối chiếu chính xác. */
export function fmtMoneyExact(v) {
  if (v == null || !Number.isFinite(Number(v))) return '₫0'
  const n = Math.round(Number(v))
  return `₫${n.toLocaleString(isVi() ? 'vi-VN' : 'en-US')}`
}

/**
 * Định dạng trục Y chart — giá trị RAW (đơn vị đồng).
 * Ngắn gọn để vừa chiều rộng YAxis (width≈52px).
 * vi: 12 tr / 1,5 tỷ   en: 12M / 1.5B
 */
export function tickFmt(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return ''
  if (isVi()) {
    if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)} tỷ`
    if (n >= 1_000_000)     return `${(n / 1_000_000).toFixed(0)} tr`
    if (n >= 1_000)         return `${(n / 1_000).toFixed(0)} ng`
    return String(Math.round(n))
  }
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`
  if (n >= 1_000_000)     return `${(n / 1_000_000).toFixed(0)}M`
  if (n >= 1_000)         return `${(n / 1_000).toFixed(0)}K`
  return String(Math.round(n))
}

/**
 * Định dạng trục Y chart khi data ĐÃ chia sẵn cho 1_000_000 (đơn vị triệu đồng).
 * vi: "12 tr"  en: "12M"
 */
export function tickFmtPreM(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return ''
  return isVi() ? `${n.toFixed(0)} tr` : `${n.toFixed(0)}M`
}

/**
 * Tách chuỗi tiền tệ thành số và đơn vị để render khác font-size.
 * "₫12.5 triệu" → { sym:"₫", num:"12.5", unit:"triệu" }
 * "₫1.2B"       → { sym:"₫", num:"1.2",  unit:"B"     }
 * "₫500K"       → { sym:"₫", num:"500",  unit:"K"     }
 */
export function splitFmt(str) {
  const s = String(str ?? '').trim()
  // Tách ký hiệu tiền, số, đơn vị
  const m = s.match(/^(₫?)([\d,.]+)\s*(triệu|tỷ|nghìn|B|M|K|tr|ng)?$/)
  if (!m) return { sym: '', num: s, unit: '' }
  return { sym: m[1], num: m[2], unit: m[3] ?? '' }
}

/**
 * Xuất mảng object ra file CSV và trigger download trình duyệt.
 * Thêm BOM UTF-8 để Excel Việt Nam hiển thị đúng tiếng Việt.
 *
 * @param {string} filename   Tên file, ví dụ: 'san_pham_2026-05-29.csv'
 * @param {object[]} rows     Mảng object — keys là tên cột
 */
export function exportToCsv(filename, rows) {
  if (!rows?.length) return
  const headers = Object.keys(rows[0])
  const escape  = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const csv = [headers.map(escape).join(','), ...rows.map(r => headers.map(h => escape(r[h])).join(','))].join('\r\n')
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = Object.assign(document.createElement('a'), { href: url, download: filename })
  document.body.appendChild(a); a.click()
  document.body.removeChild(a); URL.revokeObjectURL(url)
}
