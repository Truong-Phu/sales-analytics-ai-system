import { useState, useEffect, useRef } from 'react'
import { useTranslation } from 'react-i18next'
import { useSearchParams } from 'react-router-dom'
import axios from '../../api/axios'
import MockToast from '../../components/ui/MockToast'
import AiEmptyState from '../../components/ui/AiEmptyState'
import DetailDrawer from '../../components/ui/DetailDrawer'
import { getCampaignPlan } from '../../api/aiApi'
import { fmtMoneyExact } from '../../utils/format'

// ── Hiển thị card gợi ý từ URL params (basket / rfm / churn) ─────────────────
function ActionSuggestionBanner({ params, onDismiss, onExecute }) {
  const { t } = useTranslation()
  const action = params.get('action')
  if (!action) return null

  if (action === 'bundle') {
    const products = (params.get('products') ?? '').split('|').filter(Boolean)
    const lift     = params.get('lift')
    const conf     = params.get('conf')
    return (
      <div className="rounded-xl p-4 flex items-start gap-3 relative"
        style={{ background: 'rgba(99,102,241,0.08)', border: '1px solid rgba(99,102,241,0.30)' }}>
        <span className="icon text-2xl shrink-0 mt-0.5" style={{ color: 'var(--primary-500)' }}>local_offer</span>
        <div className="flex-1">
          <div className="font-semibold text-sm" style={{ color: 'var(--primary-700)' }}>
            {t('campaign.bundleBannerTitle')}
          </div>
          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
            {t('campaign.bundleBoughtWith')}: {products.map((p, i) => (
              <span key={i}>
                {i > 0 && <span className="mx-1" style={{ color: 'var(--text-tertiary)' }}>+</span>}
                <strong style={{ color: 'var(--primary-600)' }}>{p}</strong>
              </span>
            ))}{lift && <span className="ml-2 text-green-600 font-medium">Lift {lift}x</span>}{conf && <span className="ml-1" style={{ color: 'var(--text-tertiary)' }}>(conf {conf}%)</span>}
          </p>
          <p className="text-xs mt-1.5 font-medium" style={{ color: 'var(--text-primary)' }}>
            {t('campaign.bundleProposal')}
          </p>
          <button onClick={() => onExecute({ action: 'bundle', products, lift, conf })}
            className="lbtn lbtn-primary text-xs mt-2.5 !h-8 !px-3">
            Tạo khuyến mãi combo ngay
          </button>
        </div>
        <button onClick={onDismiss} className="icon shrink-0 text-sm transition-colors"
          style={{ color: 'var(--text-tertiary)', fontSize: 18 }}
          onMouseEnter={e => e.currentTarget.style.color = '#EF4444'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--text-tertiary)'}>
          close
        </button>
      </div>
    )
  }

  if (action === 'winback') {
    const segment = params.get('segment') ?? ''
    const count   = params.get('count') ?? '?'
    const segColor = segment === 'At Risk' ? '#EF4444' : segment === 'Lost' ? '#6B7280' : '#3B82F6'
    return (
      <div className="rounded-xl p-4 flex items-start gap-3 relative"
        style={{ background: `${segColor}10`, border: `1px solid ${segColor}40` }}>
        <span className="icon text-2xl shrink-0 mt-0.5" style={{ color: segColor }}>person_search</span>
        <div className="flex-1">
          <div className="font-semibold text-sm" style={{ color: segColor }}>
            {t('campaign.winbackBannerTitle', { segment })}
          </div>
          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
            <strong>{count}</strong> khách hàng phân khúc <strong>{segment}</strong> cần chiến dịch kích hoạt lại.
          </p>
          <p className="text-xs mt-1.5 font-medium" style={{ color: 'var(--text-primary)' }}>
            Đề xuất: Gửi voucher giảm giá 20% + email cá nhân hóa cho {count} khách này — chạy vào thời điểm cao điểm bên dưới.
          </p>
          <button onClick={() => onExecute({ action: 'winback', segment, count })}
            className="lbtn lbtn-primary text-xs mt-2.5 !h-8 !px-3"
            style={{ background: segColor, borderColor: segColor }}>
            Kích hoạt chiến dịch ngay
          </button>
        </div>
        <button onClick={onDismiss} className="icon shrink-0 transition-colors"
          style={{ color: 'var(--text-tertiary)', fontSize: 18 }}
          onMouseEnter={e => e.currentTarget.style.color = '#EF4444'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--text-tertiary)'}>
          close
        </button>
      </div>
    )
  }

  if (action === 'retain') {
    const customer = params.get('customer') ?? ''
    const prob     = params.get('prob') ?? '?'
    const risk     = params.get('risk') ?? 'HIGH'
    const channel  = params.get('channel') ?? ''
    const riskColor = risk === 'HIGH' ? '#EF4444' : '#F59E0B'
    return (
      <div className="rounded-xl p-4 flex items-start gap-3 relative"
        style={{ background: `${riskColor}0D`, border: `1px solid ${riskColor}40` }}>
        <span className="icon text-2xl shrink-0 mt-0.5" style={{ color: riskColor }}>favorite</span>
        <div className="flex-1">
          <div className="font-semibold text-sm" style={{ color: riskColor }}>
            {t('campaign.retainBannerTitle', { risk })}
          </div>
          <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
            <strong style={{ color: 'var(--text-primary)' }}>{customer}</strong> có xác suất rời bỏ <strong style={{ color: riskColor }}>{prob}%</strong>
            {channel && <span className="ml-1 text-xs" style={{ color: 'var(--text-tertiary)' }}>qua {channel}</span>}
          </p>
          <p className="text-xs mt-1.5 font-medium" style={{ color: 'var(--text-primary)' }}>
            Đề xuất: Gửi ngay voucher cá nhân hóa hoặc gọi điện chăm sóc — chọn thời điểm tốt nhất bên dưới để liên hệ.
          </p>
          <button onClick={() => onExecute({ action: 'retain', customer, prob, risk, channel })}
            className="lbtn lbtn-primary text-xs mt-2.5 !h-8 !px-3"
            style={{ background: riskColor, borderColor: riskColor }}>
            Thực hiện giữ chân ngay
          </button>
        </div>
        <button onClick={onDismiss} className="icon shrink-0 transition-colors"
          style={{ color: 'var(--text-tertiary)', fontSize: 18 }}
          onMouseEnter={e => e.currentTarget.style.color = '#EF4444'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--text-tertiary)'}>
          close
        </button>
      </div>
    )
  }

  return null
}

