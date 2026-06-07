import i18n from '../i18n'

function currentLocale() {
  return i18n.language === 'en' ? 'en-US' : 'vi-VN'
}

export function formatMoney(value) {
  if (value == null || !Number.isFinite(Number(value))) return '0'
  return Math.round(Number(value)).toLocaleString(currentLocale())
}

export function formatMoneyWithSymbol(value) {
  return `₫${formatMoney(value)}`
}
