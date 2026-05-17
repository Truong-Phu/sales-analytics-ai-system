import { useState, useEffect, useRef } from 'react'
import MockToast from '../../components/ui/MockToast'
import { getGeoDistribution } from '../../api/aiApi'

// Tọa độ 63 tỉnh/thành (subset tiêu biểu cho hiển thị)
const VN_COORDS = {
  'Hà Nội':           [21.0285, 105.8542],
  'TP. Hồ Chí Minh':  [10.7769, 106.7009],
  'Đà Nẵng':          [16.0471, 108.2062],
  'Hải Phòng':        [20.8449, 106.6881],
  'Cần Thơ':          [10.0341, 105.7878],
  'Bình Dương':       [11.1684, 106.6515],
  'Đồng Nai':         [11.0686, 107.1676],
  'Khánh Hòa':        [12.2388, 109.1967],
  'Bà Rịa - Vũng Tàu':[10.5418, 107.2430],
  'An Giang':         [10.3861, 105.4350],
  'Quảng Ninh':       [21.2060, 107.2925],
  'Thái Nguyên':      [21.5942, 105.8412],
  'Lâm Đồng':         [11.5753, 108.1429],
}

// Màu sắc theo intensity
function getColor(intensity) {
  if (intensity >= 0.8) return '#EF4444'
  if (intensity >= 0.6) return '#F97316'
  if (intensity >= 0.4) return '#F59E0B'
  if (intensity >= 0.2) return '#22C55E'
  return '#3B82F6'
}