const fallbackVouchers = [
  { id: 'v-10', code: 'GIUCHAN10', type: 'PERCENT', value: 10 },
  { id: 'v-15', code: 'GIUCHAN15', type: 'PERCENT', value: 15 },
  { id: 'v-20', code: 'GIUCHAN20', type: 'PERCENT', value: 20 },
  { id: 'v-ship', code: 'FREESHIP', type: 'FREESHIP', value: 0 },
]

const getVoucherLabel = (v) => {
  if (v.type === 'PERCENT') {
    return `Giảm ${v.value}% (Mã: ${v.code}${v.minOrderValue ? `, Đơn tối thiểu: ${new Intl.NumberFormat('vi-VN').format(v.minOrderValue)}₫` : ''})`;
  }
  if (v.type === 'FIXED') {
    return `Giảm ${new Intl.NumberFormat('vi-VN').format(v.value)}₫ (Mã: ${v.code}${v.minOrderValue ? `, Đơn tối thiểu: ${new Intl.NumberFormat('vi-VN').format(v.minOrderValue)}₫` : ''})`;
  }
  return `Miễn phí vận chuyển (Mã: ${v.code}${v.minOrderValue ? `, Đơn tối thiểu: ${new Intl.NumberFormat('vi-VN').format(v.minOrderValue)}₫` : ''})`;
}

