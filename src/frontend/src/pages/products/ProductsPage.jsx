import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import DetailDrawer from '../../components/ui/DetailDrawer'
import { getOltpProducts, createProduct, updateProduct, deleteProduct, getCategories, uploadProductImage, getChannelPrices, saveChannelPrice } from '../../api/dashboardApi'
import ConfirmDialog from '../../components/ui/ConfirmDialog'
import { useAuth } from '../../hooks/useAuth'
import { useDebounce } from '../../hooks/useDebounce'
import { exportToCsv, fmtMoneyExact } from '../../utils/format'
import api from '../../api/axios'

const PAGE_SIZE = 10

function StockBadge({ p, t }) {
  if (!(p.isActive ?? true))
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                 style={{ background: 'rgba(107,114,128,0.10)', border: '1px solid rgba(107,114,128,0.30)', color: '#6B7280' }}>
             <span className="w-1.5 h-1.5 rounded-full bg-gray-500" />Ngừng bán
           </span>
  const stock = p.stock ?? p.stockQuantity ?? 0
  if (stock === 0)
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                 style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.30)', color: '#EF4444' }}>
             <span className="w-1.5 h-1.5 rounded-full bg-red-500" />Hết hàng
           </span>
  if (stock < 20)
    return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                 style={{ background: 'rgba(245,158,11,0.10)', border: '1px solid rgba(245,158,11,0.30)', color: '#F59E0B' }}>
             <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />{t('products.status.low_stock')}
           </span>
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
               style={{ background: 'rgba(16,185,129,0.10)', border: '1px solid rgba(16,185,129,0.30)', color: 'var(--accent-500)' }}>
           <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--accent-500)' }} />{t('products.status.active')}
         </span>
}

const EMPTY_FORM = { sku: '', productName: '', description: '', basePrice: '', costPrice: '', stockQuantity: 0, categoryId: '' }

// ── Modal CHI TIẾT + CHỈNH SỬA sản phẩm (kết hợp view/edit inline) ──────────
const CHANNELS_LIST = ['Shopee', 'Lazada', 'TikTok Shop', 'Facebook', 'Website', 'Khác']