export default function GeoPage() {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [isMock,  setIsMock]  = useState(false)
  const [metric,  setMetric]  = useState('customers')
  const [days,    setDays]    = useState(30)
  const [selected,setSelected]= useState(null)
  const mapRef = useRef(null)
  const leafletRef = useRef(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await getGeoDistribution({ days, metric })
      setData(res)
      setIsMock(res.is_mock ?? false)
    } catch {
      setData({
        total_customers: 11260, total_provinces: 8,
        top_province: 'TP. Hồ Chí Minh', analysis_days: 30, is_mock: true,
        points: [
          { province:'TP. Hồ Chí Minh',  lat:10.7769, lng:106.7009, customer_count:4500, revenue:285000000, orders:1820, intensity:1.0 },
          { province:'Hà Nội',            lat:21.0285, lng:105.8542, customer_count:3200, revenue:198000000, orders:1340, intensity:0.71 },
          { province:'Đà Nẵng',           lat:16.0471, lng:108.2062, customer_count:890,  revenue:52000000,  orders:423,  intensity:0.20 },
          { province:'Bình Dương',        lat:11.1684, lng:106.6515, customer_count:780,  revenue:41000000,  orders:310,  intensity:0.17 },
          { province:'Đồng Nai',          lat:11.0686, lng:107.1676, customer_count:640,  revenue:33000000,  orders:265,  intensity:0.14 },
          { province:'Hải Phòng',         lat:20.8449, lng:106.6881, customer_count:520,  revenue:28000000,  orders:198,  intensity:0.12 },
          { province:'Cần Thơ',           lat:10.0341, lng:105.7878, customer_count:410,  revenue:22000000,  orders:168,  intensity:0.09 },
          { province:'Khánh Hòa',         lat:12.2388, lng:109.1967, customer_count:320,  revenue:17000000,  orders:124,  intensity:0.07 },
        ],
      })
      setIsMock(true)
    } finally { setLoading(false) }
  }

  useEffect(() => { load() }, [days, metric])

  // Khởi tạo Leaflet map khi data load xong
  useEffect(() => {
    if (!data || loading) return

    // Load Leaflet từ CDN nếu chưa có
    const initMap = () => {
      if (!window.L) return

      const L = window.L
      if (leafletRef.current) {
        leafletRef.current.remove()
        leafletRef.current = null
      }

      if (!mapRef.current) return

      const map = L.map(mapRef.current, {
        center: [16.0, 106.0],
        zoom: 6,
        zoomControl: true,
      })

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors',
        opacity: 0.7,
      }).addTo(map)

      data.points.forEach(point => {
        const radius = 10 + point.intensity * 40
        const color  = getColor(point.intensity)

        const metricValue = metric === 'customers' ? point.customer_count
          : metric === 'revenue' ? (point.revenue / 1e6).toFixed(1) + 'M'
          : point.orders

        const circle = L.circleMarker([point.lat, point.lng], {
          radius,
          fillColor: color,
          color:     color,
          weight:    1,
          opacity:   0.9,
          fillOpacity: 0.6,
        }).addTo(map)

        circle.bindPopup(`
          <div style="min-width:160px;font-family:sans-serif">
            <strong style="font-size:14px">${point.province}</strong><br>
            <span style="color:#6B7280;font-size:12px">Khách hàng: <strong style="color:#1F2937">${point.customer_count.toLocaleString()}</strong></span><br>
            <span style="color:#6B7280;font-size:12px">Doanh thu: <strong style="color:#1F2937">${(point.revenue/1e6).toFixed(1)}M VNĐ</strong></span><br>
            <span style="color:#6B7280;font-size:12px">Đơn hàng: <strong style="color:#1F2937">${point.orders.toLocaleString()}</strong></span>
          </div>
        `)

        circle.on('click', () => setSelected(point))
      })

      leafletRef.current = map
    }

    // Nếu Leaflet chưa load → inject CSS + JS
    if (!window.L) {
      if (!document.getElementById('leaflet-css')) {
        const link = document.createElement('link')
        link.id   = 'leaflet-css'
        link.rel  = 'stylesheet'
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
        document.head.appendChild(link)
      }
      if (!document.getElementById('leaflet-js')) {
        const script = document.createElement('script')
        script.id   = 'leaflet-js'
        script.src  = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
        script.onload = initMap
        document.head.appendChild(script)
        return
      }
    }
    initMap()
  }, [data, loading, metric])

  const metricLabel = { customers: 'Khách hàng', revenue: 'Doanh thu', orders: 'Đơn hàng' }
  const fmt = v => v >= 1e9 ? `${(v/1e9).toFixed(1)}B` : v >= 1e6 ? `${(v/1e6).toFixed(1)}M` : v.toLocaleString()

  return (
    <div className="p-6 space-y-6">
      {isMock && <MockToast />}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Bản đồ Nhiệt Khách hàng</h1>
          <p className="text-sm text-gray-400 mt-1">Phân bổ khách hàng và doanh thu theo 63 tỉnh/thành Việt Nam</p>
        </div>
        <div className="flex gap-2">
          <select value={metric} onChange={e => setMetric(e.target.value)}
            className="bg-gray-700 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm">
            <option value="customers">Khách hàng</option>
            <option value="revenue">Doanh thu</option>
            <option value="orders">Đơn hàng</option>
          </select>
          <select value={days} onChange={e => setDays(+e.target.value)}
            className="bg-gray-700 border border-gray-600 text-white rounded-lg px-3 py-2 text-sm">
            {[7,14,30,90,365].map(d => <option key={d} value={d}>{d} ngày</option>)}
          </select>
        </div>
      </div>

      {/* Summary cards */}
      {data && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label: 'Tổng khách hàng', value: data.total_customers.toLocaleString(), color: 'text-blue-400' },
            { label: 'Số tỉnh/thành',   value: data.total_provinces, color: 'text-green-400' },
            { label: 'Tỉnh dẫn đầu',    value: data.top_province,   color: 'text-yellow-400' },
            { label: 'Kỳ phân tích',     value: `${data.analysis_days} ngày`, color: 'text-gray-300' },
          ].map(k => (
            <div key={k.label} className="bg-gray-800 rounded-xl p-4 border border-gray-700">
              <div className="text-xs text-gray-400">{k.label}</div>
              <div className={`text-lg font-bold mt-1 truncate ${k.color}`}>{k.value}</div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Map */}
        <div className="lg:col-span-2 bg-gray-800 rounded-xl border border-gray-700 overflow-hidden">
          <div className="p-3 border-b border-gray-700 text-sm font-medium text-gray-300">
            🗺️ Bản đồ phân bổ – {metricLabel[metric]}
          </div>
          {loading ? (
            <div className="h-80 flex items-center justify-center text-gray-400">Đang tải...</div>
          ) : (
            <div ref={mapRef} style={{ height: '420px', background: '#1a1f2e' }} />
          )}
          {/* Legend */}
          <div className="p-3 flex items-center gap-3 text-xs text-gray-400 border-t border-gray-700">
            <span>Thấp</span>
            {['#3B82F6','#22C55E','#F59E0B','#F97316','#EF4444'].map(c => (
              <div key={c} className="w-4 h-3 rounded-sm" style={{ background: c }} />
            ))}
            <span>Cao</span>
          </div>
        </div>

        {/* Right panel: ranking */}
        <div className="bg-gray-800 rounded-xl border border-gray-700 flex flex-col">
          <div className="p-3 border-b border-gray-700 text-sm font-medium text-gray-300">
            🏆 Top tỉnh/thành
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-gray-700/50">
            {(data?.points ?? [])
              .sort((a, b) => b.intensity - a.intensity)
              .map((pt, i) => (
                <div key={pt.province}
                  onClick={() => setSelected(pt)}
                  className={`p-3 cursor-pointer hover:bg-gray-700/40 transition-colors
                    ${selected?.province === pt.province ? 'bg-blue-900/20 border-l-2 border-blue-500' : ''}`}>
                  <div className="flex items-center gap-2">
                    <span className="text-gray-500 text-xs w-5">#{i+1}</span>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-white">{pt.province}</div>
                      <div className="text-xs text-gray-400">
                        {pt.customer_count.toLocaleString()} KH · {fmt(pt.revenue)} VNĐ
                      </div>
                    </div>
                    <div className="w-16 h-1.5 rounded-full bg-gray-700">
                      <div className="h-full rounded-full" style={{ width: `${pt.intensity*100}%`, background: getColor(pt.intensity) }} />
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </div>
      </div>

      {/* Selected detail */}
      {selected && (
        <div className="bg-blue-900/20 border border-blue-500/30 rounded-xl p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold text-white text-lg">{selected.province}</h3>
            <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-white text-lg">×</button>
          </div>
          <div className="grid grid-cols-3 gap-4 mt-3">
            {[
              { label: 'Khách hàng', value: selected.customer_count.toLocaleString(), color: 'text-blue-400' },
              { label: 'Doanh thu',  value: `${(selected.revenue/1e6).toFixed(1)}M VNĐ`, color: 'text-green-400' },
              { label: 'Đơn hàng',  value: selected.orders.toLocaleString(), color: 'text-yellow-400' },
            ].map(k => (
              <div key={k.label}>
                <div className="text-xs text-gray-400">{k.label}</div>
                <div className={`font-bold ${k.color}`}>{k.value}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