function ActionExecutionDrawer({ config, onClose, onSuccess }) {
  const [sending, setSending] = useState(false)
  const [method, setMethod] = useState('SMS')
  const [vouchers, setVouchers] = useState([])
  const [selectedVoucher, setSelectedVoucher] = useState(null)
  const [message, setMessage] = useState('')

  useEffect(() => {
    axios.get('/api/pos/vouchers')
      .then(r => {
        const active = (r.data ?? []).filter(v => v.isActive)
        if (active.length > 0) {
          setVouchers(active)
          setSelectedVoucher(active[0])
        } else {
          setVouchers(fallbackVouchers)
          setSelectedVoucher(fallbackVouchers[0])
        }
      })
      .catch(() => {
        setVouchers(fallbackVouchers)
        setSelectedVoucher(fallbackVouchers[0])
      })
  }, [])

  useEffect(() => {
    if (!selectedVoucher) return
    const discountText = selectedVoucher.type === 'PERCENT' 
      ? `giảm giá ${selectedVoucher.value}% [${selectedVoucher.code}]`
      : selectedVoucher.type === 'FIXED'
        ? `giảm giá ${new Intl.NumberFormat('vi-VN').format(selectedVoucher.value)}₫ [${selectedVoucher.code}]`
        : `miễn phí vận chuyển [${selectedVoucher.code}]`

    if (config.action === 'retain') {
      const channelName = config.channel === 'SHOPEE' ? 'Shopee' : config.channel === 'TIKTOK_SHOP' ? 'TikTok Shop' : config.channel === 'LAZADA' ? 'Lazada' : config.channel === 'FACEBOOK' ? 'Facebook' : config.channel === 'WEBSITE' ? 'Website' : 'cửa hàng';
      setMessage(`Chào anh/chị ${config.customer}, ${channelName} gửi tặng anh/chị mã ${discountText} cho đơn hàng tiếp theo. Áp dụng đến hết tháng này. Cảm ơn anh/chị đã đồng hành cùng cửa hàng!`)
    } else if (config.action === 'winback') {
      setMessage(`Chào anh/chị, để tri ân khách hàng cũ, cửa hàng gửi tặng anh/chị mã voucher ${discountText} áp dụng cho mọi đơn hàng. Chúc anh/chị có trải nghiệm mua sắm tuyệt vời!`)
    } else if (config.action === 'bundle') {
      setMessage(`Chương trình khuyến mãi Mua kèm giá tốt: Giảm ngay ${selectedVoucher.type === 'PERCENT' ? `${selectedVoucher.value}%` : selectedVoucher.type === 'FIXED' ? `${new Intl.NumberFormat('vi-VN').format(selectedVoucher.value)}₫` : 'phí vận chuyển'} [${selectedVoucher.code}] khi mua combo bộ đôi sản phẩm: ${config.products?.join(' và ')}.`)
    }
  }, [config, selectedVoucher])

  const handleSend = () => {
    setSending(true)
    setTimeout(() => {
      setSending(false)
      
      try {
        const list = JSON.parse(localStorage.getItem('executed_campaigns') ?? '[]')
        const discountVal = selectedVoucher 
          ? `[${selectedVoucher.code}] - ${selectedVoucher.type === 'PERCENT' ? `${selectedVoucher.value}%` : selectedVoucher.type === 'FIXED' ? `${new Intl.NumberFormat('vi-VN').format(selectedVoucher.value)}₫` : 'Freeship'}` 
          : '20%'
          
        list.unshift({
          id: Date.now(),
          timestamp: new Date().toISOString(),
          action: config.action,
          target: config.action === 'retain' ? config.customer : config.action === 'winback' ? `${config.segment} (${config.count} KH)` : config.products?.join(' + '),
          method: config.action === 'bundle' ? 'Combo' : method,
          discount: discountVal,
          message: message,
          status: 'SUCCESS'
        })
        localStorage.setItem('executed_campaigns', JSON.stringify(list))
      } catch (e) {
        console.error(e)
      }

      onSuccess(`Đã kích hoạt thành công chiến dịch ${config.action === 'retain' ? `giữ chân cho khách hàng ${config.customer}` : config.action === 'winback' ? `kích hoạt lại cho phân khúc ${config.segment}` : 'khuyến mãi combo sản phẩm'}!`)
      onClose()
    }, 1500)
  }

  const title = config.action === 'retain' 
    ? 'Thực thi chiến dịch giữ chân' 
    : config.action === 'winback' 
      ? 'Kích hoạt lại khách hàng cũ' 
      : 'Cấu hình khuyến mãi mua kèm'

  const subtitle = config.action === 'retain'
    ? `Khách hàng: ${config.customer} (Rủi ro: ${config.risk})`
    : config.action === 'winback'
      ? `Phân khúc: ${config.segment} (${config.count} khách hàng)`
      : `Mua kèm: ${config.products?.join(' + ')}`

  const drawerFooter = (
    <div className="flex justify-end gap-2 w-full">
      <button onClick={onClose} disabled={sending} className="lbtn lbtn-secondary text-xs !h-9 !px-3">
        Hủy bỏ
      </button>
      <button onClick={handleSend} disabled={sending} className="lbtn lbtn-primary text-xs !h-9 !px-4">
        {sending ? (
          <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
        ) : (
          config.action === 'bundle' ? 'Kích hoạt combo' : 'Gửi ưu đãi ngay'
        )}
      </button>
    </div>
  )

  return (
    <DetailDrawer
      open={true}
      onClose={onClose}
      title={title}
      subtitle={subtitle}
      width={460}
      footer={drawerFooter}
    >
      <div className="p-5 space-y-4 text-xs text-secondary" style={{ color: 'var(--text-secondary)' }}>
        {config.action === 'retain' && (
          <div className="bg-red-50 dark:bg-red-950/20 p-3.5 rounded-xl border border-red-100 dark:border-red-900/30 space-y-1">
            <p>Khách hàng: <strong className="text-foreground" style={{ color: 'var(--text-primary)' }}>{config.customer}</strong></p>
            <p>Xác suất rời bỏ: <strong style={{ color: '#EF4444' }}>{config.prob}% ({config.risk})</strong></p>
            <p>Kênh tiếp cận gợi ý: <strong className="text-foreground" style={{ color: 'var(--text-primary)' }}>{config.channel || 'Tất cả'}</strong></p>
          </div>
        )}
        {config.action === 'winback' && (
          <div className="bg-indigo-50 dark:bg-indigo-950/20 p-3.5 rounded-xl border border-indigo-100 dark:border-indigo-900/30 space-y-1">
            <p>Phân khúc khách hàng: <strong className="text-foreground" style={{ color: 'var(--text-primary)' }}>{config.segment}</strong></p>
            <p>Số lượng tiếp cận: <strong className="text-foreground" style={{ color: 'var(--text-primary)' }}>{config.count} khách hàng</strong></p>
          </div>
        )}
        {config.action === 'bundle' && (
          <div className="bg-green-50 dark:bg-green-950/20 p-3.5 rounded-xl border border-green-100 dark:border-green-900/30 space-y-1.5">
            <p className="font-semibold text-foreground" style={{ color: 'var(--text-primary)' }}>Sản phẩm mua kèm gợi ý:</p>
            <ul className="list-disc list-inside space-y-0.5 text-foreground" style={{ color: 'var(--text-primary)' }}>
              {config.products?.map((p, i) => <li key={i}>{p}</li>)}
            </ul>
            <p className="mt-1">Độ nâng doanh thu dự kiến: <strong style={{ color: '#10B981' }}>{config.lift}x (Conf {config.conf}%)</strong></p>
          </div>
        )}

        {/* Form fields */}
        <div className="space-y-4 pt-2">
          {config.action !== 'bundle' && (
            <div>
              <label className="block font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Phương thức gửi ưu đãi</label>
              <select value={method} onChange={e => setMethod(e.target.value)} className="linput text-xs w-full">
                <option value="SMS">Gửi SMS Brandname tự động (qua SĐT)</option>
                <option value="Email">Gửi Email Marketing cá nhân hóa (qua Gmail)</option>
              </select>
            </div>
          )}
          
          <div>
            <label className="block font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Mức ưu đãi / Voucher</label>
            <select 
              value={selectedVoucher?.id || ''} 
              onChange={e => {
                const found = vouchers.find(v => v.id === e.target.value || String(v.id) === e.target.value)
                if (found) setSelectedVoucher(found)
              }} 
              className="linput text-xs w-full"
            >
              {vouchers.map(v => (
                <option key={v.id} value={v.id}>{getVoucherLabel(v)}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Nội dung thông điệp</label>
            <textarea
              value={message}
              onChange={e => setMessage(e.target.value)}
              className="linput w-full p-2 h-36 text-xs"
              style={{ fontFamily: 'sans-serif', lineHeight: '1.4' }}
            />
          </div>
        </div>
      </div>
    </DetailDrawer>
  )
}

function ExecutedCampaignsHistory({ list, onClear, vouchers = [], dwSales = [], oltpOrders = [] }) {
  if (list.length === 0) return null;

  const ordersMap = {}
  dwSales.forEach(row => {
    let orderId = row.ExternalOrderId ?? row.externalOrderId ?? String(row.SalesKey ?? row.salesKey)
    if (orderId && typeof orderId === 'string' && orderId.includes('#')) {
      orderId = orderId.split('#')[0];
    }
    if (!ordersMap[orderId]) {
      ordersMap[orderId] = {
        orderId,
        date: new Date(row.SaleDate ?? row.saleDate),
        channel: row.ChannelName ?? row.channelName ?? '—',
        products: [],
        revenue: 0,
      }
    }
    ordersMap[orderId].products.push(row.ProductName ?? row.productName ?? '')
    ordersMap[orderId].revenue += Number(row.NetRevenue ?? row.netRevenue ?? 0)
  })
  const allOrders = Object.values(ordersMap)

  const renderEffectiveness = (item) => {
    if (item.action === 'bundle') {
      const targetProducts = item.target.split(' + ').map(p => p.trim().toLowerCase());
      const campaignTime = new Date(item.timestamp);
      const campaignDate = new Date(campaignTime.getFullYear(), campaignTime.getMonth(), campaignTime.getDate());
      
      const match = item.discount?.match(/\[(.*?)\]/);
      const code = match ? match[1]?.toUpperCase() : null;
      
      let matchedOrders = 0;
      let matchedRevenue = 0;
      const matchedChannels = new Set();
      const countedOrderCodes = new Set();

      // 1. Quét đơn hàng live OLTP (để hỗ trợ hiển thị ngay lập tức khi vừa thanh toán tại POS)
      oltpOrders.forEach(order => {
        const orderDt = new Date(order.orderDate ?? order.createdAt);
        const orderDate = new Date(orderDt.getFullYear(), orderDt.getMonth(), orderDt.getDate());
        if (orderDate >= campaignDate) {
          const orderVoucher = order.voucherCode?.toUpperCase();
          if (code && orderVoucher === code) {
            const codeKey = order.orderCode || '';
            const idKey = order.orderId ? String(order.orderId) : '';
            const extKey = order.orderId ? `ORDER_${order.orderId}` : '';
            
            const isAlreadyCounted = (codeKey && countedOrderCodes.has(codeKey)) ||
                                     (idKey && countedOrderCodes.has(idKey)) ||
                                     (extKey && countedOrderCodes.has(extKey));
                                     
            if (!isAlreadyCounted) {
              if (codeKey) countedOrderCodes.add(codeKey);
              if (idKey) countedOrderCodes.add(idKey);
              if (extKey) countedOrderCodes.add(extKey);
              
              matchedOrders++;
              matchedRevenue += Number(order.totalAmount ?? 0);
              matchedChannels.add(order.channelName ?? 'Offline');
            }
          }
        }
      });

      // 2. Quét đơn hàng DW (cho các kênh khác như Shopee, Lazada, hoặc Offline cũ đã đồng bộ)
      allOrders.forEach(order => {
        const orderDate = new Date(order.date.getFullYear(), order.date.getMonth(), order.date.getDate());
        if (orderDate >= campaignDate) {
          const orderProductsLower = order.products.map(p => p.toLowerCase());
          const hasAll = targetProducts.every(tp => 
            orderProductsLower.some(op => op.includes(tp) || tp.includes(op))
          );
          if (hasAll) {
            const key = order.orderId;
            const isAlreadyCounted = countedOrderCodes.has(key) || 
                                     countedOrderCodes.has(key.replace(/^ORDER_/, '')) ||
                                     Array.from(countedOrderCodes).some(ok => `ORDER_${ok}` === key || ok === key);
            if (!isAlreadyCounted) {
              countedOrderCodes.add(key);
              matchedOrders++;
              matchedRevenue += order.revenue;
              if (order.channel && order.channel !== '—') {
                matchedChannels.add(order.channel);
              }
            }
          }
        }
      });

      if (matchedOrders > 0) {
        const channelsStr = Array.from(matchedChannels).join(', ');
        return (
          <div className="flex flex-col gap-0.5">
            <span className="font-semibold text-emerald-600" style={{ color: '#10B981' }}>
              {matchedOrders} đơn hàng ({channelsStr || 'Chưa phân loại'})
            </span>
            <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
              Doanh thu: {new Intl.NumberFormat('vi-VN').format(matchedRevenue)}₫
            </span>
          </div>
        );
      }

      return (
        <span className="font-medium text-indigo-500 animate-pulse" style={{ color: 'var(--primary-500)' }}>
          Đang chạy (0 lượt dùng)
        </span>
      );
    }

    const match = item.discount?.match(/\[(.*?)\]/);
    const code = match ? match[1] : null;
    const voucher = code ? vouchers.find(v => v.code?.toUpperCase() === code.toUpperCase()) : null;

    if (!voucher) {
      return (
        <span style={{ color: 'var(--text-tertiary)', opacity: 0.8 }}>
          Chưa áp dụng (Đang theo dõi)
        </span>
      );
    }

    const isExpired = new Date(voucher.validTo) < new Date();
    const usedCount = voucher.usedCount || 0;

    if (usedCount > 0) {
      return (
        <div className="flex flex-col gap-0.5">
          <span className="font-semibold text-emerald-600" style={{ color: '#10B981' }}>
            {usedCount} đơn hàng thành công
          </span>
          {voucher.minOrderValue > 0 && (
            <span className="text-[10px]" style={{ color: 'var(--text-tertiary)' }}>
              Doanh thu tối thiểu: {new Intl.NumberFormat('vi-VN').format(usedCount * voucher.minOrderValue)}₫
            </span>
          )}
        </div>
      );
    }

    if (isExpired) {
      return (
        <span className="font-medium text-red-500" style={{ color: '#EF4444' }}>
          Đã hết hạn (0 lượt dùng)
        </span>
      );
    }

    return (
      <span className="font-medium text-indigo-500 animate-pulse" style={{ color: 'var(--primary-500)' }}>
        Đang chạy (0 lượt dùng)
      </span>
    );
  };

  return (
    <div className="lcard p-5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
          Lịch sử Chiến dịch đã Thực thi (Executed Campaigns)
        </h3>
        <button
          onClick={onClear}
          className="text-xs transition-colors hover:text-red-500"
          style={{ color: 'var(--text-tertiary)' }}
        >
          Xóa lịch sử
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs text-left">
          <thead>
            <tr style={{ borderBottom: '1px solid var(--border)' }}>
              <th className="pb-2 font-semibold" style={{ color: 'var(--text-tertiary)' }}>Loại chiến dịch</th>
              <th className="pb-2 font-semibold" style={{ color: 'var(--text-tertiary)' }}>Đối tượng tiếp cận</th>
              <th className="pb-2 font-semibold" style={{ color: 'var(--text-tertiary)' }}>Mã Voucher</th>
              <th className="pb-2 font-semibold" style={{ color: 'var(--text-tertiary)' }}>Kênh gửi</th>
              <th className="pb-2 font-semibold" style={{ color: 'var(--text-tertiary)' }}>Thời gian</th>
              <th className="pb-2 font-semibold" style={{ color: 'var(--text-tertiary)' }}>Hiệu quả</th>
              <th className="pb-2 font-semibold" style={{ color: 'var(--text-tertiary)' }}>Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {list.map((item) => (
              <tr key={item.id} style={{ borderBottom: '1px solid var(--border)' }}>
                <td className="py-2.5">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                    style={{
                      background: item.action === 'retain' ? 'rgba(239,68,68,0.1)' : item.action === 'winback' ? 'rgba(99,102,241,0.1)' : 'rgba(16,185,129,0.1)',
                      color: item.action === 'retain' ? '#EF4444' : item.action === 'winback' ? 'var(--primary-600)' : '#10B981',
                    }}
                  >
                    {item.action === 'retain' ? 'Giữ chân' : item.action === 'winback' ? 'Kích hoạt lại' : 'Mua kèm'}
                  </span>
                </td>
                <td className="py-2.5 font-medium" style={{ color: 'var(--text-primary)' }}>{item.target}</td>
                <td className="py-2.5 font-mono text-xs" style={{ color: 'var(--text-secondary)' }}>{item.discount}</td>
                <td className="py-2.5" style={{ color: 'var(--text-secondary)' }}>{item.method}</td>
                <td className="py-2.5 text-caption" style={{ color: 'var(--text-tertiary)' }}>
                  {new Date(item.timestamp).toLocaleString('vi-VN')}
                </td>
                <td className="py-2.5">{renderEffectiveness(item)}</td>
                <td className="py-2.5">
                  <span className="lbadge lbadge-success">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse mr-0.5" />
                    Đã thực thi
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function CampaignPage() {
  const { t } = useTranslation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [showBanner, setShowBanner] = useState(true)
  const [data,   setData]   = useState(null)
  const [loading,setLoading]= useState(true)
  const [isMock, setIsMock] = useState(false)
  const fetchedRef = useRef(false)
  const [executionModal, setExecutionModal] = useState(null)
  const [toastMsg, setToastMsg] = useState(null)
  const [history, setHistory] = useState([])
  const [vouchers, setVouchers] = useState([])
  const [dwSales, setDwSales] = useState([])
  const [oltpOrders, setOltpOrders] = useState([])

  const loadHistory = () => {
    try {
      const list = JSON.parse(localStorage.getItem('executed_campaigns') ?? '[]')
      setHistory(list)
    } catch {
      setHistory([])
    }
  }

  const loadVouchers = async () => {
    try {
      const res = await axios.get('/api/pos/vouchers')
      setVouchers(res.data ?? [])
    } catch (e) {
      console.error('Error fetching vouchers:', e)
    }
  }

  const loadDwSales = async () => {
    try {
      const res = await axios.get('/api/orders?limit=100')
      setDwSales(res.data?.Data ?? res.data?.data ?? [])
    } catch (e) {
      console.error('Error fetching DW sales:', e)
    }
  }

  const loadOltpOrders = async () => {
    try {
      const res = await axios.get('/api/orders/oltp?pageSize=100')
      setOltpOrders(res.data?.data ?? res.data?.items ?? [])
    } catch (e) {
      console.error('Error fetching OLTP orders:', e)
    }
  }

  const clearHistory = () => {
    try {
      localStorage.removeItem('executed_campaigns')
      setHistory([])
    } catch (e) {
      /* ignore */
    }
  }

  useEffect(() => {
    loadHistory()
    loadVouchers()
    loadDwSales()
    loadOltpOrders()
  }, [])

  const load = async () => {
    setLoading(true)
    try {
      const res = await getCampaignPlan({ days_ahead: 60 })
      setData(res)
      setIsMock(res.is_mock ?? false)
    } catch {
      setData(null)
    } finally { setLoading(false) }
  }

  useEffect(() => { if (fetchedRef.current) return; fetchedRef.current = true; load() }, [])

  const maxDow = Math.max(...(data?.seasonal_insight?.weekly_pattern?.map(d => d.avg) ?? [1]))

  const REC_CONFIG = {
    RUN_CAMPAIGN: { textColor: '#22C55E', bg: 'rgba(34,197,94,0.08)',   border: 'rgba(34,197,94,0.25)',   icon: '🚀', label: t('campaign.recShouldRun') },
    PREPARE:      { textColor: 'var(--primary-500)', bg: 'var(--primary-50)', border: 'rgba(99,102,241,0.25)', icon: '📋', label: t('campaign.recPrepare') },
    NORMAL:       { textColor: 'var(--text-tertiary)', bg: 'var(--bg-elevated)', border: 'var(--border)',       icon: '📅', label: t('campaign.recNormal') },
    LOW_SEASON:   { textColor: '#F59E0B', bg: 'rgba(245,158,11,0.08)',  border: 'rgba(245,158,11,0.25)',  icon: '⬇️', label: t('campaign.recLow') },
  }

  return (
    <div className="space-y-5">
      <MockToast show={isMock} />
      <div>
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{t('campaign.title')}</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{t('campaign.subtitle')}</p>
      </div>

      {/* Banner gợi ý từ Basket / RFM / Churn */}
      {showBanner && (
        <ActionSuggestionBanner
          params={searchParams}
          onDismiss={() => { setShowBanner(false); setSearchParams({}); }}
          onExecute={(cfg) => setExecutionModal(cfg)}
        />
      )}

      {!data && !loading && <AiEmptyState title={t('campaign.emptyState')} />}

      {loading ? (
        <div className="lcard p-10 flex items-center justify-center">
          <span className="w-6 h-6 border-2 rounded-full animate-spin"
            style={{ borderColor: 'var(--border)', borderTopColor: 'var(--primary-500)' }} />
        </div>
      ) : (
        <>
          {/* AI Decision Support Banner */}
          {data?.seasonal_insight && (
            <div className="lcard p-5" style={{ background: 'rgba(99,102,241,0.04)', border: '1px solid rgba(99,102,241,0.18)' }}>
              <div className="flex items-center gap-2 mb-3">
                <span className="icon text-primary-500 animate-pulse" style={{ color: 'var(--primary-500)' }}>auto_awesome</span>
                <h2 className="text-sm font-bold text-foreground" style={{ color: 'var(--text-primary)' }}>
                  Trung tâm Tư vấn Quyết định AI (AI Decision Support)
                </h2>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Budget optimization */}
                <div className="flex gap-2.5 items-start">
                  <span className="icon text-lg shrink-0 mt-0.5" style={{ color: '#F59E0B' }}>savings</span>
                  <div>
                    <h4 className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Phân bổ ngân sách Marketing</h4>
                    <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
                      Tập trung 60-70% ngân sách quảng cáo vào mùa cao điểm <strong>{data.seasonal_insight.best_month_name}</strong> để đạt hiệu quả chuyển đổi lớn nhất. Hạn chế chi tiêu quảng cáo vào tháng thấp điểm <strong>{data.seasonal_insight.worst_month_name}</strong>, chuyển sang chạy các chương trình tri ân hoặc chăm sóc khách hàng cũ để tiết kiệm chi phí.
                    </p>
                  </div>
                </div>

                {/* Weekday timing */}
                <div className="flex gap-2.5 items-start">
                  <span className="icon text-lg shrink-0 mt-0.5" style={{ color: '#6366F1' }}>schedule</span>
                  <div>
                    <h4 className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Thời điểm vàng đẩy doanh số</h4>
                    <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
                      Doanh thu ghi nhận tốt nhất vào <strong>{data.seasonal_insight.best_weekday}</strong>. Đề xuất setup trước các chiến dịch quảng cáo tự động, chuẩn bị bài đăng fanpage hoặc Livestream sớm 24-48 giờ để thu hút lượt truy cập trước thời điểm mua sắm bùng nổ.
                    </p>
                  </div>
                </div>

                {/* Upcoming Events */}
                <div className="flex gap-2.5 items-start">
                  <span className="icon text-lg shrink-0 mt-0.5" style={{ color: '#10B981' }}>event_available</span>
                  <div>
                    <h4 className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Kế hoạch sự kiện đặc biệt</h4>
                    <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
                      {data.upcoming_events?.length > 0 ? (
                        <>
                          Sắp diễn ra sự kiện <strong>{data.upcoming_events[0].name}</strong> ({data.upcoming_events[0].date}), còn <strong>{data.upcoming_events[0].days_until} ngày</strong>. Hệ thống đề xuất chuẩn bị tồn kho và thiết lập chiến dịch ad-spend trước ngày <strong>{data.upcoming_events[0].prepare_by?.split('T')[0] || data.upcoming_events[0].prepare_by}</strong> để tối ưu doanh thu.
                        </>
                      ) : (
                        "Không có ngày lễ lớn nào trong 60 ngày tới. Doanh nghiệp nên duy trì quảng cáo đều đặn và tập trung tạo các chương trình mini-game hoặc flash sale chớp nhoáng hàng tuần để kích cầu."
                      )}
                    </p>
                  </div>
                </div>

                {/* Action Suggestions */}
                <div className="flex gap-2.5 items-start">
                  <span className="icon text-lg shrink-0 mt-0.5" style={{ color: '#EC4899' }}>rocket_launch</span>
                  <div>
                    <h4 className="text-xs font-semibold" style={{ color: 'var(--text-secondary)' }}>Gợi ý hành động tối ưu</h4>
                    <p className="text-xs mt-1 leading-relaxed" style={{ color: 'var(--text-tertiary)' }}>
                      Nên kết hợp bán kèm sản phẩm (Bundle) trong các ngày cao điểm. Nếu đang ở mùa thấp điểm, hãy chạy chiến dịch gửi mã giảm giá kích hoạt lại (Win-Back) cho tập khách hàng "At Risk" (có nguy cơ rời bỏ) tại trang phân tích khách hàng để giữ dòng tiền ổn định.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Seasonal insight KPIs */}
          {data?.seasonal_insight && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { label: t('campaign.kpiPeakMonth'), value: `🏆 ${data.seasonal_insight.best_month_name}`,  color: '#22C55E' },
                { label: t('campaign.kpiLowMonth'),  value: `⬇️ ${data.seasonal_insight.worst_month_name}`, color: '#F59E0B' },
                { label: t('campaign.kpiBestDay'),   value: `📅 ${data.seasonal_insight.best_weekday}`,    color: 'var(--primary-500)' },
              ].map(k => (
                <div key={k.label} className="lcard p-4">
                  <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{k.label}</div>
                  <div className="text-lg font-bold mt-1" style={{ color: k.color }}>{k.value}</div>
                </div>
              ))}
            </div>
          )}

          {/* Weekly bar chart */}
          {data?.seasonal_insight?.weekly_pattern && (
            <div className="lcard p-4">
              <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-secondary)' }}>{t('campaign.chartWeekday')}</h3>
              <div className="flex items-end gap-2 h-28">
                {data.seasonal_insight.weekly_pattern.map(d => (
                  <div key={d.day} className="flex-1 flex flex-col items-center gap-1">
                    <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{fmtMoneyExact(d.avg)}</div>
                    <div className="w-full rounded-t transition-all"
                      style={{
                        height: `${Math.round(d.avg/maxDow*80)}px`,
                        background: d.rank === 1 ? '#22C55E' : d.rank <= 2 ? 'var(--primary-500)' : 'var(--text-tertiary)',
                      }} />
                    <div className="text-xs text-center" style={{ color: 'var(--text-tertiary)' }}>{d.day.replace('Thứ ', 'T')}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Monthly windows */}
          <div className="space-y-2">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>{t('campaign.planTitle')}</h3>
            {(data?.windows ?? []).map(w => {
              const cfg = REC_CONFIG[w.recommendation] ?? REC_CONFIG.NORMAL
              return (
                <div key={w.period} className="rounded-xl p-4 flex items-center gap-4"
                  style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}>
                  <span className="text-xl shrink-0">{cfg.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold" style={{ color: cfg.textColor }}>{w.label}</div>
                    {w.events.length > 0 && (
                      <div className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                        {t('campaign.eventLabel')}: {w.events.join(', ')}
                      </div>
                    )}
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-sm font-bold" style={{ color: cfg.textColor }}>
                      {w.vs_overall_pct > 0 ? '+' : ''}{w.vs_overall_pct}% {t('campaign.vsAvg')}
                    </div>
                    <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{fmtMoneyExact(w.avg_revenue)}/{t('campaign.perMonth')}</div>
                  </div>
                  <span className="text-xs font-medium px-2 py-1 rounded-full shrink-0"
                    style={{ color: cfg.textColor, border: `1px solid ${cfg.border}`, background: cfg.bg }}>
                    {cfg.label}
                  </span>
                </div>
              )
            })}
          </div>

          {/* Upcoming events */}
          {data?.upcoming_events?.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold mb-3" style={{ color: 'var(--text-secondary)' }}>
                {t('campaign.upcomingTitle', { count: data.upcoming_events.length })}
              </h3>
              <div className="space-y-2">
                {data.upcoming_events.map(ev => (
                  <div key={ev.name} className="lcard p-4 flex items-center gap-4">
                    <div className="text-center shrink-0" style={{ minWidth: 56 }}>
                      <div className="text-2xl font-bold" style={{ color: 'var(--primary-500)' }}>{ev.days_until}</div>
                      <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{t('campaign.daysLeft')}</div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium" style={{ color: 'var(--text-primary)' }}>{ev.name} – {ev.date}</div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{ev.tip}</div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-bold" style={{ color: '#22C55E' }}>+{Math.round((ev.boost_expected-1)*100)}%</div>
                      <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{t('campaign.expectedLabel')}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Executed Campaigns History */}
          <ExecutedCampaignsHistory list={history} onClear={clearHistory} vouchers={vouchers} dwSales={dwSales} oltpOrders={oltpOrders} />
        </>
      )}

      {executionModal && (
        <ActionExecutionDrawer
          config={executionModal}
          onClose={() => setExecutionModal(null)}
          onSuccess={(msg) => {
            setToastMsg(msg)
            setShowBanner(false)
            setSearchParams({})
            loadHistory()
            loadVouchers()
            loadDwSales()
            loadOltpOrders()
            setTimeout(() => setToastMsg(null), 3000)
          }}
        />
      )}

      {toastMsg && (
        <div className="fixed bottom-5 right-5 z-50 rounded-xl p-4 flex items-center gap-2 text-white shadow-lg animate-fade-in"
             style={{ background: '#10B981', color: '#fff', border: '1px solid rgba(255,255,255,0.1)' }}>
          <span className="icon">check_circle</span>
          <span className="text-sm font-semibold">{toastMsg}</span>
        </div>
      )}
    </div>
  )
}
