import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  Filler, Tooltip, Legend,
} from 'chart.js'
import { Line } from 'react-chartjs-2'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Filler, Tooltip, Legend)

/**
 * Biểu đồ dự báo Prophet.
 * Props:
 *   history  – [{date, value}] – dữ liệu lịch sử
 *   forecast – [{date, forecast, lower, upper}] – dữ liệu dự báo
 */
export default function ForecastChart({ history = [], forecast = [], height = 340 }) {
  const histLabels = history.map(h => h.date)
  const foreLabels = forecast.map(f => f.date)
  const allLabels  = [...histLabels, ...foreLabels]

  const histData  = [...history.map(h => h.value), ...Array(foreLabels.length).fill(null)]
  const foreData  = [...Array(histLabels.length).fill(null), ...forecast.map(f => f.forecast)]
  const upperData = [...Array(histLabels.length).fill(null), ...forecast.map(f => f.upper)]
  const lowerData = [...Array(histLabels.length).fill(null), ...forecast.map(f => f.lower)]

  const datasets = [
    {
      label: 'Thực tế',
      data: histData,
      borderColor: '#c4c0ff',
      borderWidth: 2.5,
      fill: false,
      tension: 0.4,
      pointRadius: 0,
      pointHoverRadius: 5,
    },
    {
      label: 'Dự báo',
      data: foreData,
      borderColor: '#adc6ff',
      borderWidth: 2,
      borderDash: [6, 4],
      fill: false,
      tension: 0.4,
      pointRadius: 0,
      pointHoverRadius: 5,
    },
    {
      label: 'Ngưỡng trên (95% CI)',
      data: upperData,
      borderColor: 'transparent',
      backgroundColor: '#adc6ff18',
      fill: '+1',
      tension: 0.4,
      pointRadius: 0,
    },
    {
      label: 'Ngưỡng dưới',
      data: lowerData,
      borderColor: 'transparent',
      backgroundColor: '#adc6ff18',
      fill: false,
      tension: 0.4,
      pointRadius: 0,
    },
  ]

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: {
        labels: {
          color: '#c7c4d8',
          font: { size: 12 },
          filter: item => !item.text.includes('dưới') && !item.text.includes('trên'),
          usePointStyle: true,
        },
      },
      tooltip: {
        backgroundColor: '#1c2b3c',
        titleColor: '#d4e4fa',
        bodyColor: '#c7c4d8',
        borderColor: '#464555',
        borderWidth: 1,
        padding: 12,
        callbacks: {
          label: ctx => {
            if (ctx.parsed.y === null) return null
            return ` ${ctx.dataset.label}: ₫${ctx.parsed.y?.toLocaleString('vi-VN')}`
          },
        },
      },
    },
    scales: {
      x: {
        grid: { color: '#ffffff06' },
        ticks: { color: '#918fa1', font: { size: 10 }, maxTicksLimit: 12 },
      },
      y: {
        grid: { color: '#ffffff06' },
        ticks: {
          color: '#918fa1',
          font: { size: 11 },
          callback: v => `₫${(v / 1_000_000).toFixed(0)}M`,
        },
      },
    },
  }

  return (
    <div style={{ height }}>
      <Line data={{ labels: allLabels, datasets }} options={options} />
    </div>
  )
}