function ProductDetailModal({ product, canEdit, onClose, onSaved }) {
  const [mode,          setMode]          = useState('view') // 'view' | 'edit' | 'channel' | 'variations'
  const [editData,      setEditData]      = useState(null)
  const [categories,    setCategories]    = useState([])
  const [imgFile,       setImgFile]       = useState(null)
  const [imgPreview,    setImgPreview]    = useState(null)
  const [saving,        setSaving]        = useState(false)
  const [err,           setErr]           = useState('')
  // Channel prices state
  const [chanPrices,    setChanPrices]    = useState([])
  const [chanLoading,   setChanLoading]   = useState(false)
  const [chanSaving,    setChanSaving]    = useState({})
  const [chanEdit,      setChanEdit]      = useState({})
  // Suppliers cho sản phẩm này
  const [suppliers,     setSuppliers]     = useState([])
  // Biến thể sản phẩm
  const [variations,    setVariations]    = useState([])
  const [varLoading,    setVarLoading]    = useState(false)
  const [varSaving,     setVarSaving]     = useState(false)
  const [varDeleting,   setVarDeleting]   = useState(null)
  const [varErr,        setVarErr]        = useState('')
  const [varConfirmDlg, setVarConfirmDlg] = useState(null)
  const [showVarForm,   setShowVarForm]   = useState(false)
  const [varForm,       setVarForm]       = useState({ sku: '', color: '', size: '', salePrice: '', stockQuantity: 0 })
  const fileRef = useRef(null)

  const productId = product.oltpProductId ?? product.oltp_product_id ?? product.product_id ?? product.productId ?? product.id

  // Tải danh mục khi mở chế độ edit
  useEffect(() => {
    if (mode === 'edit' && categories.length === 0)
      getCategories().then(setCategories).catch(() => setCategories([]))
  }, [mode, categories.length])

  // Tải giá theo kênh khi mở tab channel
  useEffect(() => {
    if (mode !== 'channel' || !productId) return
    setChanLoading(true)
    getChannelPrices(productId)
      .then(rows => {
        setChanPrices(rows)
        const init = {}
        rows.forEach(r => { init[r.channel] = r.price })
        setChanEdit(init)
      })
      .catch(() => {})
      .finally(() => setChanLoading(false))
  }, [mode, productId])

  // Tải danh sách NCC khi xem chi tiết
  useEffect(() => {
    if (!productId) return
    api.get(`/api/suppliers/by-product/${productId}`)
       .then(r => setSuppliers(r.data ?? []))
       .catch(() => setSuppliers([]))
  }, [productId])

  const reloadVariations = () => {
    if (!productId) return
    setVarLoading(true)
    api.get(`/api/products/${productId}/variations`)
       .then(r => setVariations(r.data?.data ?? r.data ?? []))
       .catch(() => setVariations([]))
       .finally(() => setVarLoading(false))
  }

  // Tải biến thể khi mở tab variations
  useEffect(() => {
    if (mode !== 'variations' || !productId) return
    reloadVariations()
  }, [mode, productId]) // eslint-disable-line

  const handleAddVariation = async () => {
    if (!varForm.sku.trim()) { setVarErr('SKU biến thể là bắt buộc.'); return }
    setVarSaving(true); setVarErr('')
    try {
      await api.post(`/api/products/${productId}/variations`, {
        sku:           varForm.sku.trim(),
        color:         varForm.color.trim() || null,
        size:          varForm.size.trim()  || null,
        salePrice:     varForm.salePrice ? Number(varForm.salePrice) : null,
        stockQuantity: Number(varForm.stockQuantity) || 0,
      })
      setVarForm({ sku: '', color: '', size: '', salePrice: '', stockQuantity: 0 })
      setShowVarForm(false)
      reloadVariations()
    } catch (e) {
      setVarErr(e.response?.data?.message ?? 'Lỗi thêm biến thể.')
    } finally { setVarSaving(false) }
  }

  const handleDeleteVariation = (varId) => {
    setVarConfirmDlg({ varId })
  }

  const doDeleteVariation = async (varId) => {
    setVarDeleting(varId)
    try {
      await api.delete(`/api/products/${productId}/variations/${varId}`)
      reloadVariations()
    } catch (e) {
      setVarErr(e.response?.data?.message ?? 'Lỗi xóa biến thể.')
    } finally { setVarDeleting(null) }
  }

  const handleSaveChanPrice = async (channel) => {
    if (!productId) return
    setChanSaving(s => ({ ...s, [channel]: true }))
    try {
      await saveChannelPrice(productId, { channel, price: Number(chanEdit[channel] ?? 0), isActive: true })
      // Refresh
      const rows = await getChannelPrices(productId)
      setChanPrices(rows)
    } catch { /* ignore */ }
    finally { setChanSaving(s => ({ ...s, [channel]: false })) }
  }

  const enterEdit = () => {
    setEditData({
      productId,
      sku:           product.sku ?? '',
      productName:   product.product_name ?? product.productName ?? product.name ?? '',
      description:   product.description ?? '',
      basePrice:     product.unit_price ?? product.basePrice ?? product.price ?? '',
      costPrice:     product.cost_price ?? product.costPrice ?? '',
      stockQuantity: product.stock ?? product.stockQuantity ?? 0,
      categoryId:    product.oltpCategoryId ?? product.oltp_category_id ?? product.category_id ?? product.categoryId ?? '',
      imageUrl:      product.imageUrl ?? null,
    })
    setImgPreview(product.imageUrl ?? null)
    setMode('edit')
  }

  const set = (field) => (e) => setEditData(f => ({ ...f, [field]: e.target.value }))

  const handleImgSelect = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setImgFile(file)
    setImgPreview(URL.createObjectURL(file))
  }

  const handleSave = async () => {
    if (!editData.sku || !editData.productName || !editData.basePrice || !editData.categoryId) {
      setErr('Vui lòng nhập đầy đủ SKU, Tên sản phẩm, Giá bán và Danh mục')
      return
    }
    setSaving(true); setErr('')
    try {
      await updateProduct(editData.productId, {
        sku:           editData.sku,
        productName:   editData.productName,
        description:   editData.description || null,
        basePrice:     Number(editData.basePrice),
        costPrice:     editData.costPrice ? Number(editData.costPrice) : null,
        stockQuantity: Number(editData.stockQuantity) || 0,
        categoryId:    Number(editData.categoryId),
      })
      if (imgFile) {
        await uploadProductImage(editData.productId, imgFile)
      }
      onSaved?.()
    } catch (e) {
      setErr(e.response?.data?.message ?? 'Lỗi cập nhật sản phẩm')
    } finally {
      setSaving(false)
    }
  }

  const catOptions = categories.map(c => ({
    value: c.categoryId,
    label: c.level > 1 ? `  └ ${c.categoryName}` : c.categoryName,
  }))

  const drawerFooter = mode === 'view' ? (
    <>
      <button onClick={onClose} className="lbtn lbtn-secondary flex-1 justify-center">Đóng</button>
      {canEdit && (product.oltpProductId ?? product.oltp_product_id ?? product.product_id) && (
        <button onClick={enterEdit} className="lbtn lbtn-primary flex-1 justify-center">
          <span className="icon text-sm">edit</span>Chỉnh sửa
        </button>
      )}
    </>
  ) : mode === 'channel' || mode === 'variations' ? (
    <button onClick={onClose} className="lbtn lbtn-secondary w-full justify-center">Đóng</button>
  ) : (
    <>
      <button onClick={() => { setMode('view'); setErr('') }} className="lbtn lbtn-secondary flex-1 justify-center">Hủy</button>
      <button onClick={handleSave} disabled={saving} className="lbtn lbtn-primary flex-1 justify-center">
        {saving ? 'Đang lưu...' : 'Lưu thay đổi'}
      </button>
    </>
  )

  return (
    <>
    <ConfirmDialog
      open={!!varConfirmDlg}
      title="Xóa biến thể"
      message="Xóa biến thể này?"
      icon="delete_forever"
      danger
      onClose={() => setVarConfirmDlg(null)}
      onConfirm={() => { const id = varConfirmDlg?.varId; setVarConfirmDlg(null); doDeleteVariation(id) }}
    />
    <DetailDrawer
      open={true}
      onClose={onClose}
      title={mode === 'edit' ? 'Chỉnh sửa sản phẩm' : mode === 'channel' ? 'Giá theo kênh' : 'Chi tiết sản phẩm'}
      subtitle={mode === 'view' && product.sku ? `SKU: ${product.sku}` : undefined}
      width={560}
      footer={drawerFooter}
    >
      {/* Tab strip — sticky trong vùng cuộn */}
      {mode !== 'edit' && productId && (
        <div className="flex gap-0 px-5 pt-3"
             style={{ position: 'sticky', top: 0, zIndex: 1, borderBottom: '1px solid var(--border)', background: 'var(--bg-card)' }}>
          {[
            { key: 'view',       label: 'Thông tin chung', icon: 'info'         },
            { key: 'variations', label: 'Biến thể',         icon: 'style'        },
            { key: 'channel',    label: 'Giá theo kênh',   icon: 'price_change' },
          ].map(tb => (
            <button key={tb.key} onClick={() => { setMode(tb.key); setErr('') }}
                    className="flex items-center gap-1.5 pb-2.5 px-3 text-xs font-medium transition-all"
                    style={{
                      borderBottom: `2px solid ${mode === tb.key ? 'var(--primary-500)' : 'transparent'}`,
                      color: mode === tb.key ? 'var(--primary-500)' : 'var(--text-secondary)',
                      marginBottom: -1,
                    }}>
              <span className="icon" style={{ fontSize: 15 }}>{tb.icon}</span>
              {tb.label}
            </button>
          ))}
        </div>
      )}

      <div className="p-5 space-y-4">
        {err && <p className="text-xs rounded-lg px-3 py-2" style={{ background: 'rgba(239,68,68,0.1)', color: '#EF4444' }}>{err}</p>}

        {/* ── VIEW MODE — layout 2 cột ── */}
        {mode === 'view' && (
          <div className="flex gap-5">
            {/* Cột trái 40%: ảnh + badges */}
            <div className="flex flex-col items-center gap-3 shrink-0" style={{ width: '38%' }}>
              <div className="w-full rounded-xl overflow-hidden"
                   style={{ aspectRatio: '1', border: '1px solid var(--border)' }}>
                {product.imageUrl
                  ? <img src={product.imageUrl} alt="product" className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex flex-col items-center justify-center gap-2"
                         style={{ background: 'var(--bg-elevated)', color: 'var(--text-tertiary)' }}>
                      <span className="icon" style={{ fontSize: 36, opacity: 0.35 }}>image_not_supported</span>
                      <p className="text-xs">Chưa có ảnh</p>
                    </div>
                }
              </div>
              {/* Trạng thái */}
              {!(product.isActive ?? true)
                ? <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium"
                         style={{ background: 'rgba(107,114,128,0.1)', border: '1px solid rgba(107,114,128,0.3)', color: '#6B7280' }}>
                    <span className="w-1.5 h-1.5 rounded-full bg-gray-500" />Ngừng bán
                  </span>
                : (product.stock ?? product.stockQuantity ?? 0) === 0
                  ? <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium"
                           style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', color: '#EF4444' }}>
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500" />Hết hàng
                    </span>
                  : <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium"
                           style={{ background: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.3)', color: 'var(--accent-500)' }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: 'var(--accent-500)' }} />Đang bán
                    </span>
              }
              {/* Badge danh mục */}
              {product.category && (
                <span className="inline-flex px-3 py-1 rounded-full text-xs font-medium text-center"
                      style={{ background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}>
                  {product.category}
                </span>
              )}
            </div>

            {/* Cột phải 60%: thông tin */}
            <div className="flex-1 min-w-0 space-y-3">
              <div>
                <h3 className="font-bold text-base leading-snug" style={{ color: 'var(--text-primary)' }}>
                  {product.product_name ?? product.name}
                </h3>
                <p className="text-sm font-mono mt-1" style={{ color: 'var(--text-secondary)' }}>
                  {product.sku}
                </p>
              </div>

              <div style={{ borderTop: '1px solid var(--border)' }} />

              {/* Grid 2 cột thông số */}
              <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                {[
                  ['Giá bán',     fmtMoneyExact(product.unit_price ?? product.price ?? 0)],
                  ['Giá vốn',     fmtMoneyExact(product.cost_price ?? product.costPrice ?? 0)],
                  ['Tồn kho',     (product.stock ?? 0).toLocaleString()],
                  ['Danh mục',    product.category ?? product.categoryName ?? '—'],
                  ['Thương hiệu', product.brand ?? '—'],
                  ['Số đơn hàng', (product.total_orders ?? 0).toLocaleString()],
                ].map(([label, value]) => (
                  <div key={label}>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{label}</p>
                    <p className="font-semibold mt-0.5" style={{ color: 'var(--text-primary)' }}>{value}</p>
                  </div>
                ))}
              </div>

              {/* Nhà cung cấp */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                <p className="text-sm mb-1.5" style={{ color: 'var(--text-secondary)' }}>Nhà cung cấp</p>
                {suppliers.length === 0 ? (
                  <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Chưa liên kết nhà cung cấp</p>
                ) : (
                  <div className="space-y-1">
                    {suppliers.map(s => (
                      <div key={s.supplierId} className="flex items-center justify-between">
                        <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                          {s.supplierName}
                          {s.supplierCode && (
                            <span className="ml-1.5 text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
                              {s.supplierCode}
                            </span>
                          )}
                        </span>
                        <span className="text-xs tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                          {s.importPrice > 0 ? `Giá nhập: ${fmtMoneyExact(s.importPrice)}` : 'Chưa có giá'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Mô tả */}
              {product.description && (
                <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                  <p className="text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>Mô tả</p>
                  <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                    {product.description}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── CHANNEL PRICES MODE ── */}
        {mode === 'channel' && (
          <div className="space-y-2">
            {chanLoading ? (
              <div className="py-8 flex items-center justify-center">
                <span className="w-5 h-5 border-2 rounded-full"
                      style={{ borderColor: 'var(--border-strong)', borderTopColor: 'var(--primary-500)', animation: 'spin 0.8s linear infinite' }} />
              </div>
            ) : (
              CHANNELS_LIST.map(ch => {
                const existing = chanPrices.find(r => r.channel === ch)
                const val      = chanEdit[ch] ?? (existing?.price ?? '')
                const saving   = chanSaving[ch]
                return (
                  <div key={ch} className="flex items-center gap-2 p-2 rounded-lg"
                       style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                    <span className="flex-none text-sm font-medium w-28 truncate" style={{ color: 'var(--text-primary)' }}>{ch}</span>
                    <input
                      type="number" min={0} placeholder="Giá bán (₫)"
                      className="linput !h-8 text-sm flex-1"
                      value={val}
                      onChange={e => setChanEdit(m => ({ ...m, [ch]: e.target.value }))}
                      disabled={saving || !canEdit}
                    />
                    {canEdit && (
                      <button
                        onClick={() => handleSaveChanPrice(ch)}
                        disabled={saving}
                        className="lbtn lbtn-primary !h-8 !px-3 text-xs shrink-0">
                        {saving
                          ? <span className="w-3 h-3 border-2 rounded-full" style={{ borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff', animation: 'spin 0.8s linear infinite' }} />
                          : 'Lưu'
                        }
                      </button>
                    )}
                  </div>
                )
              })
            )}
          </div>
        )}

        {/* ── VARIATIONS MODE ── */}
        {mode === 'variations' && (
          <div className="space-y-3">
            {varErr && (
              <p className="text-xs rounded-lg px-3 py-2" style={{ background: 'rgba(239,68,68,0.1)', color: '#EF4444' }}>
                {varErr}
              </p>
            )}

            {/* Bảng biến thể hiện có */}
            {varLoading ? (
              <div className="py-8 flex items-center justify-center">
                <span className="w-5 h-5 border-2 rounded-full"
                      style={{ borderColor: 'var(--border-strong)', borderTopColor: 'var(--primary-500)', animation: 'spin 0.8s linear infinite' }} />
              </div>
            ) : (
              <div className="overflow-x-auto rounded-lg" style={{ border: '1px solid var(--border)' }}>
                <table className="w-full text-sm">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
                      {['SKU', 'Màu', 'Size', 'Giá bán', 'Tồn kho', ''].map(h => (
                        <th key={h} className="text-left px-3 py-2 text-xs font-medium"
                            style={{ color: 'var(--text-tertiary)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {variations.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-3 py-6 text-center text-xs" style={{ color: 'var(--text-tertiary)' }}>
                          Sản phẩm chưa có biến thể. Nhấn "+ Thêm biến thể" để bắt đầu.
                        </td>
                      </tr>
                    ) : variations.map(v => (
                      <tr key={v.variationId} style={{ borderBottom: '1px solid var(--border)' }}>
                        <td className="px-3 py-2 font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>
                          {v.sku ?? '—'}
                        </td>
                        <td className="px-3 py-2 text-xs" style={{ color: 'var(--text-primary)' }}>
                          {v.color ? (
                            <span className="px-1.5 py-0.5 rounded text-xs"
                                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                              {v.color}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-3 py-2 text-xs" style={{ color: 'var(--text-primary)' }}>
                          {v.size ? (
                            <span className="px-1.5 py-0.5 rounded text-xs"
                                  style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                              {v.size}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="px-3 py-2 font-mono text-xs tabular-nums" style={{ color: 'var(--text-primary)' }}>
                          {v.salePrice ? fmtMoneyExact(v.salePrice) : '—'}
                        </td>
                        <td className="px-3 py-2 text-center font-semibold text-xs"
                            style={{ color: (v.stockQuantity ?? 0) === 0 ? '#EF4444' : '#22C55E' }}>
                          {v.stockQuantity ?? 0}
                        </td>
                        <td className="px-3 py-2 text-right">
                          {canEdit && (
                            <button
                              onClick={() => handleDeleteVariation(v.variationId)}
                              disabled={varDeleting === v.variationId}
                              className="w-6 h-6 flex items-center justify-center rounded"
                              style={{ color: '#EF4444', opacity: varDeleting === v.variationId ? 0.5 : 1 }}
                              title="Xóa biến thể">
                              <span className="icon" style={{ fontSize: 15 }}>
                                {varDeleting === v.variationId ? 'hourglass_empty' : 'delete'}
                              </span>
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Form thêm biến thể */}
            {canEdit && (
              showVarForm ? (
                <div className="rounded-xl p-4 space-y-3" style={{ border: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
                  <p className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>Thêm biến thể mới</p>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      ['SKU *', 'sku', 'text'],
                      ['Màu sắc', 'color', 'text'],
                      ['Kích cỡ (Size)', 'size', 'text'],
                      ['Giá bán (₫)', 'salePrice', 'number'],
                      ['Tồn kho ban đầu', 'stockQuantity', 'number'],
                    ].map(([label, field, type]) => (
                      <div key={field} className={field === 'sku' ? 'col-span-2' : ''}>
                        <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>{label}</label>
                        <input
                          type={type} className="linput text-sm"
                          value={varForm[field] ?? ''}
                          onChange={e => setVarForm(f => ({ ...f, [field]: e.target.value }))}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2 pt-1">
                    <button onClick={() => { setShowVarForm(false); setVarErr('') }}
                            className="lbtn lbtn-secondary flex-1 justify-center text-sm">
                      Hủy
                    </button>
                    <button onClick={handleAddVariation} disabled={varSaving}
                            className="lbtn lbtn-primary flex-1 justify-center text-sm">
                      {varSaving ? 'Đang lưu...' : 'Lưu biến thể'}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => { setShowVarForm(true); setVarErr('') }}
                  className="lbtn lbtn-secondary w-full justify-center text-sm">
                  <span className="icon text-sm">add</span>
                  Thêm biến thể (size / màu)
                </button>
              )
            )}
          </div>
        )}

        {/* ── EDIT MODE ── */}
        {mode === 'edit' && editData && (
          <>
            {/* Ảnh sản phẩm */}
            <div>
              <label className="block text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>Hình ảnh sản phẩm</label>
              <div className="flex items-center gap-3">
                <div className="w-16 h-16 rounded-xl border-2 border-dashed flex items-center justify-center overflow-hidden shrink-0"
                     style={{ borderColor: 'var(--border)', background: 'var(--bg-elevated)' }}>
                  {imgPreview
                    ? <img src={imgPreview} alt="preview" className="w-full h-full object-cover" />
                    : <span className="icon" style={{ fontSize: 24, color: 'var(--text-tertiary)' }}>image</span>
                  }
                </div>
                <div>
                  <button type="button" onClick={() => fileRef.current?.click()}
                          className="lbtn lbtn-secondary !h-8 text-xs">
                    <span className="icon text-sm">upload</span>
                    Thay đổi ảnh
                  </button>
                  <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>PNG/JPG/WEBP · Tối đa 5MB</p>
                </div>
              </div>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                     onChange={handleImgSelect} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[
                ['SKU', 'sku', 'text'],
                ['Tên sản phẩm', 'productName', 'text'],
                ['Giá bán (₫)', 'basePrice', 'number'],
                ['Tồn kho', 'stockQuantity', 'number'],
              ].map(([label, field, type]) => (
                <div key={field}>
                  <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>{label}</label>
                  <input type={type} className="linput text-sm" value={editData[field] ?? ''}
                         onChange={set(field)} />
                </div>
              ))}
              <div>
                <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>Danh mục</label>
                <select className="linput text-sm" value={editData.categoryId ?? ''} onChange={set('categoryId')}>
                  <option value="">-- Chọn danh mục --</option>
                  {catOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            </div>
            {/* Giá vốn: hiển thị read-only, lấy từ NCC */}
            <div>
              <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>Giá vốn (₫)</label>
              <div className="linput text-sm flex items-center justify-between"
                   style={{ background: 'var(--bg-elevated)', cursor: 'not-allowed', opacity: 0.7 }}>
                <span>{fmtMoneyExact(editData.costPrice || 0)}</span>
                <span className="text-xs ml-2" style={{ color: 'var(--text-tertiary)' }}>
                  {suppliers.length > 0 ? 'Từ NCC (cập nhật tại trang NCC)' : 'Chỉ đọc'}
                </span>
              </div>
            </div>

            <div>
              <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>Mô tả</label>
              <textarea className="linput text-sm" rows={2} value={editData.description ?? ''}
                        onChange={set('description')} />
            </div>
          </>
        )}
      </div>
    </DetailDrawer>
    </>
  )
}

// Modal tạo sản phẩm mới
function ProductFormModal({ initial, mode, onClose, onSaved }) {
  const [form,       setForm]       = useState(initial ?? EMPTY_FORM)
  const [categories, setCategories] = useState([])
  const [saving,     setSaving]     = useState(false)
  const [err,        setErr]        = useState('')
  const [imgFile,    setImgFile]    = useState(null)
  const [imgPreview, setImgPreview] = useState(initial?.imageUrl ?? null)
  const fileRef = useRef(null)
  const isEdit  = mode === 'edit'

  // Load danh mục từ API
  useEffect(() => {
    getCategories()
      .then(data => setCategories(data))
      .catch(() => setCategories([]))
  }, [])

  const set = (field) => (e) => setForm(f => ({ ...f, [field]: e.target.value }))

  const handleImgSelect = (e) => {
    const file = e.target.files[0]
    if (!file) return
    setImgFile(file)
    setImgPreview(URL.createObjectURL(file))
  }

  const handleSave = async () => {
    if (!form.sku || !form.productName || !form.basePrice || !form.categoryId) {
      setErr('Vui lòng nhập đầy đủ SKU, Tên sản phẩm, Giá bán và Danh mục')
      return
    }
    setSaving(true); setErr('')
    try {
      const dto = {
        sku:           form.sku,
        productName:   form.productName,
        description:   form.description || null,
        basePrice:     Number(form.basePrice),
        costPrice:     form.costPrice ? Number(form.costPrice) : null,
        stockQuantity: Number(form.stockQuantity) || 0,
        categoryId:    Number(form.categoryId),
      }
      let savedId = form.productId
      if (isEdit) {
        await updateProduct(savedId, dto)
      } else {
        const res = await createProduct(dto)
        savedId = res.productId
      }
      // Upload ảnh nếu có chọn
      if (imgFile && savedId) {
        await uploadProductImage(savedId, imgFile)
      }
      onSaved()
    } catch (e) {
      setErr(e.response?.data?.message ?? (isEdit ? 'Lỗi cập nhật' : 'Lỗi tạo sản phẩm'))
    } finally {
      setSaving(false)
    }
  }

  const inp = (label, field, type = 'text', required = false) => (
    <div key={field}>
      <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>
        {label}{required && <span style={{ color: '#EF4444' }}> *</span>}
      </label>
      <input type={type} className="linput text-sm" value={form[field] ?? ''}
             onChange={set(field)} />
    </div>
  )

  // Nhóm danh mục theo cấp để hiển thị đẹp hơn trong dropdown
  const catOptions = categories.map(c => ({
    value: c.categoryId,
    label: c.level > 1 ? `  └ ${c.categoryName}` : c.categoryName,
  }))

  const drawerFooter = (
    <>
      <button onClick={onClose} className="lbtn lbtn-secondary flex-1 justify-center">Hủy</button>
      <button onClick={handleSave} disabled={saving} className="lbtn lbtn-primary flex-1 justify-center">
        {saving ? 'Đang lưu...' : 'Lưu sản phẩm'}
      </button>
    </>
  )

  return (
    <DetailDrawer
      open={true}
      onClose={onClose}
      title={isEdit ? 'Chỉnh sửa sản phẩm' : 'Thêm sản phẩm mới'}
      width={560}
      footer={drawerFooter}
    >
      <div className="p-5 space-y-4">
        {err && <p className="text-xs rounded-lg px-3 py-2" style={{ background: 'rgba(239,68,68,0.1)', color: '#EF4444' }}>{err}</p>}

        {/* Hình ảnh sản phẩm */}
        <div>
          <label className="block text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>Hình ảnh sản phẩm</label>
          <div className="flex items-center gap-3">
            <div className="w-16 h-16 rounded-xl border-2 border-dashed flex items-center justify-center overflow-hidden shrink-0"
                 style={{ borderColor: 'var(--border)', background: 'var(--bg-elevated)' }}>
              {imgPreview
                ? <img src={imgPreview} alt="preview" className="w-full h-full object-cover" />
                : <span className="icon" style={{ fontSize: 24, color: 'var(--text-tertiary)' }}>image</span>
              }
            </div>
            <div>
              <button type="button" onClick={() => fileRef.current?.click()}
                      className="lbtn lbtn-secondary !h-8 text-xs">
                <span className="icon text-sm">upload</span>
                Chọn ảnh
              </button>
              <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>PNG/JPG/WEBP · Tối đa 5MB</p>
            </div>
          </div>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                 onChange={handleImgSelect} />
        </div>

        <div className="grid grid-cols-2 gap-3">
          {inp('SKU', 'sku', 'text', true)}
          {inp('Tên sản phẩm', 'productName', 'text', true)}
          {inp('Giá bán (₫)', 'basePrice', 'number', true)}
          {inp('Tồn kho', 'stockQuantity', 'number')}

          {/* Dropdown danh mục */}
          <div>
            <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>
              Danh mục<span style={{ color: '#EF4444' }}> *</span>
            </label>
            <select className="linput text-sm"
                    value={form.categoryId ?? ''}
                    onChange={set('categoryId')}>
              <option value="">-- Chọn danh mục --</option>
              {catOptions.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>Mô tả</label>
          <textarea className="linput text-sm" rows={2} value={form.description ?? ''}
                    onChange={set('description')} />
        </div>
      </div>
    </DetailDrawer>
  )
}

export default function ProductsPage() {
  const { t } = useTranslation()
  const { user } = useAuth()
  const [data,              setData]              = useState(null)
  const [loading,           setLoading]           = useState(true)
  const [search,            setSearch]            = useState('')
  const [categoryId,        setCategoryId]        = useState('')
  const [filterCats,        setFilterCats]        = useState([])
  const [page,              setPage]              = useState(1)
  const [selected,          setSelected]          = useState(null)
  const [view,              setView]              = useState('table')
  const [formMode,          setFormMode]          = useState(null)
  const [toast,             setToast]             = useState('')
  const [checkedIds,        setCheckedIds]        = useState(new Set())
  const [confirmDlg, setConfirmDlg] = useState(null)
  const [catalogOnly,       setCatalogOnly]       = useState(true) // mặc định: chỉ catalog chuẩn
  const [activeStatus,      setActiveStatus]      = useState('all') // 'all' | 'active' | 'inactive'

  const debouncedSearch = useDebounce(search, 350)

  // Sắp xếp danh mục theo cây: cha → con ngay bên dưới; loại trùng theo (parentId, tên)
  const sortedCats = useMemo(() => {
    const seen = new Map()
    filterCats.forEach(c => {
      const key = `${c.parentId ?? 'null'}-${c.categoryName.toLowerCase().trim()}`
      if (!seen.has(key) || seen.get(key).categoryId > c.categoryId)
        seen.set(key, c)
    })
    const unique = [...seen.values()]
    const parents = unique
      .filter(c => !c.parentId)
      .sort((a, b) => a.categoryName.localeCompare(b.categoryName, 'vi'))
    const childrenMap = {}
    unique.filter(c => c.parentId).forEach(c => {
      if (!childrenMap[c.parentId]) childrenMap[c.parentId] = []
      childrenMap[c.parentId].push(c)
    })
    const result = []
    for (const parent of parents) {
      result.push(parent)
      ;(childrenMap[parent.categoryId] ?? [])
        .sort((a, b) => a.categoryName.localeCompare(b.categoryName, 'vi'))
        .forEach(c => result.push(c))
    }
    return result
  }, [filterCats])

  const canEdit = ['Owner', 'Manager', 'DataIT'].includes(user?.role)
  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(''), 3000) }

  // Load danh mục một lần để dùng cho filter dropdown
  useEffect(() => {
    getCategories().then(setFilterCats).catch(() => {})
  }, [])

  const fetchData = useCallback(async () => {
    setLoading(true)
    try {
      setData(await getOltpProducts({
        search:        debouncedSearch || undefined,
        categoryId:    categoryId      ? Number(categoryId) : undefined,
        page,
        limit:         PAGE_SIZE,
        hasVariations: catalogOnly ? true : null,
        isActive:      activeStatus === 'active' ? true : activeStatus === 'inactive' ? false : null,
      }))
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [debouncedSearch, categoryId, page, catalogOnly, activeStatus])

  const openCreate = () => setFormMode('create')

  const handleDelete = (p, e) => {
    e.stopPropagation()
    setConfirmDlg({ title: 'Xóa sản phẩm', msg: `Xóa sản phẩm "${p.product_name ?? p.name}"?`, action: async () => {
      try {
        await deleteProduct(p.product_id ?? p.productId)
        showToast('Đã xóa sản phẩm')
        fetchData()
      } catch (err) {
        showToast(err.response?.data?.message ?? 'Lỗi xóa sản phẩm')
      }
    }})
  }

  const handleToggleActive = async (p, e) => {
    e.stopPropagation()
    const newActive = !(p.isActive ?? true)
    // Optimistic update
    setData(prev => prev ? {
      ...prev,
      items: prev.items.map(item =>
        (item.product_id ?? item.productId) === (p.product_id ?? p.productId)
          ? { ...item, isActive: newActive }
          : item
      )
    } : prev)
    try {
      await updateProduct(p.product_id ?? p.productId, { isActive: newActive })
      showToast(newActive ? 'Sản phẩm đang bán' : 'Sản phẩm ngừng bán')
    } catch (err) {
      // Rollback
      setData(prev => prev ? {
        ...prev,
        items: prev.items.map(item =>
          (item.product_id ?? item.productId) === (p.product_id ?? p.productId)
            ? { ...item, isActive: p.isActive ?? true }
            : item
        )
      } : prev)
      showToast(err.response?.data?.message ?? 'Lỗi thay đổi trạng thái')
    }
  }

  // ── Bulk select ───────────────────────────────────────────────────────────────
  const getPid = (p) => p.product_id ?? p.id
  const toggleCheck = (id, e) => {
    e.stopPropagation()
    setCheckedIds(prev => { const s = new Set(prev); s.has(id) ? s.delete(id) : s.add(id); return s })
  }
  const toggleAll = (items) => {
    const allChecked = items.length > 0 && items.every(p => checkedIds.has(getPid(p)))
    setCheckedIds(allChecked ? new Set() : new Set(items.map(getPid)))
  }
  const handleBulkDelete = (items) => {
    setConfirmDlg({ title: 'Xóa hàng loạt', msg: `Xóa ${checkedIds.size} sản phẩm đã chọn?`, action: async () => {
      try {
        await Promise.all([...checkedIds].map(id => deleteProduct(id)))
        showToast(`Đã xóa ${checkedIds.size} sản phẩm`)
        setCheckedIds(new Set())
        fetchData()
      } catch { showToast('Có lỗi khi xóa hàng loạt') }
    }})
  }

  // ── Export CSV ────────────────────────────────────────────────────────────────
  const handleExport = (items) => {
    exportToCsv(`san_pham_${new Date().toISOString().slice(0, 10)}.csv`, items.map(p => ({
      'Tên sản phẩm':    p.product_name ?? p.name ?? '',
      'SKU (sản phẩm)':  p.sku ?? '',
      'Danh mục':        p.category ?? '',
      'Giá bán (₫)':     p.unit_price ?? p.price ?? 0,
      'Giá vốn (₫)':     p.cost_price ?? p.costPrice ?? 0,
      'Tồn kho':         p.stock ?? 0,
      'Trạng thái':      (p.isActive ?? true) ? 'Đang bán' : 'Ngừng bán',
      'Ghi chú biến thể': 'Xem tab Biến thể trong chi tiết sản phẩm (SKU_biến_thể | Màu | Size | Giá bán | Tồn kho)',
    })))
  }

  useEffect(() => { fetchData() }, [fetchData])

  const items      = data?.items ?? []
  const totalPages = data?.totalPages ?? 1

  return (
    <>
    <ConfirmDialog
      open={!!confirmDlg}
      title={confirmDlg?.title ?? 'Xác nhận xóa'}
      message={confirmDlg?.msg}
      icon="delete_forever"
      danger
      onClose={() => setConfirmDlg(null)}
      onConfirm={() => { const a = confirmDlg?.action; setConfirmDlg(null); a?.() }}
    />
    <div className="space-y-4">

      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 rounded-xl text-sm font-medium shadow-lg"
             style={{ background: 'var(--primary-500)', color: 'white' }}>
          {toast}
        </div>
      )}

      {formMode === 'create' && (
        <ProductFormModal
          mode="create"
          initial={null}
          onClose={() => setFormMode(null)}
          onSaved={() => { setFormMode(null); showToast('Đã thêm sản phẩm'); fetchData() }}
        />
      )}

      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{t('products.title')}</h1>
          {data && (
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
              {t('products.totalCount', { count: data.total })}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex p-1 rounded-xl gap-1" style={{ background: 'var(--bg-elevated)' }}>
            {['table', 'grid'].map(v => (
              <button
                key={v}
                onClick={() => setView(v)}
                className="w-8 h-8 flex items-center justify-center rounded-lg transition-all"
                style={{
                  background: view === v ? 'var(--bg-surface)' : 'transparent',
                  color: view === v ? 'var(--primary-500)' : 'var(--text-tertiary)',
                  boxShadow: view === v ? 'var(--shadow-sm)' : 'none',
                }}
              >
                <span className="icon text-base">{v === 'table' ? 'table_rows' : 'grid_view'}</span>
              </button>
            ))}
          </div>
          <button className="lbtn lbtn-secondary !h-9" onClick={() => handleExport(items)}
                  title="Xuất CSV trang hiện tại">
            <span className="icon text-base">download</span>
            <span className="hidden sm:inline">Xuất CSV</span>
          </button>
          {canEdit && (
            <button className="lbtn lbtn-primary !h-9" onClick={openCreate}>
              <span className="icon text-base">add</span>
              {t('products.addProduct')}
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <span className="icon absolute left-3 top-1/2 -translate-y-1/2 text-base"
                style={{ color: 'var(--text-tertiary)' }}>search</span>
          <input type="text" className="linput !pl-9 text-sm"
                 placeholder={t('products.searchPlaceholder')}
                 value={search} onChange={e => { setSearch(e.target.value); setPage(1) }} />
        </div>
        <select className="linput text-sm" style={{ width: 200 }}
                value={categoryId} onChange={e => { setCategoryId(e.target.value); setPage(1) }}>
          <option value="">{t('products.filterCategory')}</option>
          {sortedCats.map(c => (
            <option key={c.categoryId} value={c.categoryId}>
              {c.parentId ? `  └ ${c.categoryName}` : c.categoryName}
            </option>
          ))}
        </select>
        {/* Filter trạng thái */}
        <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
          {[
            { value: 'all',      label: 'Tất cả' },
            { value: 'active',   label: 'Đang bán' },
            { value: 'inactive', label: 'Ngừng bán' },
          ].map(s => (
            <button key={s.value} onClick={() => { setActiveStatus(s.value); setPage(1) }}
              className="px-3 py-1.5 text-xs font-medium transition-all"
              style={activeStatus === s.value
                ? { background: 'var(--primary-500)', color: '#fff' }
                : { background: 'transparent', color: 'var(--text-secondary)' }}>
              {s.label}
            </button>
          ))}
        </div>

        <button onClick={() => { setSearch(''); setCategoryId(''); setActiveStatus('all'); setPage(1) }}
                className="lbtn lbtn-secondary !h-9">
          <span className="icon text-base">refresh</span>
        </button>

        {/* Toggle catalog / tất cả */}
        <div className="flex items-center gap-1 px-3 rounded-xl text-xs font-medium h-9 border transition-colors"
             style={{
               background: catalogOnly ? 'rgba(99,102,241,0.08)' : 'var(--bg-elevated)',
               borderColor: catalogOnly ? 'rgba(99,102,241,0.4)' : 'var(--border)',
               color: catalogOnly ? '#6366F1' : 'var(--text-secondary)',
               cursor: 'pointer',
             }}
             onClick={() => { setCatalogOnly(v => !v); setPage(1) }}>
          <span className="icon" style={{ fontSize: 14 }}>
            {catalogOnly ? 'style' : 'apps'}
          </span>
          {catalogOnly ? 'Catalog (có biến thể)' : 'Tất cả sản phẩm'}
        </div>
      </div>

      {/* Bulk action bar */}
      {checkedIds.size > 0 && (
        <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm"
             style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.25)' }}>
          <span className="font-medium" style={{ color: 'var(--primary-600)' }}>
            Đã chọn {checkedIds.size} sản phẩm
          </span>
          <div className="flex gap-2 ml-auto">
            {canEdit && (
              <button onClick={() => handleBulkDelete(items)}
                      className="lbtn !h-8 !px-3 text-xs font-medium"
                      style={{ background: 'rgba(239,68,68,0.1)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.3)' }}>
                <span className="icon text-sm">delete</span>
                Xóa {checkedIds.size} mục
              </button>
            )}
            <button onClick={() => setCheckedIds(new Set())}
                    className="lbtn lbtn-secondary !h-8 !px-3 text-xs">
              Bỏ chọn
            </button>
          </div>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="lcard p-16 flex items-center justify-center">
          <span className="w-7 h-7 border-2 rounded-full"
                style={{ borderColor: 'var(--border-strong)', borderTopColor: 'var(--primary-500)', animation: 'spin 0.8s linear infinite' }} />
        </div>
      ) : items.length === 0 ? (
        <div className="lcard p-16 flex flex-col items-center gap-3" style={{ color: 'var(--text-tertiary)' }}>
          <span className="icon" style={{ fontSize: 40, opacity: 0.3 }}>inventory_2</span>
          <p className="text-sm">{t('common.noData')}</p>
        </div>
      ) : view === 'grid' ? (
        /* Grid view */
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
            {items.map((p, i) => (
              <div
                key={p.product_id ?? p.id ?? i}
                className="lcard p-4 cursor-pointer transition-all"
                onClick={() => setSelected(p)}
                onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                onMouseLeave={e => e.currentTarget.style.transform = ''}
              >
                <div className="w-full rounded-xl overflow-hidden mb-3 flex items-center justify-center"
                     style={{ aspectRatio: '1', background: 'var(--bg-elevated)', maxHeight: 120 }}>
                  {p.imageUrl
                    ? <img src={p.imageUrl} alt={p.product_name ?? p.name} className="w-full h-full object-cover" />
                    : <span className="icon" style={{ fontSize: 32, color: 'var(--text-tertiary)', opacity: 0.4 }}>inventory_2</span>
                  }
                </div>
                <div className="font-medium text-sm truncate mb-1" style={{ color: 'var(--text-primary)' }}>
                  {p.product_name ?? p.name}
                </div>
                <div className="text-xs mb-2 truncate" style={{ color: 'var(--text-secondary)' }}>{p.category}</div>
                <div className="font-mono text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                  {fmtMoneyExact(p.unit_price ?? p.price ?? 0)}
                </div>
                <div className="mt-2"><StockBadge p={p} t={t} /></div>
              </div>
            ))}
          </div>
          {/* Pagination cho grid view */}
          {totalPages > 1 && (
            <div className="lcard flex items-center justify-center gap-2 px-5 py-3">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                      className="lbtn lbtn-secondary !h-8 !px-3 disabled:opacity-40">
                <span className="icon text-base">chevron_left</span>
              </button>
              <span className="text-xs px-2" style={{ color: 'var(--text-secondary)' }}>
                {t('common.pageInfo', { page, total: totalPages })}
              </span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                      className="lbtn lbtn-secondary !h-8 !px-3 disabled:opacity-40">
                <span className="icon text-base">chevron_right</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        /* Table view */
        <div className="lcard overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-elevated)' }}>
                  <th className="px-4 py-3 w-10">
                    <input type="checkbox"
                           checked={items.length > 0 && items.every(p => checkedIds.has(getPid(p)))}
                           onChange={() => toggleAll(items)}
                           onClick={e => e.stopPropagation()}
                           className="w-4 h-4 cursor-pointer" />
                  </th>
                  {['#', t('products.name'), 'SKU', t('products.category'), t('products.price'),
                    'Tồn kho', t('common.status'), 'Bán', ''].map(h => (
                    <th key={h} className="text-left px-4 py-3 text-sm font-semibold tracking-wide"
                        style={{ color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((p, i) => (
                  <tr key={p.product_id ?? p.id ?? i}
                      className="transition-colors cursor-pointer"
                      style={{ borderBottom: '1px solid var(--border)', background: checkedIds.has(getPid(p)) ? 'rgba(99,102,241,0.04)' : undefined }}
                      onClick={() => setSelected(p)}
                      onMouseEnter={e => { if (!checkedIds.has(getPid(p))) e.currentTarget.style.background = 'var(--bg-elevated)' }}
                      onMouseLeave={e => { e.currentTarget.style.background = checkedIds.has(getPid(p)) ? 'rgba(99,102,241,0.04)' : 'transparent' }}>
                    <td className="px-4 py-3 w-10" onClick={e => toggleCheck(getPid(p), e)}>
                      <input type="checkbox" checked={checkedIds.has(getPid(p))} onChange={() => {}}
                             className="w-4 h-4 cursor-pointer" />
                    </td>
                    <td className="px-4 py-3 text-sm tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                      {(page - 1) * PAGE_SIZE + i + 1}
                    </td>
                    <td className="px-4 py-3 font-medium max-w-[220px]" style={{ color: 'var(--text-primary)' }}>
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-lg overflow-hidden shrink-0 flex items-center justify-center"
                             style={{ background: 'var(--bg-elevated)' }}>
                          {p.imageUrl
                            ? <img src={p.imageUrl} alt="" className="w-full h-full object-cover" />
                            : <span className="icon" style={{ fontSize: 16, color: 'var(--text-tertiary)' }}>inventory_2</span>
                          }
                        </div>
                        <div className="min-w-0">
                          <div className="truncate">{p.product_name ?? p.name}</div>
                          {p.variationCount > 0 && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded-full mt-0.5"
                                  style={{ background: 'rgba(99,102,241,0.1)', color: '#6366F1', border: '1px solid rgba(99,102,241,0.2)' }}>
                              <span className="icon" style={{ fontSize: 10 }}>style</span>
                              {p.variationCount} biến thể
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono text-sm" style={{ color: 'var(--text-secondary)' }}>{p.sku}</td>
                    <td className="px-4 py-3 text-sm" style={{ color: 'var(--text-secondary)' }}>{p.category}</td>
                    <td className="px-4 py-3 font-mono text-sm text-right" style={{ color: 'var(--text-primary)' }}>
                      <div className="flex items-center justify-end gap-1">
                        {fmtMoneyExact(p.unit_price ?? p.price ?? 0)}
                        {!(p.cost_price ?? p.costPrice) && (
                          <span title="Thiếu giá vốn — lợi nhuận chưa chính xác"
                            className="icon" style={{ fontSize: 13, color: '#F59E0B' }}>
                            warning
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums" style={{ color: 'var(--text-secondary)' }}>
                      {(p.stock ?? 0).toLocaleString()}
                    </td>
                    <td className="px-4 py-3"><StockBadge p={p} t={t} /></td>
                    {/* Toggle isActive */}
                    <td className="px-4 py-3">
                      <button
                        disabled={!canEdit}
                        onClick={e => handleToggleActive(p, e)}
                        title={(p.isActive ?? true) ? 'Đang bán — click để ngừng bán' : 'Ngừng bán — click để bán lại'}
                        className={`relative w-10 h-5 rounded-full transition-colors ${(p.isActive ?? true) ? 'bg-green-500' : 'bg-gray-300'}`}
                        style={{ opacity: !canEdit ? 0.5 : 1 }}
                      >
                        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${(p.isActive ?? true) ? 'left-5' : 'left-0.5'}`} />
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={e => { e.stopPropagation(); setSelected(p) }}
                                className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
                                style={{ color: 'var(--primary-500)' }}
                                onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-elevated)'}
                                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                          <span className="icon text-base">visibility</span>
                        </button>
                        {canEdit && (
                          <button onClick={e => handleDelete(p, e)}
                                  className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors"
                                  title="Xóa sản phẩm"
                                  style={{ color: '#EF4444' }}
                                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.08)'}
                                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                            <span className="icon text-base">delete</span>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2 px-5 py-3"
                 style={{ borderTop: '1px solid var(--border)' }}>
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
                      className="lbtn lbtn-secondary !h-8 !px-3 disabled:opacity-40">
                <span className="icon text-base">chevron_left</span>
              </button>
              <span className="text-xs px-2" style={{ color: 'var(--text-secondary)' }}>
                {t('common.pageInfo', { page, total: totalPages })}
              </span>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
                      className="lbtn lbtn-secondary !h-8 !px-3 disabled:opacity-40">
                <span className="icon text-base">chevron_right</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Detail + Edit modal */}
      {selected && (
        <ProductDetailModal
          product={selected}
          canEdit={canEdit}
          onClose={() => setSelected(null)}
          onSaved={() => { setSelected(null); showToast('Đã cập nhật sản phẩm'); fetchData() }}
        />
      )}
    </div>
    </>
  )
}
